import type { PicnicProduct, PicnicProductDetails } from '../../shared/picnic';
import type { ProductAssessment, ShoppingGroup } from '../../shared/shopping';
import { PRODUCT_KNOWLEDGE_VERSION, type ProductKnowledge } from '../catalog/knowledge';
import { assessProductKnowledge } from './knowledge';
import { MATCH_RULES_VERSION, purchaseAttribute } from '../domain/shopping';
import { evaluateDecision, type DecisionsEnv } from './decisions';
import type { DecisionProvider } from '../adapters/decisions';
import { productFingerprints, type CatalogContext } from '../catalog/index';

export interface AssessmentOptions { env?:DecisionsEnv; decisionProvider?:DecisionProvider; allowSend?:boolean; details?:PicnicProductDetails }
export type StoredAssessment = ProductAssessment & {origin?:'rules'|'decisions';attemptId?:string};
/** The same content assessment is used in planning and confirmation. Prices are separate. */
export async function assessStoredProduct(db: D1Database, context: CatalogContext, group: ShoppingGroup,
  product: PicnicProduct, detailsOrOptions?: PicnicProductDetails | AssessmentOptions): Promise<StoredAssessment> {
  const options:AssessmentOptions = detailsOrOptions && 'product' in detailsOrOptions ? {details:detailsOrOptions} : detailsOrOptions ?? {};
  const details = options.details?.product.id === product.id ? options.details : undefined;
  const rules = assessProductKnowledge(group, product, details);
  const relationVersion = `${MATCH_RULES_VERSION}:${PRODUCT_KNOWLEDGE_VERSION}`;
  const fingerprint = productFingerprints(product, details).content;
  // Brand is part of the ingredient contract, never a personal preference or ranking wish.
  const ingredientKey = JSON.stringify([group.knowledgeKey, group.sources.map(source => [source.attributes.brand ?? null,purchaseAttribute(source.attributes.form),purchaseAttribute(source.attributes.variant)])]);
  const saved = await db.prepare(`SELECT assessment_json FROM product_relations WHERE owner_id=? AND connection_id=?
    AND connection_generation=? AND ingredient_key=? AND product_id=? AND content_fingerprint=? AND rules_version=?`)
    .bind(context.ownerId, context.connectionId, context.generation, ingredientKey, product.id, fingerprint, relationVersion)
    .first<{assessment_json: string}>();
  let assessment:StoredAssessment;
  if (saved && !rules.hardExclusion) assessment=JSON.parse(saved.assessment_json) as StoredAssessment;
  else {
  assessment = { ...rules, origin:'rules', id: crypto.randomUUID(), contentFingerprint: fingerprint };
  await db.prepare(`INSERT INTO product_relations(id,owner_id,connection_id,connection_generation,ingredient_key,product_id,
    content_fingerprint,rules_version,status,assessment_json,checked_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(owner_id,connection_id,connection_generation,ingredient_key,product_id,content_fingerprint,rules_version) DO NOTHING`)
    .bind(assessment.id, context.ownerId, context.connectionId, context.generation, ingredientKey, product.id, fingerprint,
      relationVersion, assessment.status, JSON.stringify(assessment), Date.now()).run();
  const stored = await db.prepare(`SELECT assessment_json FROM product_relations WHERE owner_id=? AND connection_id=?
    AND connection_generation=? AND ingredient_key=? AND product_id=? AND content_fingerprint=? AND rules_version=?`)
    .bind(context.ownerId, context.connectionId, context.generation, ingredientKey, product.id, fingerprint, relationVersion)
    .first<{assessment_json: string}>();
  assessment=JSON.parse(stored!.assessment_json) as StoredAssessment;
  }
  if (rules.hardExclusion) return {...assessment,...rules,origin:'rules'};
  if (assessment.status !== 'unresolved' || !options.env || !details || details.product.id !== product.id) return assessment;
  const fragments=[details.description,...details.infoSections.filter(section=>/omschrijving|beschrijving|ingrediënt|ingredient|samenstelling|product|bereiding/i.test(section.title)).map(section=>`${section.title}: ${section.content}`)].filter((value):value is string=>typeof value==='string' && !!value.trim()).slice(0,8).map(value=>value.slice(0,1000));
  if (!fragments.length) return assessment;
  const attributes = (field:'form'|'variant'|'brand') => [...new Set(group.sources.map(source=>field==='brand' ? source.attributes[field] : purchaseAttribute(source.attributes[field])).filter((value):value is string=>typeof value==='string' && !!value.trim()))].join('; ') || null;
  const decision=await evaluateDecision(options.env,{ownerId:context.ownerId,contextKey:`${context.connectionId}:${context.generation}`,connectionId:context.connectionId,connectionGeneration:context.generation,ingredient:{name:group.name,form:attributes('form'),variant:[attributes('variant'),...group.knowledgeKey.split('|').slice(1)].filter(Boolean).join('; ')||null,brand:attributes('brand')},product:{id:product.id,name:product.name,fragments,contentFingerprint:fingerprint}},{provider:options.decisionProvider,allowSend:options.allowSend});
  return {...assessment,status:decision.status,reason:decision.status==='unresolved'?assessment.reason:'Inhoudelijk beoordeeld; modelrelatie.',origin:decision.status==='unresolved'?'rules':'decisions',attemptId:decision.attemptId};
}

