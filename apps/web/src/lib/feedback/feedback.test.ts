import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { feedbackDispatch } from './api';
import { seal } from '../auth/session';
import { postgresFeedback, sqliteFeedback, type FeedbackStore } from './store';
import { feedbackCreate, type FeedbackCreate, type FeedbackItem } from '@wishscene/contracts';
import { createFeedback } from '@wishscene/domain';
function input(): FeedbackCreate {
  return {
    requestId: randomUUID(),
    author: 'Dave',
    title: `Feedback ${randomUUID()}`,
    description: 'Please make this clearer. שלום <script>alert(1)</script>',
    category: 'design',
    priority: 'normal',
    screenshot: null,
    annotations: [],
    target: {
      kind: 'element',
      path: '/',
      selector: '[data-feedback-id="studio-greeting"]',
      label: 'Greeting',
      excerpt: 'What if?',
      viewport: { width: 1200, height: 800, dpr: 1 },
      rect: { x: 0, y: 0, width: 400, height: 200 },
    },
  };
}
for (const mode of ['sqlite', 'postgres'] as const) {
  describe.skipIf(mode === 'postgres' && !process.env.WISHSCENE_TEST_PG_URL)(
    `shared feedback ${mode}`,
    () => {
      let store: FeedbackStore;
      beforeAll(async () => {
        store =
          mode === 'sqlite'
            ? await sqliteFeedback(':memory:')
            : await postgresFeedback(process.env.WISHSCENE_TEST_PG_URL!);
      });
      afterAll(async () => {
        await store?.close();
      });
      async function call(
        path = '',
        method = 'GET',
        body?: unknown,
        cookie?: string,
        origin = 'http://localhost:3000',
      ) {
        const [route, query = ''] = path.split('?');
        return feedbackDispatch(
          new NextRequest(`http://localhost:3000/api/feedback/${route}?${query}`, {
            method,
            headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body),
          }),
          route ? route.split('/') : [],
          store,
        );
      }
      it('shares reports and discussions between visitors, strips identity tokens, paginates and filters', async () => {
        const data = input();
        const response = await call('', 'POST', data);
        expect(response.status).toBe(201);
        const cookie = response.headers.get('set-cookie')!.split(';')[0];
        const report = (await response.json()) as FeedbackItem;
        expect(report).not.toHaveProperty('creator');
        expect(report).not.toHaveProperty('voters');
        expect(report.description).toContain('<script>');
        const list = await (await call(`?q=${encodeURIComponent(data.title)}`)).json();
        expect(list.items).toHaveLength(1);
        expect(list.items[0].id).toBe(report.id);
        expect(list.items[0]).not.toHaveProperty('comments');
        expect(
          (await (await call(`?q=${encodeURIComponent(data.title)}&status=resolved`)).json()).total,
        ).toBe(0);
        expect(
          (await (await call(`?q=${encodeURIComponent(data.title)}&offset=30`)).json()).items,
        ).toEqual([]);
        const reply = {
          requestId: randomUUID(),
          author: 'Another developer',
          text: 'I see this too.',
        };
        expect((await call(`${report.id}/comments`, 'POST', reply)).status).toBe(200);
        expect((await call(`${report.id}/comments`, 'POST', reply)).status).toBe(200);
        expect((await (await call(report.id)).json()).comments).toHaveLength(1);
        const again = await call('', 'POST', data, cookie);
        expect((await again.json()).id).toBe(report.id);
        expect((await call('', 'POST', data)).status).toBe(409);
      });
      it('rejects stale triage and retains simultaneous replies and votes', async () => {
        const response = await call('', 'POST', input());
        const report = (await response.json()) as FeedbackItem;
        const cookie = response.headers.get('set-cookie')!.split(';')[0];
        const patch = {
          expectedRevision: 1,
          author: 'Dave',
          status: 'in-progress',
          priority: 'high',
          assignee: 'Coders Clan',
        };
        expect((await call(report.id, 'PATCH', patch, cookie)).status).toBe(200);
        expect(
          (await call(report.id, 'PATCH', { ...patch, status: 'resolved' }, cookie)).status,
        ).toBe(409);
        const replies = await Promise.all(
          [1, 2, 3].map((i) =>
            call(`${report.id}/comments`, 'POST', {
              requestId: randomUUID(),
              author: `Dev ${i}`,
              text: `Reply ${i}`,
            }),
          ),
        );
        expect(replies.map((x) => x.status)).toEqual([200, 200, 200]);
        await call(`${report.id}/vote`, 'PUT', { voted: true }, cookie);
        await call(`${report.id}/vote`, 'PUT', { voted: true }, cookie);
        const current = await (await call(report.id, 'GET', undefined, cookie)).json();
        expect(current.votes).toBe(1);
        expect(current.comments).toHaveLength(4);
        expect(current.assignee).toBe('Coders Clan');
        expect(current.status).toBe('in-progress');
        await call(`${report.id}/vote`, 'PUT', { voted: false }, cookie);
        expect((await (await call(report.id)).json()).votes).toBe(0);
      });
      it('rejects invalid payloads, oversized data, external paths, CSRF and request floods', async () => {
        expect((await call('', 'POST', input(), undefined, 'https://evil.example')).status).toBe(
          403,
        );
        expect(
          (
            await call('', 'POST', {
              ...input(),
              target: { ...input().target, path: '//evil.example' },
            })
          ).status,
        ).toBe(400);
        expect(
          (await call('', 'POST', { ...input(), screenshot: 'data:image/svg+xml;base64,YQ==' }))
            .status,
        ).toBe(400);
        expect(
          (await call('', 'POST', { ...input(), screenshot: 'data:image/jpeg;base64,YQ==' }))
            .status,
        ).toBe(400);
        expect(
          (await call('', 'POST', { ...input(), description: 'x'.repeat(1800001) })).status,
        ).toBe(413);
        const cookie = `wishscene-feedback=${randomUUID()}`;
        const report = await (await call('', 'POST', input(), cookie)).json();
        for (let i = 0; i < 29; i++)
          expect((await call(`${report.id}/vote`, 'PUT', { voted: true }, cookie)).status).toBe(
            200,
          );
        const limited = await call(`${report.id}/vote`, 'PUT', { voted: true }, cookie);
        expect(limited.status).toBe(429);
        expect(limited.headers.get('retry-after')).toBe('60');
      });
    },
  );
}
it('keeps feedback across SQLite connections and a database reopen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wishscene-feedback-'));
  const path = join(dir, 'board.feedback.sqlite');
  const first = await sqliteFeedback(path),
    second = await sqliteFeedback(path);
  const report = createFeedback(feedbackCreate.parse(input()), 'actor', new Date().toISOString());
  await first.create(report, null);
  expect((await second.get(report.id)).item.title).toBe(report.title);
  await first.close();
  await second.close();
  const reopened = await sqliteFeedback(path);
  expect((await reopened.get(report.id)).item.description).toBe(report.description);
  await reopened.close();
  await rm(dir, { recursive: true });
});
describe('feedback with GitHub sign-in required', () => {
  const SECRET = 'a'.repeat(40);
  let store: FeedbackStore;
  beforeAll(async () => {
    store = await sqliteFeedback(':memory:');
  });
  afterAll(async () => {
    await store?.close();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  function stubAuth() {
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_ID', 'client');
    vi.stubEnv('WISHSCENE_GITHUB_CLIENT_SECRET', 'secret');
    vi.stubEnv('WISHSCENE_SESSION_SECRET', SECRET);
  }
  function sessionCookie() {
    const token = seal(
      {
        v: 1,
        id: 42,
        login: 'octocat',
        name: null,
        avatarUrl: 'https://x/a.png',
        exp: Date.now() + 60000,
      },
      SECRET,
    );
    return `wishscene-session=${token}`;
  }
  it('rejects requests without a session', async () => {
    stubAuth();
    const response = await feedbackDispatch(
      new NextRequest('http://localhost:3000/api/feedback/', {
        method: 'GET',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      }),
      [],
      store,
    );
    expect(response.status).toBe(401);
  });
  it('overrides the author with the session login on create', async () => {
    stubAuth();
    const data = input();
    data.author = 'someone-else';
    const response = await feedbackDispatch(
      new NextRequest('http://localhost:3000/api/feedback/', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
          cookie: sessionCookie(),
        },
        body: JSON.stringify(data),
      }),
      [],
      store,
    );
    expect(response.status).toBe(201);
    const report = await response.json();
    expect(report.author).toBe('octocat');
  });
});
