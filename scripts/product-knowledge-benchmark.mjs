/** Offline replay only. Reads an explicit local SQLite snapshot; never contacts a provider.
 * Run: node scripts/product-knowledge-benchmark.mjs DATABASE.sqlite REPORT.json
 * Real recipe/product source stays in the database outside Git. Report contains hashes/counts only.
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { writeFile, readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const [databasePath, reportPath, labelsPath] = process.argv.slice(2);
if (!databasePath || !reportPath) throw new Error('Expected DATABASE.sqlite REPORT.json');
const bundled = await build({stdin:{contents:`export {interpretProduct, PRODUCT_KNOWLEDGE_VERSION} from './worker/catalog/knowledge';
 export {assessProductKnowledge} from './worker/matching/knowledge';
 export {shoppingGroups,rankCandidates,assessProduct} from './worker/domain/shopping';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const {interpretProduct,PRODUCT_KNOWLEDGE_VERSION,assessProductKnowledge,shoppingGroups,rankCandidates,assessProduct} = await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const db = new DatabaseSync(databasePath,{readOnly:true});
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
try {
 const snapshots = db.prepare(`SELECT r.* FROM recipes r WHERE deleted_at IS NULL AND
  (title='Recept zonder titel' OR title='Kip Marbella met rijst') ORDER BY updated_at DESC`).all();
 const selected = [...new Map(snapshots.reverse().map(r=>[r.title,r])).values()];
 const results = selected.map(r=>{
  const ingredients=db.prepare('SELECT * FROM ingredients WHERE recipe_id=? AND owner_id=? AND retired_at IS NULL ORDER BY ordinal').all(r.id,r.owner_id).map(i=>{
   const attributes=JSON.parse(i.attributes_json),basis=attributes.quantityBasis??null;delete attributes.quantityBasis;
   const amount=`${i.quantity_num}/${i.quantity_den}`;
   return {id:i.id,ordinal:i.ordinal,section:i.section,originalText:i.original_text,normalizedName:i.normalized_name,
    quantity:['unknown','global'].includes(i.quantity_kind)?{kind:i.quantity_kind,basis}:{kind:i.quantity_kind,amount,maximum:i.quantity_kind==='range'?`${i.quantity_max_num}/${i.quantity_den}`:undefined,unit:i.unit,basis},
    attributes,uncertainty:JSON.parse(i.uncertainty_json),sourceOrigin:i.source_origin};
  });
  const recipe={id:r.id,title:r.title,baseServings:`${r.base_servings_num}/${r.base_servings_den}`,version:r.version,ingredients};
  const observed=db.prepare(`SELECT p.* FROM catalog_products p JOIN connections c ON c.id=p.connection_id AND c.owner_id=p.owner_id
   WHERE p.owner_id=? AND c.status='connected' AND c.generation=p.connection_generation`).all(r.owner_id);
  const products=observed.map(p=>({product:JSON.parse(p.product_json),details:p.details_json?JSON.parse(p.details_json):undefined}));
  const detailMap=new Map(products.map(p=>[p.product.id,p.details]));
  const started=performance.now();
  const groups=shoppingGroups(recipe,recipe.baseServings);
  const rows=groups.map(group=>{
   const candidates=rankCandidates(group,products.map(p=>p.product),(g,p)=>assessProductKnowledge(g,p,detailMap.get(p.id)));
   const eligible=candidates.filter(c=>c.match==='suitable'&&c.totalPriceCents!==null);
   const nameOnly=rankCandidates(group,products.map(p=>p.product),assessProduct).filter(c=>c.match==='suitable'&&c.totalPriceCents!==null);
   const chosen=eligible[0];
   return {kind:group.knowledgeKey,sourceLines:group.sources.length,pantry:group.pantry,candidates:candidates.length,
    chosen:chosen?{productId:chosen.product.id,packCount:chosen.packCount,reason:chosen.assessment.reason}:null,
    nameOnlyChosen:nameOnly[0]?.product.id??null,estimates:chosen?.estimates??group.estimates,
    uncertainty:candidates.filter(c=>c.match==='unresolved').length};
  });
  return {sourceHash:hash(ingredients),title:r.title,sourceLines:ingredients.length,groups:groups.length,
   selected:rows.filter(r=>r.chosen&&!r.pantry).length,missing:rows.filter(r=>!r.chosen&&!r.pantry).map(r=>r.kind),
   replayMs:performance.now()-started,rows,observedProducts:observed.length,details:products.filter(p=>p.details).length};
 });
 const rows=db.prepare('SELECT product_json,details_json FROM catalog_products').all();
 const knowledge=rows.map(r=>interpretProduct(JSON.parse(r.product_json),r.details_json?JSON.parse(r.details_json):undefined));
 let labelledPairs = null;
 if (labelsPath) {
  const labels=JSON.parse(await readFile(labelsPath,'utf8'));
  const cases=labels.cases.map(label=>{
   const row=db.prepare('SELECT product_json,details_json FROM catalog_products WHERE product_id=? LIMIT 1').get(label.productId);
   if (!row) throw new Error('Missing labelled product '+label.productId);
   const product=JSON.parse(row.product_json),details=row.details_json?JSON.parse(row.details_json):undefined;
   const group={id:label.kind,name:label.kind,query:label.kind,knowledgeKey:label.kind+(label.form?'|form:'+label.form:''),sources:label.form?[{attributes:{form:label.form}}]:[],pantry:false,demand:null,estimates:[]};
   const assessment=assessProductKnowledge(group,product,details);
   return {...label,status:assessment.status,correct:(assessment.status==='suitable')===label.automatic,inputHash:hash([product,details]),reason:assessment.reason};
  });
  const automatic=cases.filter(c=>c.status==='suitable');
  labelledPairs={evidence:labels.evidence,total:cases.length,correct:cases.filter(c=>c.correct).length,
   automatic:automatic.length,automaticCorrect:automatic.filter(c=>c.automatic).length,
   precision:automatic.length?automatic.filter(c=>c.automatic).length/automatic.length:null,
   positiveCoverage:cases.filter(c=>c.automatic&&c.status==='suitable').length/cases.filter(c=>c.automatic).length,
   abstentions:cases.filter(c=>c.status==='unresolved').length,cases};
 }
 const report={schemaVersion:1,knowledgeVersion:PRODUCT_KNOWLEDGE_VERSION,evidence:'Development replay over saved observations, not independent recipe ground truth or end-to-end latency.',
  labelledPairs,productCount:rows.length,detailsCount:rows.filter(r=>r.details_json).length,
  kindKnown:knowledge.filter(k=>k.kind.status==='known').length,kindConflict:knowledge.filter(k=>k.kind.status==='conflict').length,
  formKnown:knowledge.filter(k=>k.form.status==='known').length,providerRequests:0,paidRequests:0,costCents:0,recipes:results};
 await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({productCount:report.productCount,detailsCount:report.detailsCount,kindKnown:report.kindKnown,formKnown:report.formKnown,labelledPairs:labelledPairs?{total:labelledPairs.total,correct:labelledPairs.correct,precision:labelledPairs.precision}:null,recipes:results.map(({title,selected,missing,replayMs})=>({title,selected,missing,replayMs}))}));
} finally {db.close();}
