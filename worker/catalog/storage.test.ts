import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, expect, it, vi } from 'vitest';
import { bootstrapAdmin } from '../db';
import { storeCatalogProducts, findCatalogProducts, productFingerprints } from './index';
import { scheduleCatalogRefresh, refreshCatalogTask } from './sync';
import { normalizeProductDetails, type PicnicProvider } from '../adapters/picnic';
const db = env.DB;
const context = { ownerId: 'catalog-test', connectionId: 'catalog-conn', generation: 1 };
const detail = normalizeProductDetails('sku', { sellingUnit: { id: 'sku', name: 'Uien', unit_quantity: '500 g', display_price: 80, max_count: 5, is_available: true }, description: { id: 'description', markdown: 'Verse uien' } });
beforeAll(async () => {
  await applyD1Migrations(db, env.TEST_MIGRATIONS);
  await db.prepare(`INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)`).bind(context.ownerId, 'Catalog', 'catalog@test.invalid', 1, 1).run();
  await bootstrapAdmin(db, context.ownerId, 'catalog@test.invalid', 1);
  await db.prepare(`INSERT INTO connections(id,owner_id,status,generation,encrypted_resume_key,key_version,created_at,updated_at) VALUES(?,?,'connected',1,'fixture','v1',1,1)`)
    .bind(context.connectionId, context.ownerId).run();
});
it('retains richer content on a price-only search observation, isolates generations, resumes stale leases once', async () => {
  await storeCatalogProducts(db, context, [detail.product], 1000, 'details', detail);
  await storeCatalogProducts(db, context, [{ ...detail.product, displayPriceCents: 90 }], 2000);
  const row = await db.prepare('SELECT details_json,content_fingerprint FROM catalog_products WHERE owner_id=?').bind(context.ownerId)
    .first<{ details_json: string; content_fingerprint: string }>();
  expect(JSON.parse(row!.details_json).description).toBe('Verse uien');
  expect(row!.content_fingerprint).toBe(productFingerprints(detail.product, detail).content);
  expect(await findCatalogProducts(db, { ...context, generation: 2 }, 'uien', 2000)).toEqual([]);
  const now = 8 * 86400000;
  await scheduleCatalogRefresh(db, context, now);
  await db.prepare('UPDATE catalog_tasks SET lease_until=? WHERE owner_id=?').bind(now - 1, context.ownerId).run();
  const read = vi.fn(async () => detail);
  expect((await refreshCatalogTask(db, { productDetails: read } as unknown as PicnicProvider, context, 'fixture', now)).status).toBe('refreshed');
  expect((await refreshCatalogTask(db, { productDetails: read } as unknown as PicnicProvider, context, 'fixture', now)).status).toBe('idle');
  expect(read).toHaveBeenCalledTimes(1);
});
it('stores all observations in bounded batches and retrieves semantic identities beyond the newest 200', async () => {
  const coco = {...detail.product,id:'marketing',name:'Coco start naturel'};
  const cd = {...detail,product:coco,description:null,infoSections:[{title:'Extra informatie',content:'**Productomschrijving**\nGEFERMENTEERD KOKOSMELKPRODUCT'}]};
  await storeCatalogProducts(db,context,[coco],10000,'details',cd);
  await storeCatalogProducts(db,context,Array.from({length:205},(_,i)=>({...detail.product,id:`noise-${i}`,name:`Other ${i}`})),11000);
  expect((await findCatalogProducts(db,context,'kokosyoghurt',12000)).map(p=>p.id)).toEqual(['marketing']);
  expect((await db.prepare('SELECT COUNT(*) AS count FROM catalog_products WHERE product_id LIKE ?').bind('noise-%').first<{count:number}>())?.count).toBe(205);
  await storeCatalogProducts(db,context,[{...coco,name:'Coco drink mango'}],13000);
  expect(await findCatalogProducts(db,context,'kokosyoghurt',14000)).toEqual([]);
  const stale=await findCatalogProducts(db,context,'other 0',8*86400000);
  expect(stale.find(p=>p.id==='noise-0')).toMatchObject({displayPriceCents:null,priceCertainty:'unknown',priceRanges:[]});
  await storeCatalogProducts(db,context,[{...detail.product,id:'noise-0',name:'Other 0',displayPriceCents:1}],10000,'old-search-cache');
  const retained=await db.prepare('SELECT checked_at,product_json FROM catalog_products WHERE product_id=?').bind('noise-0').first<{checked_at:number;product_json:string}>();
  expect(retained?.checked_at).toBe(11000);
  expect(JSON.parse(retained!.product_json).displayPriceCents).toBe(detail.product.displayPriceCents);

});
it('enriches stored observations without changing observation age and stops after disconnect',async()=>{
 const {enrichStoredCatalog}=await import('./enrichment');
 await db.prepare('UPDATE catalog_products SET knowledge_json=NULL,knowledge_version=NULL,search_text=NULL WHERE owner_id=?').bind(context.ownerId).run();
 const ages=await db.prepare('SELECT product_id,checked_at FROM catalog_products WHERE owner_id=? ORDER BY product_id').bind(context.ownerId).all();
 expect(await enrichStoredCatalog(db,40)).toBe(40);
 expect((await db.prepare('SELECT product_id,checked_at FROM catalog_products WHERE owner_id=? ORDER BY product_id').bind(context.ownerId).all()).results).toEqual(ages.results);
 await db.prepare("UPDATE connections SET status='disconnected',encrypted_resume_key=NULL,key_version=NULL WHERE id=?").bind(context.connectionId).run();
 expect(await enrichStoredCatalog(db,40)).toBe(0);
 await storeCatalogProducts(db,context,[{...detail.product,id:'after-disconnect'}],Date.now());
 expect(await db.prepare('SELECT product_id FROM catalog_products WHERE product_id=?').bind('after-disconnect').first()).toBeNull();
 await db.prepare('DELETE FROM connections WHERE id=?').bind(context.connectionId).run();
 expect(await db.prepare('SELECT knowledge_json FROM catalog_products WHERE owner_id=?').bind(context.ownerId).first()).toBeNull();
});
