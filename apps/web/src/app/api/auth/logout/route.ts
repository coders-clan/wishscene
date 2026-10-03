import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth/session';
import { isSameOriginWrite, noStore } from '@/lib/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!isSameOriginWrite(request))
    return NextResponse.json(
      { error: { code: 'ORIGIN' } },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  const response = noStore(NextResponse.json({ ok: true }));
  clearSessionCookie(response);
  return response;
}
