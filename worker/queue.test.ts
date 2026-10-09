import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { handleQueue } from './queue';

const ownerId = 'queue-composition-admin';
const db = env.DB;

beforeAll(async () => {
  await applyD1Migrations(db, env.TEST_MIGRATIONS);
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`)
    .bind(ownerId, 'Queue fixture', 'queue@example.invalid', now, now).run();
  await db.prepare(`INSERT INTO app_accounts(id,email,role,status,created_at,updated_at)
    VALUES(?,?,'admin','active',?,?)`).bind(ownerId, 'queue@example.invalid', Date.now(), Date.now()).run();
});

function delivery(body: unknown, queue = 'picnic-imports-test') {
  const message: Message<unknown> = {
    id: crypto.randomUUID(), timestamp: new Date(), body, attempts: 1, ack: vi.fn(), retry: vi.fn(),
  };
  const batch: MessageBatch<unknown> = { queue, messages: [message], ackAll: vi.fn(), retryAll: vi.fn(),
    metadata: { metrics: { backlogCount: 1, backlogBytes: 0 } } };
  return { message, batch };
}

async function importFixture(status = 'queued', lease: number | null = null): Promise<string> {
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO imports(id,owner_id,source_kind,source_text,status,work_token,work_expires_at,created_at,updated_at)
    VALUES(?,?,'text','1 ui en 2 tomaten',?,?,?,?,?)`)
    .bind(id, ownerId, status, lease ? 'existing-worker' : null, lease, Date.now(), Date.now()).run();
  return id;
}

describe('queue composition with durable D1 imports', () => {
  it('routes addition jobs only on the addition queue and rejects unknown versions', async () => {
    const missing = delivery({ kind: 'add', taskId: 'missing-action', version: 1 }, 'picnic-additions-test');
    await handleQueue(missing.batch, env);
    expect(missing.message.ack).toHaveBeenCalledOnce();
    const unsupported = delivery({ kind: 'add', taskId: 'missing-action', version: 2 }, 'picnic-additions-test');
    await handleQueue(unsupported.batch, env);
    expect(unsupported.message.retry).toHaveBeenCalledOnce();
  });
  it('routes AI attempts only on the dedicated AI queue', async () => {
    const valid = delivery({ kind: 'ai_attempt', taskId: 'missing-attempt', version: 1 }, 'picnic-ai-test');
    await handleQueue(valid.batch, env);
    expect(valid.message.ack).toHaveBeenCalledOnce();
    const wrongQueue = delivery({ kind: 'ai_attempt', taskId: 'missing-attempt', version: 1 }, 'picnic-imports-test');
    await handleQueue(wrongQueue.batch, env);
    expect(wrongQueue.message.retry).toHaveBeenCalledOnce();
  });
  it('acknowledges only after the result is saved and handles a duplicate without changing it', async () => {
    const id = await importFixture();
    const first = delivery({ kind: 'import', taskId: id, version: 1 });
    await handleQueue(first.batch, env);
    const saved = await db.prepare('SELECT status,updated_at,result_json FROM imports WHERE id=?').bind(id).first();
    expect(saved).toMatchObject({ status: 'needs_review' });
    expect(first.message.ack).toHaveBeenCalledOnce();
    expect(first.message.retry).not.toHaveBeenCalled();
    const duplicate = delivery({ kind: 'import', taskId: id, version: 1 });
    await handleQueue(duplicate.batch, env);
    expect(duplicate.message.ack).toHaveBeenCalledOnce();
    expect(await db.prepare('SELECT status,updated_at,result_json FROM imports WHERE id=?').bind(id).first()).toEqual(saved);
  });

  it('retries a live lease and resumes it after expiry', async () => {
    const id = await importFixture('running', Date.now() + 60_000);
    const busy = delivery({ kind: 'import', taskId: id, version: 1 });
    await handleQueue(busy.batch, env);
    expect(busy.message.ack).not.toHaveBeenCalled();
    expect(busy.message.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
    await db.prepare('UPDATE imports SET work_expires_at=? WHERE id=?').bind(Date.now() - 1, id).run();
    const resumed = delivery({ kind: 'import', taskId: id, version: 1 });
    await handleQueue(resumed.batch, env);
    expect(resumed.message.ack).toHaveBeenCalledOnce();
    expect(await db.prepare('SELECT status FROM imports WHERE id=?').bind(id).first('status')).toBe('needs_review');
  });

  it('does not silently acknowledge unsupported versions, malformed messages or work on another queue', async () => {
    for (const entry of [delivery(null), delivery({ kind: 'add', taskId: 'x', version: 1 }),
      delivery({ kind: 'import', taskId: 'x', version: 2 }),
      delivery({ kind: 'import', taskId: 'x', version: 1 }, 'picnic-additions-test')]) {
      await handleQueue(entry.batch, env);
      expect(entry.message.ack).not.toHaveBeenCalled();
      expect(entry.message.retry).toHaveBeenCalledOnce();
    }
  });
});
