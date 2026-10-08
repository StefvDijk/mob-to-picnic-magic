export type Db = D1Database;
export type QueryResult<T> = { success: true; value: T } | { success: false; reason: 'not_found' | 'expired' | 'blocked' | 'conflict' };

const json = (value: unknown): string => JSON.stringify(value);
const requireSafeInteger = (value: number, label: string, minimum = 0) => {
  if (!Number.isSafeInteger(value) || value < minimum) throw new TypeError(`${label} must be a safe integer >= ${minimum}`);
};

/** Better Auth's SQLite adapter writes native dates as ISO text; older fixtures use epoch milliseconds. */
export const sessionExpiryMillisSql = `CASE WHEN typeof(s.expiresAt) IN ('integer','real')
  THEN CAST(s.expiresAt AS INTEGER)
  ELSE CAST(strftime('%s',s.expiresAt) AS INTEGER)*1000
    + CAST(substr(strftime('%f',s.expiresAt),4,3) AS INTEGER) END`;

export interface SessionAccess {
  ownerId: string;
  sessionId: string;
  authenticatedAt: number;
  lastActivityAt: number;
  lastVerifiedAt: number | null;
  sessionExpiresAt: number;
  accountStatus: 'invited' | 'active' | 'blocked' | 'deleting';
}

interface SessionRow extends SessionAccess {
  revokedAt: number | null;
}

const loadSession = (db: Db, ownerId: string, sessionId: string) => db.prepare(`
  SELECT sm.owner_id AS ownerId, sm.session_id AS sessionId,
    sm.authenticated_at AS authenticatedAt, sm.last_activity_at AS lastActivityAt,
    sm.last_verified_at AS lastVerifiedAt, sm.revoked_at AS revokedAt,
    ${sessionExpiryMillisSql} AS sessionExpiresAt, a.status AS accountStatus
  FROM session_metadata sm
  JOIN session s ON s.id = sm.session_id AND s.userId = sm.owner_id
  JOIN app_accounts a ON a.id = sm.owner_id
  WHERE sm.owner_id = ? AND sm.session_id = ?
`).bind(ownerId, sessionId);

export async function createSessionMetadata(db: Db, ownerId: string, sessionId: string, authenticatedAt: number): Promise<boolean> {
  await db.prepare(`
    INSERT INTO session_metadata(session_id,owner_id,authenticated_at,last_activity_at,last_verified_at,revoked_at)
    SELECT s.id,s.userId,?,?,NULL,NULL FROM session s JOIN app_accounts a ON a.id = s.userId
    WHERE s.id = ? AND s.userId = ? AND (${sessionExpiryMillisSql}) > ? AND a.status = 'active'
    ON CONFLICT(session_id) DO NOTHING
  `).bind(authenticatedAt, authenticatedAt, sessionId, ownerId, authenticatedAt).run();
  const row = await loadSession(db, ownerId, sessionId).first<SessionRow>();
  return !!row && row.ownerId === ownerId;
}

export async function getSessionAccess(db: Db, ownerId: string, sessionId: string, now: number): Promise<QueryResult<SessionAccess>> {
  const row = await loadSession(db, ownerId, sessionId).first<SessionRow>();
  if (!row) return { success: false, reason: 'not_found' };
  if (row.accountStatus !== 'active') return { success: false, reason: 'blocked' };
  if (!Number.isSafeInteger(row.sessionExpiresAt) || row.revokedAt !== null || row.authenticatedAt + 30 * 24 * 60 * 60 * 1000 <= now ||
      row.lastActivityAt + 14 * 24 * 60 * 60 * 1000 <= now || row.sessionExpiresAt <= now) {
    return { success: false, reason: 'expired' };
  }
  const { revokedAt: _revokedAt, ...access } = row;
  return { success: true, value: access };
}

export async function touchSession(db: Db, ownerId: string, sessionId: string, now: number): Promise<QueryResult<SessionAccess>> {
  const changed = await db.prepare(`
    UPDATE session_metadata SET last_activity_at = MAX(last_activity_at, ?)
    WHERE owner_id = ? AND session_id = ? AND revoked_at IS NULL
      AND authenticated_at + 2592000000 > ? AND last_activity_at + 1209600000 > ?
      AND EXISTS (SELECT 1 FROM session s JOIN app_accounts a ON a.id = s.userId
        WHERE s.id = session_metadata.session_id AND s.userId = ? AND (${sessionExpiryMillisSql}) > ? AND a.status = 'active')
  `).bind(now, ownerId, sessionId, now, now, ownerId, now).run();
  if (!changed.meta.changes) return getSessionAccess(db, ownerId, sessionId, now);
  return getSessionAccess(db, ownerId, sessionId, now);
}

