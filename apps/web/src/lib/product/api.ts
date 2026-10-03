import { randomUUID } from 'node:crypto';
import { isAPIError } from 'better-auth/api';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { experienceInput, generationInput, storyUpdate } from '@wishscene/contracts';
import { ownerStore, transientDbErrorCode, type OwnerStore } from '@wishscene/db';
import { DomainError } from '@wishscene/domain';
import { MAX_UPLOAD_BYTES, UPLOAD_CONTENT_TYPES, objectKey } from '@wishscene/storage';
import { jsonBody } from '../json-body';
import { isJsonRequest, isSameOriginWrite } from '../request-security';
import { log } from './log';
import { productRuntime, type ProductRuntime } from './runtime';

const versionInput = z.object({ expectedVersion: z.number().int().positive() }).strict();
const emptyInput = z.object({}).strict();
const uploadInput = z
  .object({
    contentType: z.enum(UPLOAD_CONTENT_TYPES),
    byteSize: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  })
  .strict();

type Result = { status: number; body: unknown };
type Handler = (
  request: NextRequest,
  params: string[],
  store: OwnerStore,
  runtime: ProductRuntime,
) => Promise<Result>;
const ok = (body: unknown, status = 200): Result => ({ status, body });

// Route templates double as log labels, so ids never reach the logs.
const routes: Array<[method: string, template: string, handler: Handler]> = [
  [
    'GET',
    'experiences',
    async (_r, _p, store) => ok({ experiences: await store.listExperiences() }),
  ],
  [
    'POST',
    'experiences',
    async (request, _p, store) =>
      ok(await store.createExperience(experienceInput.parse(await jsonBody(request))), 201),
  ],
  ['GET', 'experiences/:id', async (_r, [id], store) => ok(await store.getExperience(id))],
  [
    'PATCH',
    'experiences/:id/bible',
    async (request, [id], store) =>
      ok(await store.editBible(id, storyUpdate.parse(await jsonBody(request)))),
  ],
  [
    'POST',
    'experiences/:id/scenes/:id/generations',
    async (request, [id, sceneId], store) => {
      const input = generationInput.parse(await jsonBody(request));
      return ok(await store.requestGeneration(id, sceneId, input.requestKey), 202);
    },
  ],
  [
    'POST',
    'experiences/:id/exports',
    async (request, [id], store) => {
      const input = versionInput.parse(await jsonBody(request));
      return ok(await store.createExport(id, input.expectedVersion), 202);
    },
  ],
  ['GET', 'jobs/:id', async (_r, [id], store) => ok({ job: await store.getJob(id) })],
  [
    'POST',
    'jobs/:id/cancel',
    async (request, [id], store) => {
      emptyInput.parse(await jsonBody(request));
      return ok({ job: await store.cancelJob(id) });
    },
  ],
  [
    'POST',
    'assets/:id/approve',
    async (request, [id], store) => {
      const input = versionInput.parse(await jsonBody(request));
      return ok(await store.approveAsset(id, input.expectedVersion));
    },
  ],
  [
    'GET',
    'assets/:id/download',
    async (_r, [id], store, { assets }) => {
      const asset = await store.assetForDownload(id);
      return ok({ url: await assets.presignDownload({ key: asset.objectKey }) });
    },
  ],
  [
    'POST',
    'uploads/init',
    async (request, _p, store, { assets }) => {
      const input = uploadInput.parse(await jsonBody(request));
      const key = objectKey();
      // Sign first: a signing failure must not count against the hourly upload quota.
      const policy = await assets.presignUpload({
        key,
        contentType: input.contentType,
        maxBytes: input.byteSize,
      });
      const upload = await store.initUpload({ ...input, objectKey: key });
      return ok({ upload, policy }, 201);
    },
  ],
  [
    'POST',
    'uploads/:id/complete',
    async (request, [id], store, { assets }) => {
      emptyInput.parse(await jsonBody(request));
      const key = await store.uploadObjectKey(id);
      try {
        return ok(await store.completeUpload(id, await assets.head(key)));
      } catch (error) {
        if (
          error instanceof DomainError &&
          (error.code === 'UPLOAD_REJECTED' || error.code === 'UPLOAD_EXPIRED')
        )
          await assets.delete(key).catch(() => undefined);
        throw error;
      }
    },
  ],
];

