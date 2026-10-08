import { markStaleSendingUnknown, purgeAccountData } from '../db';

const DAY = 24 * 60 * 60 * 1000;
const LEASE_MS = 5 * 60 * 1000;
const RESERVED_GRACE_MS = 15 * 60 * 1000;
const EXTERNAL_CALL_GRACE_MS = 15 * 60 * 1000;
const TOMBSTONE_MAX_MS = 30 * DAY;
const MAX_TASKS = 8;
const MAX_UPLOADS = 100;
const DELETE_RETRY_BASE_MS = 60 * 1000;
const DELETE_RETRY_MAX_MS = DAY;
const TOMBSTONE_PREFIX = 'private/account-tombstones/';

type Env = { DB: D1Database; UPLOADS: R2Bucket };
type DeletionRow = {
  id: string; ownerId: string; requestedAt: number; deleteAfter: number; objectKeysJson: string;
  attempts: number; leaseToken: string | null; leaseExpiresAt: number | null;
};
type UploadRow = { id: string; ownerId: string; objectKey: string; status: string; createdAt: number };
type OutboxRow = { id: string; ownerId: string; taskId: string; payloadJson: string; attempts: number; updatedAt: number };

interface MaintenanceHooks {
  beforeOrphanClaim?: (uploadId: string) => Promise<void>;
}

export interface MaintenanceResult {
  deletionTasksClaimed: number;
  deletionTasksCompleted: number;
  deletionTasksRetried: number;
  overdueDeletionTaskIds: string[];
  uploadsDeleted: number;
  uploadsRetried: number;
  retainedRowsDeleted: number;
  invitationsExpired: number;
}

const emptyResult = (): MaintenanceResult => ({
  deletionTasksClaimed: 0, deletionTasksCompleted: 0, deletionTasksRetried: 0,
  overdueDeletionTaskIds: [], uploadsDeleted: 0, uploadsRetried: 0,
  retainedRowsDeleted: 0, invitationsExpired: 0,
});

function retryDelay(attempt: number): number {
  return Math.min(DELETE_RETRY_MAX_MS, DELETE_RETRY_BASE_MS * (2 ** Math.min(10, Math.max(0, attempt - 1))));
}

function safeObjectKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((key): key is string => typeof key === 'string' && key.length > 0))];
}

async function hasForeignOwnerReference(db: D1Database, ownerId: string, objectKey: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 FROM uploads WHERE object_key=? AND owner_id!=? LIMIT 1')
    .bind(objectKey, ownerId).first();
  return !!row;
}

async function deleteOwnedObject(env: Env, ownerId: string, objectKey: string): Promise<void> {
  if (await hasForeignOwnerReference(env.DB, ownerId, objectKey)) {
    throw new Error('foreign_object_reference');
  }
  await env.UPLOADS.delete(objectKey);
  const left = await env.UPLOADS.head(objectKey);
  if (left) throw new Error('r2_object_still_present');
}

async function updateDeletionRetry(db: D1Database, task: DeletionRow, now: number, code: string): Promise<void> {
  const attempt = Math.max(1, task.attempts);
  await db.prepare(`UPDATE deletion_tasks SET status='failed',attempts=?,next_attempt_at=?,last_error_code=?,
      lease_token=NULL,lease_expires_at=NULL,r2_verified_at=NULL
    WHERE id=? AND owner_id=? AND status='running' AND lease_token=?`)
    .bind(attempt, now + retryDelay(attempt), code.slice(0, 80), task.id, task.ownerId, task.leaseToken).run();
}

async function claimDeletionTasks(db: D1Database, now: number): Promise<DeletionRow[]> {
  const candidates = await db.prepare(`SELECT id,owner_id AS ownerId,requested_at AS requestedAt,
      delete_after AS deleteAfter,object_keys_json AS objectKeysJson,attempts,
      lease_token AS leaseToken,lease_expires_at AS leaseExpiresAt
    FROM deletion_tasks
    WHERE next_attempt_at<=? AND (
      status IN ('queued','failed') OR (status='running' AND COALESCE(lease_expires_at,0)<=?)
    ) ORDER BY delete_after,id LIMIT ?`).bind(now, now, MAX_TASKS).all<DeletionRow>();
  const claimed: DeletionRow[] = [];
  for (const row of candidates.results) {
    const token = crypto.randomUUID();
    const res = await db.prepare(`UPDATE deletion_tasks SET status='running',lease_token=?,lease_expires_at=?,
        attempts=attempts+1,last_error_code=NULL,r2_verified_at=NULL
      WHERE id=? AND ((status IN ('queued','failed') AND next_attempt_at<=?) OR
        (status='running' AND COALESCE(lease_expires_at,0)<=?))`)
      .bind(token, now + LEASE_MS, row.id, now, now).run();
    if (res.meta.changes) claimed.push({ ...row, leaseToken: token, leaseExpiresAt: now + LEASE_MS, attempts: row.attempts + 1 });
  }
  return claimed;
}

