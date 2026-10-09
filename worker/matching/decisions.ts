import type { AiEnv } from '../imports/ai';
import { budgetMonthAmsterdam } from '../routes/accounts';
import { decisionBody, DECISIONS_VERSION, productionDecisionProvider, validateDecision } from '../adapters/decisions';
import type { DecisionEvidence, DecisionProvider, DecisionStatus } from '../adapters/decisions';
export interface DecisionsEnv extends AiEnv { DECISIONS_MODE?: string; DECISIONS_AUTO_VERIFIED?: string }
export interface MatchResult { status:DecisionStatus; proposedStatus?:DecisionStatus; attemptId?:string; reason:string; mode:'off'|'shadow'|'enabled' }
type Row = {id:string;state:string;resultStatus:DecisionStatus|null;lease:number};
/** A separately attested adapter may be injected after account, regional pricing
 * and provider-specific counting verification. The built-in adapter fails closed. */
export async function evaluateDecision(env: DecisionsEnv, input: DecisionEvidence & {ownerId:string;contextKey:string;connectionId?:string;connectionGeneration?:number}, deps: {provider?:DecisionProvider;now?:()=>number;allowSend?:boolean} = {}): Promise<MatchResult> {
  const mode = env.DECISIONS_MODE === 'enabled' && env.DECISIONS_AUTO_VERIFIED === DECISIONS_VERSION ? 'enabled' : env.DECISIONS_MODE === 'shadow' || env.DECISIONS_MODE === 'enabled' ? 'shadow' : 'off';
  const fallback = (reason:string,attemptId?:string):MatchResult => ({status:'unresolved',reason,mode,attemptId});
  if (mode === 'off') return fallback('DECISIONS_OFF');
  const now = (deps.now ?? Date.now)();
  if (!env.OPENAI_API_KEY || !input.ownerId || !input.contextKey || input.contextKey.length>300) return fallback('DECISIONS_NOT_CONFIGURED');
  const gate=await env.DB.prepare(`SELECT 1 AS enabled FROM app_accounts a JOIN app_switches sw ON sw.singleton=1 WHERE a.id=? AND a.status='active' AND sw.ai_enabled=1`).bind(input.ownerId).first();
  if (!gate) return fallback('DECISIONS_DISABLED');
  const evidence:DecisionEvidence = {ingredient:{name:input.ingredient.name,form:input.ingredient.form??null,variant:input.ingredient.variant??null,brand:input.ingredient.brand??null},product:{id:input.product.id,name:input.product.name,category:input.product.category??null,fragments:input.product.fragments,contentFingerprint:input.product.contentFingerprint}};
  let body:Record<string,unknown>; try { body=decisionBody(evidence); } catch { return fallback('DECISIONS_INPUT_INVALID'); }
  const payload = JSON.stringify(body);
  const key = [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(DECISIONS_VERSION+payload)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const lookup = () => env.DB.prepare(`SELECT id,state,result_status AS resultStatus,lease_until AS lease FROM match_attempts WHERE owner_id=? AND context_key=? AND payload_key=?`).bind(input.ownerId,input.contextKey,key).first<Row>();
  const resultFor = (row:Row):MatchResult => row.state === 'succeeded' && row.resultStatus
    ? {status:mode==='enabled'?row.resultStatus:'unresolved',proposedStatus:row.resultStatus,attemptId:row.id,reason:'DECISIONS_CACHED',mode}
    : fallback(row.state==='reserved'||row.state==='sending'?'DECISIONS_BUSY':'DECISIONS_UNRESOLVED',row.id);
  if (input.connectionId !== undefined || input.connectionGeneration !== undefined) {
    const context=await env.DB.prepare(`SELECT 1 AS valid FROM connections WHERE id=? AND owner_id=? AND generation=? AND status='connected'`).bind(input.connectionId??null,input.ownerId,input.connectionGeneration??null).first();
    if (!context) return fallback('DECISIONS_CONTEXT_STALE');
  }
  const existing = await lookup();
  if (existing) {
    if ((existing.state==='reserved'||existing.state==='sending') && existing.lease<=now) {
      await env.DB.prepare(`UPDATE match_attempts SET state='unknown',reason_code='DECISIONS_OUTCOME_UNKNOWN',updated_at=? WHERE id=? AND state IN ('reserved','sending') AND lease_until<=?`).bind(now,existing.id,now).run();
      return fallback('DECISIONS_OUTCOME_UNKNOWN',existing.id);
    }
    return resultFor(existing);
  }
  if (deps.allowSend === false) return fallback('DECISIONS_CACHE_MISS');
  const provider = deps.provider ?? productionDecisionProvider;
  let bound:number; try { bound=await provider.boundedInputTokens(body); } catch { return fallback('DECISIONS_COUNT_UNPROVEN'); }
  if (!Number.isSafeInteger(bound)||bound<1||bound>16_000) return fallback('DECISIONS_INPUT_TOO_LARGE');
  // Fixed conservative USD/Euro headroom for mocks. Production is blocked above;
  // live activation requires an independently reviewed regional rate/config gate.
  if (!deps.provider) return fallback('DECISIONS_ACCESS_UNPROVEN');
  const eurBps=15000;
  const cap=Math.max(1,Math.ceil(bound*10*eurBps/10_000_000_000));
  const id=crypto.randomUUID(),month=budgetMonthAmsterdam(now);
  try { await env.DB.batch([
    env.DB.prepare(`INSERT INTO app_budget_months(month,cap_cents) VALUES(?,1500) ON CONFLICT DO NOTHING`).bind(month),
    env.DB.prepare(`INSERT INTO user_budget_months(owner_id,month,cap_cents) VALUES(?,?,500) ON CONFLICT DO NOTHING`).bind(input.ownerId,month),
    env.DB.prepare(`INSERT INTO match_attempts(id,owner_id,context_key,payload_key,payload_json,model_version,month,state,cap_cents,bound_tokens,eur_bps,lease_until,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'reserved',?,?,?,?,?,?)`).bind(id,input.ownerId,input.contextKey,key,payload,DECISIONS_VERSION,month,cap,bound,eurBps,now+20_000,now,now),
  ]); } catch { const raced=await lookup(); return raced?resultFor(raced):fallback('DECISIONS_BUDGET_BLOCKED'); }
  const token=crypto.randomUUID();
  const claim=await env.DB.prepare(`UPDATE match_attempts SET state='sending',send_token=?,lease_until=?,updated_at=? WHERE id=? AND state='reserved' AND EXISTS(SELECT 1 FROM app_accounts a JOIN app_switches sw ON sw.singleton=1 WHERE a.id=match_attempts.owner_id AND a.status='active' AND sw.ai_enabled=1) AND (? IS NULL OR EXISTS(SELECT 1 FROM connections c WHERE c.id=? AND c.owner_id=match_attempts.owner_id AND c.generation=? AND c.status='connected'))`).bind(token,now+65_000,now,id,input.connectionId??null,input.connectionId??null,input.connectionGeneration??null).run();
  if (!claim.meta.changes) return fallback('DECISIONS_DISABLED',id);
  try {
    const reply=await provider.send(body,env.OPENAI_API_KEY);
    const parsed=validateDecision(reply.body);
    if (!parsed||parsed.inputTokens>bound) throw new Error('unknown');
    const micro=Math.ceil(parsed.inputTokens*10*eurBps/1_000_000);
    const actual=Math.ceil(micro/10_000);
    const state=reply.status>=200&&reply.status<300?'succeeded':'invalid';
    await env.DB.prepare(`UPDATE match_attempts SET state=?,result_status=?,input_tokens=?,actual_micro_eur=?,actual_cents=?,provider_request_id=?,updated_at=? WHERE id=? AND state='sending' AND send_token=?`).bind(state,state==='succeeded'?parsed.status:'unresolved',parsed.inputTokens,micro,actual,reply.requestId?.slice(0,200)??null,(deps.now??Date.now)(),id,token).run();
    const settled=await lookup(); return settled?resultFor(settled):fallback('DECISIONS_UNRESOLVED',id);
  } catch {
    await env.DB.prepare(`UPDATE match_attempts SET state='unknown',reason_code='DECISIONS_OUTCOME_UNKNOWN',updated_at=? WHERE id=? AND state='sending' AND send_token=?`).bind((deps.now??Date.now)(),id,token).run();
    return fallback('DECISIONS_OUTCOME_UNKNOWN',id);
  }
}
