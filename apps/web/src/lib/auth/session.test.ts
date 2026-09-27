import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { authMode, readSession, safeNext, seal, unseal, SESSION_COOKIE } from './session';

const SECRET = 'a'.repeat(40);
const SHORT_SECRET = 'a'.repeat(20);
const CLIENT_ID = 'c'.repeat(20);
const CLIENT_SECRET = 'b'.repeat(40);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('seal/unseal', () => {
  it('round-trips a payload', () => {
    const token = seal({ hello: 'world' }, SECRET);
    expect(unseal(token, SECRET)).toEqual({ hello: 'world' });
  });
  it('rejects a tampered payload', () => {
    const [body, signature] = seal({ hello: 'world' }, SECRET).split('.');
    const tamperedBody = Buffer.from(JSON.stringify({ hello: 'mallory' })).toString('base64url');
    expect(unseal(`${tamperedBody}.${signature}`, SECRET)).toBeNull();
    void body;
  });
  it('rejects a tampered signature', () => {
    const [body, signature] = seal({ hello: 'world' }, SECRET).split('.');
    expect(unseal(`${body}.${signature}xx`, SECRET)).toBeNull();
  });
  it('rejects the wrong secret', () => {
    const token = seal({ hello: 'world' }, SECRET);
    expect(unseal(token, SHORT_SECRET)).toBeNull();
  });
  it('rejects malformed tokens', () => {
    expect(unseal('not-a-token', SECRET)).toBeNull();
  });
});

describe('authMode', () => {
  it('is open when no client id is set and not on Vercel', () => {
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_ID', '');
    vi.stubEnv('VERCEL', '');
    expect(authMode()).toEqual({ mode: 'open' });
  });
  it('is misconfigured on Vercel without a client id', () => {
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_ID', '');
    vi.stubEnv('VERCEL', '1');
    expect(authMode()).toEqual({ mode: 'misconfigured' });
  });
  it('is misconfigured on Render without a client id', () => {
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_ID', '');
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('RENDER', '1');
    expect(authMode()).toEqual({ mode: 'misconfigured' });
  });
  it('requires a canonical origin for configured auth on Render', () => {
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_ID', CLIENT_ID);
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_SECRET', CLIENT_SECRET);
    vi.stubEnv('WISHSCENE_SESSION_SECRET', SECRET);
    vi.stubEnv('RENDER', '1');
    expect(authMode()).toEqual({ mode: 'misconfigured' });
  });
  it('rejects an insecure canonical origin for a deployed app', () => {
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_ID', CLIENT_ID);
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_SECRET', CLIENT_SECRET);
    vi.stubEnv('WISHSCENE_SESSION_SECRET', SECRET);
    vi.stubEnv('RENDER', '1');
    vi.stubEnv('WISHSCENE_PUBLIC_ORIGIN', 'http://wishscene.example');
    expect(authMode()).toEqual({ mode: 'misconfigured' });
  });
  it('is misconfigured with a short session secret', () => {
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_ID', CLIENT_ID);
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_SECRET', CLIENT_SECRET);
    vi.stubEnv('WISHSCENE_SESSION_SECRET', SHORT_SECRET);
    expect(authMode()).toEqual({ mode: 'misconfigured' });
  });
  it('is misconfigured when the client secret is missing', () => {
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_ID', CLIENT_ID);
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_SECRET', '');
    vi.stubEnv('WISHSCENE_SESSION_SECRET', SECRET);
    expect(authMode()).toEqual({ mode: 'misconfigured' });
  });
  it('is required when fully configured', () => {
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_ID', CLIENT_ID);
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_SECRET', CLIENT_SECRET);
    vi.stubEnv('WISHSCENE_SESSION_SECRET', SECRET);
    expect(authMode()).toEqual({
      mode: 'required',
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      secret: SECRET,
    });
  });
});

describe('readSession', () => {
  function request(cookie?: string) {
    return new NextRequest('http://localhost:3000/', {
      headers: cookie ? { cookie } : {},
    });
  }
  it('returns null in open mode', () => {
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_ID', '');
    vi.stubEnv('VERCEL', '');
    expect(readSession(request())).toBeNull();
  });
  it('returns the user for a valid session cookie', () => {
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_ID', CLIENT_ID);
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_SECRET', CLIENT_SECRET);
    vi.stubEnv('WISHSCENE_SESSION_SECRET', SECRET);
    const token = seal(
      {
        v: 1,
        kind: 'session',
        id: 1,
        login: 'octocat',
        name: 'Octo Cat',
        avatarUrl: 'https://x/a.png',
        iat: Date.now(),
        exp: Date.now() + 1000,
      },
      SECRET,
    );
    expect(readSession(request(`${SESSION_COOKIE}=${token}`))).toEqual({
      id: 1,
      login: 'octocat',
      name: 'Octo Cat',
      avatarUrl: 'https://x/a.png',
    });
  });
  it('rejects an expired session', () => {
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_ID', CLIENT_ID);
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_SECRET', CLIENT_SECRET);
    vi.stubEnv('WISHSCENE_SESSION_SECRET', SECRET);
    const token = seal(
      {
        v: 1,
        kind: 'session',
        id: 1,
        login: 'octocat',
        name: null,
        avatarUrl: 'https://x/a.png',
        iat: Date.now() - 2000,
        exp: Date.now() - 1000,
      },
      SECRET,
    );
    expect(readSession(request(`${SESSION_COOKIE}=${token}`))).toBeNull();
  });
  it('does not accept an OAuth payload as a session', () => {
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_ID', CLIENT_ID);
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_SECRET', CLIENT_SECRET);
    vi.stubEnv('WISHSCENE_SESSION_SECRET', SECRET);
    const token = seal(
      {
        v: 1,
        kind: 'oauth',
        state: 's'.repeat(43),
        verifier: 'v'.repeat(43),
        next: '/',
        iat: Date.now(),
        exp: Date.now() + 1000,
      },
      SECRET,
    );
    expect(readSession(request(`${SESSION_COOKIE}=${token}`))).toBeNull();
  });
});

describe('safeNext', () => {
  it.each([
    ['//evil.com'],
    ['/\\evil.com'],
    ['https://evil.com'],
    ['javascript:alert(1)'],
    ['/api/auth/github'],
    ['/login'],
    ['/LOGIN'],
    ['/Api/Auth/github'],
    ['/..//evil.com'],
    ['/.//evil.com'],
    ['/%2e%2e//evil.com'],
    ['/a/..//evil.com'],
    ['/login/..//evil.com'],
    ['/x/../api/auth/github'],
    [''],
    [undefined],
  ])('rejects %j', (value) => {
    expect(safeNext(value)).toBe('/');
  });
  it('keeps a safe relative path with query and hash', () => {
    expect(safeNext('/feedback?x=1#a')).toBe('/feedback?x=1#a');
  });
});