export async function revokeSession(db: Db, ownerId: string, sessionId: string, now: number): Promise<boolean> {
  const result = await db.prepare(`UPDATE session_metadata SET revoked_at = COALESCE(revoked_at, ?)
    WHERE owner_id = ? AND session_id = ?`).bind(now, ownerId, sessionId).run();
  return result.meta.changes > 0;
}

export async function revokeAllSessions(db: Db, ownerId: string, now: number): Promise<number> {
  const result = await db.prepare(`UPDATE session_metadata SET revoked_at = COALESCE(revoked_at, ?)
    WHERE owner_id = ? AND revoked_at IS NULL`).bind(now, ownerId).run();
  return result.meta.changes;
}

export interface InvitationInput {
  id: string;
  email: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
}

export async function createInvitation(db: Db, adminOwnerId: string, input: InvitationInput): Promise<void> {
  await db.prepare(`INSERT INTO invitations(id,email,token_hash,status,invited_by,created_at,expires_at)
    VALUES(?,?,?,'pending',?,?,?)`).bind(input.id, input.email.trim().toLowerCase(), input.tokenHash,
      adminOwnerId, input.createdAt, input.expiresAt).run();
}

export async function createInvitedAccount(db: Db, ownerId: string, invitationId: string, email: string, now: number): Promise<void> {
  await db.prepare(`INSERT INTO app_accounts(id,email,role,status,invitation_id,created_at,updated_at)
    VALUES(?,?,'member','invited',?,?,?)`).bind(ownerId, email.trim().toLowerCase(), invitationId, now, now).run();
}

export async function consumeInvitation(db: Db, ownerId: string, invitationId: string, verifiedEmail: string, now: number): Promise<void> {
  await db.prepare(`INSERT INTO invitation_consumptions(invitation_id,owner_id,verified_email,consumed_at)
    VALUES(?,?,?,?)`).bind(invitationId, ownerId, verifiedEmail.trim().toLowerCase(), now).run();
}

export async function bootstrapAdmin(db: Db, ownerId: string, email: string, now: number): Promise<void> {
  await db.prepare(`INSERT INTO app_accounts(id,email,role,status,invitation_id,created_at,updated_at)
    VALUES(?,?,'admin','active',NULL,?,?)`).bind(ownerId, email.trim().toLowerCase(), now, now).run();
}

export interface BudgetMonth {
  month: string;
  appCapCents?: number;
  userCapCents?: number;
}

export interface BudgetReservationInput {
  id: string;
  importId: string;
  attemptId: string;
  capCents: number;
  createdAt: number;
}

export async function reserveBudget(db: Db, ownerId: string, month: BudgetMonth, input: BudgetReservationInput): Promise<void> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month.month)) throw new TypeError('month must be YYYY-MM');
  if (month.appCapCents !== undefined) {
    requireSafeInteger(month.appCapCents, 'appCapCents');
    if (month.appCapCents > 1500) throw new RangeError('app budget cannot exceed 1500 cents');
  }
  if (month.userCapCents !== undefined) {
    requireSafeInteger(month.userCapCents, 'userCapCents');
    if (month.userCapCents > 500) throw new RangeError('user budget cannot exceed 500 cents');
  }
  requireSafeInteger(input.capCents, 'reservation cap', 1);
  requireSafeInteger(input.createdAt, 'createdAt');
  if (input.capCents > 5) throw new RangeError('a complete import may reserve at most 5 cents');
  const app = db.prepare(`INSERT INTO app_budget_months(month,cap_cents) VALUES(?,?) ON CONFLICT(month) DO NOTHING`)
    .bind(month.month, month.appCapCents ?? 1500);
  const user = db.prepare(`INSERT INTO user_budget_months(owner_id,month,cap_cents) VALUES(?,?,?) ON CONFLICT(owner_id,month) DO NOTHING`)
    .bind(ownerId, month.month, month.userCapCents ?? 500);
  const reservation = db.prepare(`INSERT INTO budget_reservations(id,owner_id,import_id,month,attempt_id,cap_cents,state,created_at)
    VALUES(?,?,?,?,?,?,'reserved',?)`).bind(input.id, ownerId, input.importId, month.month,
      input.attemptId, input.capCents, input.createdAt);
  await db.batch([app, user, reservation]);
}

