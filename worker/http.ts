/** Read at most the route's byte allowance, including chunked bodies. */
export async function boundedRequest(request: Request, maxBytes: number): Promise<Request | Response> {
  if (!request.body) return request;
  const tooLarge = () => Response.json({
    error: { code: 'BODY_TOO_LARGE', message: 'Dit verzoek is te groot.' },
  }, { status: 413 });
  const declared = request.headers.get('content-length');
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    await request.body.cancel();
    return tooLarge();
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        return tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  return new Request(request.url, {
    method: request.method, headers, body: bytes, redirect: request.redirect,
    signal: request.signal,
  });
}

export function privateApiResponse(response: Response): Response {
  const result = new Response(response.body, response);
  result.headers.set('Cache-Control', 'no-store, private');
  result.headers.set('X-Content-Type-Options', 'nosniff');
  result.headers.set('Referrer-Policy', 'no-referrer');
  return result;
}
