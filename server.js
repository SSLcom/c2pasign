// Minimal Node HTTP server for signing and verifying images via c2patool in Docker
// No external dependencies; uses JSON payloads with base64 image data.

const http = require('http');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const PORT = process.env.PORT || 8080;
const DOCKER_IMAGE = process.env.C2PA_DOCKER_IMAGE || 'c2pa-demo';
const TRUST_BUNDLE = process.env.TRUST_BUNDLE_PATH || 'C2PA-TRUST-BUNDLE.pem';
const MANIFEST = process.env.MANIFEST_PATH || 'manifest.json';
const WORKDIR = process.cwd();
const UPLOAD_DIR = path.join(WORKDIR, 'uploads');
const MODE = (process.env.C2PA_MODE || '').toLowerCase();

function ensureUploadsDir() {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch {}
}

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
  });
  res.end(data);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function ensureDockerImage() {
  const inspect = spawnSync('docker', ['image', 'inspect', DOCKER_IMAGE], { encoding: 'utf8' });
  if (inspect.status === 0) return;
  console.log(`Building ${DOCKER_IMAGE} Docker image...`);
  const build = spawnSync('docker', ['build', '-t', DOCKER_IMAGE, '.'], { stdio: 'inherit' });
  if (build.status !== 0) {
    throw new Error('Failed to build Docker image');
  }
}

function randName(prefix, ext) {
  const id = crypto.randomBytes(6).toString('hex');
  return `${prefix}_${id}${ext ? '.' + ext.replace(/^\./, '') : ''}`;
}

function dataUrlToBuffer(dataUrl) {
  // Accept either data URL or raw base64 string
  if (typeof dataUrl !== 'string') return null;
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  const b64 = m ? m[2] : dataUrl;
  try {
    return Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
}

function runC2paSign(inputPath, outputPath, manifestPath) {
  // Mirrors c2pa_sign_tamper_verify.sh signing invocation
  const inRel = path.relative(WORKDIR, inputPath);
  const outRel = path.relative(WORKDIR, outputPath);
  const manifestRel = path.relative(WORKDIR, manifestPath || MANIFEST);
  const cmd = [
    'run', '--rm', '-v', `${WORKDIR}:/app`, '-w', '/app', DOCKER_IMAGE,
    'sh', '-c',
    `c2patool "${inRel}" -m "${manifestRel}" -o "${outRel}" -f trust --trust_anchors "${TRUST_BUNDLE}"`
  ];
  const child = spawnSync('docker', cmd, { encoding: 'utf8' });
  return child;
}

function runC2paVerify(inputPath) {
  const inRel = path.relative(WORKDIR, inputPath);
  const cmd = [
    'run', '--rm', '-v', `${WORKDIR}:/app`, '-w', '/app', DOCKER_IMAGE,
    'sh', '-c', `c2patool "${inRel}" trust --trust_anchors "${TRUST_BUNDLE}"`
  ];
  const child = spawnSync('docker', cmd, { encoding: 'utf8' });
  return child;
}

function serveStatic(req, res) {
  const distDir = path.join(WORKDIR, 'client', 'dist');
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = path.join(distDir, decodeURIComponent(url.pathname));
  if (url.pathname === '/' || !path.extname(filePath)) {
    filePath = path.join(distDir, 'index.html');
  }
  if (!filePath.startsWith(distDir)) {
    res.writeHead(403); res.end('Forbidden'); return true;
  }
  if (!fs.existsSync(filePath)) return false;
  const ext = path.extname(filePath).toLowerCase();
  const mimes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mimes[ext] || 'application/octet-stream' });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

function hasLocalC2pa() {
  const probe = spawnSync('c2patool', ['--help'], { encoding: 'utf8' });
  return probe.status === 0;
}

function execSign(inputPath, outputPath, manifestPath) {
  if (MODE === 'local' || hasLocalC2pa()) {
    return spawnSync('c2patool', [
      inputPath,
      '-m', manifestPath || MANIFEST,
      '-o', outputPath,
      '-f', 'trust', '--trust_anchors', TRUST_BUNDLE
    ], { encoding: 'utf8' });
  }
  return runC2paSign(inputPath, outputPath, manifestPath);
}

function execVerify(inputPath) {
  if (MODE === 'local' || hasLocalC2pa()) {
    return spawnSync('c2patool', [
      inputPath,
      'trust', '--trust_anchors', TRUST_BUNDLE
    ], { encoding: 'utf8' });
  }
  return runC2paVerify(inputPath);
}

function ensureManifestPayload(manifest, timestampUrl) {
  let base = {};
  try {
    const fileText = fs.readFileSync(MANIFEST, 'utf8');
    base = JSON.parse(fileText);
  } catch {}
  const merged = {
    ...base,
    ...(manifest && typeof manifest === 'object' ? manifest : {}),
  };
  if (timestampUrl) {
    merged.ta_url = timestampUrl;
  } else if (!merged.ta_url) {
    delete merged.ta_url;
  }
  merged.private_key = merged.private_key || base.private_key || 'mykey.key';
  merged.sign_cert = merged.sign_cert || base.sign_cert || 'mycert.pem';
  merged.sign_cert_chain = merged.sign_cert_chain || base.sign_cert_chain || ['C2PA-TRUST-BUNDLE.pem'];
  merged.alg = merged.alg || base.alg || 'ps256';
  return merged;
}

