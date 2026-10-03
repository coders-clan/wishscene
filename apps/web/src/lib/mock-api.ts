import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  approvalInput,
  demoSignInInput,
  demoVerifyInput,
  experienceInput,
  generationInput,
  packUpdate,
  storyUpdate,
  socialUpdate,
} from '@wishscene/contracts';
import { DomainError, type MockStudio } from '@wishscene/domain';
import { withWorkspace } from './workspace-store';
import { jsonBody as body } from './json-body';
import { isSameOriginWrite } from './request-security';

const COOKIE = 'wishscene-demo';
export async function dispatch(request: NextRequest, path: string[]) {
  if (process.env.NODE_ENV === 'production' && process.env.WISHSCENE_MOCK !== '1')
    return NextResponse.json(
      {
        error: {
          code: 'MOCK_DISABLED',
        },
      },
      { status: 503 },
    );
  // hunch-why: Next can construct an internal URL with the bind address (0.0.0.0). Compare browser Origin against the request Host and protocol, or valid local mutations are incorrectly rejected. Do not trust forwarded-host headers here.
  if (request.method !== 'GET' && !isSameOriginWrite(request))
    return NextResponse.json({ error: { code: 'ORIGIN' } }, { status: 403 });
  try {
    const saved = await withWorkspace(request.cookies.get(COOKIE)?.value, (studio) =>
      route(request, path, studio),
    );
    const response = NextResponse.json(saved.value.result, {
      status: saved.value.status,
      headers: { 'Cache-Control': 'no-store', 'X-Wishscene-Mode': 'mock' },
    });
    response.cookies.set(COOKIE, saved.sessionId, {
      httpOnly: true,
      sameSite: 'strict',
      secure: request.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: saved.maxAge,
    });
    return response;
  } catch (error) {
    const status = error instanceof DomainError ? error.status : 503;
    const code = error instanceof DomainError ? error.code : 'STORAGE';
    return NextResponse.json(
      { error: { code } },
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
async function route(request: NextRequest, path: string[], studio: MockStudio) {
  let result: unknown;
  let status = 200;
  try {
    const route = path.join('/');
    if (request.method === 'GET' && route === 'workspace') result = studio.snapshot();
    else if (request.method === 'POST' && route === 'mock/reset') result = studio.reset();
    // Emulated magic-link sign-in. Only the mock dispatcher routes demo/*, so product mode never exposes it.
    else if (request.method === 'POST' && route === 'demo/auth/magic-link')
      result = studio.requestDemoLink(demoSignInInput.parse(await body(request)).email);
    else if (request.method === 'POST' && route === 'demo/auth/verify')
      result = studio.verifyDemoLink(demoVerifyInput.parse(await body(request)).token);
    else if (request.method === 'POST' && route === 'demo/auth/sign-out')
      result = studio.signOutDemo();
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
      path.length === 3 &&
      path[0] === 'experiences' &&
      path[2] === 'pack'
    ) {
      result = studio.updatePack(path[1], packUpdate.parse(await body(request)));
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
        },
      };
    } else if (error instanceof DomainError) {
      status = error.status;
      result = { error: { code: error.code } };
    } else {
      status = 500;
      result = {
        error: { code: 'INTERNAL' },
      };
      console.error(error);
    }
  }
  return { result, status };
}
