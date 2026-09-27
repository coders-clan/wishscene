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
  });
  it('reports malformed JSON without exposing an internal exception', async () => {
    const request = new NextRequest('http://localhost:3000/api/v1/experiences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    const response = await dispatch(request, ['experiences']);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_JSON');
  });
});
