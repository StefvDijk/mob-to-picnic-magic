import { requirePrincipal, type AuthEnv, type Principal } from '../auth';
import { formatRational, parseQuantity, parseRational, type Quantity } from '../../shared/quantities';
import type { RecipeDto, RecipeIngredientDto } from '../../shared/recipes';

const NO_STORE = { 'Cache-Control': 'no-store, private', Pragma: 'no-cache' };
const MAX_INGREDIENTS = 200;
const MAX_UPLOADS = 8;
const MAX_STEPS = 100;

type IngredientInput = Omit<RecipeIngredientDto, 'id' | 'ordinal'>;
export interface RecipeRouteDependencies {
  /** Optional deterministic seam for exercising state changes between auth and the write transaction. */
  beforeWrite?: (kind: 'create' | 'update') => Promise<void>;
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
async function loadRecipe(env: AuthEnv, ownerId: string, id: string): Promise<RecipeDto | null> {
  const row = await env.DB.prepare(`SELECT id,title,source_label AS sourceLabel,source_url AS sourceUrl,
    base_servings_num AS baseServingsNum,base_servings_den AS baseServingsDen,version,steps_json AS stepsJson,
    created_at AS createdAt,updated_at AS updatedAt FROM recipes WHERE owner_id=? AND id=? AND deleted_at IS NULL`)
    .bind(ownerId, id).first<RecipeRow>();
  if (!row) return null;
  const [ingredients, uploads] = await Promise.all([
    env.DB.prepare(`SELECT id,ordinal,section,original_text AS originalText,normalized_name AS normalizedName,
      quantity_kind AS quantityKind,quantity_num AS quantityNum,quantity_den AS quantityDen,
      quantity_max_num AS quantityMaxNum,unit,source_origin AS sourceOrigin,attributes_json AS attributesJson,
      uncertainty_json AS uncertaintyJson FROM ingredients WHERE owner_id=? AND recipe_id=? AND retired_at IS NULL ORDER BY ordinal`)
      .bind(ownerId, id).all<IngredientRow>(),
    env.DB.prepare(`SELECT ru.upload_id AS id FROM recipe_uploads ru JOIN uploads u ON u.owner_id=ru.owner_id AND u.id=ru.upload_id
      WHERE ru.owner_id=? AND ru.recipe_id=? AND u.status='stored' ORDER BY ru.upload_id`).bind(ownerId, id).all<{ id: string }>(),
  ]);
  return { id: row.id, title: row.title, sourceLabel: row.sourceLabel, sourceUrl: row.sourceUrl,
    baseServings: row.baseServingsNum === null ? null : formatRational({ numerator: row.baseServingsNum, denominator: row.baseServingsDen }),
    version: row.version, steps: safeArray(row.stepsJson),
    ingredients: ingredients.results.map(ingredient => ({ id: ingredient.id, ordinal: ingredient.ordinal,
      section: ingredient.section, originalText: ingredient.originalText, normalizedName: ingredient.normalizedName,
      quantity: rowQuantity(ingredient), sourceOrigin: ingredient.sourceOrigin, attributes: publicAttributes(ingredient.attributesJson),
      uncertainty: safeArray(ingredient.uncertaintyJson) })),
    uploads: uploads.results, createdAt: row.createdAt, updatedAt: row.updatedAt };
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
async function createRecipe(request: Request, env: AuthEnv, principal: Principal, deps: RecipeRouteDependencies): Promise<Response> {
  const body = await readBody(request);
  const input = body && parseInput(body, true);
  if (!input) return fail(400, 'INVALID_RECIPE', 'Controleer de receptgegevens.');
  if (!(await uploadsAreOwnedAndStored(env, principal.ownerId, input.uploads))) return fail(400, 'INVALID_UPLOAD', 'Een bronafbeelding is niet beschikbaar.');
  await deps.beforeWrite?.('create');
  const now = Date.now();
  const id = crypto.randomUUID();
  const servings = servingsColumns(input.baseServings);
  const statements = [env.DB.prepare(`INSERT INTO recipes(id,owner_id,title,source_label,source_url,base_servings_num,base_servings_den,version,steps_json,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,1,?,?,? WHERE EXISTS(SELECT 1 FROM app_accounts WHERE id=? AND status='active')`)
    .bind(id, principal.ownerId, input.title, input.sourceLabel, input.sourceUrl,
      servings.num, servings.den, JSON.stringify(input.steps), now, now, principal.ownerId),
  ...input.ingredients.map((item, index) => insertIngredient(env, principal.ownerId, id, item, index, now)),
  ...input.uploads.map(uploadId => env.DB.prepare(`INSERT INTO recipe_uploads(owner_id,recipe_id,upload_id)
    SELECT ?,?,u.id FROM uploads u JOIN recipes r ON r.owner_id=u.owner_id AND r.id=? JOIN app_accounts a ON a.id=r.owner_id
    WHERE u.owner_id=? AND u.id=? AND u.status='stored' AND r.deleted_at IS NULL AND a.status='active'`)
    .bind(principal.ownerId, id, id, principal.ownerId, uploadId))];
  let results: D1Result[];
  try { results = await env.DB.batch(statements); }
  catch { return fail(400, 'INVALID_RECIPE', 'Controleer de receptgegevens.'); }
  if (results[0]?.meta.changes !== 1) return fail(403, 'FORBIDDEN', 'Geen toegang.');
  const recipe = await loadRecipe(env, principal.ownerId, id);
  return json({ recipe }, 201);
}
async function updateRecipe(request: Request, env: AuthEnv, principal: Principal, id: string, deps: RecipeRouteDependencies): Promise<Response> {
  const body = await readBody(request);
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
    AND EXISTS(SELECT 1 FROM app_accounts WHERE id=? AND status='active')`)
    .bind(input.title, input.sourceLabel, input.sourceUrl, servings.num, servings.den, JSON.stringify(input.steps), now,
      writeToken, principal.ownerId, id, expectedVersion, principal.ownerId),
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
    const account = await env.DB.prepare(`SELECT status FROM app_accounts WHERE id=?`).bind(principal.ownerId).first<{ status: string }>();
    if (account?.status !== 'active') return fail(403, 'FORBIDDEN', 'Geen toegang.');
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
  const recipes = await Promise.all(page.map(row => loadRecipe(env, principal.ownerId, row.id)));
  const last = page.at(-1);
  return json({ recipes: recipes.filter((recipe): recipe is RecipeDto => recipe !== null),
    nextCursor: more && last ? encodeCursor(last.updatedAt, last.id) : null });
}
async function deleteRecipe(env: AuthEnv, principal: Principal, id: string): Promise<Response> {
  const existing = await env.DB.prepare(`SELECT id FROM recipes WHERE owner_id=? AND id=? AND deleted_at IS NULL`)
    .bind(principal.ownerId, id).first<{ id: string }>();
  if (!existing) return fail(404, 'NOT_FOUND', 'Niet gevonden.');
  const now = Date.now();
  const uploadRows = await env.DB.prepare(`SELECT u.id,u.object_key AS objectKey FROM recipe_uploads ru JOIN uploads u
    ON u.owner_id=ru.owner_id AND u.id=ru.upload_id WHERE ru.owner_id=? AND ru.recipe_id=? AND u.status='stored'`)
    .bind(principal.ownerId, id).all<{ id: string; objectKey: string }>();
  const statements = [env.DB.prepare(`UPDATE recipes SET deleted_at=?,updated_at=?,version=version+1 WHERE owner_id=? AND id=? AND deleted_at IS NULL`)
    .bind(now, now, principal.ownerId, id),
  env.DB.prepare(`DELETE FROM recipe_uploads WHERE owner_id=? AND recipe_id=?`).bind(principal.ownerId, id)];
  for (const upload of uploadRows.results) {
    statements.push(env.DB.prepare(`UPDATE uploads SET status='deleting',deleted_at=? WHERE owner_id=? AND id=? AND status='stored'
      AND NOT EXISTS(SELECT 1 FROM recipe_uploads WHERE owner_id=? AND upload_id=? AND recipe_id!=?)
      AND NOT EXISTS(SELECT 1 FROM import_uploads iu JOIN imports i ON i.owner_id=iu.owner_id AND i.id=iu.import_id
        WHERE iu.owner_id=? AND iu.upload_id=? AND i.status NOT IN ('expired','failed'))`)
      .bind(now, principal.ownerId, upload.id, principal.ownerId, upload.id, id, principal.ownerId, upload.id));
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO outbox(id,owner_id,task_type,task_id,version,payload_json,status,attempts,available_at,created_at,updated_at)
      SELECT ?,?, 'delete_upload',u.id,1,json_object('uploadId',u.id,'objectKey',u.object_key),'pending',0,?,?,? FROM uploads u
      WHERE u.owner_id=? AND u.id=? AND u.status='deleting'`)
      .bind(crypto.randomUUID(), principal.ownerId, now, now, now, principal.ownerId, upload.id));
  }
  await env.DB.batch(statements);
  return new Response(null, { status: 204, headers: NO_STORE });
}

/** Returns null for paths owned by another route module. */
export async function handleRecipes(request: Request, env: AuthEnv, deps: RecipeRouteDependencies = {}): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const known = path === '/api/recipes' || /^\/api\/recipes\/[^/]+$/.test(path);
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
  try { id = decodeURIComponent(path.slice('/api/recipes/'.length)); }
  catch { return fail(400, 'INVALID_ID', 'Ongeldige receptverwijzing.'); }
  if (request.method === 'GET') {
    const recipe = await loadRecipe(env, principal.ownerId, id);
    return recipe ? json({ recipe }) : fail(404, 'NOT_FOUND', 'Niet gevonden.');
  }
  if (request.method === 'PUT') return updateRecipe(request, env, principal, id, deps);
  if (request.method === 'DELETE') return deleteRecipe(env, principal, id);
  return fail(405, 'METHOD_NOT_ALLOWED', 'Deze handeling is niet beschikbaar.');
}
