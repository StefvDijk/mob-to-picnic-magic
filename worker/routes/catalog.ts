import { requirePrincipal, type AuthEnv } from '../auth';
import { createAbortablePicnicProvider, type PicnicProvider } from '../adapters/picnic';
import { decryptCredential, type PicnicKeyEnv } from '../security/credentials';
import { diagnoseProducts } from '../catalog/diagnostics';

/** Local admin-only bounded read experiment, using the app's credential service. */
export async function handleCatalog(request: Request, env: AuthEnv & PicnicKeyEnv, deps: {provider?: PicnicProvider} = {}): Promise<Response | null> {
  if (new URL(request.url).pathname !== '/api/catalog/diagnostics') return null;
  const fail = (status: number, code: string) => Response.json({error: {code, message: 'Catalogusproef niet beschikbaar.'}}, {status});
  if (env.APP_ENV !== 'development') return fail(404, 'NOT_FOUND');
  if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED');
  if (request.headers.get('Origin') !== env.APP_ORIGIN) return fail(403, 'ORIGIN_DENIED');
  const principal = await requirePrincipal(request, env);
  if (!principal || principal.role !== 'admin') return fail(403, 'ADMIN_REQUIRED');
  const link = await env.DB.prepare(`SELECT id,generation,encrypted_resume_key AS encrypted,key_version AS keyVersion
    FROM connections WHERE owner_id=? AND status='connected'`).bind(principal.ownerId)
    .first<{id:string;generation:number;encrypted:string;keyVersion:string}>();
  if (!link) return fail(409, 'PICNIC_NOT_CONNECTED');
  // Only IDs already observed through this account; no arbitrary provider URLs or scripts.
  const rows = await env.DB.prepare(`SELECT json_extract(j.value,'$.id') AS id,MIN(s.query) AS query FROM shopping_catalog s,
    json_each(s.products_json,'$.products') j WHERE s.owner_id=? AND s.connection_id=? AND s.connection_generation=?
    GROUP BY id ORDER BY id LIMIT 3`).bind(principal.ownerId,link.id,link.generation).all<{id:string;query:string}>();
  const authKey = await decryptCredential(env, principal.ownerId, link.id, 'resume', link.keyVersion, link.encrypted);
  const api = deps.provider ?? createAbortablePicnicProvider();
  let category: unknown = {coverageProven:false,status:'unsupported'};
  if (api.categoryPage) { try { const root = await api.categoryPage(authKey,'root'); category = {coverageProven:root.coverageProven,observedProducts:root.products.length}; } catch { category = {coverageProven:false,status:'read_failed'}; } }
  const report = await diagnoseProducts(api,authKey,rows.results.map(row=>row.id), {canRead: async () => !!await env.DB.prepare(`SELECT 1 FROM connections c JOIN app_accounts a ON a.id=c.owner_id WHERE c.owner_id=? AND c.id=? AND c.generation=? AND c.status='connected' AND a.status='active'`).bind(principal.ownerId,link.id,link.generation).first()});
  // One extra bounded read of an already observed query, never an arbitrary endpoint.
  let search: unknown = {status:'unsupported'};
  const first = rows.results[0];
  if (api.searchDiagnostics && first && await env.DB.prepare(`SELECT 1 FROM connections c JOIN app_accounts a ON a.id=c.owner_id WHERE c.owner_id=? AND c.id=? AND c.generation=? AND c.status='connected' AND a.status='active'`).bind(principal.ownerId,link.id,link.generation).first()) {
    try {
      const result = await api.searchDiagnostics(authKey,first.query,first.id);
      const product = result.products.find(item=>item.id===first.id);
      search = {id:first.id,found:!!product,availability:product?.isAvailable ?? null,diagnostic:result.diagnostic};
    } catch { search = {status:'read_failed'}; }
  }
  const stillLinked = await env.DB.prepare(`SELECT 1 FROM connections WHERE owner_id=? AND id=? AND generation=? AND status='connected'`)
    .bind(principal.ownerId,link.id,link.generation).first();
  return stillLinked ? Response.json({...report,category,search,requestLimit:5}) : fail(409,'PICNIC_CONNECTION_CHANGED');
}
