import { NextRequest } from 'next/server';
import { feedbackDispatch } from '../../../../lib/feedback/api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return feedbackDispatch(request, (await context.params).path ?? []);
}
export { handle as GET, handle as POST, handle as PATCH, handle as PUT };
