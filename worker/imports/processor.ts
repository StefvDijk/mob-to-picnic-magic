import type { ImportCandidate } from '../../shared/imports';
import type { AuthEnv } from '../auth';
import { extractRecipeCandidates, textImportResult } from './extract';

const LEASE_MS = 30_000;
const FETCH_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_HOSTS = new Set(['culy.nl', 'www.culy.nl', 'mob.co.uk', 'www.mob.co.uk']);

export interface ImportJobEnv extends AuthEnv {}
export interface ImportFetchDependencies {
  fetch?: typeof fetch;
  now?: () => number;
}

export type ImportTaskOutcome = 'processed' | 'already_done' | 'busy' | 'blocked' | 'missing';
type ImportRow = {
  id: string; ownerId: string; sourceKind: 'text' | 'url' | 'upload'; sourceUrl: string | null;
  sourceText: string | null; status: string; workVersion: number; workToken: string | null;
  workExpiresAt: number | null;
};

export function validateImportUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
      !ALLOWED_HOSTS.has(host) || url.hostname.endsWith('.') || url.href.length > 2048) return null;
    url.hash = '';
    return url;
  } catch { return null; }
}

async function readLimited(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error('IMPORT_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

async function fetchPage(rawUrl: string, fetcher: typeof fetch): Promise<{ html: string; finalUrl: string }> {
  let url = validateImportUrl(rawUrl);
  if (!url) throw new Error('IMPORT_URL_REJECTED');
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort('timeout'), FETCH_MS);
  try {
    for (let redirects = 0; ; redirects++) {
      let response: Response;
      try {
        response = await fetcher(url.toString(), {
          method: 'GET', redirect: 'manual', signal: abort.signal,
          headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'PicnicRecipeImport/1.0' },
        });
      } catch (error) {
        if (abort.signal.aborted) throw new Error('IMPORT_TIMEOUT');
        throw new Error('IMPORT_FETCH_FAILED');
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('Location');
        await response.body?.cancel();
        if (!location || redirects >= 3) throw new Error('IMPORT_REDIRECT_REJECTED');
        const next = validateImportUrl(new URL(location, url).toString());
        if (!next) throw new Error('IMPORT_REDIRECT_REJECTED');
        url = next;
        continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new Error('IMPORT_FETCH_FAILED'); }
      const type = response.headers.get('Content-Type')?.toLowerCase() ?? '';
      if (!(type.includes('text/html') || type.includes('application/xhtml+xml'))) {
        await response.body?.cancel(); throw new Error('IMPORT_UNSUPPORTED_CONTENT');
      }
      return { html: await readLimited(response), finalUrl: url.toString() };
    }
  } catch (error) {
    if (abort.signal.aborted && !(error instanceof Error && error.message === 'IMPORT_TOO_LARGE')) throw new Error('IMPORT_TIMEOUT');
    throw error;
  } finally { clearTimeout(timer); }
}

function safeFailureCode(error: unknown): string {
  const value = error instanceof Error ? error.message : '';
  return ['IMPORT_URL_REJECTED', 'IMPORT_REDIRECT_REJECTED', 'IMPORT_TIMEOUT', 'IMPORT_TOO_LARGE',
    'IMPORT_FETCH_FAILED', 'IMPORT_UNSUPPORTED_CONTENT'].includes(value) ? value : 'IMPORT_FAILED';
}

async function saveResult(env: ImportJobEnv, row: ImportRow, token: string, now: number, input: {
  candidates: ImportCandidate[]; uncertainties: string[]; sourceTitle: string | null; errorCode?: string | null;
}): Promise<boolean> {
  const status = input.errorCode ? 'failed' : 'needs_review';
  const result = await env.DB.prepare(`UPDATE imports SET status=?,result_json=?,uncertainties_json=?,source_title=?,error_code=?,updated_at=?,
      work_token=NULL,work_expires_at=NULL
    WHERE id=? AND owner_id=? AND work_token=? AND work_version=? AND work_expires_at>? AND status='running'
      AND EXISTS(SELECT 1 FROM app_accounts a WHERE a.id=imports.owner_id AND a.status='active')`)
    .bind(status, JSON.stringify(input.candidates), JSON.stringify(input.uncertainties), input.sourceTitle, input.errorCode ?? null, now,
      row.id, row.ownerId, token, row.workVersion, now).run();
  return result.meta.changes === 1;
}

