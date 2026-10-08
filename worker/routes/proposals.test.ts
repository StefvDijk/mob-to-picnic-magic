import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAuth, type AuthDependencies, type AuthEnv } from '../auth';
import { bootstrapAdmin, consumeInvitation, createInvitation, createInvitedAccount } from '../db';
import type { PicnicProduct } from '../../shared/picnic';
import type { PicnicProvider } from '../adapters/picnic';
import { encryptCredential } from '../security/credentials';
import { handleProposals } from './proposals';

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

function request(path: string, method: string, body?: unknown, authCookie = cookie): Request {
  const headers: Record<string, string> = { Origin: testEnv.APP_ORIGIN, 'CF-Connecting-IP': `192.0.2.${Math.floor(Math.random() * 200) + 1}` };
  if (authCookie) headers.Cookie = authCookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request(`${testEnv.APP_ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function signIn(address: string): Promise<string> {
  const sent = await handleAuth(request('/api/auth/email-otp/send-verification-otp', 'POST', { email: address, type: 'sign-in' }, ''), testEnv, authDeps);
  expect(sent?.status).toBe(200);
  const otp = messages.at(-1)?.match(/\b\d{6}\b/)?.[0];
  expect(otp).toBeTruthy();
  const reply = await handleAuth(request('/api/auth/sign-in/email-otp', 'POST', { email: address, otp }, ''), testEnv, authDeps);
  expect(reply?.status).toBe(200);
  return reply?.headers.get('Set-Cookie')?.split(';', 1)[0] ?? '';
}
async function makeOwner(): Promise<{ id: string; email: string }> {
  const id = crypto.randomUUID(), address = `${id}@example.invalid`, now = Date.now();
  await db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`)
    .bind(id, 'Proposal route test', address, now, now).run();
  await bootstrapAdmin(db, id, address, now);
  return { id, email: address };
}
async function makeForeignOwner(): Promise<{ id: string; email: string }> {
  const id = crypto.randomUUID(), address = `${id}@example.invalid`, now = Date.now(), invitationId = crypto.randomUUID();
  await createInvitation(db, ownerId, { id: invitationId, email: address, tokenHash: crypto.randomUUID(), createdAt: now, expiresAt: now + 60_000 });
  await db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`)
    .bind(id, 'Foreign proposal fixture', address, now, now).run();
  await createInvitedAccount(db, id, invitationId, address, now);
  await consumeInvitation(db, id, invitationId, address, now);
  return { id, email: address };
}

let recipeId = '';
let ingredientId = '';
let connectionId = '';
const fixtureProduct: PicnicProduct = {
  id: 'sku-100g', name: 'Test flour', unitQuantity: '100 g',
  quantity: { kind: 'exact', amount: '100', unit: 'g', basis: null },
  displayPriceCents: 50, priceCertainty: 'known', priceRanges: [],
  identity: { groupId: 'sku-100g', variantId: 'sku-100g' },
};
function fixtureProvider(onSearch: (query: string) => Promise<void> = async () => {}): PicnicProvider {
  return {
    login: vi.fn(async () => ({ authKey: 'unused', requiresSms: false, externalIdentity: 'unused' })),
    requestSms: vi.fn(async () => {}), verifySms: vi.fn(async () => ({ authKey: 'unused' })), cart: vi.fn(async () => []),
    search: vi.fn(async (_authKey, query) => { await onSearch(query); return [fixtureProduct]; }),
  };
}
function payload(overrides: Record<string, unknown> = {}) {
  return { recipeId, recipeVersion: 1, servings: '4', choices: [{ ingredientId, query: 'tarwebloem', productId: fixtureProduct.id, basis: 'net' }], ...overrides };
}

beforeAll(async () => {
  const migrationEnv = env as typeof env & { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] };
  if (!(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_accounts'").first())) {
    await applyD1Migrations(db, migrationEnv.TEST_MIGRATIONS);
  }
  const owner = await makeOwner();
  ownerId = owner.id; email = owner.email;
  cookie = await signIn(email);
});

beforeEach(async () => {
  await db.prepare(`UPDATE app_accounts SET status='active' WHERE id=?`).bind(ownerId).run();
  await db.prepare(`DELETE FROM connections WHERE owner_id=?`).bind(ownerId).run();
  await db.prepare(`DELETE FROM recipes WHERE owner_id=?`).bind(ownerId).run();
  const now = Date.now();
  recipeId = crypto.randomUUID(); ingredientId = crypto.randomUUID(); connectionId = crypto.randomUUID();
  await db.prepare(`INSERT INTO recipes(id,owner_id,title,base_servings_num,base_servings_den,version,created_at,updated_at)
    VALUES(?,?,?,2,1,1,?,?)`).bind(recipeId, ownerId, 'Flour recipe', now, now).run();
  await db.prepare(`INSERT INTO ingredients(id,owner_id,recipe_id,ordinal,original_text,normalized_name,quantity_kind,
    quantity_num,quantity_den,unit,attributes_json,uncertainty_json,created_at)
    VALUES(?,?,?,0,'200 g flour','flour','exact',200,1,'g','{"quantityBasis":"net"}','[]',?)`).bind(ingredientId, ownerId, recipeId, now).run();
  const encrypted = await encryptCredential(testEnv, ownerId, connectionId, 'resume', 'provider-key');
  await db.prepare(`INSERT INTO connections(id,owner_id,status,generation,encrypted_resume_key,key_version,created_at,updated_at)
    VALUES(?,?,'connected',1,?,?,?,?)`).bind(connectionId, ownerId, encrypted.ciphertext, encrypted.keyVersion, now, now).run();
});

describe('proposal routes', () => {
  it('scales quantities, computes pack count and server price, and persists the review DTO', async () => {
    const fixture = fixtureProvider();
    const response = await handleProposals(request('/api/proposals', 'POST', payload({ choices: [{
      ingredientId, query: 'tarwebloem', productId: fixtureProduct.id, basis: 'net', priceCents: 1,
    }] })), testEnv, { provider: fixture, now: () => Date.now() });
    expect(response?.status).toBe(201);
    const body = await response!.json() as { proposal: { id: string; totalPriceCents: number; needs: Array<{ needed: string; quantity: unknown; product: { packCount: number; priceCents: number; overshoot: string } }> } };
    expect(body.proposal).toMatchObject({ totalPriceCents: 200, needs: [{ needed: '400', quantity: { kind: 'exact', amount: '400' },
      product: { packCount: 4, priceCents: 50, overshoot: '0' } }] });
    expect(fixture.search).toHaveBeenCalledWith('provider-key', 'tarwebloem');
    const stored = await db.prepare(`SELECT p.price_cents AS priceCents,p.pack_count AS packCount,n.quantity_num AS quantityNum
      FROM purchase_lines p JOIN proposal_needs n ON n.owner_id=p.owner_id AND n.proposal_id=p.proposal_id AND n.id=p.need_id
      WHERE p.owner_id=? AND p.proposal_id=?`).bind(ownerId, body.proposal.id)
      .first<{ priceCents: number; packCount: number; quantityNum: number }>();
    expect(stored).toEqual({ priceCents: 50, packCount: 4, quantityNum: 400 });
    const loaded = await handleProposals(request(`/api/proposals/${body.proposal.id}`, 'GET'), testEnv);
    expect(loaded?.status).toBe(200);
    expect(await loaded!.json()).toMatchObject({ proposal: { id: body.proposal.id, totalPriceCents: 200 } });
  });

  it('scales range maximum for package coverage while retaining the range in the proposal', async () => {
    await db.prepare(`UPDATE ingredients SET quantity_kind='range',quantity_num=100,quantity_max_num=200 WHERE id=?`).bind(ingredientId).run();
    const response = await handleProposals(request('/api/proposals', 'POST', payload()), testEnv, { provider: fixtureProvider() });
    expect(response?.status).toBe(201);
    expect(await response!.json()).toMatchObject({ proposal: { needs: [{ quantity: { kind: 'range', amount: '200', maximum: '400' },
      needed: '400', product: { packCount: 4 } }] } });
  });

  it('rejects foreign or stale recipes before provider search', async () => {
    const fixture = fixtureProvider();
    const foreign = await handleProposals(request('/api/proposals', 'POST', payload({ recipeId: crypto.randomUUID() })), testEnv, { provider: fixture });
    expect(foreign?.status).toBe(409);
    expect(fixture.search).not.toHaveBeenCalled();
    const stale = await handleProposals(request('/api/proposals', 'POST', payload({ recipeVersion: 2 })), testEnv, { provider: fixture });
    expect(stale?.status).toBe(409);
    expect(fixture.search).not.toHaveBeenCalled();
  });

  it('does not persist if the recipe becomes stale during provider search', async () => {
    const fixture = fixtureProvider(async () => { await db.prepare(`UPDATE recipes SET version=version+1 WHERE id=?`).bind(recipeId).run(); });
    const response = await handleProposals(request('/api/proposals', 'POST', payload()), testEnv, { provider: fixture });
    expect(response?.status).toBe(409);
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM proposals WHERE owner_id=?`).bind(ownerId).first()).toMatchObject({ count: 0 });
  });

  it('does not persist if the account is blocked during provider search', async () => {
    const fixture = fixtureProvider(async () => { await db.prepare(`UPDATE app_accounts SET status='blocked' WHERE id=?`).bind(ownerId).run(); });
    const response = await handleProposals(request('/api/proposals', 'POST', payload()), testEnv, { provider: fixture });
    expect(response?.status).toBe(409);
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM proposals WHERE owner_id=?`).bind(ownerId).first()).toMatchObject({ count: 0 });
  });

  it('returns 404 for a proposal owned by another account', async () => {
    const foreign = await makeForeignOwner();
    const now = Date.now(), foreignRecipe = crypto.randomUUID(), foreignConnection = crypto.randomUUID(), foreignProposal = crypto.randomUUID();
    const keyInfo = await encryptCredential(testEnv, foreign.id, foreignConnection, 'resume', 'foreign-key');
    await db.prepare(`INSERT INTO connections(id,owner_id,status,generation,encrypted_resume_key,key_version,created_at,updated_at)
      VALUES(?,?,'connected',1,?,?,?,?)`).bind(foreignConnection, foreign.id, keyInfo.ciphertext, keyInfo.keyVersion, now, now).run();
    await db.prepare(`INSERT INTO recipes(id,owner_id,title,base_servings_num,created_at,updated_at) VALUES(?,?,?,2,?,?)`)
      .bind(foreignRecipe, foreign.id, 'Foreign', now, now).run();
    await db.prepare(`INSERT INTO proposals(id,owner_id,recipe_id,recipe_version,connection_id,connection_generation,version,status,
      servings_num,servings_den,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,1,1,'ready',2,1,?,?,?)`)
      .bind(foreignProposal, foreign.id, foreignRecipe, 1, foreignConnection, now + 60_000, now, now).run();
    const response = await handleProposals(request(`/api/proposals/${foreignProposal}`, 'GET'), testEnv);
    expect(response?.status).toBe(404);
  });
});
