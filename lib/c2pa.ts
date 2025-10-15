import crypto from 'crypto';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

function getToolPath() {
  return process.env.C2PA_TOOL_PATH || 'c2patool';
}

function randomFileName(prefix: string, extension: string) {
  const id = crypto.randomBytes(6).toString('hex');
  return `${prefix}-${id}.${extension.replace(/^\./, '')}`;
}

function describeSources(sources: Array<string | undefined>) {
  return sources.filter(Boolean).join(' or ');
}

async function resolveFileFromEnv(options: {
  pathEnv?: string;
  rawEnv?: string;
  base64Env?: string;
  fallbackRelative?: string;
  extension: string;
  resourceLabel: string;
}) {
  const { pathEnv, rawEnv, base64Env, fallbackRelative, extension, resourceLabel } = options;
  const cacheKey = `__cached_${pathEnv || rawEnv || base64Env || fallbackRelative}`;
  const globalAny = globalThis as Record<string, string | undefined>;
  if (cacheKey && globalAny[cacheKey]) {
    return globalAny[cacheKey] as string;
  }

  const pathValue = pathEnv ? process.env[pathEnv] : undefined;
  if (pathValue) {
    globalAny[cacheKey] = pathValue;
    return pathValue;
  }

  const rawValue = rawEnv ? process.env[rawEnv] : undefined;
  if (rawValue) {
    const filePath = path.join(tmpdir(), randomFileName(rawEnv.toLowerCase(), extension));
    await fs.writeFile(filePath, rawValue, 'utf8');
    globalAny[cacheKey] = filePath;
    return filePath;
  }

  const base64Value = base64Env ? process.env[base64Env] : undefined;
  if (base64Value) {
    const filePath = path.join(tmpdir(), randomFileName(base64Env.toLowerCase(), extension));
    await fs.writeFile(filePath, Buffer.from(base64Value, 'base64'));
    globalAny[cacheKey] = filePath;
    return filePath;
  }

  if (fallbackRelative) {
    const filePath = path.resolve(process.cwd(), fallbackRelative);
    try {
      await fs.access(filePath);
      globalAny[cacheKey] = filePath;
      return filePath;
    } catch {
      // ignore
    }
  }

  const sources = describeSources([
    pathEnv && `${pathEnv} (path)`,
    rawEnv && `${rawEnv} (inline)`,
    base64Env && `${base64Env} (base64)`,
    fallbackRelative && `${fallbackRelative} on disk`,
  ]);
  throw new Error(`Unable to resolve ${resourceLabel}. Provide ${sources}.`);
}

export async function getManifestPath() {
  return resolveFileFromEnv({
    pathEnv: 'C2PA_MANIFEST_PATH',
    rawEnv: 'C2PA_MANIFEST_JSON',
    base64Env: 'C2PA_MANIFEST_BASE64',
    fallbackRelative: 'manifest.json',
    extension: 'json',
    resourceLabel: 'C2PA manifest',
  });
}

export async function getTrustBundlePath() {
  return resolveFileFromEnv({
    pathEnv: 'C2PA_TRUST_BUNDLE_PATH',
    rawEnv: 'C2PA_TRUST_BUNDLE_PEM',
    base64Env: 'C2PA_TRUST_BUNDLE_BASE64',
    fallbackRelative: 'C2PA-TRUST-BUNDLE.pem',
    extension: 'pem',
    resourceLabel: 'trust bundle',
  });
}

export function dataUrlToBuffer(value: string | undefined | null) {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^data:([^;]+);base64,(.*)$/);
  const base64 = match ? match[2] : trimmed;
  try {
    return Buffer.from(base64, 'base64');
  } catch {
    return null;
  }
}

export async function runC2pa(args: string[]) {
  const tool = getToolPath();
  return new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
    const child = spawn(tool, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

export async function withTempFile<T>(
  extension: string,
  fn: (filePath: string) => Promise<T>,
  prefix = 'c2pa-tmp',
) {
  const filePath = path.join(tmpdir(), randomFileName(prefix, extension));
  try {
    return await fn(filePath);
  } finally {
    try {
      await fs.unlink(filePath);
    } catch {
      // ignore cleanup errors
    }
  }
}

export async function writeTempInput(data: Buffer, originalName: string | undefined) {
  const extension = originalName?.split('.').pop() ?? 'jpg';
  const filePath = path.join(tmpdir(), randomFileName('input', extension));
  await fs.writeFile(filePath, data);
  return filePath;
}

export async function readFileAsDataUrl(filePath: string, fallbackName: string) {
  const buffer = await fs.readFile(filePath);
  const ext = path.extname(fallbackName).toLowerCase();
  const mime = ext.includes('png') ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

export function normaliseSpawnError(error: unknown) {
  const err = error as NodeJS.ErrnoException | undefined;
  if (err?.code === 'ENOENT') {
    return 'c2patool not found. Install the binary or set C2PA_TOOL_PATH.';
  }
  return error instanceof Error ? error.message : 'Unexpected error';
}

export function buildSignedFileName(originalName: string | undefined) {
  const fallback = 'image';
  const ext = path.extname(originalName ?? '');
  const extension = ext ? ext.replace('.', '').toLowerCase() : 'jpg';
  const base = ext && originalName ? originalName.slice(0, -ext.length) : originalName ?? fallback;
  const safeBase = base
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .trim();
  const finalBase = safeBase || fallback;
  return `signed-${finalBase}.${extension}`;
}