export async function markBudgetUnknown(db: Db, ownerId: string, reservationId: string, settledAt: number): Promise<boolean> {
  const result = await db.prepare(`UPDATE budget_reservations SET state='unknown',settled_at=?
    WHERE owner_id=? AND id=? AND state='reserved'`).bind(settledAt, ownerId, reservationId).run();
  return result.meta.changes > 0;
}

export async function settleBudget(db: Db, ownerId: string, reservationId: string, actualCents: number, settledAt: number): Promise<boolean> {
  requireSafeInteger(actualCents, 'actualCents');
  requireSafeInteger(settledAt, 'settledAt');
  const result = await db.prepare(`UPDATE budget_reservations SET state='settled',actual_cents=?,settled_at=?
    WHERE owner_id=? AND id=? AND state IN ('reserved','unknown')`).bind(actualCents, settledAt, ownerId, reservationId).run();
  return result.meta.changes > 0;
}

export async function releaseBudget(db: Db, ownerId: string, reservationId: string, settledAt: number): Promise<boolean> {
  const result = await db.prepare(`UPDATE budget_reservations SET state='released',settled_at=?
    WHERE owner_id=? AND id=? AND state='reserved'`).bind(settledAt, ownerId, reservationId).run();
  return result.meta.changes > 0;
}

export interface ApprovalInput {
  id: string;
  proposalId: string;
  proposalVersion: number;
  startingSessionId: string;
  snapshot: unknown;
  totalPriceCents: number | null;
  approvedAt: number;
  expiresAt: number;
}

export interface ActionInput {
  id: string;
  approvalId: string;
  proposalId: string;
  connectionId: string;
  connectionGeneration: number;
  createdAt: number;
  purchaseLineIds: string[];
}

