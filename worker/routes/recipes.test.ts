import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleAuth, type AuthDependencies, type AuthEnv } from '../auth';
import { bootstrapAdmin } from '../db';
import { handleRecipes } from './recipes';
import { handleRequest } from '../index';

const db = env.DB;
const testEnv: AuthEnv = {
  DB: db, APP_ORIGIN: 'https://picnic.test', APP_ENV: 'test',
  AUTH_SECRET: 'test-auth-secret-of-at-least-thirty-two-bytes',
  OTP_HMAC_SECRET: 'test-otp-secret-of-at-least-thirty-two-bytes',
  EMAIL_ADDRESS_HMAC_SECRET: 'test-address-secret-of-at-least-thirty-two-bytes',
};
const messages: { to: string; subject: string; text: string }[] = [];
const deps: AuthDependencies = { sendEmail: async message => { messages.push(message); } };
let adminEmail = '';
let memberEmail = '';
let adminCookie = '';
let memberCookie = '';

function request(path: string, method: string, body?: unknown, cookie?: string): Request {
  const headers: Record<string, string> = { Origin: testEnv.APP_ORIGIN, 'CF-Connecting-IP': `192.0.2.${Math.floor(Math.random() * 200) + 1}` };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request(`${testEnv.APP_ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function signIn(email: string): Promise<string> {
  const sent = await handleAuth(request('/api/auth/email-otp/send-verification-otp', 'POST', { email, type: 'sign-in' }), testEnv, deps);
  expect(sent?.status).toBe(200);
  const otp = messages.at(-1)?.text.match(/\b\d{6}\b/)?.[0];
  expect(otp).toBeTruthy();
  const reply = await handleAuth(request('/api/auth/sign-in/email-otp', 'POST', { email, otp }), testEnv, deps);
  expect(reply?.status).toBe(200);
  const cookie = reply?.headers.get('Set-Cookie')?.split(';', 1)[0];
  expect(cookie).toBeTruthy();
  return cookie!;
}
async function createMember(): Promise<string> {
  const existing = await db.prepare(`SELECT email FROM app_accounts WHERE role='member' AND status='active' LIMIT 1`)
    .first<{ email: string }>();
  if (existing) return existing.email;
  const email = `${crypto.randomUUID()}@example.invalid`;
  const now = Date.now();
  const admin = await db.prepare(`SELECT id FROM app_accounts WHERE email=?`).bind(adminEmail).first<{ id: string }>();
  const invitationId = crypto.randomUUID(), memberId = crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO invitations(id,email,token_hash,status,invited_by,created_at,expires_at) VALUES(?,?,?,'pending',?,?,?)`)
      .bind(invitationId, email, crypto.randomUUID(), admin!.id, now, now + 86_400_000),
    db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,?,?)`)
      .bind(memberId, email, email, now, now),
    db.prepare(`INSERT INTO app_accounts(id,email,role,status,invitation_id,created_at,updated_at) VALUES(?,?,'member','invited',?,?,?)`)
      .bind(memberId, email, invitationId, now, now),
  ]);
  return email;
}
async function createStoredUpload(ownerId: string): Promise<string> {
  const id = crypto.randomUUID(), now = Date.now();
  await db.prepare(`INSERT OR IGNORE INTO user_upload_usage(owner_id) VALUES(?)`).bind(ownerId).run();
  await db.prepare(`INSERT INTO uploads(id,owner_id,object_key,media_type,byte_size,status,created_at)
    VALUES(?,?,?,'image/png',100,'reserved',?)`).bind(id, ownerId, `test/${id}.png`, now).run();
  await db.prepare(`UPDATE uploads SET status='stored' WHERE id=?`).bind(id).run();
  return id;
}
async function seedImport(ownerId: string, options: { id?: string; status?: string; expiresAt?: number; sourceKind?: string; sourceText?: string | null; sourceUrl?: string | null; candidates?: unknown[] } = {}) {
  const id = options.id ?? crypto.randomUUID(), now = Date.now();
  const candidate = (title: string) => ({ title, sourceTitle: null, sourceUrl: null, baseServings: null,
    sections: [], ingredients: [], steps: [], uncertainty: [] });
  await db.prepare(`INSERT INTO imports(id,owner_id,source_kind,source_url,source_text,source_label,source_title,status,result_json,expires_at,created_at,updated_at)
    VALUES(?,?,?,?,?,'Original label','Extracted title',?,?,?, ?,?)`)
    .bind(id, ownerId, options.sourceKind ?? 'text', options.sourceUrl ?? null, options.sourceText ?? 'Original recipe text',
      options.status ?? 'needs_review', JSON.stringify(options.candidates ?? [candidate('First'), candidate('Second')]),
      options.expiresAt ?? now + 60_000, now, now).run();
  return id;
}
const recipeInput = (title: string) => ({ title, baseServings: null, sourceLabel: 'Edited label', sourceUrl: null,
  steps: ['Edited step'], ingredients: [], uploads: [] });

beforeAll(async () => {
  const migrationEnv = env as typeof env & { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] };
  const exists = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_accounts'").first();
  if (!exists) await applyD1Migrations(db, migrationEnv.TEST_MIGRATIONS);
  const admin = await db.prepare(`SELECT id,email FROM app_accounts WHERE role='admin' AND status='active' LIMIT 1`)
    .first<{ id: string; email: string }>();
  if (admin) adminEmail = admin.email;
  else {
    const id = crypto.randomUUID(), now = Date.now();
    adminEmail = `${id}@example.invalid`;
    await db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`)
      .bind(id, 'Admin', adminEmail, now, now).run();
    await bootstrapAdmin(db, id, adminEmail, now);
  }
  adminCookie = await signIn(adminEmail);
  memberEmail = await createMember();
  memberCookie = await signIn(memberEmail);
});

