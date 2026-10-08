import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { bootstrapAdmin } from '../db';
import { handleAuth, type AuthEnv } from '../auth';
import { handleImports } from './imports';
import { processImportTask } from '../imports/processor';
import { dispatchImportOutbox } from '../imports/outbox';
import { handleRequest } from '../index';

const db = env.DB;
const testEnv: AuthEnv = {
  DB: db, APP_ORIGIN: 'https://picnic.test', APP_ENV: 'test',
  AUTH_SECRET: 'test-auth-secret-of-at-least-thirty-two-bytes',
  OTP_HMAC_SECRET: 'test-otp-secret-of-at-least-thirty-two-bytes',
  EMAIL_ADDRESS_HMAC_SECRET: 'test-address-secret-of-at-least-thirty-two-bytes',
};
const emails: { to: string; subject: string; text: string }[] = [];
const mail = { sendEmail: async (message: typeof emails[number]) => { emails.push(message); } };
let firstEmail = '';
let secondEmail = '';
let firstCookie = '';
let secondCookie = '';

function request(path: string, method: string, body?: unknown, cookie?: string): Request {
  const headers: Record<string, string> = { Origin: testEnv.APP_ORIGIN, 'CF-Connecting-IP': `192.0.2.${Math.floor(Math.random() * 200) + 1}` };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Request(`${testEnv.APP_ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function signIn(email: string): Promise<string> {
  await handleAuth(request('/api/auth/email-otp/send-verification-otp', 'POST', { email, type: 'sign-in' }), testEnv, mail);
  const otp = emails.at(-1)?.text.match(/\b\d{6}\b/)?.[0];
  expect(otp).toBeTruthy();
  const response = await handleAuth(request('/api/auth/sign-in/email-otp', 'POST', { email, otp }), testEnv, mail);
  const cookie = response?.headers.get('Set-Cookie')?.split(';', 1)[0];
  expect(cookie).toBeTruthy();
  return cookie!;
}

async function createMember(adminId: string): Promise<string> {
  const email = `${crypto.randomUUID()}@example.invalid`;
  const now = Date.now(), id = crypto.randomUUID(), invitationId = crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO invitations(id,email,token_hash,status,invited_by,created_at,expires_at) VALUES(?,?,?,'pending',?,?,?)`)
      .bind(invitationId, email, crypto.randomUUID(), adminId, now, now + 86_400_000),
    db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,0,?,?)`)
      .bind(id, email, email, now, now),
    db.prepare(`INSERT INTO app_accounts(id,email,role,status,invitation_id,created_at,updated_at) VALUES(?,?,'member','invited',?,?,?)`)
      .bind(id, email, invitationId, now, now),
  ]);
  return email;
}

beforeAll(async () => {
  const migrationEnv = env as typeof env & { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] };
  if (!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_accounts'").first()) {
    await applyD1Migrations(db, migrationEnv.TEST_MIGRATIONS);
  }
  let admin = await db.prepare(`SELECT id,email FROM app_accounts WHERE role='admin' AND status='active' LIMIT 1`)
    .first<{ id: string; email: string }>();
  if (!admin) {
    const id = crypto.randomUUID(), now = Date.now(); firstEmail = `${id}@example.invalid`;
    await db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`)
      .bind(id, 'Admin', firstEmail, now, now).run();
    await bootstrapAdmin(db, id, firstEmail, now);
    admin = { id, email: firstEmail };
  } else firstEmail = admin.email;
  firstCookie = await signIn(firstEmail);
  secondEmail = await createMember(admin.id);
  secondCookie = await signIn(secondEmail);
});

