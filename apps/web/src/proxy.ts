import { NextRequest, NextResponse } from 'next/server';
import { authMode, readSession } from './lib/auth/session';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === '/login' || pathname.startsWith('/api/auth/')) return NextResponse.next();
  const mode = authMode();
  if (mode.mode === 'open') return NextResponse.next();
  if (mode.mode === 'misconfigured') {
    if (pathname.startsWith('/api/'))
      return NextResponse.json(
        { error: { code: 'AUTH_CONFIG', message: 'Sign-in is not configured.' } },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    return new NextResponse('Sign-in is not configured.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
    });
  }
  if (readSession(request)) return NextResponse.next();
  if (pathname.startsWith('/api/'))
    return NextResponse.json(
      { error: { code: 'AUTH_REQUIRED', message: 'Sign in with GitHub to continue.' } },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  const next = encodeURIComponent(`${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(new URL(`/login?next=${next}`, request.nextUrl.origin), 307);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
