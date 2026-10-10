import type { ProductAssessment } from '../../shared/shopping';
import type { ProductKnowledge } from '../catalog/knowledge';
import { unitPriceForPacks } from '../../shared/product-pricing';
import { requirePrincipal, type AuthEnv, type Principal } from '../auth';
import { decryptCredential, type PicnicKeyEnv } from '../security/credentials';
import { createAbortablePicnicProvider, type PicnicProvider } from '../adapters/picnic';
import { loadRecipe } from './recipes';
import { candidateFor, rankCandidates, shoppingGroups, validServings, MATCH_RULES_VERSION } from '../domain/shopping';
import { KNOWLEDGE_VERSION, INGREDIENTS, normalizeIngredient } from '../../shared/ingredient-knowledge';
import { formatRational, parseRational } from '../../shared/quantities';
import type { PicnicProduct, PicnicProductDetails } from '../../shared/picnic';
import type { ShoppingChoice, ShoppingPlan, ShoppingProposalInput, ShoppingProposalResult } from '../../shared/shopping';
import type { SavedRecipeDto } from '../../shared/recipes';
import { sessionExpiryMillisSql } from '../db';
import { findCatalogProducts, storeCatalogProducts, productFingerprints } from '../catalog/index';
import { PRODUCT_KNOWLEDGE_VERSION } from '../catalog/knowledge';
import { checkCurrentProduct } from '../catalog/current';
import { assessStoredProduct, assessStoredProducts } from '../matching/assessment';
import { createDetailLoader } from '../catalog/detailLoader';
import { createPlanDeadline, PlanDeadlineError } from '../catalog/planDeadline';
import { deadlineFromInput } from '../../shared/workflow';

