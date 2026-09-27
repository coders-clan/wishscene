import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';
import { seal, SESSION_COOKIE } from './lib/auth/session';

const SECRET = 'a'.repeat(40);

afterEach(() => {
  vi.unstubAllEnvs();
});

function req(path: string, cookie?: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

describe('proxy in open mode', () => {
  it('passes every request through', () => {
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_ID', '');
    vi.stubEnv('VERCEL', '');
    const response = proxy(req('/feedback'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});

describe('proxy in misconfigured mode', () => {
  it('returns 503 for pages and api routes', () => {
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_ID', '');
    vi.stubEnv('VERCEL', '1');
    expect(proxy(req('/feedback')).status).toBe(503);
    expect(proxy(req('/api/v1/workspace')).status).toBe(503);
  });
});

describe('proxy in required mode', () => {
  function stub() {
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_ID', 'client');
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_SECRET', 'secret');
    vi.stubEnv('WISHSCENE_SESSION_SECRET', SECRET);
  }
  it('redirects an unauthenticated page request to /login', () => {
    stub();
    const response = proxy(req('/feedback'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login?next=%2Ffeedback');
  });
  it('returns 401 for an unauthenticated api request', () => {
    stub();
    expect(proxy(req('/api/v1/workspace')).status).toBe(401);
  });
  it('passes /login and /api/auth/github through', () => {
    stub();
    expect(proxy(req('/login')).headers.get('x-middleware-next')).toBe('1');
    expect(proxy(req('/api/auth/github')).headers.get('x-middleware-next')).toBe('1');
  });
  it('passes a request with a valid session cookie', () => {
    stub();
    const token = seal(
      {
        v: 1,
        id: 1,
        login: 'octocat',
        name: null,
        avatarUrl: 'https://x/a.png',
        exp: Date.now() + 1000,
      },
      SECRET,
    );
    const response = proxy(req('/feedback', `${SESSION_COOKIE}=${token}`));
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});