function actionStatements(db: Db, ownerId: string, input: ActionInput): D1PreparedStatement[] {
  if (input.purchaseLineIds.length === 0) throw new TypeError('an action requires at least one purchase line');
  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO actions(id,owner_id,approval_id,proposal_id,connection_id,connection_generation,state,created_at)
      VALUES(?,?,?,?,?,?,'queued',?)`).bind(input.id, ownerId, input.approvalId, input.proposalId,
        input.connectionId, input.connectionGeneration, input.createdAt),
    db.prepare(`DELETE FROM connection_execution_claims WHERE connection_id=? AND state='released'`)
      .bind(input.connectionId),
    db.prepare(`INSERT INTO connection_execution_claims(connection_id,owner_id,action_id,state,acquired_at,updated_at)
      VALUES(?,?,?,'active',?,?)`).bind(input.connectionId, ownerId, input.id, input.createdAt, input.createdAt),
  ];
  for (let ordinal = 0; ordinal < input.purchaseLineIds.length; ordinal += 1) {
    statements.push(db.prepare(`INSERT INTO execution_lines(id,owner_id,action_id,connection_id,proposal_id,purchase_line_id,ordinal,status)
      VALUES(?,?,?,?,?,?,?,'unsent')`).bind(`${input.id}:${ordinal}`, ownerId, input.id, input.connectionId,
        input.proposalId, input.purchaseLineIds[ordinal], ordinal));
  }
  statements.push(db.prepare(`INSERT INTO outbox(id,owner_id,task_type,task_id,version,payload_json,status,available_at,created_at,updated_at)
      VALUES(?,?,'add',?,1,?,'pending',?,?,?)`).bind(`outbox:${input.id}`, ownerId, input.id,
      json({ actionId: input.id, version: 1 }), input.createdAt, input.createdAt, input.createdAt));
  return statements;
}

export async function createApprovedAction(db: Db, ownerId: string, approval: ApprovalInput, action: ActionInput): Promise<void> {
  if (approval.totalPriceCents !== null) requireSafeInteger(approval.totalPriceCents, 'totalPriceCents');
  if (approval.id !== action.approvalId || approval.proposalId !== action.proposalId) {
    throw new TypeError('approval and action must refer to the same proposal and approval');
  }
  const approvalInsert = db.prepare(`INSERT INTO approvals(id,owner_id,proposal_id,proposal_version,starting_session_id,snapshot_json,
    total_price_cents,approved_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(approval.id, ownerId, approval.proposalId, approval.proposalVersion, approval.startingSessionId,
      json(approval.snapshot), approval.totalPriceCents, approval.approvedAt, approval.expiresAt);
  await db.batch([approvalInsert, ...actionStatements(db, ownerId, action)]);
}

export async function claimAction(db: Db, ownerId: string, actionId: string, now: number): Promise<boolean> {
  const result = await db.prepare(`UPDATE actions SET state='running',started_at=COALESCE(started_at,?)
    WHERE owner_id=? AND id=? AND state='queued' AND EXISTS (
      SELECT 1 FROM app_accounts a WHERE a.id=actions.owner_id AND a.status='active')`)
    .bind(now, ownerId, actionId).run();
  return result.meta.changes > 0;
}

export async function markExecutionSending(db: Db, ownerId: string, actionId: string, lineId: string, attemptId: string, now: number): Promise<boolean> {
  const result = await db.prepare(`UPDATE execution_lines SET status='sending',attempt_id=?,attempt_started_at=?
    WHERE owner_id=? AND action_id=? AND id=? AND status='unsent'`)
    .bind(attemptId, now, ownerId, actionId, lineId).run();
  return result.meta.changes > 0;
}

export async function completeExecutionLine(db: Db, ownerId: string, actionId: string, lineId: string,
    outcome: 'added' | 'not_added' | 'unknown', evidence: unknown | null, now: number): Promise<boolean> {
  const result = await db.prepare(`UPDATE execution_lines SET status=?,evidence_json=?,completed_at=?
    WHERE owner_id=? AND action_id=? AND id=? AND status='sending'`)
    .bind(outcome, evidence === null ? null : json(evidence), now, ownerId, actionId, lineId).run();
  return result.meta.changes > 0;
}

export async function markStaleSendingUnknown(db: Db, ownerId: string, actionId: string, before: number, now: number): Promise<number> {
  const result = await db.batch([
    db.prepare(`UPDATE execution_lines SET status='unknown',completed_at=? WHERE owner_id=? AND action_id=? AND status='sending' AND attempt_started_at <= ?`)
      .bind(now, ownerId, actionId, before),
    db.prepare(`UPDATE actions SET state='unknown',finished_at=? WHERE owner_id=? AND id=? AND EXISTS (
      SELECT 1 FROM execution_lines e WHERE e.owner_id=actions.owner_id AND e.action_id=actions.id AND e.status='unknown')`)
      .bind(now, ownerId, actionId),
    db.prepare(`UPDATE connection_execution_claims SET state='unknown',updated_at=? WHERE owner_id=? AND action_id=? AND state='active' AND EXISTS (
      SELECT 1 FROM execution_lines e WHERE e.owner_id=connection_execution_claims.owner_id AND e.action_id=connection_execution_claims.action_id AND e.status='unknown')`)
      .bind(now, ownerId, actionId),
  ]);
  return result[0]?.meta.changes ?? 0;
}

export async function resolveUnknownExecutionLine(db: Db, ownerId: string, actionId: string, lineId: string,
    resolution: 'confirmed_added' | 'confirmed_not_added', now: number): Promise<boolean> {
  const result = await db.prepare(`UPDATE execution_lines SET status=?,user_resolution=?,completed_at=?
    WHERE owner_id=? AND action_id=? AND id=? AND status='unknown'`)
    .bind(resolution === 'confirmed_added' ? 'added' : 'not_added', resolution, now, ownerId, actionId, lineId).run();
  return result.meta.changes > 0;
}

export async function finishAction(db: Db, ownerId: string, actionId: string, state: 'succeeded' | 'partial' | 'stopped' | 'resolved', now: number): Promise<void> {
  await db.batch([
    db.prepare(`UPDATE actions SET state=?,finished_at=? WHERE owner_id=? AND id=? AND state IN ('queued','running','partial','unknown')`)
      .bind(state, now, ownerId, actionId),
    db.prepare(`UPDATE connection_execution_claims SET state='released',updated_at=? WHERE owner_id=? AND action_id=? AND state IN ('active','unknown')`)
      .bind(now, ownerId, actionId),
  ]);
}

export async function getOwnedRecipe(db: Db, ownerId: string, recipeId: string) {
  return db.prepare(`SELECT id,owner_id AS ownerId,title,source_label AS sourceLabel,source_url AS sourceUrl,
      base_servings_num AS baseServingsNum,base_servings_den AS baseServingsDen,version,steps_json AS stepsJson,
      created_at AS createdAt,updated_at AS updatedAt
    FROM recipes WHERE owner_id=? AND id=? AND deleted_at IS NULL`).bind(ownerId, recipeId).first();
}

/** Final DB purge only after the current deletion lease has verified R2 cleanup. */
export async function purgeAccountData(db: Db, ownerId: string, now: number, leaseToken: string): Promise<void> {
  const account = await db.prepare(`SELECT email,status FROM app_accounts WHERE id=?`).bind(ownerId).first<{ email: string; status: string }>();
  if (!account) return;
  if (account.status !== 'deleting') throw new Error('account purge requires deleting status');
  const task = await db.prepare(`SELECT id FROM deletion_tasks WHERE owner_id=? AND status='running'
    AND lease_token=? AND lease_expires_at>? AND r2_verified_at IS NOT NULL`)
    .bind(ownerId, leaseToken, now).first();
  if (!task) throw new Error('account purge requires verified R2 cleanup and a live deletion lease');
  const remaining = await db.prepare(`SELECT 1 FROM uploads WHERE owner_id=? AND status!='deleted' LIMIT 1`)
    .bind(ownerId).first();
  if (remaining) throw new Error('account purge requires every upload to be deleted');
  await db.batch([
    db.prepare(`INSERT INTO account_purge_guards(owner_id,lease_token,checked_at) VALUES(?,?,?)`)
      .bind(ownerId, leaseToken, now),
    // The migration's delete trigger keeps unresolved AI attempts charged to
    // app-wide totals when their import or account-owned detail is removed.
    db.prepare(`DELETE FROM execution_lines WHERE owner_id=?`).bind(ownerId),
    db.prepare(`DELETE FROM connection_execution_claims WHERE owner_id=?`).bind(ownerId),
    db.prepare(`DELETE FROM actions WHERE owner_id=?`).bind(ownerId),
    db.prepare(`DELETE FROM approvals WHERE owner_id=?`).bind(ownerId),
    db.prepare(`DELETE FROM purchase_line_allocations WHERE owner_id=?`).bind(ownerId),
    db.prepare(`DELETE FROM basket_allocations WHERE owner_id=?`).bind(ownerId),
    db.prepare(`DELETE FROM purchase_lines WHERE owner_id=?`).bind(ownerId),
    db.prepare(`DELETE FROM proposal_need_sources WHERE owner_id=?`).bind(ownerId),
    db.prepare(`DELETE FROM proposal_needs WHERE owner_id=?`).bind(ownerId),
    db.prepare(`DELETE FROM proposals WHERE owner_id=?`).bind(ownerId),
    db.prepare(`DELETE FROM ingredients WHERE owner_id=?`).bind(ownerId),
    db.prepare(`DELETE FROM recipes WHERE owner_id=?`).bind(ownerId),
    db.prepare(`DELETE FROM import_uploads WHERE owner_id=?`).bind(ownerId),
    db.prepare(`DELETE FROM imports WHERE owner_id=?`).bind(ownerId),
    db.prepare(`DELETE FROM uploads WHERE owner_id=?`).bind(ownerId),
    db.prepare(`DELETE FROM product_preferences WHERE owner_id=?`).bind(ownerId),
    db.prepare(`DELETE FROM feedback WHERE owner_id=?`).bind(ownerId),
    db.prepare(`DELETE FROM outbox WHERE owner_id=?`).bind(ownerId),
    db.prepare(`DELETE FROM session_metadata WHERE owner_id=?`).bind(ownerId),
    db.prepare(`DELETE FROM session WHERE userId=?`).bind(ownerId),
    db.prepare(`DELETE FROM account WHERE userId=?`).bind(ownerId),
    db.prepare(`DELETE FROM verification WHERE identifier IN (?,?)`)
      .bind(`sign-in-otp-${account.email}`, `email-verification-otp-${account.email}`),
    db.prepare(`DELETE FROM email_sends WHERE owner_id=?`).bind(ownerId),
    db.prepare(`DELETE FROM invitations WHERE invited_by=?`).bind(ownerId),
    db.prepare(`DELETE FROM invitation_consumptions WHERE owner_id=?`).bind(ownerId),
    db.prepare(`DELETE FROM connections WHERE owner_id=?`).bind(ownerId),
    db.prepare(`DELETE FROM budget_reservations WHERE owner_id=?`).bind(ownerId),
    db.prepare(`DELETE FROM app_accounts WHERE id=?`).bind(ownerId),
    db.prepare(`DELETE FROM user WHERE id=?`).bind(ownerId),
    db.prepare(`UPDATE deletion_tasks SET status='complete',completed_at=?,lease_token=NULL,lease_expires_at=NULL,
      object_keys_json='[]',cursor=NULL,last_error_code=NULL
      WHERE owner_id=? AND status='running' AND lease_token=? AND lease_expires_at>? AND r2_verified_at IS NOT NULL`)
      .bind(now, ownerId, leaseToken, now),
    db.prepare(`DELETE FROM account_purge_guards WHERE owner_id=? AND lease_token=?`).bind(ownerId, leaseToken),
  ]);
}

export interface UploadReservationInput {
  id: string;
  objectKey: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  byteSize: number;
  createdAt: number;
}

export async function reserveUpload(db: Db, ownerId: string, input: UploadReservationInput): Promise<void> {
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > 8 * 1024 * 1024) {
    throw new TypeError('upload size must be a positive safe integer no greater than 8 MiB');
  }
  if (input.objectKey.startsWith('private/account-tombstones/')) {
    throw new TypeError('upload object key is reserved');
  }
  await db.batch([
    db.prepare(`INSERT INTO user_upload_usage(owner_id) VALUES(?) ON CONFLICT(owner_id) DO NOTHING`).bind(ownerId),
    db.prepare(`INSERT INTO uploads(id,owner_id,object_key,media_type,byte_size,status,created_at)
      SELECT ?,a.id,?,?,?,'reserved',? FROM app_accounts a WHERE a.id=? AND a.status='active'`)
      .bind(input.id, input.objectKey, input.mediaType, input.byteSize, input.createdAt, ownerId),
  ]);
  const stored = await db.prepare(`SELECT 1 FROM uploads WHERE owner_id=? AND id=? AND status='reserved'`)
    .bind(ownerId, input.id).first();
  if (!stored) throw new Error('upload reservation requires active account');
}

