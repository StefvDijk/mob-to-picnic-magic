import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { createInvitation, createInvitedAccount } from '../db';
import { requirePrincipal, type AuthDependencies, type AuthEnv } from './index';
import { handleRequest as handleAuth } from '../index';

const db = env.DB;
let authEnv: AuthEnv & { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] };
const deps = (() => {
  const sent: { to: string; subject: string; text: string }[] = [];
  const value: AuthDependencies = { sendEmail: async (message) => { sent.push(message); } };
  return { value, sent };
})();
let schemaReady: Promise<void> | undefined;

async function ensureSchema() {
  if (!schemaReady) schemaReady = (async () => {
    const row = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_accounts'").first();
    if (!row) await applyD1Migrations(db, env.TEST_MIGRATIONS);
  })();
  await schemaReady;
}

async function makeInvitedAccount(email: string) {
  const now = Date.now();
  const existingAdmin = await db.prepare(`SELECT id,email FROM app_accounts WHERE role='admin' AND status='active' LIMIT 1`)
    .first<{ id: string; email: string }>();
  const adminId = existingAdmin?.id ?? crypto.randomUUID();
  const adminEmail = existingAdmin?.email ?? `${adminId}@test.invalid`;
  const ownerId = crypto.randomUUID();
  const invitationId = crypto.randomUUID();
  const normalized = email.toLowerCase();
  if (!existingAdmin) {
    await db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`)
      .bind(adminId, 'Admin', adminEmail, now, now).run();
    await db.prepare(`INSERT INTO app_accounts(id,email,role,status,invitation_id,created_at,updated_at)
      VALUES(?,?,'admin','active',NULL,?,?)`).bind(adminId, adminEmail, now, now).run();
  }
  await createInvitation(db, adminId, { id: invitationId, email: normalized, tokenHash: crypto.randomUUID(), createdAt: now, expiresAt: now + 7 * 24 * 60 * 60 * 1000 });
  await db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,?,?)`)
    .bind(ownerId, normalized, normalized, now, now).run();
  await createInvitedAccount(db, ownerId, invitationId, normalized, now);
  return ownerId;
}

function post(path: string, body: unknown): Request {
  return new Request(`https://picnic.test${path}`, {
    method: 'POST',
    headers: { Origin: 'https://picnic.test', 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.42' },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  await ensureSchema();
  authEnv = {
    ...env,
    APP_ORIGIN: 'https://picnic.test',
    APP_ENV: 'test',
    AUTH_SECRET: 'auth-secret-test-which-is-long-enough-0123456789',
    OTP_HMAC_SECRET: 'otp-hmac-test-secret-which-is-long-enough-0123456789',
    EMAIL_ADDRESS_HMAC_SECRET: 'address-hmac-test-secret-which-is-long-enough-0123456789',
  } as AuthEnv & { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] };
});

describe('invite-only Better Auth over D1', () => {
  it('returns a neutral OTP response for unknown addresses without creating a verification', async () => {
    const email = `${crypto.randomUUID()}@unknown.invalid`;
    const response = await handleAuth(post('/api/auth/email-otp/send-verification-otp', { email, type: 'sign-in' }), authEnv, deps.value);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ success: true });
    const verification = await db.prepare('SELECT COUNT(*) AS count FROM verification WHERE identifier=?')
      .bind(`sign-in-otp-${email}`).first<{ count: number }>();
    expect(verification?.count).toBe(0);
  });

  it('keeps email quota charged when delivery may have succeeded before a timeout', async () => {
    const email = `${crypto.randomUUID()}@example.invalid`;
    const ownerId = await makeInvitedAccount(email);
    const day = new Date().toISOString().slice(0, 10);
    const before = await db.prepare(`SELECT sent_count AS sentCount FROM email_send_usage WHERE period=?`)
      .bind(day).first<{ sentCount: number }>();
    let called = false;
    const response = await handleAuth(post('/api/auth/email-otp/send-verification-otp', { email, type: 'sign-in' }), authEnv, {
      sendEmail: async () => { called = true; throw new Error('provider timeout after invocation'); },
    });
    expect(called).toBe(true);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ success: true });
    const send = await db.prepare(`SELECT status FROM email_sends WHERE owner_id=? ORDER BY created_at DESC LIMIT 1`)
      .bind(ownerId).first<{ status: string }>();
    expect(send?.status).toBe('unknown');
    const usage = await db.prepare(`SELECT sent_count AS sentCount,reserved_count AS reservedCount FROM email_send_usage WHERE period=?`)
      .bind(day).first<{ sentCount: number; reservedCount: number }>();
    expect(usage?.sentCount).toBe((before?.sentCount ?? 0) + 1);
    expect(usage?.reservedCount).toBe(0);
  });

  it('sends and consumes a one-time code, keeps the token out of JSON, and creates an active session', async () => {
    const email = `${crypto.randomUUID()}@example.invalid`;
    const ownerId = await makeInvitedAccount(email);
    const sendResponse = await handleAuth(post('/api/auth/email-otp/send-verification-otp', { email, type: 'sign-in' }), authEnv, deps.value);
    expect(sendResponse?.status).toBe(200);
    expect(await sendResponse?.json()).toEqual({ success: true });
    const emailMessage = deps.sent.at(-1);
    expect(emailMessage?.to).toBe(email);
    const otp = emailMessage?.text.match(/\b\d{6}\b/)?.[0];
    expect(otp).toBeTruthy();
    const verification = await db.prepare('SELECT value FROM verification WHERE identifier=?').bind(`sign-in-otp-${email}`).first<{ value: string }>();
    expect(verification?.value).toBeTruthy();
    expect(verification?.value).not.toContain(otp);

    const signInResponse = await handleAuth(post('/api/auth/sign-in/email-otp', { email, otp }), authEnv, deps.value);
    expect(signInResponse?.status).toBe(200);
    const signInBody = await signInResponse?.text();
    expect(signInBody).not.toMatch(/"token"\s*:/i);
    expect(signInBody).not.toContain(otp);
    const cookies = signInResponse?.headers.get('set-cookie');
    expect(cookies).toBeTruthy();
    const cookie = cookies!.split(';', 1)[0];
    const principal = await requirePrincipal(new Request('https://picnic.test/api/me', { headers: { Cookie: cookie } }), authEnv);
    expect(principal).toMatchObject({ ownerId, email, role: 'member' });
    expect(principal?.lastVerifiedAt).toBeTruthy();

    const account = await db.prepare('SELECT status FROM app_accounts WHERE id=?').bind(ownerId).first<{ status: string }>();
    expect(account?.status).toBe('active');
    await db.prepare(`UPDATE app_accounts SET status='blocked',updated_at=? WHERE id=?`).bind(Date.now(), ownerId).run();
    expect(await requirePrincipal(new Request('https://picnic.test/api/me', { headers: { Cookie: cookie } }), authEnv)).toBeNull();
  });

  it('blocks unsafe methods, unexpected auth endpoints, and cross-origin writes', async () => {
    const rejectedPath = await handleAuth(new Request('https://picnic.test/api/auth/sign-up/email', { method: 'POST', headers: { Origin: 'https://picnic.test' } }), authEnv);
    const wrongOrigin = await handleAuth(new Request('https://picnic.test/api/auth/sign-out', { method: 'POST', headers: { Origin: 'https://other.test' } }), authEnv);
    const wrongMethod = await handleAuth(new Request('https://picnic.test/api/auth/get-session', { method: 'DELETE' }), authEnv);
    expect(rejectedPath?.status).toBe(404);
    expect(wrongOrigin?.status).toBe(403);
    expect(wrongMethod?.status).toBe(405);
  });
});
