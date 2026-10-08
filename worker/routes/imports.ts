import type { ImportCandidate, ImportDto, ImportStatus } from '../../shared/imports';
import { requirePrincipal, type AuthEnv, type Principal } from '../auth';
import { getSessionAccess, sessionExpiryMillisSql } from '../db';
import { validateImportUrl } from '../imports/processor';

const NO_STORE = { 'Cache-Control': 'no-store, private', Pragma: 'no-cache' };
const MAX_TEXT_CHARS = 50_000;
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
  expiresAt: number | null;
};
function dto(row: ImportRow): ImportDto {
  let candidates: ImportCandidate[] = [];
  let uncertainties: string[] = [];
  try { const parsed: unknown = JSON.parse(row.resultJson); if (Array.isArray(parsed)) candidates = parsed as ImportCandidate[]; } catch { /* migration-safe empty result */ }
  try { const parsed: unknown = JSON.parse(row.uncertaintiesJson); if (Array.isArray(parsed)) uncertainties = parsed.filter(v => typeof v === 'string'); } catch { /* migration-safe */ }
  return {
    id: row.id, sourceKind: row.sourceKind, sourceUrl: row.sourceUrl,
    sourceText: row.sourceKind === 'text' ? row.sourceText : null,
    sourceLabel: row.sourceLabel ?? row.sourceTitle, status: row.status, candidates, uncertainties,
    errorCode: row.errorCode, expiresAt: row.expiresAt, createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

async function createImport(request: Request, env: AuthEnv, principal: Principal, deps: ImportRouteDependencies): Promise<Response> {
  const body = await payload(request);
  if (!body) return fail(400, 'INVALID_BODY', 'Verstuur geldige JSON.');
  const kind = body.type ?? body.sourceKind;
  if (kind === 'upload' || kind === 'photo' || kind === 'image') {
    return fail(400, 'UPLOAD_UNSUPPORTED', 'Foto-import is nog niet beschikbaar. Plak recepttekst of gebruik een ondersteunde HTTPS-link.');
  }
  let sourceKind: 'text' | 'url';
  let sourceText: string | null = null;
  let sourceUrl: string | null = null;
  let sourceLabel: string | null = null;
  if (kind === 'text') {
    if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > MAX_TEXT_CHARS) {
      return fail(400, 'INVALID_TEXT', `Tekst moet 1 tot ${MAX_TEXT_CHARS} tekens bevatten.`);
    }
    sourceKind = 'text'; sourceText = body.text;
  } else if (kind === 'url') {
    if (typeof body.url !== 'string' || body.url.length > 2048) return fail(400, 'INVALID_URL', 'Deze HTTPS-link wordt niet ondersteund.');
    const safeUrl = validateImportUrl(body.url);
    if (!safeUrl) return fail(400, 'INVALID_URL', 'Gebruik een HTTPS-link van Culy of MOB zonder inloggegevens.');
    sourceKind = 'url'; sourceUrl = safeUrl.toString();
    if (body.sourceLabel !== undefined) {
      if (typeof body.sourceLabel !== 'string' || body.sourceLabel.length > MAX_LABEL) return fail(400, 'INVALID_SOURCE_LABEL', 'Ongeldige bronnaam.');
      sourceLabel = body.sourceLabel.trim() || null;
    }
  } else return fail(400, 'INVALID_SOURCE', 'Kies tekst of een ondersteunde HTTPS-link.');

  const now = (deps.now ?? Date.now)();
  const id = crypto.randomUUID();
  await deps.beforeWrite?.();
  // D1.batch is transactional. The outbox INSERT SELECT is tied to the guarded
  // import insert, so a lost session/account race cannot leave an orphan task.
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO imports(id,owner_id,source_kind,source_url,source_text,source_label,status,error_code,expires_at,created_at,updated_at)
      SELECT ?,?,?,?,? ,?,'queued',NULL,?, ?, ? WHERE ${liveSessionSql}`)
      .bind(id, principal.ownerId, sourceKind, sourceUrl, sourceText, sourceLabel, now + 7 * 24 * 60 * 60 * 1000,
        now, now, principal.ownerId, principal.sessionId, now, now, now),
    env.DB.prepare(`INSERT INTO outbox(id,owner_id,task_type,task_id,version,payload_json,status,available_at,created_at,updated_at)
      SELECT ?,owner_id,'import',id,1,'{}','pending',?,?,? FROM imports
      WHERE id=? AND owner_id=? AND status='queued' AND created_at=?`)
      .bind(`outbox:${id}`, now, now, now, id, principal.ownerId, now),
  ]);
  if (results[0]?.meta.changes !== 1) return await accessFailure(env, principal) ?? fail(409, 'IMPORT_CREATE_FAILED', 'Import kon niet worden aangemaakt.');
  if (results[1]?.meta.changes !== 1) return fail(409, 'IMPORT_CREATE_FAILED', 'Import kon niet worden aangemaakt.');
  const row = await env.DB.prepare(`SELECT id,source_kind AS sourceKind,source_url AS sourceUrl,source_text AS sourceText,
      source_label AS sourceLabel,source_title AS sourceTitle,status,result_json AS resultJson,
      uncertainties_json AS uncertaintiesJson,error_code AS errorCode,expires_at AS expiresAt,created_at AS createdAt,updated_at AS updatedAt
    FROM imports WHERE id=? AND owner_id=?`).bind(id, principal.ownerId).first<ImportRow>();
  return json({ import: dto(row!) }, 202);
}

async function getImport(env: AuthEnv, principal: Principal, id: string): Promise<Response> {
  const row = await env.DB.prepare(`SELECT id,source_kind AS sourceKind,source_url AS sourceUrl,source_text AS sourceText,
      source_label AS sourceLabel,source_title AS sourceTitle,status,result_json AS resultJson,
      uncertainties_json AS uncertaintiesJson,error_code AS errorCode,expires_at AS expiresAt,created_at AS createdAt,updated_at AS updatedAt
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
