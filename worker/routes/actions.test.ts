import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAuth, type AuthDependencies, type AuthEnv } from '../auth';
import type { PicnicProvider } from '../adapters/picnic';
import type { PicnicProduct } from '../../shared/picnic';
import { processAdditionTask } from '../additions/processor';
import { bootstrapAdmin, consumeInvitation, createApprovedAction, createInvitation, createInvitedAccount, resolveUnknownExecutionLine } from '../db';
import { encryptCredential } from '../security/credentials';
import { handleActions } from './actions';
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
let ownerEmail = '';
let ownerCookie = '';
let proposalId = '';
let recipeId = '';
let connectionId = '';
let needId = '';
let purchaseLineId = '';

function request(path: string, method: string, body?: unknown, cookie = ownerCookie): Request {
  const headers: Record<string, string> = { Origin: testEnv.APP_ORIGIN, 'CF-Connecting-IP': `192.0.2.${Math.floor(Math.random() * 200) + 1}` };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request(`${testEnv.APP_ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function signIn(email: string): Promise<string> {
  const sent = await handleAuth(request('/api/auth/email-otp/send-verification-otp', 'POST', { email, type: 'sign-in' }, ''), testEnv, authDeps);
  expect(sent?.status).toBe(200);
  const otp = messages.at(-1)?.match(/\b\d{6}\b/)?.[0];
  expect(otp).toBeTruthy();
  const reply = await handleAuth(request('/api/auth/sign-in/email-otp', 'POST', { email, otp }, ''), testEnv, authDeps);
  expect(reply?.status).toBe(200);
  return reply?.headers.get('Set-Cookie')?.split(';', 1)[0] ?? '';
}
async function createAdmin(): Promise<{ id: string; email: string }> {
  const id = crypto.randomUUID(), email = `${id}@example.invalid`, now = Date.now();
  await db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`)
    .bind(id, 'Action route test', email, now, now).run();
  await bootstrapAdmin(db, id, email, now);
  return { id, email };
}
async function seedProposal(forOwner = ownerId): Promise<{ proposalId: string; connectionId: string; recipeId: string; purchaseLineId: string }> {
  const now = Date.now(), connection = crypto.randomUUID(), recipe = crypto.randomUUID(), proposal = crypto.randomUUID();
  const need = crypto.randomUUID(), ingredient = crypto.randomUUID(), purchase = crypto.randomUUID();
  const encrypted = await encryptCredential(testEnv, forOwner, connection, 'resume', 'provider-key');
  await db.prepare(`INSERT INTO connections(id,owner_id,status,generation,encrypted_resume_key,key_version,created_at,updated_at)
    VALUES(?,?,'connected',1,?,?,?,?)`).bind(connection, forOwner, encrypted.ciphertext, encrypted.keyVersion, now, now).run();
  await db.prepare(`INSERT INTO recipes(id,owner_id,title,base_servings_num,version,created_at,updated_at) VALUES(?,?,?,2,1,?,?)`)
    .bind(recipe, forOwner, 'Action fixture recipe', now, now).run();
  await db.prepare(`INSERT INTO ingredients(id,owner_id,recipe_id,ordinal,original_text,normalized_name,quantity_kind,quantity_num,
    quantity_den,unit,attributes_json,uncertainty_json,created_at) VALUES(?,?,?,0,'200 g flour','flour','exact',200,1,'g','{"quantityBasis":"net"}','[]',?)`)
    .bind(ingredient, forOwner, recipe, now).run();
  await db.prepare(`INSERT INTO proposals(id,owner_id,recipe_id,recipe_version,connection_id,connection_generation,version,status,
    servings_num,servings_den,checked_at,expires_at,created_at,updated_at) VALUES(?,?,?,1,?,1,1,'ready',4,1,?,?,?,?)`)
    .bind(proposal, forOwner, recipe, connection, now, now + 600_000, now, now).run();
  await db.prepare(`INSERT INTO proposal_needs(id,owner_id,proposal_id,ordinal,normalized_name,quantity_kind,quantity_num,quantity_den,unit)
    VALUES(?,?,?,0,'flour','exact',400,1,'g')`).bind(need, forOwner, proposal).run();
  await db.prepare(`INSERT INTO proposal_need_sources(owner_id,proposal_id,recipe_id,need_id,ingredient_id) VALUES(?,?,?,?,?)`)
    .bind(forOwner, proposal, recipe, need, ingredient).run();
  await db.prepare(`INSERT INTO purchase_lines(id,owner_id,proposal_id,need_id,ordinal,product_snapshot_json,pack_count,
    pack_quantity_num,pack_quantity_den,unit,price_cents) VALUES(?,?,?,?,0,?,4,100,1,'g',50)`)
    .bind(purchase, forOwner, proposal, need, JSON.stringify({ id: 'sku-flour', name: 'Flour', unitQuantity: '100 g',
      quantity: { kind: 'exact', amount: '100', unit: 'g', basis: 'net' }, priceCents: 50, packCount: 4,
      suppliedUnit: 'g', supplied: '400', overshoot: '0' })).run();
  return { proposalId: proposal, connectionId: connection, recipeId: recipe, purchaseLineId: purchase };
}
async function invitedOwner(): Promise<{ id: string; email: string }> {
  const id = crypto.randomUUID(), email = `${id}@example.invalid`, now = Date.now(), invitationId = crypto.randomUUID();
  await createInvitation(db, ownerId, { id: invitationId, email, tokenHash: crypto.randomUUID(), createdAt: now, expiresAt: now + 60_000 });
  await db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`).bind(id, 'Foreign action', email, now, now).run();
  await createInvitedAccount(db, id, invitationId, email, now);
  await consumeInvitation(db, id, invitationId, email, now);
  return { id, email };
}

beforeAll(async () => {
  const migrationEnv = env as typeof env & { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] };
  if (!(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_accounts'").first())) {
    await applyD1Migrations(db, migrationEnv.TEST_MIGRATIONS);
  }
  const owner = await createAdmin();
  ownerId = owner.id; ownerEmail = owner.email; ownerCookie = await signIn(ownerEmail);
});
beforeEach(async () => {
  await db.prepare(`UPDATE app_accounts SET status='active' WHERE id=?`).bind(ownerId).run();
  await db.prepare(`UPDATE app_switches SET add_enabled=1 WHERE singleton=1`).run();
  await db.prepare(`DELETE FROM connections WHERE owner_id=?`).bind(ownerId).run();
  await db.prepare(`DELETE FROM recipes WHERE owner_id=?`).bind(ownerId).run();
  const seeded = await seedProposal();
  proposalId = seeded.proposalId; connectionId = seeded.connectionId; recipeId = seeded.recipeId; purchaseLineId = seeded.purchaseLineId;
  needId = (await db.prepare(`SELECT id FROM proposal_needs WHERE proposal_id=?`).bind(proposalId).first<{ id: string }>())?.id ?? '';
});

describe('approval and action routes', () => {
  it('creates an immutable action from persisted lines and returns safe status details', async () => {
    const response = await handleActions(request(`/api/proposals/${proposalId}/approve`, 'POST', { expectedVersion: 1, totalPriceCents: 1, lines: [] }), testEnv);
    expect(response?.status).toBe(202);
    const body = await response!.json() as { action: { id: string; state: string; totalPriceCents: number; lines: Array<Record<string, unknown>> } };
    expect(body.action).toMatchObject({ state: 'queued', totalPriceCents: 200, lines: [{ productId: 'sku-flour', name: 'Flour', count: 4, unitPriceCents: 50, lineTotalCents: 200, status: 'unsent' }] });
    expect(JSON.stringify(body)).not.toContain('provider-key');
    expect(await db.prepare(`SELECT ap.total_price_cents AS totalPriceCents,ap.snapshot_json AS snapshot
      FROM approvals ap JOIN actions a ON a.owner_id=ap.owner_id AND a.approval_id=ap.id WHERE a.id=?`)
      .bind(body.action.id).first<{ totalPriceCents: number; snapshot: string }>()).toMatchObject({ totalPriceCents: 200 });
    const recovered = await handleActions(request(`/api/proposals/${proposalId}/action`, 'GET'), testEnv);
    expect(recovered?.status).toBe(200);
    expect(await recovered!.json()).toMatchObject({ action: { id: body.action.id } });
    const loaded = await handleActions(request(`/api/actions/${body.action.id}`, 'GET'), testEnv);
    expect(loaded?.status).toBe(200);
    expect(await loaded!.json()).toMatchObject({ action: { id: body.action.id, totalPriceCents: 200 } });
  });

  it('returns the same action for repeated and concurrent approval requests', async () => {
    const first = await handleActions(request(`/api/proposals/${proposalId}/approve`, 'POST', { expectedVersion: 1 }), testEnv);
    const firstBody = await first!.json() as { action: { id: string } };
    const duplicate = await handleActions(request(`/api/proposals/${proposalId}/approve`, 'POST', { expectedVersion: 1 }), testEnv);
    expect(duplicate?.status).toBe(200);
    expect(await duplicate!.json()).toMatchObject({ action: { id: firstBody.action.id } });
    const concurrent = await Promise.all([
      handleActions(request(`/api/proposals/${proposalId}/approve`, 'POST', { expectedVersion: 1 }), testEnv),
      handleActions(request(`/api/proposals/${proposalId}/approve`, 'POST', { expectedVersion: 1 }), testEnv),
    ]);
    expect(concurrent.map(result => result?.status).sort()).toEqual([200, 200]);
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM actions WHERE owner_id=? AND proposal_id=?`).bind(ownerId, proposalId).first())
      .toMatchObject({ count: 1 });
  });

  it('rejects stale version, expired proposal, and inactive account', async () => {
    expect((await handleActions(request(`/api/proposals/${proposalId}/approve`, 'POST', { expectedVersion: 2 }), testEnv))?.status).toBe(409);
    await db.prepare(`UPDATE proposals SET expires_at=? WHERE id=?`).bind(Date.now() - 1, proposalId).run();
    expect((await handleActions(request(`/api/proposals/${proposalId}/approve`, 'POST', { expectedVersion: 1 }), testEnv))?.status).toBe(409);
    await db.prepare(`UPDATE proposals SET expires_at=? WHERE id=?`).bind(Date.now() + 60_000, proposalId).run();
    await db.prepare(`UPDATE app_accounts SET status='blocked' WHERE id=?`).bind(ownerId).run();
    expect((await handleActions(request(`/api/proposals/${proposalId}/approve`, 'POST', { expectedVersion: 1 }), testEnv))?.status).toBe(401);
  });

  it('does not expose another owner’s action', async () => {
    const foreign = await invitedOwner();
    const actionOwner = await db.prepare(`SELECT id FROM app_accounts WHERE id=?`).bind(foreign.id).first<{ id: string }>();
    expect(actionOwner?.id).toBe(foreign.id);
    const foreignCookie = await signIn(foreign.email);
    const seeded = await seedProposal(foreign.id);
    const session = await db.prepare(`SELECT session_id AS sessionId FROM session_metadata WHERE owner_id=? ORDER BY authenticated_at DESC LIMIT 1`)
      .bind(foreign.id).first<{ sessionId: string }>();
    const actionId = crypto.randomUUID(), approvalId = crypto.randomUUID(), now = Date.now();
    await createApprovedAction(db, foreign.id, { id: approvalId, proposalId: seeded.proposalId, proposalVersion: 1,
      startingSessionId: session!.sessionId, snapshot: { totalPriceCents: 200 }, totalPriceCents: 200, approvedAt: now, expiresAt: now + 60_000 },
    { id: actionId, approvalId, proposalId: seeded.proposalId, connectionId: seeded.connectionId, connectionGeneration: 1,
      createdAt: now, purchaseLineIds: [seeded.purchaseLineId] });
    const response = await handleActions(request(`/api/actions/${actionId}`, 'GET'), testEnv);
    expect(response?.status).toBe(404);
    const resolve = await handleActions(request(`/api/actions/${actionId}/resolve`, 'POST',
      { lineId: `${actionId}:0`, resolution: 'confirmed_added' }, ownerCookie), testEnv);
    expect(resolve?.status).toBe(404);
    expect(foreignCookie).toBeTruthy();
  });

  it('lets the owner resolve only unknown outcomes and releases the claim after verification', async () => {
    const created = await handleActions(request(`/api/proposals/${proposalId}/approve`, 'POST', { expectedVersion: 1 }), testEnv);
    const action = (await created!.json() as { action: { id: string; lines: Array<{ id: string }> } }).action;
    const premature = await handleActions(request(`/api/actions/${action.id}/resolve`, 'POST',
      { lineId: action.lines[0].id, resolution: 'confirmed_added' }), testEnv);
    expect(premature?.status).toBe(409);
    await db.batch([
      db.prepare(`UPDATE execution_lines SET status='unknown' WHERE owner_id=? AND action_id=? AND id=?`).bind(ownerId, action.id, action.lines[0].id),
      db.prepare(`UPDATE actions SET state='unknown' WHERE owner_id=? AND id=?`).bind(ownerId, action.id),
      db.prepare(`UPDATE connection_execution_claims SET state='unknown' WHERE owner_id=? AND action_id=?`).bind(ownerId, action.id),
    ]);
    // Simulate a crash after the line resolution commits but before the action is finalized.
    expect(await resolveUnknownExecutionLine(db, ownerId, action.id, action.lines[0].id, 'confirmed_added', Date.now())).toBe(true);
    const response = await handleActions(request(`/api/actions/${action.id}/resolve`, 'POST',
      { lineId: action.lines[0].id, resolution: 'confirmed_added' }), testEnv);
    expect(response?.status).toBe(200);
    expect(await response!.json()).toMatchObject({ action: { state: 'resolved', lines: [{ status: 'added' }] } });
    expect((await handleActions(request(`/api/actions/${action.id}/resolve`, 'POST',
      { lineId: action.lines[0].id, resolution: 'confirmed_added' }), testEnv))?.status).toBe(200);
    expect((await handleActions(request(`/api/actions/${action.id}/resolve`, 'POST',
      { lineId: action.lines[0].id, resolution: 'confirmed_not_added' }), testEnv))?.status).toBe(409);
    expect(await db.prepare(`SELECT state FROM connection_execution_claims WHERE owner_id=? AND action_id=?`)
      .bind(ownerId, action.id).first()).toMatchObject({ state: 'released' });
  });

  it('completes one recipe through proposal, approval, addition, reload, and duplicate suppression', async () => {
    const product: PicnicProduct = { id: 'sku-e2e-flour', name: 'E2E flour', unitQuantity: '100 g',
      quantity: { kind: 'exact', amount: '100', unit: 'g', basis: null }, displayPriceCents: 75,
      priceCertainty: 'known', priceRanges: [], identity: { groupId: 'sku-e2e-flour', variantId: 'sku-e2e-flour' } };
    const provider: PicnicProvider = {
      login: async () => ({ authKey: 'unused', requiresSms: false, externalIdentity: 'unused' }),
      requestSms: async () => {}, verifySms: async () => ({ authKey: 'unused' }), cart: async () => [],
      search: vi.fn(async (_authKey, _query) => [product]),
    };
    const deps = { ...authDeps, provider };
    const savedRecipeResponse = await handleRequest(request('/api/recipes', 'POST', {
      title: 'E2E flour recipe', sourceLabel: null, sourceUrl: null, baseServings: '2', steps: [], uploads: [],
      ingredients: [{ originalText: '100 g flour', normalizedName: 'flour', section: null,
        quantity: { kind: 'exact', amount: '100', unit: 'g', basis: 'net' }, sourceOrigin: 'user', attributes: {}, uncertainty: [] }],
    }), testEnv, deps);
    expect(savedRecipeResponse.status).toBe(201);
    const saved = await savedRecipeResponse.json() as { recipe: { id: string; version: number; ingredients: Array<{ id: string }> } };
    const proposedResponse = await handleRequest(request('/api/proposals', 'POST', {
      recipeId: saved.recipe.id, recipeVersion: saved.recipe.version, servings: '4',
      choices: [{ ingredientId: saved.recipe.ingredients[0].id, query: 'flour', productId: product.id, basis: 'net' }],
    }), testEnv, deps);
    expect(proposedResponse.status).toBe(201);
    const proposed = await proposedResponse.json() as { proposal: { id: string; version: number; totalPriceCents: number } };
    expect(proposed.proposal.totalPriceCents).toBe(150);
    const approvedResponse = await handleRequest(request(`/api/proposals/${proposed.proposal.id}/approve`, 'POST',
      { expectedVersion: proposed.proposal.version }), testEnv, deps);
    expect(approvedResponse.status).toBe(202);
    const approved = await approvedResponse.json() as { action: { id: string } };
    const add = vi.fn(async (_authKey: string, _productId: string, _count: number) => {});
    await expect(processAdditionTask(testEnv, approved.action.id, 1, { add })).resolves.toBe('done');
    const loaded = await handleRequest(request(`/api/actions/${approved.action.id}`, 'GET'), testEnv, deps);
    expect(loaded.status).toBe(200);
    expect(await loaded.json()).toMatchObject({ action: { id: approved.action.id, state: 'succeeded', totalPriceCents: 150,
      lines: [{ productId: product.id, count: 2, status: 'added' }] } });
    const repeated = await handleRequest(request(`/api/proposals/${proposed.proposal.id}/approve`, 'POST',
      { expectedVersion: proposed.proposal.version }), testEnv, deps);
    expect(repeated.status).toBe(200);
    expect(await repeated.json()).toMatchObject({ action: { id: approved.action.id } });
    await expect(processAdditionTask(testEnv, approved.action.id, 1, { add })).resolves.toBe('done');
    expect(add).toHaveBeenCalledTimes(1);
  });
});
