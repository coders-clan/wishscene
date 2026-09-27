import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  approvalInput,
  experienceInput,
  generationInput,
  storyUpdate,
  socialUpdate,
} from '@wishscene/contracts';
import { DomainError, MockStudio } from '@wishscene/domain';

const TTL = 60 * 60 * 1000;
const COOKIE = 'wishscene-demo';
const registry = globalThis as typeof globalThis & {
  wishsceneSessions?: Map<string, { studio: MockStudio; seen: number }>;
};
const sessions = (registry.wishsceneSessions ??= new Map());
async function body(request: NextRequest) {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new DomainError(415, 'JSON_REQUIRED', 'Send application/json.');
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError(400, 'INVALID_JSON', 'A JSON body is required.');
  let size = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) {
      await reader.cancel();
      throw new DomainError(413, 'BODY_TOO_LARGE', 'Request body exceeds 16 KiB.');
    }
    parts.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch {
    throw new DomainError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
  }
}
export async function dispatch(request: NextRequest, path: string[]) {
  if (process.env.NODE_ENV === 'production' && process.env.WISHSCENE_MOCK !== '1')
    return NextResponse.json(
      {
        error: {
          code: 'MOCK_DISABLED',
          message: 'Demo API disabled. Set WISHSCENE_MOCK=1 for a local production preview.',
        },
      },
      { status: 503 },
    );
  const origin = request.headers.get('origin');
  // hunch-why: Next can construct an internal URL with the bind address (0.0.0.0). Compare browser Origin against the request Host and protocol, or valid local mutations are incorrectly rejected. Do not trust forwarded-host headers here.
  const requestOrigin = `${request.nextUrl.protocol}//${request.headers.get('host') ?? request.nextUrl.host}`;
  if (request.method !== 'GET' && origin && origin !== requestOrigin)
    return NextResponse.json(
      { error: { code: 'ORIGIN', message: 'Cross-origin writes are disabled.' } },
      { status: 403 },
    );
  const now = Date.now();
  for (const [id, session] of sessions) if (now - session.seen > TTL) sessions.delete(id);
  let sessionId = request.cookies.get(COOKIE)?.value;
  if (!sessionId || !sessions.has(sessionId)) {
    if (sessions.size >= 100)
      return NextResponse.json(
        { error: { code: 'CAPACITY', message: 'The demo is at capacity. Try again later.' } },
        { status: 503 },
      );
    sessionId = randomUUID();
    sessions.set(sessionId, { studio: new MockStudio(), seen: now });
  }
  const session = sessions.get(sessionId)!;
  session.seen = now;
  const studio = session.studio;
  let result: unknown;
  let status = 200;
  try {
    const route = path.join('/');
    if (request.method === 'GET' && route === 'workspace') result = studio.snapshot();
    else if (request.method === 'POST' && route === 'mock/reset') result = studio.reset();
    else if (request.method === 'POST' && route === 'experiences') {
      result = studio.create(experienceInput.parse(await body(request)));
      status = 201;
    } else if (
      request.method === 'PATCH' &&
      path.length === 3 &&
      path[0] === 'experiences' &&
      path[2] === 'story'
    )
      result = studio.updateStory(path[1], storyUpdate.parse(await body(request)));
    else if (
      request.method === 'PATCH' &&
      path.length === 3 &&
      path[0] === 'experiences' &&
      path[2] === 'caption'
    ) {
      const input = z
        .object({ caption: z.string().max(2200) })
        .strict()
        .parse(await body(request));
      studio.caption(path[1], input.caption);
      result = { saved: true };
    } else if (
      request.method === 'PATCH' &&
      path.length === 5 &&
      path[0] === 'experiences' &&
      path[2] === 'scenes' &&
      path[4] === 'social'
    ) {
      result = studio.updateSocial(path[1], path[3], socialUpdate.parse(await body(request)));
    } else if (
      request.method === 'POST' &&
      path.length === 3 &&
      path[0] === 'experiences' &&
      path[2] === 'exports'
    )
      result = studio.export(path[1]);
    else if (
      request.method === 'POST' &&
      path.length === 5 &&
      path[0] === 'experiences' &&
      path[2] === 'scenes' &&
      path[4] === 'generations'
    ) {
      result = studio.generate(path[1], path[3], generationInput.parse(await body(request)));
      status = 202;
    } else if (
      request.method === 'POST' &&
      path.length === 5 &&
      path[0] === 'experiences' &&
      path[2] === 'scenes' &&
      path[4] === 'approval'
    ) {
      const input = approvalInput.parse(await body(request));
      studio.approve(path[1], path[3], input.assetId, input.expectedVersion);
      result = { approved: true };
    } else if (
      request.method === 'POST' &&
      path.length === 3 &&
      path[0] === 'jobs' &&
      path[2] === 'cancel'
    ) {
      studio.cancel(path[1]);
      result = { cancelled: true };
    } else throw new DomainError(404, 'NOT_FOUND', 'API route not found.');
  } catch (error) {
    if (error instanceof z.ZodError) {
      status = 400;
      result = {
        error: {
          code: 'VALIDATION',
          message: error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; '),
        },
      };
    } else if (error instanceof DomainError) {
      status = error.status;
      result = { error: { code: error.code, message: error.message } };
    } else {
      status = 500;
      result = {
        error: { code: 'INTERNAL', message: 'The mock workspace could not complete this request.' },
      };
      console.error(error);
    }
  }
  const response = NextResponse.json(result, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Wishscene-Mode': 'mock' },
  });
  response.cookies.set(COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'strict',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: TTL / 1000,
  });
  return response;
}
