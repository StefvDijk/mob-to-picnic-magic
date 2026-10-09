import { remainingBudgetFromInput } from '../../shared/workflow';
import type { ImportCandidate, ImportDto, ImportStatus } from '../../shared/imports';
import { requirePrincipal, type AuthEnv, type Principal } from '../auth';
import { getSessionAccess, sessionExpiryMillisSql } from '../db';
import { validateImportUrl } from '../imports/processor';

const NO_STORE = { 'Cache-Control': 'no-store, private', Pragma: 'no-cache' };
const MAX_LABEL = 200;
const liveSessionSql = `EXISTS(SELECT 1 FROM app_accounts a
  JOIN session_metadata sm ON sm.owner_id=a.id
  JOIN session s ON s.id=sm.session_id AND s.userId=sm.owner_id
  WHERE a.id=? AND sm.session_id=? AND a.status='active' AND sm.revoked_at IS NULL
    AND sm.authenticated_at+2592000000>? AND sm.last_activity_at+1209600000>?
    AND (${sessionExpiryMillisSql})>?)`;

export interface ImportRouteDependencies {
  /** Test seam for account/session races after authentication and before D1 writes. */
  beforeWrite?: () => Promise<void>;
  now?: () => number;
}

function fail(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: NO_STORE });
}
function json(value: unknown, status = 200): Response { return Response.json(value, { status, headers: NO_STORE }); }
function originError(request: Request, env: AuthEnv): Response | null {
  if (request.headers.get('Origin') !== env.APP_ORIGIN) return fail(403, 'ORIGIN_DENIED', 'Dit verzoek is niet toegestaan.');
  if (request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return fail(400, 'INVALID_CONTENT_TYPE', 'Verstuur geldige JSON.');
  }
  return null;
}
async function payload(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}
async function accessFailure(env: AuthEnv, principal: Principal): Promise<Response | null> {
  const result = await getSessionAccess(env.DB, principal.ownerId, principal.sessionId, Date.now());
  return result.success ? null : fail(result.reason === 'blocked' ? 403 : 401,
    result.reason === 'blocked' ? 'FORBIDDEN' : 'UNAUTHENTICATED', result.reason === 'blocked' ? 'Geen toegang.' : 'Log opnieuw in.');
}

