import { describe, expect, it } from 'vitest';
import { boundedRequest, privateApiResponse } from './http';

function streamingRequest(chunks: Uint8Array[], headers?: HeadersInit) {
  return new Request('https://picnic.test/api/auth/example', {
    method: 'POST', headers,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
  });
}

describe('HTTP ingress and private responses', () => {
  it('limits actual streamed bytes even with an understated Content-Length', async () => {
    const result = await boundedRequest(streamingRequest([
      new Uint8Array(4), new Uint8Array(5),
    ], { 'Content-Length': '1' }), 8);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(413);
  });

  it('counts UTF-8 bytes, preserves accepted JSON and request headers', async () => {
    const body = JSON.stringify({ name: 'één' });
    const bytes = new TextEncoder().encode(body);
    const rejected = await boundedRequest(streamingRequest([bytes]), body.length);
    expect((rejected as Response).status).toBe(413);
    const accepted = await boundedRequest(streamingRequest([bytes.slice(0, 4), bytes.slice(4)], {
      'Content-Type': 'application/json', Origin: 'https://picnic.test', Cookie: 'session=example',
    }), bytes.byteLength);
    expect(accepted).toBeInstanceOf(Request);
    expect(await accepted.json()).toEqual({ name: 'één' });
    expect(accepted.headers.get('cookie')).toBe('session=example');
    expect(accepted.headers.get('origin')).toBe('https://picnic.test');
  });

  it('preserves every session cookie while prohibiting cache storage', () => {
    const headers = new Headers({ 'Cache-Control': 'public' });
    headers.append('Set-Cookie', 'one=1; HttpOnly; Path=/');
    headers.append('Set-Cookie', 'two=2; HttpOnly; Path=/');
    const result = privateApiResponse(new Response(null, { status: 204, headers }));
    expect(result.status).toBe(204);
    expect(result.headers.getSetCookie()).toEqual(headers.getSetCookie());
    expect(result.headers.get('cache-control')).toBe('no-store, private');
    expect(result.headers.get('x-content-type-options')).toBe('nosniff');
    expect(result.headers.get('referrer-policy')).toBe('no-referrer');
  });
});
