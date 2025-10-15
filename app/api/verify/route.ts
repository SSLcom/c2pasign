import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';
import { dataUrlToBuffer, getTrustBundlePath, runC2pa, writeTempInput } from '@/lib/c2pa';

export const runtime = 'nodejs';

interface VerifyRequestBody {
  imageName?: string;
  imageData?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VerifyRequestBody;
    const buffer = dataUrlToBuffer(body.imageData);
    if (!buffer) {
      return NextResponse.json({ ok: false, error: 'Invalid image data' }, { status: 400 });
    }
    const trustBundlePath = await getTrustBundlePath();
    const inputPath = await writeTempInput(buffer, body.imageName);
    try {
      const args = [inputPath, 'trust', '--trust_anchors', trustBundlePath];
      const result = await runC2pa(args);
      return NextResponse.json({
        ok: result.code === 0,
        output: result.stdout.trim(),
        error: result.stderr.trim(),
      });
    } finally {
      try {
        await fs.unlink(inputPath);
      } catch {
        // ignore cleanup errors
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
