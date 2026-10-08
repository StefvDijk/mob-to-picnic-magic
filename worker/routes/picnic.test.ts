import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAuth, type AuthDependencies, type AuthEnv } from '../auth';
import { bootstrapAdmin, consumeInvitation, createInvitation, createInvitedAccount } from '../db';
import { PicnicTimeoutError, type PicnicProvider } from '../adapters/picnic';
import type { PicnicProduct } from '../../shared/picnic';
import { decryptCredential } from '../security/credentials';
import { handlePicnic } from './picnic';
import { handleRequest } from '../index';

const db = env.DB;
const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const testEnv: AuthEnv & { PICNIC_ENCRYPTION_KEY: string; PICNIC_ENCRYPTION_KEY_VERSION: string } = {
  DB: db, APP_ORIGIN: 'https://picnic.test', APP_ENV: 'test',
  AUTH_SECRET: 'test-auth-secret-of-at-least-thirty-two-bytes',
  OTP_HMAC_SECRET: 'test-otp-secret-of-at-least-thirty-two-bytes',
  EMAIL_ADDRESS_HMAC_SECRET: 'test-address-secret-of-at-least-thirty-two-bytes',
  PICNIC_ENCRYPTION_KEY: key, PICNIC_ENCRYPTION_KEY_VERSION: 'test-v1',
};
const messages: string[] = [];
const authDeps: AuthDependencies = { sendEmail: async message => { messages.push(message.text); } };
let ownerId = '';
let email = '';
let cookie = '';

function request(path: string, method: string, body?: unknown): Request {
  const headers: Record<string, string> = { Origin: testEnv.APP_ORIGIN };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request(`${testEnv.APP_ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function signIn(): Promise<void> {
  const sent = await handleAuth(request('/api/auth/email-otp/send-verification-otp', 'POST', { email, type: 'sign-in' }), testEnv, authDeps);
  expect(sent?.status).toBe(200);
  const otp = messages.at(-1)?.match(/\b\d{6}\b/)?.[0];
  expect(otp).toBeTruthy();
  const reply = await handleAuth(request('/api/auth/sign-in/email-otp', 'POST', { email, otp }), testEnv, authDeps);
  expect(reply?.status).toBe(200);
  cookie = reply?.headers.get('Set-Cookie')?.split(';', 1)[0] ?? '';
  expect(cookie).toBeTruthy();
}
async function ownerSession(): Promise<{ sessionId: string }> {
  return db.prepare(`SELECT session_id AS sessionId FROM session_metadata WHERE owner_id=? ORDER BY authenticated_at DESC LIMIT 1`)
    .bind(ownerId).first<{ sessionId: string }>() as Promise<{ sessionId: string }>;
}
function provider(overrides: Partial<PicnicProvider> = {}): PicnicProvider {
  return {
    login: vi.fn(async () => ({ authKey: 'provider-resume-key', requiresSms: false, externalIdentity: 'provider-user' })),
    requestSms: vi.fn(async () => {}), verifySms: vi.fn(async () => ({ authKey: 'provider-verified-key' })),
    search: vi.fn(async () => []), cart: vi.fn(async () => []), ...overrides,
  };
}

async function insertProposal(owner: string, connectionId: string, generation: number, status: 'draft' | 'ready', approval = false) {
  const now = Date.now(), recipeId = crypto.randomUUID(), proposalId = crypto.randomUUID(), needId = crypto.randomUUID();
  await db.prepare(`INSERT INTO recipes(id,owner_id,title,base_servings_num,created_at,updated_at) VALUES(?,?,?,2,?,?)`)
    .bind(recipeId, owner, 'Picnic route fixture', now, now).run();
  await db.prepare(`INSERT INTO proposals(id,owner_id,recipe_id,recipe_version,connection_id,connection_generation,version,status,expires_at,created_at,updated_at)
    VALUES(?,?,?,1,?,?,1,?,?,?,?)`).bind(proposalId, owner, recipeId, connectionId, generation, status, now + 60_000, now, now).run();
  await db.prepare(`INSERT INTO proposal_needs(id,owner_id,proposal_id,ordinal,quantity_kind,unit) VALUES(?,?,?,0,'global','piece')`)
    .bind(needId, owner, proposalId).run();
  const allocationId = crypto.randomUUID();
  await db.prepare(`INSERT INTO basket_allocations(id,owner_id,proposal_id,need_id,product_id,quantity_num,quantity_den,unit,quantity_basis,checked_at,status)
    VALUES(?,?,?,?,?,1,3,'g','drained',?,'active')`).bind(allocationId, owner, proposalId, needId, 'sku-owned', now).run();
  let approvalId: string | null = null;
  if (approval) {
    approvalId = crypto.randomUUID();
    const session = await ownerSession();
    await db.prepare(`INSERT INTO approvals(id,owner_id,proposal_id,proposal_version,starting_session_id,snapshot_json,total_price_cents,approved_at,expires_at)
      VALUES(?,?,?,1,?,'{}',100,?,?)`).bind(approvalId, owner, proposalId, session.sessionId, now, now + 60_000).run();
  }
  return { recipeId, proposalId, needId, allocationId, approvalId };
}

async function createOtherActiveOwner(): Promise<string> {
  const otherId = crypto.randomUUID(), otherEmail = `${otherId}@example.invalid`, invitationId = crypto.randomUUID(), now = Date.now();
  await createInvitation(db, ownerId, { id: invitationId, email: otherEmail, tokenHash: crypto.randomUUID(), createdAt: now, expiresAt: now + 60_000 });
  await db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`)
    .bind(otherId, 'Other fixture', otherEmail, now, now).run();
  await createInvitedAccount(db, otherId, invitationId, otherEmail, now);
  await consumeInvitation(db, otherId, invitationId, otherEmail, now);
  return otherId;
}