export async function markUploadStored(db: Db, ownerId: string, uploadId: string): Promise<boolean> {
  const result = await db.prepare(`UPDATE uploads SET status='stored' WHERE owner_id=? AND id=? AND status='reserved'
    AND EXISTS(SELECT 1 FROM app_accounts a WHERE a.id=uploads.owner_id AND a.status='active')`)
    .bind(ownerId, uploadId).run();
  return result.meta.changes > 0;
}

export async function markUploadDeleting(db: Db, ownerId: string, uploadId: string): Promise<boolean> {
  const result = await db.prepare(`UPDATE uploads SET status='deleting' WHERE owner_id=? AND id=? AND status='stored'`)
    .bind(ownerId, uploadId).run();
  return result.meta.changes > 0;
}

export async function markUploadDeleted(db: Db, ownerId: string, uploadId: string, deletedAt: number): Promise<boolean> {
  const result = await db.prepare(`UPDATE uploads SET status='deleted',deleted_at=?
    WHERE owner_id=? AND id=? AND status IN ('reserved','deleting')`).bind(deletedAt, ownerId, uploadId).run();
  return result.meta.changes > 0;
}

export interface EmailSendReservationInput {
  id: string;
  ownerId?: string | null;
  addressHash: string;
  day: string;
  month: string;
  createdAt: number;
  dailyCap?: number;
  monthlyCap?: number;
}

