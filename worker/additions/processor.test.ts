import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapAdmin, claimAction, consumeInvitation, createApprovedAction, createInvitation, createInvitedAccount, createSessionMetadata, markExecutionSending } from '../db';
import { addPicnicProduct, PicnicTransportUncertainError } from '../adapters/picnic';
import { encryptCredential } from '../security/credentials';
import type { AuthEnv } from '../auth';
import { dispatchAdditionOutbox } from './outbox';
import { processAdditionTask } from './processor';

afterEach(() => vi.unstubAllGlobals());

const db = env.DB;
const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const testEnv: AuthEnv & { PICNIC_ENCRYPTION_KEY: string; PICNIC_ENCRYPTION_KEY_VERSION: string } = {
  DB: db, APP_ORIGIN: 'https://picnic.test', APP_ENV: 'test',
  AUTH_SECRET: 'test-auth-secret-of-at-least-thirty-two-bytes',
  OTP_HMAC_SECRET: 'test-otp-secret-of-at-least-thirty-two-bytes',
  EMAIL_ADDRESS_HMAC_SECRET: 'test-address-secret-of-at-least-thirty-two-bytes',
  PICNIC_ENCRYPTION_KEY: key, PICNIC_ENCRYPTION_KEY_VERSION: 'test-v1',
};
let ownerId = '';
let ownerEmail = '';

async function fixture(lineCount = 1, expiresIn = 10 * 60_000, actionCreatedAt?: number) {
  const now = Date.now();
  const email = ownerEmail;
  const sessionId = crypto.randomUUID(), connectionId = crypto.randomUUID(), recipeId = crypto.randomUUID();
  const proposalId = crypto.randomUUID(), approvalId = crypto.randomUUID(), actionId = crypto.randomUUID();
  await db.prepare(`INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES(?,?,?,?,?,?)`)
    .bind(sessionId, new Date(now + 24 * 60 * 60_000).toISOString(), `token-${sessionId}`, now, now, ownerId).run();
  await createSessionMetadata(db, ownerId, sessionId, now);
  const encrypted = await encryptCredential(testEnv, ownerId, connectionId, 'resume', 'private-provider-key');
  await db.prepare(`INSERT INTO connections(id,owner_id,status,generation,encrypted_resume_key,key_version,created_at,updated_at)
    VALUES(?,?,'connected',1,?,?,?,?)`).bind(connectionId, ownerId, encrypted.ciphertext, encrypted.keyVersion, now, now).run();
  await db.prepare(`INSERT INTO recipes(id,owner_id,title,base_servings_num,base_servings_den,version,steps_json,created_at,updated_at)
    VALUES(?,?,?,2,1,1,'[]',?,?)`).bind(recipeId, ownerId, 'Addition recipe', now, now).run();
  await db.prepare(`INSERT INTO proposals(id,owner_id,recipe_id,recipe_version,connection_id,connection_generation,version,status,
    servings_num,servings_den,expires_at,created_at,updated_at) VALUES(?,?,?,1,?,1,1,'ready',2,1,?,?,?)`)
    .bind(proposalId, ownerId, recipeId, connectionId, now + expiresIn, now, now).run();
  const purchaseLineIds: string[] = [];
  for (let ordinal = 0; ordinal < lineCount; ordinal += 1) {
    const needId = crypto.randomUUID(), purchaseLineId = crypto.randomUUID();
    purchaseLineIds.push(purchaseLineId);
    await db.prepare(`INSERT INTO proposal_needs(id,owner_id,proposal_id,ordinal,normalized_name,quantity_kind,quantity_num,quantity_den,unit)
      VALUES(?,?,?,?,'tomato','exact',1,1,'piece')`).bind(needId, ownerId, proposalId, ordinal).run();
    await db.prepare(`INSERT INTO purchase_lines(id,owner_id,proposal_id,need_id,ordinal,product_snapshot_json,pack_count,
      pack_quantity_num,pack_quantity_den,unit,price_cents) VALUES(?,?,?,?,?,?,1,1,1,'piece',100)`)
      .bind(purchaseLineId, ownerId, proposalId, needId, ordinal, JSON.stringify({ id: `sku-${ordinal}` })).run();
  }
  await createApprovedAction(db, ownerId, {
    id: approvalId, proposalId, proposalVersion: 1, startingSessionId: sessionId, snapshot: { proposalId },
    totalPriceCents: lineCount * 100, approvedAt: now, expiresAt: now + expiresIn,
  }, { id: actionId, approvalId, proposalId, connectionId, connectionGeneration: 1, createdAt: actionCreatedAt ?? now, purchaseLineIds });
  return { ownerId, actionId, now, approvalExpiresAt: now + expiresIn, purchaseLineIds };
}