describe('authenticated recipe routes with D1', () => {
  it('automatically adopts the same candidate once across concurrent requests and retries after expiry', async () => {
    const owner = await db.prepare(`SELECT id FROM app_accounts WHERE email=?`).bind(memberEmail).first<{ id: string }>();
    const importId = await seedImport(owner!.id);
    const body = { ...recipeInput('Automatic import'), autoSave: true, importSource: { importId, candidateIndex: 0 } };
    const responses = await Promise.all([1, 2].map(() => handleRecipes(request('/api/recipes', 'POST', body, memberCookie), testEnv)));
    const results = await Promise.all(responses.map(response => response!.json() as Promise<{ recipe: { id: string } }>));
    expect(results[0].recipe.id).toBe(results[1].recipe.id);
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM recipe_sources WHERE owner_id=? AND import_id=?`).bind(owner!.id, importId).first()).toEqual({ count: 1 });
    await db.prepare(`UPDATE imports SET expires_at=1 WHERE id=?`).bind(importId).run();
    const retry = await handleRecipes(request('/api/recipes', 'POST', body, memberCookie), testEnv);
    expect(retry?.status).toBe(200);
    expect(await retry!.json()).toMatchObject({ recipe: { id: results[0].recipe.id } });
  });

  it('saves immutable source snapshots for selected and manual candidates and omits them from lists', async () => {
    const owner = await db.prepare(`SELECT id FROM app_accounts WHERE email=?`).bind(memberEmail).first<{ id: string }>();
    const importId = await seedImport(owner!.id);
    const response = await handleRecipes(request('/api/recipes', 'POST', { ...recipeInput('Imported one'),
      importSource: { importId, candidateIndex: 1 } }, memberCookie), testEnv);
    expect(response?.status).toBe(201);
    const recipe = (await response!.json() as { recipe: { id: string; sourceSnapshot: unknown } }).recipe;
    expect(recipe.sourceSnapshot).toMatchObject({ kind: 'text', sourceLabel: 'Original label', sourceText: 'Original recipe text',
      selectedCandidate: { title: 'Second' } });
    expect(await db.prepare(`SELECT status FROM imports WHERE id=?`).bind(importId).first()).toEqual({ status: 'saved' });
    const listed = await handleRecipes(request('/api/recipes', 'GET', undefined, memberCookie), testEnv);
    const listRecipe = (await listed!.json() as { recipes: Record<string, unknown>[] }).recipes.find(item => item.id === recipe.id)!;
    expect(Object.hasOwn(listRecipe, 'sourceSnapshot')).toBe(false);
    const detail = await handleRecipes(request(`/api/recipes/${recipe.id}`, 'GET', undefined, memberCookie), testEnv);
    expect((await detail!.json() as { recipe: { sourceSnapshot: unknown } }).recipe.sourceSnapshot).toMatchObject({ selectedCandidate: { title: 'Second' } });

    const manual = await handleRecipes(request(`/api/recipes/${recipe.id}`, 'PUT', { ...recipeInput('Edited again'), expectedVersion: 1 }, memberCookie), testEnv);
    expect(manual?.status).toBe(200);
    expect((await manual!.json() as { recipe: { sourceSnapshot: unknown } }).recipe.sourceSnapshot).toMatchObject({ selectedCandidate: { title: 'Second' } });
    const rejectedRewrite = await handleRecipes(request(`/api/recipes/${recipe.id}`, 'PUT', {
      ...recipeInput('Cannot rewrite'), expectedVersion: 2, importSource: { importId, candidateIndex: 0 },
    }, memberCookie), testEnv);
    expect(rejectedRewrite?.status).toBe(400);
    expect(JSON.parse((await db.prepare(`SELECT selected_candidate_json AS candidate FROM recipe_sources WHERE recipe_id=?`)
      .bind(recipe.id).first<{ candidate: string }>())!.candidate)).toMatchObject({ title: 'Second' });

    const failedImport = await seedImport(owner!.id, { status: 'failed', candidates: [], sourceText: 'Hand-edited source' });
    const fallback = await handleRecipes(request('/api/recipes', 'POST', { ...recipeInput('Manual fallback'),
      importSource: { importId: failedImport, candidateIndex: null } }, memberCookie), testEnv);
    expect(fallback?.status).toBe(201);
    expect((await fallback!.json() as { recipe: { sourceSnapshot: unknown } }).recipe.sourceSnapshot)
      .toMatchObject({ sourceText: 'Hand-edited source', selectedCandidate: null });

    // A saved import remains usable for another candidate until its original expiry.
    const secondSave = await handleRecipes(request('/api/recipes', 'POST', { ...recipeInput('Imported two'),
      importSource: { importId, candidateIndex: 0 } }, memberCookie), testEnv);
    expect(secondSave?.status).toBe(201);
    expect((await secondSave!.json() as { recipe: { sourceSnapshot: { selectedCandidate: { title: string } } } }).recipe.sourceSnapshot.selectedCandidate.title).toBe('First');
  });

  it('rejects foreign, expired, nonready, and out-of-range import sources', async () => {
    const owner = await db.prepare(`SELECT id FROM app_accounts WHERE email=?`).bind(memberEmail).first<{ id: string }>();
    const admin = await db.prepare(`SELECT id FROM app_accounts WHERE email=?`).bind(adminEmail).first<{ id: string }>();
    const foreign = await seedImport(admin!.id);
    const expired = await seedImport(owner!.id, { expiresAt: Date.now() - 1 });
    const queued = await seedImport(owner!.id, { status: 'queued' });
    const source = (importId: string, candidateIndex: number | null) => ({ ...recipeInput('Rejected import'), importSource: { importId, candidateIndex } });
    for (const [payload, status, code] of [
      [source(foreign, 0), 404, 'IMPORT_NOT_FOUND'], [source(expired, 0), 409, 'IMPORT_EXPIRED'],
      [source(queued, 0), 409, 'IMPORT_NOT_READY'], [source(await seedImport(owner!.id), 2), 400, 'INVALID_IMPORT_CANDIDATE'],
    ] as const) {
      const response = await handleRecipes(request('/api/recipes', 'POST', payload, memberCookie), testEnv);
      expect(response?.status).toBe(status);
      expect(await response!.json()).toMatchObject({ error: { code } });
    }
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM recipes WHERE owner_id=? AND title='Rejected import'`).bind(owner!.id).first())
      .toEqual({ count: 0 });
  });

  it('deletes only the owner source with a live session and soft deletion removes snapshots', async () => {
    const owner = await db.prepare(`SELECT id FROM app_accounts WHERE email=?`).bind(memberEmail).first<{ id: string }>();
    const importId = await seedImport(owner!.id);
    const created = await handleRecipes(request('/api/recipes', 'POST', { ...recipeInput('Source deletion'),
      importSource: { importId, candidateIndex: 0 } }, memberCookie), testEnv);
    const { recipe } = await created!.json() as { recipe: { id: string } };
    expect((await handleRecipes(request(`/api/recipes/${recipe.id}/source`, 'DELETE', undefined, adminCookie), testEnv))?.status).toBe(404);
    const blocked = await handleRecipes(request(`/api/recipes/${recipe.id}/source`, 'DELETE', undefined, memberCookie), testEnv, {
      beforeWrite: async () => { await db.prepare(`UPDATE app_accounts SET status='blocked' WHERE id=?`).bind(owner!.id).run(); },
    });
    expect(blocked?.status).toBe(403);
    await db.prepare(`UPDATE app_accounts SET status='active' WHERE id=?`).bind(owner!.id).run();
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM recipe_sources WHERE recipe_id=?`).bind(recipe.id).first()).toEqual({ count: 1 });
    const session = await db.prepare(`SELECT session_id AS id FROM session_metadata WHERE owner_id=? AND revoked_at IS NULL LIMIT 1`)
      .bind(owner!.id).first<{ id: string }>();
    const revoked = await handleRecipes(request(`/api/recipes/${recipe.id}/source`, 'DELETE', undefined, memberCookie), testEnv, {
      beforeWrite: async () => { await db.prepare(`UPDATE session_metadata SET revoked_at=? WHERE session_id=?`).bind(Date.now(), session!.id).run(); },
    });
    expect(revoked?.status).toBe(401);
    await db.prepare(`UPDATE session_metadata SET revoked_at=NULL WHERE session_id=?`).bind(session!.id).run();
    const detached = await handleRecipes(request(`/api/recipes/${recipe.id}/source`, 'DELETE', undefined, memberCookie), testEnv);
    expect(detached?.status).toBe(204);
    expect(await db.prepare(`SELECT title FROM recipes WHERE id=?`).bind(recipe.id).first()).toEqual({ title: 'Source deletion' });
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM recipe_sources WHERE recipe_id=?`).bind(recipe.id).first()).toEqual({ count: 0 });

    const recreate = await handleRecipes(request('/api/recipes', 'POST', { ...recipeInput('Soft deleted source'),
      importSource: { importId, candidateIndex: 1 } }, memberCookie), testEnv);
    expect(recreate?.status).toBe(201);
    const { recipe: recreated } = await recreate!.json() as { recipe: { id: string } };
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM recipe_sources WHERE recipe_id=?`).bind(recreated.id).first()).toEqual({ count: 1 });
    const softDeleted = await handleRecipes(request(`/api/recipes/${recreated.id}`, 'DELETE', undefined, memberCookie), testEnv);
    expect(softDeleted?.status).toBe(204);
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM recipe_sources WHERE recipe_id=?`).bind(recreated.id).first()).toEqual({ count: 0 });
  });

  it('does not create a recipe when import expiry or account access changes before the batch', async () => {
    const owner = await db.prepare(`SELECT id FROM app_accounts WHERE email=?`).bind(memberEmail).first<{ id: string }>();
    const expiring = await seedImport(owner!.id);
    const expired = await handleRecipes(request('/api/recipes', 'POST', { ...recipeInput('Expiry race'),
      importSource: { importId: expiring, candidateIndex: 0 } }, memberCookie), testEnv, {
      now: () => Date.now(), beforeWrite: async () => {
        await db.prepare(`UPDATE imports SET expires_at=? WHERE id=?`).bind(Date.now() - 1, expiring).run();
      },
    });
    expect(expired?.status).toBe(409);
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM recipes WHERE title='Expiry race'`).first()).toEqual({ count: 0 });

    let clock = Date.now();
    const clockBound = await seedImport(owner!.id, { expiresAt: clock + 500 });
    const elapsed = await handleRecipes(request('/api/recipes', 'POST', { ...recipeInput('Clock expiry race'),
      importSource: { importId: clockBound, candidateIndex: 0 } }, memberCookie), testEnv, {
      now: () => clock, beforeWrite: async () => { clock += 1_000; },
    });
    expect(elapsed?.status).toBe(409);
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM recipes WHERE title='Clock expiry race'`).first()).toEqual({ count: 0 });

    const blockedImport = await seedImport(owner!.id);
    const blocked = await handleRecipes(request('/api/recipes', 'POST', { ...recipeInput('Blocked source race'),
      importSource: { importId: blockedImport, candidateIndex: 0 } }, memberCookie), testEnv, {
      beforeWrite: async () => { await db.prepare(`UPDATE app_accounts SET status='blocked' WHERE id=?`).bind(owner!.id).run(); },
    });
    expect(blocked?.status).toBe(403);
    await db.prepare(`UPDATE app_accounts SET status='active' WHERE id=?`).bind(owner!.id).run();
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM recipes WHERE title='Blocked source race'`).first()).toEqual({ count: 0 });
    expect(await db.prepare(`SELECT status FROM imports WHERE id=?`).bind(blockedImport).first()).toEqual({ status: 'needs_review' });
  });

  it('stores exact quantities, hides other owners, CAS-updates content, and keeps proposal history', async () => {
    const owner = await db.prepare(`SELECT id FROM app_accounts WHERE email=?`).bind(memberEmail).first<{ id: string }>();
    const uploadId = await createStoredUpload(owner!.id);
    const saved = await handleRequest(request('/api/recipes', 'POST', {
      title: 'Tomatensoep', baseServings: '2', sourceLabel: 'Keuken', steps: ['Snijd de tomaten.'],
      ingredients: [{ section: null, originalText: '1/3 kg tomaten', normalizedName: 'tomaat',
        quantity: { kind: 'exact', amount: '1/3', unit: 'kg' }, sourceOrigin: 'user', attributes: {}, uncertainty: [] }], uploads: [uploadId],
    }, memberCookie), testEnv);
    expect(saved?.status).toBe(201);
    const recipe = (await saved!.json() as { recipe: { id: string; version: number; ingredients: { quantity: { amount: string } }[] } }).recipe;
    expect(recipe.ingredients[0].quantity.amount).toBe('1/3');
    expect((await handleRecipes(request(`/api/recipes/${recipe.id}`, 'GET', undefined, adminCookie), testEnv))?.status).toBe(404);
    expect((await handleRecipes(request(`/api/recipes/${recipe.id}`, 'GET', undefined, memberCookie), testEnv))?.status).toBe(200);

    const ingredientId = await db.prepare(`SELECT id FROM ingredients WHERE recipe_id=? AND retired_at IS NULL`)
      .bind(recipe.id).first<{ id: string }>();
    const connectionId = crypto.randomUUID(), proposalId = crypto.randomUUID(), needId = crypto.randomUUID();
    const now = Date.now();
    await db.prepare(`INSERT INTO connections(id,owner_id,status,generation,encrypted_resume_key,key_version,created_at,updated_at)
      VALUES(?,?,'connected',1,'encrypted','v1',?,?)`).bind(connectionId, owner!.id, now, now).run();
    await db.prepare(`INSERT INTO proposals(id,owner_id,recipe_id,recipe_version,connection_id,connection_generation,version,status,expires_at,created_at,updated_at)
      VALUES(?,?,?,1,?,1,1,'draft',?,?,?)`).bind(proposalId, owner!.id, recipe.id, connectionId, now + 60_000, now, now).run();
    await db.prepare(`INSERT INTO proposal_needs(id,owner_id,proposal_id,ordinal,quantity_kind,unit)
      VALUES(?,?,?,0,'global','piece')`).bind(needId, owner!.id, proposalId).run();
    await db.prepare(`INSERT INTO proposal_need_sources(owner_id,proposal_id,recipe_id,need_id,ingredient_id) VALUES(?,?,?,?,?)`)
      .bind(owner!.id, proposalId, recipe.id, needId, ingredientId!.id).run();

    const putBody = (title: string, amount: string) => ({ expectedVersion: 1, title, baseServings: '4', sourceLabel: null, sourceUrl: null,
      steps: ['Kook de soep.'], ingredients: [{ section: null, originalText: `${amount} g tomaten`, normalizedName: 'tomaat',
        quantity: { kind: 'exact', amount, unit: 'g', basis: 'net' }, sourceOrigin: 'user', attributes: {}, uncertainty: [] }], uploads: [uploadId] });
    const variants = [putBody('Winner A', '700'), putBody('Winner B', '900')];
    const concurrent = await Promise.all(variants.map(body => handleRecipes(request(`/api/recipes/${recipe.id}`, 'PUT', body, memberCookie), testEnv)));
    expect(concurrent.map(response => response?.status).sort()).toEqual([200, 409]);
    const winningIndex = concurrent.findIndex(response => response?.status === 200);
    const stale = await handleRecipes(request(`/api/recipes/${recipe.id}`, 'PUT', {
      expectedVersion: 1, title: 'Stale write', baseServings: '2', sourceLabel: null, sourceUrl: null, steps: [], ingredients: [], uploads: [],
    }, memberCookie), testEnv);
    expect(stale?.status).toBe(409);
    const reloaded = await handleRecipes(request(`/api/recipes/${recipe.id}`, 'GET', undefined, memberCookie), testEnv);
    expect((await reloaded!.json() as { recipe: { title: string; version: number; ingredients: { quantity: { amount: string } }[] } }).recipe)
      .toMatchObject({ title: variants[winningIndex].title, version: 2,
        ingredients: [{ quantity: { amount: variants[winningIndex].ingredients[0].quantity.amount } }] });
    expect(await db.prepare(`SELECT retired_at FROM ingredients WHERE id=?`).bind(ingredientId!.id).first())
      .toMatchObject({ retired_at: expect.any(Number) });
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM proposal_need_sources WHERE ingredient_id=?`).bind(ingredientId!.id).first())
      .toMatchObject({ count: 1 });
    const blockedUpdate = await handleRecipes(request(`/api/recipes/${recipe.id}`, 'PUT', {
      expectedVersion: 2, title: 'Blocked update', baseServings: '4', sourceLabel: null, sourceUrl: null, steps: [],
      ingredients: [], uploads: [uploadId],
    }, memberCookie), testEnv, { beforeWrite: async () => {
      await db.prepare(`UPDATE app_accounts SET status='blocked',updated_at=? WHERE id=?`).bind(Date.now(), owner!.id).run();
    } });
    expect(blockedUpdate?.status).toBe(403);
    await db.prepare(`UPDATE app_accounts SET status='active',updated_at=? WHERE id=?`).bind(Date.now(), owner!.id).run();
    expect(await db.prepare(`SELECT version FROM recipes WHERE id=?`).bind(recipe.id).first()).toMatchObject({ version: 2 });

    const deleted = await handleRecipes(request(`/api/recipes/${recipe.id}`, 'DELETE', undefined, memberCookie), testEnv);
    expect(deleted?.status).toBe(204);
    expect((await handleRecipes(request(`/api/recipes/${recipe.id}`, 'GET', undefined, memberCookie), testEnv))?.status).toBe(404);
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM proposal_need_sources WHERE ingredient_id=?`).bind(ingredientId!.id).first())
      .toMatchObject({ count: 1 });
    expect(await db.prepare(`SELECT status FROM uploads WHERE id=?`).bind(uploadId).first()).toMatchObject({ status: 'deleting' });
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM outbox WHERE task_type='delete_upload' AND task_id=?`).bind(uploadId).first())
      .toMatchObject({ count: 1 });
  });

  it('rejects anonymous access, invalid writes, and cross-owner uploads', async () => {
    expect((await handleRecipes(request('/api/recipes', 'GET'), testEnv))?.status).toBe(401);
    const response = await handleRecipes(request('/api/recipes', 'POST', { title: 'Invalid' }, memberCookie), testEnv);
    expect(response?.status).toBe(400);
    const admin = await db.prepare(`SELECT id FROM app_accounts WHERE email=?`).bind(adminEmail).first<{ id: string }>();
    const uploadId = await createStoredUpload(admin!.id);
    const foreignUpload = await handleRecipes(request('/api/recipes', 'POST', {
      title: 'Wrong upload owner', baseServings: null, sourceLabel: null, sourceUrl: null, steps: [], ingredients: [], uploads: [uploadId],
    }, memberCookie), testEnv);
    expect(foreignUpload?.status).toBe(400);
    const member = await db.prepare(`SELECT id FROM app_accounts WHERE email=?`).bind(memberEmail).first<{ id: string }>();
    const blockedCreate = await handleRecipes(request('/api/recipes', 'POST', {
      title: 'Blocked creation', baseServings: null, sourceLabel: null, sourceUrl: null, steps: [], ingredients: [], uploads: [],
    }, memberCookie), testEnv, { beforeWrite: async () => {
      await db.prepare(`UPDATE app_accounts SET status='blocked',updated_at=? WHERE id=?`).bind(Date.now(), member!.id).run();
    } });
    expect(blockedCreate?.status).toBe(403);
    await db.prepare(`UPDATE app_accounts SET status='active',updated_at=? WHERE id=?`).bind(Date.now(), member!.id).run();
  });

  it('stops every write after session revocation and leaves delete children untouched when blocked', async () => {
    const owner = await db.prepare(`SELECT id FROM app_accounts WHERE email=?`).bind(memberEmail).first<{ id: string }>();
    const session = await db.prepare(`SELECT session_id AS id FROM session_metadata WHERE owner_id=? AND revoked_at IS NULL LIMIT 1`)
      .bind(owner!.id).first<{ id: string }>();
    const uploadId = await createStoredUpload(owner!.id);
    const input = { title: 'Race guard', baseServings: '2', steps: [], ingredients: [], uploads: [uploadId] };
    const created = await handleRecipes(request('/api/recipes', 'POST', input, memberCookie), testEnv);
    expect(created?.status).toBe(201);
    const { recipe } = await created!.json() as { recipe: { id: string } };
    const before = await db.prepare(`SELECT COUNT(*) AS count FROM recipes WHERE owner_id=?`).bind(owner!.id).first();
    const revoke = async () => { await db.prepare(`UPDATE session_metadata SET revoked_at=? WHERE session_id=?`)
      .bind(Date.now(), session!.id).run(); };
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const path = method === 'POST' ? '/api/recipes' : `/api/recipes/${recipe.id}`;
      const payload = method === 'DELETE' ? undefined : { ...input, expectedVersion: 1, title: 'Must not be saved' };
      const response = await handleRecipes(request(path, method, payload, memberCookie), testEnv, { beforeWrite: revoke });
      expect(response?.status).toBe(401);
      // Restore only this test fixture to exercise the next independent interleaving.
      await db.prepare(`UPDATE session_metadata SET revoked_at=NULL WHERE session_id=?`).bind(session!.id).run();
    }
    const blockedDelete = await handleRecipes(request(`/api/recipes/${recipe.id}`, 'DELETE', undefined, memberCookie), testEnv, {
      beforeWrite: async () => { await db.prepare(`UPDATE app_accounts SET status='blocked' WHERE id=?`).bind(owner!.id).run(); },
    });
    expect(blockedDelete?.status).toBe(403);
    await db.prepare(`UPDATE app_accounts SET status='active' WHERE id=?`).bind(owner!.id).run();
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM recipes WHERE owner_id=?`).bind(owner!.id).first()).toEqual(before);
    expect(await db.prepare(`SELECT title,version,deleted_at FROM recipes WHERE id=?`).bind(recipe.id).first())
      .toEqual({ title: 'Race guard', version: 1, deleted_at: null });
    expect(await db.prepare(`SELECT status FROM uploads WHERE id=?`).bind(uploadId).first()).toEqual({ status: 'stored' });
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM recipe_uploads WHERE recipe_id=? AND upload_id=?`).bind(recipe.id, uploadId).first())
      .toEqual({ count: 1 });
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM outbox WHERE task_type='delete_upload' AND task_id=?`).bind(uploadId).first())
      .toEqual({ count: 0 });
  });

  it('deletes an upload attached by a concurrent update before the recipe delete commits', async () => {
    const owner = await db.prepare(`SELECT id FROM app_accounts WHERE email=?`).bind(memberEmail).first<{ id: string }>();
    const newUploadId = await createStoredUpload(owner!.id);
    const created = await handleRecipes(request('/api/recipes', 'POST', {
      title: 'Race source', baseServings: null, steps: [], ingredients: [], uploads: [],
    }, memberCookie), testEnv);
    expect(created?.status).toBe(201);
    const { recipe } = await created!.json() as { recipe: { id: string } };
    const deleted = await handleRecipes(request(`/api/recipes/${recipe.id}`, 'DELETE', undefined, memberCookie), testEnv, {
      beforeWrite: async () => {
        const updated = await handleRecipes(request(`/api/recipes/${recipe.id}`, 'PUT', {
          expectedVersion: 1, title: 'Updated during delete', baseServings: null,
          steps: [], ingredients: [], uploads: [newUploadId],
        }, memberCookie), testEnv);
        expect(updated?.status).toBe(200);
      },
    });
    expect(deleted?.status).toBe(204);
    expect(await db.prepare(`SELECT status FROM uploads WHERE id=?`).bind(newUploadId).first())
      .toEqual({ status: 'deleting' });
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM recipe_uploads WHERE upload_id=?`).bind(newUploadId).first())
      .toEqual({ count: 0 });
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM outbox WHERE task_type='delete_upload' AND task_id=?`).bind(newUploadId).first())
      .toEqual({ count: 1 });
  });
});
