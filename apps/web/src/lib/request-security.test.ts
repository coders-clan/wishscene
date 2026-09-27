import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isJsonRequest, isSameOriginWrite } from './request-security';

describe('request security', () => {
  it('accepts same-origin browser writes and JSON with a charset', () => {
    const request = new NextRequest('https://wishscene.test/api/feedback', {
      method: 'POST',
      headers: {
        host: 'wishscene.test',
        origin: 'https://wishscene.test',
        'sec-fetch-site': 'same-origin',
        'content-type': 'application/json; charset=utf-8',
      },
    });
    expect(isSameOriginWrite(request)).toBe(true);
    expect(isJsonRequest(request)).toBe(true);
  });

  it('rejects cross-site writes even when Origin is omitted', () => {
    const request = new NextRequest('https://wishscene.test/api/feedback', {
      method: 'POST',
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(isSameOriginWrite(request)).toBe(false);
  });

  it('does not accept lookalike JSON media types', () => {
    const request = new NextRequest('https://wishscene.test/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/jsonp' },
    });
    expect(isJsonRequest(request)).toBe(false);
  });
});
