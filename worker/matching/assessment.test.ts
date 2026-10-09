import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { expect,it } from 'vitest';
import type { PicnicProduct,PicnicProductDetails } from '../../shared/picnic';
import type { ShoppingGroup } from '../../shared/shopping';
import { assessStoredProduct, assessStoredProducts } from './assessment';
import { DECISION_STATUSES,DECISIONS_VERSION } from '../adapters/decisions';
const product:PicnicProduct={id:'onion',name:'Uien speciaal',quantity:{kind:'exact',amount:'500',unit:'g',basis:null},unitQuantity:'500 g',displayPriceCents:100,priceCertainty:'known',priceRanges:[],identity:{groupId:'onion',variantId:'onion'}};
const group:ShoppingGroup={id:'group',name:'ui',query:'ui',knowledgeKey:'onion',pantry:false,sources:[],demand:{kind:'exact',amount:'200',unit:'g',basis:null},estimates:[]};
const details:PicnicProductDetails={product,description:'Verse gele uien.',infoSections:[],allergens:{contains:[],mayContain:[],original:[]},parserVersion:'fixture',currentCheckUsable:true};
async function setup(){
 await applyD1Migrations(env.DB,env.TEST_MIGRATIONS);await env.DB.prepare('DELETE FROM app_accounts').run();await env.DB.prepare('DELETE FROM app_budget_months').run();
 const ownerId=crypto.randomUUID(),connectionId=crypto.randomUUID(),now=Date.now(),stamp=new Date(now).toISOString();
 await env.DB.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`).bind(ownerId,'Assessment',ownerId+'@example.invalid',stamp,stamp).run();
 await env.DB.prepare(`INSERT INTO app_accounts(id,email,role,status,created_at,updated_at) VALUES(?,?,'admin','active',?,?)`).bind(ownerId,ownerId+'@example.invalid',now,now).run();
 await env.DB.prepare(`INSERT INTO connections(id,owner_id,status,generation,encrypted_resume_key,key_version,created_at,updated_at) VALUES(?,?,'connected',1,'fixture','v1',?,?)`).bind(connectionId,ownerId,now,now).run();
 await env.DB.prepare('UPDATE app_switches SET ai_enabled=1 WHERE singleton=1').run();
 return {ownerId,connectionId,generation:1};
}
function mock(){let calls=0;return {get calls(){return calls;},provider:{boundedInputTokens:async()=>100,send:async()=>{calls++;return {status:200,requestId:'mock',body:{model:'gpt-6-luna',answers:[{type:'choice',name:'ingredient_product',choice:'suitable',confidence:1,probabilities:DECISION_STATUSES.map(value=>({value,probability:value==='suitable'?1:0}))}],usage:{input_tokens:100}}};}}};}
it('keeps hard exclusions and suitable rules out of Decisions',async()=>{
 const context=await setup(),m=mock();const options={env:{...env,OPENAI_API_KEY:'mock',DECISIONS_MODE:'enabled',DECISIONS_AUTO_VERIFIED:DECISIONS_VERSION},decisionProvider:m.provider,details};
 expect(await assessStoredProduct(env.DB,context,group,{...product,name:'Uiensoep'},options)).toMatchObject({status:'unsuitable',hardExclusion:true});
 expect(await assessStoredProduct(env.DB,context,group,{...product,name:'Gele uien'},options)).toMatchObject({status:'suitable',origin:'rules'});expect(m.calls).toBe(0);
});
it('reuses an immutable model attempt during prepare and retains the rules relation ID',async()=>{
 const context=await setup(),m=mock(),options={env:{...env,OPENAI_API_KEY:'mock',DECISIONS_MODE:'enabled',DECISIONS_AUTO_VERIFIED:DECISIONS_VERSION},decisionProvider:m.provider,details};
 const miss=await assessStoredProduct(env.DB,context,group,product,{...options,allowSend:false});expect(miss.status).toBe('unresolved');expect(m.calls).toBe(0);
 const plan=await assessStoredProduct(env.DB,context,group,product,options);expect(plan).toMatchObject({status:'suitable',origin:'decisions',id:miss.id});
 const prepare=await assessStoredProduct(env.DB,context,group,product,{...options,allowSend:false});expect(prepare).toMatchObject({status:'suitable',attemptId:plan.attemptId,id:plan.id});expect(m.calls).toBe(1);
 const changed=await assessStoredProduct(env.DB,context,group,product,{...options,allowSend:false,details:{...details,description:'Gemengde maaltijd met uien.'}});expect(changed.status).toBe('unresolved');expect(changed.contentFingerprint).not.toBe(plan.contentFingerprint);expect(m.calls).toBe(1);
});
it('uses a scoped coconut composition rather than a marketing name, without lifting explicit variants',async()=>{
 const context=await setup();
 const coco={...product,id:'coco',name:"Abbot Kinney's bio coco start naturel"};
 const cg={...group,knowledgeKey:'coconut-yoghurt',name:'kokosyoghurt'};
 const cd={...details,product:coco,description:null,infoSections:[{title:'Extra informatie',content:'Productomschrijving: GEFERMENTEERD KOKOSMELKPRODUCT'}]};
 expect(await assessStoredProduct(env.DB,context,cg,coco,{details:cd})).toMatchObject({status:'suitable',origin:'rules'});
 expect(await assessStoredProduct(env.DB,context,cg,coco,{details:{...cd,infoSections:[]}})).toMatchObject({status:'unresolved'});
 expect(await assessStoredProduct(env.DB,context,cg,{...coco,name:'Coco daily vanilla'},{details:{...cd,product:{...coco,name:'Coco daily vanilla'}}})).not.toMatchObject({status:'suitable'});
});
it('uses documented powder and fresh-herb identity, abstaining from conflicting evidence',async()=>{
 const context=await setup();
 const cinnamon={...product,id:'powder',name:'Verstegen kaneel'};
 const cg:ShoppingGroup={...group,knowledgeKey:'cinnamon|form:poeder',name:'kaneelpoeder',sources:[{id:'source',ordinal:0,section:null,originalText:'1 tl kaneelpoeder',normalizedName:'kaneelpoeder',quantity:{kind:'unknown',basis:null},sourceOrigin:'parser',attributes:{form:'poeder'},uncertainty:[]}]};
 const cd={...details,product:cinnamon,description:null,infoSections:[{title:'Extra informatie',content:'**Productomschrijving**\nKANEEL GEMALEN'}]};
 expect(await assessStoredProduct(env.DB,context,cg,cinnamon,{details:cd})).toMatchObject({status:'suitable'});
 expect(await assessStoredProduct(env.DB,context,cg,cinnamon)).toMatchObject({status:'unresolved'});
 const herb={...product,id:'herb',name:'Oregano'};
 const hg={...group,knowledgeKey:'oregano-fresh',name:'verse oregano'};
 const hd={...details,product:herb,description:'Verse oregano heeft een karakteristieke smaak. Minder sterk dan de gedroogde variant.',infoSections:[]};
 expect(await assessStoredProduct(env.DB,context,hg,herb,{details:hd})).toMatchObject({status:'suitable'});
 expect(await assessStoredProduct(env.DB,context,hg,herb,{details:{...hd,infoSections:[{title:'Omschrijving',content:'Gedroogde oregano'}]}})).toMatchObject({status:'unresolved'});
});
it('keeps canonical relation IDs across concurrent batches and confirmation',async()=>{
 const context=await setup();
 const inputs=Array.from({length:45},(_,i)=>({product:{...product,id:`batch-${i}`,name:'Gele uien'}}));
 const [first,second]=await Promise.all([assessStoredProducts(env.DB,context,group,inputs),assessStoredProducts(env.DB,context,group,inputs)]);
 expect(first.size).toBe(45);
 for(const [id,assessment] of first)expect(second.get(id)?.id).toBe(assessment.id);
 const confirmation=await assessStoredProduct(env.DB,context,group,inputs[0].product);
 expect(confirmation.id).toBe(first.get(inputs[0].product.id)?.id);
 expect((await assessStoredProducts(env.DB,context,group,[{product:{...inputs[0].product,name:'Uiensoep'}}])).get(inputs[0].product.id)).toMatchObject({status:'unsuitable',hardExclusion:true});
});
