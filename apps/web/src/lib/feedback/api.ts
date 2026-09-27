import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  feedbackCreate,
  feedbackPatch,
  feedbackReply,
  type FeedbackRecord,
  type FeedbackItem,
  type FeedbackSummary,
} from '@wishscene/contracts';
import {
  createFeedback,
  triageFeedback,
  replyToFeedback,
  voteForFeedback,
  DomainError,
} from '@wishscene/domain';
import { feedbackStore, type FeedbackStore } from './store';
import { requireUser } from '../auth/session';
const COOKIE = 'wishscene-feedback';
function publicItem(item: FeedbackRecord, actor: string, hasScreenshot: boolean): FeedbackItem {
  const { creator: _creator, voters, ...rest } = item;
  void _creator;
  return { ...rest, votes: voters.length, voted: voters.includes(actor), hasScreenshot };
}
async function readBody(request: NextRequest) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new DomainError(415, 'JSON_REQUIRED', 'Send application/json.');
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError(400, 'INVALID_JSON', 'A JSON body is required.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1800000) {
      await reader.cancel();
      throw new DomainError(413, 'TOO_LARGE', 'Screenshot is too large. Select a smaller section.');
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new DomainError(400, 'INVALID_JSON', 'Invalid JSON.');
  }
}
export async function feedbackDispatch(
  request: NextRequest,
  path: string[],
  suppliedStore?: FeedbackStore,
) {
  const auth = requireUser(request);
  if ('response' in auth) return auth.response;
  const user = auth.mode === 'user' ? auth.user : null;
  const existing = request.cookies.get(COOKIE)?.value;
  const actor = user
    ? `github:${user.id}`
    : z.string().uuid().safeParse(existing).success
      ? existing!
      : randomUUID();
  const respond = (data: unknown, status = 200) => {
    const response = NextResponse.json(data, {
      status,
      headers: { 'Cache-Control': 'no-store', ...(status === 429 ? { 'Retry-After': '60' } : {}) },
    });
    if (!user)
      response.cookies.set(COOKIE, actor, {
        httpOnly: true,
        sameSite: 'strict',
        secure: request.nextUrl.protocol === 'https:',
        path: '/',
        maxAge: 31536000,
      });
    return response;
  };
  try {
    if (request.method !== 'GET') {
      const origin = request.headers.get('origin');
      const expected = `${request.nextUrl.protocol}//${request.headers.get('host') ?? request.nextUrl.host}`;
      if ((origin && origin !== expected) || request.headers.get('sec-fetch-site') === 'cross-site')
        throw new DomainError(403, 'ORIGIN', 'Cross-origin writes are disabled.');
    }
    const store = suppliedStore ?? (await feedbackStore());
    if (request.method === 'GET' && path.join('/') === 'session')
      return respond({ storage: store.mode, user: user?.login ?? null });
    if (request.method === 'GET' && !path.length) {
      const query = request.nextUrl.searchParams;
      const search = (query.get('q') || '').slice(0, 120).toLowerCase();
      const status = query.get('status') || 'all';
      const category = query.get('category') || 'all';
      const priority = query.get('priority') || 'all';
      const offset = Math.max(0, Math.min(1000, Number(query.get('offset')) || 0));
      let records = (await store.list()).filter(
        ({ item }) =>
          (status === 'all' || item.status === status) &&
          (category === 'all' || item.category === category) &&
          (priority === 'all' || item.priority === priority) &&
          [item.title, item.description, item.author, item.assignee, item.target.label].some((v) =>
            v.toLowerCase().includes(search),
          ),
      );
      if (query.get('sort') === 'votes')
        records = records.sort((a, b) => b.item.voters.length - a.item.voters.length);
      const total = records.length;
      const items: FeedbackSummary[] = records
        .slice(offset, offset + 30)
        .map(({ item, hasImage }) => {
          const {
            comments,
            annotations: _annotations,
            target,
            ...rest
          } = publicItem(item, actor, hasImage);
          void _annotations;
          return {
            ...rest,
            target: { path: target.path, kind: target.kind, label: target.label },
            commentCount: comments.filter((x) => x.kind === 'comment').length,
          };
        });
      return respond({ items, total, offset, storage: store.mode });
    }
    if (path.length && !z.string().uuid().safeParse(path[0]).success)
      throw new DomainError(404, 'NOT_FOUND', 'Feedback item not found.');
    if (request.method === 'GET' && path.length === 1) {
      const { item, image } = await store.get(path[0]);
      return respond(publicItem(item, actor, !!image));
    }
    if (request.method === 'GET' && path.length === 2 && path[1] === 'image') {
      const { image } = await store.get(path[0]);
      if (!image) throw new DomainError(404, 'NO_IMAGE', 'No screenshot attached.');
      return new NextResponse(Buffer.from(image.split(',')[1], 'base64'), {
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'private, max-age=3600',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    await store.rateLimit(actor);
    const now = new Date().toISOString();
    if (request.method === 'POST' && !path.length) {
      const input = feedbackCreate.parse(await readBody(request));
      if (user) input.author = user.login;
      if (
        input.screenshot &&
        !Buffer.from(input.screenshot.split(',')[1], 'base64')
          .subarray(0, 3)
          .equals(Buffer.from([0xff, 0xd8, 0xff]))
      )
        throw new DomainError(400, 'INVALID_IMAGE', 'A JPEG screenshot is required.');
      const saved = await store.create(createFeedback(input, actor, now), input.screenshot);
      return respond(publicItem(saved.item, actor, !!saved.image), 201);
    }
    if (request.method === 'PATCH' && path.length === 1) {
      const input = feedbackPatch.parse(await readBody(request));
      if (user) input.author = user.login;
      const saved = await store.change(path[0], (item) => triageFeedback(item, input, now));
      return respond(publicItem(saved.item, actor, !!saved.image));
    }
    if (request.method === 'POST' && path.length === 2 && path[1] === 'comments') {
      const input = feedbackReply.parse(await readBody(request));
      if (user) input.author = user.login;
      const saved = await store.change(path[0], (item) => replyToFeedback(item, input, now));
      return respond(publicItem(saved.item, actor, !!saved.image));
    }
    if (request.method === 'PUT' && path.length === 2 && path[1] === 'vote') {
      const input = z
        .object({ voted: z.boolean() })
        .strict()
        .parse(await readBody(request));
      const saved = await store.change(path[0], (item) =>
        voteForFeedback(item, actor, input.voted, now),
      );
      return respond(publicItem(saved.item, actor, !!saved.image));
    }
    throw new DomainError(404, 'NOT_FOUND', 'Feedback route not found.');
  } catch (error) {
    if (error instanceof DomainError)
      return respond({ error: { code: error.code, message: error.message } }, error.status);
    if (error instanceof z.ZodError)
      return respond(
        {
          error: {
            code: 'VALIDATION',
            message: error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; '),
          },
        },
        400,
      );
    console.error(
      'Feedback storage request failed',
      error instanceof Error ? error.name : 'UnknownError',
    );
    return respond(
      {
        error: {
          code: 'STORAGE',
          message:
            'Feedback could not be saved or loaded. Your draft is still here; please try again.',
        },
      },
      503,
    );
  }
}