type ShoppingEnv = AuthEnv & PicnicKeyEnv;
type Connection = { id: string; generation: number; encryptedResumeKey: string; keyVersion: string };
export interface ShoppingDependencies { provider?: PicnicProvider; now?: () => number }
const headers = { 'Cache-Control': 'no-store, private', Pragma: 'no-cache' };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
const fail = (status: number, code: string, message: string) => json({ error: { code, message } }, status);
async function connection(env: ShoppingEnv, ownerId: string): Promise<Connection | null> {
  return env.DB.prepare(`SELECT id,generation,encrypted_resume_key AS encryptedResumeKey,key_version AS keyVersion
    FROM connections WHERE owner_id=? AND status='connected' LIMIT 1`).bind(ownerId).first<Connection>();
}
/** Request-local concurrency bound, without cross-user mutable memory. */
async function mapLimited<T, U>(items: T[], run: (item: T) => Promise<U>): Promise<U[]> {
  const result = new Array<U>(items.length); let index = 0;
  await Promise.all(Array.from({ length: Math.min(3, items.length) }, async () => {
    while (index < items.length) { const current = index++; result[current] = await run(items[current]); }
  }));
  return result;
}
async function live(env: ShoppingEnv, principal: Principal, link: Connection): Promise<boolean> {
  const now = Date.now();
  return !!await env.DB.prepare(`SELECT 1 FROM connections c JOIN app_accounts a ON a.id=c.owner_id
    JOIN session_metadata sm ON sm.owner_id=a.id JOIN session s ON s.id=sm.session_id AND s.userId=a.id
    WHERE c.owner_id=? AND c.id=? AND c.generation=? AND c.status='connected' AND a.status='active'
    AND sm.session_id=? AND sm.revoked_at IS NULL AND sm.authenticated_at+2592000000>?
    AND sm.last_activity_at+1209600000>? AND (${sessionExpiryMillisSql})>?`)
    .bind(principal.ownerId, link.id, link.generation, principal.sessionId, now, now, now).first();
}
interface PlanMetrics { startedAt:number; searchRequests:number; detailRequests:number }
function catalogue(env: ShoppingEnv, principal: Principal, link: Connection, authKey: string, api: PicnicProvider, fresh: boolean, deadline?: ReturnType<typeof createPlanDeadline>, metrics?: PlanMetrics) {
  const pending = new Map<string, Promise<PicnicProduct[]>>();
  return (query: string): Promise<PicnicProduct[]> => {
    const previous = pending.get(query); if (previous) return previous;
    const task = (async () => {
      deadline?.check();
      if (!fresh) {
        const cached = await env.DB.prepare(`SELECT products_json AS products,checked_at AS checkedAt FROM shopping_catalog
          WHERE owner_id=? AND connection_id=? AND connection_generation=? AND query=? AND checked_at>?`)
          .bind(principal.ownerId, link.id, link.generation, query, Date.now() - 10 * 60_000).first<{ products: string;checkedAt:number }>();
        if (cached) {
          const parsed = JSON.parse(cached.products) as { version?: string; products?: PicnicProduct[] };
          if (parsed.version === 'picnic-products-v3-semantics' && Array.isArray(parsed.products)) {
            deadline?.check();
            await storeCatalogProducts(env.DB, {ownerId: principal.ownerId, connectionId: link.id, generation: link.generation}, parsed.products, cached.checkedAt, 'search-cache');
            const indexed = await findCatalogProducts(env.DB, {ownerId: principal.ownerId, connectionId: link.id, generation: link.generation}, query, Date.now());
            return [...new Map([...parsed.products, ...indexed].map(product => [product.id,product])).values()].slice(0,80);
          }
        }
      }
      const context = {ownerId: principal.ownerId, connectionId: link.id, generation: link.generation};
      const indexed = fresh ? [] : await findCatalogProducts(env.DB, context, query, Date.now());
      let searched: PicnicProduct[];
      if (metrics) metrics.searchRequests++;
      try { searched = (await (deadline ? deadline.run(() => api.search(authKey, query)) : api.search(authKey, query))).slice(0, 40); }
      catch (cause) { deadline?.check(); if (!fresh && indexed.length) return indexed; throw cause; }
      const products = [...new Map([...indexed, ...searched].map(product => [product.id,product])).values()].slice(0,80);
      if (!await live(env, principal, link)) throw new Error('CONNECTION_CHANGED');
      deadline?.check();
      await env.DB.prepare(`INSERT INTO shopping_catalog(owner_id,connection_id,connection_generation,query,products_json,checked_at)
        VALUES(?,?,?,?,?,?) ON CONFLICT(owner_id,connection_id,connection_generation,query)
        DO UPDATE SET products_json=excluded.products_json,checked_at=excluded.checked_at`)
        .bind(principal.ownerId, link.id, link.generation, query, JSON.stringify({ version: 'picnic-products-v3-semantics', products:searched }), Date.now()).run();
      deadline?.check();
      await storeCatalogProducts(env.DB, context, searched, Date.now());
      return products;
    })();
    pending.set(query, task); return task;
  };
}
async function plan(env: ShoppingEnv, principal: Principal, body: Record<string, unknown>, deps: ShoppingDependencies): Promise<Response> {
  const deadlineAt = deadlineFromInput(body.deadlineAt, Date.now());
  if (deadlineAt === null) return fail(400, 'INVALID_DEADLINE', 'Verstuur een geldige verwerkingstermijn.');
  const deadline = createPlanDeadline(deadlineAt);
  try { return await deadline.run(() => planWithinDeadline(env, principal, body, deps, deadline)); }
  catch (cause) {
    if (cause instanceof PlanDeadlineError) return fail(504, 'PLAN_DEADLINE_EXCEEDED', 'Het volledige boodschappenvoorstel lukte niet binnen 30 seconden. Probeer opnieuw.');
    throw cause;
  } finally { deadline.dispose(); }
}
async function planWithinDeadline(env: ShoppingEnv, principal: Principal, body: Record<string, unknown>, deps: ShoppingDependencies, deadline: ReturnType<typeof createPlanDeadline>): Promise<Response> {
  if (typeof body.recipeId !== 'string' || !validServings(body.servings)) return fail(400, 'INVALID_PLAN', 'Kies een geldig aantal personen.');
  const recipe = await loadRecipe(env, principal.ownerId, body.recipeId);
  deadline.check();
  if (!recipe) return fail(404, 'RECIPE_NOT_FOUND', 'Recept niet gevonden.');
  if (!validServings(recipe.baseServings)) return fail(422, 'BASE_SERVINGS_REQUIRED', 'Voor hoeveel personen is het oorspronkelijke recept?');
  if (recipe.ingredients.length > 200) return fail(422, 'TOO_MANY_INGREDIENTS', 'Dit recept bevat te veel ingrediënten.');
  const link = await connection(env, principal.ownerId);
  deadline.check();
  if (!link) return fail(409, 'PICNIC_NOT_CONNECTED', 'Koppel je Picnic-account via Picnic in het menu. Je recept is bewaard.');
  const authKey = await decryptCredential(env, principal.ownerId, link.id, 'resume', link.keyVersion, link.encryptedResumeKey);
  deadline.check();
  const api = deps.provider ?? createAbortablePicnicProvider({signal: deadline.signal});
  const metrics:PlanMetrics = {startedAt:Date.now(),searchRequests:0,detailRequests:0};
  const search = catalogue(env, principal, link, authKey, api, body.refresh === true, deadline, metrics);
  const loadDetails = createDetailLoader(async (id: string) => {
    deadline.check();
    if (!api.productDetails || !await live(env, principal, link)) return undefined;
    metrics.detailRequests++;
    const found = await deadline.run(() => api.productDetails!(authKey, id));
    if (found.product.id !== id) throw new Error('PRODUCT_ID_MISMATCH');
    return found;
  });
  const preferences = await env.DB.prepare(`SELECT ingredient_key AS ingredientKey,product_id AS productId FROM ingredient_preferences WHERE owner_id=?`)
    .bind(principal.ownerId).all<{ ingredientKey: string; productId: string }>();
  const preferred = new Map(preferences.results.map(row => [row.ingredientKey, row.productId]));
  const rows = await mapLimited(shoppingGroups(recipe, body.servings), async group => {
    try {
      deadline.check();
      const products = await search(group.query);
      deadline.check();
      const savedDetails = products.length ? await env.DB.prepare(`SELECT product_id,details_json,knowledge_json,knowledge_version,content_fingerprint FROM catalog_products
        WHERE owner_id=? AND connection_id=? AND connection_generation=? AND product_id IN (${products.map(() => '?').join(',')})`)
        .bind(principal.ownerId,link.id,link.generation,...products.map(product => product.id)).all<{product_id:string;details_json:string|null;knowledge_json:string|null;knowledge_version:string|null;content_fingerprint:string}>() : {results: []};
      const detailsById = new Map(savedDetails.results.map(row => [row.product_id, row]));
      const assessmentInputs: Array<{product:PicnicProduct;details?:PicnicProductDetails;knowledge?:ProductKnowledge}> = [];
      const firstSuitable = rankCandidates(group,products).find(candidate => candidate.match === 'suitable' && candidate.totalPriceCents !== null)?.product.id;
      const hasEligible = !!firstSuitable;
      const profile = INGREDIENTS.find(item=>item.key===group.knowledgeKey.split('|')[0]);
      // Spend interactive detail reads on plausible identities first. Background work
      // can investigate remaining uncertainty without repeating a chain per import.
      const detailCandidates = new Set((hasEligible ? [] : products).filter(product=>(product.displayPriceCents === null || !detailsById.get(product.id)?.details_json) &&
        (candidateFor(group,product).assessment?.status === 'unresolved' || candidateFor(group,product).match === 'suitable' && product.displayPriceCents === null))
        .sort((a,b)=>Number(!!profile?.product.test(normalizeIngredient(b.name)))-Number(!!profile?.product.test(normalizeIngredient(a.name))))
        .slice(0,2).map(product=>product.id));
      for (let product of products) {
        deadline.check();
        const context = {ownerId: principal.ownerId, connectionId: link.id, generation: link.generation};
        const saved = detailsById.get(product.id);
        let details: PicnicProductDetails | undefined = saved?.details_json ? JSON.parse(saved.details_json) : undefined;
        deadline.check();
        if ((!details || product.displayPriceCents === null) && (detailCandidates.has(product.id) || !group.pantry && product.id === firstSuitable) && api.productDetails) {
          const found = await loadDetails(product.id);
          deadline.check();
          if (found) {
            if (product.displayPriceCents === null && found.currentCheckUsable) {
              products[products.findIndex(item=>item.id===product.id)] = found.product;
              product = found.product;
            }
            details = {...found, product};
          }
          if (details && await live(env,principal,link)) await storeCatalogProducts(env.DB,context,[product],Date.now(),'search+details',details);
        }
        deadline.check();
        const knowledge = saved?.knowledge_version === PRODUCT_KNOWLEDGE_VERSION && saved.knowledge_json &&
          saved.content_fingerprint === productFingerprints(product,details).content ? JSON.parse(saved.knowledge_json) as ProductKnowledge : undefined;
        assessmentInputs.push({product,details,knowledge});
      }
      const assessments = await deadline.run(() => assessStoredProducts(env.DB,
        {ownerId:principal.ownerId,connectionId:link.id,generation:link.generation},group,assessmentInputs,{env}));
      const candidates = rankCandidates(group, products, (_group, product) => assessments.get(product.id)!);
      const eligible = candidates.filter(item => item.match === 'suitable' && item.totalPriceCents !== null);
      const remembered = eligible.find(item => item.product.id === preferred.get(group.knowledgeKey));
      return { ...group, candidates, candidatesTruncated: products.length >= 40, selectedProductId: (remembered ?? eligible[0])?.product.id ?? null, preferred: !!remembered, error: null };
    } catch (cause) {
      deadline.check();
      const code = cause instanceof Error ? cause.name : '';
      const error = code === 'PicnicResponseTooLargeError' ? 'Picnic gaf een te groot zoekantwoord.' : code === 'PicnicTimeoutError' ? 'Picnic antwoordde niet op tijd.' : 'Zoeken bij Picnic is niet gelukt.';
      return { ...group, candidates: [], selectedProductId: null, preferred: false, error };
    }
  });
  deadline.check();
  if (!await live(env, principal, link)) return fail(409, 'PICNIC_CONNECTION_CHANGED', 'De Picnic-koppeling of sessie is gewijzigd.');
  const plan: ShoppingPlan = { recipeId: recipe.id, recipeVersion: recipe.version, servings: body.servings, matcherVersion: `${KNOWLEDGE_VERSION}:${MATCH_RULES_VERSION}:${PRODUCT_KNOWLEDGE_VERSION}`, rows };
  if (env.APP_ENV === 'development') console.info(JSON.stringify({event:'shopping_plan',searchRequests:metrics.searchRequests,detailRequests:metrics.detailRequests,durationMs:Date.now()-metrics.startedAt,selected:rows.filter(row=>row.selectedProductId&&!row.pantry).length,missing:rows.filter(row=>!row.selectedProductId&&!row.pantry).length}));
  return json({ plan });
}
function parseSelection(body: Record<string, unknown>): ShoppingProposalInput | null {
  if (typeof body.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(body.requestId) || typeof body.recipeId !== 'string' || body.recipeId.length > 100 ||
    !Number.isSafeInteger(body.recipeVersion) || !validServings(body.servings) || !Array.isArray(body.choices) || !body.choices.length || body.choices.length > 200) return null;
  const choices: ShoppingChoice[] = [];
  for (const raw of body.choices) {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as Record<string, unknown>;
    if (typeof item.groupId !== 'string' || item.groupId.length > 500 || typeof item.productId !== 'string' || !item.productId || item.productId.length > 100 ||
      !Number.isSafeInteger(item.packCount) || Number(item.packCount) < 1 || Number(item.packCount) > 10_000 ||
      !Number.isSafeInteger(item.expectedPriceCents) || Number(item.expectedPriceCents) < 0 ||
      typeof item.assessmentId !== 'string' || !item.assessmentId || item.assessmentId.length > 100 ||
      typeof item.substitutionAccepted !== 'boolean' || typeof item.remember !== 'boolean') return null;
    choices.push({ groupId: item.groupId, productId: item.productId, packCount: Number(item.packCount), expectedPriceCents: Number(item.expectedPriceCents),
      substitutionAccepted: item.substitutionAccepted, remember: item.remember,
      ...(typeof item.assessmentId === 'string' && item.assessmentId.length <= 100 ? {assessmentId: item.assessmentId} : {}) });
  }
  if (new Set(choices.map(item => item.groupId)).size !== choices.length) return null;
  return { requestId: body.requestId, recipeId: body.recipeId, recipeVersion: Number(body.recipeVersion), servings: body.servings, choices };
}
async function prepare(env: ShoppingEnv, principal: Principal, body: Record<string, unknown>, deps: ShoppingDependencies,
  options: { allOrNothing?: boolean; fingerprint?: string } = {}): Promise<Response> {
  const input = parseSelection(body);
  if (!input) return fail(400, 'INVALID_SELECTION', 'Controleer je selectie en verpakkingsaantallen.');
  const fingerprint = options.fingerprint ?? JSON.stringify({ ...input, choices: [...input.choices].sort((a, b) => a.groupId.localeCompare(b.groupId)) });
  const replay = async (): Promise<Response | null> => {
    const saved = await env.DB.prepare(`SELECT fingerprint,result_json AS result FROM shopping_requests WHERE owner_id=? AND request_id=?`)
      .bind(principal.ownerId, input.requestId).first<{ fingerprint: string; result: string }>();
    return saved ? saved.fingerprint === fingerprint ? json(JSON.parse(saved.result)) : fail(409, 'SELECTION_CONFLICT', 'Deze bevestiging hoort bij een andere selectie.') : null;
  };
  const existing = await replay(); if (existing) return existing;
  const recipe = await loadRecipe(env, principal.ownerId, input.recipeId);
  if (!recipe || recipe.version !== input.recipeVersion) return fail(409, 'RECIPE_STALE', 'Het recept is gewijzigd. Haal de boodschappen opnieuw op.');
  if (!validServings(recipe.baseServings)) return fail(422, 'BASE_SERVINGS_REQUIRED', 'Voor hoeveel personen is het oorspronkelijke recept?');
  const groups = shoppingGroups(recipe, input.servings);
  if (input.choices.some(choice => !groups.some(group => group.id === choice.groupId))) return fail(400, 'INVALID_SELECTION', 'Een ingrediënt hoort niet bij dit recept.');
  const link = await connection(env, principal.ownerId);
  if (!link) return fail(409, 'PICNIC_NOT_CONNECTED', 'Koppel eerst je Picnic-account.');
  const authKey = await decryptCredential(env, principal.ownerId, link.id, 'resume', link.keyVersion, link.encryptedResumeKey);
  const api = deps.provider ?? createAbortablePicnicProvider();
  // A missing product is known not to be sent. A failed lookup is not proof of unavailability.
  let checked: Array<{ choice: ShoppingChoice; group: typeof groups[number]; product: PicnicProduct | undefined; contentFingerprint: string | null; source: string; assessment: ProductAssessment }>;
  try { checked = await mapLimited(input.choices, async choice => {
    const group = groups.find(item => item.id === choice.groupId)!;
    let current;
    try { current = await checkCurrentProduct(api, authKey, choice.productId, group.query); }
    catch { current = {product: null, contentFingerprint: null, source: 'unverified'}; }
    if (current.product && await live(env,principal,link)) await storeCatalogProducts(env.DB, {ownerId:principal.ownerId,connectionId:link.id,generation:link.generation}, [current.product],Date.now(),current.source,current.details);
    const product = current.product?.isAvailable === false ? undefined : current.product ?? undefined;
    const assessment = current.product ? await assessStoredProduct(env.DB,
      {ownerId: principal.ownerId, connectionId: link.id, generation: link.generation}, group, current.product, {details: current.details, env, allowSend: false})
      : {status: 'unresolved' as const, reason: 'Actuele productgegevens ontbreken.', hardExclusion: false, version: KNOWLEDGE_VERSION};
    return { choice, group, product, contentFingerprint: current.contentFingerprint, source: current.source, assessment };
  }); } catch { return fail(503, 'PICNIC_UNAVAILABLE', 'De actuele selectie kon niet worden gecontroleerd. Er is nog niets verstuurd.'); }
  for (const { choice, group, product, assessment } of checked) {
    if (!product) continue;
    const candidate = candidateFor(group, product, assessment);
    if (choice.assessmentId && choice.assessmentId !== assessment.id) return fail(409, 'PRODUCT_CONTENT_CHANGED', 'De productinhoud is gewijzigd. Ververs de boodschappen en controleer je keuze.');
    if (candidate.match === 'unsuitable' || candidate.match === 'unresolved') return fail(422, 'MATCH_NOT_CONFIRMED', 'Dit product is ongeschikt of onvoldoende bevestigd. Kies een passend product.');
    if (product.maxCount !== undefined && choice.packCount > product.maxCount) return fail(422, 'PRODUCT_LIMIT', 'Het gekozen aantal is bij Picnic niet beschikbaar. Pas het aantal aan.');
    if (candidate.match === 'substitution' && !choice.substitutionAccepted) return fail(422, 'SUBSTITUTION_NOT_ACCEPTED', 'Kies een vervanging eerst expliciet.');
    if (product.priceCertainty !== 'known' || unitPriceForPacks(product, choice.packCount) !== choice.expectedPriceCents) return fail(409, 'PRICE_CHANGED', 'Een prijs is gewijzigd of onzeker. Ververs de boodschappen en bevestig de actuele prijs.');
    if (!product.quantity || product.quantity.kind !== 'exact' || !product.quantity.unit || !parseRational(product.quantity.amount)?.numerator) return fail(422, 'PACKAGE_UNKNOWN', 'De verpakking is niet bekend. Kies een ander product.');
    if (choice.remember && candidate.match !== 'suitable') return fail(422, 'PREFERENCE_NOT_SUITABLE', 'Alleen een passende keuze kan worden onthouden.');
  }
  const available = checked.filter((item): item is typeof item & { product: PicnicProduct } => !!item.product);
  if (options.allOrNothing && available.length !== checked.length) {
    return json({ proposal: null, unavailable: checked.filter(item => !item.product).map(item => ({
      groupId: item.group.id, name: item.group.name, reason: item.source === 'unverified' ? 'unverified' as const : 'unavailable' as const,
    })) });
  }
  if (!available.length && checked.some(item => item.source === 'unverified')) return fail(503, 'PRODUCT_CHECK_INCOMPLETE', 'De actuele producten konden niet worden bevestigd. Er is niets verstuurd.');
  if (!available.length) return fail(422, 'NO_PRODUCTS_AVAILABLE', 'Geen geselecteerd product is nog beschikbaar. Er is niets verstuurd.');
  // One purchase/send per SKU; sources and count decisions remain explicit in the snapshot.
  const purchases = new Map<string, typeof available>();
  for (const item of available) purchases.set(item.product.id, [...(purchases.get(item.product.id) ?? []), item]);
  const id = crypto.randomUUID(), now = deps.now?.() ?? Date.now();
  const totalPriceCents = [...purchases.values()].reduce((sum, items) => { const count = items.reduce((n, item) => n + item.choice.packCount, 0); return sum + count * unitPriceForPacks(items[0].product, count)!; }, 0);
  if (!Number.isSafeInteger(totalPriceCents) || [...purchases.values()].some(items => items.reduce((sum, item) => sum + item.choice.packCount, 0) > Math.min(10_000, items[0].product.maxCount ?? 10_000))) return fail(422, 'SELECTION_TOO_LARGE', 'Deze selectie is te groot.');
  const result: ShoppingProposalResult = { proposal: { id, version: 1, totalPriceCents }, unavailable: checked.filter(item => !item.product).map(item => ({ groupId: item.group.id, name: item.group.name, reason: item.source === 'unverified' ? 'unverified' as const : 'unavailable' as const })) };
  const servings = parseRational(input.servings)!;
  const statements = [env.DB.prepare(`INSERT INTO shopping_requests(owner_id,request_id,fingerprint,proposal_id,result_json,created_at) VALUES(?,?,?,?,?,?)`)
    .bind(principal.ownerId, input.requestId, fingerprint, id, JSON.stringify(result), now),
    env.DB.prepare(`INSERT INTO proposals(id,owner_id,recipe_id,recipe_version,connection_id,connection_generation,version,status,servings_num,servings_den,checked_at,expires_at,created_at,updated_at)
      SELECT ?,?,?,?,?,?,1,'ready',?,?,?,?,?,? WHERE EXISTS(
        SELECT 1 FROM recipes r JOIN connections c ON c.owner_id=r.owner_id JOIN app_accounts a ON a.id=r.owner_id
        JOIN session_metadata sm ON sm.owner_id=a.id JOIN session s ON s.id=sm.session_id AND s.userId=a.id
        WHERE r.owner_id=? AND r.id=? AND r.version=? AND r.deleted_at IS NULL AND c.id=? AND c.generation=? AND c.status='connected'
        AND a.status='active' AND sm.session_id=? AND sm.revoked_at IS NULL AND sm.authenticated_at+2592000000>?
        AND sm.last_activity_at+1209600000>? AND (${sessionExpiryMillisSql})>?)`)
      .bind(id, principal.ownerId, recipe.id, recipe.version, link.id, link.generation, servings.numerator, servings.denominator,
        now, now + 10 * 60_000, now, now, principal.ownerId, recipe.id, recipe.version, link.id, link.generation, principal.sessionId, now, now, now)];
  let ordinal = 0;
  for (const items of purchases.values()) {
    const needId = crypto.randomUUID(), purchaseId = crypto.randomUUID();
    const product = items[0].product;
    const packCount = items.reduce((sum, item) => sum + item.choice.packCount, 0);
    const amount = parseRational(product.quantity!.amount)!;
    const decisions = items.map(({ group, choice }) => ({ groupId: group.id, sourceIds: group.sources.map(source => source.id),
      demand: group.demand, estimates: candidateFor(group, product).estimates, suggestedPackCount: candidateFor(group, product).packCount,
      chosenPackCount: choice.packCount, substitutionAccepted: choice.substitutionAccepted, query: group.query }));
    const snapshot = { ...product, contentFingerprint: items[0].contentFingerprint, checkSource: items[0].source, assessments: items.map(item => item.assessment), commercialFingerprint: productFingerprints(product).commercial, priceCents: unitPriceForPacks(product, packCount), packCount, shopping: true,
      query: items[0].group.query, decisions, matcherVersion: `${KNOWLEDGE_VERSION}:${MATCH_RULES_VERSION}:${PRODUCT_KNOWLEDGE_VERSION}` };
    // Unknown is deliberate: exact recipe/source amounts live in decisions, never fake them to satisfy a schema.
    statements.push(env.DB.prepare(`INSERT INTO proposal_needs(id,owner_id,proposal_id,ordinal,normalized_name,quantity_kind,quantity_num,quantity_den,unit,unresolved_json)
      VALUES(?,?,?,?,?,'unknown',NULL,1,NULL,?)`).bind(needId, principal.ownerId, id, ordinal, items.map(item => item.group.name).join(', '), JSON.stringify(decisions)));
    for (const sourceId of new Set(items.flatMap(item => item.group.sources.map(source => source.id)))) statements.push(env.DB.prepare(`INSERT INTO proposal_need_sources(owner_id,proposal_id,recipe_id,need_id,ingredient_id) VALUES(?,?,?,?,?)`)
      .bind(principal.ownerId, id, recipe.id, needId, sourceId));
    statements.push(env.DB.prepare(`INSERT INTO purchase_lines(id,owner_id,proposal_id,need_id,ordinal,product_snapshot_json,pack_count,pack_quantity_num,pack_quantity_den,unit,price_cents,accepted_deviation_json)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(purchaseId, principal.ownerId, id, needId, ordinal++, JSON.stringify(snapshot), packCount, amount.numerator, amount.denominator,
        product.quantity!.unit, unitPriceForPacks(product, packCount), JSON.stringify(decisions)));
  }
  for (const { choice, group, product } of available.filter(item => item.choice.remember)) statements.push(env.DB.prepare(`INSERT INTO ingredient_preferences(owner_id,ingredient_key,product_id,matcher_version,updated_at)
    VALUES(?,?,?,?,?) ON CONFLICT(owner_id,ingredient_key) DO UPDATE SET product_id=excluded.product_id,matcher_version=excluded.matcher_version,updated_at=excluded.updated_at`)
    .bind(principal.ownerId, group.knowledgeKey, product.id, KNOWLEDGE_VERSION, now));
  try { await env.DB.batch(statements); }
  catch { return await replay() ?? fail(409, 'PROPOSAL_STALE', 'Recept, koppeling of sessie is gewijzigd. Haal de boodschappen opnieuw op.'); }
  return json(result, 201);
}

async function repeatSavedRecipe(request: Request, env: ShoppingEnv, principal: Principal, recipeId: string,
  deps: ShoppingDependencies): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return fail(400, 'INVALID_BODY', 'Verstuur geldige JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof (body as Record<string, unknown>).requestId !== 'string' ||
      !/^[a-zA-Z0-9-]{16,100}$/.test((body as Record<string, string>).requestId)) return fail(400, 'INVALID_REQUEST', 'Ongeldige herhaalverzoek.');
  const requestId = (body as Record<string, string>).requestId;
  const recipe = await loadRecipe(env, principal.ownerId, recipeId);
  if (!recipe) return fail(404, 'NOT_FOUND', 'Niet gevonden.');
  const row = await env.DB.prepare(`SELECT s.recipe_version AS recipeVersion,s.snapshot_json AS snapshotJson
    FROM saved_recipe_selections s JOIN recipes r ON r.owner_id=s.owner_id AND r.id=s.recipe_id
    WHERE s.owner_id=? AND s.recipe_id=? AND r.deleted_at IS NULL`).bind(principal.ownerId, recipeId)
    .first<{ recipeVersion: number; snapshotJson: string }>();
  if (!row) return fail(404, 'SAVED_RECIPE_NOT_FOUND', 'Er is geen boodschappenkeuze voor dit recept bewaard.');
  let snapshot: { servings: string; choices: SavedRecipeDto['choices']; skippedGroupIds: string[] };
  try {
    const parsed: unknown = JSON.parse(row.snapshotJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid snapshot');
    const value = parsed as Record<string, unknown>;
    if (!validServings(value.servings) || !Array.isArray(value.choices) || !Array.isArray(value.skippedGroupIds)) throw new Error('invalid snapshot');
    const choices = value.choices.filter((entry): entry is SavedRecipeDto['choices'][number] => !!entry && typeof entry === 'object' &&
      typeof (entry as SavedRecipeDto['choices'][number]).groupId === 'string' &&
      typeof (entry as SavedRecipeDto['choices'][number]).productId === 'string' &&
      Number.isSafeInteger((entry as SavedRecipeDto['choices'][number]).packCount) &&
      (entry as SavedRecipeDto['choices'][number]).packCount > 0 && (entry as SavedRecipeDto['choices'][number]).packCount <= 10_000 &&
      typeof (entry as SavedRecipeDto['choices'][number]).substitutionAccepted === 'boolean');
    if (choices.length !== value.choices.length || !value.skippedGroupIds.every((groupId): groupId is string => typeof groupId === 'string')) throw new Error('invalid snapshot');
    snapshot = { servings: value.servings, choices, skippedGroupIds: value.skippedGroupIds };
  } catch { return fail(503, 'SAVED_RECIPE_INVALID', 'De bewaarde boodschappenkeuze kan niet worden gelezen.'); }
  // This fingerprint intentionally excludes refreshed prices and assessments. A retry
  // with the same request ID returns the original proposal instead of creating another.
  const fingerprint = JSON.stringify({ recipeId, recipeVersion: row.recipeVersion, servings: snapshot.servings,
    choices: [...snapshot.choices].map(choice => ({ groupId: choice.groupId, productId: choice.productId,
      packCount: choice.packCount, substitutionAccepted: choice.substitutionAccepted })).sort((a, b) => a.groupId.localeCompare(b.groupId)),
    skippedGroupIds: [...snapshot.skippedGroupIds].sort() });
  const prior = await env.DB.prepare(`SELECT fingerprint,result_json AS result FROM shopping_requests WHERE owner_id=? AND request_id=?`)
    .bind(principal.ownerId, requestId).first<{ fingerprint: string; result: string }>();
  if (prior) return prior.fingerprint === fingerprint ? json(JSON.parse(prior.result))
    : fail(409, 'SELECTION_CONFLICT', 'Deze herhaling hoort bij een andere bewaarde selectie.');
  if (row.recipeVersion !== recipe.version) return fail(409, 'RECIPE_STALE', 'Het recept is gewijzigd. Bewaar je productkeuzes opnieuw.');
  let groups;
  try { groups = shoppingGroups(recipe, snapshot.servings); }
  catch { return fail(409, 'RECIPE_STALE', 'De bewaarde porties passen niet meer bij dit recept.'); }
  const groupIds = new Set(groups.map(group => group.id));
  const selectedIds = snapshot.choices.map(choice => choice.groupId);
  const allIds = new Set([...selectedIds, ...snapshot.skippedGroupIds]);
  if (new Set(selectedIds).size !== selectedIds.length || allIds.size !== groupIds.size ||
      [...groupIds].some(groupId => !allIds.has(groupId)) || [...allIds].some(groupId => !groupIds.has(groupId))) {
    return fail(409, 'RECIPE_STALE', 'De bewaarde keuzes passen niet meer bij dit recept. Bewaar ze opnieuw.');
  }
  if (!snapshot.choices.length) return json({ proposal: null, unavailable: [] });
  const link = await connection(env, principal.ownerId);
  if (!link) return fail(409, 'PICNIC_NOT_CONNECTED', 'Koppel eerst je Picnic-account.');
  const authKey = await decryptCredential(env, principal.ownerId, link.id, 'resume', link.keyVersion, link.encryptedResumeKey);
  const api = deps.provider ?? createAbortablePicnicProvider();
  type RepeatCheck = { choice: SavedRecipeDto['choices'][number]; expectedPriceCents: number; assessmentId?: string } |
    { groupId: string; name: string; reason: 'unverified' | 'unavailable' } |
    { groupId: string; name: string; review: 'MATCH_NOT_CONFIRMED' | 'SUBSTITUTION_NOT_ACCEPTED' | 'PRICE_UNAVAILABLE' };
  const issues = await mapLimited<SavedRecipeDto['choices'][number], RepeatCheck>(snapshot.choices, async choice => {
    const group = groups.find(item => item.id === choice.groupId)!;
    try {
      const current = await checkCurrentProduct(api, authKey, choice.productId, group.query);
      if (!current.product || current.product.isAvailable === false) return {
        groupId: group.id, name: group.name, reason: current.product?.isAvailable === false ? 'unavailable' as const : 'unverified' as const,
      };
      if (await live(env, principal, link)) await storeCatalogProducts(env.DB,
        { ownerId: principal.ownerId, connectionId: link.id, generation: link.generation }, [current.product], Date.now(), current.source, current.details);
      const assessment = await assessStoredProduct(env.DB, { ownerId: principal.ownerId, connectionId: link.id, generation: link.generation },
        group, current.product, { details: current.details, env, allowSend: false });
      const candidate = candidateFor(group, current.product, assessment);
      if (candidate.match === 'unsuitable' || candidate.match === 'unresolved') return { groupId: group.id, name: group.name, review: 'MATCH_NOT_CONFIRMED' };
      if (candidate.match === 'substitution' && !choice.substitutionAccepted) return { groupId: group.id, name: group.name, review: 'SUBSTITUTION_NOT_ACCEPTED' };
      const expectedPriceCents = unitPriceForPacks(current.product, choice.packCount);
      if (expectedPriceCents === null) return { groupId: group.id, name: group.name, review: 'PRICE_UNAVAILABLE' };
      return { choice, expectedPriceCents, assessmentId: assessment.id };
    } catch (cause) {
      return { groupId: group.id, name: group.name, reason: 'unverified' as const };
    }
  });
  const reviews = issues.filter((item): item is Extract<RepeatCheck, { review: string }> => 'review' in item);
  if (reviews.length) return fail(409, reviews[0].review, 'Een bewaard product moet opnieuw worden gecontroleerd voordat het kan worden toegevoegd.');
  const unavailable = issues.filter((item): item is Extract<RepeatCheck, { reason: string }> => 'reason' in item);
  if (unavailable.length) {
    return json({ proposal: null, unavailable });
  }
  const choices = issues.map(item => {
    if ('reason' in item || 'review' in item) throw new Error('unreachable unavailable or review item');
    return { groupId: item.choice.groupId, productId: item.choice.productId, packCount: item.choice.packCount,
      substitutionAccepted: item.choice.substitutionAccepted, remember: false,
      expectedPriceCents: item.expectedPriceCents, ...(item.assessmentId ? { assessmentId: item.assessmentId } : {}) };
  });
  const selectionBody = { requestId, recipeId, recipeVersion: recipe.version, servings: snapshot.servings, choices };
  return prepare(env, principal, selectionBody, deps, { allOrNothing: true, fingerprint });
}
export async function handleShopping(request: Request, env: ShoppingEnv, deps: ShoppingDependencies = {}): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const repeatPath = path.match(/^\/api\/recipes\/([^/]+)\/repeat$/);
  if (repeatPath) {
    if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Gebruik POST.');
    if (request.headers.get('Origin') !== env.APP_ORIGIN) return fail(403, 'ORIGIN_DENIED', 'Dit verzoek is niet toegestaan.');
    if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') return fail(400, 'INVALID_CONTENT_TYPE', 'Verstuur geldige JSON.');
    const principal = await requirePrincipal(request, env);
    if (!principal) return fail(401, 'UNAUTHENTICATED', 'Log opnieuw in.');
    let recipeId: string;
    try { recipeId = decodeURIComponent(repeatPath[1]); } catch { return fail(400, 'INVALID_ID', 'Ongeldige receptverwijzing.'); }
    return repeatSavedRecipe(request, env, principal, recipeId, deps);
  }
  if (!['/api/shopping/plan', '/api/shopping/proposals'].includes(path)) return null;
  if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Gebruik POST.');
  if (request.headers.get('Origin') !== env.APP_ORIGIN) return fail(403, 'ORIGIN_DENIED', 'Dit verzoek is niet toegestaan.');
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') return fail(400, 'INVALID_CONTENT_TYPE', 'Verstuur geldige JSON.');
  const principal = await requirePrincipal(request, env);
  if (!principal) return fail(401, 'UNAUTHENTICATED', 'Log opnieuw in.');
  let body: unknown; try { body = await request.json(); } catch { return fail(400, 'INVALID_BODY', 'Verstuur geldige JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'INVALID_BODY', 'Verstuur geldige JSON.');
  return path.endsWith('/plan') ? plan(env, principal, body as Record<string, unknown>, deps) : prepare(env, principal, body as Record<string, unknown>, deps);
}
