import { createHmac, randomUUID } from 'node:crypto';
import { APIError } from 'better-auth/api';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { publishCandidate } from '@wishscene/db';
import { createTestDatabase } from '@wishscene/db/testing';
import { MemoryAssetStore } from '@wishscene/storage';
import { productDispatch } from './api';
import {
  canonicalEmail,
  createProductAuth,
  MAGIC_LINKS_PER_ADDRESS,
  magicLinkThrottleKey,
} from './auth';
import { parseTrustedProxies, productConfig } from './config';
import { redact, scrub, setLogSink } from './log';
import { MemoryMailer } from './mailer';
import type { ProductRuntime } from './runtime';

const ORIGIN = 'http://localhost:3000';
const input = {
  title: 'Tokyo nights',
  destination: 'Tokyo',
  outfit: 'Black wool coat',
  mood: 'After hours',
};

describe('product config', () => {
  it('fails closed and names only the missing variables', () => {
    const { config, missing } = productConfig({ NODE_ENV: 'test', AUTH_SECRET: 'short' });
    expect(config).toBeNull();
    expect(missing).toEqual([
      'DATABASE_URL',
      'AUTH_SECRET',
      'S3_REGION',
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
    ]);
    expect(
      productConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://user:hunter2@db/app',
        AUTH_SECRET: 'x'.repeat(40),
        S3_REGION: 'us-east-1',
        S3_BUCKET: 'b',
        S3_ACCESS_KEY_ID: 'id',
        S3_SECRET_ACCESS_KEY: 'secret',
      }),
    ).toEqual({ config: null, missing: ['MAIL_PROVIDER'] });
    expect(
      productConfig({ NODE_ENV: 'test', WISHSCENE_TRUSTED_PROXIES: '10.0.0.0/8,nope' }).missing,
    ).toContain('WISHSCENE_TRUSTED_PROXIES');
  });

  it('accepts only IPs and CIDR ranges as trusted proxies', () => {
    expect(parseTrustedProxies(undefined)).toEqual([]);
    expect(parseTrustedProxies(' 10.0.0.0/8, 192.0.2.1 ,2001:db8::/32')).toEqual([
      '10.0.0.0/8',
      '192.0.2.1',
      '2001:db8::/32',
    ]);
    for (const bad of [
      '10.0.0.0/33',
      '10.0.0.0/8/1',
      'proxy.internal',
      '10.0.0.0/x',
      // Better Auth drops zone ids and reads IPv4-mapped entries as IPv4.
      'fe80::1%eth0',
      '::ffff:10.0.0.1',
      '::ffff:a00:0/104',
      // ...and misreads an embedded dotted quad.
      '64:ff9b::10.0.0.5',
    ])
      expect(parseTrustedProxies(bad), bad).toBeNull();
  });
});

describe('magic-link address throttle keys', () => {
  it('gives mailbox variants one key and never contains the address', () => {
    expect(canonicalEmail(' Victim+promo@Example.test ')).toBe('victim@example.test');
    expect(canonicalEmail('v.i.c.t.i.m+1@googlemail.com')).toBe('victim@gmail.com');
    // Dots only collapse where the provider ignores them.
    expect(canonicalEmail('v.ictim@example.test')).toBe('v.ictim@example.test');
    const secret = 'test-secret-that-is-at-least-32-characters';
    const key = magicLinkThrottleKey(secret, 'victim@gmail.com');
    expect(magicLinkThrottleKey(secret, 'V.ictim+2@googlemail.com')).toBe(key);
    expect(magicLinkThrottleKey(secret, 'other@gmail.com')).not.toBe(key);
    expect(key).not.toMatch(/victim|gmail/i);
    // Keyed by a derived key, not by the auth secret itself.
    const direct = createHmac('sha256', secret).update('victim@gmail.com').digest('base64url');
    expect(key).not.toContain(direct);
  });
});

