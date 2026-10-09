/** Rebuild existing local observations without provider reads. Back up with SQLite
 * backup first. Usage: node scripts/product-knowledge-enrich.mjs LOCAL.sqlite --apply
 * Each transaction processes <=40 observations; the version is its durable checkpoint.
 */
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
const [path,apply]=process.argv.slice(2);
if (!path || apply!=='--apply' || !path.endsWith('.sqlite')) throw new Error('Expected LOCAL.sqlite --apply');
const bundled=await build({stdin:{contents:"export {enrichStoredCatalog} from './worker/catalog/enrichment';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const {enrichStoredCatalog}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const local=new DatabaseSync(path);
const prepared=sql=>({bind:(...args)=>({all:async()=>({results:local.prepare(sql).all(...args)}),run:async()=>({meta:local.prepare(sql).run(...args)})})});
const db={prepare:prepared,batch:async statements=>{
 local.exec('BEGIN IMMEDIATE');
 try{const results=[];for(const s of statements)results.push(await s.run());local.exec('COMMIT');return results;}
 catch(error){local.exec('ROLLBACK');throw error;}
}};
try{
 const before=local.prepare('SELECT count(*) AS n FROM catalog_products').get().n;
 let enriched=0,runs=0;
 for(;runs<20;runs++){const changed=await enrichStoredCatalog(db);enriched+=changed;if(!changed)break;}
 if(local.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Integrity check failed');
 const after=local.prepare('SELECT count(*) AS n FROM catalog_products').get().n;
 if(before!==after)throw new Error('Observation count changed');
 console.log(JSON.stringify({observations:before,enriched,batches:runs,providerRequests:0,paidRequests:0,integrity:'ok'}));
}finally{local.close();}
