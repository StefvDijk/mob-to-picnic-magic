import { requirePrincipal, type AuthEnv, type Principal } from '../auth';
import { formatRational, parseQuantity, parseRational, type Quantity } from '../../shared/quantities';
import type { RecipeDto, RecipeIngredientDto } from '../../shared/recipes';
import type { ImportCandidate } from '../../shared/imports';
import { getSessionAccess, sessionExpiryMillisSql } from '../db';

const NO_STORE = { 'Cache-Control': 'no-store, private', Pragma: 'no-cache' };
const MAX_INGREDIENTS = 200;
const MAX_UPLOADS = 8;
const MAX_STEPS = 100;

type IngredientInput = Omit<RecipeIngredientDto, 'id' | 'ordinal'>;
export interface RecipeRouteDependencies {
  /** Optional deterministic seam for exercising state changes between auth and the write transaction. */
  beforeWrite?: (kind: 'create' | 'update' | 'delete' | 'delete-source') => Promise<void>;
  now?: () => number;
}
const liveSessionSql = `EXISTS(SELECT 1 FROM app_accounts a
  JOIN session_metadata sm ON sm.owner_id=a.id
  JOIN session s ON s.id=sm.session_id AND s.userId=sm.owner_id
  WHERE a.id=? AND sm.session_id=? AND a.status='active' AND sm.revoked_at IS NULL
    AND sm.authenticated_at+2592000000>? AND sm.last_activity_at+1209600000>?
    AND (${sessionExpiryMillisSql})>?)`;
function sessionArgs(principal: Principal, now: number) {
  return [principal.ownerId, principal.sessionId, now, now, now] as const;
}
async function accessFailure(env: AuthEnv, principal: Principal): Promise<Response | null> {
  const access = await getSessionAccess(env.DB, principal.ownerId, principal.sessionId, Date.now());
  if (access.success) return null;
  return access.reason === 'blocked' ? fail(403, 'FORBIDDEN', 'Geen toegang.')
    : fail(401, 'UNAUTHENTICATED', 'Log opnieuw in.');
}
type RecipeInput = {
  title: string; sourceLabel: string | null; sourceUrl: string | null; baseServings: string | null;
  steps: string[]; ingredients: IngredientInput[]; uploads: string[];
};
type RecipeRow = {
  id: string; title: string; sourceLabel: string | null; sourceUrl: string | null;
  baseServingsNum: number | null; baseServingsDen: number; version: number;
  stepsJson: string; createdAt: number; updatedAt: number;
};
type RecipeSourceRow = {
  sourceKind: 'text' | 'url' | 'upload'; sourceLabel: string | null; sourceUrl: string | null;
  sourceText: string | null; selectedCandidateJson: string | null; importedAt: number;
};
type ImportSourceRow = {
  id: string; sourceKind: 'text' | 'url' | 'upload'; sourceLabel: string | null; sourceTitle: string | null;
  sourceUrl: string | null; sourceText: string | null; status: string; resultJson: string;
  expiresAt: number | null; createdAt: number;
};
type IngredientRow = {
  id: string; ordinal: number; section: string | null; originalText: string; normalizedName: string | null;
  quantityKind: 'exact' | 'range' | 'global' | 'unknown'; quantityNum: number | null; quantityDen: number;
  quantityMaxNum: number | null; unit: 'g' | 'kg' | 'ml' | 'l' | 'piece' | null; sourceOrigin: IngredientInput['sourceOrigin'];
  attributesJson: string; uncertaintyJson: string;
};

