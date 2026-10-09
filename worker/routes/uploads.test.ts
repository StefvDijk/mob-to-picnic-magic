import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { bootstrapAdmin, revokeSession } from '../db';
import { handleAuth, requirePrincipal, type AuthEnv } from '../auth';
import { handleUploads, sanitizePng, type UploadEnv } from './uploads';

const baseEnv: AuthEnv = {
  DB: env.DB, APP_ORIGIN: 'https://picnic.test', APP_ENV: 'test',
  AUTH_SECRET: 'test-auth-secret-of-at-least-thirty-two-bytes',
  OTP_HMAC_SECRET: 'test-otp-secret-of-at-least-thirty-two-bytes',
  EMAIL_ADDRESS_HMAC_SECRET: 'test-address-secret-of-at-least-thirty-two-bytes',
};
const testEnv = { ...baseEnv, UPLOADS: env.UPLOADS } as UploadEnv;
const emails: { to: string; subject: string; text: string }[] = [];
const mail = { sendEmail: async (message: typeof emails[number]) => { emails.push(message); } };
let ownerId = '';
let ownerCookie = '';
let otherId = '';
let otherCookie = '';

function request(path: string, method: string, cookie?: string, body?: Uint8Array): Request {
  const headers: Record<string, string> = { Origin: baseEnv.APP_ORIGIN, 'CF-Connecting-IP': `192.0.2.${Math.floor(Math.random() * 200) + 1}` };
  if (cookie) headers.Cookie = cookie;
  if (body) headers['Content-Type'] = 'image/png';
  return new Request(`${baseEnv.APP_ORIGIN}${path}`, { method, headers, body });
}

