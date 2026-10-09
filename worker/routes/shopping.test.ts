import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAuth, type AuthDependencies, type AuthEnv } from '../auth';
import { bootstrapAdmin, consumeInvitation, createInvitation, createInvitedAccount } from '../db';
import type { PicnicProduct, PicnicProductDetails } from '../../shared/picnic';
import type { PicnicProvider } from '../adapters/picnic';
import { encryptCredential } from '../security/credentials';
import { handleShopping } from './shopping';
import { handleActions } from './actions';
import { handleProposals } from './proposals';
import { processAdditionTask } from '../additions/processor';
import type { ShoppingPlan, ShoppingProposalInput, ShoppingProposalResult } from '../../shared/shopping';

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
  id: 'sku-100g', name: 'Tarwebloem', unitQuantity: '100 g',
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
  await db.prepare(`UPDATE app_switches SET add_enabled=1 WHERE singleton=1`).run();
  await db.prepare(`UPDATE app_accounts SET status='active' WHERE id=?`).bind(ownerId).run();
  await db.prepare(`DELETE FROM connections WHERE owner_id=?`).bind(ownerId).run();
  await db.prepare(`DELETE FROM recipes WHERE owner_id=?`).bind(ownerId).run();
  const now = Date.now();
  recipeId = crypto.randomUUID(); ingredientId = crypto.randomUUID(); connectionId = crypto.randomUUID();
  await db.prepare(`INSERT INTO recipes(id,owner_id,title,base_servings_num,base_servings_den,version,created_at,updated_at)
    VALUES(?,?,?,2,1,1,?,?)`).bind(recipeId, ownerId, 'Flour recipe', now, now).run();
  await db.prepare(`INSERT INTO ingredients(id,owner_id,recipe_id,ordinal,original_text,normalized_name,quantity_kind,
    quantity_num,quantity_den,unit,attributes_json,uncertainty_json,created_at)
    VALUES(?,?,?,0,'200 g tarwebloem','tarwebloem','exact',200,1,'g','{"quantityBasis":"net"}','[]',?)`).bind(ingredientId, ownerId, recipeId, now).run();
  const encrypted = await encryptCredential(testEnv, ownerId, connectionId, 'resume', 'provider-key');
  await db.prepare(`INSERT INTO connections(id,owner_id,status,generation,encrypted_resume_key,key_version,created_at,updated_at)
    VALUES(?,?,'connected',1,?,?,?,?)`).bind(connectionId, ownerId, encrypted.ciphertext, encrypted.keyVersion, now, now).run();
});

async function getPlan(fixture = fixtureProvider()): Promise<ShoppingPlan> {
  const response = await handleShopping(request('/api/shopping/plan', 'POST', { recipeId, servings: '4' }), testEnv, { provider: fixture });
  expect(response?.status).toBe(200);
  return (await response!.json() as { plan: ShoppingPlan }).plan;
}

it('returns an explicit deadline failure for a stalled search without a partial plan', async () => {
  const provider = fixtureProvider(async () => new Promise(() => {}));
  const response = await handleShopping(request('/api/shopping/plan', 'POST', {recipeId, servings: '4', deadlineAt: Date.now() + 100}), testEnv, {provider});
  expect(response?.status).toBe(504);
  expect(await response!.json()).toEqual({error: {code: 'PLAN_DEADLINE_EXCEEDED', message: 'Het volledige boodschappenvoorstel lukte niet binnen 30 seconden. Probeer opnieuw.'}});
  expect(provider.search).toHaveBeenCalledTimes(1);
});

it('fails a stalled detail read at the same plan deadline', async () => {
  const provider = fixtureProvider();
  provider.productDetails = vi.fn(async () => new Promise<PicnicProductDetails>(() => {}));
  const response = await handleShopping(request('/api/shopping/plan', 'POST', {recipeId, servings: '4', deadlineAt: Date.now() + 100}), testEnv, {provider});
  expect(response?.status).toBe(504);
  expect(provider.productDetails).toHaveBeenCalledTimes(1);
});

