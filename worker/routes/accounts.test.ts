import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { type AuthDependencies, type AuthEnv } from '../auth';
import { handleRequest as handleAuth, handleRequest as handleAccounts } from '../index';
import { bootstrapAdmin } from '../db';
import { budgetMonthAmsterdam } from './accounts';

const db = env.DB;
const testEnv: AuthEnv = {
  DB: db,
  APP_ORIGIN: 'https://picnic.test',
  APP_ENV: 'test',
  AUTH_SECRET: 'test-auth-secret-of-at-least-thirty-two-bytes',
  OTP_HMAC_SECRET: 'test-otp-secret-of-at-least-thirty-two-bytes',
  EMAIL_ADDRESS_HMAC_SECRET: 'test-address-secret-of-at-least-thirty-two-bytes',
};
const messages: { to: string; subject: string; text: string }[] = [];
const deps: AuthDependencies = { sendEmail: async message => { messages.push(message); } };
let adminEmail: string;

function request(path: string, method: string, body?: unknown, cookie?: string): Request {
  const headers: Record<string, string> = { Origin: testEnv.APP_ORIGIN, 'CF-Connecting-IP': '192.0.2.88' };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request(`${testEnv.APP_ORIGIN}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function signIn(email: string): Promise<string> {
  const sent = await handleAuth(request('/api/auth/email-otp/send-verification-otp', 'POST', { email, type: 'sign-in' }), testEnv, deps);
  expect(sent?.status).toBe(200);
  const message = messages.at(-1);
  expect(message?.to).toBe(email);
  const otp = message?.text.match(/\b\d{6}\b/)?.[0];
  expect(otp).toBeTruthy();
  const signedIn = await handleAuth(request('/api/auth/sign-in/email-otp', 'POST', { email, otp }), testEnv, deps);
  expect(signedIn?.status).toBe(200);
  expect(await signedIn?.text()).not.toMatch(/"token"\s*:/i);
  const cookie = signedIn?.headers.get('Set-Cookie')?.split(';', 1)[0];
  expect(cookie).toBeTruthy();
  return cookie!;
}

beforeAll(async () => {
  const migrationEnv = env as typeof env & { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] };
  const exists = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_accounts'").first();
  if (!exists) await applyD1Migrations(db, migrationEnv.TEST_MIGRATIONS);
  const existing = await db.prepare(`SELECT email FROM app_accounts WHERE role='admin' AND status='active' LIMIT 1`)
    .first<{ email: string }>();
  if (existing) adminEmail = existing.email;
  else {
    const id = crypto.randomUUID();
    const now = Date.now();
    adminEmail = `${id}@example.invalid`;
    await db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`)
      .bind(id, 'Admin', adminEmail, now, now).run();
    await bootstrapAdmin(db, id, adminEmail, now);
  }
});