beforeAll(async () => {
  const migrationEnv = env as typeof env & { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] };
  if (!(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_accounts'").first())) {
    await applyD1Migrations(db, migrationEnv.TEST_MIGRATIONS);
  }
  let admin = await db.prepare(`SELECT id,email FROM app_accounts WHERE role='admin' AND status='active' LIMIT 1`)
    .first<{ id: string; email: string }>();
  if (!admin) {
    const now = Date.now(), id = crypto.randomUUID(), email = `${id}@example.invalid`;
    await db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`)
      .bind(id, 'Addition test admin', email, now, now).run();
    await bootstrapAdmin(db, id, email, now);
    admin = { id, email };
  }
  ownerId = crypto.randomUUID(); ownerEmail = `${ownerId}@example.invalid`;
  const now = Date.now(), invitationId = crypto.randomUUID();
  await createInvitation(db, admin.id, { id: invitationId, email: ownerEmail, tokenHash: crypto.randomUUID(), createdAt: now, expiresAt: now + 60_000 });
  await db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`)
    .bind(ownerId, 'Addition test', ownerEmail, now, now).run();
  await createInvitedAccount(db, ownerId, invitationId, ownerEmail, now);
  await consumeInvitation(db, ownerId, invitationId, ownerEmail, now);
});

beforeEach(async () => {
  await db.prepare(`UPDATE app_accounts SET status='active' WHERE id=?`).bind(ownerId).run();
  await db.prepare(`UPDATE app_switches SET add_enabled=1 WHERE singleton=1`).run();
  await db.prepare(`DELETE FROM connections WHERE owner_id=?`).bind(ownerId).run();
  await db.prepare(`DELETE FROM recipes WHERE owner_id=?`).bind(ownerId).run();
});

describe('addition processor', () => {
  it('sends each approved line once and completes the action', async () => {
    const test = await fixture(2);
    const add = vi.fn<typeof addPicnicProduct>(async () => {});
    await expect(processAdditionTask(testEnv, test.actionId, 1, { add })).resolves.toBe('done');
    await expect(processAdditionTask(testEnv, test.actionId, 1, { add })).resolves.toBe('done');
    expect(add.mock.calls).toEqual([['private-provider-key', 'sku-0', 1], ['private-provider-key', 'sku-1', 1]]);
    expect(await db.prepare(`SELECT state FROM actions WHERE id=?`).bind(test.actionId).first()).toEqual({ state: 'succeeded' });
    expect(await db.prepare(`SELECT status FROM execution_lines WHERE action_id=? ORDER BY ordinal`).bind(test.actionId).all())
      .toMatchObject({ results: [{ status: 'added' }, { status: 'added' }] });
  });

  it('marks an ambiguous provider result unknown and skips later lines', async () => {
    const test = await fixture(2);
    const add = vi.fn<typeof addPicnicProduct>(async () => { throw new PicnicTransportUncertainError(); });
    await processAdditionTask(testEnv, test.actionId, 1, { add });
    expect(add).toHaveBeenCalledTimes(1);
    expect(await db.prepare(`SELECT state FROM actions WHERE id=?`).bind(test.actionId).first()).toEqual({ state: 'unknown' });
    expect(await db.prepare(`SELECT status FROM execution_lines WHERE action_id=? ORDER BY ordinal`).bind(test.actionId).all())
      .toMatchObject({ results: [{ status: 'unknown' }, { status: 'skipped' }] });
    expect(await db.prepare(`SELECT state FROM connection_execution_claims WHERE action_id=?`).bind(test.actionId).first()).toEqual({ state: 'unknown' });
  });

  it.each([
    ['add switch off', async (test: Awaited<ReturnType<typeof fixture>>) => db.prepare(`UPDATE app_switches SET add_enabled=0 WHERE singleton=1`).run(), () => Date.now()],
    ['approval expired', async (_test: Awaited<ReturnType<typeof fixture>>) => {}, (test: Awaited<ReturnType<typeof fixture>>) => test.approvalExpiresAt + 1],
  ])('does not send when %s', async (_label, configure, time) => {
    const test = await fixture(1, 5_000);
    await configure(test);
    const add = vi.fn<typeof addPicnicProduct>(async () => {});
    await processAdditionTask(testEnv, test.actionId, 1, { add, now: () => time(test) });
    expect(add).not.toHaveBeenCalled();
    expect(await db.prepare(`SELECT status FROM execution_lines WHERE action_id=?`).bind(test.actionId).first()).toEqual({ status: 'skipped' });
    await db.prepare(`UPDATE app_switches SET add_enabled=1 WHERE singleton=1`).run();
  });

  it('stops a blocked account without sending', async () => {
    const test = await fixture(1);
    await db.prepare(`UPDATE app_accounts SET status='blocked' WHERE id=?`).bind(test.ownerId).run();
    const add = vi.fn<typeof addPicnicProduct>(async () => {});
    await processAdditionTask(testEnv, test.actionId, 1, { add });
    expect(add).not.toHaveBeenCalled();
    expect(await db.prepare(`SELECT state FROM actions WHERE id=?`).bind(test.actionId).first()).toEqual({ state: 'stopped' });
  });

  it('converts a stale sending attempt to unknown without resending it', async () => {
    const test = await fixture(2);
    const sendingAt = test.now - 61_000;
    expect(await claimAction(db, test.ownerId, test.actionId, sendingAt)).toBe(true);
    expect(await markExecutionSending(db, test.ownerId, test.actionId, `${test.actionId}:0`, 'stale-attempt', sendingAt)).toBe(true);
    const add = vi.fn<typeof addPicnicProduct>(async () => {});
    await processAdditionTask(testEnv, test.actionId, 1, { add, now: () => test.now });
    expect(add).not.toHaveBeenCalled();
    expect(await db.prepare(`SELECT state FROM actions WHERE id=?`).bind(test.actionId).first()).toEqual({ state: 'unknown' });
    expect(await db.prepare(`SELECT status FROM execution_lines WHERE action_id=? ORDER BY ordinal`).bind(test.actionId).all())
      .toMatchObject({ results: [{ status: 'unknown' }, { status: 'skipped' }] });
  });

  it('returns busy for a concurrent duplicate while the owner is sending', async () => {
    const test = await fixture(1, 10 * 60_000, Date.now() - 61_000);
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const add = vi.fn<typeof addPicnicProduct>(async () => pending);
    const first = processAdditionTask(testEnv, test.actionId, 1, { add });
    await vi.waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    await expect(processAdditionTask(testEnv, test.actionId, 1, { add })).resolves.toBe('busy');
    finish();
    await first;
    expect(add).toHaveBeenCalledTimes(1);
  });
});