describe('import routes and durable worker', () => {
  it('authenticates, stores source text with one ID-only outbox task, and isolates owners', async () => {
    expect((await handleImports(request('/api/imports', 'POST', { type: 'text', text: '1 ui, 2 tomaten' }), testEnv))?.status).toBe(401);
    const response = await handleImports(request('/api/imports', 'POST', { type: 'text', text: '1 ui, 2 tomaten' }, firstCookie), testEnv);
    expect(response?.status).toBe(202);
    const created = (await response!.json() as { import: { id: string; sourceText: string; status: string } }).import;
    expect(created).toMatchObject({ sourceText: '1 ui, 2 tomaten', status: 'queued' });
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM outbox WHERE task_type='import' AND task_id=?`)
      .bind(created.id).first()).toMatchObject({ count: 1 });
    expect(await db.prepare(`SELECT payload_json AS payload FROM outbox WHERE task_type='import' AND task_id=?`)
      .bind(created.id).first()).toMatchObject({ payload: '{}' });
    expect((await handleImports(request(`/api/imports/${created.id}`, 'GET', undefined, secondCookie), testEnv))?.status).toBe(404);
    expect(await processImportTask(testEnv, created.id, 1)).toBe('processed');
    expect(await processImportTask(testEnv, created.id, 1)).toBe('already_done');
    const loaded = await handleImports(request(`/api/imports/${created.id}`, 'GET', undefined, firstCookie), testEnv);
    expect((await loaded!.json() as { import: { status: string; sourceText: string; candidates: unknown[]; uncertainties: string[] } }).import)
      .toMatchObject({ status: 'needs_review', sourceText: '1 ui, 2 tomaten', candidates: [], uncertainties: ['recognition_pending', 'source_text_not_parsed'] });
  });

  it('accepts the full Unicode text limit through the composed HTTP handler and returns private GET responses', async () => {
    const text = 'é'.repeat(40_000);
    const response = await handleRequest(request('/api/imports', 'POST', { type: 'text', text }, firstCookie), testEnv);
    expect(response.status).toBe(202);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    const id = (await response.json() as { import: { id: string; sourceText: string } }).import.id;
    const loaded = await handleRequest(request(`/api/imports/${id}`, 'GET', undefined, firstCookie), testEnv);
    expect(loaded.status).toBe(200);
    expect(loaded.headers.get('Cache-Control')).toContain('no-store');
    expect((await loaded.json() as { import: { sourceText: string } }).import.sourceText).toBe(text);
    expect(await processImportTask(testEnv, id, 1)).toBe('processed');
    expect((await handleRequest(request(`/api/imports/${id}`, 'GET', undefined, secondCookie), testEnv)).status).toBe(404);
  });

  it('rejects unsupported uploads and unsafe URLs, and fences account/session races', async () => {
    expect((await handleImports(request('/api/imports', 'POST', { type: 'upload', uploadIds: ['x'] }, firstCookie), testEnv))?.status).toBe(400);
    for (const url of ['http://culy.nl/x', 'https://user@culy.nl/x', 'https://culy.nl:444/x', 'https://127.0.0.1/x', 'https://evil.test/x']) {
      expect((await handleImports(request('/api/imports', 'POST', { type: 'url', url }, firstCookie), testEnv))?.status).toBe(400);
    }
    const account = await db.prepare(`SELECT id FROM app_accounts WHERE email=?`).bind(secondEmail).first<{ id: string }>();
    const denied = await handleImports(request('/api/imports', 'POST', { type: 'text', text: 'Race' }, secondCookie), testEnv, {
      beforeWrite: async () => { await db.prepare(`UPDATE app_accounts SET status='blocked',updated_at=? WHERE id=?`).bind(Date.now(), account!.id).run(); },
    });
    expect(denied?.status).toBe(403);
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM imports WHERE owner_id=?`).bind(account!.id).first()).toMatchObject({ count: 0 });
    const queued = await handleImports(request('/api/imports', 'POST', { type: 'text', text: 'After unblock' }, secondCookie), testEnv);
    expect(queued?.status).toBe(401);
    await db.prepare(`UPDATE app_accounts SET status='active',updated_at=? WHERE id=?`).bind(Date.now(), account!.id).run();
  });

  it('revalidates redirects, applies byte/time bounds, and dispatches only task IDs', async () => {
    const create = await handleImports(request('/api/imports', 'POST', { type: 'url', url: 'https://culy.nl/recept' }, firstCookie), testEnv);
    const id = (await create!.json() as { import: { id: string } }).import.id;
    let called = 0;
    expect(await processImportTask(testEnv, id, 1, { fetch: async () => {
      called++;
      return new Response(null, { status: 302, headers: { Location: 'https://evil.test/redirect' } });
    } })).toBe('processed');
    expect(called).toBe(1);
    expect(await db.prepare(`SELECT error_code AS errorCode FROM imports WHERE id=?`).bind(id).first()).toMatchObject({ errorCode: 'IMPORT_REDIRECT_REJECTED' });

    const size = await handleImports(request('/api/imports', 'POST', { type: 'url', url: 'https://mob.co.uk/recept' }, firstCookie), testEnv);
    const sizeId = (await size!.json() as { import: { id: string } }).import.id;
    let cancelled = false;
    const large = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array(2 * 1024 * 1024));
    }, pull(controller) { controller.enqueue(new Uint8Array(1)); }, cancel() { cancelled = true; } });
    await processImportTask(testEnv, sizeId, 1, { fetch: async () => new Response(large, { headers: { 'Content-Type': 'text/html' } }) });
    expect(await db.prepare(`SELECT error_code AS errorCode FROM imports WHERE id=?`).bind(sizeId).first()).toMatchObject({ errorCode: 'IMPORT_TOO_LARGE' });
    expect(cancelled).toBe(true);

    const timeout = await handleImports(request('/api/imports', 'POST', { type: 'url', url: 'https://culy.nl/hanging' }, firstCookie), testEnv);
    const timeoutId = (await timeout!.json() as { import: { id: string } }).import.id;
    vi.useFakeTimers();
    try {
      const task = processImportTask(testEnv, timeoutId, 1, { fetch: async (_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }) });
      await vi.advanceTimersByTimeAsync(10_001);
      await task;
      expect(await db.prepare(`SELECT error_code AS errorCode FROM imports WHERE id=?`).bind(timeoutId).first())
        .toMatchObject({ errorCode: 'IMPORT_TIMEOUT' });
    } finally { vi.useRealTimers(); }

    const blockedAccount = await db.prepare(`SELECT id FROM app_accounts WHERE email=?`).bind(firstEmail).first<{ id: string }>();
    await db.prepare(`UPDATE app_accounts SET status='blocked' WHERE id=?`).bind(blockedAccount!.id).run();
    expect(await processImportTask(testEnv, sizeId, 1)).toBe('blocked');
    await db.prepare(`UPDATE app_accounts SET status='active' WHERE id=?`).bind(blockedAccount!.id).run();

    const queueBodies: unknown[] = [];
    const queueStub = { send: async (body: { kind: 'import'; taskId: string; version: number }) => {
      queueBodies.push(body); return { metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } } };
    } } as unknown as Queue<{ kind: 'import'; taskId: string; version: number }>;
    const pending = await handleImports(request('/api/imports', 'POST', { type: 'text', text: 'dispatch me' }, firstCookie), testEnv);
    const pendingId = (await pending!.json() as {import:{id:string}}).import.id;
    const dispatched = await dispatchImportOutbox({ DB: db, IMPORT_QUEUE: queueStub }, Date.now() + 1000);
    expect(dispatched).toBeGreaterThan(0);
    expect(queueBodies.every(body => JSON.stringify(body).includes('taskId') && !JSON.stringify(body).includes('tomaten'))).toBe(true);
    const bodyCount = queueBodies.length;
    expect(await dispatchImportOutbox({ DB: db, IMPORT_QUEUE: queueStub }, Date.now() + 1000)).toBe(0);
    expect(queueBodies).toHaveLength(bodyCount);
    expect(queueBodies).toContainEqual({ kind: 'import', taskId: pendingId, version: 1 });
    expect(await processImportTask(testEnv, pendingId, 1)).toBe('processed');

    const member = await db.prepare(`SELECT id FROM app_accounts WHERE email=?`).bind(secondEmail).first<{id:string}>();
    const createdAt = Date.now();
    const recover = await handleImports(request('/api/imports', 'POST', { type: 'text', text: 'recover me' }, secondCookie), testEnv, { now: () => createdAt });
    const recoverId = (await recover!.json() as {import:{id:string}}).import.id;
    const beforeRecover = queueBodies.length;
    await dispatchImportOutbox({ DB: db, IMPORT_QUEUE: queueStub }, createdAt);
    await db.prepare(`UPDATE app_accounts SET status='blocked' WHERE id=?`).bind(member!.id).run();
    await dispatchImportOutbox({ DB: db, IMPORT_QUEUE: queueStub }, createdAt + 30_000);
    expect(queueBodies).toHaveLength(beforeRecover + 1);
    await db.prepare(`UPDATE app_accounts SET status='active' WHERE id=?`).bind(member!.id).run();
    await dispatchImportOutbox({ DB: db, IMPORT_QUEUE: queueStub }, createdAt + 70_000);
    expect(queueBodies).toHaveLength(beforeRecover + 2);
    expect(await db.prepare(`SELECT status FROM outbox WHERE task_type='import' AND task_id=?`).bind(recoverId).first())
      .toMatchObject({ status: 'sent' });
    expect(await processImportTask(testEnv, recoverId, 1)).toBe('processed');

    const orphanId = crypto.randomUUID(), orphanCreated = createdAt - 120_000;
    await db.prepare(`INSERT INTO imports(id,owner_id,source_kind,source_text,status,expires_at,created_at,updated_at)
      VALUES(?,?,'text','orphan source','queued',?,?,?)`).bind(orphanId, member!.id,
        orphanCreated + 7 * 24 * 60 * 60 * 1000, orphanCreated, orphanCreated).run();
    const beforeOrphan = queueBodies.length;
    await dispatchImportOutbox({ DB: db, IMPORT_QUEUE: queueStub }, createdAt + 70_000);
    expect(queueBodies).toHaveLength(beforeOrphan + 1);
    expect(queueBodies.at(-1)).toEqual({ kind: 'import', taskId: orphanId, version: 1 });
    expect(await db.prepare(`SELECT payload_json AS payload FROM outbox WHERE task_id=?`).bind(orphanId).first())
      .toMatchObject({ payload: '{}' });
    expect(await processImportTask(testEnv, orphanId, 1)).toBe('processed');

    const slow = await handleImports(request('/api/imports', 'POST', { type: 'text', text: 'dispatch lease' }, firstCookie), testEnv);
    const slowId = (await slow!.json() as {import:{id:string}}).import.id;
    const dispatchAt = Date.now() + 90_000;
    let finishFirstSend!: () => void;
    let firstSendStarted!: () => void;
    const sendStarted = new Promise<void>(resolve => { firstSendStarted = resolve; });
    const delayedSend = new Promise<void>(resolve => { finishFirstSend = resolve; });
    let sendCalls = 0;
    const concurrentQueue = { send: async (_body: {kind:'import';taskId:string;version:number}) => {
      sendCalls++;
      if (sendCalls === 1) { firstSendStarted(); await delayedSend; }
      return { metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } } };
    } } as unknown as Queue<{ kind: 'import'; taskId: string; version: number }>;
    const staleDispatch = dispatchImportOutbox({ DB: db, IMPORT_QUEUE: concurrentQueue }, dispatchAt);
    await sendStarted;
    expect(await dispatchImportOutbox({ DB: db, IMPORT_QUEUE: concurrentQueue }, dispatchAt + 61_000)).toBe(1);
    finishFirstSend();
    await staleDispatch;
    expect(sendCalls).toBe(2);
    expect(await db.prepare(`SELECT status,dispatch_token AS dispatchToken FROM outbox WHERE task_id=?`).bind(slowId).first())
      .toMatchObject({ status: 'sent', dispatchToken: null });
  }, 15_000);

  it('fences a late result after a second worker takes an expired URL lease', async () => {
    const created = await handleImports(request('/api/imports', 'POST', { type: 'url', url: 'https://culy.nl/lease' }, firstCookie), testEnv);
    const id = (await created!.json() as { import: { id: string } }).import.id;
    let releaseFirst!: (response: Response) => void;
    let markStarted!: () => void;
    const firstResponse = new Promise<Response>(resolve => { releaseFirst = resolve; });
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    const late = processImportTask(testEnv, id, 1, { fetch: async () => { markStarted(); return firstResponse; } });
    await started;
    await db.prepare(`UPDATE imports SET work_expires_at=0 WHERE id=?`).bind(id).run();
    const htmlFor = (name: string) => new Response(`<script type="application/ld+json">${JSON.stringify({
      '@type': 'Recipe', name, recipeIngredient: [`1 ${name}`],
    })}</script>`, { headers: { 'Content-Type': 'text/html' } });
    expect(await processImportTask(testEnv, id, 1, { fetch: async () => htmlFor('Winner B') })).toBe('processed');
    releaseFirst(htmlFor('Late Winner A'));
    expect(await late).toBe('busy');
    const stored = await db.prepare(`SELECT result_json AS result FROM imports WHERE id=?`).bind(id).first<{result:string}>();
    expect(JSON.parse(stored!.result)[0].title).toBe('Winner B');
  });
});