function fail(status: number, code: string, message: string, fields?: Record<string, string>): Response {
  return Response.json({ error: { code, message, ...(fields ? { fields } : {}) } }, { status, headers: NO_STORE });
}
function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: NO_STORE });
}
function requireOrigin(request: Request, env: AuthEnv): Response | null {
  if (request.headers.get('Origin') !== env.APP_ORIGIN) return fail(403, 'ORIGIN_DENIED', 'Dit verzoek is niet toegestaan.');
  if (request.method !== 'DELETE' && request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return fail(400, 'INVALID_CONTENT_TYPE', 'Verstuur geldige JSON.');
  }
  return null;
}
async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}
function text(value: unknown, max: number, optional = false): string | null | undefined {
  if (value === null || value === undefined || value === '') return optional ? null : undefined;
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) return undefined;
  return value.trim();
}
function stringList(value: unknown, maxItems: number, maxLength: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim().length === 0 || entry.length > maxLength) return null;
    result.push(entry.trim());
  }
  return result;
}
function sourceUrl(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined;
  } catch { return undefined; }
}
function parseInput(body: Record<string, unknown>, withUploads: boolean): RecipeInput | null {
  const title = text(body.title, 200);
  const sourceLabel = text(body.sourceLabel, 200, true);
  const url = sourceUrl(body.sourceUrl);
  const servingsRaw = body.baseServings;
  const baseServings = servingsRaw === null || servingsRaw === undefined || servingsRaw === '' ? null
    : typeof servingsRaw === 'string' && parseRational(servingsRaw) && parseRational(servingsRaw)!.numerator > 0
      ? formatRational(parseRational(servingsRaw)!) : undefined;
  const steps = stringList(body.steps, MAX_STEPS, 4000);
  const uploads = withUploads ? body.uploads : [];
  if (!title || sourceLabel === undefined || url === undefined || baseServings === undefined || !steps ||
      !Array.isArray(body.ingredients) || body.ingredients.length > MAX_INGREDIENTS || !Array.isArray(uploads) || uploads.length > MAX_UPLOADS ||
      !uploads.every(id => typeof id === 'string' && id.length > 0 && id.length <= 100) || new Set(uploads).size !== uploads.length) return null;
  const ingredients: IngredientInput[] = [];
  for (const raw of body.ingredients) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    const section = text(item.section, 200, true);
    const originalText = text(item.originalText, 1000);
    const normalizedName = text(item.normalizedName, 200, true);
    const quantity = parseQuantity(item.quantity);
    const sourceOrigin = item.sourceOrigin === null || item.sourceOrigin === undefined ? null
      : ['user', 'parser', 'ai', 'estimate'].includes(String(item.sourceOrigin)) ? item.sourceOrigin as IngredientInput['sourceOrigin'] : undefined;
    const attributes = item.attributes === undefined ? {} : item.attributes;
    const uncertainty = item.uncertainty === undefined ? [] : stringList(item.uncertainty, 20, 100);
    if (section === undefined || !originalText || normalizedName === undefined || !quantity || sourceOrigin === undefined ||
        !attributes || typeof attributes !== 'object' || Array.isArray(attributes) || !uncertainty) return null;
    if (Object.hasOwn(attributes, 'quantityBasis') || !quantityToColumns(quantity)) return null;
    let attributesJson: string;
    try { attributesJson = JSON.stringify(attributes); } catch { return null; }
    if (attributesJson.length > 8000) return null;
    ingredients.push({ section, originalText, normalizedName, quantity, sourceOrigin,
      attributes: attributes as Record<string, unknown>, uncertainty });
  }
  return { title, sourceLabel, sourceUrl: url, baseServings, steps, ingredients, uploads: uploads as string[] };
}
function quantityToColumns(quantity: Quantity): { kind: string; num: number | null; den: number; max: number | null; unit: string | null } | null {
  const amount = quantity.amount ? parseRational(quantity.amount)! : null;
  const maximum = quantity.maximum ? parseRational(quantity.maximum)! : null;
  if (amount && maximum) {
    const a = BigInt(amount.denominator), b = BigInt(maximum.denominator);
    const gcd = (x: bigint, y: bigint): bigint => { while (y) [x, y] = [y, x % y]; return x; };
    const den = a / gcd(a, b) * b;
    const num = BigInt(amount.numerator) * (den / a);
    const max = BigInt(maximum.numerator) * (den / b);
    if (den > BigInt(Number.MAX_SAFE_INTEGER) || num > BigInt(Number.MAX_SAFE_INTEGER) || max > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return { kind: quantity.kind, num: Number(num), den: Number(den), max: Number(max), unit: quantity.unit ?? null };
  }
  if (amount) return { kind: quantity.kind, num: amount.numerator, den: amount.denominator, max: null, unit: quantity.unit ?? null };
  return { kind: quantity.kind, num: null, den: 1, max: null, unit: null };
}
function rowQuantity(row: IngredientRow): Quantity {
  const attributes = safeObject(row.attributesJson);
  const basis = attributes.quantityBasis === 'net' || attributes.quantityBasis === 'drained' ? attributes.quantityBasis : null;
  if (row.quantityKind === 'global' || row.quantityKind === 'unknown') return { kind: row.quantityKind, basis };
  return { kind: row.quantityKind, amount: formatRational({ numerator: row.quantityNum ?? 0, denominator: row.quantityDen }),
    ...(row.quantityKind === 'range' ? { maximum: formatRational({ numerator: row.quantityMaxNum ?? 0, denominator: row.quantityDen }) } : {}),
    unit: row.unit ?? undefined, basis };
}
function safeArray(raw: string): string[] { try { const v: unknown = JSON.parse(raw); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; } catch { return []; } }
function safeObject(raw: string): Record<string, unknown> { try { const v: unknown = JSON.parse(raw); return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}; } catch { return {}; } }
function publicAttributes(raw: string): Record<string, unknown> {
  const { quantityBasis: _basis, ...attributes } = safeObject(raw);
  return attributes;
}
export async function loadRecipe(env: AuthEnv, ownerId: string, id: string, includeSource = true): Promise<RecipeDto | null> {
  const row = await env.DB.prepare(`SELECT id,title,source_label AS sourceLabel,source_url AS sourceUrl,
    base_servings_num AS baseServingsNum,base_servings_den AS baseServingsDen,version,steps_json AS stepsJson,
    created_at AS createdAt,updated_at AS updatedAt FROM recipes WHERE owner_id=? AND id=? AND deleted_at IS NULL`)
    .bind(ownerId, id).first<RecipeRow>();
  if (!row) return null;
  const [ingredients, uploads, source] = await Promise.all([
    env.DB.prepare(`SELECT id,ordinal,section,original_text AS originalText,normalized_name AS normalizedName,
      quantity_kind AS quantityKind,quantity_num AS quantityNum,quantity_den AS quantityDen,
      quantity_max_num AS quantityMaxNum,unit,source_origin AS sourceOrigin,attributes_json AS attributesJson,
      uncertainty_json AS uncertaintyJson FROM ingredients WHERE owner_id=? AND recipe_id=? AND retired_at IS NULL ORDER BY ordinal`)
      .bind(ownerId, id).all<IngredientRow>(),
    env.DB.prepare(`SELECT ru.upload_id AS id FROM recipe_uploads ru JOIN uploads u ON u.owner_id=ru.owner_id AND u.id=ru.upload_id
      WHERE ru.owner_id=? AND ru.recipe_id=? AND u.status='stored' ORDER BY ru.upload_id`).bind(ownerId, id).all<{ id: string }>(),
    includeSource ? env.DB.prepare(`SELECT source_kind AS sourceKind,source_label AS sourceLabel,source_url AS sourceUrl,
      source_text AS sourceText,selected_candidate_json AS selectedCandidateJson,imported_at AS importedAt
      FROM recipe_sources WHERE owner_id=? AND recipe_id=?`).bind(ownerId, id).first<RecipeSourceRow>() : Promise.resolve(null),
  ]);
  return { id: row.id, title: row.title, sourceLabel: row.sourceLabel, sourceUrl: row.sourceUrl,
    baseServings: row.baseServingsNum === null ? null : formatRational({ numerator: row.baseServingsNum, denominator: row.baseServingsDen }),
    version: row.version, steps: safeArray(row.stepsJson),
    ingredients: ingredients.results.map(ingredient => ({ id: ingredient.id, ordinal: ingredient.ordinal,
      section: ingredient.section, originalText: ingredient.originalText, normalizedName: ingredient.normalizedName,
      quantity: rowQuantity(ingredient), sourceOrigin: ingredient.sourceOrigin, attributes: publicAttributes(ingredient.attributesJson),
      uncertainty: safeArray(ingredient.uncertaintyJson) })),
    uploads: uploads.results, ...(includeSource ? { sourceSnapshot: source ? {
      kind: source.sourceKind, sourceLabel: source.sourceLabel, sourceUrl: source.sourceUrl,
      sourceText: source.sourceText,
      selectedCandidate: parseCandidate(source.selectedCandidateJson), importedAt: source.importedAt,
    } : null } : {}), createdAt: row.createdAt, updatedAt: row.updatedAt };
}
function parseCandidate(raw: string | null): ImportCandidate | null {
  if (!raw) return null;
  try { const value: unknown = JSON.parse(raw); return value && typeof value === 'object' && !Array.isArray(value) ? value as ImportCandidate : null; }
  catch { return null; }
}
async function uploadsAreOwnedAndStored(env: AuthEnv, ownerId: string, ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  const placeholders = ids.map(() => '?').join(',');
  const rows = await env.DB.prepare(`SELECT id FROM uploads WHERE owner_id=? AND status='stored' AND id IN (${placeholders})`)
    .bind(ownerId, ...ids).all<{ id: string }>();
  return rows.results.length === ids.length;
}
function insertIngredient(env: AuthEnv, ownerId: string, recipeId: string, item: IngredientInput, ordinal: number, now: number) {
  const columns = quantityToColumns(item.quantity);
  if (!columns) throw new RangeError('Quantity is not representable in the database');
  const attributes = { ...item.attributes, ...(item.quantity.basis ? { quantityBasis: item.quantity.basis } : {}) };
  return env.DB.prepare(`INSERT INTO ingredients(id,owner_id,recipe_id,ordinal,section,original_text,normalized_name,quantity_kind,
    quantity_num,quantity_den,quantity_max_num,unit,source_origin,attributes_json,uncertainty_json,created_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM recipes r JOIN app_accounts a ON a.id=r.owner_id
      WHERE r.owner_id=? AND r.id=? AND r.deleted_at IS NULL AND a.status='active')`).bind(crypto.randomUUID(), ownerId, recipeId, ordinal, item.section,
    item.originalText, item.normalizedName, columns.kind, columns.num, columns.den, columns.max, columns.unit,
    item.sourceOrigin, JSON.stringify(attributes), JSON.stringify(item.uncertainty), now, ownerId, recipeId);
}
function servingsColumns(value: string | null): { num: number | null; den: number } {
  const rational = value ? parseRational(value)! : null;
  return { num: rational?.numerator ?? null, den: rational?.denominator ?? 1 };
}
function parseImportSource(value: unknown): { importId: string; candidateIndex: number | null } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.importId !== 'string' || !input.importId.trim() || input.importId.length > 100 ||
      !(input.candidateIndex === null || (Number.isSafeInteger(input.candidateIndex) && (input.candidateIndex as number) >= 0 && (input.candidateIndex as number) <= 29))) return null;
  return { importId: input.importId, candidateIndex: input.candidateIndex as number | null };
}
function candidateAt(raw: string, index: number): ImportCandidate | null {
  try {
    const candidates: unknown = JSON.parse(raw);
    if (!Array.isArray(candidates)) return null;
    const candidate = candidates[index];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const item = candidate as Record<string, unknown>;
    const nullableText = (value: unknown) => value === null || typeof value === 'string';
    if (!nullableText(item.title) || !nullableText(item.sourceTitle) || !nullableText(item.sourceUrl) ||
        !nullableText(item.baseServings) || !Array.isArray(item.sections) || !item.sections.every(x => typeof x === 'string') ||
        !Array.isArray(item.steps) || !item.steps.every(x => typeof x === 'string') ||
        !Array.isArray(item.uncertainty) || !item.uncertainty.every(x => typeof x === 'string') || !Array.isArray(item.ingredients) ||
        !item.ingredients.every(entry => !!entry && typeof entry === 'object' && !Array.isArray(entry) &&
          nullableText((entry as Record<string, unknown>).section) && typeof (entry as Record<string, unknown>).originalText === 'string')) return null;
    return candidate as ImportCandidate;
  } catch { return null; }
}
async function validateImportSource(env: AuthEnv, ownerId: string, source: { importId: string; candidateIndex: number | null }, now: number): Promise<{ row: ImportSourceRow; candidate: ImportCandidate | null } | Response> {
  const row = await env.DB.prepare(`SELECT id,source_kind AS sourceKind,source_label AS sourceLabel,source_title AS sourceTitle,
    source_url AS sourceUrl,source_text AS sourceText,status,result_json AS resultJson,expires_at AS expiresAt,created_at AS createdAt
    FROM imports WHERE id=? AND owner_id=?`).bind(source.importId, ownerId).first<ImportSourceRow>();
  if (!row) return fail(404, 'IMPORT_NOT_FOUND', 'Import niet gevonden.');
  if (row.status === 'expired' || row.expiresAt === null || row.expiresAt <= now) return fail(409, 'IMPORT_EXPIRED', 'Deze import is verlopen.');
  if (row.status === 'queued' || row.status === 'running') return fail(409, 'IMPORT_NOT_READY', 'Deze import is nog niet klaar.');
  if (source.candidateIndex === null) {
    if (!['needs_review', 'failed', 'saved'].includes(row.status)) return fail(400, 'INVALID_IMPORT_CANDIDATE', 'Kies een geldig importresultaat.');
    return { row, candidate: null };
  }
  if (!['needs_review', 'saved'].includes(row.status)) return fail(400, 'INVALID_IMPORT_CANDIDATE', 'Kies een geldig importresultaat.');
  const candidate = candidateAt(row.resultJson, source.candidateIndex);
  if (!candidate) return fail(400, 'INVALID_IMPORT_CANDIDATE', 'Kies een geldig importresultaat.');
  return { row, candidate };
}
async function createRecipe(request: Request, env: AuthEnv, principal: Principal, deps: RecipeRouteDependencies): Promise<Response> {
  const body = await readBody(request);
  const input = body && parseInput(body, true);
  if (!input) return fail(400, 'INVALID_RECIPE', 'Controleer de receptgegevens.');
  const hasImportSource = !!body && Object.prototype.hasOwnProperty.call(body, 'importSource');
  const importSource = hasImportSource ? parseImportSource(body!.importSource) : null;
  if (hasImportSource && !importSource) return fail(400, 'INVALID_IMPORT_SOURCE', 'Ongeldige importverwijzing.');
  // Automatic import adoption has a deterministic owner-scoped ID. Replays and concurrent
  // effects return the same saved recipe, even if the original import has since expired.
  const automatic = body?.autoSave === true;
  if (automatic && (!importSource || importSource.candidateIndex === null)) return fail(400, 'INVALID_IMPORT_SOURCE', 'Kies een herkend recept.');
  const autoId = automatic ? 'import-' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(JSON.stringify([principal.ownerId, importSource!.importId, importSource!.candidateIndex])))))
    .map(byte => byte.toString(16).padStart(2, '0')).join('') : null;
  if (autoId) {
    const prior = await env.DB.prepare(`SELECT rs.recipe_id AS id FROM recipe_sources rs JOIN recipes r ON r.owner_id=rs.owner_id AND r.id=rs.recipe_id
      WHERE rs.owner_id=? AND rs.import_id=? AND rs.candidate_index=? AND r.deleted_at IS NULL LIMIT 1`)
      .bind(principal.ownerId, importSource!.importId, importSource!.candidateIndex).first<{ id: string }>();
    const saved = await loadRecipe(env, principal.ownerId, prior?.id ?? autoId);
    if (saved) return json({ recipe: saved });
  }
  let now = (deps.now ?? Date.now)();
  const validatedSource = importSource ? await validateImportSource(env, principal.ownerId, importSource, now) : null;
  if (validatedSource instanceof Response) return validatedSource;
  if (!(await uploadsAreOwnedAndStored(env, principal.ownerId, input.uploads))) return fail(400, 'INVALID_UPLOAD', 'Een bronafbeelding is niet beschikbaar.');
  await deps.beforeWrite?.('create');
  now = (deps.now ?? Date.now)();
  const freshSource = importSource ? await validateImportSource(env, principal.ownerId, importSource, now) : null;
  if (freshSource instanceof Response) return freshSource;
  const id = autoId ?? crypto.randomUUID();
  const servings = servingsColumns(input.baseServings);
  const sourceStatement = validatedSource && importSource ? env.DB.prepare(`INSERT INTO recipe_sources(owner_id,recipe_id,import_id,candidate_index,source_kind,source_label,source_url,source_text,selected_candidate_json,imported_at)
    SELECT ?,?,i.id,?,i.source_kind,COALESCE(i.source_label,i.source_title),i.source_url,
      CASE WHEN i.source_kind='text' THEN i.source_text ELSE NULL END,
      CASE WHEN ? IS NULL THEN NULL ELSE json_extract(i.result_json,'$['||CAST(? AS INTEGER)||']') END, i.created_at
    FROM imports i WHERE i.id=? AND i.owner_id=? AND i.status IN (${importSource.candidateIndex === null ? "'needs_review','failed','saved'" : "'needs_review','saved'"})
      AND i.expires_at>?${importSource.candidateIndex === null ? '' : " AND json_type(i.result_json,'$['||CAST(? AS INTEGER)||']')='object'"}
      AND ${liveSessionSql}`)
    .bind(principal.ownerId, id, importSource.candidateIndex, importSource.candidateIndex, importSource.candidateIndex,
      importSource.importId, principal.ownerId, now,
      ...(importSource.candidateIndex === null ? [] : [importSource.candidateIndex]),
      ...sessionArgs(principal, now)) : null;
  const recipeStatement = env.DB.prepare(`INSERT INTO recipes(id,owner_id,title,source_label,source_url,base_servings_num,base_servings_den,version,steps_json,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,1,?,?,? WHERE ${liveSessionSql}${importSource ? " AND EXISTS(SELECT 1 FROM recipe_sources rs WHERE rs.owner_id=? AND rs.recipe_id=? AND rs.import_id=?)" : ''}`)
    .bind(id, principal.ownerId, input.title, input.sourceLabel, input.sourceUrl,
      servings.num, servings.den, JSON.stringify(input.steps), now, now, ...sessionArgs(principal, now),
      ...(importSource ? [principal.ownerId, id, importSource.importId] : []));
  const saveImportStatement = validatedSource && importSource ? env.DB.prepare(`UPDATE imports SET status='saved',updated_at=? WHERE id=? AND owner_id=?
    AND EXISTS(SELECT 1 FROM recipes r JOIN recipe_sources rs ON rs.owner_id=r.owner_id AND rs.recipe_id=r.id
      WHERE r.owner_id=? AND r.id=? AND r.deleted_at IS NULL AND rs.import_id=?) AND ${liveSessionSql}`)
    .bind(now, importSource.importId, principal.ownerId, principal.ownerId, id, importSource.importId, ...sessionArgs(principal, now)) : null;
  const statements = [
  ...(sourceStatement ? [sourceStatement] : []), recipeStatement,
  ...(saveImportStatement ? [saveImportStatement] : []),
  ...input.ingredients.map((item, index) => insertIngredient(env, principal.ownerId, id, item, index, now)),
  ...input.uploads.map(uploadId => env.DB.prepare(`INSERT INTO recipe_uploads(owner_id,recipe_id,upload_id)
    SELECT ?,?,u.id FROM uploads u JOIN recipes r ON r.owner_id=u.owner_id AND r.id=? JOIN app_accounts a ON a.id=r.owner_id
    WHERE u.owner_id=? AND u.id=? AND u.status='stored' AND r.deleted_at IS NULL AND a.status='active'`)
    .bind(principal.ownerId, id, id, principal.ownerId, uploadId))];
  let results: D1Result[];
  try { results = await env.DB.batch(statements); }
  catch {
    if (autoId) {
      const denied = await accessFailure(env, principal);
      if (denied) return denied;
      const saved = await loadRecipe(env, principal.ownerId, autoId);
      if (saved) return json({ recipe: saved });
    }
    return fail(400, 'INVALID_RECIPE', 'Controleer de receptgegevens.');
  }
  const recipeIndex = sourceStatement ? 1 : 0;
  if (results[recipeIndex]?.meta.changes !== 1) {
    const denied = await accessFailure(env, principal);
    if (denied) return denied;
    if (importSource) {
      const revalidated = await validateImportSource(env, principal.ownerId, importSource, (deps.now ?? Date.now)());
      if (revalidated instanceof Response) return revalidated;
      return fail(409, 'IMPORT_NOT_READY', 'Deze import kan niet meer worden opgeslagen.');
    }
    return fail(409, 'WRITE_CONFLICT', 'Het recept kon niet worden bewaard.');
  }
  if (validatedSource && results[2]?.meta.changes !== 1) return await accessFailure(env, principal) ?? fail(409, 'IMPORT_NOT_READY', 'Deze import kan niet meer worden opgeslagen.');
  const recipe = await loadRecipe(env, principal.ownerId, id);
  return json({ recipe }, 201);
}
async function updateRecipe(request: Request, env: AuthEnv, principal: Principal, id: string, deps: RecipeRouteDependencies): Promise<Response> {
  const body = await readBody(request);
  if (body && Object.prototype.hasOwnProperty.call(body, 'importSource')) return fail(400, 'INVALID_IMPORT_SOURCE', 'De bron van een recept kan niet worden gewijzigd.');
  const expectedVersion = body?.expectedVersion;
  const input = body && parseInput(body, true);
  if (!input || !Number.isSafeInteger(expectedVersion) || (expectedVersion as number) <= 0) {
    return fail(400, 'INVALID_RECIPE', 'Controleer de receptgegevens.');
  }
  const existing = await env.DB.prepare(`SELECT version FROM recipes WHERE owner_id=? AND id=? AND deleted_at IS NULL`)
    .bind(principal.ownerId, id).first<{ version: number }>();
  if (!existing) return fail(404, 'NOT_FOUND', 'Niet gevonden.');
  if (existing.version !== expectedVersion) return fail(409, 'VERSION_CONFLICT', 'Het recept is gewijzigd. Laad het opnieuw.');
  if (!(await uploadsAreOwnedAndStored(env, principal.ownerId, input.uploads))) return fail(400, 'INVALID_UPLOAD', 'Een bronafbeelding is niet beschikbaar.');
  await deps.beforeWrite?.('update');
  const now = Date.now();
  const writeToken = crypto.randomUUID();
  const servings = servingsColumns(input.baseServings);
  const ownsWrite = `EXISTS(SELECT 1 FROM recipes WHERE owner_id=? AND id=? AND version=? AND write_token=?)`;
  const ownsArgs = [principal.ownerId, id, Number(expectedVersion) + 1, writeToken] as const;
  const statements = [env.DB.prepare(`UPDATE recipes SET title=?,source_label=?,source_url=?,base_servings_num=?,base_servings_den=?,
    steps_json=?,version=version+1,updated_at=?,write_token=? WHERE owner_id=? AND id=? AND version=? AND deleted_at IS NULL
    AND ${liveSessionSql}`)
    .bind(input.title, input.sourceLabel, input.sourceUrl, servings.num, servings.den, JSON.stringify(input.steps), now,
      writeToken, principal.ownerId, id, expectedVersion, ...sessionArgs(principal, now)),
  env.DB.prepare(`UPDATE ingredients SET retired_at=? WHERE owner_id=? AND recipe_id=? AND retired_at IS NULL AND ${ownsWrite}`)
    .bind(now, principal.ownerId, id, ...ownsArgs),
  env.DB.prepare(`DELETE FROM recipe_uploads WHERE owner_id=? AND recipe_id=? AND ${ownsWrite}`)
    .bind(principal.ownerId, id, ...ownsArgs),
  ...input.ingredients.map((item, index) => env.DB.prepare(`INSERT INTO ingredients(id,owner_id,recipe_id,ordinal,section,original_text,normalized_name,
    quantity_kind,quantity_num,quantity_den,quantity_max_num,unit,source_origin,attributes_json,uncertainty_json,created_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${ownsWrite}`)
    .bind(crypto.randomUUID(), principal.ownerId, id, index, item.section, item.originalText, item.normalizedName,
      quantityToColumns(item.quantity)!.kind, quantityToColumns(item.quantity)!.num, quantityToColumns(item.quantity)!.den,
      quantityToColumns(item.quantity)!.max, quantityToColumns(item.quantity)!.unit, item.sourceOrigin,
      JSON.stringify({ ...item.attributes, ...(item.quantity.basis ? { quantityBasis: item.quantity.basis } : {}) }),
      JSON.stringify(item.uncertainty), now, ...ownsArgs)),
  ...input.uploads.map(uploadId => env.DB.prepare(`INSERT INTO recipe_uploads(owner_id,recipe_id,upload_id)
    SELECT ?,?,id FROM uploads WHERE owner_id=? AND id=? AND status='stored' AND ${ownsWrite}`)
    .bind(principal.ownerId, id, principal.ownerId, uploadId, ...ownsArgs))];
  let results: D1Result[];
  try { results = await env.DB.batch(statements); }
  catch { return fail(400, 'INVALID_RECIPE', 'Controleer de receptgegevens.'); }
  if (results[0]?.meta.changes !== 1) {
    const denied = await accessFailure(env, principal);
    if (denied) return denied;
    return fail(409, 'VERSION_CONFLICT', 'Het recept is gewijzigd. Laad het opnieuw.');
  }
  return json({ recipe: await loadRecipe(env, principal.ownerId, id) });
}
function encodeCursor(updatedAt: number, id: string): string {
  return btoa(`${updatedAt}:${id}`).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function decodeCursor(value: string): { updatedAt: number; id: string } | null {
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
    const [time, ...parts] = atob(padded).split(':');
    const updatedAt = Number(time), id = parts.join(':');
    return Number.isSafeInteger(updatedAt) && updatedAt >= 0 && id.length > 0 && id.length <= 100 ? { updatedAt, id } : null;
  } catch { return null; }
}
async function listRecipes(request: Request, env: AuthEnv, principal: Principal): Promise<Response> {
  const url = new URL(request.url);
  const rawLimit = url.searchParams.get('limit');
  const limit = rawLimit === null ? 20 : /^\d+$/.test(rawLimit) ? Number(rawLimit) : NaN;
  const cursorText = url.searchParams.get('cursor');
  const cursor = cursorText ? decodeCursor(cursorText) : null;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || (cursorText !== null && !cursor)) return fail(400, 'INVALID_PAGE', 'Ongeldige paginering.');
  const rows = await env.DB.prepare(`SELECT id,title,source_label AS sourceLabel,source_url AS sourceUrl,
    base_servings_num AS baseServingsNum,base_servings_den AS baseServingsDen,version,steps_json AS stepsJson,
    created_at AS createdAt,updated_at AS updatedAt FROM recipes WHERE owner_id=? AND deleted_at IS NULL
    AND (? IS NULL OR updated_at<? OR (updated_at=? AND id<?)) ORDER BY updated_at DESC,id DESC LIMIT ?`)
    .bind(principal.ownerId, cursor?.updatedAt ?? null, cursor?.updatedAt ?? null, cursor?.updatedAt ?? null, cursor?.id ?? '', limit + 1)
    .all<RecipeRow>();
  const more = rows.results.length > limit;
  const page = rows.results.slice(0, limit);
  const recipes = await Promise.all(page.map(row => loadRecipe(env, principal.ownerId, row.id, false)));
  const last = page.at(-1);
  return json({ recipes: recipes.filter((recipe): recipe is RecipeDto => recipe !== null),
    nextCursor: more && last ? encodeCursor(last.updatedAt, last.id) : null });
}
async function deleteRecipe(env: AuthEnv, principal: Principal, id: string, deps: RecipeRouteDependencies): Promise<Response> {
  const existing = await env.DB.prepare(`SELECT id FROM recipes WHERE owner_id=? AND id=? AND deleted_at IS NULL`)
    .bind(principal.ownerId, id).first<{ id: string }>();
  if (!existing) return fail(404, 'NOT_FOUND', 'Niet gevonden.');
  await deps.beforeWrite?.('delete');
  const now = Date.now();
  const writeToken = crypto.randomUUID();
  const ownsDeletion = `EXISTS(SELECT 1 FROM recipes WHERE owner_id=? AND id=? AND write_token=? AND deleted_at IS NOT NULL)`;
  const ownsArgs = [principal.ownerId, id, writeToken] as const;
  // Read associations inside this batch, after any concurrent recipe update and before detaching them.
  const unsharedUpload = `EXISTS(SELECT 1 FROM recipe_uploads ru
      WHERE ru.owner_id=u.owner_id AND ru.recipe_id=? AND ru.upload_id=u.id)
    AND NOT EXISTS(SELECT 1 FROM recipe_uploads ru
      WHERE ru.owner_id=u.owner_id AND ru.upload_id=u.id AND ru.recipe_id!=?)
    AND NOT EXISTS(SELECT 1 FROM import_uploads iu JOIN imports i ON i.owner_id=iu.owner_id AND i.id=iu.import_id
      WHERE iu.owner_id=u.owner_id AND iu.upload_id=u.id AND i.status NOT IN ('expired','failed'))`;
  const statements = [env.DB.prepare(`UPDATE recipes SET deleted_at=?,updated_at=?,version=version+1,write_token=?
    WHERE owner_id=? AND id=? AND deleted_at IS NULL AND ${liveSessionSql}`)
    .bind(now, now, writeToken, principal.ownerId, id, ...sessionArgs(principal, now)),
  env.DB.prepare(`UPDATE uploads AS u SET status='deleting',deleted_at=?
    WHERE u.owner_id=? AND u.status='stored' AND ${ownsDeletion} AND ${unsharedUpload}`)
    .bind(now, principal.ownerId, ...ownsArgs, id, id),
  env.DB.prepare(`INSERT OR IGNORE INTO outbox(id,owner_id,task_type,task_id,version,payload_json,status,attempts,available_at,created_at,updated_at)
    SELECT 'delete-upload:'||u.id,u.owner_id,'delete_upload',u.id,1,
      json_object('uploadId',u.id,'objectKey',u.object_key),'pending',0,?,?,?
    FROM uploads u WHERE u.owner_id=? AND u.status='deleting' AND ${ownsDeletion} AND ${unsharedUpload}`)
    .bind(now, now, now, principal.ownerId, ...ownsArgs, id, id),
  env.DB.prepare(`DELETE FROM recipe_uploads WHERE owner_id=? AND recipe_id=? AND ${ownsDeletion}`)
    .bind(principal.ownerId, id, ...ownsArgs)];
  const results = await env.DB.batch(statements);
  if (!results[0]?.meta.changes) return await accessFailure(env, principal) ?? fail(404, 'NOT_FOUND', 'Niet gevonden.');
  return new Response(null, { status: 204, headers: NO_STORE });
}
async function deleteRecipeSource(env: AuthEnv, principal: Principal, id: string, deps: RecipeRouteDependencies): Promise<Response> {
  await deps.beforeWrite?.('delete-source');
  const now = (deps.now ?? Date.now)();
  const result = await env.DB.prepare(`DELETE FROM recipe_sources WHERE owner_id=? AND recipe_id=?
    AND EXISTS(SELECT 1 FROM recipes r WHERE r.owner_id=? AND r.id=? AND r.deleted_at IS NULL)
    AND ${liveSessionSql}`)
    .bind(principal.ownerId, id, principal.ownerId, id, ...sessionArgs(principal, now)).run();
  if (result.meta.changes !== 1) {
    const denied = await accessFailure(env, principal);
    if (denied) return denied;
    const recipe = await env.DB.prepare(`SELECT 1 FROM recipes WHERE owner_id=? AND id=? AND deleted_at IS NULL`)
      .bind(principal.ownerId, id).first();
    return recipe ? fail(404, 'SOURCE_NOT_FOUND', 'Bron niet gevonden.') : fail(404, 'NOT_FOUND', 'Niet gevonden.');
  }
  return new Response(null, { status: 204, headers: NO_STORE });
}

