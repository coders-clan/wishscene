import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const expected = `${request.nextUrl.protocol}//${request.headers.get('host') ?? request.nextUrl.host}`;
  if ((origin && origin !== expected) || request.headers.get('sec-fetch-site') === 'cross-site')
    return NextResponse.json(
      { error: { code: 'ORIGIN', message: 'Cross-origin requests are disabled.' } },
      { status: 403 },
    );
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
