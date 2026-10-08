import PicnicClient from 'picnic-api-worker';
import { createHash } from 'node:crypto';
import type { Cart } from 'picnic-api-worker/lib/domains/cart/types';
import type { SellingUnit } from 'picnic-api-worker/lib/types/fusion';
import type { PicnicCartLine, PicnicProduct } from '../../shared/picnic';
import { formatRational, parseRational } from '../../shared/quantities';

export interface PicnicProvider {
  login(username: string, password: string): Promise<{ authKey: string; requiresSms: boolean; externalIdentity: string }>;
  requestSms(authKey: string): Promise<void>;
  verifySms(authKey: string, code: string): Promise<{ authKey: string }>;
  search(authKey: string, query: string): Promise<PicnicProduct[]>;
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
    // A readable cart response confirms receipt; a malformed success is still uncertain.
    const cart = record(result.data);
    if (!cart || cart.type !== 'ORDER' || !Array.isArray(cart.items)) throw new PicnicTransportUncertainError();
  } catch {
    // Even a rejection may follow a provider-side write. Never silently retry a cart mutation.
    throw new PicnicTransportUncertainError();
  }
}

async function limitedBody(response: Response): Promise<unknown> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > RESPONSE_LIMIT_BYTES) {
        await reader.cancel();
        throw new Error('Picnic response too large');
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

async function picnicRequest(path: string, options: { method?: 'GET' | 'POST'; authKey?: string; body?: unknown; headers?: boolean } = {}): Promise<{ data: unknown; authKey: string | null }> {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), REQUEST_DEADLINE_MS);
  try {
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
    const data = await limitedBody(response);
    return { data, authKey: response.headers.get('x-picnic-auth') };
  } catch (error) {
    if (controller.signal.aborted) throw new PicnicTimeoutError();
    if (error instanceof PicnicRejectedError) throw error;
    throw new PicnicTransportUncertainError();
  } finally { clearTimeout(deadline); }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function sellingUnits(value: unknown): SellingUnit[] {
  const found: SellingUnit[] = [];
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let visited = 0;
  while (stack.length && found.length < 40 && visited++ < 5000) {
    const next = stack.pop()!;
    if (next.depth > 32) continue;
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
    for (const entry of Object.values(object)) stack.push({ value: entry, depth: next.depth + 1 });
  }
  if (stack.length && found.length < 40) throw new Error('Picnic search response too complex');
  return found;
}

/** An abortable transport for the five Picnic calls used here. picnic-api 4.10 has no signal option. */
export function createAbortablePicnicProvider(): PicnicProvider {
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
      const result = await picnicRequest(`/pages/search-page-results?search_term=${encodeURIComponent(query)}`, { authKey, headers: true });
      return sellingUnits(result.data).map(normalizeProduct);
    },
    async cart(authKey) {
      const result = await picnicRequest('/cart', { authKey, headers: true });
      return normalizeCart(result.data as Cart);
    },
  };
}

function productQuantity(label: string): PicnicProduct['quantity'] {
  const value = label.trim().toLowerCase().replace(',', '.');
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
    displayPriceCents, priceCertainty: displayPriceCents === null ? 'unknown' : ranges.length ? 'conditional' : 'known',
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
      lines.push({ productId: item.id.slice(0, 120), name: String(item.name ?? '').slice(0, 240),
        unitQuantity: String(item.unit_quantity ?? '').slice(0, 120), quantity: analyticsItem?.quantity ?? null,
        unitPriceCents: safePrice(item.price), isAvailable: analyticsItem?.isAvailable ?? null });
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