describe('addition outbox', () => {
  it('dispatches a blocked action for durable cleanup, which then stops without sending', async () => {
    const test = await fixture(1);
    await db.prepare(`UPDATE app_accounts SET status='blocked' WHERE id=?`).bind(test.ownerId).run();
    const send = vi.fn(async () => {});
    const queue = { send } as unknown as Queue<{ kind: 'add'; taskId: string; version: number }>;
    expect(await dispatchAdditionOutbox({ DB: db, ADD_QUEUE: queue }, test.now)).toBe(1);
    const add = vi.fn<typeof addPicnicProduct>(async () => {});
    await processAdditionTask(testEnv, test.actionId, 1, { add });
    expect(add).not.toHaveBeenCalled();
    expect(await db.prepare(`SELECT state FROM actions WHERE id=?`).bind(test.actionId).first()).toEqual({ state: 'stopped' });
  });

  it('recovers a lost sent dispatch after the action has aged', async () => {
    const test = await fixture(1);
    const send = vi.fn(async () => {});
    const queue = { send } as unknown as Queue<{ kind: 'add'; taskId: string; version: number }>;
    const outboxEnv = { DB: db, ADD_QUEUE: queue };
    expect(await dispatchAdditionOutbox(outboxEnv, test.now)).toBe(1);
    expect(send).toHaveBeenCalledWith({ kind: 'add', taskId: test.actionId, version: 1 });
    expect(await dispatchAdditionOutbox(outboxEnv, test.now + 1)).toBe(0);
    expect(await dispatchAdditionOutbox(outboxEnv, test.now + 61_001)).toBe(1);
    expect(send).toHaveBeenCalledTimes(2);
  });
});


it('keeps the real transport unknown for an exact cart snapshot and never resends after redelivery', async () => {
  const test = await fixture(2);
  const fetcher = vi.fn(async () => Response.json({
    type: 'ORDER', id: 'shopping_cart', mts: test.now,
    items: [{ type: 'ORDER_LINE', id: 'line', items: [{ type: 'ORDER_ARTICLE', id: 'sku-0', name: 'Fixture product', unit_quantity: '1 piece', price: 100 }] }],
    analytics_context_data: { items_list: [{ product_id: 'sku-0', quantity: 1, is_available: true }] },
  }));
  vi.stubGlobal('fetch', fetcher);
  await processAdditionTask(testEnv, test.actionId, 1);
  await processAdditionTask(testEnv, test.actionId, 1);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(JSON.parse(String(request.body))).toEqual({ product_id: 'sku-0', count: 1 });
  expect(await db.prepare(`SELECT state FROM actions WHERE id=?`).bind(test.actionId).first()).toEqual({ state: 'unknown' });
  expect(await db.prepare(`SELECT status FROM execution_lines WHERE action_id=? ORDER BY ordinal`).bind(test.actionId).all())
    .toMatchObject({ results: [{ status: 'unknown' }, { status: 'skipped' }] });
});
