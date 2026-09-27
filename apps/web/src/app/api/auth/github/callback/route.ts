import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authMode, safeNext, setSessionCookie, unseal, OAUTH_COOKIE } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const oauthPayload = z.object({
  v: z.literal(1),
  kind: z.literal('oauth'),
  state: z.string(),
  verifier: z.string(),
  next: z.string(),
  exp: z.number(),
});

const githubUser = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1).max(39),
  name: z
    .string()
    .nullable()
    .transform((value) => (value?.trim() ? value.trim().slice(0, 100) : null)),
  avatar_url: z.string().url(),
});

function clearOauthCookie(response: NextResponse) {
  response.cookies.set(OAUTH_COOKIE, '', { path: '/api/auth/github', maxAge: 0 });
}

function fail(request: NextRequest, code: string) {
  const response = NextResponse.redirect(new URL(`/login?error=${code}`, request.nextUrl.origin));
  clearOauthCookie(response);
  return response;
}

export async function GET(request: NextRequest) {
  const mode = authMode();
  if (mode.mode === 'open') {
    const response = NextResponse.redirect(new URL('/', request.nextUrl.origin));
    clearOauthCookie(response);
    return response;
  }
  if (mode.mode === 'misconfigured')
    return NextResponse.json(
      { error: { code: 'AUTH_CONFIG', message: 'Sign-in is not configured.' } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  const params = request.nextUrl.searchParams;
  if (params.get('error')) return fail(request, 'denied');
  const cookieToken = request.cookies.get(OAUTH_COOKIE)?.value;
  const parsed = cookieToken ? oauthPayload.safeParse(unseal(cookieToken, mode.secret)) : null;
  if (!parsed?.success || parsed.data.exp <= Date.now()) return fail(request, 'state');
  const stateParam = Buffer.from(params.get('state') || '');
  const expectedState = Buffer.from(parsed.data.state);
  if (stateParam.length !== expectedState.length || !timingSafeEqual(stateParam, expectedState))
    return fail(request, 'state');
  const code = params.get('code');
  if (!code) return fail(request, 'state');
  try {
    const redirectUri = `${request.nextUrl.origin}/api/auth/github/callback`;
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: mode.clientId,
        client_secret: mode.clientSecret,
        code,
        redirect_uri: redirectUri,
        code_verifier: parsed.data.verifier,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const tokenData = await tokenResponse.json().catch(() => null);
    const accessToken = tokenData?.access_token;
    if (typeof accessToken !== 'string' || !accessToken) return fail(request, 'github');
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'wishscene',
      },
      signal: AbortSignal.timeout(10000),
    });
    const parsedUser = githubUser.safeParse(await userResponse.json().catch(() => null));
    if (!parsedUser.success) return fail(request, 'github');
    const user = {
      id: parsedUser.data.id,
      login: parsedUser.data.login,
      name: parsedUser.data.name,
      avatarUrl: parsedUser.data.avatar_url,
    };
    const response = NextResponse.redirect(
      new URL(safeNext(parsed.data.next), request.nextUrl.origin),
    );
    setSessionCookie(response, request, user, mode.secret);
    clearOauthCookie(response);
    return response;
  } catch (error) {
    console.error('GitHub sign-in failed', error instanceof Error ? error.name : 'UnknownError');
    return fail(request, 'github');
  }
}