async function processDeletionTask(env: Env, task: DeletionRow, now: number, result: MaintenanceResult): Promise<void> {
  const { DB: db } = env;
  try {
    const account = await db.prepare('SELECT status FROM app_accounts WHERE id=?').bind(task.ownerId).first<{ status: string }>();
    if (account && account.status !== 'deleting') {
      await db.prepare(`UPDATE app_accounts SET status='deleting',updated_at=? WHERE id=? AND status IN ('active','blocked','invited')`)
        .bind(now, task.ownerId).run();
      await db.batch([
        db.prepare('UPDATE session_metadata SET revoked_at=COALESCE(revoked_at,?) WHERE owner_id=?').bind(now, task.ownerId),
        db.prepare(`UPDATE connections SET status='disconnected',encrypted_resume_key=NULL,key_version=NULL,
          generation=generation+1,updated_at=? WHERE owner_id=? AND encrypted_resume_key IS NOT NULL`).bind(now, task.ownerId),
      ]);
    }

    const recentExternalCall = await db.prepare(`SELECT 1 FROM execution_lines WHERE owner_id=? AND status='sending'
      AND attempt_started_at>? LIMIT 1`).bind(task.ownerId, now - EXTERNAL_CALL_GRACE_MS).first();
    if (recentExternalCall) throw new Error('external_call_in_flight');
    const staleActions = await db.prepare(`SELECT DISTINCT action_id AS actionId FROM execution_lines
      WHERE owner_id=? AND status='sending' AND attempt_started_at<=? LIMIT ?`)
      .bind(task.ownerId, now - EXTERNAL_CALL_GRACE_MS, MAX_UPLOADS).all<{ actionId: string }>();
    for (const action of staleActions.results) {
      await markStaleSendingUnknown(db, task.ownerId, action.actionId, now - EXTERNAL_CALL_GRACE_MS, now);
    }

    // Keep the original request snapshot, but always reconcile it with current rows.
    const scanned = await db.prepare(`SELECT id,owner_id AS ownerId,object_key AS objectKey,status,created_at AS createdAt
      FROM uploads WHERE owner_id=? AND status!='deleted' ORDER BY created_at,id LIMIT ?`)
      .bind(task.ownerId, MAX_UPLOADS).all<UploadRow>();
    const snapshotKeys = safeObjectKeys(JSON.parse(task.objectKeysJson));
    const reconciledKeys = [...new Set([...snapshotKeys, ...scanned.results.map(row => row.objectKey)])];
    const recentReservations = new Set(scanned.results
      .filter(row => row.status === 'reserved' && row.createdAt > now - RESERVED_GRACE_MS)
      .map(row => row.objectKey));
    await db.prepare(`UPDATE deletion_tasks SET object_keys_json=? WHERE id=? AND owner_id=? AND status='running' AND lease_token=?`)
      .bind(JSON.stringify(reconciledKeys), task.id, task.ownerId, task.leaseToken).run();

    for (const upload of scanned.results) {
      if (upload.status === 'reserved' && upload.createdAt > now - RESERVED_GRACE_MS) continue;
      // Transition stored -> deleting before touching R2; reserved rows older than
      // the grace window are disposable directly.
      if (upload.status === 'stored') {
        await db.prepare(`UPDATE uploads SET status='deleting' WHERE owner_id=? AND id=? AND status='stored'`)
          .bind(task.ownerId, upload.id).run();
      }
      try {
        await deleteOwnedObject(env, task.ownerId, upload.objectKey);
        await db.prepare(`UPDATE uploads SET status='deleted',deleted_at=? WHERE owner_id=? AND id=? AND status IN ('reserved','deleting')`)
          .bind(now, task.ownerId, upload.id).run();
        result.uploadsDeleted += 1;
      } catch (error) {
        result.uploadsRetried += 1;
        throw error;
      }
    }
    // Snapshot keys can outlive their upload rows (for example after a partial
    // migration). Reconcile each one too, with a final foreign-owner guard.
    for (const key of reconciledKeys) {
      if (recentReservations.has(key)) continue;
      if (await hasForeignOwnerReference(db, task.ownerId, key)) continue;
      await deleteOwnedObject(env, task.ownerId, key);
      if (await env.UPLOADS.head(key)) throw new Error('r2_object_still_present');
    }
    const remaining = await db.prepare(`SELECT 1 FROM uploads WHERE owner_id=? AND status!='deleted' LIMIT 1`)
      .bind(task.ownerId).first();
    if (remaining) throw new Error('uploads_pending_or_reserved');

    const activeLease = await db.prepare(`UPDATE deletion_tasks SET r2_verified_at=?
      WHERE id=? AND owner_id=? AND status='running' AND lease_token=? AND lease_expires_at>?`)
      .bind(now, task.id, task.ownerId, task.leaseToken, now).run();
    if (!activeLease.meta.changes) throw new Error('lease_lost');

    const expiresAt = now + TOMBSTONE_MAX_MS;
    const tombstoneKey = `${TOMBSTONE_PREFIX}${encodeURIComponent(task.ownerId)}.json`;
    await db.prepare(`UPDATE deletion_tasks SET tombstone_expires_at=? WHERE id=? AND owner_id=? AND status='running' AND lease_token=?`)
      .bind(expiresAt, task.id, task.ownerId, task.leaseToken).run();
    await env.UPLOADS.put(tombstoneKey, JSON.stringify({ accountId: task.ownerId, requestedAt: task.requestedAt, expiresAt }), {
      httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' },
      customMetadata: { private: 'true' },
    });
    if (!(await env.UPLOADS.head(tombstoneKey))) throw new Error('tombstone_write_unverified');
    await purgeAccountData(db, task.ownerId, now, task.leaseToken!);
    result.deletionTasksCompleted += 1;
  } catch (error) {
    await updateDeletionRetry(db, task, now, error instanceof Error ? error.message : 'maintenance_error');
    result.deletionTasksRetried += 1;
  }
}

