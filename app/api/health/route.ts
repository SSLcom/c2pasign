import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export function GET() {
  return NextResponse.json({ ok: true, message: 'c2pa demo server' });
}

export function HEAD() {
  return new Response(null, { status: 204 });
}
