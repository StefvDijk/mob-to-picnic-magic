import PicnicClient from 'picnic-api-worker';
import { createHash } from 'node:crypto';
import type { Cart } from 'picnic-api-worker/lib/domains/cart/types';
import type { SellingUnit } from 'picnic-api-worker/lib/types/fusion';
import type { PicnicCartLine, PicnicProduct, PicnicProductDetails } from '../../shared/picnic';
import { formatRational, parseRational } from '../../shared/quantities';

export interface PicnicProvider {
  login(username: string, password: string): Promise<{ authKey: string; requiresSms: boolean; externalIdentity: string }>;
  requestSms(authKey: string): Promise<void>;
  verifySms(authKey: string, code: string): Promise<{ authKey: string }>;
  search(authKey: string, query: string): Promise<PicnicProduct[]>;
  searchDiagnostics?(authKey: string, query: string, productId: string): Promise<{ products: PicnicProduct[]; diagnostic: NonNullable<PicnicProductDetails['diagnostic']> }>;
  categoryPage?(authKey: string, level: 'root' | 'L1' | 'L2', categoryId?: string): Promise<{ products: PicnicProduct[]; coverageProven: false }>;
  observedProductDetails?(authKey: string, previous: PicnicProductDetails, route: string): Promise<PicnicProductDetails>;
  productDetails?(authKey: string, productId: string): Promise<PicnicProductDetails>;
  cart(authKey: string): Promise<PicnicCartLine[]>;
}

export interface PicnicClientLike {
  auth: {
    login(username: string, password: string): Promise<{ authKey: string; second_factor_authentication_required: boolean; user_id: string }>;
    generate2FACode(channel: string): Promise<null>;
    verify2FACode(code: string): Promise<{ authKey: string }>;
  };
  catalog: { search(query: string): Promise<SellingUnit[]> };
  cart: { getCart(): Promise<Cart> };
}
export type PicnicClientFactory = (options: { countryCode: 'NL'; authKey?: string }) => PicnicClientLike;
const defaultFactory: PicnicClientFactory = options => new PicnicClient(options) as unknown as PicnicClientLike;
const PICNIC_URL = 'https://storefront-prod.nl.picnicinternational.com/api/15';
const REQUEST_DEADLINE_MS = 10_000;
const RESPONSE_LIMIT_BYTES = 2_000_000;
export class PicnicTransportUncertainError extends Error {
  constructor(message = 'Picnic transport outcome uncertain') { super(message); this.name = 'PicnicTransportUncertainError'; }
}
export class PicnicTimeoutError extends PicnicTransportUncertainError {
  constructor() { super('Picnic request timed out'); this.name = 'PicnicTimeoutError'; }
}
export class PicnicResponseTooLargeError extends PicnicTransportUncertainError {
  constructor() { super('Picnic response exceeds bounded size'); this.name = 'PicnicResponseTooLargeError'; }
}
class PicnicRejectedError extends Error {}

/** Only call after the durable execution line has been marked sending. Never retries. */
export async function addPicnicProduct(authKey: string, productId: string, count: number): Promise<void> {
  if (!authKey || !productId || productId.length > 100 || !Number.isSafeInteger(count) || count < 1 || count > 10_000) {
    throw new TypeError('Invalid Picnic addition');
  }
  try {
    const result = await picnicRequest('/cart/add_product', {
      method: 'POST', authKey, headers: true, body: { product_id: productId, count },
    });
    // ORDER is a cart snapshot, not a correlated receipt for this mutation.
    const cart = record(result.data);
    if (!cart || cart.type !== 'ORDER' || !Array.isArray(cart.items)) throw new PicnicTransportUncertainError();
    // No correlated product/count receipt has yet been observed on this route.
    // A cart difference can also be caused by simultaneous external edits.
    throw new PicnicTransportUncertainError('Picnic addition receipt not proven');
  } catch {
    // Even a rejection may follow a provider-side write. Never silently retry a cart mutation.
    throw new PicnicTransportUncertainError();
  }
}

async function limitedBody(response: Response, byteLimit = RESPONSE_LIMIT_BYTES): Promise<unknown> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > byteLimit) {
        await reader.cancel();
        throw new PicnicResponseTooLargeError();
      }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  if (!size) return null;
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