it('rejects invalid deadlines and immediately expires elapsed deadlines without reads', async () => {
  const provider = fixtureProvider();
  const invalid = await handleShopping(request('/api/shopping/plan', 'POST', {recipeId, servings: '4', deadlineAt: 'tomorrow'}), testEnv, {provider});
  expect(invalid?.status).toBe(400);
  const expired = await handleShopping(request('/api/shopping/plan', 'POST', {recipeId, servings: '4', deadlineAt: Date.now() - 1}), testEnv, {provider});
  expect(expired?.status).toBe(504);
  expect(provider.search).not.toHaveBeenCalled();
});
function selection(plan: ShoppingPlan): ShoppingProposalInput {
  return { requestId: crypto.randomUUID(), recipeId, recipeVersion: 1, servings: plan.servings,
    choices: plan.rows.flatMap(row => row.selectedProductId ? [{ groupId: row.id, productId: row.selectedProductId, packCount: row.candidates[0].packCount!,
      assessmentId: row.candidates[0].assessment?.id, expectedPriceCents: row.candidates[0].product.displayPriceCents!, substitutionAccepted: false, remember: false }] : []) };
}
async function extraIngredient(name: string, ordinal: number, amount: number | null = 20): Promise<string> {
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO ingredients(id,owner_id,recipe_id,ordinal,original_text,normalized_name,quantity_kind,quantity_num,quantity_den,unit,attributes_json,created_at)
    VALUES(?,?,?,?,?,?,?, ?,1,?,'{}',?)`).bind(id, ownerId, recipeId, ordinal, name, name, amount === null ? 'unknown' : 'exact', amount, amount === null ? null : 'g', Date.now()).run();
  return id;
}
describe('automatic shopping with real D1 and mocked Picnic', () => {
  it('automatically finds a plan, preserves unknown/unselected rows and submits only the selected subset', async () => {
    await extraIngredient('zout', 1);
    await extraIngredient('onbekend', 2, null);
    const plan = await getPlan();
    expect(plan.rows).toHaveLength(3);
    expect(plan.rows[0]).toMatchObject({ selectedProductId: fixtureProduct.id, pantry: false });
    expect(plan.rows.find(item => item.name === 'keukenzout')?.pantry).toBe(true);
    const input = selection(plan);
    const response = await handleShopping(request('/api/shopping/proposals', 'POST', input), testEnv, { provider: fixtureProvider() });
    expect(response?.status).toBe(201);
    const result = await response!.json() as ShoppingProposalResult;
    expect(result.proposal.totalPriceCents).toBe(200);
    const readback = await handleProposals(request(`/api/proposals/${result.proposal.id}`, 'GET'), testEnv);
    expect(readback?.status).toBe(200);
    expect(await readback!.json()).toMatchObject({ proposal: { totalPriceCents: 200, needs: [{ needed: null }] } });
    const approve = await handleActions(request(`/api/proposals/${result.proposal.id}/approve`, 'POST', { expectedVersion: 1 }), testEnv);
    expect(approve?.status).toBe(202);
    const action = (await approve!.json() as { action: { id: string; lines: unknown[] } }).action;
    expect(action.lines).toHaveLength(1);
    const add = vi.fn(async () => {});
    await processAdditionTask(testEnv, action.id, 1, { add, provider: fixtureProvider() });
    expect(add).toHaveBeenCalledExactlyOnceWith('provider-key', fixtureProduct.id, 4);
  });
  it('sums duplicate ingredients before rounding and retains both source references', async () => {
    const second = await extraIngredient('tarwebloem', 1, 20);
    await db.prepare(`UPDATE ingredients SET quantity_num=20 WHERE id=?`).bind(ingredientId).run();
    const plan = await getPlan();
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0].candidates[0].packCount).toBe(1); // (20 + 20) * 2 / 100, not two separate packages
    const response = await handleShopping(request('/api/shopping/proposals', 'POST', selection(plan)), testEnv, { provider: fixtureProvider() });
    expect(response?.status).toBe(201);
    const result = await response!.json() as ShoppingProposalResult;
    const sources = await db.prepare(`SELECT ingredient_id AS id FROM proposal_need_sources WHERE proposal_id=? ORDER BY id`).bind(result.proposal.id).all();
    expect(sources.results).toEqual([ingredientId, second].sort().map(id => ({ id })));
  });
  it('replays concurrent confirmations as the same proposal and action without another provider mutation', async () => {
    const input = selection(await getPlan());
    const responses = await Promise.all([1, 2].map(() => handleShopping(request('/api/shopping/proposals', 'POST', input), testEnv, { provider: fixtureProvider() })));
    const results = await Promise.all(responses.map(response => response!.json() as Promise<ShoppingProposalResult>));
    expect(results[0].proposal.id).toBe(results[1].proposal.id);
    const approvals = await Promise.all(results.map(result => handleActions(request(`/api/proposals/${result.proposal.id}/approve`, 'POST', { expectedVersion: 1 }), testEnv)));
    const actions = await Promise.all(approvals.map(response => response!.json() as Promise<{ action: { id: string } }>));
    expect(actions[0].action.id).toBe(actions[1].action.id);
    const add = vi.fn(async () => {});
    for (const result of actions) await processAdditionTask(testEnv, result.action.id, 1, { add, provider: fixtureProvider() });
    expect(add).toHaveBeenCalledTimes(1);
  });
  it('continues available products after one selected product disappears, including at send time', async () => {
    await extraIngredient('rijst', 1, 300);
    const rice: PicnicProduct = { ...fixtureProduct, id: 'rice', name: 'Rijst', displayPriceCents: 80 };
    const fixture = fixtureProvider(); fixture.search = vi.fn(async (_key, query) => query === 'rijst' ? [rice] : [fixtureProduct]);
    const plan = await getPlan(fixture);
    const input = selection(plan);
    const prepared = await handleShopping(request('/api/shopping/proposals', 'POST', input), testEnv, { provider: fixture });
    expect(prepared?.status).toBe(201);
    const result = await prepared!.json() as ShoppingProposalResult;
    const approved = await handleActions(request(`/api/proposals/${result.proposal.id}/approve`, 'POST', { expectedVersion: 1 }), testEnv);
    const action = (await approved!.json() as { action: { id: string } }).action;
    fixture.search = vi.fn(async (_key, query) => query === 'rijst' ? [rice] : []);
    const add = vi.fn(async () => {});
    await processAdditionTask(testEnv, action.id, 1, { add, provider: fixture });
    expect(add).toHaveBeenCalledExactlyOnceWith('provider-key', 'rice', 6);
    expect(await db.prepare(`SELECT state FROM actions WHERE id=?`).bind(action.id).first()).toEqual({ state: 'partial' });
    const retry = { ...input, requestId: crypto.randomUUID() };
    const preparedAgain = await handleShopping(request('/api/shopping/proposals', 'POST', retry), testEnv, { provider: fixture });
    expect(preparedAgain?.status).toBe(201);
    expect(await preparedAgain!.json()).toMatchObject({ unavailable: [{ name: 'tarwebloem' }] });
  });

  it('rejects changed payloads under a reused request ID', async () => {
    const input = selection(await getPlan());
    await handleShopping(request('/api/shopping/proposals', 'POST', input), testEnv, { provider: fixtureProvider() });
    input.choices[0].packCount++;
    const response = await handleShopping(request('/api/shopping/proposals', 'POST', input), testEnv, { provider: fixtureProvider() });
    expect(response?.status).toBe(409);
  });
  it('requires opt-in for a personal preference and revalidates suitability', async () => {
    const plan = await getPlan();
    const input = selection(plan);
    await handleShopping(request('/api/shopping/proposals', 'POST', input), testEnv, { provider: fixtureProvider() });
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM ingredient_preferences WHERE owner_id=?`).bind(ownerId).first()).toEqual({ count: 0 });
    input.requestId = crypto.randomUUID(); input.choices[0].remember = true;
    expect((await handleShopping(request('/api/shopping/proposals', 'POST', input), testEnv, { provider: fixtureProvider() }))?.status).toBe(201);
    expect((await getPlan()).rows[0].preferred).toBe(true);
    const substituted = fixtureProvider(); substituted.search = vi.fn(async () => [{ ...fixtureProduct, name: 'Suiker' }]);
    input.requestId = crypto.randomUUID(); input.choices[0].substitutionAccepted = true;
    expect((await handleShopping(request('/api/shopping/proposals', 'POST', input), testEnv, { provider: substituted }))?.status).toBe(409);
  });
  it('does not leak cached catalogue or preferences to another owner and rejects foreign recipes', async () => {
    await getPlan();
    const foreign = await makeForeignOwner();
    const foreignCookie = await signIn(foreign.email);
    const response = await handleShopping(request('/api/shopping/plan', 'POST', { recipeId, servings: '4' }, foreignCookie), testEnv, { provider: fixtureProvider() });
    expect(response?.status).toBe(404);
  });
  it('rejects price changes before approval and never uses a cached final price', async () => {
    const fixture = fixtureProvider();
    const input = selection(await getPlan(fixture));
    fixture.search = vi.fn(async () => [{ ...fixtureProduct, displayPriceCents: 60 }]);
    const response = await handleShopping(request('/api/shopping/proposals', 'POST', input), testEnv, { provider: fixture });
    expect(response?.status).toBe(409);
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM proposals WHERE owner_id=?`).bind(ownerId).first()).toEqual({ count: 0 });
  });
  it('keeps unknown recipe quantities when the user explicitly chooses a package count', async () => {
    await db.prepare(`UPDATE ingredients SET quantity_kind='unknown',quantity_num=NULL,unit=NULL WHERE id=?`).bind(ingredientId).run();
    const plan = await getPlan();
    expect(plan.rows[0].selectedProductId).toBeNull();
    const input = selection(plan);
    input.choices = [{ groupId: plan.rows[0].id, productId: fixtureProduct.id, packCount: 3, assessmentId: plan.rows[0].candidates[0].assessment?.id, expectedPriceCents: 50, substitutionAccepted: false, remember: false }];
    expect((await handleShopping(request('/api/shopping/proposals', 'POST', input), testEnv, { provider: fixtureProvider() }))?.status).toBe(201);
    expect(await db.prepare(`SELECT quantity_kind AS kind,quantity_num AS amount FROM ingredients WHERE id=?`).bind(ingredientId).first()).toEqual({ kind: 'unknown', amount: null });
  });
  it('requires missing base servings, blocks revoked access during search, and does not persist a stale proposal', async () => {
    await db.prepare(`UPDATE recipes SET base_servings_num=NULL WHERE id=?`).bind(recipeId).run();
    expect((await handleShopping(request('/api/shopping/plan', 'POST', { recipeId, servings: '2' }), testEnv))?.status).toBe(422);
    await db.prepare(`UPDATE recipes SET base_servings_num=2 WHERE id=?`).bind(recipeId).run();
    const input = selection(await getPlan());
    const fixture = fixtureProvider(async () => { await db.prepare(`UPDATE recipes SET version=2 WHERE id=?`).bind(recipeId).run(); });
    expect((await handleShopping(request('/api/shopping/proposals', 'POST', input), testEnv, { provider: fixture }))?.status).toBe(409);
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM shopping_requests WHERE owner_id=?`).bind(ownerId).first()).toEqual({ count: 0 });
  });
  it('uses sale-ID checks outside search and rejects changed composition before consent', async () => {
    const fixture = fixtureProvider();
    let description = 'Tarwebloem zonder toevoegingen';
    fixture.productDetails = vi.fn(async (_key, id) => ({product: {...fixtureProduct, id, isAvailable:true,maxCount:50},description,
      infoSections:[],allergens:{contains:[],mayContain:[],original:[]},parserVersion:'test',currentCheckUsable:true}));
    const input = selection(await getPlan(fixture));
    fixture.search = vi.fn(async () => []);
    const prepared = await handleShopping(request('/api/shopping/proposals','POST',input),testEnv,{provider:fixture});
    expect(prepared?.status).toBe(201);
    expect(fixture.search).not.toHaveBeenCalled();
    const result = await prepared!.json() as ShoppingProposalResult;
    const approved = await handleActions(request(`/api/proposals/${result.proposal.id}/approve`,'POST',{expectedVersion:1}),testEnv);
    const action = (await approved!.json() as {action:{id:string}}).action;
    description = 'Andere samenstelling';
    const add = vi.fn(async () => {});
    await processAdditionTask(testEnv,action.id,1,{provider:fixture,add});
    expect(add).not.toHaveBeenCalled();
    const changed = await handleShopping(request('/api/shopping/proposals','POST',{...input,requestId:crypto.randomUUID()}),testEnv,{provider:fixture});
    expect(changed?.status).toBe(409);
    expect(await changed!.json()).toMatchObject({error:{code:'PRODUCT_CONTENT_CHANGED'}});
  });
  it('cannot approve unresolved candidates by accepting a substitution', async () => {
    await db.prepare(`UPDATE ingredients SET normalized_name='mysterie',original_text='mysterie' WHERE id=?`).bind(ingredientId).run();
    const fixture=fixtureProvider(); fixture.search=vi.fn(async()=>[{...fixtureProduct,name:'Mysterie'}]);
    const plan=await getPlan(fixture);
    const candidate=plan.rows[0].candidates[0];
    expect(candidate.match).toBe('unresolved');
    const response=await handleShopping(request('/api/shopping/proposals','POST',{requestId:crypto.randomUUID(),recipeId,recipeVersion:1,servings:'4',choices:[{
      groupId:plan.rows[0].id,productId:fixtureProduct.id,assessmentId:candidate.assessment?.id,packCount:4,expectedPriceCents:50,substitutionAccepted:true,remember:false
    }]}),testEnv,{provider:fixture});
    expect(response?.status).toBe(422);
    expect(await response!.json()).toMatchObject({error:{code:'MATCH_NOT_CONFIRMED'}});
  });

});