describe('product API session edge cases', () => {
  const request = () => new NextRequest(`${ORIGIN}/api/v1/experiences`);
  const withAuth = (getSession: () => Promise<unknown>, prisma?: unknown) =>
    ({
      prisma,
      assets: new MemoryAssetStore(),
      auth: { api: { getSession } },
    }) as unknown as ProductRuntime;

  it('answers a session that vanished mid-refresh with 401 and the cleared cookie', async () => {
    const error = new APIError('UNAUTHORIZED', { message: 'Failed to get session' });
    const cleared = new Headers();
    cleared.append('set-cookie', 'wishscene-product.session_token=; Max-Age=0; Path=/');
    Object.defineProperty(error, Symbol.for('better-call:api-error-headers'), { value: cleared });
    const response = await productDispatch(
      request(),
      ['experiences'],
      withAuth(() => Promise.reject(error)),
    );
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHENTICATED');
    expect(response.headers.getSetCookie()).toEqual([
      'wishscene-product.session_token=; Max-Age=0; Path=/',
    ]);
    const other = new APIError('INTERNAL_SERVER_ERROR', { message: 'x' });
    const failed = await productDispatch(
      request(),
      ['experiences'],
      withAuth(() => Promise.reject(other)),
    );
    expect(failed.status).toBe(500);
  });

  it('answers pool exhaustion with 503 and logs it', async () => {
    const lines: string[] = [];
    setLogSink((_level, line) => lines.push(line));
    try {
      const exhausted = new Error('timeout exceeded when trying to connect');
      const prisma = new Proxy({}, { get: () => ({ findMany: () => Promise.reject(exhausted) }) });
      const session = { user: { id: randomUUID(), deletedAt: null }, session: {} };
      const response = await productDispatch(
        request(),
        ['experiences'],
        withAuth(() => Promise.resolve({ headers: new Headers(), response: session }), prisma),
      );
      expect(response.status).toBe(503);
      expect(response.headers.get('retry-after')).toBe('1');
      expect(lines.map((line) => JSON.parse(line))).toContainEqual(
        expect.objectContaining({ level: 'warn', code: 'POOL_TIMEOUT', route: 'GET experiences' }),
      );
    } finally {
      setLogSink(null);
    }
  });
});

describe('product log redaction', () => {
  it('removes credentials, emails and signed URL queries', () => {
    const line = JSON.stringify(
      redact({
        email: 'a@b.co',
        nested: { sessionToken: 'abc', note: 'mail a@b.co at https://x.test/verify?token=abc' },
        error: new Error('failed for https://bucket.test/o/key?X-Amz-Signature=deadbeef'),
      }),
    );
    expect(line).not.toMatch(/a@b\.co|token=abc|deadbeef|"abc"/);
    expect(scrub('id ' + 'A'.repeat(40))).toBe('id [redacted]');
  });
});

