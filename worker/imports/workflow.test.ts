import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, expect, it, vi } from 'vitest';
import { processImportTask, type ImportDnsResolver } from './processor';
import { processAiAttempt, type AiProvider } from './ai';
import { WorkflowTimeoutError, beforeDeadline } from './deadline';
import type { ImportCandidate } from '../../shared/imports';

beforeAll(async () => { await applyD1Migrations(env.DB,env.TEST_MIGRATIONS); });
const priceUntil=new Date(Date.now()+86400_000).toISOString();
const publicDns: ImportDnsResolver = {
  resolve4: async () => ['93.184.216.34'],
  resolve6: async () => ['2606:4700:4700::1111'],
};
const fetchWithPublicDns = (fetcher: typeof fetch) => ({ fetch: fetcher, resolveDns: publicDns });
const aiEnv = () => ({...env,OPENAI_API_KEY:'mock-only',
  AI_PRICE_ATTESTATION:'gpt-6-luna-standard-2026-10-08+model-prices-verified',
  AI_PRICE_VALID_UNTIL:priceUntil,AI_EUR_PER_USD_BPS:'15000'});
let testOwner='';
async function fixture(deadlineAt = Date.now()+30_000) {
  const owner = testOwner || crypto.randomUUID(), id = crypto.randomUUID(), now=Date.now();
  if (!testOwner) {
  await env.DB.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`)
    .bind(owner,'Offline flow',`${owner}@example.invalid`,now,now).run();
  await env.DB.prepare(`INSERT INTO app_accounts(id,email,role,status,created_at,updated_at) VALUES(?,?,'admin','active',?,?)`)
    .bind(owner,`${owner}@example.invalid`,now,now).run();
    testOwner=owner;
  }
  await env.DB.prepare(`UPDATE app_switches SET ai_enabled=1 WHERE singleton=1`).run();
  await env.DB.prepare(`INSERT INTO imports(id,owner_id,source_kind,source_url,status,expires_at,created_at,updated_at,workflow_deadline_at)
    VALUES(?,?,'url','https://culy.nl/mock','queued',?,?,?,?)`).bind(id,owner,now+86400_000,now,now,deadlineAt).run();
  return {id,owner};
}
function page(lines: string[], title = 'Offline soep') {
  return new Response(`<script type="application/ld+json">${JSON.stringify({'@type':'Recipe',name:title,recipeYield:'Voor 4 personen',recipeIngredient:lines,recipeInstructions:['Kook de soep.']})}</script>`,{headers:{'Content-Type':'text/html'}});
}
async function result(id:string) {
  return (await env.DB.prepare('SELECT result_json FROM imports WHERE id=?').bind(id).first<string>('result_json'))!;
}
it('completes an exact structured recipe without token counting or model attempts',async () => {
  const {id}=await fixture();
  expect(await processImportTask(aiEnv(),id,1,fetchWithPublicDns(async()=>page(['200 g rijst','1 ui'])))).toBe('processed');
  const candidates=JSON.parse(await result(id)) as ImportCandidate[];
  expect(candidates[0]).toMatchObject({baseServings:'4',steps:['Kook de soep.']});
  expect(candidates[0].ingredients[0]).toMatchObject({sourceOrigin:'parser',quantity:{kind:'exact',amount:'200',unit:'g'}});
  expect(await env.DB.prepare('SELECT COUNT(*) FROM ai_attempts WHERE import_id=?').bind(id).first('COUNT(*)')).toBe(0);
});
it('preserves distinct recipe choices in the fast route',async () => {
  const {id}=await fixture();
  const html=await page(['200 g rijst']).text()+await page(['1 ui'],'Offline uien').text();
  await processImportTask(aiEnv(),id,1,fetchWithPublicDns(async()=>new Response(html,{headers:{'Content-Type':'text/html'}})));
  expect(JSON.parse(await result(id)).map((x:ImportCandidate)=>x.title)).toEqual(['Offline soep','Offline uien']);
});
it('rejects a late queue delivery before fetching or paying',async () => {
  const {id}=await fixture(Date.now()+8_000), fetcher=vi.fn(async()=>page(['200 g rijst']));
  await processImportTask(aiEnv(),id,1,fetchWithPublicDns(fetcher));
  expect(fetcher).not.toHaveBeenCalled();
  expect(await env.DB.prepare('SELECT status,error_code FROM imports WHERE id=?').bind(id).first()).toEqual({status:'failed',error_code:'WORKFLOW_TIMEOUT'});
});
async function ambiguous() {
  const current=await fixture();
  await processImportTask(aiEnv(),current.id,1,fetchWithPublicDns(async()=>page(['20 g sumak'])));
  const attempt=(await env.DB.prepare('SELECT id FROM ai_attempts WHERE import_id=?').bind(current.id).first<string>('id'))!;
  return {...current,attempt};
}
it('uses a compact model schema and restores the immutable structured source',async()=>{
  const {id,attempt}=await ambiguous();
  const provider:AiProvider={count:async body=>{
    expect(body).not.toHaveProperty('__structured');
    expect(JSON.stringify(body.input)).not.toContain('Kook de soep.'); return 100;
  },send:async body=>{
    expect(body).not.toHaveProperty('__structured');
    return {status:200,requestId:'mock',body:{status:'completed',usage:{input_tokens:100,output_tokens:100},output:[{content:[{type:'output_text',text:JSON.stringify({baseServings:'99',ingredients:[{index:0,normalizedName:'sumak',quantity:{kind:'exact',amount:'20',maximum:null,unit:'g',basis:null},attributes:{form:null,variant:null,brand:null},uncertainty:[]}]})}]}]}};
  }};
  await processAiAttempt(aiEnv(),attempt,1,{provider});
  expect(JSON.parse(await result(id))[0]).toMatchObject({title:'Offline soep',baseServings:'4',steps:['Kook de soep.'],ingredients:[{originalText:'20 g sumak',sourceQuote:'20 g sumak',sourceOrigin:'ai'}]});
});
it('stops after a slow count without reserving or sending',async()=>{
  const {attempt}=await ambiguous(); let now=Date.now();
  const provider:AiProvider={count:async()=>{now+=30_000;return 100;},send:vi.fn()};
  await processAiAttempt(aiEnv(),attempt,1,{provider,now:()=>now});
  expect(provider.send).not.toHaveBeenCalled();
  expect(await env.DB.prepare('SELECT state,reason_code FROM ai_attempts WHERE id=?').bind(attempt).first()).toEqual({state:'count_failed',reason_code:'WORKFLOW_TIMEOUT'});
  expect(await env.DB.prepare('SELECT COUNT(*) FROM budget_reservations WHERE attempt_id=?').bind(attempt).first('COUNT(*)')).toBe(0);
});
it('keeps an aborted sent request financially unknown and never replays it',async()=>{
  const {attempt}=await ambiguous(); const send=vi.fn(async()=>{throw new WorkflowTimeoutError();});
  const provider:AiProvider={count:async()=>100,send};
  await processAiAttempt(aiEnv(),attempt,1,{provider});
  expect(await env.DB.prepare('SELECT state FROM ai_attempts WHERE id=?').bind(attempt).first('state')).toBe('unknown');
  expect(await env.DB.prepare('SELECT state FROM budget_reservations WHERE attempt_id=?').bind(attempt).first('state')).toBe('unknown');
  await processAiAttempt(aiEnv(),attempt,1,{provider}); expect(send).toHaveBeenCalledTimes(1);
});
it('aborts a hanging provider and does not start work after deadline',async()=>{
  let signal:AbortSignal|undefined;
  await expect(beforeDeadline(Date.now()+10,async received=>{signal=received;return await new Promise<never>(()=>{});})).rejects.toBeInstanceOf(WorkflowTimeoutError);
  expect(signal?.aborted).toBe(true);
  const run=vi.fn(); await expect(beforeDeadline(Date.now()-1,run)).rejects.toBeInstanceOf(WorkflowTimeoutError); expect(run).not.toHaveBeenCalled();
});
