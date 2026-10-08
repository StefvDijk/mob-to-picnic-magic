export interface AdditionQueueEnv {
  DB: D1Database;
  ADD_QUEUE: Queue<{ kind: 'add'; taskId: string; version: number }>;
}

/** Publishes ID-only jobs; duplicate deliveries are fenced by durable action/line state. */
export async function dispatchAdditionOutbox(env: AdditionQueueEnv, now = Date.now(), limit = 10): Promise<number> {
  const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const staleBefore = now - 60_000;
  const eligibleAction = `EXISTS(SELECT 1 FROM actions a
    WHERE a.id=outbox.task_id AND a.owner_id=outbox.owner_id AND a.state IN ('queued','running')
      AND (a.state='queued' OR COALESCE(a.started_at,a.created_at)<=?))`;

  await env.DB.prepare(`UPDATE outbox SET status='pending',available_at=?,updated_at=?,dispatch_token=NULL
    WHERE task_type='add' AND status IN ('sent','unknown') AND EXISTS(
      SELECT 1 FROM actions a
      WHERE a.id=outbox.task_id AND a.owner_id=outbox.owner_id
        AND ((a.state='queued' AND a.created_at<=?) OR (a.state='running' AND COALESCE(a.started_at,a.created_at)<=?)))`)
    .bind(now, now, staleBefore, staleBefore).run();
  await env.DB.prepare(`UPDATE outbox SET status='pending',available_at=?,updated_at=?,dispatch_token=NULL
    WHERE task_type='add' AND status='sending' AND updated_at<=? AND ${eligibleAction}`)
    .bind(now, now, staleBefore, staleBefore).run();

  const rows = await env.DB.prepare(`SELECT id,task_id AS taskId,version,attempts FROM outbox
    WHERE task_type='add' AND available_at<=? AND
      (status IN ('pending','failed') OR (status='sending' AND updated_at<=?)) AND ${eligibleAction}
    ORDER BY available_at,created_at LIMIT ?`).bind(now, staleBefore, staleBefore, boundedLimit)
    .all<{ id: string; taskId: string; version: number; attempts: number }>();
  let sent = 0;
  for (const row of rows.results ?? []) {
    const token = crypto.randomUUID();
    const claim = await env.DB.prepare(`UPDATE outbox SET status='sending',attempts=attempts+1,updated_at=?,dispatch_token=?
      WHERE id=? AND task_type='add' AND available_at<=? AND
        (status IN ('pending','failed') OR (status='sending' AND updated_at<=?)) AND ${eligibleAction}`)
      .bind(now, token, row.id, now, staleBefore, staleBefore).run();
    if (claim.meta.changes !== 1) continue;
    try {
      await env.ADD_QUEUE.send({ kind: 'add', taskId: row.taskId, version: row.version });
      await env.DB.prepare(`UPDATE outbox SET status='sent',updated_at=?,dispatch_token=NULL
        WHERE id=? AND task_type='add' AND status='sending' AND dispatch_token=?`)
        .bind(now, row.id, token).run();
      sent += 1;
    } catch {
      const attempts = row.attempts + 1;
      await env.DB.prepare(`UPDATE outbox SET status='failed',available_at=?,updated_at=?,dispatch_token=NULL
        WHERE id=? AND task_type='add' AND status='sending' AND dispatch_token=?`)
        .bind(now + Math.min(60 * 60_000, 1000 * 2 ** Math.min(attempts, 10)), now, row.id, token).run();
    }
  }
  return sent;
}
