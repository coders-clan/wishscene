import type { NextRequest } from 'next/server';

export function configuredAppOrigin(): string | null | undefined {
  const value = process.env.WISHSCENE_PUBLIC_ORIGIN?.trim();
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      return null;
    if ((process.env.VERCEL || process.env.RENDER) && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function appOrigin(request: NextRequest) {
  const configured = configuredAppOrigin();
  if (configured) return configured;
  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (process.env.VERCEL && vercelProduction && /^[a-z0-9.-]+$/i.test(vercelProduction))
    return `https://${vercelProduction}`;
  return request.nextUrl.origin;
}

export function isSameOriginWrite(request: NextRequest) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const host = request.headers.get('host') ?? request.nextUrl.host;
  return origin === `${request.nextUrl.protocol}//${host}`;
}

export function isJsonRequest(request: NextRequest) {
  return (
    request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ===
    'application/json'
  );
}

export function noStore<T extends Response>(response: T): T {
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  response.headers.set('Pragma', 'no-cache');
  return response;
}
