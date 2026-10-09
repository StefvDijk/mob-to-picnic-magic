import { interpretProduct, PRODUCT_KNOWLEDGE_VERSION } from './knowledge';
import type { PicnicProduct, PicnicProductDetails } from '../../shared/picnic';
/** Offline checkpoint is the version on each observation. No provider reads or paid calls.
 * A changed fingerprint or revoked context prevents the guarded update. */
export async function enrichStoredCatalog(db: D1Database, limit = 40): Promise<number> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 40) throw new TypeError('Invalid enrichment limit');
  const rows = await db.prepare(`SELECT p.* FROM catalog_products p JOIN connections c ON c.owner_id=p.owner_id AND c.id=p.connection_id
    JOIN app_accounts a ON a.id=p.owner_id WHERE c.status='connected' AND a.status='active'
    AND c.generation=p.connection_generation AND (p.knowledge_version IS NULL OR p.knowledge_version<>?)
    ORDER BY p.checked_at,p.product_id LIMIT ?`).bind(PRODUCT_KNOWLEDGE_VERSION,limit)
    .all<{owner_id:string;connection_id:string;connection_generation:number;product_id:string;product_json:string;details_json:string|null;content_fingerprint:string}>();
  if (!rows.results.length) return 0;
  const updates = rows.results.map(row => {
    const knowledge = interpretProduct(JSON.parse(row.product_json) as PicnicProduct,
      row.details_json ? JSON.parse(row.details_json) as PicnicProductDetails : undefined);
    return db.prepare(`UPDATE catalog_products SET knowledge_json=?,knowledge_version=?,search_text=?
      WHERE owner_id=? AND connection_id=? AND connection_generation=? AND product_id=? AND content_fingerprint=?
      AND EXISTS(SELECT 1 FROM connections c JOIN app_accounts a ON a.id=c.owner_id WHERE c.owner_id=catalog_products.owner_id
        AND c.id=catalog_products.connection_id AND c.generation=catalog_products.connection_generation AND c.status='connected' AND a.status='active')`)
      .bind(JSON.stringify(knowledge),PRODUCT_KNOWLEDGE_VERSION,knowledge.searchText,row.owner_id,row.connection_id,row.connection_generation,row.product_id,row.content_fingerprint);
  });
  const results = await db.batch(updates);
  return results.reduce((count,result)=>count+result.meta.changes,0);
}