type ImportRow = {
  id: string; sourceKind: 'text' | 'url' | 'upload'; sourceUrl: string | null; sourceText: string | null;
  sourceLabel: string | null; sourceTitle: string | null; status: ImportStatus; resultJson: string;
  uncertaintiesJson: string; errorCode: string | null; createdAt: number; updatedAt: number;
  deadlineAt?: number | null; expiresAt: number | null; uploadIdsJson?: string | null; aiReasonCode?: string | null; aiState?: string | null; aiAttemptsUsed?: number | null;
};
function dto(row: ImportRow): ImportDto {
  let candidates: ImportCandidate[] = [];
  let uncertainties: string[] = [];
  let uploadIds: string[] = [];
  try { const parsed: unknown = JSON.parse(row.resultJson); if (Array.isArray(parsed)) candidates = parsed as ImportCandidate[]; } catch { /* migration-safe empty result */ }
  try { const parsed: unknown = JSON.parse(row.uncertaintiesJson); if (Array.isArray(parsed)) uncertainties = parsed.filter(v => typeof v === 'string'); } catch { /* migration-safe */ }
  try { const parsed: unknown = JSON.parse(row.uploadIdsJson ?? '[]'); if (Array.isArray(parsed)) uploadIds = parsed.filter(v => typeof v === 'string'); } catch { /* migration-safe */ }
  const structuredReady = candidates.length > 0 && candidates.every(candidate => candidate.ingredients.length > 0 && candidate.ingredients.every(item => item.sourceOrigin === 'parser'));
  const incomplete = row.aiState === 'succeeded' && candidates.length === 0;
  const state = structuredReady && !row.aiState ? 'succeeded' : incomplete ? 'manual' : row.aiState;
  const recognition = state || row.aiReasonCode ? {
    state: state === 'counting' || state === 'counted' ? 'counting' : state === 'reserved' ? 'reserved' :
      state === 'sending' ? 'sending' : state === 'succeeded' ? 'ready' : state === 'unknown' ? 'unknown' :
      row.aiReasonCode || ['manual','count_failed','known_failed','invalid_output'].includes(state ?? '') ? 'manual' : 'pending',
    attemptsUsed: Math.min(2, Math.max(0, row.aiAttemptsUsed ?? 0)) as 0 | 1 | 2,
    reasonCode: incomplete ? 'AI_OUTPUT_INVALID' : row.aiReasonCode ?? null,
  } as ImportDto['recognition'] : undefined;
  return {
    id: row.id, sourceKind: row.sourceKind, sourceUrl: row.sourceUrl, uploadIds,
    sourceText: row.sourceKind === 'text' ? row.sourceText : null,
    sourceLabel: row.sourceLabel ?? row.sourceTitle, status: row.status, candidates, uncertainties,
    errorCode: row.errorCode, recognition, deadlineAt: row.deadlineAt ?? null, expiresAt: row.expiresAt, createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

async function createImport(request: Request, env: AuthEnv, principal: Principal, deps: ImportRouteDependencies): Promise<Response> {
  const body = await payload(request);
  if (!body) return fail(400, 'INVALID_BODY', 'Verstuur geldige JSON.');
  const remainingMs = remainingBudgetFromInput(body.remainingMs);
  if (remainingMs === null) return fail(400, 'INVALID_DEADLINE', 'Ongeldig tijdsbudget.');
  if (remainingMs === 0) return fail(504, 'WORKFLOW_TIMEOUT', 'Je recept kon niet binnen 30 seconden worden verwerkt.');
  const kind = body.type ?? body.sourceKind;
  let sourceKind: 'url' | 'upload';
  let sourceText: string | null = null;
  let sourceUrl: string | null = null;
  let sourceLabel: string | null = null;
  let uploadIds: string[] = [];
  if (kind === 'text') return fail(400, 'TEXT_IMPORT_UNSUPPORTED', 'Importeer een recept via een HTTPS-link of foto.');
  if (kind === 'upload' || kind === 'photo' || kind === 'image') {
    if (!Array.isArray(body.uploadIds) || body.uploadIds.length < 1 || body.uploadIds.length > 3 ||
      !body.uploadIds.every(id => typeof id === 'string' && id.length > 0 && id.length <= 100) || new Set(body.uploadIds).size !== body.uploadIds.length) {
      return fail(400, 'INVALID_UPLOADS', 'Kies 1 tot 3 opgeslagen receptfoto’s.');
    }
    sourceKind = 'upload'; uploadIds = body.uploadIds as string[];
  } else if (kind === 'url') {
    if (typeof body.url !== 'string' || body.url.length > 2048) return fail(400, 'INVALID_URL', 'Deze HTTPS-link wordt niet ondersteund.');
    const safeUrl = validateImportUrl(body.url);
    if (!safeUrl) return fail(400, 'INVALID_URL', 'Gebruik een HTTPS-link van Culy of MOB zonder inloggegevens.');
    sourceKind = 'url'; sourceUrl = safeUrl.toString();
    if (body.sourceLabel !== undefined) {
      if (typeof body.sourceLabel !== 'string' || body.sourceLabel.length > MAX_LABEL) return fail(400, 'INVALID_SOURCE_LABEL', 'Ongeldige bronnaam.');
      sourceLabel = body.sourceLabel.trim() || null;
    }
  } else return fail(400, 'INVALID_SOURCE', 'Kies een receptfoto of ondersteunde HTTPS-link.');

  const now = (deps.now ?? Date.now)();
  const id = crypto.randomUUID();
  await deps.beforeWrite?.();
  if (uploadIds.length) {
    const owned = await env.DB.prepare(`SELECT COUNT(*) AS count FROM uploads WHERE owner_id=? AND status='stored' AND id IN (${uploadIds.map(() => '?').join(',')})`)
      .bind(principal.ownerId, ...uploadIds).first<{count:number}>();
    if (owned?.count !== uploadIds.length) return fail(400, 'INVALID_UPLOADS', 'Kies 1 tot 3 opgeslagen receptfoto’s.');
  }
  // D1.batch is transactional. The outbox INSERT SELECT is tied to the guarded
  // import insert, so a lost session/account race cannot leave an orphan task.
  const uploadPlaceholders = uploadIds.map(() => '?').join(',');
  const uploadsGate = uploadIds.length
    ? `AND (SELECT COUNT(*) FROM uploads u WHERE u.owner_id=? AND u.status='stored' AND u.id IN (${uploadPlaceholders}))=?`
    : '';
  const importBindings = [id, principal.ownerId, sourceKind, sourceUrl, sourceText, sourceLabel,
    now + 7 * 24 * 60 * 60 * 1000, now, now, now + remainingMs, principal.ownerId, principal.sessionId, now, now, now,
    ...(uploadIds.length ? [principal.ownerId, ...uploadIds, uploadIds.length] : [])];
  const statements = [
    env.DB.prepare(`INSERT INTO imports(id,owner_id,source_kind,source_url,source_text,source_label,status,error_code,expires_at,created_at,updated_at,workflow_deadline_at)
      SELECT ?,?,?,?,? ,?,'queued',NULL,?, ?, ?, ? WHERE ${liveSessionSql} ${uploadsGate}`)
      .bind(...importBindings),
    env.DB.prepare(`INSERT INTO outbox(id,owner_id,task_type,task_id,version,payload_json,status,available_at,created_at,updated_at)
      SELECT ?,owner_id,'import',id,1,'{}','pending',?,?,? FROM imports
      WHERE id=? AND owner_id=? AND status='queued' AND created_at=?`)
      .bind(`outbox:${id}`, now, now, now, id, principal.ownerId, now),
  ];
  if (uploadIds.length) statements.push(env.DB.prepare(`INSERT INTO import_uploads(owner_id,import_id,upload_id)
    SELECT ?,?,u.id FROM uploads u JOIN imports i ON i.owner_id=? AND i.id=? AND i.status='queued'
    WHERE u.owner_id=? AND u.status='stored' AND u.id IN (${uploadPlaceholders})`)
    .bind(principal.ownerId,id,principal.ownerId,id,principal.ownerId,...uploadIds));
  const results = await env.DB.batch(statements);
  if (results[0]?.meta.changes !== 1) return await accessFailure(env, principal) ?? fail(409, 'IMPORT_CREATE_FAILED', 'Import kon niet worden aangemaakt.');
  if (results[1]?.meta.changes !== 1 || (uploadIds.length && results[2]?.meta.changes !== uploadIds.length)) return fail(409, 'IMPORT_CREATE_FAILED', 'Import kon niet worden aangemaakt.');
  const row = await env.DB.prepare(`SELECT id,source_kind AS sourceKind,source_url AS sourceUrl,source_text AS sourceText,
      source_label AS sourceLabel,source_title AS sourceTitle,status,result_json AS resultJson,
      uncertainties_json AS uncertaintiesJson,error_code AS errorCode,workflow_deadline_at AS deadlineAt,expires_at AS expiresAt,created_at AS createdAt,updated_at AS updatedAt,
      COALESCE((SELECT json_group_array(iu.upload_id) FROM import_uploads iu WHERE iu.owner_id=imports.owner_id AND iu.import_id=imports.id),'[]') AS uploadIdsJson,
      COALESCE(ai_reason_code,(SELECT reason_code FROM ai_attempts aa WHERE aa.owner_id=imports.owner_id AND aa.import_id=imports.id ORDER BY generation DESC LIMIT 1)) AS aiReasonCode,
      (SELECT state FROM ai_attempts aa WHERE aa.owner_id=imports.owner_id AND aa.import_id=imports.id ORDER BY generation DESC LIMIT 1) AS aiState,
      (SELECT COUNT(*) FROM ai_attempts aa WHERE aa.owner_id=imports.owner_id AND aa.import_id=imports.id AND aa.send_started_at IS NOT NULL) AS aiAttemptsUsed
    FROM imports WHERE id=? AND owner_id=?`).bind(id, principal.ownerId).first<ImportRow>();
  return json({ import: dto(row!) }, 202);
}

async function getImport(env: AuthEnv, principal: Principal, id: string): Promise<Response> {
  const row = await env.DB.prepare(`SELECT id,source_kind AS sourceKind,source_url AS sourceUrl,source_text AS sourceText,
      source_label AS sourceLabel,source_title AS sourceTitle,status,result_json AS resultJson,
      uncertainties_json AS uncertaintiesJson,error_code AS errorCode,workflow_deadline_at AS deadlineAt,expires_at AS expiresAt,created_at AS createdAt,updated_at AS updatedAt,
      COALESCE((SELECT json_group_array(iu.upload_id) FROM import_uploads iu WHERE iu.owner_id=imports.owner_id AND iu.import_id=imports.id),'[]') AS uploadIdsJson,
      COALESCE(ai_reason_code,(SELECT reason_code FROM ai_attempts aa WHERE aa.owner_id=imports.owner_id AND aa.import_id=imports.id ORDER BY generation DESC LIMIT 1)) AS aiReasonCode,
      (SELECT state FROM ai_attempts aa WHERE aa.owner_id=imports.owner_id AND aa.import_id=imports.id ORDER BY generation DESC LIMIT 1) AS aiState,
      (SELECT COUNT(*) FROM ai_attempts aa WHERE aa.owner_id=imports.owner_id AND aa.import_id=imports.id AND aa.send_started_at IS NOT NULL) AS aiAttemptsUsed
    FROM imports WHERE id=? AND owner_id=?`).bind(id, principal.ownerId).first<ImportRow>();
  return row ? json({ import: dto(row) }) : fail(404, 'NOT_FOUND', 'Niet gevonden.');
}

/** Returns null for paths owned by other route modules. */
export async function handleImports(request: Request, env: AuthEnv, deps: ImportRouteDependencies = {}): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== '/api/imports' && !/^\/api\/imports\/[^/]+$/.test(path)) return null;
  if (request.method === 'POST') {
    const deniedOrigin = originError(request, env);
    if (deniedOrigin) return deniedOrigin;
  }
  const principal = await requirePrincipal(request, env);
  if (!principal) return fail(401, 'UNAUTHENTICATED', 'Log opnieuw in.');
  if (path === '/api/imports') {
    if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Deze handeling is niet beschikbaar.');
    return createImport(request, env, principal, deps);
  }
  if (request.method !== 'GET') return fail(405, 'METHOD_NOT_ALLOWED', 'Deze handeling is niet beschikbaar.');
  let id: string;
  try { id = decodeURIComponent(path.slice('/api/imports/'.length)); }
  catch { return fail(400, 'INVALID_ID', 'Ongeldige importverwijzing.'); }
  return getImport(env, principal, id);
}
