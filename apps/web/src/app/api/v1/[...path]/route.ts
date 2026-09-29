import type { NextRequest } from 'next/server';
import { dispatch } from '@/lib/mock-api';
import { productMode } from '@/lib/product/mode';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
// Mock stays the default; WISHSCENE_PRODUCT=1 switches /api/v1/* to the owner-scoped product API.
// The product modules load lazily so the mock deployment never initializes Prisma or Better Auth.
async function handle(request: NextRequest, context: Context) {
  const path = (await context.params).path;
  if (!productMode()) return dispatch(request, path);
  const { productDispatch } = await import('@/lib/product/api');
  return productDispatch(request, path);
}
export { handle as GET, handle as POST, handle as PATCH };
