import { NextRequest, NextResponse } from 'next/server';
import { authMode, readSession } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const mode = authMode();
  const user = mode.mode === 'required' ? readSession(request) : null;
  return NextResponse.json(
    { authRequired: mode.mode !== 'open', user },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
