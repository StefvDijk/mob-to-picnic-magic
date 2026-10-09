import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { expect, it, vi } from 'vitest';
import { createAiAttempt, processAiAttempt } from './ai';

it('persists an AI request with the configured conservative input price after migrations', async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  const now = Date.now();
  const owner = crypto.randomUUID();
  const id = crypto.randomUUID();
  const stamp = new Date(now).toISOString();
  await env.DB.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`)
    .bind(owner, 'Import test', 'ai-import@example.invalid', stamp, stamp).run();
  await env.DB.prepare(`INSERT INTO app_accounts(id,email,role,status,created_at,updated_at) VALUES(?,?,'admin','active',?,?)`)
    .bind(owner, 'ai-import@example.invalid', now, now).run();
  await env.DB.prepare(`UPDATE app_switches SET ai_enabled=1 WHERE singleton=1`).run();
  await env.DB.prepare(`INSERT INTO imports(id,owner_id,source_kind,source_url,status,created_at,updated_at) VALUES(?,?,'url',?,'needs_review',?,?)`)
    .bind(id, owner, 'https://www.culy.nl/recepten/kip-marbella/', now, now).run();
  const aiEnv = { ...env, OPENAI_API_KEY: 'test-only',
    AI_PRICE_ATTESTATION: 'gpt-6-luna-standard-2026-10-08+model-prices-verified',
    AI_PRICE_VALID_UNTIL: new Date(now + 86400_000).toISOString(), AI_EUR_PER_USD_BPS: '15000',
  };
  await createAiAttempt(aiEnv, id, now, 'Kip Marbella: 1 kip. 4 eetlepels olijfolie. zout. 250 ml wijn.');
  expect(await env.DB.prepare(`SELECT state,input_price_cents_per_million AS price FROM ai_attempts WHERE import_id=?`).bind(id).first())
    .toEqual({ state: 'pending', price: 13 });
  const attempt = await env.DB.prepare('SELECT id FROM ai_attempts WHERE import_id=?').bind(id).first<string>('id');
  const publicationSnapshots: { state: string; result: string }[] = [];
  const originalBatch = env.DB.batch.bind(env.DB);
  const batchSpy = vi.spyOn(env.DB, 'batch').mockImplementation(async statements => {
    const result = await originalBatch(statements);
    const snapshot = await env.DB.prepare(`SELECT a.state,i.result_json AS result FROM ai_attempts a
      JOIN imports i ON i.id=a.import_id AND i.owner_id=a.owner_id WHERE a.id=?`)
      .bind(attempt).first<{state:string;result:string}>();
    if (snapshot?.state === 'succeeded') publicationSnapshots.push(snapshot);
    return result;
  });
  try {
  await processAiAttempt(aiEnv, attempt!, 1, { provider: {
    count: async () => 500,
    send: async () => ({ status: 200, requestId: 'test-request', body: {
      status: 'completed', usage: { input_tokens: 500, output_tokens: 100 },
      output: [{ content: [{ type: 'output_text', text: JSON.stringify({
        title: 'Kip Marbella', baseServings: '4 personen', sections: [], steps: [], uncertainty: [],
        ingredients: [{ section: null, originalText: '1 kip', normalizedName: 'kip', sourceQuote: '1 kip',
          quantity: { kind: 'exact', amount: '1', maximum: null, unit: null, basis: null },
          attributes: { form: null, variant: null, brand: null }, uncertainty: [] },
          { section: null, originalText: '4 eetlepels olijfolie', normalizedName: 'olijfolie', sourceQuote: '4 eetlepels olijfolie',
            quantity: { kind: 'unknown', amount: null, maximum: null, unit: null, basis: null },
            attributes: { form: null, variant: null, brand: null }, uncertainty: ['quantity_missing'] },
          { section: null, originalText: 'zout', normalizedName: 'zout', sourceQuote: 'zout',
            quantity: { kind: 'unknown', amount: null, maximum: null, unit: null, basis: null },
            attributes: { form: null, variant: null, brand: null }, uncertainty: [] },
          { section: null, originalText: '250 ml wijn', normalizedName: 'wijn', sourceQuote: '250 ml wijn',
            quantity: { kind: 'exact', amount: '250', maximum: null, unit: 'ml', basis: null },
            attributes: { form: null, variant: null, brand: null }, uncertainty: [] }],
      }) }] }],
    } }),
  } });
  } finally { batchSpy.mockRestore(); }
  expect(publicationSnapshots.length).toBeGreaterThan(0);
  // Every observable terminal transaction must already include its recipe result.
  expect(publicationSnapshots.every(snapshot => JSON.parse(snapshot.result).length === 1)).toBe(true);
  expect(await env.DB.prepare('SELECT state FROM ai_attempts WHERE id=?').bind(attempt).first('state')).toBe('succeeded');
  expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM ai_attempts WHERE import_id=?').bind(id).first('total')).toBe(1);
  const result = JSON.parse((await env.DB.prepare('SELECT result_json FROM imports WHERE id=?').bind(id).first<string>('result_json'))!);
  expect(result[0].baseServings).toBe('4');
  expect(result[0].ingredients[0].quantity.kind).toBe('unknown');
  expect(result[0].ingredients[0].uncertainty).toContain('quantity_ambiguous');
  expect(result[0].ingredients[1].quantity.kind).toBe('unknown');
  expect(result[0].ingredients[1].uncertainty).toEqual(['quantity_unit_unsupported']);
  expect(result[0].ingredients[2].uncertainty).toEqual(['quantity_missing']);
  expect(result[0].ingredients[3].quantity).toMatchObject({ kind: 'exact', amount: '250', unit: 'ml' });
  expect(result[0].ingredients[3].uncertainty).toEqual([]);
  expect(await env.DB.prepare(`SELECT ai_reason_code FROM imports WHERE id=?`).bind(id).first('ai_reason_code')).toBeNull();
});
