import { enrichStoredCatalog } from './enrichment';
import type { AuthEnv } from '../auth';
import { createAbortablePicnicProvider } from '../adapters/picnic';
import { decryptCredential, type PicnicKeyEnv } from '../security/credentials';
import { refreshCatalogTask, scheduleCatalogRefresh } from './sync';
/** Disabled until detail normalization has been proved against live fixtures. One account/read per cron. */
export async function maintainCatalog(env: AuthEnv & PicnicKeyEnv & {CATALOG_SYNC_ENABLED?: string}, now = Date.now()): Promise<void> {
  await enrichStoredCatalog(env.DB);
  if (env.CATALOG_SYNC_ENABLED !== 'verified-details-v1') return;
  const link = await env.DB.prepare(`SELECT c.owner_id AS ownerId,c.id,c.generation,c.encrypted_resume_key AS encrypted,c.key_version AS keyVersion
    FROM connections c JOIN app_accounts a ON a.id=c.owner_id WHERE c.status='connected' AND a.status='active'
    AND EXISTS(SELECT 1 FROM catalog_products p WHERE p.owner_id=c.owner_id AND p.connection_id=c.id
      AND p.connection_generation=c.generation AND (p.checked_at<? OR p.details_json IS NULL)) ORDER BY c.updated_at LIMIT 1`)
    .bind(now - 7 * 86400000).first<{ownerId:string;id:string;generation:number;encrypted:string;keyVersion:string}>();
  if (!link) return;
  const context = {ownerId:link.ownerId,connectionId:link.id,generation:link.generation};
  await scheduleCatalogRefresh(env.DB,context,now);
  const authKey = await decryptCredential(env,link.ownerId,link.id,'resume',link.keyVersion,link.encrypted);
  await refreshCatalogTask(env.DB,createAbortablePicnicProvider(),context,authKey,now);
}