async function processDeleteUploadOutbox(env: Env, now: number, result: MaintenanceResult, hooks: MaintenanceHooks): Promise<void> {
  const { DB: db } = env;
  // A recipe can be detached after its delete outbox was lost or before it was
  // written. Dispose of old unreferenced stored objects directly as well.
  const orphaned = await db.prepare(`SELECT u.id,u.owner_id AS ownerId,u.object_key AS objectKey,
      u.status,u.created_at AS createdAt FROM uploads u
    WHERE (u.status='stored' AND u.created_at<=? AND NOT EXISTS(SELECT 1 FROM recipe_uploads r WHERE r.owner_id=u.owner_id AND r.upload_id=u.id)
      AND NOT EXISTS(SELECT 1 FROM import_uploads iu JOIN imports i ON i.owner_id=iu.owner_id AND i.id=iu.import_id
        WHERE iu.owner_id=u.owner_id AND iu.upload_id=u.id AND i.status NOT IN ('expired','failed')))
      OR (u.status='reserved' AND u.created_at<=?) ORDER BY u.created_at,u.id LIMIT ?`)
    .bind(now - RESERVED_GRACE_MS, now - RESERVED_GRACE_MS, MAX_UPLOADS).all<UploadRow>();
  for (const upload of orphaned.results) {
    await hooks.beforeOrphanClaim?.(upload.id);
    if (upload.status === 'stored') {
      await db.prepare(`UPDATE uploads SET status='deleting' WHERE owner_id=? AND id=? AND status='stored'
        AND created_at<=? AND NOT EXISTS(SELECT 1 FROM recipe_uploads r
          WHERE r.owner_id=uploads.owner_id AND r.upload_id=uploads.id)
        AND NOT EXISTS(SELECT 1 FROM import_uploads iu JOIN imports i ON i.owner_id=iu.owner_id AND i.id=iu.import_id
          WHERE iu.owner_id=uploads.owner_id AND iu.upload_id=uploads.id AND i.status NOT IN ('expired','failed'))
        AND NOT EXISTS(SELECT 1 FROM deletion_tasks d WHERE d.owner_id=uploads.owner_id
          AND d.status IN ('queued','running','failed'))`)
        .bind(upload.ownerId, upload.id, now - RESERVED_GRACE_MS).run();
    } else if (upload.status === 'reserved') {
      await db.prepare(`UPDATE uploads SET status='deleting',deleting_from_reserved=1
        WHERE owner_id=? AND id=? AND status='reserved' AND created_at<=?
        AND NOT EXISTS(SELECT 1 FROM recipe_uploads r WHERE r.owner_id=uploads.owner_id AND r.upload_id=uploads.id)
        AND NOT EXISTS(SELECT 1 FROM import_uploads iu JOIN imports i ON i.owner_id=iu.owner_id AND i.id=iu.import_id
          WHERE iu.owner_id=uploads.owner_id AND iu.upload_id=uploads.id AND i.status NOT IN ('expired','failed'))
        AND NOT EXISTS(SELECT 1 FROM deletion_tasks d WHERE d.owner_id=uploads.owner_id
          AND d.status IN ('queued','running','failed'))`)
        .bind(upload.ownerId, upload.id, now - RESERVED_GRACE_MS).run();
    }
  }
  const direct = await db.prepare(`SELECT id,owner_id AS ownerId,object_key AS objectKey,created_at AS createdAt
    FROM uploads u WHERE status='deleting' AND NOT EXISTS(SELECT 1 FROM deletion_tasks d WHERE d.owner_id=u.owner_id
      AND d.status IN ('queued','running','failed')) ORDER BY created_at,id LIMIT ?`).bind(MAX_UPLOADS).all<UploadRow>();
  for (const upload of direct.results) {
    try {
      await deleteOwnedObject(env, upload.ownerId, upload.objectKey);
      await db.prepare(`UPDATE uploads SET status='deleted',deleted_at=? WHERE owner_id=? AND id=? AND status='deleting'`)
        .bind(now, upload.ownerId, upload.id).run();
      await db.prepare(`UPDATE outbox SET status='sent',updated_at=? WHERE owner_id=? AND task_type='delete_upload'
        AND task_id=? AND status!='sent'`).bind(now, upload.ownerId, upload.id).run();
      result.uploadsDeleted += 1;
    } catch {
      result.uploadsRetried += 1;
    }
  }
  const rows = await db.prepare(`SELECT id,owner_id AS ownerId,task_id AS taskId,payload_json AS payloadJson,
      attempts,updated_at AS updatedAt FROM outbox WHERE task_type='delete_upload' AND status IN ('pending','failed','sending')
      AND available_at<=? AND (status!='sending' OR updated_at<=?) ORDER BY available_at,id LIMIT ?`)
    .bind(now, now - LEASE_MS, MAX_UPLOADS).all<OutboxRow>();
  for (const row of rows.results) {
    const claim = await db.prepare(`UPDATE outbox SET status='sending',attempts=attempts+1,updated_at=?
      WHERE id=? AND owner_id=? AND task_type='delete_upload' AND status IN ('pending','failed','sending')
      AND (status!='sending' OR updated_at<=?)`).bind(now, row.id, row.ownerId, now - LEASE_MS).run();
    if (!claim.meta.changes) continue;
    try {
      const payload = JSON.parse(row.payloadJson) as { uploadId?: unknown; objectKey?: unknown };
      const uploadId = typeof payload.uploadId === 'string' ? payload.uploadId : row.taskId;
      const owned = await db.prepare(`SELECT object_key AS objectKey,status FROM uploads WHERE owner_id=? AND id=?`)
        .bind(row.ownerId, uploadId).first<{ objectKey: string; status: string }>();
      if (owned && owned.status === 'deleting') {
        await deleteOwnedObject(env, row.ownerId, owned.objectKey);
        await db.prepare(`UPDATE uploads SET status='deleted',deleted_at=? WHERE owner_id=? AND id=? AND status='deleting'`)
          .bind(now, row.ownerId, uploadId).run();
      }
      await db.prepare(`UPDATE outbox SET status='sent',updated_at=? WHERE id=? AND owner_id=? AND status='sending'`)
        .bind(now, row.id, row.ownerId).run();
      result.uploadsDeleted += owned?.status === 'deleting' ? 1 : 0;
    } catch (error) {
      const attempts = row.attempts + 1;
      await db.prepare(`UPDATE outbox SET status='failed',available_at=?,updated_at=? WHERE id=? AND owner_id=? AND status='sending'`)
        .bind(now + retryDelay(attempts), now, row.id, row.ownerId).run();
      result.uploadsRetried += 1;
    }
  }
}