async function signIn(email: string): Promise<string> {
  const sendRequest = new Request(`${baseEnv.APP_ORIGIN}/api/auth/email-otp/send-verification-otp`, {
    method: 'POST', headers: { Origin: baseEnv.APP_ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': `192.0.2.${Math.floor(Math.random() * 200) + 1}` },
    body: JSON.stringify({ email, type: 'sign-in' }),
  });
  await handleAuth(sendRequest, testEnv, mail);
  const otp = emails.at(-1)?.text.match(/\b\d{6}\b/)?.[0];
  expect(otp).toBeTruthy();
  const response = await handleAuth(new Request(`${baseEnv.APP_ORIGIN}/api/auth/sign-in/email-otp`, {
    method: 'POST', headers: { Origin: baseEnv.APP_ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': `192.0.2.${Math.floor(Math.random() * 200) + 1}` },
    body: JSON.stringify({ email, otp }),
  }), testEnv, mail);
  const cookie = response?.headers.get('Set-Cookie')?.split(';', 1)[0];
  expect(cookie).toBeTruthy();
  return cookie!;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u32(value: number): Uint8Array { return new Uint8Array([value >>> 24, value >>> 16, value >>> 8, value]); }
function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const content = new Uint8Array(typeBytes.length + data.length);
  content.set(typeBytes); content.set(data, typeBytes.length);
  const result = new Uint8Array(data.length + 12);
  result.set(u32(data.length)); result.set(content, 4); result.set(u32(crc32(content)), data.length + 8);
  return result;
}
function png(width = 1, height = 1, extras: Uint8Array[] = [], colorType = 2, bitDepth = 8): Uint8Array {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  ihdr.set(u32(width)); ihdr.set(u32(height), 4); ihdr.set([bitDepth, colorType, 0, 0, 0], 8);
  const chunks = [chunk('IHDR', ihdr), ...extras, chunk('IDAT', new Uint8Array([1, 2, 3])), chunk('IEND', new Uint8Array())];
  const output = new Uint8Array(signature.length + chunks.reduce((sum, value) => sum + value.length, 0));
  output.set(signature);
  let offset = signature.length;
  for (const value of chunks) { output.set(value, offset); offset += value.length; }
  return output;
}

beforeAll(async () => {
  const db = env.DB;
  const migrationEnv = env as typeof env & { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] };
  if (!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_accounts'").first()) {
    await applyD1Migrations(db, migrationEnv.TEST_MIGRATIONS);
  }
  let admin = await db.prepare(`SELECT id,email FROM app_accounts WHERE role='admin' AND status='active' LIMIT 1`)
    .first<{ id: string; email: string }>();
  if (!admin) {
    const now = Date.now(); ownerId = crypto.randomUUID();
    const email = `${ownerId}@example.invalid`;
    await db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`)
      .bind(ownerId, 'Upload Admin', email, now, now).run();
    await bootstrapAdmin(db, ownerId, email, now);
    admin = { id: ownerId, email };
  }
  ownerId = admin.id;
  ownerCookie = await signIn(admin.email);
  otherId = crypto.randomUUID();
  const email = `${otherId}@example.invalid`, now = Date.now(), invitationId = crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO invitations(id,email,token_hash,status,invited_by,created_at,expires_at) VALUES(?,?,?,'pending',?,?,?)`)
      .bind(invitationId, email, crypto.randomUUID(), ownerId, now, now + 86_400_000),
    db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`)
      .bind(otherId, 'Upload Other', email, now, now),
    db.prepare(`INSERT INTO app_accounts(id,email,role,status,invitation_id,created_at,updated_at) VALUES(?,?,'member','invited',?,?,?)`)
      .bind(otherId, email, invitationId, now, now),
    db.prepare(`INSERT INTO invitation_consumptions(invitation_id,owner_id,verified_email,consumed_at) VALUES(?,?,?,?)`)
      .bind(invitationId, otherId, email, now),
  ]);
  otherCookie = await signIn(email);
});

describe('private photo uploads', () => {
  it('rejects malformed PNGs, APNG, bad CRC, excessive dimensions, and oversized bodies', async () => {
    expect(sanitizePng(new TextEncoder().encode('not png'))).toBeNull();
    expect(sanitizePng(png(4000, 4000))).toBeNull();
    expect(sanitizePng(png(1, 1, [chunk('PLTE', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))], 3, 1))).toBeNull();
    expect(sanitizePng(png(1, 1, [chunk('PLTE', new Uint8Array([1, 2, 3]))], 3, 1))).not.toBeNull();
    expect(sanitizePng(png(1, 1, [chunk('acTL', new Uint8Array([0, 0, 0, 1]))]))).toBeNull();
    const corrupt = png(); corrupt[corrupt.length - 1] ^= 0xff;
    expect(sanitizePng(corrupt)).toBeNull();
    const oversized = new Uint8Array(8 * 1024 * 1024 + 1); oversized.set(png());
    const response = await handleUploads(request('/api/uploads', 'POST', ownerCookie, oversized), testEnv);
    expect(response?.status).toBe(413);
  });

  it('stores sanitized PNGs and only serves them to their owner', async () => {
    const body = png(2, 2, [chunk('tEXt', new TextEncoder().encode('Comment\0private metadata'))]);
    const created = await handleUploads(request('/api/uploads', 'POST', ownerCookie, body), testEnv);
    expect(created?.status).toBe(201);
    const dto = (await created!.json() as { upload: { id: string; mediaType: string; byteSize: number } }).upload;
    expect(dto.mediaType).toBe('image/png');
    expect(dto.byteSize).toBeLessThan(body.length);
    const ownerRead = await handleUploads(request(`/api/uploads/${dto.id}`, 'GET', ownerCookie), testEnv);
    expect(ownerRead?.status).toBe(200);
    expect(ownerRead?.headers.get('Content-Type')).toBe('image/png');
    expect(ownerRead?.headers.get('Cache-Control')).toContain('no-store');
    expect((await ownerRead!.arrayBuffer()).byteLength).toBe(dto.byteSize);
    expect((await handleUploads(request(`/api/uploads/${dto.id}`, 'GET', otherCookie), testEnv))?.status).toBe(404);
  });

  it('releases quota reservation when R2 fails', async () => {
    const failingEnv = { ...testEnv, UPLOADS: {
      put: async () => { throw new Error('simulated R2 outage'); },
      delete: async () => undefined,
      get: async () => null,
    } as unknown as R2Bucket };
    const before = await env.DB.prepare(`SELECT reserved_bytes AS bytes FROM user_upload_usage WHERE owner_id=?`)
      .bind(ownerId).first<{ bytes: number }>();
    const response = await handleUploads(request('/api/uploads', 'POST', ownerCookie, png()), failingEnv, { now: () => Date.now() + 10 });
    expect(response?.status).toBe(503);
    const after = await env.DB.prepare(`SELECT reserved_bytes AS bytes FROM user_upload_usage WHERE owner_id=?`)
      .bind(ownerId).first<{ bytes: number }>();
    expect(after?.bytes).toBe(before?.bytes ?? 0);
  });

  it('rejects a session revoked between reservation and commit and cleans up R2', async () => {
    const principal = await requirePrincipal(request('/api/uploads', 'POST', ownerCookie, png()), testEnv);
    expect(principal).toBeTruthy();
    const response = await handleUploads(request('/api/uploads', 'POST', ownerCookie, png()), testEnv, {
      beforeStore: async () => { await revokeSession(env.DB, principal!.ownerId, principal!.sessionId, Date.now()); },
    });
    expect(response?.status).toBe(401);
    const row = await env.DB.prepare(`SELECT status FROM uploads WHERE owner_id=? ORDER BY created_at DESC LIMIT 1`)
      .bind(ownerId).first<{ status: string }>();
    expect(row?.status).toBe('deleted');
  });
});
