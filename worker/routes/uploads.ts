import { requirePrincipal, type AuthEnv, type Principal } from '../auth';
import { getSessionAccess, sessionExpiryMillisSql } from '../db';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 12_000_000;
const NO_STORE = { 'Cache-Control': 'no-store, private', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff' };
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

export type UploadEnv = AuthEnv & { UPLOADS: R2Bucket };
export interface UploadRouteDependencies {
  /** Deterministic race seams for account/session changes around D1 writes. */
  beforeReserve?: () => Promise<void>;
  beforeStore?: () => Promise<void>;
  now?: () => number;
}

function fail(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: NO_STORE });
}
function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: NO_STORE });
}

function currentSessionSql(): string {
  return `EXISTS(SELECT 1 FROM app_accounts a
    JOIN session_metadata sm ON sm.owner_id=a.id
    JOIN session s ON s.id=sm.session_id AND s.userId=sm.owner_id
    WHERE a.id=? AND sm.session_id=? AND a.status='active' AND sm.revoked_at IS NULL
      AND sm.authenticated_at+2592000000>? AND sm.last_activity_at+1209600000>?
      AND (${sessionExpiryMillisSql})>?)`;
}

async function accessFailure(env: UploadEnv, principal: Principal): Promise<Response | null> {
  const result = await getSessionAccess(env.DB, principal.ownerId, principal.sessionId, Date.now());
  if (result.success) return null;
  const blocked = result.reason === 'blocked';
  return fail(blocked ? 403 : 401, blocked ? 'FORBIDDEN' : 'UNAUTHENTICATED', blocked ? 'Geen toegang.' : 'Log opnieuw in.');
}

function readU32(data: Uint8Array, offset: number): number {
  return ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const KNOWN_CHUNKS = new Set([
  'IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'cHRM', 'gAMA', 'iCCP', 'sBIT', 'sRGB',
  'bKGD', 'hIST', 'pHYs', 'tEXt', 'zTXt', 'iTXt',
]);
const KEPT_CHUNKS = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);
const APNG_CHUNKS = new Set(['acTL', 'fcTL', 'fdAT']);

/**
 * Checks PNG's bounded chunk envelope and CRCs, rejects animation/unknown chunks,
 * and removes ancillary metadata before storage. It intentionally does not claim
 * to decode or validate the zlib pixel stream; the browser canvas produces the
 * sanitized source image before this endpoint is called.
 */
export function sanitizePng(input: Uint8Array): { bytes: Uint8Array; width: number; height: number } | null {
  if (input.byteLength < 8 + 25 || !PNG_SIGNATURE.every((byte, index) => input[index] === byte)) return null;
  const retained: Uint8Array[] = [PNG_SIGNATURE];
  let offset = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = -1, seenIhdr = false, seenIdat = false, endedIdat = false, seenIend = false;
  let sawIdatChunk = false;
  let idatBytes = 0, seenPlte = false, seenTrns = false, paletteEntries = 0;
  let chunkCount = 0;
  while (offset < input.byteLength) {
    if (input.byteLength - offset < 12 || ++chunkCount > 4096) return null;
    const length = readU32(input, offset);
    const chunkEnd = offset + 12 + length;
    if (!Number.isSafeInteger(chunkEnd) || chunkEnd > input.byteLength) return null;
    const typeBytes = input.subarray(offset + 4, offset + 8);
    if ([...typeBytes].some(byte => !((byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122)))) return null;
    if (typeBytes[2] >= 97) return null; // PNG reserves this bit and requires an uppercase third letter.
    const type = String.fromCharCode(...typeBytes);
    if (APNG_CHUNKS.has(type) || !KNOWN_CHUNKS.has(type)) return null;
    if (crc32(input, offset + 4, chunkEnd - 4) !== readU32(input, chunkEnd - 4)) return null;
    if (seenIend) return null;

    if (!seenIhdr) {
      if (type !== 'IHDR' || length !== 13) return null;
      seenIhdr = true;
      width = readU32(input, offset + 8);
      height = readU32(input, offset + 12);
      bitDepth = input[offset + 16]; colorType = input[offset + 17];
      const validDepth = colorType === 0 ? [1, 2, 4, 8, 16].includes(bitDepth) :
        colorType === 2 ? [8, 16].includes(bitDepth) :
        colorType === 3 ? [1, 2, 4, 8].includes(bitDepth) :
        colorType === 4 || colorType === 6 ? [8, 16].includes(bitDepth) : false;
      if (!width || !height || width * height > MAX_PIXELS || !validDepth || input[offset + 18] !== 0 ||
          input[offset + 19] !== 0 || input[offset + 20] > 1) return null;
    } else if (type === 'IHDR') return null;

    if (type === 'PLTE') {
      if (seenPlte || seenIdat || length === 0 || length > 768 || length % 3 !== 0 || colorType === 0 || colorType === 4) return null;
      if (colorType === 3 && length / 3 > 2 ** bitDepth) return null;
      paletteEntries = length / 3;
      seenPlte = true;
    }
    if (type === 'tRNS') {
      if (seenTrns || seenIdat || (colorType === 3 && !seenPlte) || colorType === 4 || colorType === 6) return null;
      if ((colorType === 0 && length !== 2) || (colorType === 2 && length !== 6) ||
          (colorType === 3 && (length === 0 || length > paletteEntries))) return null;
      seenTrns = true;
    }
    if ((type === 'cHRM' && length !== 32) || (type === 'gAMA' && length !== 4) ||
        (type === 'sRGB' && length !== 1) || (type === 'pHYs' && length !== 9) ||
        (type === 'sBIT' && ![1, 2, 3, 4].includes(length)) ||
        (type === 'iCCP' && length < 3) || (type === 'bKGD' && length < 1) ||
        (type === 'hIST' && length % 2 !== 0) || (type === 'tEXt' && length < 1) ||
        (type === 'zTXt' && length < 3) || (type === 'iTXt' && length < 5)) return null;

    if (type === 'IDAT') {
      if (endedIdat || seenIend) return null;
      if (colorType === 3 && !seenPlte) return null;
      seenIdat = true;
      sawIdatChunk = true;
      idatBytes += length;
    } else if (sawIdatChunk && type !== 'IEND') endedIdat = true;

    if (type === 'IEND') {
      if (length !== 0 || !seenIdat || !idatBytes) return null;
      seenIend = true;
    }
    if (KEPT_CHUNKS.has(type)) retained.push(input.slice(offset, chunkEnd));
    offset = chunkEnd;
    if (seenIend && offset !== input.byteLength) return null;
  }
  if (!seenIhdr || !seenIdat || !seenIend) return null;
  const length = retained.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const bytes = new Uint8Array(length);
  let cursor = 0;
  for (const chunk of retained) { bytes.set(chunk, cursor); cursor += chunk.byteLength; }
  return { bytes, width, height };
}

