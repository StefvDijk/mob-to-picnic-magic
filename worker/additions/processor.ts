import type { AuthEnv } from '../auth';
import { claimAction, completeExecutionLine, finishAction, markStaleSendingUnknown, sessionExpiryMillisSql } from '../db';
import { addPicnicProduct } from '../adapters/picnic';
import { decryptCredential, type PicnicKeyEnv } from '../security/credentials';

const STALE_MS = 60_000;
type ActionEnv = AuthEnv & PicnicKeyEnv;
export type AdditionDependencies = { add?: typeof addPicnicProduct; now?: () => number };
export type AdditionTaskOutcome = 'done' | 'busy';

interface ActionRow {
  id: string; ownerId: string; state: string; connectionId: string; connectionGeneration: number;
  approvalId: string; proposalId: string; startedAt: number | null;
}
interface ConnectionRow { id: string; generation: number; encryptedResumeKey: string; keyVersion: string }
interface LineRow { id: string; ordinal: number; status: string; productSnapshot: string; packCount: number }
interface ProductSnapshot { id?: unknown }

async function loadAction(env: ActionEnv, actionId: string): Promise<ActionRow | null> {
  return env.DB.prepare(`SELECT id,owner_id AS ownerId,state,connection_id AS connectionId,
      connection_generation AS connectionGeneration,approval_id AS approvalId,proposal_id AS proposalId,started_at AS startedAt
    FROM actions WHERE id=?`).bind(actionId).first<ActionRow>();
}

async function skipUnsent(env: ActionEnv, action: ActionRow, now: number): Promise<void> {
  await env.DB.prepare(`UPDATE execution_lines SET status='skipped',completed_at=?
    WHERE owner_id=? AND action_id=? AND status='unsent'`).bind(now, action.ownerId, action.id).run();
}

async function makeUnknown(env: ActionEnv, action: ActionRow, now: number): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`UPDATE execution_lines SET status='skipped',completed_at=? WHERE owner_id=? AND action_id=? AND status='unsent'`)
      .bind(now, action.ownerId, action.id),
    env.DB.prepare(`UPDATE actions SET state='unknown',finished_at=? WHERE owner_id=? AND id=? AND state='running'`)
      .bind(now, action.ownerId, action.id),
    env.DB.prepare(`UPDATE connection_execution_claims SET state='unknown',updated_at=? WHERE owner_id=? AND action_id=? AND state='active'`)
      .bind(now, action.ownerId, action.id),
  ]);
}

async function markSending(env: ActionEnv, action: ActionRow, line: LineRow, attemptId: string, now: number): Promise<boolean> {
  const result = await env.DB.prepare(`UPDATE execution_lines SET status='sending',attempt_id=?,attempt_started_at=?
    WHERE owner_id=? AND action_id=? AND id=? AND status='unsent' AND EXISTS(
      SELECT 1 FROM actions ac
      JOIN approvals ap ON ap.owner_id=ac.owner_id AND ap.id=ac.approval_id
      JOIN proposals p ON p.owner_id=ac.owner_id AND p.id=ac.proposal_id
      JOIN recipes r ON r.owner_id=p.owner_id AND r.id=p.recipe_id
      JOIN connections c ON c.owner_id=ac.owner_id AND c.id=ac.connection_id
      JOIN connection_execution_claims cc ON cc.owner_id=ac.owner_id AND cc.connection_id=ac.connection_id
        AND cc.action_id=ac.id AND cc.state='active'
      JOIN app_accounts a ON a.id=ac.owner_id
      JOIN app_switches st ON st.singleton=1
      JOIN session_metadata sm ON sm.owner_id=ap.owner_id AND sm.session_id=ap.starting_session_id
      JOIN session s ON s.id=sm.session_id AND s.userId=sm.owner_id
      WHERE ac.owner_id=? AND ac.id=? AND ac.state='running'
        AND ap.invalidated_at IS NULL AND ap.expires_at>?
        AND p.status='ready' AND p.version=ap.proposal_version
        AND r.deleted_at IS NULL AND r.version=p.recipe_version
        AND c.status='connected' AND c.generation=ac.connection_generation
        AND a.status='active' AND st.add_enabled=1
        AND sm.revoked_at IS NULL AND sm.authenticated_at+2592000000>?
        AND sm.last_activity_at+1209600000>?
        AND (${sessionExpiryMillisSql})>?
    )`).bind(attemptId, now, action.ownerId, action.id, line.id,
      action.ownerId, action.id, now, now, now, now).run();
  return result.meta.changes === 1;
}

