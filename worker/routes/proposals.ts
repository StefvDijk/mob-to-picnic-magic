import { requirePrincipal, type AuthEnv, type Principal } from '../auth';
import { decryptCredential, type PicnicKeyEnv } from '../security/credentials';
import { createAbortablePicnicProvider, type PicnicProvider } from '../adapters/picnic';
import { scaleExactQuantity } from '../domain/quantityMath';
import { selectProducts, type ProductOption } from '../domain/productSelector';
import { formatRational, parseQuantity, parseRational, type Quantity, type QuantityUnit, type Rational } from '../../shared/quantities';
import type { PicnicProduct } from '../../shared/picnic';
import type { ProposalChoiceInput, ProposalDto, ProposalNeedDto, ProposalProductDto } from '../../shared/proposals';
import { sessionExpiryMillisSql } from '../db';

const NO_STORE = { 'Cache-Control': 'no-store, private', Pragma: 'no-cache' };
const PROPOSAL_LIFETIME = 10 * 60_000;
const MAX_INGREDIENTS = 30;
type ProposalEnv = AuthEnv & PicnicKeyEnv;
export interface ProposalDependencies { provider?: PicnicProvider; now?: () => number }

type IngredientRow = {
  id: string; ordinal: number; originalText: string; normalizedName: string | null;
  quantityKind: 'exact' | 'range' | 'global' | 'unknown'; quantityNum: number | null; quantityDen: number;
  quantityMaxNum: number | null; unit: QuantityUnit | null; attributesJson: string;
};
type PreparedNeed = { needId: string; ingredient: IngredientRow; quantity: Quantity; needed: Rational; dto: ProposalNeedDto; purchaseLineId: string };

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: NO_STORE });
}
function fail(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}
function provider(deps: ProposalDependencies): PicnicProvider { return deps.provider ?? createAbortablePicnicProvider(); }
function parseBody(value: unknown): { recipeId: string; recipeVersion: number; servings: Rational; choices: ProposalChoiceInput[] } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const servings = parseRational(body.servings);
  if (typeof body.recipeId !== 'string' || !body.recipeId || body.recipeId.length > 100 ||
      !Number.isSafeInteger(body.recipeVersion) || (body.recipeVersion as number) < 1 ||
      !servings || servings.numerator <= 0 || !Array.isArray(body.choices) || body.choices.length < 1 || body.choices.length > MAX_INGREDIENTS) return null;
  const choices: ProposalChoiceInput[] = [];
  for (const raw of body.choices) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const choice = raw as Record<string, unknown>;
    if (typeof choice.ingredientId !== 'string' || !choice.ingredientId || choice.ingredientId.length > 100 ||
        typeof choice.query !== 'string' || !choice.query.trim() || choice.query.trim().length > 100 || /[\0\r\n]/.test(choice.query) ||
        typeof choice.productId !== 'string' || !choice.productId || choice.productId.length > 100 ||
        !(choice.basis === null || choice.basis === 'net' || choice.basis === 'drained')) return null;
    choices.push({ ingredientId: choice.ingredientId, query: choice.query.trim(), productId: choice.productId, basis: choice.basis });
  }
  if (new Set(choices.map(choice => choice.ingredientId)).size !== choices.length) return null;
  return { recipeId: body.recipeId, recipeVersion: body.recipeVersion as number, servings, choices };
}
function ingredientQuantity(row: IngredientRow): Quantity | null {
  let attributes: Record<string, unknown> = {};
  try { const parsed: unknown = JSON.parse(row.attributesJson); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) attributes = parsed as Record<string, unknown>; }
  catch { return null; }
  const basis = attributes.quantityBasis === 'net' || attributes.quantityBasis === 'drained' ? attributes.quantityBasis : null;
  const raw: Quantity = row.quantityKind === 'global' || row.quantityKind === 'unknown' ? { kind: row.quantityKind, basis: null }
    : { kind: row.quantityKind, amount: formatRational({ numerator: row.quantityNum ?? 0, denominator: row.quantityDen }),
      ...(row.quantityKind === 'range' ? { maximum: formatRational({ numerator: row.quantityMaxNum ?? 0, denominator: row.quantityDen }) } : {}),
      unit: row.unit ?? undefined, basis };
  return parseQuantity(raw);
}
function toColumns(quantity: Quantity): { kind: string; num: number | null; den: number; max: number | null; unit: string | null } | null {
  if (quantity.kind === 'unknown' || quantity.kind === 'global') return { kind: quantity.kind, num: null, den: 1, max: null, unit: null };
  const amount = parseRational(quantity.amount);
  const maximum = quantity.kind === 'range' ? parseRational(quantity.maximum) : null;
  if (!amount || quantity.kind === 'range' && !maximum) return null;
  if (!maximum) return { kind: quantity.kind, num: amount.numerator, den: amount.denominator, max: null, unit: quantity.unit ?? null };
  const a = BigInt(amount.denominator), b = BigInt(maximum.denominator);
  const gcd = (x: bigint, y: bigint): bigint => { while (y) [x, y] = [y, x % y]; return x; };
  const denominator = a / gcd(a, b) * b;
  const numerator = BigInt(amount.numerator) * (denominator / a);
  const max = BigInt(maximum.numerator) * (denominator / b);
  const limit = BigInt(Number.MAX_SAFE_INTEGER);
  if (denominator > limit || numerator > limit || max > limit) return null;
  return { kind: quantity.kind, num: Number(numerator), den: Number(denominator), max: Number(max), unit: quantity.unit ?? null };
}
function scaleQuantity(source: Quantity, servings: Rational, base: Rational): Quantity | null {
  if (source.kind === 'unknown' || source.kind === 'global' || !source.unit) return null;
  const amount = parseRational(source.amount);
  if (!amount) return null;
  const scaled = scaleExactQuantity(amount, servings, base);
  if (!scaled) return null;
  const result: Quantity = { kind: source.kind, amount: formatRational(scaled), unit: source.unit, basis: source.basis ?? null };
  if (source.kind === 'range') {
    const maximum = source.maximum ? parseRational(source.maximum) : null;
    const scaledMax = maximum && scaleExactQuantity(maximum, servings, base);
    if (!scaledMax) return null;
    result.maximum = formatRational(scaledMax);
  }
  return result;
}
function selectionAmount(quantity: Quantity): Rational | null {
  return parseRational(quantity.kind === 'range' ? quantity.maximum : quantity.amount);
}
function productDto(product: PicnicProduct, basis: 'net' | 'drained' | null, packCount: number, suppliedUnit: 'g' | 'ml' | 'piece',
    supplied: string, overshoot: string): ProposalProductDto | null {
  const quantity = product.quantity && product.quantity.kind === 'exact'
    ? { ...product.quantity, basis: product.quantity.basis ?? basis } : null;
  if (!quantity || !Number.isSafeInteger(product.displayPriceCents) || product.displayPriceCents === null) return null;
  return { id: product.id, name: product.name, unitQuantity: product.unitQuantity, quantity,
    priceCents: product.displayPriceCents, packCount, suppliedUnit, supplied, overshoot };
}
function sessionGate(principal: Principal, now: number): { sql: string; args: unknown[] } {
  return {
    sql: `EXISTS(SELECT 1 FROM app_accounts a JOIN session_metadata sm ON sm.owner_id=a.id AND sm.session_id=?
      JOIN session s ON s.id=sm.session_id AND s.userId=sm.owner_id
      WHERE a.id=? AND a.status='active' AND sm.revoked_at IS NULL
        AND sm.authenticated_at+2592000000>? AND sm.last_activity_at+1209600000>?
        AND (${sessionExpiryMillisSql})>?)`,
    args: [principal.sessionId, principal.ownerId, now, now, now],
  };
}

