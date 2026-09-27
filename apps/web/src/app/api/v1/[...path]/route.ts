import type { NextRequest } from 'next/server';
import { dispatch } from '@/lib/mock-api';
import { requireUser } from '@/lib/auth/session';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
async function handle(request: NextRequest, context: Context) {
  const auth = requireUser(request);
  if ('response' in auth) return auth.response;
  return dispatch(request, (await context.params).path);
}
export { handle as GET, handle as POST, handle as PATCH };
