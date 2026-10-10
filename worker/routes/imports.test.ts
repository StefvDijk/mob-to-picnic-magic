import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { bootstrapAdmin } from '../db';
import { handleAuth, type AuthEnv } from '../auth';
import { handleImports } from './imports';
import { normalizeRuntimeDnsAnswers, processImportTask, type ImportDnsResolver } from '../imports/processor';
import { dispatchImportOutbox } from '../imports/outbox';
import { createAiAttempt, processAiAttempt, type AiEnv, type AiProvider } from '../imports/ai';
import { handleRequest } from '../index';

const db = env.DB;
const publicDns: ImportDnsResolver = {
  resolve4: async () => ['93.184.216.34'],
  resolve6: async () => ['2606:4700:4700::1111'],
};
const fetchWithPublicDns = (fetcher: typeof fetch, resolveDns: ImportDnsResolver = publicDns) => ({ fetch: fetcher, resolveDns });
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
  it('authenticates URL imports, stores one ID-only outbox task, and isolates owners', async () => {
    expect((await handleImports(request('/api/imports', 'POST', { type: 'text', text: '1 ui, 2 tomaten' }), testEnv))?.status).toBe(401);
    const response = await handleImports(request('/api/imports', 'POST', { type: 'url', url: 'https://culy.nl/recept' }, firstCookie), testEnv);
    expect(response?.status).toBe(202);
    const created = (await response!.json() as { import: { id: string; sourceText: string | null; sourceUrl: string; status: string } }).import;
    expect(created).toMatchObject({ sourceUrl: 'https://culy.nl/recept', sourceText: null, status: 'queued' });
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM outbox WHERE task_type='import' AND task_id=?`)
      .bind(created.id).first()).toMatchObject({ count: 1 });
    expect(await db.prepare(`SELECT payload_json AS payload FROM outbox WHERE task_type='import' AND task_id=?`)
      .bind(created.id).first()).toMatchObject({ payload: '{}' });
    expect((await handleImports(request(`/api/imports/${created.id}`, 'GET', undefined, secondCookie), testEnv))?.status).toBe(404);
    const page = new Response(`<script type="application/ld+json">${JSON.stringify({ '@type':'Recipe',name:'Tomato soup',recipeIngredient:['2 tomatoes'],recipeInstructions:['Cook the tomatoes.'] })}</script>`, { headers: { 'Content-Type':'text/html' } });
    expect(await processImportTask(testEnv, created.id, 1, fetchWithPublicDns(async () => page.clone()))).toBe('processed');
    expect(await processImportTask(testEnv, created.id, 1)).toBe('already_done');
    const loaded = await handleImports(request(`/api/imports/${created.id}`, 'GET', undefined, firstCookie), testEnv);
    expect((await loaded!.json() as { import: { status: string; sourceUrl: string; candidates: unknown[] } }).import)
      .toMatchObject({ status: 'needs_review', sourceUrl: 'https://culy.nl/recept', candidates: [{ title: 'Tomato soup' }] });
  });

  it('imports structured recipes from a public publisher domain outside the former list', async () => {
    const url = 'https://www.familiekookt.nl/recepten/tomatensoep';
    const finalUrl = 'https://recipes.another-kitchen.com/tomato-soup';
    const response = await handleImports(request('/api/imports', 'POST', { type: 'url', url }, firstCookie), testEnv);
    expect(response?.status).toBe(202);
    const id = (await response!.json() as { import: { id: string } }).import.id;
    const recipe = { '@type': 'Recipe', name: 'Tomato soup', recipeIngredient: ['2 tomatoes'], recipeInstructions: ['Simmer.'] };
    const requested: string[] = [];
    expect(await processImportTask(testEnv, id, 1, fetchWithPublicDns(async input => {
      requested.push(String(input));
      return requested.length === 1
        ? new Response(null, { status: 302, headers: { Location: finalUrl } })
        : new Response(`<script type="application/ld+json">${JSON.stringify(recipe)}</script>`, { headers: { 'Content-Type': 'text/html' } });
    }))).toBe('processed');
    expect(requested).toEqual([url, finalUrl]);
    const imported = await handleImports(request(`/api/imports/${id}`, 'GET', undefined, firstCookie), testEnv);
    expect((await imported!.json() as { import: { candidates: Array<{ title: string; sourceUrl: string }> } }).import.candidates[0])
      .toMatchObject({ title: 'Tomato soup', sourceUrl: finalUrl });
  });

  it('automatically normalizes a URL recipe with a metered structured recognition attempt', async () => {
    const now = Date.now();
    const importId = crypto.randomUUID();
    const source = 'Pasta\nServings: 2\n250 g flour\nMix the flour.';
    await db.prepare(`INSERT INTO imports(id,owner_id,source_kind,source_url,status,result_json,uncertainties_json,expires_at,created_at,updated_at)
      VALUES(?,?,'url','https://culy.nl/pasta','needs_review','[]','[]',?,?,?)`)
      .bind(importId, (await db.prepare(`SELECT id FROM app_accounts WHERE email=?`).bind(firstEmail).first<{id:string}>())!.id,
        now + 7 * 24 * 60 * 60 * 1000, now, now).run();
    const aiEnv: AiEnv = { ...testEnv, OPENAI_API_KEY: 'test-key', AI_PRICE_ATTESTATION: 'gpt-6-luna-standard-2026-10-08+model-prices-verified',
      AI_PRICE_VALID_UNTIL: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(), AI_EUR_PER_USD_BPS: '25000' };
    await createAiAttempt(aiEnv, importId, now, source);
    const attempt = await db.prepare(`SELECT id FROM ai_attempts WHERE import_id=?`).bind(importId).first<{id:string}>();
    expect(attempt).toBeTruthy();
    const extracted = { title: 'Pasta', baseServings: '2', sections: [], ingredients: [{ section: null, originalText: '250 g flour',
      normalizedName: 'flour', quantity: { kind: 'exact', amount: '250', unit: 'g', basis: null },
      attributes: { form: null, variant: null, brand: null }, uncertainty: [], sourceQuote: '250 g flour' }], steps: ['Mix the flour.'], uncertainty: [] };
    const provider: AiProvider = { count: async () => 100, send: async () => ({ status: 200, requestId: 'test', body: {
      status: 'completed', usage: { input_tokens: 100, output_tokens: 100 },
      output: [{ content: [{ type: 'output_text', text: JSON.stringify(extracted) }] }],
    } }) };
    expect(await processAiAttempt(aiEnv, attempt!.id, 1, { provider, now: () => now + 1000 })).toBe('processed');
    const result = await db.prepare(`SELECT status,result_json AS result FROM imports WHERE id=?`).bind(importId).first<{status:string;result:string}>();
    expect(result?.status).toBe('needs_review');
    expect(JSON.parse(result!.result)[0].ingredients[0]).toMatchObject({ originalText: '250 g flour', normalizedName: 'flour', sourceOrigin: 'ai' });
    expect(await db.prepare(`SELECT state FROM ai_attempts WHERE id=?`).bind(attempt!.id).first('state')).toBe('succeeded');
  });

  it('sends attached private photo bytes as vision input and accepts visually quoted lines', async () => {
    const now = Date.now();
    const ownerId = (await db.prepare(`SELECT id FROM app_accounts WHERE email=?`).bind(firstEmail).first<{id:string}>())!.id;
    const importId = crypto.randomUUID(), uploadId = crypto.randomUUID();
    await db.prepare(`INSERT OR IGNORE INTO user_upload_usage(owner_id) VALUES(?)`).bind(ownerId).run();
    await db.prepare(`INSERT INTO imports(id,owner_id,source_kind,status,result_json,uncertainties_json,expires_at,created_at,updated_at)
      VALUES(?,?,'upload','needs_review','[]','[]',?,?,?)`)
      .bind(importId, ownerId, now + 7 * 24 * 60 * 60 * 1000, now, now).run();
    await db.prepare(`INSERT INTO uploads(id,owner_id,object_key,media_type,byte_size,status,created_at) VALUES(?,?,?,'image/png',8,'reserved',?)`)
      .bind(uploadId, ownerId, `private/accounts/${ownerId}/uploads/${uploadId}`, now).run();
    await db.prepare(`UPDATE uploads SET status='stored' WHERE id=? AND owner_id=?`).bind(uploadId, ownerId).run();
    await db.prepare(`INSERT INTO import_uploads(owner_id,import_id,upload_id) VALUES(?,?,?)`).bind(ownerId, importId, uploadId).run();
    const imageBytes = new Uint8Array([137,80,78,71,13,10,26,10]);
    const aiEnv: AiEnv = { ...testEnv, UPLOADS: { get: async () => ({ arrayBuffer: async () => imageBytes.buffer }) } as unknown as R2Bucket,
      OPENAI_API_KEY: 'test-key', AI_PRICE_ATTESTATION: 'gpt-6-luna-standard-2026-10-08+model-prices-verified',
      AI_PRICE_VALID_UNTIL: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(), AI_EUR_PER_USD_BPS: '25000' };
    await createAiAttempt(aiEnv, importId, now);
    const attempt = await db.prepare(`SELECT id FROM ai_attempts WHERE import_id=?`).bind(importId).first<{id:string}>();
    const extracted = { title: 'Tomato salad', baseServings: null, sections: [], ingredients: [{ section: null, originalText: '2 tomatoes',
      normalizedName: 'tomato', quantity: { kind: 'exact', amount: '2', unit: 'piece', basis: null },
      attributes: { form: null, variant: null, brand: null }, uncertainty: [], sourceQuote: '2 tomatoes' }], steps: [], uncertainty: [] };
    let sawImage = false;
    const provider: AiProvider = { count: async body => {
      const content = (body.input as Array<{content:Array<{type:string}>}>)[0].content;
      sawImage ||= content.some(item => item.type === 'input_image'); return 100;
    }, send: async body => {
      const content = (body.input as Array<{content:Array<{type:string}>}>)[0].content;
      sawImage ||= content.some(item => item.type === 'input_image');
      return { status: 200, requestId: 'test-photo', body: { status: 'completed', usage: { input_tokens: 100, output_tokens: 100 },
        output: [{ content: [{ type: 'output_text', text: JSON.stringify(extracted) }] }] } };
    } };
    expect(await processAiAttempt(aiEnv, attempt!.id, 1, { provider, now: () => now + 1000 })).toBe('processed');
    expect(sawImage).toBe(true);
    const result = await db.prepare(`SELECT result_json AS result FROM imports WHERE id=?`).bind(importId).first<{result:string}>();
    expect(JSON.parse(result!.result)[0].ingredients[0]).toMatchObject({ originalText: '2 tomatoes', sourceOrigin: 'ai' });
  });

  it('rejects manual text imports through the composed HTTP handler', async () => {
    const text = '1 ui, 2 tomaten';
    const response = await handleRequest(request('/api/imports', 'POST', { type: 'text', text }, firstCookie), testEnv);
    expect(response.status).toBe(400);
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM imports WHERE source_text=?`).bind(text).first()).toMatchObject({ count: 0 });
  });

  it('rejects unsupported uploads and unsafe URLs, and fences account/session races', async () => {
    expect((await handleImports(request('/api/imports', 'POST', { type: 'upload', uploadIds: ['x'] }, firstCookie), testEnv))?.status).toBe(400);
    for (const url of ['http://culy.nl/x', 'https://user@culy.nl/x', 'https://culy.nl:444/x', 'https://127.0.0.1/x', 'https://localhost/x', 'https://metadata.google.internal/x']) {
      expect((await handleImports(request('/api/imports', 'POST', { type: 'url', url }, firstCookie), testEnv))?.status).toBe(400);
    }
    const account = await db.prepare(`SELECT id FROM app_accounts WHERE email=?`).bind(secondEmail).first<{ id: string }>();
    const denied = await handleImports(request('/api/imports', 'POST', { type: 'url', url: 'https://culy.nl/race' }, secondCookie), testEnv, {
      beforeWrite: async () => { await db.prepare(`UPDATE app_accounts SET status='blocked',updated_at=? WHERE id=?`).bind(Date.now(), account!.id).run(); },
    });
    expect(denied?.status).toBe(403);
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM imports WHERE owner_id=?`).bind(account!.id).first()).toMatchObject({ count: 0 });
    const queued = await handleImports(request('/api/imports', 'POST', { type: 'url', url: 'https://culy.nl/after' }, secondCookie), testEnv);
    expect(queued?.status).toBe(401);
    await db.prepare(`UPDATE app_accounts SET status='active',updated_at=? WHERE id=?`).bind(Date.now(), account!.id).run();
  });

  it('rejects DNS answers containing private addresses before fetching', async () => {
    const created = await handleImports(request('/api/imports', 'POST', { type: 'url', url: 'https://recipe-publisher.nl/soup' }, firstCookie), testEnv);
    const id = (await created!.json() as { import: { id: string } }).import.id;
    let fetchCalls = 0;
    await processImportTask(testEnv, id, 1, {
      resolveDns: {
        resolve4: async () => normalizeRuntimeDnsAnswers(['recipe-publisher.edgekey.net.', '93.184.216.34', '10.0.0.7'], 4),
        resolve6: async () => ['2606:4700:4700::1111'],
      },
      fetch: async () => { fetchCalls++; return new Response('<p>ignored</p>', { headers: { 'Content-Type': 'text/html' } }); },
    });
    expect(fetchCalls).toBe(0);
    expect(await db.prepare(`SELECT error_code AS errorCode FROM imports WHERE id=?`).bind(id).first())
      .toMatchObject({ errorCode: 'IMPORT_URL_REJECTED' });
  });

  it('fails closed when DNS returns only CNAME targets without public address records', async () => {
    const created = await handleImports(request('/api/imports', 'POST', { type: 'url', url: 'https://recipe-publisher.nl/soup' }, firstCookie), testEnv);
    const id = (await created!.json() as { import: { id: string } }).import.id;
    let fetchCalls = 0;
    await processImportTask(testEnv, id, 1, {
      resolveDns: {
        resolve4: async () => normalizeRuntimeDnsAnswers(['recipes.edgekey.net.'], 4),
        resolve6: async () => normalizeRuntimeDnsAnswers(['recipes.edgekey.net.'], 6),
      },
      fetch: async () => { fetchCalls++; return new Response('<p>ignored</p>', { headers: { 'Content-Type': 'text/html' } }); },
    });
    expect(fetchCalls).toBe(0);
    expect(await db.prepare(`SELECT error_code AS errorCode FROM imports WHERE id=?`).bind(id).first())
      .toMatchObject({ errorCode: 'IMPORT_FETCH_FAILED' });
  });

  it('rejects DNS answers containing IPv6 documentation addresses', async () => {
    const created = await handleImports(request('/api/imports', 'POST', { type: 'url', url: 'https://recipe-publisher.nl/pie' }, firstCookie), testEnv);
    const id = (await created!.json() as { import: { id: string } }).import.id;
    let fetchCalls = 0;
    await processImportTask(testEnv, id, 1, {
      resolveDns: { resolve4: async () => ['93.184.216.34'], resolve6: async () => ['2001:db8::1'] },
      fetch: async () => { fetchCalls++; return new Response('<p>ignored</p>', { headers: { 'Content-Type': 'text/html' } }); },
    });
    expect(fetchCalls).toBe(0);
    expect(await db.prepare(`SELECT error_code AS errorCode FROM imports WHERE id=?`).bind(id).first())
      .toMatchObject({ errorCode: 'IMPORT_URL_REJECTED' });
  });

  it('normalizes the captured AH CNAME chain while preserving address records', async () => {
    const url = 'https://www.ah.nl/allerhande/recept/R-R1302919/pompoentraybake-met-whipped-gorgonzola';
    const capturedA = ['www.ah.nl-v1.edgekey.net.', 'e132375.a.akamaiedge.net.', '2.16.6.207', '2.16.6.197'];
    const capturedAaaa = ['www.ah.nl-v1.edgekey.net.', 'e132375.a.akamaiedge.net.'];
    expect(normalizeRuntimeDnsAnswers(capturedA, 4)).toEqual(['2.16.6.207', '2.16.6.197']);
    expect(normalizeRuntimeDnsAnswers(capturedAaaa, 6)).toEqual([]);
    expect(normalizeRuntimeDnsAnswers([...capturedA, '10.0.0.7'], 4)).toContain('10.0.0.7');
    expect(() => normalizeRuntimeDnsAnswers(['internal.example.invalid.'], 4)).toThrow('IMPORT_DNS_INVALID');
    for (const malformed of ['foo.com/path.', 'foo.com?query.', 'foo..com.', '-foo.com.', 'foo-.com.', `${'a'.repeat(64)}.com.`]) {
      expect(() => normalizeRuntimeDnsAnswers([malformed], 4)).toThrow('IMPORT_DNS_INVALID');
    }
    for (const malformed of ['+1.2.3.4', '1e2.2.3.4', ' 1.2.3.4', '256.2.3.4']) {
      expect(() => normalizeRuntimeDnsAnswers([malformed], 4)).toThrow('IMPORT_DNS_INVALID');
    }
    for (const malformed of ['2606:4700::1111]/path?x=', '2606:4700::1111?x', '2606:4700::1111%eth0', '2606:4700::1111 ']) {
      expect(() => normalizeRuntimeDnsAnswers([malformed], 6)).toThrow('IMPORT_DNS_INVALID');
    }
    expect(() => normalizeRuntimeDnsAnswers(['not-an-address'], 4)).toThrow('IMPORT_DNS_INVALID');
    const created = await handleImports(request('/api/imports', 'POST', { type: 'url', url }, firstCookie), testEnv);
    const id = (await created!.json() as { import: { id: string } }).import.id;
    const ahDnsAnswer: ImportDnsResolver = {
      resolve4: async () => normalizeRuntimeDnsAnswers(capturedA, 4),
      resolve6: async () => normalizeRuntimeDnsAnswers(capturedAaaa, 6),
    };
    const recipe = { '@type': 'Recipe', name: 'Pompoentraybake', recipeIngredient: ['1 pompoen'], recipeInstructions: ['Roast.'] };
    await processImportTask(testEnv, id, 1, fetchWithPublicDns(async () => new Response(
      `<script type="application/ld+json">${JSON.stringify(recipe)}</script>`,
      { headers: { 'Content-Type': 'text/html' } },
    ), ahDnsAnswer));
    const row = await db.prepare(`SELECT status,error_code AS errorCode FROM imports WHERE id=?`).bind(id).first<{status:string;errorCode:string|null}>();
    expect(row).toMatchObject({ status: 'needs_review', errorCode: null });
  });

  it('revalidates redirects, applies byte/time bounds, and dispatches only task IDs', async () => {
    const create = await handleImports(request('/api/imports', 'POST', { type: 'url', url: 'https://culy.nl/recept' }, firstCookie), testEnv);
    const id = (await create!.json() as { import: { id: string } }).import.id;
    let called = 0;
    const privateRedirectHost = 'menu.private-recipe.com';
    const redirectResolver: ImportDnsResolver = {
      resolve4: async host => host === privateRedirectHost ? ['93.184.216.34', '192.168.1.20'] : ['93.184.216.34'],
      resolve6: async () => ['2606:4700:4700::1111'],
    };
    expect(await processImportTask(testEnv, id, 1, fetchWithPublicDns(async () => {
      called++;
      return new Response(null, { status: 302, headers: { Location: `https://${privateRedirectHost}/redirect` } });
    }, redirectResolver))).toBe('processed');
    expect(called).toBe(1);
    expect(await db.prepare(`SELECT error_code AS errorCode FROM imports WHERE id=?`).bind(id).first()).toMatchObject({ errorCode: 'IMPORT_REDIRECT_REJECTED' });

    const size = await handleImports(request('/api/imports', 'POST', { type: 'url', url: 'https://mob.co.uk/recept' }, firstCookie), testEnv);
    const sizeId = (await size!.json() as { import: { id: string } }).import.id;
    let cancelled = false;
    const large = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array(2 * 1024 * 1024));
    }, pull(controller) { controller.enqueue(new Uint8Array(1)); }, cancel() { cancelled = true; } });
    await processImportTask(testEnv, sizeId, 1, fetchWithPublicDns(async () => new Response(large, { headers: { 'Content-Type': 'text/html' } })));
    expect(await db.prepare(`SELECT error_code AS errorCode FROM imports WHERE id=?`).bind(sizeId).first()).toMatchObject({ errorCode: 'IMPORT_TOO_LARGE' });
    expect(cancelled).toBe(true);

    const timeout = await handleImports(request('/api/imports', 'POST', { type: 'url', url: 'https://culy.nl/hanging' }, firstCookie), testEnv);
    const timeoutId = (await timeout!.json() as { import: { id: string } }).import.id;
    vi.useFakeTimers();
    try {
      const task = processImportTask(testEnv, timeoutId, 1, fetchWithPublicDns(async (_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      })));
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
    const pending = await handleImports(request('/api/imports', 'POST', { type: 'url', url: 'https://culy.nl/dispatch' }, firstCookie), testEnv);
    const pendingId = (await pending!.json() as {import:{id:string}}).import.id;
    const dispatched = await dispatchImportOutbox({ DB: db, IMPORT_QUEUE: queueStub }, Date.now() + 1000);
    expect(dispatched).toBeGreaterThan(0);
    expect(queueBodies.every(body => JSON.stringify(body).includes('taskId') && !JSON.stringify(body).includes('tomaten'))).toBe(true);
    const bodyCount = queueBodies.length;
    expect(await dispatchImportOutbox({ DB: db, IMPORT_QUEUE: queueStub }, Date.now() + 1000)).toBe(0);
    expect(queueBodies).toHaveLength(bodyCount);
    expect(queueBodies).toContainEqual({ kind: 'import', taskId: pendingId, version: 1 });
    expect(await processImportTask(testEnv, pendingId, 1, fetchWithPublicDns(async () => new Response('<p>recipe</p>', { headers: { 'Content-Type':'text/html' } })))).toBe('processed');

    const member = await db.prepare(`SELECT id FROM app_accounts WHERE email=?`).bind(secondEmail).first<{id:string}>();
    const createdAt = Date.now();
    const recover = await handleImports(request('/api/imports', 'POST', { type: 'url', url: 'https://culy.nl/recover' }, secondCookie), testEnv, { now: () => createdAt });
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
    expect(await processImportTask(testEnv, recoverId, 1, fetchWithPublicDns(async () => new Response('<p>recipe</p>', { headers: { 'Content-Type':'text/html' } })))).toBe('processed');

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

    const slow = await handleImports(request('/api/imports', 'POST', { type: 'url', url: 'https://culy.nl/lease-dispatch' }, firstCookie), testEnv);
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
    const late = processImportTask(testEnv, id, 1, fetchWithPublicDns(async () => { markStarted(); return firstResponse; }));
    await started;
    await db.prepare(`UPDATE imports SET work_expires_at=0 WHERE id=?`).bind(id).run();
    const htmlFor = (name: string) => new Response(`<script type="application/ld+json">${JSON.stringify({
      '@type': 'Recipe', name, recipeIngredient: [`1 ${name}`],
    })}</script>`, { headers: { 'Content-Type': 'text/html' } });
    expect(await processImportTask(testEnv, id, 1, fetchWithPublicDns(async () => htmlFor('Winner B')))).toBe('processed');
    releaseFirst(htmlFor('Late Winner A'));
    expect(await late).toBe('busy');
    const stored = await db.prepare(`SELECT result_json AS result FROM imports WHERE id=?`).bind(id).first<{result:string}>();
    expect(JSON.parse(stored!.result)[0].title).toBe('Winner B');
  });
});