async function createProposal(request: Request, env: ProposalEnv, principal: Principal, deps: ProposalDependencies): Promise<Response> {
  let raw: unknown;
  try { raw = await request.json(); } catch { return fail(400, 'INVALID_BODY', 'Verstuur geldige JSON.'); }
  const input = parseBody(raw);
  if (!input) return fail(400, 'INVALID_PROPOSAL', 'Controleer recept, porties en productkeuzes.');
  const recipe = await env.DB.prepare(`SELECT id,version,base_servings_num AS baseServingsNum,base_servings_den AS baseServingsDen
    FROM recipes WHERE owner_id=? AND id=? AND version=? AND deleted_at IS NULL`)
    .bind(principal.ownerId, input.recipeId, input.recipeVersion)
    .first<{ id: string; version: number; baseServingsNum: number | null; baseServingsDen: number }>();
  if (!recipe) return fail(409, 'RECIPE_STALE', 'Het recept is gewijzigd of niet meer beschikbaar.');
  if (recipe.baseServingsNum === null) return fail(422, 'BASE_SERVINGS_REQUIRED', 'Vul eerst de basisporties van het recept in.');
  const rows = await env.DB.prepare(`SELECT id,ordinal,original_text AS originalText,normalized_name AS normalizedName,
      quantity_kind AS quantityKind,quantity_num AS quantityNum,quantity_den AS quantityDen,
      quantity_max_num AS quantityMaxNum,unit,attributes_json AS attributesJson
    FROM ingredients WHERE owner_id=? AND recipe_id=? AND retired_at IS NULL ORDER BY ordinal`)
    .bind(principal.ownerId, input.recipeId).all<IngredientRow>();
  if (!rows.results.length || rows.results.length > MAX_INGREDIENTS || input.choices.length !== rows.results.length ||
      rows.results.some(row => !input.choices.some(choice => choice.ingredientId === row.id))) {
    return fail(422, 'INGREDIENT_CHOICES_REQUIRED', 'Kies precies één Picnic-product voor elk ingrediënt.');
  }
  const connection = await env.DB.prepare(`SELECT id,generation,encrypted_resume_key AS encryptedResumeKey,key_version AS keyVersion
    FROM connections WHERE owner_id=? AND status='connected' LIMIT 1`).bind(principal.ownerId)
    .first<{ id: string; generation: number; encryptedResumeKey: string; keyVersion: string }>();
  if (!connection) return fail(409, 'PICNIC_NOT_CONNECTED', 'Koppel eerst je Picnic-account.');
  let authKey: string;
  try { authKey = await decryptCredential(env, principal.ownerId, connection.id, 'resume', connection.keyVersion, connection.encryptedResumeKey); }
  catch { return fail(503, 'PICNIC_KEY_UNAVAILABLE', 'De Picnic-koppeling kan tijdelijk niet worden gebruikt.'); }

  const choices = new Map(input.choices.map(choice => [choice.ingredientId, choice]));
  const prepared: PreparedNeed[] = [];
  let totalPriceCents = 0;
  const api = provider(deps);
  try {
    for (const ingredient of rows.results) {
      const source = ingredientQuantity(ingredient);
      if (!source) return fail(422, 'QUANTITY_REVIEW_REQUIRED', 'Controleer de hoeveelheid en eenheid van elk ingrediënt.');
      const quantity = scaleQuantity(source, input.servings, { numerator: recipe.baseServingsNum, denominator: recipe.baseServingsDen });
      if (!quantity) return fail(422, 'QUANTITY_REVIEW_REQUIRED', 'Controleer de hoeveelheid en eenheid van elk ingrediënt.');
      const needed = selectionAmount(quantity);
      if (!needed || needed.numerator <= 0 || !quantity.unit) return fail(422, 'QUANTITY_REVIEW_REQUIRED', 'Controleer de hoeveelheid en eenheid van elk ingrediënt.');
      const choice = choices.get(ingredient.id)!;
      const products = await api.search(authKey, choice.query);
      if (!(await currentConnection(env, principal, connection))) return fail(409, 'PICNIC_CONNECTION_CHANGED', 'De Picnic-koppeling is gewijzigd.');
      const matches = products.filter(product => product.id === choice.productId);
      if (matches.length !== 1) return fail(422, 'PRODUCT_NOT_FOUND', 'Een gekozen Picnic-product kon niet in de actuele zoekresultaten worden bevestigd.');
      const product = matches[0];
      if (product.priceCertainty !== 'known' || product.displayPriceCents === null || !product.quantity || product.quantity.kind !== 'exact') {
        return fail(422, 'PRODUCT_REVIEW_REQUIRED', 'De gekozen Picnic-verpakking heeft een onzekere hoeveelheid of prijs.');
      }
      const providerBasis = product.quantity.basis ?? null;
      const massOrVolume = quantity.unit !== 'piece';
      if (massOrVolume && quantity.basis === null) {
        return fail(422, 'QUANTITY_BASIS_REQUIRED', 'Vul eerst in of de hoeveelheid netto of uitgelekt is.');
      }
      if (massOrVolume && (choice.basis !== quantity.basis || providerBasis !== null && providerBasis !== quantity.basis) ||
          !massOrVolume && choice.basis !== null ||
          choice.basis !== null && providerBasis !== null && choice.basis !== providerBasis) {
        return fail(422, 'PRODUCT_BASIS_CONFLICT', 'De gekozen hoeveelheidbasis komt niet overeen met Picnic.');
      }
      const basis = massOrVolume ? quantity.basis! : null;
      const productBasis = product.quantity.unit === 'piece' ? null : providerBasis ?? choice.basis;
      if (product.quantity.unit !== 'piece' && productBasis === null) return fail(422, 'PRODUCT_BASIS_REQUIRED', 'Kies netto of uitgelekt voor dit product.');
      const amount = parseRational(product.quantity.amount);
      if (!amount || amount.numerator <= 0) return fail(422, 'PRODUCT_REVIEW_REQUIRED', 'De gekozen Picnic-verpakking heeft geen bruikbare hoeveelheid.');
      const option: ProductOption = { id: product.id, groupId: product.identity.groupId, variantId: product.identity.variantId,
        eligible: true, unit: product.quantity.unit!, amount, basis: productBasis, priceCents: product.displayPriceCents };
      const selection = selectProducts({ need: needed, unit: quantity.unit, basis, products: [option] });
      if (selection.status !== 'selected' || !selection.selected) return fail(422, 'PRODUCT_DOES_NOT_COVER_NEED', 'De gekozen verpakking kan de benodigde hoeveelheid niet veilig dekken.');
      const packageCount = selection.selected.packageCounts.find(item => item.productId === product.id)?.count;
      if (!packageCount) return fail(422, 'PRODUCT_DOES_NOT_COVER_NEED', 'De gekozen verpakking kan de benodigde hoeveelheid niet veilig dekken.');
      const price = packageCount * product.displayPriceCents;
      if (!Number.isSafeInteger(price) || !Number.isSafeInteger(totalPriceCents + price)) return fail(422, 'PRICE_OUT_OF_RANGE', 'De totaalprijs kan niet veilig worden berekend.');
      totalPriceCents += price;
      const productSummary = productDto(product, basis, packageCount, selection.selected.unit, selection.selected.supplied, selection.selected.overshoot);
      if (!productSummary) return fail(422, 'PRODUCT_REVIEW_REQUIRED', 'De gekozen Picnic-verpakking heeft een onzekere hoeveelheid of prijs.');
      const needId = crypto.randomUUID();
      const purchaseLineId = crypto.randomUUID();
      prepared.push({ needId, ingredient, quantity, needed,
        dto: { id: needId, ingredientId: ingredient.id, ordinal: ingredient.ordinal, name: ingredient.normalizedName ?? ingredient.originalText,
          quantity, needed: formatRational(needed), product: productSummary }, purchaseLineId });
    }
  } catch {
    return fail(503, 'PICNIC_UNAVAILABLE', 'Picnic is tijdelijk niet bereikbaar.');
  }

  const now = deps.now?.() ?? Date.now();
  const proposalId = crypto.randomUUID();
  const servingsText = formatRational(input.servings);
  const gate = sessionGate(principal, now);
  const statements: D1PreparedStatement[] = [env.DB.prepare(`INSERT INTO proposals(id,owner_id,recipe_id,recipe_version,connection_id,
      connection_generation,version,status,servings_num,servings_den,checked_at,expires_at,created_at,updated_at)
    SELECT ?,?,?,?,?,?,1,'ready',?,?,?,?,?,? WHERE ${gate.sql}
      AND EXISTS(SELECT 1 FROM recipes r WHERE r.owner_id=? AND r.id=? AND r.version=? AND r.deleted_at IS NULL)
      AND EXISTS(SELECT 1 FROM connections c WHERE c.owner_id=? AND c.id=? AND c.generation=? AND c.status='connected')`)
    .bind(proposalId, principal.ownerId, input.recipeId, input.recipeVersion, connection.id, connection.generation,
      input.servings.numerator, input.servings.denominator, now, now + PROPOSAL_LIFETIME, now, now,
      ...gate.args, principal.ownerId, input.recipeId, input.recipeVersion, principal.ownerId, connection.id, connection.generation)];
  for (const item of prepared) {
    const columns = toColumns(item.quantity);
    if (!columns || columns.kind === 'unknown' || columns.kind === 'global' || !columns.unit) return fail(422, 'QUANTITY_REVIEW_REQUIRED', 'Controleer de hoeveelheid en eenheid van elk ingrediënt.');
    const snapshot = JSON.stringify(item.dto.product);
    const packAmount = parseRational(item.dto.product.quantity.amount)!;
    statements.push(env.DB.prepare(`INSERT INTO proposal_needs(id,owner_id,proposal_id,ordinal,normalized_name,quantity_kind,quantity_num,
      quantity_den,quantity_max_num,unit,unresolved_json) SELECT ?,?,?,?,?,?,?,?,?,?,'[]' WHERE EXISTS(
        SELECT 1 FROM proposals p WHERE p.owner_id=? AND p.id=? AND p.status='ready')`)
      .bind(item.needId, principal.ownerId, proposalId, item.ingredient.ordinal, item.ingredient.normalizedName,
        columns.kind, columns.num, columns.den, columns.max, columns.unit, principal.ownerId, proposalId));
    statements.push(env.DB.prepare(`INSERT INTO proposal_need_sources(owner_id,proposal_id,recipe_id,need_id,ingredient_id)
      SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM proposals p WHERE p.owner_id=? AND p.id=? AND p.status='ready')`)
      .bind(principal.ownerId, proposalId, input.recipeId, item.needId, item.ingredient.id, principal.ownerId, proposalId));
    statements.push(env.DB.prepare(`INSERT INTO purchase_lines(id,owner_id,proposal_id,need_id,ordinal,product_snapshot_json,pack_count,
      pack_quantity_num,pack_quantity_den,unit,price_cents)
      SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM proposals p WHERE p.owner_id=? AND p.id=? AND p.status='ready')`)
      .bind(item.purchaseLineId, principal.ownerId, proposalId, item.needId, item.ingredient.ordinal, snapshot,
        item.dto.product.packCount, packAmount.numerator, packAmount.denominator, item.dto.product.quantity.unit,
        item.dto.product.priceCents, principal.ownerId, proposalId));
  }
  let results: D1Result[];
  try { results = await env.DB.batch(statements); }
  catch { return fail(409, 'PROPOSAL_STALE', 'Het recept, de sessie of de Picnic-koppeling is intussen gewijzigd. Maak het voorstel opnieuw.'); }
  if (results[0]?.meta.changes !== 1) return fail(409, 'PROPOSAL_STALE', 'Het recept, de sessie of de Picnic-koppeling is intussen gewijzigd. Maak het voorstel opnieuw.');
  const proposal: ProposalDto = { id: proposalId, recipeId: input.recipeId, recipeVersion: input.recipeVersion,
    version: 1, servings: servingsText, status: 'ready', expiresAt: now + PROPOSAL_LIFETIME, totalPriceCents,
    needs: prepared.map(item => item.dto) };
  return json({ proposal }, 201);
}