/** Durable, idempotent outbox consumer. It never invokes an AI provider. */
export async function processImportTask(
  env: ImportJobEnv, importId: string, version = 1, deps: ImportFetchDependencies = {},
): Promise<ImportTaskOutcome> {
  const now = (deps.now ?? Date.now)();
  const token = crypto.randomUUID();
  const claimed = await env.DB.prepare(`UPDATE imports SET status='running',work_token=?,work_expires_at=?,updated_at=?
    WHERE id=? AND work_version=? AND source_kind IN ('text','url')
      AND (status='queued' OR (status='running' AND COALESCE(work_expires_at,0)<=?))
      AND EXISTS(SELECT 1 FROM app_accounts a WHERE a.id=imports.owner_id AND a.status='active')`)
    .bind(token, now + LEASE_MS, now, importId, version, now).run();
  if (claimed.meta.changes !== 1) {
    const row = await env.DB.prepare(`SELECT i.status,a.status AS accountStatus FROM imports i
      JOIN app_accounts a ON a.id=i.owner_id WHERE i.id=?`).bind(importId).first<{status:string;accountStatus:string}>();
    if (!row) return 'missing';
    if (row.accountStatus !== 'active') return 'blocked';
    return row.status === 'queued' || row.status === 'running' ? 'busy' : 'already_done';
  }
  const row = await env.DB.prepare(`SELECT id,owner_id AS ownerId,source_kind AS sourceKind,source_url AS sourceUrl,
      source_text AS sourceText,status,work_version AS workVersion,work_token AS workToken,work_expires_at AS workExpiresAt
    FROM imports WHERE id=?`).bind(importId).first<ImportRow>();
  if (!row || row.workToken !== token) return 'busy';
  try {
    if (row.sourceKind === 'text') {
      const parsed = textImportResult(row.sourceText ?? '');
      const saved = await saveResult(env, row, token, (deps.now ?? Date.now)(), { ...parsed, sourceTitle: null });
      if (!saved) return 'busy';
    } else if (row.sourceKind === 'url' && row.sourceUrl) {
      const { html, finalUrl } = await fetchPage(row.sourceUrl, deps.fetch ?? fetch);
      const extracted = extractRecipeCandidates(html, finalUrl);
      const candidates = extracted.candidates;
      const sourceTitle = candidates.find(item => item.sourceTitle)?.sourceTitle ?? null;
      const saved = await saveResult(env, row, token, (deps.now ?? Date.now)(), {
        candidates, sourceTitle,
        uncertainties: [...extracted.uncertainties, ...(candidates.length ? [] : ['structured_recipe_not_found'])],
        errorCode: extracted.paywalled ? 'IMPORT_PAYWALLED' : extracted.tooComplex ? 'IMPORT_TOO_COMPLEX' : null,
      });
      if (!saved) return 'busy';
    } else {
      const saved = await saveResult(env, row, token, (deps.now ?? Date.now)(), {
        candidates: [], uncertainties: [], sourceTitle: null, errorCode: 'UPLOAD_UNSUPPORTED',
      });
      if (!saved) return 'busy';
    }
  } catch (error) {
    const saved = await saveResult(env, row, token, (deps.now ?? Date.now)(), {
      candidates: [], uncertainties: [], sourceTitle: null, errorCode: safeFailureCode(error),
    });
    if (!saved) return 'busy';
  }
  return 'processed';
}
