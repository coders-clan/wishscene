import type { NextRequest } from 'next/server';
import { DomainError } from '@wishscene/domain';
import { isJsonRequest } from './request-security';

/** Reads a JSON request body of at most 16 KiB. */
export async function jsonBody(request: NextRequest) {
  if (!isJsonRequest(request))
    throw new DomainError(415, 'JSON_REQUIRED', 'Send application/json.');
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError(400, 'INVALID_JSON', 'A JSON body is required.');
  let size = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) {
      await reader.cancel();
      throw new DomainError(413, 'BODY_TOO_LARGE', 'Request body exceeds 16 KiB.');
    }
    parts.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch {
    throw new DomainError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
  }
}