beforeAll(async () => {
  const migrationEnv = env as typeof env & { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] };
  if (!(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_accounts'").first())) {
    await applyD1Migrations(db, migrationEnv.TEST_MIGRATIONS);
  }
  const admin = await db.prepare(`SELECT id,email FROM app_accounts WHERE role='admin' AND status='active' LIMIT 1`)
    .first<{ id: string; email: string }>();
  if (admin) { ownerId = admin.id; email = admin.email; }
  else {
    ownerId = crypto.randomUUID(); email = `${ownerId}@example.invalid`; const now = Date.now();
    await db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`)
      .bind(ownerId, 'Picnic test admin', email, now, now).run();
    await bootstrapAdmin(db, ownerId, email, now);
  }
});

let loggedIn = false;
beforeEach(async () => {
  await db.prepare(`DELETE FROM picnic_pending_verifications WHERE owner_id=?`).bind(ownerId).run();
  await db.prepare(`DELETE FROM connections WHERE owner_id=?`).bind(ownerId).run();
  await db.prepare(`DELETE FROM picnic_connect_limits WHERE owner_id=?`).bind(ownerId).run();
  await db.prepare(`UPDATE app_accounts SET status='active' WHERE id=?`).bind(ownerId).run();
  if (!loggedIn) { await signIn(); loggedIn = true; }
  const session = await ownerSession();
  await db.prepare(`UPDATE session_metadata SET last_verified_at=?,revoked_at=NULL WHERE owner_id=? AND session_id=?`)
    .bind(Date.now(), ownerId, session.sessionId).run();
  await db.prepare(`UPDATE session SET expiresAt=? WHERE id=?`).bind(new Date(Date.now() + 24 * 60 * 60_000).toISOString(), session.sessionId).run();
});

describe('Picnic routes', () => {

  it('serves normalized product search and only this owner’s exact cart allocations', async () => {
    const fixture = provider({ search: vi.fn(async (_authKey: string, _query: string): Promise<PicnicProduct[]> => [{ id: 'sku-1', name: 'Tomaten', unitQuantity: '500 g',
      quantity: { kind: 'exact', amount: '500', unit: 'g', basis: null }, displayPriceCents: 220, priceCertainty: 'known',
      priceRanges: [], identity: { groupId: 'sku-1', variantId: 'sku-1' } }]),
      cart: vi.fn(async (_authKey: string): Promise<{ productId: string; name: string; unitQuantity: string; quantity: number; unitPriceCents: number; isAvailable: boolean }[]> => [{ productId: 'sku-owned', name: 'Owned jar', unitQuantity: '250 g', quantity: 2, unitPriceCents: 125, isAvailable: true }]) });
    expect((await handlePicnic(request('/api/picnic/connect', 'POST', { username: 'p@example.invalid', password: 'transient-password' }), testEnv, { provider: fixture }))?.status).toBe(200);
    const ownConnection = await db.prepare(`SELECT id,generation FROM connections WHERE owner_id=? AND status='connected'`).bind(ownerId).first<{ id: string; generation: number }>();
    const own = await insertProposal(ownerId, ownConnection!.id, ownConnection!.generation, 'draft');
    const other = await createOtherActiveOwner();
    const otherConnectionId = crypto.randomUUID(), now = Date.now();
    await db.prepare(`INSERT INTO connections(id,owner_id,status,generation,encrypted_resume_key,key_version,created_at,updated_at)
      VALUES(?,?,'connected',1,'fixture-encrypted','fixture-v1',?,?)`).bind(otherConnectionId, other, now, now).run();
    const foreign = await insertProposal(other, otherConnectionId, 1, 'draft');

    const searched = await handlePicnic(request('/api/picnic/products?q=tomaat', 'GET'), testEnv, { provider: fixture });
    expect(searched?.status).toBe(200);
    expect(await searched!.json()).toMatchObject({ products: [{ id: 'sku-1', quantity: { amount: '500' }, priceCertainty: 'known' }] });
    const response = await handlePicnic(request('/api/picnic/cart', 'GET'), testEnv, { provider: fixture });
    expect(response?.status).toBe(200);
    const cartBody = await response!.json();
    expect(cartBody).toMatchObject({ cart: {
      lines: [{ productId: 'sku-owned', quantity: 2 }],
      allocations: [{ id: own.allocationId, proposalId: own.proposalId, quantity: '1/3', unit: 'g', quantityBasis: 'drained' }],
    } });
    expect(JSON.stringify(cartBody)).not.toContain(foreign.allocationId);
    expect(fixture.search).toHaveBeenCalledWith('provider-resume-key', 'tomaat');
    expect(fixture.cart).toHaveBeenCalledWith('provider-resume-key');
  });

  it('stales prior proposals, approvals, and basket allocations on key replacement', async () => {
    const fixture = provider();
    expect((await handlePicnic(request('/api/picnic/connect', 'POST', { username: 'p@example.invalid', password: 'first-password' }), testEnv, { provider: fixture }))?.status).toBe(200);
    const connection = await db.prepare(`SELECT id,generation FROM connections WHERE owner_id=? AND status='connected'`).bind(ownerId).first<{ id: string; generation: number }>();
    const prior = await insertProposal(ownerId, connection!.id, connection!.generation, 'ready', true);
    const replacement = provider({ login: vi.fn(async () => ({ authKey: 'replacement-key', requiresSms: false, externalIdentity: 'provider-user' })) });
    expect((await handlePicnic(request('/api/picnic/connect', 'POST', { username: 'p@example.invalid', password: 'replacement-password' }), testEnv, { provider: replacement }))?.status).toBe(200);
    expect(await db.prepare(`SELECT status,version FROM proposals WHERE id=?`).bind(prior.proposalId).first()).toMatchObject({ status: 'stale', version: 2 });
    expect(await db.prepare(`SELECT invalidated_at AS invalidatedAt FROM approvals WHERE id=?`).bind(prior.approvalId).first<{ invalidatedAt: number }>()).toMatchObject({ invalidatedAt: expect.any(Number) });
    expect(await db.prepare(`SELECT status FROM basket_allocations WHERE id=?`).bind(prior.allocationId).first()).toMatchObject({ status: 'stale' });
  });

  it('stores a successful login as encrypted per-user resume key', async () => {
    const fixture = provider();
    const response = await handlePicnic(request('/api/picnic/connect', 'POST', { username: 'p@example.invalid', password: 'transient-password' }), testEnv, { provider: fixture });
    expect(response?.status).toBe(200);
    expect(response?.headers.get('Cache-Control')).toContain('no-store');
    expect(fixture.login).toHaveBeenCalledWith('p@example.invalid', 'transient-password');
    const row = await db.prepare(`SELECT id,generation,encrypted_resume_key AS encrypted,key_version AS version,status FROM connections WHERE owner_id=?`)
      .bind(ownerId).first<{ id: string; generation: number; encrypted: string; version: string; status: string }>();
    expect(row).toMatchObject({ generation: 1, status: 'connected' });
    expect(row!.encrypted).not.toContain('provider-resume-key');
    await expect(decryptCredential(testEnv, ownerId, row!.id, 'resume', row!.version, row!.encrypted)).resolves.toBe('provider-resume-key');
  });

  it('composes private routes and exposes resumable SMS state without credentials', async () => {
    const fixture = provider({ login: vi.fn(async () => ({ authKey: 'composition-sms-secret', requiresSms: true, externalIdentity: 'sms-user' })) });
    const response = await handleRequest(request('/api/picnic/connect', 'POST', { username: 'p@example.invalid', password: 'composition-password' }), testEnv, { provider: fixture });
    expect(response.status).toBe(202);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    const pending = await handleRequest(request('/api/me', 'GET'), testEnv);
    const pendingBody = await pending.json();
    expect(pendingBody).toMatchObject({ picnic: { status: 'verification_required', verificationRequired: true } });
    expect(JSON.stringify(pendingBody)).not.toContain('composition-sms-secret');
    expect(JSON.stringify(pendingBody)).not.toContain('composition-password');
    const verified = await handleRequest(request('/api/picnic/verify', 'POST', { code: '123456' }), testEnv, { provider: fixture });
    expect(verified.status).toBe(200);
    const connected = await handleRequest(request('/api/me', 'GET'), testEnv);
    expect(await connected.json()).toMatchObject({ picnic: { status: 'connected', verificationRequired: false } });
  });

  it('holds an SMS auth key encrypted, caps codes at five, and completes verification', async () => {
    const fixture = provider({ login: vi.fn(async () => ({ authKey: 'sms-preliminary-key', requiresSms: true, externalIdentity: 'sms-user' })) });
    const response = await handlePicnic(request('/api/picnic/connect', 'POST', { username: 'p@example.invalid', password: 'transient-password' }), testEnv, { provider: fixture });
    expect(response?.status).toBe(202);
    expect(await db.prepare(`SELECT status FROM connections WHERE owner_id=?`).bind(ownerId).first()).toMatchObject({ status: 'verification_required' });
    const pending = await db.prepare(`SELECT connection_id AS id,encrypted_auth_key AS encrypted,key_version AS version FROM picnic_pending_verifications WHERE owner_id=?`)
      .bind(ownerId).first<{ id: string; encrypted: string; version: string }>();
    expect(pending!.encrypted).not.toContain('sms-preliminary-key');
    await expect(decryptCredential(testEnv, ownerId, pending!.id, 'pending-sms', pending!.version, pending!.encrypted)).resolves.toBe('sms-preliminary-key');
    const verified = await handlePicnic(request('/api/picnic/verify', 'POST', { code: '123456' }), testEnv, { provider: fixture });
    expect(verified?.status).toBe(200);
    expect(fixture.verifySms).toHaveBeenCalledWith('sms-preliminary-key', '123456');
    expect(await db.prepare(`SELECT generation,status FROM connections WHERE owner_id=?`).bind(ownerId).first())
      .toMatchObject({ generation: 1, status: 'connected' });
    expect(await db.prepare(`SELECT owner_id FROM picnic_pending_verifications WHERE owner_id=?`).bind(ownerId).first()).toBeNull();
  });

  it('keeps one encrypted verification pending after an uncertain SMS timeout', async () => {
    const fixture = provider({ login: vi.fn(async () => ({ authKey: 'pending-sms-key', requiresSms: true, externalIdentity: 'sms-user' })),
      requestSms: vi.fn(async () => { throw new PicnicTimeoutError(); }) });
    const response = await handlePicnic(request('/api/picnic/connect', 'POST', { username: 'p@example.invalid', password: 'transient-password' }), testEnv, { provider: fixture });
    expect(response?.status).toBe(202);
    expect(await response!.json()).toMatchObject({ verificationRequired: true, deliveryUncertain: true });
    expect(fixture.requestSms).toHaveBeenCalledTimes(1);
    const pending = await db.prepare(`SELECT connection_id AS connectionId,encrypted_auth_key AS encrypted,key_version AS version,state FROM picnic_pending_verifications WHERE owner_id=?`)
      .bind(ownerId).first<{ connectionId: string; encrypted: string; version: string; state: string }>();
    expect(pending?.state).toBe('verification_required');
    await expect(decryptCredential(testEnv, ownerId, pending!.connectionId, 'pending-sms', pending!.version, pending!.encrypted))
      .resolves.toBe('pending-sms-key');
  });

  it('reports an uncertain SMS verification result without treating the code as wrong', async () => {
    const fixture = provider({ login: vi.fn(async () => ({ authKey: 'pending-key', requiresSms: true, externalIdentity: 'sms-user' })),
      verifySms: vi.fn(async () => { throw new PicnicTimeoutError(); }) });
    expect((await handlePicnic(request('/api/picnic/connect', 'POST', { username: 'p@example.invalid', password: 'transient-password' }), testEnv, { provider: fixture }))?.status).toBe(202);
    const response = await handlePicnic(request('/api/picnic/verify', 'POST', { code: '123456' }), testEnv, { provider: fixture });
    expect(response?.status).toBe(503);
    expect(await response!.json()).toMatchObject({ error: { code: 'PICNIC_VERIFY_UNCERTAIN' } });
    expect(fixture.verifySms).toHaveBeenCalledTimes(1);
    expect(await db.prepare(`SELECT owner_id FROM picnic_pending_verifications WHERE owner_id=?`).bind(ownerId).first()).toBeNull();
  });



  it('does not classify a valid SMS code as rejected when persistence conflicts with another owner identity', async () => {
    const fixture = provider();
    expect((await handlePicnic(request('/api/picnic/connect', 'POST', { username: 'p@example.invalid', password: 'first-password' }), testEnv, { provider: fixture }))?.status).toBe(200);
    const own = await db.prepare(`SELECT id,generation,encrypted_resume_key AS encrypted,key_version AS version FROM connections WHERE owner_id=? AND status='connected'`)
      .bind(ownerId).first<{ id: string; generation: number; encrypted: string; version: string }>();
    const other = await createOtherActiveOwner(), now = Date.now(), externalIdentity = 'collision-user';
    const otherConnection = crypto.randomUUID();
    await db.prepare(`INSERT INTO connections(id,owner_id,status,generation,encrypted_resume_key,key_version,external_identity,created_at,updated_at)
      VALUES(?,?,'connected',1,'fixture-encrypted','fixture-v1',?,?,?)`).bind(otherConnection, other, externalIdentity, now, now).run();
    const smsFixture = provider({
      login: vi.fn(async () => ({ authKey: 'preliminary', requiresSms: true, externalIdentity })),
      verifySms: vi.fn(async () => ({ authKey: 'verified-but-conflicting' })),
    });
    expect((await handlePicnic(request('/api/picnic/connect', 'POST', { username: 'p@example.invalid', password: 'replace-password' }), testEnv, { provider: smsFixture }))?.status).toBe(202);
    const verified = await handlePicnic(request('/api/picnic/verify', 'POST', { code: '123456' }), testEnv, { provider: smsFixture });
    expect(verified?.status).toBe(503);
    expect(await verified!.json()).toMatchObject({ error: { code: 'PICNIC_SAVE_FAILED' } });
    expect(await db.prepare(`SELECT status,generation FROM connections WHERE owner_id=? AND id=?`).bind(ownerId, own!.id).first())
      .toMatchObject({ status: 'connected', generation: 1 });
    await expect(decryptCredential(testEnv, ownerId, own!.id, 'resume', own!.version, own!.encrypted)).resolves.toBe('provider-resume-key');
    expect(await db.prepare(`SELECT owner_id FROM picnic_pending_verifications WHERE owner_id=?`).bind(ownerId).first()).toBeNull();
  });

  it('allows at most five SMS verification attempts', async () => {
    const fixture = provider({ login: vi.fn(async () => ({ authKey: 'sms-key', requiresSms: true, externalIdentity: 'sms-user' })),
      verifySms: vi.fn(async () => { throw new Error('fixture rejected code'); }) });
    const connected = await handlePicnic(request('/api/picnic/connect', 'POST', { username: 'p@example.invalid', password: 'transient-password' }), testEnv, { provider: fixture });
    expect(connected?.status).toBe(202);
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await handlePicnic(request('/api/picnic/verify', 'POST', { code: '123456' }), testEnv, { provider: fixture }))?.status).toBe(400);
    }
    expect(await db.prepare(`SELECT owner_id FROM picnic_pending_verifications WHERE owner_id=?`).bind(ownerId).first()).toBeNull();
    expect((await handlePicnic(request('/api/picnic/verify', 'POST', { code: '123456' }), testEnv, { provider: fixture }))?.status).toBe(409);
    expect(fixture.verifySms).toHaveBeenCalledTimes(5);
  });

  it('requires recent email verification before replacing a connected key and sends no provider request', async () => {
    const fixture = provider();
    const first = await handlePicnic(request('/api/picnic/connect', 'POST', { username: 'p@example.invalid', password: 'first-password' }), testEnv, { provider: fixture });
    expect(first?.status).toBe(200);
    const session = await ownerSession();
    await db.prepare(`UPDATE session_metadata SET last_verified_at=? WHERE owner_id=? AND session_id=?`)
      .bind(Date.now() - 11 * 60_000, ownerId, session.sessionId).run();
    const second = await handlePicnic(request('/api/picnic/connect', 'POST', { username: 'p@example.invalid', password: 'second-password' }), testEnv, { provider: fixture });
    expect(second?.status).toBe(403);
    expect(fixture.login).toHaveBeenCalledTimes(1);
    expect(await db.prepare(`SELECT generation FROM connections WHERE owner_id=?`).bind(ownerId).first()).toMatchObject({ generation: 1 });
  });

  it('keeps the old key when fresh email verification expires during SMS confirmation', async () => {
    const fixture = provider();
    expect((await handlePicnic(request('/api/picnic/connect', 'POST', { username: 'p@example.invalid', password: 'first' }), testEnv, { provider: fixture }))?.status).toBe(200);
    const original = await db.prepare(`SELECT id,generation,encrypted_resume_key AS encrypted,key_version AS version FROM connections WHERE owner_id=?`)
      .bind(ownerId).first<{ id: string; generation: number; encrypted: string; version: string }>();
    const sms = provider({ login: vi.fn(async () => ({ authKey: 'pending-key', requiresSms: true, externalIdentity: 'provider-user' })) });
    expect((await handlePicnic(request('/api/picnic/connect', 'POST', { username: 'p@example.invalid', password: 'second' }), testEnv, { provider: sms }))?.status).toBe(202);
    const session = await ownerSession();
    await db.prepare(`UPDATE session_metadata SET last_verified_at=? WHERE owner_id=? AND session_id=?`)
      .bind(Date.now() - 600_001, ownerId, session.sessionId).run();
    expect((await handlePicnic(request('/api/picnic/verify', 'POST', { code: '123456' }), testEnv, { provider: sms }))?.status).toBe(409);
    expect(await db.prepare(`SELECT generation,status FROM connections WHERE id=?`).bind(original!.id).first())
      .toMatchObject({ generation: original!.generation, status: 'connected' });
    await expect(decryptCredential(testEnv, ownerId, original!.id, 'resume', original!.version, original!.encrypted)).resolves.toBe('provider-resume-key');
  });

  it('rejects concurrent attempts and refuses to persist after disconnect while provider login waits', async () => {
    let finishLogin!: (value: { authKey: string; requiresSms: boolean; externalIdentity: string }) => void;
    const pendingLogin = new Promise<{ authKey: string; requiresSms: boolean; externalIdentity: string }>(resolve => { finishLogin = resolve; });
    const fixture = provider({ login: vi.fn(() => pendingLogin) });
    const firstCall = handlePicnic(request('/api/picnic/connect', 'POST', { username: 'p@example.invalid', password: 'first-password' }), testEnv, { provider: fixture });
    await vi.waitFor(async () => expect(await db.prepare(`SELECT owner_id FROM picnic_pending_verifications WHERE owner_id=?`).bind(ownerId).first()).toBeTruthy());
    const concurrent = await handlePicnic(request('/api/picnic/connect', 'POST', { username: 'p@example.invalid', password: 'second-password' }), testEnv, { provider: fixture });
    expect(concurrent?.status).toBe(409);
    const disconnected = await handlePicnic(request('/api/picnic/connection', 'DELETE'), testEnv, { provider: fixture });
    expect(disconnected?.status).toBe(204);
    finishLogin({ authKey: 'late-key', requiresSms: false, externalIdentity: 'late-user' });
    const response = await firstCall;
    expect(response?.status).toBe(409);
    expect(await db.prepare(`SELECT status,encrypted_resume_key AS key FROM connections WHERE owner_id=?`).bind(ownerId).first())
      .toMatchObject({ status: 'disconnected', key: null });
  });


  it('replaces a confirmed Picnic key by incrementing its generation', async () => {
    const fixture = provider();
    const first = await handlePicnic(request('/api/picnic/connect', 'POST', { username: 'p@example.invalid', password: 'first-password' }), testEnv, { provider: fixture });
    expect(first?.status).toBe(200);
    const second = await handlePicnic(request('/api/picnic/connect', 'POST', { username: 'p@example.invalid', password: 'second-password' }), testEnv, { provider: provider({
      login: vi.fn(async () => ({ authKey: 'replacement-resume-key', requiresSms: false, externalIdentity: 'provider-user' })),
    }) });
    expect(second?.status).toBe(200);
    const row = await db.prepare(`SELECT id,generation,encrypted_resume_key AS encrypted,key_version AS version FROM connections WHERE owner_id=?`)
      .bind(ownerId).first<{ id: string; generation: number; encrypted: string; version: string }>();
    expect(row?.generation).toBe(2);
    await expect(decryptCredential(testEnv, ownerId, row!.id, 'resume', row!.version, row!.encrypted)).resolves.toBe('replacement-resume-key');
  });

  it('rejects persistence after the starting session is revoked during provider login', async () => {
    let finishLogin!: (value: { authKey: string; requiresSms: boolean; externalIdentity: string }) => void;
    const fixture = provider({ login: vi.fn(() => new Promise<{ authKey: string; requiresSms: boolean; externalIdentity: string }>(resolve => { finishLogin = resolve; })) });
    const pendingRequest = handlePicnic(request('/api/picnic/connect', 'POST', { username: 'p@example.invalid', password: 'transient-password' }), testEnv, { provider: fixture });
    await vi.waitFor(async () => expect(await db.prepare(`SELECT owner_id FROM picnic_pending_verifications WHERE owner_id=?`).bind(ownerId).first()).toBeTruthy());
    const session = await ownerSession();
    await db.prepare(`UPDATE session_metadata SET revoked_at=? WHERE owner_id=? AND session_id=?`).bind(Date.now(), ownerId, session.sessionId).run();
    finishLogin({ authKey: 'late-key', requiresSms: false, externalIdentity: 'late-user' });
    expect((await pendingRequest)?.status).toBe(409);
    expect(await db.prepare(`SELECT encrypted_resume_key AS key,status FROM connections WHERE owner_id=?`).bind(ownerId).first())
      .toMatchObject({ key: null, status: 'disconnected' });
  });


  it('refuses to persist when the account is blocked during provider login', async () => {
    let finishLogin!: (value: { authKey: string; requiresSms: boolean; externalIdentity: string }) => void;
    const fixture = provider({ login: vi.fn(() => new Promise<{ authKey: string; requiresSms: boolean; externalIdentity: string }>(resolve => { finishLogin = resolve; })) });
    const pendingRequest = handlePicnic(request('/api/picnic/connect', 'POST', { username: 'p@example.invalid', password: 'transient-password' }), testEnv, { provider: fixture });
    await vi.waitFor(async () => expect(await db.prepare(`SELECT owner_id FROM picnic_pending_verifications WHERE owner_id=?`).bind(ownerId).first()).toBeTruthy());
    await db.prepare(`UPDATE app_accounts SET status='blocked' WHERE id=?`).bind(ownerId).run();
    finishLogin({ authKey: 'late-key', requiresSms: false, externalIdentity: 'late-user' });
    expect((await pendingRequest)?.status).toBe(409);
    expect(await db.prepare(`SELECT encrypted_resume_key AS key,status FROM connections WHERE owner_id=?`).bind(ownerId).first())
      .toMatchObject({ key: null, status: 'disconnected' });
  });

  it('checks Better Auth ISO expiry again after a provider response', async () => {
    let finishLogin!: (value: { authKey: string; requiresSms: boolean; externalIdentity: string }) => void;
    const fixture = provider({ login: vi.fn(() => new Promise<{ authKey: string; requiresSms: boolean; externalIdentity: string }>(resolve => { finishLogin = resolve; })) });
    const pendingRequest = handlePicnic(request('/api/picnic/connect', 'POST', { username: 'p@example.invalid', password: 'transient-password' }), testEnv, { provider: fixture });
    await vi.waitFor(async () => expect(await db.prepare(`SELECT owner_id FROM picnic_pending_verifications WHERE owner_id=?`).bind(ownerId).first()).toBeTruthy());
    const session = await ownerSession();
    await db.prepare(`UPDATE session SET expiresAt=? WHERE id=?`).bind(new Date(Date.now() - 1000).toISOString(), session.sessionId).run();
    finishLogin({ authKey: 'late-key', requiresSms: false, externalIdentity: 'late-user' });
    expect((await pendingRequest)?.status).toBe(409);
    expect(await db.prepare(`SELECT encrypted_resume_key AS key,status FROM connections WHERE owner_id=?`).bind(ownerId).first())
      .toMatchObject({ key: null, status: 'disconnected' });
  });

  it('does not invoke provider for invalid auth or invalid search input', async () => {
    const fixture = provider();
    const authenticatedCookie = cookie;
    cookie = '';
    const unauthenticated = await handlePicnic(request('/api/picnic/cart', 'GET'), testEnv, { provider: fixture });
    expect(unauthenticated?.status).toBe(401);
    cookie = authenticatedCookie;
    const invalid = await handlePicnic(request('/api/picnic/products?q=', 'GET'), testEnv, { provider: fixture });
    expect(invalid?.status).toBe(400);
    expect(fixture.cart).not.toHaveBeenCalled();
    expect(fixture.search).not.toHaveBeenCalled();
  });
});