async function reserve(env: UploadEnv, principal: Principal, id: string, key: string, byteSize: number, now: number): Promise<boolean> {
  const live = currentSessionSql();
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO user_upload_usage(owner_id)
      SELECT a.id FROM app_accounts a WHERE a.id=? AND a.status='active' AND ${live}
      ON CONFLICT(owner_id) DO NOTHING`).bind(principal.ownerId, principal.ownerId, principal.sessionId, now, now, now),
    env.DB.prepare(`INSERT INTO uploads(id,owner_id,object_key,media_type,byte_size,status,created_at)
      SELECT ?,a.id,?,'image/png',?,'reserved',? FROM app_accounts a
      WHERE a.id=? AND a.status='active' AND ${live}`)
      .bind(id, key, byteSize, now, principal.ownerId, principal.ownerId, principal.sessionId, now, now, now),
  ]);
  return (results[1]?.meta.changes ?? 0) > 0;
}

async function storeReservation(env: UploadEnv, principal: Principal, id: string, now: number): Promise<boolean> {
  const live = currentSessionSql();
  const result = await env.DB.prepare(`UPDATE uploads SET status='stored' WHERE owner_id=? AND id=? AND status='reserved'
    AND EXISTS(SELECT 1 FROM app_accounts a WHERE a.id=uploads.owner_id AND a.status='active') AND ${live}`)
    .bind(principal.ownerId, id, principal.ownerId, principal.sessionId, now, now, now).run();
  return result.meta.changes > 0;
}

async function markReservationDeleted(env: UploadEnv, ownerId: string, id: string, now: number): Promise<void> {
  try {
    await env.DB.batch([
      env.DB.prepare(`UPDATE uploads SET status='deleted',deleted_at=? WHERE owner_id=? AND id=? AND status='reserved'`)
        .bind(now, ownerId, id),
      env.DB.prepare(`UPDATE uploads SET status='deleting' WHERE owner_id=? AND id=? AND status='stored'`)
        .bind(ownerId, id),
      env.DB.prepare(`UPDATE uploads SET status='deleted',deleted_at=? WHERE owner_id=? AND id=? AND status='deleting'`)
        .bind(now, ownerId, id),
    ]);
  } catch { /* maintenance reaps a remaining reservation if D1 is unavailable */ }
}

async function removePartialObject(env: UploadEnv, key: string, ownerId: string, id: string, now: number): Promise<void> {
  try {
    await env.UPLOADS.delete(key);
    await markReservationDeleted(env, ownerId, id, now);
  } catch { /* keep the reserved row so scheduled maintenance can retry R2 cleanup */ }
}

async function upload(request: Request, env: UploadEnv, principal: Principal, deps: UploadRouteDependencies): Promise<Response> {
  if (request.headers.get('Origin') !== env.APP_ORIGIN) return fail(403, 'ORIGIN_DENIED', 'Dit verzoek is niet toegestaan.');
  if (request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'image/png') {
    return fail(415, 'INVALID_CONTENT_TYPE', 'Upload een PNG-afbeelding.');
  }
  const contentLength = request.headers.get('Content-Length');
  if (contentLength !== null && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_BYTES) {
    try { await request.body?.cancel(); } catch { /* already consumed */ }
    return fail(413, 'UPLOAD_TOO_LARGE', 'De afbeelding is groter dan 8 MB.');
  }
  let body: Uint8Array;
  try {
    const raw = new Uint8Array(await request.arrayBuffer());
    if (raw.byteLength > MAX_BYTES) return fail(413, 'UPLOAD_TOO_LARGE', 'De afbeelding is groter dan 8 MB.');
    body = raw;
  } catch { return fail(400, 'INVALID_IMAGE', 'Deze PNG-afbeelding is ongeldig.'); }
  const png = sanitizePng(body);
  if (!png) return fail(400, 'INVALID_IMAGE', 'Deze PNG-afbeelding is ongeldig of wordt niet ondersteund.');
  if (png.bytes.byteLength > MAX_BYTES) return fail(413, 'UPLOAD_TOO_LARGE', 'De afbeelding is groter dan 8 MB.');

  const now = (deps.now ?? Date.now)();
  const id = crypto.randomUUID();
  const key = `private/accounts/${principal.ownerId}/uploads/${id}`;
  try {
    await deps.beforeReserve?.();
    if (!await reserve(env, principal, id, key, png.bytes.byteLength, now)) {
      return await accessFailure(env, principal) ?? fail(409, 'UPLOAD_CREATE_FAILED', 'De upload kon niet worden aangemaakt.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('upload_quota_exceeded')) return fail(413, 'UPLOAD_QUOTA_EXCEEDED', 'De beschikbare opslagruimte is bereikt.');
    return fail(409, 'UPLOAD_CREATE_FAILED', 'De upload kon niet worden aangemaakt.');
  }

  try {
    await env.UPLOADS.put(key, png.bytes, { httpMetadata: { contentType: 'image/png' } });
    await deps.beforeStore?.();
    if (!await storeReservation(env, principal, id, (deps.now ?? Date.now)())) {
      await removePartialObject(env, key, principal.ownerId, id, (deps.now ?? Date.now)());
      return await accessFailure(env, principal) ?? fail(409, 'UPLOAD_CREATE_FAILED', 'De upload kon niet worden aangemaakt.');
    }
  } catch {
    await removePartialObject(env, key, principal.ownerId, id, (deps.now ?? Date.now)());
    return fail(503, 'UPLOAD_STORAGE_UNAVAILABLE', 'De afbeelding kon niet worden opgeslagen. Probeer het later opnieuw.');
  }
  return json({ upload: { id, mediaType: 'image/png', byteSize: png.bytes.byteLength, createdAt: now } }, 201);
}

async function getUpload(env: UploadEnv, principal: Principal, id: string): Promise<Response> {
  const row = await env.DB.prepare(`SELECT object_key AS objectKey,byte_size AS byteSize FROM uploads
    WHERE id=? AND owner_id=? AND media_type='image/png' AND status='stored'`)
    .bind(id, principal.ownerId).first<{ objectKey: string; byteSize: number }>();
  if (!row) return fail(404, 'NOT_FOUND', 'Niet gevonden.');
  const object = await env.UPLOADS.get(row.objectKey);
  if (!object) return fail(404, 'NOT_FOUND', 'Niet gevonden.');
  const headers = new Headers(NO_STORE);
  headers.set('Content-Type', 'image/png');
  headers.set('Content-Length', String(row.byteSize));
  headers.set('Content-Disposition', 'inline; filename="image.png"');
  return new Response(object.body, { headers });
}

/** Returns null for paths owned by another route module. */
export async function handleUploads(request: Request, env: UploadEnv, deps: UploadRouteDependencies = {}): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== '/api/uploads' && !/^\/api\/uploads\/[^/]+$/.test(path)) return null;
  const principal = await requirePrincipal(request, env);
  if (!principal) return fail(401, 'UNAUTHENTICATED', 'Log opnieuw in.');
  if (path === '/api/uploads') {
    if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Deze handeling is niet beschikbaar.');
    return upload(request, env, principal, deps);
  }
  if (request.method !== 'GET') return fail(405, 'METHOD_NOT_ALLOWED', 'Deze handeling is niet beschikbaar.');
  let id: string;
  try { id = decodeURIComponent(path.slice('/api/uploads/'.length)); }
  catch { return fail(400, 'INVALID_ID', 'Ongeldige afbeeldingsverwijzing.'); }
  return getUpload(env, principal, id);
}