async function currentConnection(env: ProposalEnv, principal: Principal, connection: { id: string; generation: number }): Promise<boolean> {
  return !!await env.DB.prepare(`SELECT 1 FROM connections c JOIN app_accounts a ON a.id=c.owner_id AND a.status='active'
    WHERE c.owner_id=? AND c.id=? AND c.generation=? AND c.status='connected'`)
    .bind(principal.ownerId, connection.id, connection.generation).first();
}

async function loadProposal(env: ProposalEnv, principal: Principal, id: string): Promise<ProposalDto | 'stale' | null> {
  const proposal = await env.DB.prepare(`SELECT id,recipe_id AS recipeId,recipe_version AS recipeVersion,version,servings_num AS servingsNum,
      servings_den AS servingsDen,status,expires_at AS expiresAt,connection_id AS connectionId,
      connection_generation AS connectionGeneration FROM proposals WHERE owner_id=? AND id=?`)
    .bind(principal.ownerId, id).first<{ id: string; recipeId: string; recipeVersion: number; version: number; servingsNum: number | null; servingsDen: number; status: string; expiresAt: number; connectionId: string; connectionGeneration: number }>();
  if (!proposal) return null;
  const now = Date.now();
  if (proposal.status !== 'ready' || proposal.expiresAt <= now || proposal.servingsNum === null) return 'stale';
  const current = await env.DB.prepare(`SELECT 1 FROM recipes r JOIN connections c ON c.owner_id=r.owner_id
    JOIN app_accounts a ON a.id=r.owner_id AND a.status='active'
    WHERE r.owner_id=? AND r.id=? AND r.version=? AND r.deleted_at IS NULL AND c.id=?
      AND c.generation=? AND c.status='connected'`).bind(principal.ownerId, proposal.recipeId,
    proposal.recipeVersion, proposal.connectionId, proposal.connectionGeneration).first();
  if (!current) return 'stale';
  const lines = await env.DB.prepare(`SELECT n.id,n.ordinal,n.normalized_name AS normalizedName,n.quantity_kind AS quantityKind,
      n.quantity_num AS quantityNum,n.quantity_den AS quantityDen,n.quantity_max_num AS quantityMaxNum,n.unit,
      i.id AS ingredientId,i.original_text AS originalText,i.attributes_json AS attributesJson,p.product_snapshot_json AS productSnapshot
    FROM proposal_needs n JOIN proposal_need_sources s ON s.owner_id=n.owner_id AND s.proposal_id=n.proposal_id AND s.need_id=n.id
    JOIN ingredients i ON i.owner_id=s.owner_id AND i.recipe_id=s.recipe_id AND i.id=s.ingredient_id
    JOIN purchase_lines p ON p.owner_id=n.owner_id AND p.proposal_id=n.proposal_id AND p.need_id=n.id
    WHERE n.owner_id=? AND n.proposal_id=? ORDER BY n.ordinal`)
    .bind(principal.ownerId, id).all<Record<string, unknown>>();
  const needs: ProposalNeedDto[] = [];
  let totalPriceCents = 0;
  for (const row of lines.results) {
    const grouped = needs.find(need => need.id === String(row.id));
    if (grouped) { grouped.ingredientIds = [...(grouped.ingredientIds ?? [grouped.ingredientId]), String(row.ingredientId)]; continue; }
    const ingredient = row as unknown as IngredientRow;
    const quantity = ingredientQuantity(ingredient);
    if (!quantity || !row.productSnapshot || typeof row.productSnapshot !== 'string') return null;
    let product: ProposalProductDto;
    try { product = JSON.parse(row.productSnapshot) as ProposalProductDto; } catch { return null; }
    if (!product || typeof product.priceCents !== 'number' || typeof product.packCount !== 'number') return null;
    totalPriceCents += product.priceCents * product.packCount;
    const needed = parseRational(quantity.kind === 'range' ? quantity.maximum : quantity.amount);
    if (!needed && quantity.kind !== 'unknown' && quantity.kind !== 'global') return null;
    needs.push({ id: String(row.id), ingredientId: String(row.ingredientId), ordinal: Number(row.ordinal),
      name: String(row.normalizedName ?? row.originalText), quantity, needed: needed ? formatRational(needed) : null, product });
  }
  if (!needs.length || !Number.isSafeInteger(totalPriceCents)) return null;
  return { id: proposal.id, recipeId: proposal.recipeId, recipeVersion: proposal.recipeVersion, version: proposal.version,
    servings: formatRational({ numerator: proposal.servingsNum, denominator: proposal.servingsDen }),
    status: 'ready', expiresAt: proposal.expiresAt, totalPriceCents, needs };
}