function extractJsonFromOutput(text) {
  if (!text || typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function proxyTsa(req, res) {
  try {
    const rawBody = await collectBody(req);
    const pathSuffix = req.url.replace(/^\/api\/tsa\//, '').replace(/\.{2,}/g, '');
    const targetUrl = `https://api.staging.c2pa.ssl.com/v1/timestamp/${pathSuffix || 'rsa'}`;
    const urlObj = new URL(targetUrl);
    const options = {
      method: req.method || 'POST',
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
      },
    };

    const proxyReq = https.request(options, (proxyRes) => {
      const chunks = [];
      proxyRes.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      proxyRes.on('end', () => {
        const body = Buffer.concat(chunks);
        res.writeHead(proxyRes.statusCode || 502, {
          'Content-Type': proxyRes.headers['content-type'] || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(body);
      });
    });
    proxyReq.on('error', (err) => {
      json(res, 502, { ok: false, error: `TSA proxy error: ${err.message}` });
    });
    if (rawBody?.length) {
      proxyReq.write(rawBody);
    }
    proxyReq.end();
  } catch (err) {
    json(res, 500, { ok: false, error: err.message || String(err) });
  }
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
    });
    return res.end();
  }

  if (req.method === 'GET' && (req.url === '/api/health' || req.url === '/health')) {
    // Health check endpoint
    return json(res, 200, { ok: true, message: 'c2pa demo server' });
  }

  if (req.method === 'POST' && req.url.startsWith('/api/tsa/')) {
    return proxyTsa(req, res);
  }

  if (req.method === 'POST' && req.url === '/api/sign') {
    try {
      ensureUploadsDir();
      if (!(MODE === 'local' || hasLocalC2pa())) ensureDockerImage();
      const body = await parseBody(req);
      const { imageName, imageData, manifest: manifestOverride, timestampUrl } = body || {};
      const buf = dataUrlToBuffer(imageData);
      if (!buf) return json(res, 400, { ok: false, error: 'Invalid image data' });
      const ext = (imageName && path.extname(imageName)) || 'jpg';
      const inputName = randName('in', typeof ext === 'string' ? ext.replace(/^\./, '') : 'jpg');
      const outputName = randName('signed', typeof ext === 'string' ? ext.replace(/^\./, '') : 'jpg');
      const inPath = path.join(UPLOAD_DIR, inputName);
      const outPath = path.join(WORKDIR, outputName); // output in root so Docker can write
      fs.writeFileSync(inPath, buf);
      const manifestPayload = ensureManifestPayload(manifestOverride, timestampUrl);
      const manifestTemp = path.join(UPLOAD_DIR, randName('manifest', 'json'));
      fs.writeFileSync(manifestTemp, JSON.stringify(manifestPayload, null, 2));
      const result = execSign(inPath, outPath, manifestTemp);
      if (result.status !== 0) {
        try { fs.unlinkSync(manifestTemp); } catch {}
        return json(res, 500, { ok: false, error: result.stderr || result.stdout || 'Signing failed' });
      }
      const signedBuf = fs.readFileSync(outPath);
      // Clean up input, keep output for debugging
      try { fs.unlinkSync(inPath); } catch {}
      try { fs.unlinkSync(manifestTemp); } catch {}
      const b64 = signedBuf.toString('base64');
      const mime = 'image/' + ((ext || '').toLowerCase().includes('png') ? 'png' : 'jpeg');
      return json(res, 200, {
        ok: true,
        fileName: outputName,
        dataUrl: `data:${mime};base64,${b64}`,
        manifest: manifestPayload,
      });
    } catch (e) {
      return json(res, 500, { ok: false, error: String(e.message || e) });
    }
  }

  if (req.method === 'POST' && req.url === '/api/verify') {
    try {
      ensureUploadsDir();
      if (!(MODE === 'local' || hasLocalC2pa())) ensureDockerImage();
      const body = await parseBody(req);
      const { imageName, imageData } = body || {};
      const buf = dataUrlToBuffer(imageData);
      if (!buf) return json(res, 400, { ok: false, error: 'Invalid image data' });
      const ext = (imageName && path.extname(imageName)) || 'jpg';
      const inputName = randName('verify', typeof ext === 'string' ? ext.replace(/^\./, '') : 'jpg');
      const inPath = path.join(UPLOAD_DIR, inputName);
      fs.writeFileSync(inPath, buf);
      const result = execVerify(inPath);
      // Clean up input file
      try { fs.unlinkSync(inPath); } catch {}
      const ok = result.status === 0;
      const output = (result.stdout || '').trim();
      const error = (result.stderr || '').trim();
      const report = extractJsonFromOutput(output) || extractJsonFromOutput(error);
      return json(res, 200, { ok, output, error, report });
    } catch (e) {
      return json(res, 500, { ok: false, error: String(e.message || e) });
    }
  }

  // Try to serve static client build if present (including '/')
  if (req.method === 'GET') {
    const served = serveStatic(req, res);
    if (served) return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`c2pa demo server listening on http://localhost:${PORT}`);
});