describe.skipIf(!process.env.WISHSCENE_TEST_PG_URL)('product API over HTTP (Postgres)', () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  let runtime: ProductRuntime;
  const mailer = new MemoryMailer();
  const assets = new MemoryAssetStore();
  const lines: string[] = [];
  const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
    vi.spyOn(console, method),
  );

  beforeAll(async () => {
    db = await createTestDatabase();
    runtime = {
      prisma: db.prisma,
      assets,
      auth: createProductAuth({
        prisma: db.prisma,
        secret: 'test-secret-that-is-at-least-32-characters',
        baseURL: ORIGIN,
        mailer,
      }),
    };
    setLogSink((_level, line) => lines.push(line));
  }, 120_000);
  afterAll(async () => {
    setLogSink(null);
    consoleSpies.forEach((spy) => spy.mockRestore());
    await db?.drop();
  });

  const authRequest = (path: string, init: RequestInit & { ip?: string } = {}) =>
    runtime.auth.handler(
      new Request(`${ORIGIN}/api/v1/auth${path}`, {
        ...init,
        headers: {
          origin: ORIGIN,
          'content-type': 'application/json',
          'x-forwarded-for': init.ip ?? '203.0.113.10',
          ...(init.headers as Record<string, string>),
        },
      }),
    );

  async function signIn(email: string) {
    const sent = await authRequest('/sign-in/magic-link', {
      method: 'POST',
      body: JSON.stringify({ email, callbackURL: '/' }),
    });
    expect(sent.status).toBe(200);
    const message = mailer.sent.filter((mail) => mail.to === email).at(-1)!;
    const link = message.text.match(/https?:\/\/\S+/)![0];
    expect(link.startsWith(`${ORIGIN}/api/v1/auth/magic-link/verify?`)).toBe(true);
    const verified = await runtime.auth.handler(
      new Request(link, { headers: { 'x-forwarded-for': '203.0.113.10' } }),
    );
    expect(verified.status).toBe(302);
    const cookie = verified.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    expect(cookie).toMatch(/wishscene-product\.session_token=/);
    // Single use: the same link cannot mint a second session.
    const reused = await runtime.auth.handler(new Request(link));
    expect(reused.headers.getSetCookie().join()).not.toMatch(/session_token=[^;]/);
    return { cookie, link };
  }

  function call(
    path: string,
    options: { method?: string; body?: unknown; cookie?: string; origin?: string } = {},
  ) {
    const method = options.method ?? 'GET';
    const request = new NextRequest(`${ORIGIN}/api/v1/${path}`, {
      method,
      headers: {
        origin: options.origin ?? ORIGIN,
        ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
        ...(options.cookie ? { cookie: options.cookie } : {}),
      },
      body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}),
    });
    return productDispatch(request, path.split('/'), runtime);
  }

  it('signs in with a magic link and keeps every account’s data private', async () => {
    const aliceEmail = `alice-${randomUUID()}@example.test`;
    const bobEmail = `bob-${randomUUID()}@example.test`;
    const alice = await signIn(aliceEmail);
    const bob = await signIn(bobEmail);

    expect((await call('experiences')).status).toBe(401);
    expect(
      (
        await call('experiences', {
          method: 'POST',
          body: input,
          cookie: alice.cookie,
          origin: 'https://evil.example',
        })
      ).status,
    ).toBe(403);

    const created = await call('experiences', {
      method: 'POST',
      body: input,
      cookie: alice.cookie,
    });
    expect(created.status).toBe(201);
    const experience = await created.json();
    const scene = experience.scenes[0];

    const generation = await call(`experiences/${experience.id}/scenes/${scene.id}/generations`, {
      method: 'POST',
      body: { requestKey: randomUUID() },
      cookie: alice.cookie,
    });
    expect(generation.status).toBe(202);
    const { job } = await generation.json();
    const { assetId } = await publishCandidate(db.prisma, {
      jobId: job.id,
      objectKey: `o/${'A'.repeat(43)}`,
      contentType: 'image/png',
    });
    const init = await call('uploads/init', {
      method: 'POST',
      body: { contentType: 'image/jpeg', byteSize: 2048 },
      cookie: alice.cookie,
    });
    expect(init.status).toBe(201);
    const { upload, policy } = await init.json();
    expect(policy.fields.key).toMatch(/^o\/[A-Za-z0-9_-]{43}$/);
    expect(policy.fields.key).not.toContain('alice');

    const denied: Array<[string, { method?: string; body?: unknown }]> = [
      [`experiences/${experience.id}`, {}],
      [
        `experiences/${experience.id}/bible`,
        { method: 'PATCH', body: { expectedVersion: 1, outfit: 'Red dress', mood: 'Adventure' } },
      ],
      [
        `experiences/${experience.id}/scenes/${scene.id}/generations`,
        { method: 'POST', body: { requestKey: randomUUID() } },
      ],
      [`experiences/${experience.id}/exports`, { method: 'POST', body: { expectedVersion: 1 } }],
      [`jobs/${job.id}`, {}],
      [`jobs/${job.id}/cancel`, { method: 'POST' }],
      [`assets/${assetId}/approve`, { method: 'POST', body: { expectedVersion: 1 } }],
      [`assets/${assetId}/download`, {}],
      [`uploads/${upload.id}/complete`, { method: 'POST' }],
    ];
    for (const [path, options] of denied) {
      const response = await call(path, { ...options, cookie: bob.cookie });
      expect(response.status, path).toBe(404);
      expect((await response.json()).error.code).toBe('NOT_FOUND');
    }
    expect(await (await call('experiences', { cookie: bob.cookie })).json()).toEqual({
      experiences: [],
    });

    // The owner still can.
    expect((await call(`jobs/${job.id}`, { cookie: alice.cookie })).status).toBe(200);
    const approve = await call(`assets/${assetId}/approve`, {
      method: 'POST',
      body: { expectedVersion: 1 },
      cookie: alice.cookie,
    });
    expect(approve.status).toBe(200);
    const download = await call(`assets/${assetId}/download`, { cookie: alice.cookie });
    expect(download.status).toBe(200);
    expect(download.headers.get('cache-control')).toBe('no-store');
    const { url: signedUrl } = await download.json();
    expect(signedUrl).toContain('X-Amz-Signature=');
    assets.put(policy.fields.key, { byteSize: 2000, contentType: 'image/jpeg' });
    const completed = await call(`uploads/${upload.id}/complete`, {
      method: 'POST',
      cookie: alice.cookie,
    });
    expect(completed.status).toBe(200);
    expect((await completed.json()).job.kind).toBe('upload_validation');
    const stored = await assets.head(policy.fields.key);
    expect((await db.prisma.upload.findUniqueOrThrow({ where: { id: upload.id } })).etag).toBe(
      stored?.etag,
    );

    // A tombstoned account is signed out everywhere.
    await db.prisma.user.update({ where: { email: bobEmail }, data: { deletedAt: new Date() } });
    expect((await call('experiences', { cookie: bob.cookie })).status).toBe(401);

    // Audit history carries ids only.
    const audit = await db.prisma.auditEvent.findMany();
    expect(audit.length).toBeGreaterThan(0);
    expect(JSON.stringify(audit)).not.toMatch(/:\/\/|@|X-Amz/);

    // Nothing sensitive reached the logs or the console.
    const printed = consoleSpies.flatMap((spy) => spy.mock.calls.map((args) => args.join(' ')));
    const output = [...lines, ...printed].join('\n');
    expect(lines.length).toBeGreaterThan(0);
    const secrets = [
      aliceEmail,
      bobEmail,
      alice.link,
      new URL(alice.link).searchParams.get('token')!,
      alice.cookie.split('=')[1],
      signedUrl,
      new URL(signedUrl).searchParams.get('X-Amz-Signature')!,
      policy.fields.key,
    ];
    for (const secret of secrets) expect(output).not.toContain(secret);
  });

  it('rate-limits magic-link requests per client in Postgres', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const response = await authRequest('/sign-in/magic-link', {
        method: 'POST',
        body: JSON.stringify({ email: `limit-${i}@example.test` }),
        ip: '198.51.100.7',
      });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
    expect(await db.prisma.rateLimit.count()).toBeGreaterThan(0);
  });

  it('limits magic links per address across client IPs', async () => {
    const email = `target-${randomUUID()}@example.test`;
    const responses: Response[] = [];
    for (let i = 0; i <= MAGIC_LINKS_PER_ADDRESS; i++) {
      const response = await authRequest('/sign-in/magic-link', {
        method: 'POST',
        // Case variants and +tags count as the same mailbox.
        body: JSON.stringify({ email: i % 2 ? email.toUpperCase() : email.replace('@', `+${i}@`) }),
        ip: `192.0.2.${i + 1}`,
      });
      responses.push(response);
    }
    expect(responses.map((response) => response.status)).toEqual([
      ...Array(MAGIC_LINKS_PER_ADDRESS).fill(200),
      429,
    ]);
    const retryAfter = Number(responses.at(-1)!.headers.get('retry-after'));
    expect(retryAfter).toBeGreaterThan(500);
    expect(retryAfter).toBeLessThanOrEqual(600);
    expect(mailer.sent.filter((mail) => canonicalEmail(mail.to) === email)).toHaveLength(
      MAGIC_LINKS_PER_ADDRESS,
    );
    const keys = (await db.prisma.throttle.findMany()).map((row) => row.key).join();
    expect(keys).not.toMatch(/target-|example/i);
  });

  it('returns the refreshed cookie when a session is extended', async () => {
    const email = `carol-${randomUUID()}@example.test`;
    const { cookie } = await signIn(email);
    // Issued two days ago: past the one-day update age, so this request extends it.
    const user = await db.prisma.user.findUniqueOrThrow({ where: { email } });
    await db.prisma.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60_000) },
    });
    const response = await call('experiences', { cookie });
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().join()).toMatch(/wishscene-product\.session_token=[^;]/);
    const session = await db.prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60_000);

    // A deleted account's session is not extended in the browser.
    await db.prisma.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60_000) },
    });
    await db.prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });
    const tombstoned = await call('experiences', { cookie });
    expect(tombstoned.status).toBe(401);
    expect(tombstoned.headers.getSetCookie()).toEqual([]);
    expect(await db.prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });
});
