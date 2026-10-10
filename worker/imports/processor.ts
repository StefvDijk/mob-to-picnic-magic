import dns from 'node:dns';
import { SHOPPING_RESERVE_MS } from '../../shared/workflow';
import { beforeDeadline } from './deadline';
import { normalizeStructuredCandidates } from './structured';
import type { ImportCandidate } from '../../shared/imports';
import type { AuthEnv } from '../auth';
import { extractRecipeCandidates, textImportResult } from './extract';
import { createAiAttempt, type AiEnv } from './ai';

const LEASE_MS = 30_000;
const FETCH_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;
const RESERVED_HOST_SUFFIXES = [
  'localhost', 'local', 'localdomain', 'internal', 'intranet', 'lan', 'test', 'example', 'invalid', 'onion', 'arpa', 'home.arpa',
  // These public wildcard DNS services map host labels to arbitrary IPs.
  'nip.io', 'sslip.io', 'xip.io',
];

export type ImportJobEnv = AiEnv;
export interface ImportDnsResolver {
  /** Address RDATA only. The runtime adapter removes validated CNAME targets first. */
  resolve4(hostname: string): Promise<string[]>;
  resolve6(hostname: string): Promise<string[]>;
}
export interface ImportFetchDependencies {
  fetch?: typeof fetch;
  resolveDns?: ImportDnsResolver;
  now?: () => number;
}

const runtimeDnsResolver: ImportDnsResolver = {
  resolve4: async hostname => normalizeRuntimeDnsAnswers(await dns.promises.resolve4(hostname), 4),
  resolve6: async hostname => normalizeRuntimeDnsAnswers(await dns.promises.resolve6(hostname), 6),
};

export type ImportTaskOutcome = 'processed' | 'already_done' | 'busy' | 'blocked' | 'missing';
type ImportRow = {
  id: string; ownerId: string; sourceKind: 'text' | 'url' | 'upload'; sourceUrl: string | null;
  sourceText: string | null; status: string; workVersion: number; workToken: string | null;
  deadlineAt: number | null; workExpiresAt: number | null;
};

function sourceFromCandidates(candidates: ImportCandidate[]): string {
  const lines: string[] = [];
  for (const candidate of candidates) {
    if (candidate.title) lines.push(candidate.title);
    if (candidate.baseServings) lines.push(`Servings: ${candidate.baseServings}`);
    for (const ingredient of candidate.ingredients) lines.push(ingredient.section ? `${ingredient.section}: ${ingredient.originalText}` : ingredient.originalText);
    lines.push(...candidate.steps);
  }
  return lines.join('\n').slice(0, 50_000);
}

export function readablePageText(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|svg|template|nav|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/[\t\r ]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, 50_000);
}

export function validateImportUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const unbracketedHost = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
      url.hostname.endsWith('.') || url.href.length > 2048 || !isPublicDnsHostname(host) ||
      // Workers fetches require hostnames. Reject IP literals (including normalized legacy IPv4 forms)
      // and bracketed IPv6 literals before any outbound request is made.
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(unbracketedHost) || host.startsWith('[') ||
      RESERVED_HOST_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`))) return null;
    url.hash = '';
    return url;
  } catch { return null; }
}

function isPublicDnsHostname(hostname: string): boolean {
  if (hostname.length > 253 || hostname.endsWith('.') || !hostname.includes('.')) return false;
  const labels = hostname.split('.');
  return labels.length >= 2 && labels.every(label => label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) &&
    !/^\d+(?:\.\d+){3}$/.test(hostname) &&
    !RESERVED_HOST_SUFFIXES.some(suffix => hostname === suffix || hostname.endsWith(`.${suffix}`));
}

function ipv4Octets(address: string): number[] | null {
  if (!/^[0-9]{1,3}(?:\.[0-9]{1,3}){3}$/.test(address)) return null;
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return null;
  return octets;
}

function isPublicIpv4(address: string): boolean {
  const octets = ipv4Octets(address);
  if (!octets) return false;
  const [a, b, c] = octets;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 && (c === 0 || c === 2) || b === 88 && c === 99)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) ||
    (a === 203 && b === 0 && c === 113));
}

function isIpv6Address(address: string): boolean {
  if (!/^[0-9a-fA-F:.]+$/.test(address)) return false;
  try { return new URL(`https://[${address}]/`).hostname.startsWith('['); }
  catch { return false; }
}

function isPublicIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split('%', 1)[0];
  if (normalized.includes('.')) return false;
  const [left, right, extra] = normalized.split('::');
  if (extra !== undefined) return false;
  const leftWords = left ? left.split(':') : [];
  const rightWords = right ? right.split(':') : [];
  const missing = 8 - leftWords.length - rightWords.length;
  if (normalized.includes('::') ? missing < 1 : missing !== 0) return false;
  const words = [...leftWords, ...Array(missing).fill('0'), ...rightWords].map(word => Number.parseInt(word, 16));
  if (words.length !== 8 || words.some(word => !Number.isInteger(word) || word < 0 || word > 0xffff)) return false;
  // IPv6 global unicast is 2000::/3. Exclude IANA special-use, 6to4, and documentation ranges.
  if ((words[0] & 0xe000) !== 0x2000 || words[0] === 0x2001 && (words[1] <= 0x01ff || words[1] === 0x0db8) ||
    words[0] === 0x2002 || words[0] === 0x3fff && words[1] <= 0x0fff || words[0] === 0x5f00 ||
    words[0] === 0x0064 && words[1] === 0xff9b) return false;
  return true;
}

function absentDnsRecord(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error &&
    ((error as { code?: unknown }).code === 'ENODATA' || (error as { code?: unknown }).code === 'ENOTFOUND');
}

async function lookupFamily(lookup: () => Promise<string[]>): Promise<string[]> {
  try { return await lookup(); }
  catch (error) {
    if (absentDnsRecord(error)) return [];
    throw error;
  }
}

export function normalizeRuntimeDnsAnswers(records: string[], family: 4 | 6): string[] {
  const addresses: string[] = [];
  for (const value of records) {
    if (family === 4 && ipv4Octets(value)) { addresses.push(value); continue; }
    if (family === 6 && isIpv6Address(value)) { addresses.push(value); continue; }
    // Workers' node:dns DoH resolver includes canonical CNAME targets in resolve4/resolve6 results.
    // They are not addresses; accept only strict absolute public DNS names and keep address RDATA intact.
    if (value.endsWith('.') && isPublicDnsHostname(value.slice(0, -1).toLowerCase())) continue;
    throw new Error('IMPORT_DNS_INVALID');
  }
  return addresses;
}