export async function reserveEmailSend(db: Db, input: EmailSendReservationInput): Promise<void> {
  requireSafeInteger(input.dailyCap ?? 90, 'dailyCap', 1);
  requireSafeInteger(input.monthlyCap ?? 2700, 'monthlyCap', 1);
  if ((input.dailyCap ?? 90) > 90 || (input.monthlyCap ?? 2700) > 2700) {
    throw new RangeError('email send cap exceeds pilot limit');
  }
  await db.batch([
    db.prepare(`INSERT INTO email_send_usage(period,cap_count) VALUES(?,?) ON CONFLICT(period) DO NOTHING`)
      .bind(input.day, input.dailyCap ?? 90),
    db.prepare(`INSERT INTO email_send_usage(period,cap_count) VALUES(?,?) ON CONFLICT(period) DO NOTHING`)
      .bind(input.month, input.monthlyCap ?? 2700),
    db.prepare(`INSERT INTO email_sends(id,owner_id,address_hash,daily_period,monthly_period,status,created_at,updated_at)
      VALUES(?,?,?,?,?,'reserved',?,?)`).bind(input.id, input.ownerId ?? null, input.addressHash, input.day, input.month, input.createdAt, input.createdAt),
  ]);
}

export async function settleEmailSend(db: Db, sendId: string, status: 'sent' | 'unknown' | 'failed', updatedAt: number): Promise<boolean> {
  const result = await db.prepare(`UPDATE email_sends SET status=?,updated_at=? WHERE id=? AND status='reserved'`)
    .bind(status, updatedAt, sendId).run();
  return result.meta.changes > 0;
}
