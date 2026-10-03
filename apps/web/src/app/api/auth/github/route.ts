import { randomBytes, createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { authMode, safeNext, seal, OAUTH_COOKIE } from '@/lib/auth/session';
import { appOrigin, noStore } from '@/lib/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorizeUrl(clientId: string, origin: string, state: string, challenge: string) {
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', `${origin}/api/auth/github/callback`);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('allow_signup', 'true');
  return url;
}

export async function GET(request: NextRequest) {
  const mode = authMode();
  const next = safeNext(request.nextUrl.searchParams.get('next'));
  const origin = appOrigin(request);
  if (mode.mode === 'open') return noStore(NextResponse.redirect(new URL(next, origin)));
  if (mode.mode === 'misconfigured')
    return NextResponse.json(
      { error: { code: 'AUTH_CONFIG' } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const now = Date.now();
  const response = noStore(
    NextResponse.redirect(authorizeUrl(mode.clientId, origin, state, challenge)),
  );
  response.cookies.set(
    OAUTH_COOKIE,
    seal({ v: 1, kind: 'oauth', state, verifier, next, iat: now, exp: now + 600000 }, mode.secret),
    {
      httpOnly: true,
      secure: request.nextUrl.protocol === 'https:' || !!process.env.VERCEL || !!process.env.RENDER,
      sameSite: 'lax',
      path: '/api/auth/github',
      maxAge: 600,
      priority: 'high',
    },
  );
  return response;
}