describe('account HTTP routes with real Better Auth and D1', () => {
  it('uses Amsterdam midnight for AI budget months across winter and summer offsets', () => {
    expect(budgetMonthAmsterdam(Date.parse('2026-10-31T22:59:59Z'))).toBe('2026-10');
    expect(budgetMonthAmsterdam(Date.parse('2026-10-31T23:00:00Z'))).toBe('2026-11');
    expect(budgetMonthAmsterdam(Date.parse('2026-04-30T21:59:59Z'))).toBe('2026-04');
    expect(budgetMonthAmsterdam(Date.parse('2026-04-30T22:00:00Z'))).toBe('2026-05');
  });

  it('provisions an invitee, signs in, blocks access immediately, and queues account deletion', async () => {
    const adminCookie = await signIn(adminEmail);
    const sessionReply = await handleAuth(request('/api/auth/get-session', 'GET', undefined, adminCookie), testEnv, deps);
    expect(sessionReply?.status).toBe(200);
    expect(await sessionReply?.text()).not.toMatch(/"token"\s*:/i);
    const me = await handleAccounts(request('/api/me', 'GET', undefined, adminCookie), testEnv);
    expect(me?.status).toBe(200);
    expect((await me?.json() as { account: { role: string } }).account.role).toBe('admin');

    const concurrentSwitches = await Promise.all([
      handleAccounts(request('/api/admin/switches', 'PATCH', { aiEnabled: false }, adminCookie), testEnv),
      handleAccounts(request('/api/admin/switches', 'PATCH', { addEnabled: false }, adminCookie), testEnv),
    ]);
    expect(concurrentSwitches.map(result => result?.status)).toEqual([200, 200]);
    expect(await db.prepare(`SELECT ai_enabled AS aiEnabled,add_enabled AS addEnabled FROM app_switches WHERE singleton=1`).first())
      .toEqual({ aiEnabled: 0, addEnabled: 0 });
    await handleAccounts(request('/api/admin/switches', 'PATCH', { aiEnabled: true, addEnabled: true }, adminCookie), testEnv);

    const email = `${crypto.randomUUID()}@example.invalid`;
    const invite = await handleAccounts(request('/api/admin/invitations', 'POST', { email }, adminCookie), testEnv, deps);
    expect(invite?.status).toBe(201);
    expect(messages.at(-1)?.to).toBe(email);
    const invitation = (await invite?.json() as { invitation: { id: string } }).invitation;
    const invited = await db.prepare(`SELECT a.status,u.emailVerified FROM app_accounts a JOIN user u ON u.id=a.id WHERE a.email=?`)
      .bind(email).first<{ status: string; emailVerified: number }>();
    expect(invited).toEqual({ status: 'invited', emailVerified: 0 });

    const memberCookie = await signIn(email);
    const memberMe = await handleAccounts(request('/api/me', 'GET', undefined, memberCookie), testEnv);
    expect(memberMe?.status).toBe(200);

    const owner = await db.prepare(`SELECT id,status FROM app_accounts WHERE email=?`).bind(email)
      .first<{ id: string; status: string }>();
    expect(owner?.status).toBe('active');
    expect(await db.prepare(`SELECT status FROM invitations WHERE id=?`).bind(invitation.id).first()).toEqual({ status: 'consumed' });
    const block = await handleAccounts(request(`/api/admin/accounts/${owner?.id}`, 'PATCH', { status: 'blocked' }, adminCookie), testEnv);
    expect(block?.status).toBe(200);
    const blocked = await handleAccounts(request('/api/me', 'GET', undefined, memberCookie), testEnv);
    expect(blocked?.status).toBe(401);
    const blockedAuthSession = await handleAuth(request('/api/auth/get-session', 'GET', undefined, memberCookie), testEnv, deps);
    expect(await blockedAuthSession?.json()).toBeNull();

    const day = new Date().toISOString().slice(0, 10);
    const emailUsage = await db.prepare(`SELECT cap_count AS capCount,sent_count AS sentCount,reserved_count AS reservedCount
      FROM email_send_usage WHERE period=?`).bind(day)
      .first<{ capCount: number; sentCount: number; reservedCount: number }>();
    expect(emailUsage).toBeTruthy();
    await db.prepare(`UPDATE email_send_usage SET cap_count=? WHERE period=?`)
      .bind(emailUsage!.sentCount + emailUsage!.reservedCount, day).run();
    const overQuota = await handleAccounts(request('/api/admin/invitations', 'POST', {
      email: `${crypto.randomUUID()}@example.invalid`,
    }, adminCookie), testEnv, deps);
    expect(overQuota?.status).toBe(429);
    await db.prepare(`UPDATE email_send_usage SET cap_count=? WHERE period=?`).bind(emailUsage!.capCount, day).run();

    for (let seat = 0; seat < 8; seat += 1) {
      const pending = await handleAccounts(request('/api/admin/invitations', 'POST', {
        email: `${crypto.randomUUID()}@example.invalid`,
      }, adminCookie), testEnv, deps);
      expect(pending?.status).toBe(201);
    }
    const full = await handleAccounts(request('/api/admin/invitations', 'POST', {
      email: `${crypto.randomUUID()}@example.invalid`,
    }, adminCookie), testEnv, deps);
    expect(full?.status).toBe(409);

    const deletion = await handleAccounts(request('/api/account', 'DELETE', { confirm: 'VERWIJDER ACCOUNT' }, adminCookie), testEnv);
    expect(deletion?.status).toBe(202);
    const task = await db.prepare(`SELECT status FROM deletion_tasks WHERE owner_id=(SELECT id FROM app_accounts WHERE email=?)`)
      .bind(adminEmail).first<{ status: string }>();
    expect(task?.status).toBe('queued');
    expect((await handleAccounts(request('/api/me', 'GET', undefined, adminCookie), testEnv))?.status).toBe(401);
  });
});
