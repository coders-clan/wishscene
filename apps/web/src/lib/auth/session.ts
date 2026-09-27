import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { configuredAppOrigin } from '../request-security';

export const SESSION_COOKIE = 'wishscene-session';
export const OAUTH_COOKIE = 'wishscene-oauth';
const SESSION_MAX_AGE = 604800; // 7 days, seconds

export type SessionUser = { id: number; login: string; name: string | null; avatarUrl: string };

export type AuthMode =
  | { mode: 'open' }
  | { mode: 'misconfigured' }
  | { mode: 'required'; clientId: string; clientSecret: string; secret: string };

export function authMode(): AuthMode {
  const clientId = process.env.WISHSCENE_GITHUB_CLIENT_ID;
  if (clientId) {
    const clientSecret = process.env.WISHSCENE_GITHUB_CLIENT_SECRET;
    const secret = process.env.WISHSCENE_SESSION_SECRET;
    const configuredOrigin = configuredAppOrigin();
    const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    const hasVercelOrigin =
      !!process.env.VERCEL && !!vercelProduction && /^[a-z0-9.-]+$/i.test(vercelProduction);
    if (
      clientId.length < 10 ||
      !clientSecret ||
      clientSecret.length < 20 ||
      !secret ||
      secret.length < 32 ||
      configuredOrigin === null ||
      ((process.env.VERCEL || process.env.RENDER) && !configuredOrigin && !hasVercelOrigin)
    )
      return { mode: 'misconfigured' };
    return { mode: 'required', clientId, clientSecret, secret };
  }
  return process.env.VERCEL || process.env.RENDER ? { mode: 'misconfigured' } : { mode: 'open' };
}

export function seal(payload: object, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function unseal(token: string, secret: string): unknown {
  if (!token || token.length > 4096) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const signature = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(createHmac('sha256', secret).update(body).digest('base64url'));
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

const sessionPayload = z.object({
  v: z.literal(1),
  kind: z.literal('session'),
  id: z.number().int().positive(),
  login: z
    .string()
    .min(1)
    .max(39)
    .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/),
  name: z.string().max(100).nullable(),
  avatarUrl: z
    .string()
    .url()
    .refine((value) => new URL(value).protocol === 'https:'),
  iat: z.number().int(),
  exp: z.number().int(),
});

function parseSessionToken(token: string | undefined, secret: string): SessionUser | null {
  if (!token) return null;
  const parsed = sessionPayload.safeParse(unseal(token, secret));
  const now = Date.now();
  if (
    !parsed.success ||
    parsed.data.exp <= now ||
    parsed.data.iat > now + 60_000 ||
    parsed.data.exp - parsed.data.iat > SESSION_MAX_AGE * 1000
  )
    return null;
  const { id, login, name, avatarUrl } = parsed.data;
  return { id, login, name, avatarUrl };
}

export function readSession(request: NextRequest): SessionUser | null {
  const mode = authMode();
  if (mode.mode !== 'required') return null;
  return parseSessionToken(request.cookies.get(SESSION_COOKIE)?.value, mode.secret);
}

// For server components reading via next/headers `cookies()` instead of a NextRequest.
export function readSessionToken(token: string | undefined): SessionUser | null {
  const mode = authMode();
  if (mode.mode !== 'required') return null;
  return parseSessionToken(token, mode.secret);
}

function sessionCookieOptions(request: NextRequest) {
  return {
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:' || !!process.env.VERCEL || !!process.env.RENDER,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE,
  };
}

export function setSessionCookie(
  response: NextResponse,
  request: NextRequest,
  user: SessionUser,
  secret: string,
) {
  const now = Date.now();
  const token = seal(
    {
      v: 1,
      kind: 'session',
      ...user,
      iat: now,
      exp: now + SESSION_MAX_AGE * 1000,
    },
    secret,
  );
  response.cookies.set(SESSION_COOKIE, token, {
    ...sessionCookieOptions(request),
    priority: 'high',
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export type RequireUserResult =
  | { mode: 'open' }
  | { mode: 'user'; user: SessionUser }
  | { response: NextResponse };

export function requireUser(request: NextRequest): RequireUserResult {
  const mode = authMode();
  if (mode.mode === 'open') return { mode: 'open' };
  if (mode.mode === 'misconfigured')
    return {
      response: NextResponse.json(
        { error: { code: 'AUTH_CONFIG', message: 'Sign-in is not configured.' } },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      ),
    };
  const user = readSession(request);
  if (!user)
    return {
      response: NextResponse.json(
        { error: { code: 'AUTH_REQUIRED', message: 'Sign in with GitHub to continue.' } },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      ),
    };
  return { mode: 'user', user };
}

export function safeNext(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 512) return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  if (
    value.includes('\\') ||
    [...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    return '/';
  try {
    const url = new URL(value, 'http://x');
    if (url.origin !== 'http://x') return '/';
    // Validate the normalized result: dot segments can collapse '/..//host' into '//host'.
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (next.length > 512 || !next.startsWith('/') || next.startsWith('//')) return '/';
    const lowerPath = url.pathname.toLowerCase();
    if (lowerPath.startsWith('/api/auth') || lowerPath.startsWith('/login')) return '/';
    return next;
  } catch {
    return '/';
  }
}
