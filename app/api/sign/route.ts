import path from 'path';
import { NextResponse } from 'next/server';
import {
  buildSignedFileName,
  dataUrlToBuffer,
  getManifestPath,
  getTrustBundlePath,
  normaliseSpawnError,
  readFileAsDataUrl,
  runC2pa,
  withTempFile,
  writeTempInput,
} from '@/lib/c2pa';
import { promises as fs } from 'fs';

export const runtime = 'nodejs';

interface SignRequestBody {
  imageName?: string;
  imageData?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SignRequestBody;
    const buffer = dataUrlToBuffer(body.imageData);
    if (!buffer) {
      return NextResponse.json({ ok: false, error: 'Invalid image data' }, { status: 400 });
    }

    const manifestPath = await getManifestPath();
    const trustBundlePath = await getTrustBundlePath();

    const originalName = body.imageName?.trim();
    const defaultName = originalName && originalName.length > 0 ? originalName : 'image.jpg';
    const signedFileName = buildSignedFileName(defaultName);
    const extension = path.extname(defaultName).replace('.', '') || 'jpg';

    const inputPath = await writeTempInput(buffer, defaultName);
    try {
      return await withTempFile(extension, async (outputPath) => {
        const args = [
          inputPath,
          '-m',
          manifestPath,
          '-o',
          outputPath,
          '-f',
          'trust',
          '--trust_anchors',
          trustBundlePath,
        ];
        const result = await runC2pa(args);
        if (result.code !== 0) {
          const message = result.stderr || result.stdout || 'Signing failed';
          return NextResponse.json(
            { ok: false, error: message, stdout: result.stdout, stderr: result.stderr },
            { status: 500 },
          );
        }
        const dataUrl = await readFileAsDataUrl(outputPath, signedFileName);
        return NextResponse.json({
          ok: true,
          fileName: signedFileName,
          dataUrl,
          stdout: result.stdout,
          stderr: result.stderr,
        });
      }, 'signed');
    } finally {
      try {
        await fs.unlink(inputPath);
      } catch {
        // ignore
      }
    }
  } catch (error) {
    const message = normaliseSpawnError(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
