import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { dispatch } from './mock-api';

function req(
  path: string,
  method = 'GET',
  body?: unknown,
  cookie?: string,
  origin = 'http://localhost:3000',
) {
  return new NextRequest(`http://localhost:3000/api/v1/${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), origin },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const call = (path: string, method = 'GET', body?: unknown, cookie?: string, origin?: string) =>
  dispatch(req(path, method, body, cookie, origin), path.split('/'));

describe('mock HTTP boundary', () => {
  it('saves social drafts within the session and rejects invalid targets, stale revisions and cross-experience IDs', async () => {
    const response = await call('workspace');
    const cookie = response.headers.get('set-cookie')!.split(';')[0];
    const path = 'experiences/tokyo-after-hours/scenes/tokyo-after-hours-scene-1/social';
    const input = {
      expectedVersion: 1,
      expectedRevision: 0,
      platform: 'linkedin',
      draft: { caption: 'A creative study.', overlayText: '', tone: 'understated' },
    };
    expect((await call(path, 'PATCH', input, cookie)).status).toBe(200);
    expect((await call(path, 'PATCH', input, cookie)).status).toBe(409);
    expect((await call(path, 'PATCH', { ...input, platform: 'unknown' }, cookie)).status).toBe(400);
    expect(
      (
        await call(
          path,
          'PATCH',
          { ...input, platform: 'x', draft: { ...input.draft, caption: 'x'.repeat(241) } },
          cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          path.replace('experiences/tokyo-after-hours/', 'experiences/amalfi-postcards/'),
          'PATCH',
          input,
          cookie,
        )
      ).status,
    ).toBe(404);
    const own = await (await call('workspace', 'GET', undefined, cookie)).json();
    const other = await (await call('workspace')).json();
    expect(own.experiences[0].scenes[0].social.drafts.linkedin.caption).toBe('A creative study.');
    expect(other.experiences[0].scenes[0].social.revision).toBe(0);
  });
  it('saves the carousel within the session and rejects stale revisions and invalid orders', async () => {
    const cookie = (await call('workspace')).headers.get('set-cookie')!.split(';')[0];
    const path = 'experiences/tokyo-after-hours/pack';
    const scene = (n: number) => `tokyo-after-hours-scene-${n}`;
    const input = {
      expectedRevision: 0,
      order: [scene(2), scene(1), scene(3), scene(4)],
      coverTitle: 'Tokyo after dark',
    };
    const saved = await call(path, 'PATCH', input, cookie);
    expect(saved.status).toBe(200);
    expect((await saved.json()).revision).toBe(1);
    expect((await call(path, 'PATCH', input, cookie)).status).toBe(409);
    expect(
      (await call(path, 'PATCH', { ...input, expectedRevision: 1, order: [scene(1)] }, cookie))
        .status,
    ).toBe(400);
    expect((await call(path, 'PATCH', { ...input, extra: true }, cookie)).status).toBe(400);
    const own = await (await call('workspace', 'GET', undefined, cookie)).json();
    expect(own.experiences[0].pack).toMatchObject({ order: input.order, revision: 1 });
    expect((await (await call('workspace')).json()).experiences[0].pack.revision).toBe(0);
  });
  it('accepts the browser Host even when Next uses a different internal bind URL', async () => {
    const request = new NextRequest('http://0.0.0.0:3000/api/v1/mock/reset', {
      method: 'POST',
      headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
    });
    expect((await dispatch(request, ['mock', 'reset'])).status).toBe(200);
  });
  it('creates an HttpOnly session and isolates browsers', async () => {
    const a = await call('workspace');
    const b = await call('workspace');
    const cookieA = a.headers.get('set-cookie')!.split(';')[0];
    const cookieB = b.headers.get('set-cookie')!.split(';')[0];
    expect(cookieA).not.toBe(cookieB);
    expect(a.headers.get('set-cookie')).toContain('HttpOnly');
    expect(a.headers.get('cache-control')).toBe('no-store');
    const create = await call(
      'experiences',
      'POST',
      { title: 'Kyoto mornings', destination: 'Kyoto', outfit: 'Linen shirt', mood: 'Slow living' },
      cookieA,
    );
    expect(create.status).toBe(201);
    expect(
      (await (await call('workspace', 'GET', undefined, cookieA)).json()).experiences,
    ).toHaveLength(4);
    expect(
      (await (await call('workspace', 'GET', undefined, cookieB)).json()).experiences,
    ).toHaveLength(3);
  });
  it('enforces validation, route boundaries, origin and export readiness', async () => {
    expect((await call('experiences', 'POST', { title: 'a' })).status).toBe(400);
    expect((await call('experiences', 'POST', {}, undefined, 'https://other.example')).status).toBe(
      403,
    );
    expect((await call('missing')).status).toBe(404);
    expect((await call('experiences/tokyo-after-hours/exports', 'POST', {})).status).toBe(409);
    expect(
      (await call('experiences/tokyo-after-hours/caption', 'PATCH', { caption: 'x'.repeat(17000) }))
        .status,
    ).toBe(413);
    const crossSite = new NextRequest('http://localhost:3000/api/v1/experiences', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
      body: '{}',
    });
    expect((await dispatch(crossSite, ['experiences'])).status).toBe(403);
  });
  it('emulates magic-link sign-in inside the browser workspace only', async () => {
    const cookie = (await call('workspace')).headers.get('set-cookie')!.split(';')[0];
    const other = (await call('workspace')).headers.get('set-cookie')!.split(';')[0];
    expect((await call('demo/auth/magic-link', 'POST', { email: 'nope' }, cookie)).status).toBe(
      400,
    );
    const sent = await call('demo/auth/magic-link', 'POST', { email: 'alex@example.com' }, cookie);
    expect(sent.status).toBe(200);
    const { token } = (await sent.json()).inbox[0];
    expect((await call('demo/auth/verify', 'POST', { token }, other)).status).toBe(400);
    expect(
      (await call('demo/auth/verify', 'POST', { token }, cookie, 'https://other.example')).status,
    ).toBe(403);
    const verified = await call('demo/auth/verify', 'POST', { token }, cookie);
    expect(verified.status).toBe(200);
    expect((await verified.json()).account.email).toBe('alex@example.com');
    const workspace = await (await call('workspace', 'GET', undefined, cookie)).json();
    expect(workspace.demoAuth.account.email).toBe('alex@example.com');
    expect((await call('demo/auth/verify', 'GET', undefined, cookie)).status).toBe(404);
    expect(
      (await (await call('demo/auth/sign-out', 'POST', {}, cookie)).json()).account,
    ).toBeNull();
  });
  it('reports malformed JSON without exposing an internal exception', async () => {
    const request = new NextRequest('http://localhost:3000/api/v1/experiences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    const response = await dispatch(request, ['experiences']);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toEqual({ code: 'INVALID_JSON' });
  });
});