async function resolvePublicHostname(hostname: string, resolver: ImportDnsResolver, signal: AbortSignal): Promise<void> {
  let removeAbortListener: () => void = () => {};
  const timedOut = new Promise<never>((_resolve, reject) => {
    const onAbort = () => reject(new Error('IMPORT_TIMEOUT'));
    if (signal.aborted) onAbort();
    else {
      signal.addEventListener('abort', onAbort, { once: true });
      removeAbortListener = () => signal.removeEventListener('abort', onAbort);
    }
  });
  const answers = Promise.all([
    lookupFamily(() => resolver.resolve4(hostname)),
    lookupFamily(() => resolver.resolve6(hostname)),
  ]);
  let addresses: string[][];
  try { addresses = await Promise.race([answers, timedOut]); }
  finally { removeAbortListener(); }
  if (addresses[0].some(address => !isPublicIpv4(address)) || addresses[1].some(address => !isPublicIpv6(address))) {
    throw new Error('IMPORT_UNSAFE_ADDRESS');
  }
  if (addresses.flat().length === 0) throw new Error('IMPORT_DNS_FAILED');
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

async function fetchPage(
  rawUrl: string, fetcher: typeof fetch, timeoutMs = FETCH_MS, resolver: ImportDnsResolver = runtimeDnsResolver,
): Promise<{ html: string; finalUrl: string }> {
  let url = validateImportUrl(rawUrl);
  if (!url) throw new Error('IMPORT_URL_REJECTED');
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort('timeout'), timeoutMs);
  try {
    for (let redirects = 0; ; redirects++) {
      try { await resolvePublicHostname(url.hostname, resolver, abort.signal); }
      catch (error) {
        if (error instanceof Error && error.message === 'IMPORT_TIMEOUT') throw error;
        if (error instanceof Error && error.message === 'IMPORT_UNSAFE_ADDRESS') {
          throw new Error(redirects === 0 ? 'IMPORT_URL_REJECTED' : 'IMPORT_REDIRECT_REJECTED');
        }
        throw new Error('IMPORT_FETCH_FAILED');
      }
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
        let redirectedUrl: string;
        try { redirectedUrl = new URL(location, url).toString(); }
        catch { throw new Error('IMPORT_REDIRECT_REJECTED'); }
        const next = validateImportUrl(redirectedUrl);
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
    'IMPORT_FETCH_FAILED', 'IMPORT_UNSUPPORTED_CONTENT', 'WORKFLOW_TIMEOUT'].includes(value) ? value : 'IMPORT_FAILED';
}

async function saveResult(env: ImportJobEnv, row: ImportRow, token: string, now: number, input: {
  candidates: ImportCandidate[]; uncertainties: string[]; sourceTitle: string | null; errorCode?: string | null;
}): Promise<boolean> {
  const status = input.errorCode ? 'failed' : 'needs_review';
  const result = await env.DB.prepare(`UPDATE imports SET status=?,result_json=?,uncertainties_json=?,source_title=?,error_code=?,updated_at=?,
      work_token=NULL,work_expires_at=NULL
    WHERE id=? AND owner_id=? AND work_token=? AND work_version=? AND work_expires_at>? AND status='running'
      AND COALESCE(expires_at,created_at+604800000)>?
      AND EXISTS(SELECT 1 FROM app_accounts a WHERE a.id=imports.owner_id AND a.status='active')`)
    .bind(status, JSON.stringify(input.candidates), JSON.stringify(input.uncertainties), input.sourceTitle, input.errorCode ?? null,
      now, row.id, row.ownerId, token, row.workVersion, now, now).run();
  return result.meta.changes === 1;
}

/** Durable, idempotent outbox consumer. It never invokes an AI provider. */
export async function processImportTask(
  env: ImportJobEnv, importId: string, version = 1, deps: ImportFetchDependencies = {},
): Promise<ImportTaskOutcome> {
  const now = (deps.now ?? Date.now)();
  const token = crypto.randomUUID();
  const claimed = await env.DB.prepare(`UPDATE imports SET status='running',work_token=?,work_expires_at=?,updated_at=?
    WHERE id=? AND work_version=? AND source_kind IN ('text','url','upload')
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
      source_text AS sourceText,workflow_deadline_at AS deadlineAt,status,work_version AS workVersion,work_token AS workToken,work_expires_at AS workExpiresAt
    FROM imports WHERE id=?`).bind(importId).first<ImportRow>();
  if (!row || row.workToken !== token) return 'busy';
  const recognitionDeadline = row.deadlineAt === null ? null : row.deadlineAt - SHOPPING_RESERVE_MS;
  const clock = deps.now ?? Date.now;
  const checkDeadline = () => { if (recognitionDeadline !== null && clock() >= recognitionDeadline) throw new Error('WORKFLOW_TIMEOUT'); };
  try {
    checkDeadline();
    if (row.sourceKind === 'text') {
      const parsed = textImportResult(row.sourceText ?? '');
      const saved = await saveResult(env, row, token, (deps.now ?? Date.now)(), { ...parsed, sourceTitle: null });
      if (!saved) return 'busy';
    } else if (row.sourceKind === 'url' && row.sourceUrl) {
      const load = () => fetchPage(row.sourceUrl!,deps.fetch ?? fetch,recognitionDeadline === null ? FETCH_MS : Math.min(FETCH_MS,recognitionDeadline-clock()),deps.resolveDns ?? runtimeDnsResolver);
      const {html,finalUrl} = recognitionDeadline === null ? await load() : await beforeDeadline(recognitionDeadline,load,clock);
      checkDeadline();
      const extracted = extractRecipeCandidates(html, finalUrl);
      const normalized = normalizeStructuredCandidates(extracted.candidates);
      const candidates = normalized ?? extracted.candidates;
      console.info('workflow_stage',{importId:row.id,stage:'extract',route:normalized ? 'structured' : 'model',durationMs:Math.max(0,clock()-now),remainingMs:row.deadlineAt===null ? null : Math.max(0,row.deadlineAt-clock())});
      const sourceTitle = candidates.find(item => item.sourceTitle)?.sourceTitle ?? null;
      const source = candidates.length ? sourceFromCandidates(candidates) : readablePageText(html);
      const saved = await saveResult(env, row, token, (deps.now ?? Date.now)(), {
        candidates, sourceTitle,
        uncertainties: [...extracted.uncertainties, ...(candidates.length ? [] : ['structured_recipe_not_found'])],
        errorCode: extracted.paywalled ? 'IMPORT_PAYWALLED' : extracted.tooComplex ? 'IMPORT_TOO_COMPLEX' : null,
      });
      if (!saved) return 'busy';
      if (!normalized && !extracted.paywalled && !extracted.tooComplex) {
        if (source) await createAiAttempt(env, row.id, (deps.now ?? Date.now)(), source, candidates.length === 1 ? candidates[0] : undefined);
      }
    } else {
      const saved = await saveResult(env, row, token, (deps.now ?? Date.now)(), {
        candidates: [], uncertainties: ['recognition_pending'], sourceTitle: null,
      });
      if (!saved) return 'busy';
      await createAiAttempt(env, row.id, (deps.now ?? Date.now)());
    }
  } catch (error) {
    const saved = await saveResult(env, row, token, (deps.now ?? Date.now)(), {
      candidates: [], uncertainties: [], sourceTitle: null, errorCode: recognitionDeadline !== null && clock() >= recognitionDeadline ? 'WORKFLOW_TIMEOUT' : safeFailureCode(error),
    });
    if (!saved) return 'busy';
  }
  return 'processed';
}