function match(method: string, path: string[]) {
  for (const [routeMethod, template, handler] of routes) {
    const parts = template.split('/');
    if (routeMethod !== method || parts.length !== path.length) continue;
    const params: string[] = [];
    if (parts.every((part, i) => (part === ':id' ? params.push(path[i]) : part === path[i])))
      return { template, handler, params };
  }
  return null;
}

function reply(requestId: string, status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId },
  });
}
const failure = (requestId: string, status: number, code: string, message: string) => {
  void message; // Internal call-site diagnostic; user-facing errors are localized from codes.
  return reply(requestId, status, { error: { code, requestId } });
};

// better-call's kAPIErrorHeaderSymbol: the headers an endpoint had set before it threw.
const API_ERROR_HEADERS = Symbol.for('better-call:api-error-headers');

/**
 * The session and the cookies Better Auth set while reading it. A session that disappears while
 * being extended throws 401 with a cleared cookie; that reads as signed out, cookie included.
 */
async function readSession(runtime: ProductRuntime, request: NextRequest) {
  try {
    const { headers, response } = await runtime.auth.api.getSession({
      headers: request.headers,
      returnHeaders: true,
    });
    return { session: response, cookies: headers.getSetCookie() };
  } catch (error) {
    if (!isAPIError(error) || error.statusCode !== 401) throw error;
    const headers = (error as { [API_ERROR_HEADERS]?: unknown })[API_ERROR_HEADERS];
    return { session: null, cookies: headers instanceof Headers ? headers.getSetCookie() : [] };
  }
}

/** Product API behind WISHSCENE_PRODUCT=1. Every call is owner-scoped by the session user. */
export async function productDispatch(
  request: NextRequest,
  path: string[],
  runtime?: ProductRuntime,
) {
  const requestId = randomUUID();
  const started = Date.now();
  const route = match(request.method, path);
  const label = route ? `${request.method} ${route.template}` : `${request.method} (unmatched)`;
  let response: NextResponse;
  // A session past its update age is extended; its new cookie must reach the browser.
  let sessionCookies: string[] = [];
  try {
    const write = request.method !== 'GET';
    if (write && !isSameOriginWrite(request))
      response = failure(requestId, 403, 'ORIGIN', 'Cross-origin writes are disabled.');
    // Every write carries a JSON body, which an HTML form cannot send.
    else if (write && !isJsonRequest(request))
      response = failure(requestId, 415, 'JSON_REQUIRED', 'Send application/json.');
    else {
      const resolved = runtime ?? productRuntime();
      const { session, cookies } = await readSession(resolved, request);
      // A deleted account's session is never extended in the browser, and reading it may have
      // extended the row, so its sessions are revoked.
      if (session?.user.deletedAt)
        await resolved.prisma.session.deleteMany({ where: { userId: session.user.id } });
      else sessionCookies = cookies;
      if (!session || session.user.deletedAt)
        response = failure(requestId, 401, 'UNAUTHENTICATED', 'Sign in to continue.');
      else if (!route) response = failure(requestId, 404, 'NOT_FOUND', 'API route not found.');
      else {
        const store = ownerStore(resolved.prisma, session.user.id);
        const result = await route.handler(request, route.params, store, resolved);
        response = reply(requestId, result.status, result.body);
      }
    }
  } catch (error) {
    const busy = transientDbErrorCode(error);
    if (error instanceof z.ZodError)
      response = failure(
        requestId,
        400,
        'VALIDATION',
        error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
      );
    else if (error instanceof DomainError)
      response = failure(requestId, error.status, error.code, error.message);
    else if (busy) {
      // P2028 also covers misuse of a closed transaction, so a steady stream here is a bug.
      log('warn', 'product api busy', { requestId, route: label, code: busy });
      response = failure(requestId, 503, 'TRY_AGAIN', 'The service is busy. Try again.');
      response.headers.set('Retry-After', '1');
    } else {
      log('error', 'product api failure', { requestId, route: label, error });
      response = failure(requestId, 500, 'INTERNAL', 'The request could not be completed.');
    }
  }
  for (const cookie of sessionCookies) response.headers.append('Set-Cookie', cookie);
  log('info', 'product api', {
    requestId,
    route: label,
    status: response.status,
    ms: Date.now() - started,
  });
  return response;
}
