import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApprovedAction, createSessionMetadata, markExecutionSending, reserveUpload, type ActionInput } from '../db';
import { reapplyDeletionTombstones, runMaintenance } from './maintenance';

const db = env.DB;
const uploads = env.UPLOADS;
const DAY = 24 * 60 * 60 * 1000;
let schemaReady: Promise<void> | undefined;
let adminId = '';

async function ensureSchema() {
  if (!schemaReady) schemaReady = (async () => {
    const row = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_accounts'").first();
    if (!row) await applyD1Migrations(db, env.TEST_MIGRATIONS);
  })();
  await schemaReady;
}

async function createOwner(label: string, now: number): Promise<string> {
  const id = `maintenance-${label}-${crypto.randomUUID()}`;
  const email = `${id}@test.invalid`;
  const invitationId = `invite-${id}`;
  await db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`)
    .bind(id, label, email, now, now).run();
  await db.prepare(`INSERT INTO invitations(id,email,token_hash,status,invited_by,created_at,expires_at)
    VALUES(?,?,?,'pending',?,?,?)`).bind(invitationId, email, `hash-${id}`, adminId, now, now + DAY).run();
  await db.prepare(`INSERT INTO app_accounts(id,email,role,status,invitation_id,created_at,updated_at)
    VALUES(?,?,'member','invited',?,?,?)`).bind(id, email, invitationId, now, now).run();
  await db.prepare(`INSERT INTO invitation_consumptions(invitation_id,owner_id,verified_email,consumed_at) VALUES(?,?,?,?)`)
    .bind(invitationId, id, email, now).run();
  return id;
}

async function putUpload(ownerId: string, uploadId: string, objectKey: string, createdAt: number) {
  await reserveUpload(db, ownerId, { id: uploadId, objectKey, mediaType: 'image/png', byteSize: 4, createdAt });
  await uploads.put(objectKey, 'real local object');
  await db.prepare(`UPDATE uploads SET status='stored' WHERE owner_id=? AND id=? AND status='reserved'`)
    .bind(ownerId, uploadId).run();
}

async function queueDeletion(ownerId: string, now: number, snapshot: string[] = []) {
  await db.batch([
    db.prepare(`UPDATE app_accounts SET status='deleting',updated_at=? WHERE id=?`).bind(now, ownerId),
    db.prepare(`INSERT INTO deletion_tasks(id,owner_id,status,object_keys_json,requested_at,delete_after)
      VALUES(?,?,'queued',?,?,?)`).bind(`task-${ownerId}`, ownerId, JSON.stringify(snapshot), now - DAY, now),
  ]);
}

beforeAll(async () => {
  await ensureSchema();
  const existing = await db.prepare(`SELECT id FROM app_accounts WHERE role='admin' AND status='active' LIMIT 1`)
    .first<{ id: string }>();
  if (existing) adminId = existing.id;
  else {
    adminId = `maintenance-admin-${crypto.randomUUID()}`;
    const email = `${adminId}@test.invalid`;
    await db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`)
      .bind(adminId, 'Maintenance Admin', email, Date.now(), Date.now()).run();
    await db.prepare(`INSERT INTO app_accounts(id,email,role,status,invitation_id,created_at,updated_at)
      VALUES(?,?,'admin','active',NULL,?,?)`).bind(adminId, email, Date.now(), Date.now()).run();
  }
});

