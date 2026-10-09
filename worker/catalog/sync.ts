import type { PicnicProvider } from '../adapters/picnic';
import { storeCatalogProducts, type CatalogContext } from './index';
/** Schedule only already discovered products; category coverage has not been proved. */
export async function scheduleCatalogRefresh(db: D1Database, context: CatalogContext, now: number) {
  await db.prepare(`INSERT OR IGNORE INTO catalog_tasks(owner_id,connection_id,connection_generation,product_id,due_at)
    SELECT owner_id,connection_id,connection_generation,product_id,? FROM catalog_products
    WHERE owner_id=? AND connection_id=? AND connection_generation=? AND (checked_at<? OR details_json IS NULL) ORDER BY details_json IS NOT NULL,checked_at LIMIT 50`)
    .bind(now, context.ownerId, context.connectionId, context.generation, now - 7 * 86400000).run();
}
/** One leased read per run. Caller retrieves auth via the existing connection service. */
export async function refreshCatalogTask(db: D1Database, provider: PicnicProvider, context: CatalogContext, authKey: string, now: number) {
  if (!provider.productDetails) return { status: 'unsupported' as const };
  const task = await db.prepare(`UPDATE catalog_tasks SET lease_until=?,attempts=attempts+1
    WHERE owner_id=? AND connection_id=? AND connection_generation=? AND product_id=(
      SELECT t.product_id FROM catalog_tasks t JOIN connections c ON c.id=t.connection_id AND c.owner_id=t.owner_id
      WHERE t.owner_id=? AND t.connection_id=? AND t.connection_generation=? AND c.generation=t.connection_generation
      AND c.status='connected' AND EXISTS(SELECT 1 FROM app_accounts a WHERE a.id=t.owner_id AND a.status='active') AND t.due_at<=? AND (t.lease_until IS NULL OR t.lease_until<=?) AND t.attempts<3
      ORDER BY t.due_at LIMIT 1) AND (lease_until IS NULL OR lease_until<=?) RETURNING product_id`)
    .bind(now + 60000, context.ownerId, context.connectionId, context.generation, context.ownerId, context.connectionId,
      context.generation, now, now, now).first<{ product_id: string }>();
  if (!task) return { status: 'idle' as const };
  try {
    const details = await provider.productDetails(authKey, task.product_id);
    if (details.product.id !== task.product_id) throw new Error('PRODUCT_ID_MISMATCH');
    const stillConnected = await db.prepare(`SELECT c.id FROM connections c JOIN app_accounts a ON a.id=c.owner_id WHERE c.owner_id=? AND c.id=? AND c.generation=? AND c.status='connected' AND a.status='active'`)
      .bind(context.ownerId, context.connectionId, context.generation).first();
    if (!stillConnected) return { status: 'invalidated' as const };
    await storeCatalogProducts(db, context, [details.product], now, 'product-details-page-root', details);
    await db.prepare(`DELETE FROM catalog_tasks WHERE owner_id=? AND connection_id=? AND connection_generation=? AND product_id=? AND lease_until=?`)
      .bind(context.ownerId, context.connectionId, context.generation, task.product_id, now + 60000).run();
    return { status: 'refreshed' as const, productId: task.product_id };
  } catch {
    // Stop this run; no mass disappearance inference and no immediate provider retry.
    await db.prepare(`UPDATE catalog_tasks SET due_at=?,lease_until=NULL WHERE owner_id=? AND connection_id=? AND connection_generation=? AND product_id=? AND lease_until=?`)
      .bind(now + 86400000, context.ownerId, context.connectionId, context.generation, task.product_id, now + 60000).run();
    return { status: 'paused' as const };
  }
}
