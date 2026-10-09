import { interpretProduct, PRODUCT_KNOWLEDGE_VERSION, type ProductKnowledge } from './knowledge';
import { normalizeIngredient } from '../../shared/ingredient-knowledge';
import { createHash } from 'node:crypto';
import type { PicnicProduct, PicnicProductDetails } from '../../shared/picnic';
export interface CatalogContext { ownerId: string; connectionId: string; generation: number }
export function productFingerprints(product: PicnicProduct, details?: PicnicProductDetails) {
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  return {
    content: hash([product.id, product.name, product.brand ?? null, product.unitQuantity, product.quantity, details?.description ?? null,
      details?.infoSections ?? [], details?.allergens ?? null, details?.parserVersion ?? null]),
    commercial: hash([product.displayPriceCents, product.priceCertainty, product.priceRanges, product.maxCount ?? null, product.isAvailable ?? null]),
  };
}
export async function storeCatalogProducts(db: D1Database, context: CatalogContext, products: PicnicProduct[], now: number,
  sourceRoute = 'search', details?: PicnicProductDetails): Promise<void> {
  if (!products.length) return;
  for (let offset = 0; offset < products.length; offset += 40) {
  const chunk = products.slice(offset, offset + 40);
  const previous = await db.prepare(`SELECT product_id,product_json,details_json,content_fingerprint,knowledge_json,knowledge_version FROM catalog_products
    WHERE owner_id=? AND connection_id=? AND connection_generation=? AND product_id IN (${chunk.map(() => '?').join(',')})`).bind(context.ownerId, context.connectionId, context.generation, ...chunk.map(product => product.id))
    .all<{ product_id: string; product_json: string; details_json: string | null;content_fingerprint:string;knowledge_json:string|null;knowledge_version:string|null }>();
  const retained = new Map(previous.results.map(row => [row.product_id, row]));
  await db.batch(chunk.map(product => {
    const prior = retained.get(product.id);
    const priorProduct = prior ? JSON.parse(prior.product_json) as PicnicProduct : undefined;
    const detail = details?.product.id === product.id ? details : prior?.details_json && priorProduct?.name === product.name
      && priorProduct.unitQuantity === product.unitQuantity && priorProduct.brand === product.brand
      ? JSON.parse(prior.details_json) as PicnicProductDetails : undefined;
    const fingerprints = productFingerprints(product, detail);
    const knowledge = prior?.content_fingerprint === fingerprints.content && prior.knowledge_version === PRODUCT_KNOWLEDGE_VERSION && prior.knowledge_json
      ? JSON.parse(prior.knowledge_json) as ProductKnowledge : interpretProduct(product, detail);
    return db.prepare(`INSERT INTO catalog_products(owner_id,connection_id,connection_generation,product_id,product_json,
      details_json,content_fingerprint,commercial_fingerprint,source_route,first_seen,checked_at,knowledge_json,knowledge_version,search_text)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(
        SELECT 1 FROM connections c JOIN app_accounts a ON a.id=c.owner_id WHERE c.owner_id=? AND c.id=?
        AND c.generation=? AND c.status='connected' AND a.status='active') ON CONFLICT(owner_id,connection_id,connection_generation,product_id)
      DO UPDATE SET product_json=excluded.product_json, details_json=excluded.details_json,
      content_fingerprint=excluded.content_fingerprint,commercial_fingerprint=excluded.commercial_fingerprint,
      source_route=excluded.source_route,checked_at=excluded.checked_at,
      knowledge_json=excluded.knowledge_json,knowledge_version=excluded.knowledge_version,search_text=excluded.search_text
      WHERE excluded.checked_at>=catalog_products.checked_at`).bind(context.ownerId, context.connectionId,
      context.generation, product.id, JSON.stringify(product), detail ? JSON.stringify(detail) : null,
      fingerprints.content, fingerprints.commercial, sourceRoute, now, now, JSON.stringify(knowledge), PRODUCT_KNOWLEDGE_VERSION, knowledge.searchText, context.ownerId, context.connectionId, context.generation);
  }));
  }
}
export async function findCatalogProducts(db: D1Database, context: CatalogContext, query: string, now: number,
  maxAge = 90 * 86400000): Promise<PicnicProduct[]> {
  const terms = normalizeIngredient(query).split(/\s+/).filter(Boolean).slice(0, 8);
  if (!terms.length) return [];
  // Filter before limiting; products outside the 200 newest observations remain discoverable.
  const rows = await db.prepare(`SELECT product_json,checked_at FROM catalog_products WHERE owner_id=? AND connection_id=?
    AND connection_generation=? AND checked_at>? AND (${terms.map(() =>
      "instr(CASE WHEN knowledge_version=? THEN search_text ELSE lower(json_extract(product_json,'$.name')) END,?)>0").join(' AND ')})
    ORDER BY checked_at DESC,product_id LIMIT 40`)
    .bind(context.ownerId, context.connectionId, context.generation, now - maxAge,
      ...terms.flatMap(term => [PRODUCT_KNOWLEDGE_VERSION, term])).all<{ product_json: string; checked_at:number }>();
  return rows.results.map(row => {
    const product = JSON.parse(row.product_json) as PicnicProduct;
    // Semantic retention is longer than commercial freshness. Never promote an
    // old price/availability merely because this record was retrieved again.
    return row.checked_at > now - 600_000 ? product : {...product,displayPriceCents:null,priceCertainty:'unknown' as const,
      priceRanges:[],maxCount:undefined,isAvailable:undefined};
  });
}