/** Batch deterministic relations; model-enabled paths retain the existing durable budget policy. */
export async function assessStoredProducts(db: D1Database, context: CatalogContext, group: ShoppingGroup,
  inputs: Array<{product:PicnicProduct;details?:PicnicProductDetails;knowledge?:ProductKnowledge}>, options: Omit<AssessmentOptions,'details'> = {}): Promise<Map<string,StoredAssessment>> {
  if (options.env && options.env.DECISIONS_MODE && options.env.DECISIONS_MODE !== 'off') {
    const result = new Map<string,StoredAssessment>();
    for (const input of inputs) result.set(input.product.id,await assessStoredProduct(db,context,group,input.product,{...options,details:input.details}));
    return result;
  }
  const result = new Map<string,StoredAssessment>();
  const version = `${MATCH_RULES_VERSION}:${PRODUCT_KNOWLEDGE_VERSION}`;
  const ingredientKey = JSON.stringify([group.knowledgeKey,group.sources.map(source=>[source.attributes.brand??null,purchaseAttribute(source.attributes.form),purchaseAttribute(source.attributes.variant)])]);
  for (let offset=0;offset<inputs.length;offset+=40) {
    const chunk=inputs.slice(offset,offset+40);
    const saved=await db.prepare(`SELECT product_id,content_fingerprint,assessment_json FROM product_relations
      WHERE owner_id=? AND connection_id=? AND connection_generation=? AND ingredient_key=? AND rules_version=?
      AND product_id IN (${chunk.map(()=>'?').join(',')})`).bind(context.ownerId,context.connectionId,context.generation,ingredientKey,version,...chunk.map(i=>i.product.id))
      .all<{product_id:string;content_fingerprint:string;assessment_json:string}>();
    const byKey=new Map(saved.results.map(row=>[`${row.product_id}:${row.content_fingerprint}`,row.assessment_json]));
    const writes:D1PreparedStatement[]=[];
    for (const input of chunk) {
      const fingerprint=productFingerprints(input.product,input.details).content;
      const stored=byKey.get(`${input.product.id}:${fingerprint}`);
      const rules=assessProductKnowledge(group,input.product,input.details,input.knowledge);
      const assessment:StoredAssessment=stored?JSON.parse(stored):{...rules,origin:'rules',id:crypto.randomUUID(),contentFingerprint:fingerprint};
      result.set(input.product.id,rules.hardExclusion?{...assessment,...rules,origin:'rules'}:assessment);
      if (!stored) writes.push(db.prepare(`INSERT INTO product_relations(id,owner_id,connection_id,connection_generation,ingredient_key,product_id,
        content_fingerprint,rules_version,status,assessment_json,checked_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(owner_id,connection_id,connection_generation,ingredient_key,product_id,content_fingerprint,rules_version) DO NOTHING`)
        .bind(assessment.id,context.ownerId,context.connectionId,context.generation,ingredientKey,input.product.id,fingerprint,version,assessment.status,JSON.stringify(assessment),Date.now()));
    }
    if (writes.length) {
      await db.batch(writes);
      // Concurrent plans may have inserted the immutable relation first. Return its canonical ID.
      const canonical=await db.prepare(`SELECT product_id,content_fingerprint,assessment_json FROM product_relations
        WHERE owner_id=? AND connection_id=? AND connection_generation=? AND ingredient_key=? AND rules_version=?
        AND product_id IN (${chunk.map(()=>'?').join(',')})`).bind(context.ownerId,context.connectionId,context.generation,ingredientKey,version,...chunk.map(i=>i.product.id))
        .all<{product_id:string;content_fingerprint:string;assessment_json:string}>();
      for (const row of canonical.results) if (result.get(row.product_id)?.contentFingerprint===row.content_fingerprint) result.set(row.product_id,JSON.parse(row.assessment_json));
    }
  }
  return result;
}
