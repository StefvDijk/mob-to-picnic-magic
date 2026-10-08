import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  bootstrapAdmin,
  claimAction,
  completeExecutionLine,
  createApprovedAction,
  createInvitation,
  createSessionMetadata,
  getSessionAccess,
  markBudgetUnknown,
  markExecutionSending,
  markStaleSendingUnknown,
  purgeAccountData,
  reserveBudget,
  releaseBudget,
  settleBudget,
  touchSession,
  type ActionInput,
} from './index';

const db = env.DB;
const now = 2_000_000_000_000;
const expires = now + 60 * 24 * 60 * 60 * 1000;
const adminId = 'db-test-admin';
const aliceId = 'db-test-alice';
const bobId = 'db-test-bob';
const aliceSession = 'db-test-session-alice';
const bobSession = 'db-test-session-bob';
let schemaReady: Promise<void> | undefined;

async function ensureSchema() {
  if (!schemaReady) schemaReady = (async () => {
    const row = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_accounts'").first();
    if (!row) await applyD1Migrations(db, env.TEST_MIGRATIONS);
  })();
  await schemaReady;
}

async function createAuthUser(id: string, email: string) {
  await db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`)
    .bind(id, email, email, now, now).run();
}

async function createMember(id: string, email: string) {
  const inviteId = `invite-${id}`;
  await createInvitation(db, adminId, { id: inviteId, email, tokenHash: `hash-${id}`, createdAt: now, expiresAt: expires });
  await createAuthUser(id, email);
  await db.prepare(`INSERT INTO app_accounts(id,email,role,status,invitation_id,created_at,updated_at)
    VALUES(?,?,'member','invited',?,?,?)`).bind(id, email, inviteId, now, now).run();
  await db.prepare(`INSERT INTO invitation_consumptions(invitation_id,owner_id,verified_email,consumed_at) VALUES(?,?,?,?)`)
    .bind(inviteId, id, email, now).run();
}

async function createSession(ownerId: string, id: string) {
  await db.prepare(`INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES(?,?,?,?,?,?)`)
    .bind(id, expires, `token-${id}`, now, now, ownerId).run();
  await createSessionMetadata(db, ownerId, id, now);
}

async function createProposal(ownerId: string, connectionId: string, proposalId: string, purchaseLineId: string) {
  const recipeId = `recipe-${proposalId}`;
  const needId = `need-${proposalId}`;
  await db.prepare(`INSERT INTO recipes(id,owner_id,title,base_servings_num,version,steps_json,created_at,updated_at)
    VALUES(?,?,?,2,1,'[]',?,?)`).bind(recipeId, ownerId, 'Soup', now, now).run();
  await db.prepare(`INSERT INTO proposals(id,owner_id,recipe_id,recipe_version,connection_id,connection_generation,version,status,servings_num,servings_den,expires_at,created_at,updated_at)
    VALUES(?,?,?,?,?,1,1,'ready',2,1,?,?,?)`).bind(proposalId, ownerId, recipeId, 1, connectionId, expires, now, now).run();
  await db.prepare(`INSERT INTO proposal_needs(id,owner_id,proposal_id,ordinal,normalized_name,quantity_kind,quantity_num,quantity_den,unit)
    VALUES(?,?,?,0,'tomato','exact',1,1,'piece')`).bind(needId, ownerId, proposalId).run();
  await db.prepare(`INSERT INTO purchase_lines(id,owner_id,proposal_id,need_id,ordinal,product_snapshot_json,pack_count,pack_quantity_num,pack_quantity_den,unit,price_cents)
    VALUES(?,?,?,?,0,'{}',1,1,1,'piece',100)`).bind(purchaseLineId, ownerId, proposalId, needId).run();
  return { proposalId, purchaseLineId };
}

async function createConnection(ownerId: string, id: string) {
  await db.prepare(`INSERT INTO connections(id,owner_id,status,generation,encrypted_resume_key,key_version,created_at,updated_at)
    VALUES(?,?,'connected',1,'encrypted','v1',?,?)`).bind(id, ownerId, now, now).run();
}

beforeAll(async () => {
  await ensureSchema();
  await createAuthUser(adminId, 'admin@test.invalid');
  await bootstrapAdmin(db, adminId, 'admin@test.invalid', now);
  await createMember(aliceId, 'alice@test.invalid');
  await createMember(bobId, 'bob@test.invalid');
  await createSession(aliceId, aliceSession);
  await createSession(bobId, bobSession);
});

describe('D1 repository invariants', () => {
  it('rejects cross-owner recipe ingredient references', async () => {
    await db.prepare(`INSERT INTO recipes(id,owner_id,title,steps_json,created_at,updated_at) VALUES('tenant-recipe',?,'A','[]',?,?)`)
      .bind(aliceId, now, now).run();
    await expect(db.prepare(`INSERT INTO ingredients(id,owner_id,recipe_id,ordinal,original_text,quantity_kind,quantity_den,attributes_json,uncertainty_json,created_at)
      VALUES('tenant-ingredient',?,'tenant-recipe',0,'one tomato','unknown',1,'{}','[]',?)`).bind(bobId, now).run()).rejects.toThrow();
  });

  it('allows only one invite to claim the final pilot seat under concurrent inserts', async () => {
    for (let i = 0; i < 6; i += 1) {
      await createInvitation(db, adminId, { id: `seat-invite-${i}`, email: `seat-${i}@test.invalid`, tokenHash: `seat-hash-${i}`, createdAt: now, expiresAt: expires });
    }
    const attempts = await Promise.allSettled([
      createInvitation(db, adminId, { id: 'seat-race-a', email: 'race-a@test.invalid', tokenHash: 'race-a', createdAt: now, expiresAt: expires }),
      createInvitation(db, adminId, { id: 'seat-race-b', email: 'race-b@test.invalid', tokenHash: 'race-b', createdAt: now, expiresAt: expires }),
    ]);
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const seats = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM app_accounts WHERE status IN ('active','blocked','deleting')) +
      (SELECT COUNT(*) FROM invitations WHERE status='pending' AND expires_at>?) AS used`).bind(now).first<{ used: number }>();
    expect(seats?.used).toBe(10);
  });

  it('keeps an unknown AI reservation held and settles only measured cents', async () => {
    await expect(reserveBudget(db, aliceId, { month: '2099-01', appCapCents: 1501 },
      { id: 'oversized-cap', importId: 'budget-import', attemptId: 'oversized-cap', capCents: 1, createdAt: now })).rejects.toThrow();
    await db.prepare(`INSERT INTO imports(id,owner_id,source_kind,source_text,status,created_at,updated_at) VALUES('budget-import',?,'text','recipe','queued',?,?)`)
      .bind(aliceId, now, now).run();
    await reserveBudget(db, aliceId, { month: '2099-01', appCapCents: 10, userCapCents: 10 },
      { id: 'budget-r1', importId: 'budget-import', attemptId: 'attempt-1', capCents: 5, createdAt: now });
    await markBudgetUnknown(db, aliceId, 'budget-r1', now + 1);
    await expect(reserveBudget(db, aliceId, { month: '2099-01', appCapCents: 10, userCapCents: 10 },
      { id: 'budget-r2-blocked', importId: 'budget-import', attemptId: 'attempt-2', capCents: 1, createdAt: now + 2 })).rejects.toThrow();
    expect(await settleBudget(db, aliceId, 'budget-r1', 3, now + 3)).toBe(true);
    await reserveBudget(db, aliceId, { month: '2099-01' },
      { id: 'budget-r2', importId: 'budget-import', attemptId: 'attempt-2', capCents: 2, createdAt: now + 4 });
    await expect(db.prepare(`INSERT INTO budget_reservations(id,owner_id,import_id,month,attempt_id,cap_cents,state,created_at)
      VALUES('fractional-cents',?,'budget-import','2099-01','attempt-3',1.5,'reserved',?)`).bind(aliceId, now + 5).run()).rejects.toThrow();
    await db.prepare(`INSERT INTO imports(id,owner_id,source_kind,source_text,status,created_at,updated_at) VALUES('released-import',?,'text','recipe','queued',?,?)`)
      .bind(aliceId, now, now).run();
    await reserveBudget(db, aliceId, { month: '2099-01' },
      { id: 'budget-released', importId: 'released-import', attemptId: 'attempt-released', capCents: 5, createdAt: now + 6 });
    expect(await releaseBudget(db, aliceId, 'budget-released', now + 7)).toBe(true);
    await reserveBudget(db, aliceId, { month: '2099-01' },
      { id: 'budget-after-release', importId: 'released-import', attemptId: 'attempt-after-release', capCents: 5, createdAt: now + 8 });
  });

  it('admits only one owner when concurrent reservations reach the shared app cap', async () => {
    await db.prepare(`INSERT INTO imports(id,owner_id,source_kind,source_text,status,created_at,updated_at)
      VALUES('race-import-a',?,'text','a','queued',?,?),( 'race-import-b',?,'text','b','queued',?,?)`)
      .bind(aliceId, now, now, bobId, now, now).run();
    const results = await Promise.allSettled([
      reserveBudget(db, aliceId, { month: '2099-02', appCapCents: 1, userCapCents: 1 },
        { id: 'race-budget-a', importId: 'race-import-a', attemptId: 'race-attempt-a', capCents: 1, createdAt: now }),
      reserveBudget(db, bobId, { month: '2099-02', appCapCents: 1, userCapCents: 1 },
        { id: 'race-budget-b', importId: 'race-import-b', attemptId: 'race-attempt-b', capCents: 1, createdAt: now }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const usage = await db.prepare(`SELECT a.reserved_cents AS appReserved,a.spent_cents AS appSpent,
        u.reserved_cents AS userReserved,u.spent_cents AS userSpent
      FROM app_budget_months a JOIN user_budget_months u ON u.month=a.month
      WHERE a.month='2099-02' ORDER BY u.owner_id LIMIT 1`).first<{ appReserved: number; appSpent: number; userReserved: number; userSpent: number }>();
    expect(usage?.appReserved).toBe(1);
    expect((usage?.appSpent ?? 0) + (usage?.appReserved ?? 0)).toBeLessThanOrEqual(1);
    expect((usage?.userSpent ?? 0) + (usage?.userReserved ?? 0)).toBeLessThanOrEqual(1);
  });

  it('creates one approval/action, persists sending before work, and holds an unknown connection claim', async () => {
    await createConnection(aliceId, 'alice-connection');
    const { proposalId, purchaseLineId } = await createProposal(aliceId, 'alice-connection', 'proposal-one', 'line-one');
    const approval = { id: 'approval-one', proposalId, proposalVersion: 1, startingSessionId: aliceSession,
      snapshot: { lines: [purchaseLineId] }, totalPriceCents: 100, approvedAt: now + 11 * 60_000, expiresAt: expires };
    const action: ActionInput = { id: 'action-one', approvalId: approval.id, proposalId, connectionId: 'alice-connection',
      connectionGeneration: 1, createdAt: approval.approvedAt, purchaseLineIds: [purchaseLineId] };
    await createApprovedAction(db, aliceId, approval, action);
    await expect(createApprovedAction(db, aliceId, approval, { ...action, id: 'action-duplicate' })).rejects.toThrow();
    expect(await claimAction(db, aliceId, action.id, now + 11 * 60_000 + 1)).toBe(true);
    expect(await markExecutionSending(db, aliceId, action.id, `${action.id}:0`, 'attempt-line-one', now + 11 * 60_000 + 2)).toBe(true);
    await markStaleSendingUnknown(db, aliceId, action.id, now + 11 * 60_000 + 2, now + 11 * 60_000 + 3);
    expect(await completeExecutionLine(db, aliceId, action.id, `${action.id}:0`, 'added', {}, now + 11 * 60_000 + 4)).toBe(false);

    const second = await createProposal(aliceId, 'alice-connection', 'proposal-two', 'line-two');
    const approval2 = { ...approval, id: 'approval-two', proposalId: second.proposalId, snapshot: { lines: [second.purchaseLineId] } };
    await expect(createApprovedAction(db, aliceId, approval2, { ...action, id: 'action-two', approvalId: approval2.id,
      proposalId: second.proposalId, purchaseLineIds: [second.purchaseLineId] })).rejects.toThrow();
    const rolledBack = await db.prepare(`SELECT id FROM approvals WHERE owner_id=? AND id='approval-two'`).bind(aliceId).first();
    expect(rolledBack).toBeNull();
  });

  it('expires or revokes sessions at 30d/14d and blocks cross-owner metadata', async () => {
    expect(await createSessionMetadata(db, aliceId, bobSession, now)).toBe(false);
    expect((await getSessionAccess(db, aliceId, aliceSession, now + 1)).success).toBe(true);
    expect((await touchSession(db, aliceId, aliceSession, now + 15 * 24 * 60 * 60 * 1000)).success).toBe(false);
    const blockedSession = 'db-test-session-blocked';
    await createSession(bobId, blockedSession);
    await db.prepare(`UPDATE app_accounts SET status='blocked' WHERE id=?`).bind(bobId).run();
    expect(await getSessionAccess(db, bobId, blockedSession, now + 1)).toEqual({ success: false, reason: 'blocked' });
  });

  it('keeps approval history if its starting Better Auth session is deleted and refuses later sends', async () => {
    await db.prepare(`UPDATE app_accounts SET status='active' WHERE id=?`).bind(bobId).run();
    await createConnection(bobId, 'bob-connection');
    const { proposalId, purchaseLineId } = await createProposal(bobId, 'bob-connection', 'proposal-after-logout', 'line-after-logout');
    const approval = { id: 'approval-after-logout', proposalId, proposalVersion: 1, startingSessionId: bobSession,
      snapshot: { lines: [purchaseLineId] }, totalPriceCents: 100, approvedAt: now + 11 * 60_000, expiresAt: expires };
    const action: ActionInput = { id: 'action-after-logout', approvalId: approval.id, proposalId,
      connectionId: 'bob-connection', connectionGeneration: 1, createdAt: approval.approvedAt, purchaseLineIds: [purchaseLineId] };
    await createApprovedAction(db, bobId, approval, action);
    await db.prepare(`DELETE FROM session WHERE id=?`).bind(bobSession).run();
    expect(await db.prepare(`SELECT id FROM approvals WHERE owner_id=? AND id=?`).bind(bobId, approval.id).first()).not.toBeNull();
    await claimAction(db, bobId, action.id, approval.approvedAt + 1);
    await expect(markExecutionSending(db, bobId, action.id, `${action.id}:0`, 'attempt-after-logout', approval.approvedAt + 2)).rejects.toThrow();
  });

  it('preserves the deletion cleanup task while account-owned rows are removed', async () => {
    await db.prepare(`UPDATE app_accounts SET status='deleting' WHERE id=?`).bind(bobId).run();
    await db.prepare(`INSERT INTO imports(id,owner_id,source_kind,source_text,status,created_at,updated_at) VALUES('purge-import',?,'text','recipe','queued',?,?)`)
      .bind(bobId, now, now).run();
    await reserveBudget(db, bobId, { month: '2099-03', appCapCents: 5, userCapCents: 5 },
      { id: 'purge-budget', importId: 'purge-import', attemptId: 'purge-attempt', capCents: 5, createdAt: now });
    await db.prepare(`INSERT INTO deletion_tasks(id,owner_id,status,object_keys_json,requested_at,delete_after)
      VALUES('delete-bob-task',?,'running','["upload/object"]',?,?)`).bind(bobId, now, expires).run();
    await purgeAccountData(db, bobId, now);
    expect(await db.prepare(`SELECT id,status,completed_at FROM deletion_tasks WHERE owner_id=?`).bind(bobId).first())
      .toEqual({ id: 'delete-bob-task', status: 'complete', completed_at: now });
    expect(await db.prepare(`SELECT id FROM user WHERE id=?`).bind(bobId).first()).toBeNull();
    const appBudget = await db.prepare(`SELECT reserved_cents AS reserved,spent_cents AS spent FROM app_budget_months WHERE month='2099-03'`)
      .first<{ reserved: number; spent: number }>();
    expect(appBudget).toEqual({ reserved: 0, spent: 5 });
  });

  it('removes invitations created by a deleting admin without deleting invitees', async () => {
    await db.prepare(`UPDATE app_accounts SET status='deleting' WHERE id=?`).bind(adminId).run();
    await db.prepare(`INSERT INTO deletion_tasks(id,owner_id,status,object_keys_json,requested_at,delete_after)
      VALUES('delete-admin-task',?,'running','[]',?,?)`).bind(adminId, now, expires).run();
    await purgeAccountData(db, adminId, now);
    expect(await db.prepare(`SELECT id FROM user WHERE id=?`).bind(adminId).first()).toBeNull();
    expect(await db.prepare(`SELECT id,status FROM app_accounts WHERE id=?`).bind(aliceId).first())
      .toEqual({ id: aliceId, status: 'active' });
    expect(await db.prepare(`SELECT id FROM invitations WHERE invited_by=?`).bind(adminId).first()).toBeNull();
    expect(await db.prepare(`SELECT status FROM deletion_tasks WHERE owner_id=?`).bind(adminId).first<{ status: string }>()
      .then((row) => row?.status)).toBe('complete');
  });
});