async function applyRetention(db: D1Database, now: number, result: MaintenanceResult): Promise<void> {
  const expiredInvitations = await db.prepare(`SELECT id FROM invitations WHERE status='pending' AND expires_at<=?`)
    .bind(now).all<{ id: string }>();
  let releasedInvitations = 0;
  for (const invitation of expiredInvitations.results) {
    const invitee = await db.prepare(`SELECT id FROM app_accounts WHERE invitation_id=? AND status='invited'`)
      .bind(invitation.id).first<{ id: string }>();
    const update = db.prepare(`UPDATE invitations SET status='expired' WHERE id=? AND status='pending' AND expires_at<=?`)
      .bind(invitation.id, now);
    if (invitee) {
      await db.batch([
        update,
        db.prepare(`DELETE FROM app_accounts WHERE id=? AND invitation_id=? AND status='invited'`).bind(invitee.id, invitation.id),
        db.prepare(`DELETE FROM user WHERE id=? AND NOT EXISTS(SELECT 1 FROM app_accounts WHERE id=?)`)
          .bind(invitee.id, invitee.id),
      ]);
    } else {
      await update.run();
    }
    releasedInvitations += 1;
  }
  const statements: D1PreparedStatement[] = [
    db.prepare(`DELETE FROM imports WHERE (expires_at IS NOT NULL AND expires_at<=?)
      OR (expires_at IS NULL AND created_at<=?)`).bind(now, now - 7 * DAY),
    db.prepare(`DELETE FROM feedback WHERE expires_at<=? OR consented_at<=?`).bind(now, now - 90 * DAY),
    db.prepare(`DELETE FROM actions WHERE created_at<=? AND state IN ('succeeded','stopped','resolved','partial')
      AND NOT EXISTS(SELECT 1 FROM execution_lines e WHERE e.owner_id=actions.owner_id AND e.action_id=actions.id
        AND e.status IN ('sending','unknown'))`).bind(now - 90 * DAY),
    db.prepare(`DELETE FROM proposals WHERE updated_at<=? AND (status IN ('stale','expired','draft') OR
      (status IN ('ready','approved') AND expires_at<=?))
      AND NOT EXISTS(SELECT 1 FROM actions a WHERE a.owner_id=proposals.owner_id AND a.proposal_id=proposals.id
        AND a.state IN ('queued','running','unknown'))
      AND NOT EXISTS(SELECT 1 FROM execution_lines e WHERE e.owner_id=proposals.owner_id AND e.proposal_id=proposals.id
        AND e.status IN ('sending','unknown'))`).bind(now - 90 * DAY, now),
    db.prepare(`DELETE FROM ingredients WHERE retired_at IS NOT NULL AND retired_at<=?
      AND NOT EXISTS(SELECT 1 FROM proposal_need_sources pns WHERE pns.owner_id=ingredients.owner_id
        AND pns.recipe_id=ingredients.recipe_id AND pns.ingredient_id=ingredients.id)`)
      .bind(now - 90 * DAY),
    db.prepare(`DELETE FROM email_sends WHERE updated_at<=? AND status IN ('sent','failed','unknown')`).bind(now - 14 * DAY),
    db.prepare(`DELETE FROM verification WHERE (CASE WHEN typeof(expiresAt) IN ('integer','real')
      THEN CAST(expiresAt AS INTEGER) ELSE CAST(strftime('%s',expiresAt) AS INTEGER)*1000
      + CAST(substr(strftime('%f',expiresAt),4,3) AS INTEGER) END)<=?`).bind(now),
    db.prepare(`DELETE FROM rateLimit WHERE lastRequest<?`).bind(now - 30 * DAY),
    db.prepare(`DELETE FROM deletion_tasks WHERE status='complete' AND tombstone_expires_at IS NOT NULL AND tombstone_expires_at<=?`).bind(now),
    db.prepare(`DELETE FROM rateLimit WHERE key LIKE 'picnic:otp:%' AND lastRequest<?`).bind(now - 2 * 60 * 60 * 1000),
  ];
  // Optional security event storage differs between deployments; only touch it when present.
  const security = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='security_events'`).first();
  if (security) {
    const columns = await db.prepare('PRAGMA table_info(security_events)').all<{ name: string }>();
    if (columns.results.some(column => column.name === 'created_at')) {
      statements.push(db.prepare(`DELETE FROM security_events WHERE created_at<=?`).bind(now - 30 * DAY));
    }
  }
  const results = await db.batch(statements);
  result.invitationsExpired += releasedInvitations;
  result.retainedRowsDeleted += results.reduce((total, entry) => total + entry.meta.changes, 0);
}

export async function runMaintenance(env: Env, now = Date.now(), hooks: MaintenanceHooks = {}): Promise<MaintenanceResult> {
  const result = emptyResult();
  const claimed = await claimDeletionTasks(env.DB, now);
  result.deletionTasksClaimed = claimed.length;
  for (const task of claimed) await processDeletionTask(env, task, now, result);
  await processDeleteUploadOutbox(env, now, result, hooks);
  await applyRetention(env.DB, now, result);
  let tombstoneCursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const expiredTombstones = await env.UPLOADS.list({ prefix: TOMBSTONE_PREFIX, limit: 100, cursor: tombstoneCursor });
    for (const object of expiredTombstones.objects) {
      try {
        const stored = await env.UPLOADS.get(object.key);
        if (!stored) continue;
        const tombstone = await stored.json<{ expiresAt?: unknown }>();
        if (typeof tombstone.expiresAt === 'number' && tombstone.expiresAt <= now) await env.UPLOADS.delete(object.key);
      } catch {
        // Malformed tombstones are retained for manual restore inspection.
      }
    }
    if (!expiredTombstones.truncated || !expiredTombstones.cursor) break;
    tombstoneCursor = expiredTombstones.cursor;
  }
  const overdue = await env.DB.prepare(`SELECT id FROM deletion_tasks WHERE status IN ('queued','failed','running')
    AND delete_after<=? ORDER BY delete_after,id LIMIT 100`).bind(now).all<{ id: string }>();
  result.overdueDeletionTaskIds = overdue.results.map(row => row.id);
  return result;
}

/** Restore rehearsal helper: re-block accounts found in private R2 tombstones, then enqueue deletion. */
export async function reapplyDeletionTombstones(env: Env, now = Date.now()): Promise<number> {
  let reapplied = 0;
  let cursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
   const listed = await env.UPLOADS.list({ prefix: TOMBSTONE_PREFIX, limit: 100, cursor });
   for (const object of listed.objects) {
    const stored = await env.UPLOADS.get(object.key);
    if (!stored) continue;
    let parsed: { accountId?: unknown; requestedAt?: unknown; expiresAt?: unknown };
    try {
      const value = await stored.json() as unknown;
      if (!value || typeof value !== 'object') continue;
      parsed = value as typeof parsed;
    } catch { continue; }
    if (typeof parsed.accountId !== 'string' || typeof parsed.requestedAt !== 'number' ||
        typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= now) {
      if (typeof parsed.expiresAt === 'number' && parsed.expiresAt <= now) await env.UPLOADS.delete(object.key);
      continue;
    }
    const accountId = parsed.accountId;
    const account = await env.DB.prepare(`SELECT id FROM app_accounts WHERE id=?`).bind(accountId).first();
    if (!account) continue;
    const requestAt = Math.min(parsed.requestedAt, now);
    const taskId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(`UPDATE app_accounts SET status='deleting',updated_at=? WHERE id=?`).bind(now, accountId),
      env.DB.prepare(`UPDATE session_metadata SET revoked_at=COALESCE(revoked_at,?) WHERE owner_id=?`).bind(now, accountId),
      env.DB.prepare(`UPDATE connections SET status='disconnected',encrypted_resume_key=NULL,key_version=NULL,
        generation=generation+1,updated_at=? WHERE owner_id=? AND encrypted_resume_key IS NOT NULL`).bind(now, accountId),
      env.DB.prepare(`INSERT INTO deletion_tasks(id,owner_id,status,object_keys_json,requested_at,delete_after)
        VALUES(?,?,'queued',COALESCE((SELECT json_group_array(object_key) FROM uploads WHERE owner_id=? AND status!='deleted'),'[]'),?,?)
        ON CONFLICT(owner_id) DO UPDATE SET status='queued',completed_at=NULL,delete_after=MIN(deletion_tasks.delete_after,excluded.delete_after),
          object_keys_json=excluded.object_keys_json,attempts=0,next_attempt_at=0,lease_token=NULL,lease_expires_at=NULL,
          r2_verified_at=NULL,tombstone_expires_at=NULL,last_error_code=NULL`)
        .bind(taskId, accountId, accountId, requestAt, now),
    ]);
    reapplied += 1;
   }
   if (!listed.truncated || !listed.cursor) break;
   cursor = listed.cursor;
  }
  return reapplied;
}