async function picnicRequest(path: string, options: { method?: 'GET' | 'POST'; authKey?: string; body?: unknown; headers?: boolean; byteLimit?: number; signal?: AbortSignal } = {}): Promise<{ data: unknown; authKey: string | null }> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, {once: true});
  if (options.signal?.aborted) controller.abort();
  const deadline = setTimeout(() => controller.abort(), REQUEST_DEADLINE_MS);
  try {
    if (controller.signal.aborted) throw new PicnicTimeoutError();
    const response = await fetch(`${PICNIC_URL}${path}`, {
      method: options.method ?? 'GET', signal: controller.signal,
      headers: {
        'User-Agent': 'okhttp/4.9.0', 'Content-Type': 'application/json; charset=UTF-8', 'Accept-Language': 'nl',
        ...(options.authKey ? { 'x-picnic-auth': options.authKey } : {}),
        ...(options.headers ? { 'x-picnic-agent': '30100;1.246.1-15599;', 'x-picnic-did': '3C417201548B2E3B' } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    // Provider errors are deliberately not parsed or exposed to callers.
    if (!response.ok) {
      await response.body?.cancel();
      throw new PicnicRejectedError('Picnic request failed');
    }
    const data = await limitedBody(response, options.byteLimit);
    return { data, authKey: response.headers.get('x-picnic-auth') };
  } catch (error) {
    if (controller.signal.aborted) throw new PicnicTimeoutError();
    if (error instanceof PicnicRejectedError || error instanceof PicnicTransportUncertainError) throw error;
    throw new PicnicTransportUncertainError();
  } finally { clearTimeout(deadline); options.signal?.removeEventListener('abort', abort); }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function sellingUnits(value: unknown): SellingUnit[] {
  const found: SellingUnit[] = [];
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let visited = 0;
  while (stack.length && found.length < 40 && visited++ < 50000) {
    const next = stack.pop()!;
    if (next.depth > 64) continue;
    if (Array.isArray(next.value)) {
      for (let i = next.value.length - 1; i >= 0; i--) stack.push({ value: next.value[i], depth: next.depth + 1 });
      continue;
    }
    const object = record(next.value);
    if (!object) continue;
    const product = record(object.sellingUnit);
    if (product && typeof product.id === 'string' && product.id && typeof product.name === 'string') {
      found.push(product as SellingUnit);
    }
    for (const [key, entry] of Object.entries(object)) {
      if (key !== 'sellingUnit' && entry && typeof entry === 'object') stack.push({ value: entry, depth: next.depth + 1 });
    }
  }
  if (stack.length && found.length < 40) throw new Error('Picnic search response too complex');
  return found;
}

/** An abortable transport for the five Picnic calls used here. picnic-api 4.10 has no signal option. */
export function createAbortablePicnicProvider(readOptions: {signal?: AbortSignal} = {}): PicnicProvider {
  return {
    async login(username, password) {
      const secret = createHash('md5').update(password, 'utf8').digest('hex');
      const result = await picnicRequest('/user/login', { method: 'POST', body: { key: username, secret, client_id: 30100 } });
      const data = record(result.data);
      if (!result.authKey || !data || typeof data.user_id !== 'string' || typeof data.second_factor_authentication_required !== 'boolean') {
        throw new Error('Invalid Picnic login response');
      }
      return { authKey: result.authKey, requiresSms: data.second_factor_authentication_required, externalIdentity: data.user_id };
    },
    async requestSms(authKey) {
      await picnicRequest('/user/2fa/generate', { method: 'POST', authKey, headers: true, body: { channel: 'SMS' } });
    },
    async verifySms(authKey, code) {
      const result = await picnicRequest('/user/2fa/verify', { method: 'POST', authKey, headers: true, body: { otp: code } });
      if (!result.authKey) throw new Error('Invalid Picnic verification response');
      return { authKey: result.authKey };
    },
    async search(authKey, query) {
      const result = await picnicRequest(`/pages/search-page-results?search_term=${encodeURIComponent(query)}`, { authKey, headers: true, byteLimit: 4_000_000, signal: readOptions.signal });
      return sellingUnits(result.data).map(normalizeProduct);
    },
    async searchDiagnostics(authKey, query, productId) {
      if (!query.trim() || query.length > 120 || !/^[a-zA-Z0-9_-]{1,100}$/.test(productId)) throw new TypeError('Invalid diagnostic search');
      const result = await picnicRequest(`/pages/search-page-results?search_term=${encodeURIComponent(query)}`, { authKey, headers: true, byteLimit: 4_000_000 });
      const units = sellingUnits(result.data);
      return { products: units.map(normalizeProduct), diagnostic: diagnosticMetadata(result.data, units.filter(unit => unit.id === productId) as unknown as Record<string, unknown>[], productId) };
    },
    async categoryPage(authKey, level, categoryId) {
      if (!['root', 'L1', 'L2'].includes(level) || (level !== 'root' && (!categoryId || !/^[a-zA-Z0-9_-]{1,100}$/.test(categoryId)))) throw new TypeError('Invalid category route');
      const path = level === 'root' ? '/pages/category-tree-root' : `/pages/${level}-category-page-root?category_id=${encodeURIComponent(categoryId!)}`;
      const result = await picnicRequest(path, { authKey, headers: true });
      // RSC references and pagination have not been proved: only observed JSON products.
      return { products: sellingUnits(result.data).map(normalizeProduct), coverageProven: false };
    },
    async observedProductDetails(authKey, previous, route) {
      if (!previous.diagnostic?.observedReadLinks.includes(route)) throw new TypeError('Unobserved Picnic route');
      const path = route.startsWith('/pages/') ? route : `/pages/${route}`;
      const parsed = new URL(path, PICNIC_URL);
      if (parsed.pathname !== '/pages/product-details-page-root' || parsed.searchParams.get('id') !== previous.product.id
        || [...parsed.searchParams.keys()].some(key => !['id', 'show_category_action', 'show_remove_from_purchases_page_action'].includes(key))) throw new TypeError('Unsupported observed product route');
      const result = await picnicRequest(path, { authKey, headers: true });
      return normalizeProductDetails(previous.product.id, result.data);
    },
    async productDetails(authKey, productId) {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(productId)) throw new TypeError('Invalid Picnic product ID');
      const result = await picnicRequest(`/pages/product-details-page-root?id=${encodeURIComponent(productId)}&show_category_action=true&show_remove_from_purchases_page_action=true`, { authKey, headers: true, signal: readOptions.signal });
      return normalizeProductDetails(productId, result.data);
    },
    async cart(authKey) {
      const result = await picnicRequest('/cart', { authKey, headers: true });
      return normalizeCart(result.data as Cart);
    },
  };
}

function productQuantity(label: string): PicnicProduct['quantity'] {
  const value = label.trim().toLowerCase().replace(',', '.')
    .replace(/\bkilo(?:gram)?\b/g, 'kg').replace(/\bgram\b/g, 'g').replace(/\bmilliliter\b/g, 'ml').replace(/\bliter\b/g, 'l');
  const multi = value.match(/^(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l)$/);
  if (multi) {
    const count = Number(multi[1]);
    const itemAmount = parseRational(multi[2]);
    if (!Number.isSafeInteger(count) || count < 1 || !itemAmount) return null;
    const amount = { numerator: itemAmount.numerator * count, denominator: itemAmount.denominator };
    if (!Number.isSafeInteger(amount.numerator)) return null;
    return { kind: 'exact', amount: formatRational(amount), unit: multi[3] as 'g' | 'kg' | 'ml' | 'l', basis: null };
  }
  const measured = value.match(/^(\d+(?:\.\d+)?)\s*(kg|g|ml|l)$/);
  if (measured) {
    const amount = parseRational(measured[1]);
    return amount ? { kind: 'exact', amount: formatRational(amount), unit: measured[2] as 'g' | 'kg' | 'ml' | 'l', basis: null } : null;
  }
  const pieces = value.match(/^(\d+)\s*(?:stuks?|pieces?|pcs)$/);
  if (pieces && Number.isSafeInteger(Number(pieces[1])) && Number(pieces[1]) > 0) {
    return { kind: 'exact', amount: pieces[1], unit: 'piece', basis: null };
  }
  if (/^(?:1\s*)?(?:stuk|piece|pc)$/.test(value)) return { kind: 'exact', amount: '1', unit: 'piece', basis: null };
  return null;
}

function safePrice(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function explicitProductAvailability(value: Record<string, unknown>): boolean | undefined {
  const explicit = typeof value.is_available === 'boolean' ? value.is_available : undefined;
  const unavailable = Array.isArray(value.decorators) && value.decorators.some(entry => record(entry)?.type === 'UNAVAILABLE');
  if (unavailable && explicit === true) return undefined;
  return unavailable ? false : explicit;
}

export function normalizeProduct(item: SellingUnit): PicnicProduct {
  const displayPriceCents = safePrice(item.display_price);
  const ranges = Array.isArray(item.price_ranges) ? item.price_ranges.flatMap(range => {
    const priceCents = safePrice(range?.price);
    if (priceCents === null || !Number.isSafeInteger(range?.from_quantity) || range.from_quantity < 1) return [];
    return [{ fromQuantity: range.from_quantity, priceCents }];
  }) : [];
  return {
    id: String(item.id).slice(0, 120), name: String(item.name).slice(0, 240),
    unitQuantity: String(item.unit_quantity ?? '').slice(0, 120), quantity: productQuantity(String(item.unit_quantity ?? '')),
    displayPriceCents, priceCertainty: displayPriceCents === null ? 'unknown' : ranges.length && !ranges.some(range => range.fromQuantity === 1 && range.priceCents === displayPriceCents) ? 'conditional' : 'known',
    ...(Number.isSafeInteger(item.max_count) && item.max_count >= 0 ? { maxCount: item.max_count } : {}),
    ...(explicitProductAvailability(item as unknown as Record<string, unknown>) !== undefined ? { isAvailable: explicitProductAvailability(item as unknown as Record<string, unknown>) } : {}),
    ...(typeof (item as unknown as Record<string, unknown>).image_id === 'string' ? { imageId: String((item as unknown as Record<string, unknown>).image_id).slice(0, 120) } : {}),
    priceRanges: ranges, identity: { groupId: String(item.id).slice(0, 120), variantId: String(item.id).slice(0, 120) },
  };
}

function normalizeCart(cart: Cart): PicnicCartLine[] {
  const analytics = new Map<string, { quantity: number | null; isAvailable: boolean | null }>();
  for (const item of Array.isArray(cart?.analytics_context_data?.items_list) ? cart.analytics_context_data.items_list : []) {
    if (typeof item?.product_id === 'string') analytics.set(item.product_id, {
      quantity: Number.isSafeInteger(item.quantity) && item.quantity >= 0 ? item.quantity : null,
      isAvailable: typeof item.is_available === 'boolean' ? item.is_available : null,
    });
  }
  const lines: PicnicCartLine[] = [];
  for (const line of Array.isArray(cart?.items) ? cart.items : []) {
    for (const item of Array.isArray(line?.items) ? line.items : []) {
      if (!item || typeof item.id !== 'string' || !item.id) continue;
      const analyticsItem = analytics.get(item.id);
      // PRICE decorates the whole order line. Only attribute it to a unit when
      // that line unambiguously contains one article and one pack.
      const discount = line.items.length === 1 && analyticsItem?.quantity === 1
        ? line.decorators?.find(decorator => decorator.type === 'PRICE') : undefined;
      const unitPriceCents = discount?.type === 'PRICE'
        ? safePrice(discount.display_price) ?? safePrice(item.price) : safePrice(item.price);
      lines.push({ productId: item.id.slice(0, 120), name: String(item.name ?? '').slice(0, 240),
        unitQuantity: String(item.unit_quantity ?? '').slice(0, 120), quantity: analyticsItem?.quantity ?? null,
        unitPriceCents, isAvailable: analyticsItem?.isAvailable ?? null });
    }
  }
  return lines;
}

export function createPicnicProvider(factory: PicnicClientFactory = defaultFactory): PicnicProvider {
  const client = (authKey?: string) => factory(authKey ? { countryCode: 'NL', authKey } : { countryCode: 'NL' });
  return {
    async login(username, password) {
      const result = await client().auth.login(username, password);
      return { authKey: result.authKey, requiresSms: result.second_factor_authentication_required, externalIdentity: result.user_id };
    },
    async requestSms(authKey) { await client(authKey).auth.generate2FACode('SMS'); },
    async verifySms(authKey, code) { return client(authKey).auth.verify2FACode(code); },
    async search(authKey, query) { return (await client(authKey).catalog.search(query)).slice(0, 40).map(normalizeProduct); },
    async cart(authKey) { return normalizeCart(await client(authKey).cart.getCart()); },
  };
}

/** Bounded structural parsing; never executes PML or infers a stock flag from an order limit. */
export function normalizeProductDetails(productId: string, value: unknown): PicnicProductDetails {
  const nodes: Record<string, unknown>[] = [];
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let visited = 0;
  while (stack.length) {
    if (++visited > 50000) throw new Error('Picnic details response too complex');
    const next = stack.pop()!;
    if (next.depth > 64) throw new Error('Picnic details response too deep');
    if (Array.isArray(next.value)) { for (const entry of next.value) stack.push({ value: entry, depth: next.depth + 1 }); continue; }
    const object = record(next.value);
    if (!object) continue;
    nodes.push(object);
    for (const entry of Object.values(object)) if (entry && typeof entry === 'object') stack.push({ value: entry, depth: next.depth + 1 });
  }
  const units = nodes.map(node => record(node.sellingUnit)).filter((unit): unit is Record<string, unknown> => !!unit && unit.id === productId && typeof unit.name === 'string');
  if (!units.length) throw new Error('Picnic details missing requested selling unit');
  const unit = units.find(entry => entry.max_count !== undefined) ?? units[0];
  const normalizedUnit = { ...unit };
  const main = nodes.find(node => node.id === 'product-details-page-root-main-container');
  const component = record(record(main?.pml)?.component);
  const children = Array.isArray(component?.children) ? component.children.map(record).filter((entry): entry is Record<string, unknown> => !!entry) : [];
  const cleanText = (value: unknown) => typeof value === 'string' ? value.replace(/#\([A-Za-z0-9#_]+\)/g, '').replace(/\*\*|__/g, '').trim() : '';
  const name = cleanText(children.find(child => child.textType === 'HEADER1')?.markdown);
  if (name) normalizedUnit.name = name;
  const stackNode = children.find(child => child.type === 'STACK');
  const quantityNode = Array.isArray(stackNode?.children) ? stackNode.children.map(record).find(child => child?.type === 'RICH_TEXT') : undefined;
  const unitQuantity = cleanText(quantityNode?.markdown);
  if (unitQuantity) normalizedUnit.unit_quantity = unitQuantity;
  const brand = cleanText(children.find(child => record(child.textAttributes)?.weight === 'REGULAR')?.markdown);
  // PRICE components only inside the requested product's main container, never alternatives or arbitrary numbers.
  const priceNodes: number[] = [];
  const priceWalk = (entry: unknown, depth = 0) => {
    if (depth > 64) return;
    if (Array.isArray(entry)) { entry.forEach(child => priceWalk(child, depth + 1)); return; }
    const object = record(entry); if (!object) return;
    if (object.type === 'PRICE' && object.isCrossed !== true && Number.isSafeInteger(object.price) && Number(object.price) >= 0) priceNodes.push(Number(object.price));
    for (const child of Object.values(object)) if (child && typeof child === 'object') priceWalk(child, depth + 1);
  };
  priceWalk(main);
  const uniquePrices = [...new Set(priceNodes)];
  if (normalizedUnit.display_price === undefined && uniquePrices.length === 1) normalizedUnit.display_price = uniquePrices[0];
  const explicitAvailability = nodes.filter(node => node.product_id === productId || node.id === productId || node.sellingUnitId === productId)
    .flatMap(node => [ ...(typeof node.is_available === 'boolean' ? [node.is_available] : []), ...(Array.isArray(node.decorators) && node.decorators.some(entry => record(entry)?.type === 'UNAVAILABLE') ? [false] : []) ]);
  if (explicitAvailability.length && explicitAvailability.every(value => value === explicitAvailability[0])) normalizedUnit.is_available = explicitAvailability[0];
  else if (explicitAvailability.length) delete normalizedUnit.is_available;
  const product = normalizeProduct(normalizedUnit as unknown as SellingUnit);
  if (explicitAvailability.length && !explicitAvailability.every(value => value === explicitAvailability[0])) delete product.isAvailable;
  if (brand) product.brand = brand;
  const texts = (root: unknown): string[] => {
    const out: string[] = [];
    const walk = (entry: unknown, depth: number) => {
      if (depth > 64 || out.length >= 200) return;
      if (Array.isArray(entry)) { entry.forEach(child => walk(child, depth + 1)); return; }
      const object = record(entry); if (!object) return;
      if (typeof object.markdown === 'string') out.push(object.markdown.slice(0, 4000));
      for (const child of Object.values(object)) if (child && typeof child === 'object') walk(child, depth + 1);
    };
    walk(root, 0); return out;
  };
  const original = texts(nodes.find(node => node.id === 'product-page-allergies'));
  const contains: string[] = [], mayContain: string[] = [];
  let group: string[] | null = null;
  for (const text of original) {
    const heading = text.replace(/[*_]/g, '').trim();
    if (/^bevat mogelijk$/i.test(heading)) group = mayContain;
    else if (/^bevat$/i.test(heading)) group = contains;
    else group?.push(text);
  }
  const infoSections = nodes.filter(node => typeof node.title === 'string' && typeof node.content === 'string').slice(0, 30)
    .map(node => ({ title: String(node.title).slice(0, 200), content: String(node.content).slice(0, 4000) }));
  for (const node of nodes) {
    if (!Array.isArray(node.items)) continue;
    for (const item of node.items.slice(0, 30)) {
      const section = record(item);
      if (!section?.header || !section.body) continue;
      const title = texts(section.header).join(' ').slice(0, 200);
      const content = texts(section.body).join('\n').slice(0, 4000);
      if (title && content && infoSections.length < 30) infoSections.push({ title, content });
    }
  }
  return { product, description: texts(nodes.find(node => node.id === 'description')).join('\n') || null,
    infoSections, allergens: { contains, mayContain, original }, parserVersion: 'fusion-explicit-v2',
    diagnostic: diagnosticMetadata(value, units, productId),
    currentCheckUsable: product.displayPriceCents !== null && product.priceCertainty === 'known' && product.quantity !== null && typeof product.isAvailable === 'boolean' && product.maxCount !== undefined };
}

function diagnosticMetadata(value: unknown, units: Record<string, unknown>[], productId: string): NonNullable<PicnicProductDetails['diagnostic']> {
  const fieldPaths: Array<{ path: string; type: string }> = [];
  const observedReadLinks = new Set<string>();
  const availabilitySignals: Array<{ path: string; type: string; value?: string | boolean }> = [];
  const stack = [{ value, path: '$', depth: 0 }];
  let visited = 0;
  while (stack.length && visited++ < 50000) {
    const entry = stack.pop()!;
    if (entry.depth > 64) continue;
    if (Array.isArray(entry.value)) { entry.value.forEach((child, index) => stack.push({ value: child, path: `${entry.path}[${index}]`, depth: entry.depth + 1 })); continue; }
    const object = record(entry.value); if (!object) continue;
    if (availabilitySignals.length < 20 && (object.product_id === productId || object.id === productId || object.sellingUnitId === productId)) {
      if (typeof object.is_available === 'boolean') availabilitySignals.push({ path: `${entry.path}.is_available`.slice(0, 300), type: 'explicit_boolean', value: object.is_available });
      if (Array.isArray(object.decorators) && object.decorators.some(decorator => record(decorator)?.type === 'UNAVAILABLE')) availabilitySignals.push({ path: `${entry.path}.decorators`.slice(0, 300), type: 'unavailable_decorator', value: false });
      if (typeof object.type === 'string' && ['UNAVAILABILITY_CONTAINER', 'ACCESSIBILITY_CONTAINER', 'STEPPER'].includes(object.type)) availabilitySignals.push({ path: entry.path.slice(0, 300), type: object.type });
      const status = record(object.availabilityStatus);
      if (typeof status?.type === 'string' && /^[A-Z_]{1,40}$/.test(status.type)) availabilitySignals.push({ path: `${entry.path}.availabilityStatus.type`.slice(0, 300), type: 'unverified_status_label', value: status.type });
    }
    for (const [key, child] of Object.entries(object)) {
      const path = `${entry.path}.${key}`;
      if (fieldPaths.length < 60 && /^(sellingUnit|price|display_price|unit_quantity|is_available|max_count|enabled|disabled|type|product_id|sellingUnitId|availabilityStatus)$/.test(key)) {
        fieldPaths.push({ path: path.slice(0, 300), type: child === null ? 'null' : typeof child });
      }
      if (typeof child === 'string' && observedReadLinks.size < 20 && /^(\/pages\/)?(product-details-page-root|category-tree-root|L[12]-category-page-root)(\?|$)/.test(child) && child.length <= 500) observedReadLinks.add(child);
      if (child && typeof child === 'object') stack.push({ value: child, path, depth: entry.depth + 1 });
    }
  }
  return { sellingUnitKeys: [...new Set(units.flatMap(unit => Object.keys(unit)))].slice(0, 60), fieldPaths, observedReadLinks: [...observedReadLinks], availabilitySignals: availabilitySignals.slice(0, 20) };
}