describe('maintenance worker with local D1 and R2', () => {
  it('deletes a real R2 upload and completes deletion after reconciling a missing snapshot key', async () => {
    const now = Date.now() - 2 * DAY;
    const ownerId = await createOwner('delete', now);
    const key = `${ownerId}/photo.png`;
    await putUpload(ownerId, 'photo', key, now);
    await queueDeletion(ownerId, Date.now(), ['obsolete-snapshot-key']);
    const result = await runMaintenance({ DB: db, UPLOADS: uploads }, Date.now());
    expect(result.deletionTasksCompleted).toBe(1);
    expect(await uploads.head(key)).toBeNull();
    expect(await uploads.head('obsolete-snapshot-key')).toBeNull();
    expect(await db.prepare(`SELECT status FROM deletion_tasks WHERE owner_id=?`).bind(ownerId).first('status')).toBe('complete');
  });

  it('retries a transient R2 failure and takes over an expired lease', async () => {
    const now = Date.now() - 2 * DAY;
    const ownerId = await createOwner('retry', now);
    const key = `${ownerId}/retry.png`;
    await putUpload(ownerId, 'retry-upload', key, now);
    await queueDeletion(ownerId, Date.now(), [key]);
    await db.prepare(`UPDATE deletion_tasks SET status='running',lease_token='old-worker',lease_expires_at=? WHERE owner_id=?`)
      .bind(Date.now() - 1, ownerId).run();
    let rejectOnce = true;
    const bucket = {
      delete: async (target: string | string[]) => {
        if (rejectOnce) { rejectOnce = false; throw new Error('transient_r2_failure'); }
        return uploads.delete(target);
      },
      head: (target: string) => uploads.head(target),
      get: (target: string) => uploads.get(target),
      put: (target: string, body: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob, options?: R2PutOptions) =>
        uploads.put(target, body, options),
      list: (options?: R2ListOptions) => uploads.list(options),
    } as unknown as R2Bucket;
    const firstNow = Date.now();
    const first = await runMaintenance({ DB: db, UPLOADS: bucket }, firstNow);
    expect(first.deletionTasksRetried).toBe(1);
    expect(await uploads.head(key)).not.toBeNull();
    const retryAt = firstNow + 2 * 60 * 1000;
    const second = await runMaintenance({ DB: db, UPLOADS: uploads }, retryAt);
    expect(second.deletionTasksCompleted).toBe(1);
    expect(await uploads.head(key)).toBeNull();
  });

  it('rescans uploads beyond the task snapshot and blocks a late store after deletion starts', async () => {
    const now = Date.now() - 2 * DAY;
    const ownerId = await createOwner('rescan', now);
    const key = `${ownerId}/late-reserve.png`;
    await putUpload(ownerId, 'late-reserve', key, now);
    await queueDeletion(ownerId, Date.now(), []);
    await expect(db.prepare(`UPDATE uploads SET status='stored' WHERE owner_id=? AND id=?`)
      .bind(ownerId, 'late-reserve').run()).rejects.toThrow();
    const result = await runMaintenance({ DB: db, UPLOADS: uploads }, Date.now());
    expect(result.deletionTasksCompleted).toBe(1);
    expect(await uploads.head(key)).toBeNull();
  });

  it('does not delete a snapshot key referenced by a different owner', async () => {
    const now = Date.now() - 2 * DAY;
    const ownerA = await createOwner('foreign-a', now);
    const ownerB = await createOwner('foreign-b', now);
    const key = `${ownerB}/owned.png`;
    await putUpload(ownerB, 'owned', key, now);
    await db.prepare(`INSERT INTO imports(id,owner_id,source_kind,source_text,status,created_at,updated_at)
      VALUES('foreign-protected-import',?,'text','attached','needs_review',?,?)`).bind(ownerB, now, now).run();
    await db.prepare(`INSERT INTO import_uploads(owner_id,import_id,upload_id) VALUES(?,'foreign-protected-import','owned')`)
      .bind(ownerB).run();
    await queueDeletion(ownerA, Date.now(), [key]);
    const result = await runMaintenance({ DB: db, UPLOADS: uploads }, Date.now());
    expect(result.deletionTasksCompleted).toBe(1);
    expect(await uploads.head(key)).not.toBeNull();
    expect(await db.prepare(`SELECT status FROM uploads WHERE owner_id=? AND id='owned'`).bind(ownerB).first('status')).toBe('stored');
  });

  it('waits for a concrete external call, then marks stale sending evidence unknown before purge', async () => {
    const now = Date.now();
    const ownerId = await createOwner('external-gate', now - DAY);
    const connId = `conn-${ownerId}`;
    const recipeId = `recipe-${ownerId}`;
    const proposalId = `proposal-${ownerId}`;
    const needId = `need-${ownerId}`;
    const purchaseId = `purchase-${ownerId}`;
    const sessionId = `session-${ownerId}`;
    const actionId = `action-${ownerId}`;
    const sessionExpires = now + 60 * DAY;
    await db.prepare(`INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES(?,?,?,?,?,?)`)
      .bind(sessionId, sessionExpires, `token-${sessionId}`, now, now, ownerId).run();
    expect(await createSessionMetadata(db, ownerId, sessionId, now)).toBe(true);
    await db.batch([
      db.prepare(`INSERT INTO connections(id,owner_id,status,generation,encrypted_resume_key,key_version,created_at,updated_at)
        VALUES(?,?,'connected',1,'secret','v1',?,?)`).bind(connId, ownerId, now, now),
      db.prepare(`INSERT INTO recipes(id,owner_id,title,base_servings_num,version,steps_json,created_at,updated_at)
        VALUES(?,?, 'Soup',2,1,'[]',?,?)`).bind(recipeId, ownerId, now, now),
      db.prepare(`INSERT INTO proposals(id,owner_id,recipe_id,recipe_version,connection_id,connection_generation,version,status,
        servings_num,servings_den,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,1,1,'ready',2,1,?,?,?)`)
        .bind(proposalId, ownerId, recipeId, 1, connId, now + DAY, now, now),
      db.prepare(`INSERT INTO proposal_needs(id,owner_id,proposal_id,ordinal,normalized_name,quantity_kind,quantity_num,quantity_den,unit)
        VALUES(?,?,?,0,'tomato','exact',1,1,'piece')`).bind(needId, ownerId, proposalId),
      db.prepare(`INSERT INTO purchase_lines(id,owner_id,proposal_id,need_id,ordinal,product_snapshot_json,pack_count,
        pack_quantity_num,pack_quantity_den,unit,price_cents) VALUES(?,?,?, ?,0,'{}',1,1,1,'piece',100)`)
        .bind(purchaseId, ownerId, proposalId, needId),
    ]);
    const action: ActionInput = {
      id: actionId, approvalId: `approval-${ownerId}`, proposalId, connectionId: connId,
      connectionGeneration: 1, createdAt: now, purchaseLineIds: [purchaseId],
    };
    await createApprovedAction(db, ownerId, {
      id: action.approvalId, proposalId, proposalVersion: 1, startingSessionId: sessionId,
      snapshot: {}, totalPriceCents: 100, approvedAt: now, expiresAt: now + DAY,
    }, action);
    expect(await markExecutionSending(db, ownerId, actionId, `${actionId}:0`, `attempt-${ownerId}`, now)).toBe(true);
    await queueDeletion(ownerId, now, []);
    const blocked = await runMaintenance({ DB: db, UPLOADS: uploads }, now);
    expect(blocked.deletionTasksRetried).toBe(1);
    expect(await db.prepare(`SELECT id FROM app_accounts WHERE id=?`).bind(ownerId).first()).not.toBeNull();
    const drained = await runMaintenance({ DB: db, UPLOADS: uploads }, now + 16 * 60 * 1000);
    expect(drained.deletionTasksCompleted).toBe(1);
    expect(await db.prepare(`SELECT id FROM app_accounts WHERE id=?`).bind(ownerId).first()).toBeNull();
  });

  it('retains a recent reservation, then deletes it after the 15 minute safety window', async () => {
    const now = Date.now();
    const ownerId = await createOwner('reservation', now);
    const key = `${ownerId}/reserved.png`;
    await db.prepare(`INSERT INTO user_upload_usage(owner_id) VALUES(?)`).bind(ownerId).run();
    await reserveUpload(db, ownerId, { id: 'reserved', objectKey: key, mediaType: 'image/png', byteSize: 4, createdAt: now });
    await uploads.put(key, 'reserved body');
    await queueDeletion(ownerId, now, [key]);
    const first = await runMaintenance({ DB: db, UPLOADS: uploads }, now);
    expect(first.deletionTasksRetried).toBe(1);
    expect(await uploads.head(key)).not.toBeNull();
    const second = await runMaintenance({ DB: db, UPLOADS: uploads }, now + 16 * 60 * 1000);
    expect(second.deletionTasksCompleted).toBe(1);
    expect(await uploads.head(key)).toBeNull();
  });

  it('rechecks orphan links and reservation state inside the cleanup claim', async () => {
    const now = Date.now();
    const ownerId = await createOwner('orphan-race', now - DAY);
    const storedKey = `${ownerId}/linked-during-scan.png`;
    const reservedKey = `${ownerId}/stored-during-scan.png`;
    await putUpload(ownerId, 'linked-during-scan', storedKey, now - 20 * 60 * 1000);
    await reserveUpload(db, ownerId, { id: 'stored-during-scan', objectKey: reservedKey,
      mediaType: 'image/png', byteSize: 4, createdAt: now - 20 * 60 * 1000 });
    await uploads.put(reservedKey, 'late stored body');
    const result = await runMaintenance({ DB: db, UPLOADS: uploads }, now, {
      beforeOrphanClaim: async (uploadId) => {
        if (uploadId === 'linked-during-scan') {
          await db.prepare(`INSERT INTO recipes(id,owner_id,title,steps_json,created_at,updated_at)
            VALUES('orphan-race-recipe',?,'Linked','[]',?,?)`).bind(ownerId, now, now).run();
          await db.prepare(`INSERT INTO recipe_uploads(owner_id,recipe_id,upload_id)
            VALUES(?,'orphan-race-recipe',?)`).bind(ownerId, uploadId).run();
        }
        if (uploadId === 'stored-during-scan') {
          await db.prepare(`UPDATE uploads SET status='stored' WHERE owner_id=? AND id=? AND status='reserved'`)
            .bind(ownerId, uploadId).run();
          await db.prepare(`INSERT INTO recipe_uploads(owner_id,recipe_id,upload_id)
            VALUES(?,'orphan-race-recipe',?)`).bind(ownerId, uploadId).run();
        }
      },
    });
    expect(result.uploadsDeleted).toBe(0);
    expect(await uploads.head(storedKey)).not.toBeNull();
    expect(await uploads.head(reservedKey)).not.toBeNull();
    expect(await db.prepare(`SELECT status FROM uploads WHERE id='linked-during-scan'`).first('status')).toBe('stored');
    expect(await db.prepare(`SELECT status FROM uploads WHERE id='stored-during-scan'`).first('status')).toBe('stored');
  });

  it('claims a stale reservation durably and releases its reserved quota', async () => {
    const now = Date.now();
    const ownerId = await createOwner('reserved-cleanup', now - DAY);
    const key = `${ownerId}/stale-reserved.png`;
    await reserveUpload(db, ownerId, { id: 'stale-reserved', objectKey: key,
      mediaType: 'image/png', byteSize: 4, createdAt: now - 20 * 60 * 1000 });
    await uploads.put(key, 'stale reserved body');
    const result = await runMaintenance({ DB: db, UPLOADS: uploads }, now);
    expect(result.uploadsDeleted).toBe(1);
    expect(await uploads.head(key)).toBeNull();
    expect(await db.prepare(`SELECT status FROM uploads WHERE id='stale-reserved'`).first('status')).toBe('deleted');
    const usage = await db.prepare(`SELECT reserved_bytes AS reserved,used_bytes AS used
      FROM user_upload_usage WHERE owner_id=?`).bind(ownerId).first<{ reserved: number; used: number }>();
    expect(usage).toEqual({ reserved: 0, used: 0 });
  });

  it('keeps reserved quota charged while R2 deletion of a claimed reservation fails', async () => {
    const now = Date.now();
    const ownerId = await createOwner('reserved-retry', now - DAY);
    const key = `${ownerId}/retry-reserved.png`;
    await reserveUpload(db, ownerId, { id: 'retry-reserved', objectKey: key,
      mediaType: 'image/png', byteSize: 4, createdAt: now - 20 * 60 * 1000 });
    await uploads.put(key, 'retry body');
    const rejectingBucket = {
      delete: async () => { throw new Error('transient_r2_failure'); },
      head: (target: string) => uploads.head(target),
      get: (target: string) => uploads.get(target),
      list: (options?: R2ListOptions) => uploads.list(options),
    } as unknown as R2Bucket;
    const first = await runMaintenance({ DB: db, UPLOADS: rejectingBucket }, now);
    expect(first.uploadsRetried).toBeGreaterThan(0);
    expect(await db.prepare(`SELECT status FROM uploads WHERE id='retry-reserved'`).first('status')).toBe('deleting');
    expect(await db.prepare(`SELECT reserved_bytes AS reserved FROM user_upload_usage WHERE owner_id=?`)
      .bind(ownerId).first('reserved')).toBe(4);
    expect(await uploads.head(key)).not.toBeNull();
    await runMaintenance({ DB: db, UPLOADS: uploads }, now + 1);
    expect(await db.prepare(`SELECT reserved_bytes AS reserved FROM user_upload_usage WHERE owner_id=?`)
      .bind(ownerId).first('reserved')).toBe(0);
    expect(await uploads.head(key)).toBeNull();
  });

  it('expires invitations and old unsaved drafts while preserving recent drafts', async () => {
    const now = Date.now();
    const ownerId = await createOwner('retention', now - 10 * DAY);
    const inviteeId = `expired-invitee-${crypto.randomUUID()}`;
    const inviteeEmail = `${inviteeId}@test.invalid`;
    await db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,?,?)`)
      .bind(inviteeId, 'Expired invitee', inviteeEmail, now - 3 * DAY, now - 3 * DAY).run();
    await db.batch([
      db.prepare(`INSERT INTO imports(id,owner_id,source_kind,source_text,status,created_at,updated_at)
        VALUES('old-draft',?,'text','old','needs_review',?,?)`).bind(ownerId, now - 8 * DAY, now - 8 * DAY),
      db.prepare(`INSERT INTO imports(id,owner_id,source_kind,source_text,status,created_at,updated_at)
        VALUES('recent-draft',?,'text','recent','needs_review',?,?)`).bind(ownerId, now - DAY, now - DAY),
      db.prepare(`INSERT INTO invitations(id,email,token_hash,status,invited_by,created_at,expires_at)
        VALUES('maintenance-expired-invite',?,'expired-hash','pending',?,?,?)`)
        .bind(inviteeEmail, adminId, now - 3 * DAY, now - 1),
      db.prepare(`INSERT INTO app_accounts(id,email,role,status,invitation_id,created_at,updated_at)
        VALUES(?,?,'member','invited','maintenance-expired-invite',?,?)`)
        .bind(inviteeId, inviteeEmail, now - 3 * DAY, now - 3 * DAY),
      db.prepare(`INSERT INTO rateLimit(id,key,count,lastRequest) VALUES('old-otp-limit','picnic:otp:email-hour:old',1,?)`)
        .bind(now - 3 * 60 * 60 * 1000),
      db.prepare(`INSERT INTO rateLimit(id,key,count,lastRequest) VALUES('fresh-otp-limit','picnic:otp:email-hour:fresh',1,?)`)
        .bind(now - 60 * 60 * 1000),
    ]);
    const result = await runMaintenance({ DB: db, UPLOADS: uploads }, now);
    expect(result.invitationsExpired).toBe(1);
    expect(await db.prepare(`SELECT id FROM imports WHERE id='old-draft'`).first()).toBeNull();
    expect(await db.prepare(`SELECT id FROM imports WHERE id='recent-draft'`).first()).not.toBeNull();
    expect(await db.prepare(`SELECT status FROM invitations WHERE id='maintenance-expired-invite'`).first('status')).toBe('expired');
    expect(await db.prepare(`SELECT id FROM app_accounts WHERE id=?`).bind(inviteeId).first()).toBeNull();
    expect(await db.prepare(`SELECT id FROM user WHERE id=?`).bind(inviteeId).first()).toBeNull();
    expect(await db.prepare(`SELECT id FROM rateLimit WHERE id='old-otp-limit'`).first()).toBeNull();
    expect(await db.prepare(`SELECT id FROM rateLimit WHERE id='fresh-otp-limit'`).first()).not.toBeNull();
    await db.prepare(`INSERT INTO invitations(id,email,token_hash,status,invited_by,created_at,expires_at)
      VALUES('maintenance-renewed-invite',?,?,'pending',?,?,?)`)
      .bind(inviteeEmail, `renewed-hash-${inviteeId}`, adminId, now, now + DAY).run();
  });

  it('enforces the 90 day limit and removes expired shared feedback', async () => {
    const now = Date.now();
    const ownerId = await createOwner('feedback', now - 100 * DAY);
    await expect(db.prepare(`INSERT INTO feedback(id,owner_id,content_json,consented_at,expires_at)
      VALUES('feedback-too-long',?,'{}',?,?)`).bind(ownerId, now, now + 91 * DAY).run())
      .rejects.toThrow('feedback_retention_invalid');
    await db.prepare(`INSERT INTO feedback(id,owner_id,content_json,consented_at,expires_at)
      VALUES('feedback-expired',?,'{}',?,?)`)
      .bind(ownerId, now - 91 * DAY, now - DAY).run();
    await runMaintenance({ DB: db, UPLOADS: uploads }, now);
    expect(await db.prepare(`SELECT id FROM feedback WHERE id='feedback-expired'`).first()).toBeNull();
  });

  it('expires native OTP rows in epoch and ISO formats and trims old rate limits', async () => {
    const now = Date.now();
    await db.batch([
      db.prepare(`INSERT INTO verification(id,identifier,value,expiresAt,createdAt,updatedAt)
        VALUES('maintenance-otp-epoch','otp-epoch','fake',?,?,?)`).bind(now - 1, now - DAY, now - DAY),
      db.prepare(`INSERT INTO verification(id,identifier,value,expiresAt,createdAt,updatedAt)
        VALUES('maintenance-otp-iso','otp-iso','fake',?,?,?)`)
        .bind(new Date(now - 1).toISOString(), now - DAY, now - DAY),
      db.prepare(`INSERT INTO verification(id,identifier,value,expiresAt,createdAt,updatedAt)
        VALUES('maintenance-otp-live','otp-live','fake',?,?,?)`).bind(now + DAY, now, now),
      db.prepare(`INSERT INTO rateLimit(id,key,count,lastRequest)
        VALUES('maintenance-otp-limit','picnic:otp:example',1,?)`).bind(now - 3 * 60 * 60 * 1000),
      db.prepare(`INSERT INTO rateLimit(id,key,count,lastRequest)
        VALUES('maintenance-old-limit','auth:old',1,?)`).bind(now - 31 * DAY),
    ]);
    await runMaintenance({ DB: db, UPLOADS: uploads }, now);
    expect(await db.prepare(`SELECT id FROM verification WHERE id IN ('maintenance-otp-epoch','maintenance-otp-iso')`).all())
      .toMatchObject({ results: [] });
    expect(await db.prepare(`SELECT id FROM verification WHERE id='maintenance-otp-live'`).first()).not.toBeNull();
    expect(await db.prepare(`SELECT id FROM rateLimit WHERE id IN ('maintenance-otp-limit','maintenance-old-limit')`).all())
      .toMatchObject({ results: [] });
  });

  it('reapplies an unexpired R2 tombstone to a restored account before cleanup', async () => {
    const now = Date.now() - DAY;
    const ownerId = await createOwner('restore', now);
    const key = `${ownerId}/restored.png`;
    await putUpload(ownerId, 'restored', key, now);
    const tombstoneKey = `private/account-tombstones/${encodeURIComponent(ownerId)}.json`;
    await uploads.put(tombstoneKey, JSON.stringify({ accountId: ownerId, requestedAt: now, expiresAt: Date.now() + DAY }), {
      httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' },
      customMetadata: { private: 'true' },
    });
    expect(await reapplyDeletionTombstones({ DB: db, UPLOADS: uploads }, Date.now())).toBe(1);
    expect(await db.prepare(`SELECT status FROM app_accounts WHERE id=?`).bind(ownerId).first('status')).toBe('deleting');
    const result = await runMaintenance({ DB: db, UPLOADS: uploads }, Date.now());
    expect(result.deletionTasksCompleted).toBe(1);
    expect(await uploads.head(key)).toBeNull();
  });
});
