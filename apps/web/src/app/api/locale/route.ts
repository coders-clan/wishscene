import { NextRequest, NextResponse } from 'next/server';
import { localeCookie, supportedLocales } from '@/i18n/locales';
import { isJsonRequest, isSameOriginWrite, noStore } from '@/lib/request-security';

export async function POST(request: NextRequest) {
  if (!isSameOriginWrite(request))
    return noStore(NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 }));
  if (!isJsonRequest(request))
    return noStore(NextResponse.json({ error: 'INVALID_CONTENT_TYPE' }, { status: 415 }));
  let locale: unknown;
  try {
    locale = (await request.json())?.locale;
  } catch {
    /* Invalid JSON is rejected below. */
  }
  if (!supportedLocales.some((supported) => supported === locale)) {
    return noStore(NextResponse.json({ error: 'INVALID_LOCALE' }, { status: 400 }));
  }
  const response = noStore(NextResponse.json({ locale }));
  response.cookies.set(localeCookie, String(locale), {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
