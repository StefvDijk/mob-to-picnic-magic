import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { expect,it } from 'vitest';
import { evaluateDecision } from './decisions';
import { DECISION_STATUSES, validateDecision } from '../adapters/decisions';
const evidence={ingredient:{name:'ui'},product:{id:'onion',name:'Gele uien',fragments:['Verse uien'],contentFingerprint:'content-v1'}};
function reply(choice='suitable') {return {model:'gpt-6-luna',answers:[{type:'choice',name:'ingredient_product',choice,confidence:0.8,probabilities:DECISION_STATUSES.map(value=>({value,probability:value===choice?1:0}))}],usage:{input_tokens:100}};}
async function setup(){
 await applyD1Migrations(env.DB,env.TEST_MIGRATIONS);
 await env.DB.prepare('DELETE FROM app_accounts').run();
 await env.DB.prepare('DELETE FROM app_budget_months').run();
 const ownerId=crypto.randomUUID(),now=Date.now(),stamp=new Date(now).toISOString();
 await env.DB.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`).bind(ownerId,'Matching',ownerId+'@example.invalid',stamp,stamp).run();
 await env.DB.prepare(`INSERT INTO app_accounts(id,email,role,status,created_at,updated_at) VALUES(?,?,'admin','active',?,?)`).bind(ownerId,ownerId+'@example.invalid',now,now).run();
 await env.DB.prepare('UPDATE app_switches SET ai_enabled=1 WHERE singleton=1').run();
 return {ownerId,contextKey:'connection:1',...evidence};
}
it('strictly validates question names, cardinality, distributions and refusals',()=>{
 expect(validateDecision(reply())?.status).toBe('suitable');
 const wrong=reply();wrong.answers[0].name='other';expect(validateDecision(wrong)).toBeNull();
 const twice=reply();twice.answers.push(twice.answers[0]);expect(validateDecision(twice)).toBeNull();
 const probability=reply();probability.answers[0].probabilities[0].probability=NaN;expect(validateDecision(probability)).toBeNull();
 expect(validateDecision({model:'gpt-6-luna',answers:[{type:'refusal',name:'ingredient_product'}],usage:{input_tokens:4}})?.status).toBe('unresolved');
});
it('defaults off and blocks production even when enabled without counting proof',async()=>{
 const input=await setup();
 expect((await evaluateDecision(env,input)).reason).toBe('DECISIONS_OFF');
 expect((await evaluateDecision({...env,OPENAI_API_KEY:'mock',DECISIONS_MODE:'enabled'},input)).reason).toBe('DECISIONS_COUNT_UNPROVEN');
 expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM match_attempts').first('n')).toBe(0);
});
it('deduplicates concurrent requests and preserves shadow, precision and shared counters',async()=>{
 const input=await setup();let calls=0;
 const conf={...env,OPENAI_API_KEY:'mock',DECISIONS_MODE:'shadow'};
 const deps={provider:{boundedInputTokens:async()=>100,send:async()=>{calls++;return {status:200,body:reply(),requestId:'fixture'};}}};
 await Promise.all([evaluateDecision(conf,input,deps),evaluateDecision(conf,input,deps)]);
 const cached=await evaluateDecision(conf,input,deps);
 await env.DB.prepare('UPDATE match_attempts SET payload_json=NULL WHERE id=?').bind(cached.attemptId).run();
 await evaluateDecision(conf,input,deps);
 expect(calls).toBe(1);expect(cached.status).toBe('unresolved');expect(cached.proposedStatus).toBe('suitable');
 expect(await env.DB.prepare('SELECT actual_micro_eur AS micro,actual_cents AS cents FROM match_attempts WHERE owner_id=?').bind(input.ownerId).first()).toEqual({micro:15,cents:1});
 expect(await env.DB.prepare('SELECT reserved_cents AS reserved,spent_cents AS spent FROM user_budget_months WHERE owner_id=?').bind(input.ownerId).first()).toEqual({reserved:0,spent:1});
});
it('holds reservations after uncertain send and never retries even after lease expiry',async()=>{
 const input=await setup();let calls=0;
 const conf={...env,OPENAI_API_KEY:'mock',DECISIONS_MODE:'enabled'};
 const deps={provider:{boundedInputTokens:async()=>100,send:async()=>{calls++;throw new Error('timeout');}}};
 expect((await evaluateDecision(conf,input,deps)).reason).toBe('DECISIONS_OUTCOME_UNKNOWN');
 await evaluateDecision(conf,input,{...deps,now:()=>Date.now()+100_000});
 expect(calls).toBe(1);
 expect(await env.DB.prepare('SELECT reserved_cents FROM user_budget_months WHERE owner_id=?').bind(input.ownerId).first('reserved_cents')).toBe(1);
});
it('matching sees existing import usage in the same monthly budget',async()=>{
 const input=await setup();let calls=0;
 const now=Date.now();const {budgetMonthAmsterdam}=await import('../routes/accounts');const month=budgetMonthAmsterdam(now);
 await env.DB.prepare('INSERT INTO app_budget_months(month,cap_cents,spent_cents) VALUES(?,1500,1500)').bind(month).run();
 await env.DB.prepare('INSERT INTO user_budget_months(owner_id,month,cap_cents) VALUES(?,?,500)').bind(input.ownerId,month).run();
 const result=await evaluateDecision({...env,OPENAI_API_KEY:'mock',DECISIONS_MODE:'enabled'},input,{provider:{boundedInputTokens:async()=>100,send:async()=>{calls++;return {status:200,body:reply(),requestId:null};}}});
 expect(result.reason).toBe('DECISIONS_BUDGET_BLOCKED');expect(calls).toBe(0);
});

it('rejects a stale connection before any token counting or send',async()=>{
 const input=await setup();let calls=0;
 const result=await evaluateDecision({...env,OPENAI_API_KEY:'mock',DECISIONS_MODE:'enabled'},{...input,connectionId:'missing',connectionGeneration:2},{provider:{boundedInputTokens:async()=>{calls++;return 100;},send:async()=>{calls++;return {status:200,body:reply(),requestId:null};}}});
 expect(result.reason).toBe('DECISIONS_CONTEXT_STALE');expect(calls).toBe(0);
});
