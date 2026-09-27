import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as startGitHub } from './route';
import { GET as finishGitHub } from './callback/route';
import { OAUTH_COOKIE, readSessionToken, seal, SESSION_COOKIE, unseal } from '@/lib/auth/session';

const SECRET = 'a'.repeat(40);
const CLIENT_ID = 'c'.repeat(20);
const CLIENT_SECRET = 'b'.repeat(40);
const STATE = 's'.repeat(43);
const VERIFIER = 'v'.repeat(43);

function configureAuth() {
  vi.stubEnv('WISHSCENE_GITHUB_CLIENT_ID', CLIENT_ID);
  vi.stubEnv('WISHSCENE_GITHUB_CLIENT_SECRET', CLIENT_SECRET);
  vi.stubEnv('WISHSCENE_SESSION_SECRET', SECRET);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('GitHub OAuth routes', () => {
  it('starts OAuth with state, PKCE and a secure sealed cookie', async () => {
    configureAuth();
    const response = await startGitHub(
      new NextRequest('https://wishscene.test/api/auth/github?next=%2Ffeedback'),
    );
    expect(response.status).toBe(307);
    const destination = new URL(response.headers.get('location')!);
    expect(destination.origin).toBe('https://github.com');
    expect(destination.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(destination.searchParams.get('redirect_uri')).toBe(
      'https://wishscene.test/api/auth/github/callback',
    );
    expect(destination.searchParams.get('code_challenge_method')).toBe('S256');
    const cookie = response.cookies.get(OAUTH_COOKIE)!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.secure).toBe(true);
    expect(cookie.sameSite).toBe('lax');
    expect(cookie.path).toBe('/api/auth/github');
    expect(unseal(cookie.value, SECRET)).toMatchObject({
      v: 1,
      kind: 'oauth',
      next: '/feedback',
      state: destination.searchParams.get('state'),
    });
  });

  it('exchanges a valid callback and creates a session without storing the access token', async () => {
    configureAuth();
    const oauthCookie = seal(
      {
        v: 1,
        kind: 'oauth',
        state: STATE,
        verifier: VERIFIER,
        next: '/feedback',
        iat: Date.now(),
        exp: Date.now() + 60_000,
      },
      SECRET,
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'temporary-github-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 42,
            login: 'octocat',
            name: 'Octo Cat',
            avatar_url: 'https://avatars.example/octocat.png',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const response = await finishGitHub(
      new NextRequest(
        `https://wishscene.test/api/auth/github/callback?code=temporary-code&state=${STATE}`,
        { headers: { cookie: `${OAUTH_COOKIE}=${oauthCookie}` } },
      ),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://wishscene.test/feedback');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      code: 'temporary-code',
      code_verifier: VERIFIER,
    });
    const session = response.cookies.get(SESSION_COOKIE)!;
    expect(readSessionToken(session.value)).toMatchObject({ id: 42, login: 'octocat' });
    expect(session.value).not.toContain('temporary-github-token');
    expect(response.cookies.get(OAUTH_COOKIE)?.value).toBe('');
  });

  it('rejects a callback whose state does not match before contacting GitHub', async () => {
    configureAuth();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const oauthCookie = seal(
      {
        v: 1,
        kind: 'oauth',
        state: STATE,
        verifier: VERIFIER,
        next: '/',
        iat: Date.now(),
        exp: Date.now() + 60_000,
      },
      SECRET,
    );
    const response = await finishGitHub(
      new NextRequest(
        `https://wishscene.test/api/auth/github/callback?code=temporary-code&state=${'x'.repeat(43)}`,
        { headers: { cookie: `${OAUTH_COOKIE}=${oauthCookie}` } },
      ),
    );
    expect(response.headers.get('location')).toBe('https://wishscene.test/login?error=state');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