async function stopAction(env: ActionEnv, action: ActionRow, now: number): Promise<void> {
  await skipUnsent(env, action, now);
  const counts = await env.DB.prepare(`SELECT SUM(status='added') AS added,SUM(status='unknown') AS unknown,
      SUM(status='sending') AS sending,SUM(status='unsent') AS unsent
    FROM execution_lines WHERE owner_id=? AND action_id=?`).bind(action.ownerId, action.id)
    .first<{ added: number | null; unknown: number | null; sending: number | null; unsent: number | null }>();
  if ((counts?.unknown ?? 0) > 0 || (counts?.sending ?? 0) > 0) return;
  const state = (counts?.added ?? 0) > 0 ? 'partial' : 'stopped';
  await finishAction(env.DB, action.ownerId, action.id, state, now);
}

function snapshotProductId(raw: string): string | null {
  try {
    const snapshot = JSON.parse(raw) as ProductSnapshot;
    return typeof snapshot.id === 'string' && snapshot.id.length > 0 && snapshot.id.length <= 100 ? snapshot.id : null;
  } catch { return null; }
}

/** Runs an approved action with a durable send marker before each non-retryable Picnic call. */
export async function processAdditionTask(
  env: ActionEnv, actionId: string, version: number, deps: AdditionDependencies = {},
): Promise<AdditionTaskOutcome> {
  if (version !== 1 || !actionId || actionId.length > 128) return 'done';
  const now = (deps.now ?? Date.now)();
  let action = await loadAction(env, actionId);
  if (!action) return 'done';
  if (action.state === 'unknown' || ['succeeded', 'partial', 'stopped', 'resolved'].includes(action.state)) return 'done';

  if (action.state === 'running') {
    if (action.startedAt === null || action.startedAt > now - STALE_MS) return 'busy';
    await markStaleSendingUnknown(env.DB, action.ownerId, action.id, now - STALE_MS, now);
    const statuses = await env.DB.prepare(`SELECT SUM(status='sending') AS sending,SUM(status='unknown') AS unknown
      FROM execution_lines WHERE owner_id=? AND action_id=?`).bind(action.ownerId, action.id)
      .first<{ sending: number | null; unknown: number | null }>();
    if ((statuses?.sending ?? 0) > 0) return 'busy';
    if ((statuses?.unknown ?? 0) > 0) {
      await skipUnsent(env, action, now);
      return 'done';
    }
    await stopAction(env, action, now);
    return 'done';
  }

  if (action.state !== 'queued') return 'done';
  if (!await claimAction(env.DB, action.ownerId, action.id, now)) {
    action = await loadAction(env, actionId);
    if (action?.state === 'running') return 'busy';
    if (action?.state === 'queued') {
      const account = await env.DB.prepare(`SELECT status FROM app_accounts WHERE id=?`).bind(action.ownerId).first<{ status: string }>();
      if (!account || account.status !== 'active') await stopAction(env, action, now);
    }
    return 'done';
  }
  action = await loadAction(env, actionId);
  if (!action || action.state !== 'running') return 'done';

  const owner = await env.DB.prepare(`SELECT a.status AS accountStatus,st.add_enabled AS addEnabled
    FROM app_accounts a CROSS JOIN app_switches st WHERE a.id=? AND st.singleton=1`)
    .bind(action.ownerId).first<{ accountStatus: string; addEnabled: number }>();
  if (!owner || owner.accountStatus !== 'active' || owner.addEnabled !== 1) {
    await stopAction(env, action, now);
    return 'done';
  }
  const connection = await env.DB.prepare(`SELECT id,generation,encrypted_resume_key AS encryptedResumeKey,key_version AS keyVersion
    FROM connections WHERE owner_id=? AND id=? AND status='connected' AND generation=? AND encrypted_resume_key IS NOT NULL`)
    .bind(action.ownerId, action.connectionId, action.connectionGeneration).first<ConnectionRow>();
  if (!connection) {
    await stopAction(env, action, now);
    return 'done';
  }
  let authKey: string;
  try { authKey = await decryptCredential(env, action.ownerId, connection.id, 'resume', connection.keyVersion, connection.encryptedResumeKey); }
  catch { await stopAction(env, action, now); return 'done'; }

  const lines = await env.DB.prepare(`SELECT e.id,e.ordinal,e.status,p.product_snapshot_json AS productSnapshot,p.pack_count AS packCount
    FROM execution_lines e JOIN purchase_lines p ON p.owner_id=e.owner_id AND p.id=e.purchase_line_id
      AND p.proposal_id=e.proposal_id
    WHERE e.owner_id=? AND e.action_id=? ORDER BY e.ordinal`).bind(action.ownerId, action.id).all<LineRow>();
  const add = deps.add ?? addPicnicProduct;
  for (const line of lines.results ?? []) {
    if (line.status !== 'unsent') continue;
    const productId = snapshotProductId(line.productSnapshot);
    if (!productId || !Number.isSafeInteger(line.packCount) || line.packCount < 1) {
      await env.DB.prepare(`UPDATE execution_lines SET status='not_added',completed_at=? WHERE owner_id=? AND action_id=? AND id=? AND status='unsent'`)
        .bind(now, action.ownerId, action.id, line.id).run();
      await stopAction(env, action, now);
      return 'done';
    }
    let sending: boolean;
    try { sending = await markSending(env, action, line, crypto.randomUUID(), (deps.now ?? Date.now)()); }
    catch { sending = false; }
    if (!sending) { await stopAction(env, action, (deps.now ?? Date.now)()); return 'done'; }
    const attemptNow = (deps.now ?? Date.now)();
    try {
      await add(authKey, productId, line.packCount);
      const completed = await completeExecutionLine(env.DB, action.ownerId, action.id, line.id, 'added', { confirmed: true }, attemptNow);
      if (!completed) {
        await markStaleSendingUnknown(env.DB, action.ownerId, action.id, attemptNow, attemptNow);
        await skipUnsent(env, action, attemptNow);
        return 'done';
      }
    } catch {
      const completed = await completeExecutionLine(env.DB, action.ownerId, action.id, line.id, 'unknown', null, attemptNow);
      if (!completed) await markStaleSendingUnknown(env.DB, action.ownerId, action.id, attemptNow, attemptNow);
      await makeUnknown(env, action, attemptNow);
      return 'done';
    }
  }

  const remaining = await env.DB.prepare(`SELECT SUM(status='unsent') AS unsent,SUM(status='sending') AS sending,
      SUM(status='unknown') AS unknown,SUM(status='not_added') AS notAdded,SUM(status='added') AS added
    FROM execution_lines WHERE owner_id=? AND action_id=?`).bind(action.ownerId, action.id)
    .first<{ unsent: number | null; sending: number | null; unknown: number | null; notAdded: number | null; added: number | null }>();
  if ((remaining?.unknown ?? 0) > 0 || (remaining?.sending ?? 0) > 0) return 'done';
  if ((remaining?.unsent ?? 0) > 0) await skipUnsent(env, action, (deps.now ?? Date.now)());
  const state = (remaining?.notAdded ?? 0) > 0 || (remaining?.added ?? 0) < lines.results.length ?
    (remaining?.added ?? 0) > 0 ? 'partial' : 'stopped' : 'succeeded';
  await finishAction(env.DB, action.ownerId, action.id, state, (deps.now ?? Date.now)());
  return 'done';
}