/** Returns null for paths owned by another route module. */
export async function handleRecipes(request: Request, env: AuthEnv, deps: RecipeRouteDependencies = {}): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const sourcePath = /^\/api\/recipes\/[^/]+\/source$/.test(path);
  const known = path === '/api/recipes' || /^\/api\/recipes\/[^/]+$/.test(path) || sourcePath;
  if (!known) return null;
  if (request.method !== 'GET') {
    const denied = requireOrigin(request, env);
    if (denied) return denied;
  }
  const principal = await requirePrincipal(request, env);
  if (!principal) return fail(401, 'UNAUTHENTICATED', 'Log opnieuw in.');
  if (path === '/api/recipes') {
    if (request.method === 'GET') return listRecipes(request, env, principal);
    if (request.method === 'POST') return createRecipe(request, env, principal, deps);
    return fail(405, 'METHOD_NOT_ALLOWED', 'Deze handeling is niet beschikbaar.');
  }
  let id: string;
  try { id = decodeURIComponent(path.slice('/api/recipes/'.length, sourcePath ? -'/source'.length : undefined)); }
  catch { return fail(400, 'INVALID_ID', 'Ongeldige receptverwijzing.'); }
  if (sourcePath) {
    if (request.method !== 'DELETE') return fail(405, 'METHOD_NOT_ALLOWED', 'Deze handeling is niet beschikbaar.');
    return deleteRecipeSource(env, principal, id, deps);
  }
  if (request.method === 'GET') {
    const recipe = await loadRecipe(env, principal.ownerId, id);
    return recipe ? json({ recipe }) : fail(404, 'NOT_FOUND', 'Niet gevonden.');
  }
  if (request.method === 'PUT') return updateRecipe(request, env, principal, id, deps);
  if (request.method === 'DELETE') return deleteRecipe(env, principal, id, deps);
  return fail(405, 'METHOD_NOT_ALLOWED', 'Deze handeling is niet beschikbaar.');
}
