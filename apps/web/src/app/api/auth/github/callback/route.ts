import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authMode, safeNext, setSessionCookie, unseal, OAUTH_COOKIE } from '@/lib/auth/session';
import { appOrigin, noStore } from '@/lib/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const oauthPayload = z.object({
  v: z.literal(1),
  kind: z.literal('oauth'),
  state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  next: z.string(),
  iat: z.number().int(),
  exp: z.number().int(),
});

const githubUser = z.object({
  id: z.number().int().positive(),
  login: z
    .string()
    .min(1)
    .max(39)
    .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/),
  name: z
    .string()
    .nullable()
    .transform((value) => (value?.trim() ? value.trim().slice(0, 100) : null)),
  avatar_url: z
    .string()
    .url()
    .refine((value) => new URL(value).protocol === 'https:'),
});

function clearOauthCookie(response: NextResponse) {
  response.cookies.set(OAUTH_COOKIE, '', { path: '/api/auth/github', maxAge: 0 });
}

function fail(request: NextRequest, code: string) {
  const response = noStore(
    NextResponse.redirect(new URL(`/login?error=${code}`, appOrigin(request))),
  );
  clearOauthCookie(response);
  return response;
}

export async function GET(request: NextRequest) {
  const mode = authMode();
  if (mode.mode === 'open') {
    const response = noStore(NextResponse.redirect(new URL('/', appOrigin(request))));
    clearOauthCookie(response);
    return response;
  }
  if (mode.mode === 'misconfigured')
    return NextResponse.json(
      { error: { code: 'AUTH_CONFIG' } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  const params = request.nextUrl.searchParams;
  if (params.get('error')) return fail(request, 'denied');
  const cookieToken = request.cookies.get(OAUTH_COOKIE)?.value;
  const parsed = cookieToken ? oauthPayload.safeParse(unseal(cookieToken, mode.secret)) : null;
  const now = Date.now();
  if (
    !parsed?.success ||
    parsed.data.exp <= now ||
    parsed.data.iat > now + 60_000 ||
    parsed.data.exp - parsed.data.iat > 600_000
  )
    return fail(request, 'state');
  const rawState = params.get('state') || '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(rawState)) return fail(request, 'state');
  const stateParam = Buffer.from(rawState);
  const expectedState = Buffer.from(parsed.data.state);
  if (stateParam.length !== expectedState.length || !timingSafeEqual(stateParam, expectedState))
    return fail(request, 'state');
  const code = params.get('code');
  if (
    !code ||
    code.length > 512 ||
    [...code].some((character) => {
      const point = character.charCodeAt(0);
      return point < 32 || point === 127;
    })
  )
    return fail(request, 'state');
  try {
    const redirectUri = `${appOrigin(request)}/api/auth/github/callback`;
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
    if (!tokenResponse.ok) return fail(request, 'github');
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
    if (!userResponse.ok) return fail(request, 'github');
    const parsedUser = githubUser.safeParse(await userResponse.json().catch(() => null));
    if (!parsedUser.success) return fail(request, 'github');
    const user = {
      id: parsedUser.data.id,
      login: parsedUser.data.login,
      name: parsedUser.data.name,
      avatarUrl: parsedUser.data.avatar_url,
    };
    const response = noStore(
      NextResponse.redirect(new URL(safeNext(parsed.data.next), appOrigin(request))),
    );
    setSessionCookie(response, request, user, mode.secret);
    clearOauthCookie(response);
    return response;
  } catch (error) {
    console.error('GitHub sign-in failed', error instanceof Error ? error.name : 'UnknownError');
    return fail(request, 'github');
  }
}
