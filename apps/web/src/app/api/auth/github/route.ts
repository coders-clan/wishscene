import { randomBytes, createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { authMode, safeNext, seal, OAUTH_COOKIE } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorizeUrl(clientId: string, request: NextRequest, state: string, challenge: string) {
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', `${request.nextUrl.origin}/api/auth/github/callback`);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('allow_signup', 'true');
  return url;
}

export async function GET(request: NextRequest) {
  const mode = authMode();
  const next = safeNext(request.nextUrl.searchParams.get('next'));
  if (mode.mode === 'open') return NextResponse.redirect(new URL(next, request.nextUrl.origin));
  if (mode.mode === 'misconfigured')
    return NextResponse.json(
      { error: { code: 'AUTH_CONFIG', message: 'Sign-in is not configured.' } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const response = NextResponse.redirect(authorizeUrl(mode.clientId, request, state, challenge));
  response.cookies.set(
    OAUTH_COOKIE,
    seal({ v: 1, kind: 'oauth', state, verifier, next, exp: Date.now() + 600000 }, mode.secret),
    {
      httpOnly: true,
      secure: request.nextUrl.protocol === 'https:',
      sameSite: 'lax',
      path: '/api/auth/github',
      maxAge: 600,
    },
  );
  return response;
}
