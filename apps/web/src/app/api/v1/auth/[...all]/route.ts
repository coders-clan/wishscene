import { NextResponse, type NextRequest } from 'next/server';
import { DomainError } from '@wishscene/domain';
import { productMode } from '@/lib/product/mode';
import { log } from '@/lib/product/log';
import { noStore } from '@/lib/request-security';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: NextRequest) {
  if (!productMode())
    return NextResponse.json(
      { error: { code: 'PRODUCT_DISABLED' } },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  try {
    const { productRuntime } = await import('@/lib/product/runtime');
    const response = await productRuntime().auth.handler(request);
    // Copy so headers are mutable even for redirect responses.
    return noStore(new Response(response.body, response));
  } catch (error) {
    if (error instanceof DomainError)
      return NextResponse.json(
        { error: { code: error.code } },
        { status: error.status, headers: { 'Cache-Control': 'no-store' } },
      );
    log('error', 'auth route failure', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL' } },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
export { handle as GET, handle as POST };