/** Returns null when this route does not own the request path. */
export async function handleProposals(request: Request, env: ProposalEnv, deps: ProposalDependencies = {}): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== '/api/proposals' && !/^\/api\/proposals\/[^/]+$/.test(path)) return null;
  if (request.method !== 'GET') {
    if (request.headers.get('Origin') !== env.APP_ORIGIN) return fail(403, 'ORIGIN_DENIED', 'Dit verzoek is niet toegestaan.');
    if (request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      return fail(400, 'INVALID_CONTENT_TYPE', 'Verstuur geldige JSON.');
    }
  }
  const principal = await requirePrincipal(request, env);
  if (!principal) return fail(401, 'UNAUTHENTICATED', 'Log opnieuw in.');
  if (path === '/api/proposals' && request.method === 'POST') return createProposal(request, env, principal, deps);
  if (request.method === 'GET' && path !== '/api/proposals') {
    let id: string;
    try { id = decodeURIComponent(path.slice('/api/proposals/'.length)); } catch { return fail(404, 'PROPOSAL_NOT_FOUND', 'Voorstel niet gevonden.'); }
    const proposal = await loadProposal(env, principal, id);
    return proposal === 'stale' ? fail(409, 'PROPOSAL_STALE', 'Dit voorstel is verlopen of de recept- of Picnic-koppeling is gewijzigd.')
      : proposal ? json({ proposal }) : fail(404, 'PROPOSAL_NOT_FOUND', 'Voorstel niet gevonden.');
  }
  return fail(405, 'METHOD_NOT_ALLOWED', 'Deze handeling is niet beschikbaar.');
}
