export interface ImportQueueEnv {
  DB: D1Database;
  IMPORT_QUEUE: Queue<{ kind: 'import'; taskId: string; version: number }>;
}

/** Publishes ID-only import jobs. Repeated sends are safe because processing is fenced/idempotent. */
export async function dispatchImportOutbox(env: ImportQueueEnv, now = Date.now(), limit = 10): Promise<number> {
  const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const staleBefore = now - 60_000;
  // Reconcile jobs whose dispatch was marked sent before a lost queue message,
  // and repair a missing outbox row from the durable import itself.
  await env.DB.prepare(`UPDATE outbox SET status='pending',available_at=?,updated_at=?,dispatch_token=NULL
    WHERE task_type='import' AND status IN ('sent','unknown') AND EXISTS(
      SELECT 1 FROM imports i JOIN app_accounts a ON a.id=i.owner_id
      WHERE i.id=outbox.task_id AND i.owner_id=outbox.owner_id AND i.work_version=outbox.version
        AND a.status='active' AND i.updated_at<=? AND
        (i.status='queued' OR (i.status='running' AND COALESCE(i.work_expires_at,0)<=?)))`)
    .bind(now, now, staleBefore, now).run();
  await env.DB.prepare(`UPDATE outbox SET status='pending',available_at=?,updated_at=?,dispatch_token=NULL
    WHERE task_type='import' AND status='sending' AND updated_at<=? AND EXISTS(
      SELECT 1 FROM imports i JOIN app_accounts a ON a.id=i.owner_id
      WHERE i.id=outbox.task_id AND i.owner_id=outbox.owner_id AND i.work_version=outbox.version
        AND a.status='active' AND i.updated_at<=? AND
        (i.status='queued' OR (i.status='running' AND COALESCE(i.work_expires_at,0)<=?)))`)
    .bind(now, now, staleBefore, staleBefore, now).run();
  await env.DB.prepare(`INSERT OR IGNORE INTO outbox(id,owner_id,task_type,task_id,version,payload_json,status,available_at,created_at,updated_at)
    SELECT 'outbox:'||i.id,i.owner_id,'import',i.id,i.work_version,'{}','pending',?,?,?
    FROM imports i JOIN app_accounts a ON a.id=i.owner_id
    WHERE i.status IN ('queued','running') AND i.updated_at<=? AND a.status='active'
      AND (i.status='queued' OR COALESCE(i.work_expires_at,0)<=?)
      AND NOT EXISTS(SELECT 1 FROM outbox o WHERE o.task_type='import' AND o.task_id=i.id AND o.version=i.work_version)`)
    .bind(now, now, now, staleBefore, now).run();
  const rows = await env.DB.prepare(`SELECT id,task_id AS taskId,version,attempts FROM outbox
    WHERE task_type='import' AND available_at<=? AND
      (status IN ('pending','failed') OR (status='sending' AND updated_at<=?)) AND EXISTS(
        SELECT 1 FROM imports i JOIN app_accounts a ON a.id=i.owner_id WHERE i.id=outbox.task_id
          AND i.owner_id=outbox.owner_id AND i.work_version=outbox.version AND a.status='active'
          AND (i.status='queued' OR (i.status='running' AND COALESCE(i.work_expires_at,0)<=?)))
    ORDER BY available_at,created_at LIMIT ?`).bind(now, now - 60_000, now, boundedLimit)
    .all<{ id: string; taskId: string; version: number; attempts: number }>();
  let sent = 0;
  for (const row of rows.results ?? []) {
    const token = crypto.randomUUID();
    const claim = await env.DB.prepare(`UPDATE outbox SET status='sending',attempts=attempts+1,updated_at=?,dispatch_token=?
      WHERE id=? AND task_type='import' AND available_at<=? AND
       (status IN ('pending','failed') OR (status='sending' AND updated_at<=?)) AND EXISTS(
         SELECT 1 FROM imports i JOIN app_accounts a ON a.id=i.owner_id WHERE i.id=outbox.task_id
           AND i.owner_id=outbox.owner_id AND i.work_version=outbox.version AND a.status='active'
           AND (i.status='queued' OR (i.status='running' AND COALESCE(i.work_expires_at,0)<=?)))`)
      .bind(now, token, row.id, now, now - 60_000, now).run();
    if (claim.meta.changes !== 1) continue;
    try {
      await env.IMPORT_QUEUE.send({ kind: 'import', taskId: row.taskId, version: row.version });
      await env.DB.prepare(`UPDATE outbox SET status='sent',updated_at=?,dispatch_token=NULL WHERE id=? AND status='sending' AND dispatch_token=?`)
        .bind(now, row.id, token).run();
      sent++;
    } catch {
      await env.DB.prepare(`UPDATE outbox SET status='failed',available_at=?,updated_at=?,dispatch_token=NULL WHERE id=? AND status='sending' AND dispatch_token=?`)
        .bind(now + Math.min(60 * 60_000, 1000 * 2 ** Math.min(row.attempts + 1, 10)), now, row.id, token).run();
    }
  }
  return sent;
}
