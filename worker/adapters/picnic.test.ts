import { describe, expect, it, vi } from 'vitest';
import { createAbortablePicnicProvider, createPicnicProvider, normalizeProduct, PicnicTimeoutError, type PicnicClientLike } from './picnic';

function clientFixture(overrides: Partial<PicnicClientLike> = {}): PicnicClientLike {
  return {
    auth: {
      login: vi.fn(async () => ({ authKey: 'fixture-key', second_factor_authentication_required: false, user_id: 'fixture-user' })),
      generate2FACode: vi.fn(async () => null), verify2FACode: vi.fn(async () => ({ authKey: 'verified-key' })),
    },
    catalog: { search: vi.fn(async () => [
      { id: 'sku-1', name: 'Product', image_id: '', display_price: 210, unit_quantity: '2 x 250 g', max_count: 5, decorators: [], price_ranges: null },
      { id: 'sku-2', name: 'Unknown pack', image_id: '', display_price: 210, unit_quantity: 'tomaten naar smaak (ca. 250 g)', max_count: 5, decorators: [], price_ranges: null },
      { id: 'sku-3', name: 'Conditional', image_id: '', display_price: 220, unit_quantity: '1 l', max_count: 5, decorators: [], price_ranges: [{ from_quantity: 2, price: 180 }] },
    ]) },
    cart: { getCart: vi.fn(async () => ({
      type: 'ORDER', id: 'cart-id', items: [{ type: 'ORDER_LINE', id: 'line', items: [
        { type: 'ORDER_ARTICLE', id: 'sku-1', name: 'Product', unit_quantity: '2 x 250 g', price: 210 },
        { type: 'ORDER_ARTICLE', id: 'sku-2', name: 'Unknown count', unit_quantity: 'unknown', price: 99 },
      ] }], analytics_context_data: { items_list: [
        { product_id: 'sku-1', quantity: 2, is_available: true, is_in_recipe: false },
        { product_id: 'sku-2', quantity: 1, is_available: false, is_in_recipe: false },
      ] },
    } as never)) },
    ...overrides,
  };
}

describe('Picnic 4.10 provider boundary', () => {
  it('uses the proven endpoints and request shapes with an abort signal', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/user/login')) return new Response(JSON.stringify({ user_id: 'user-1', second_factor_authentication_required: true }),
        { headers: { 'x-picnic-auth': 'pending-key' } });
      if (url.endsWith('/user/2fa/verify')) return new Response(null, { status: 204, headers: { 'x-picnic-auth': 'resume-key' } });
      if (url.includes('/pages/search-page-results')) return Response.json({ content: [{ sellingUnit: {
        id: 'sku-1', name: 'Tomaten', unit_quantity: '500 g', display_price: 210,
      } }] });
      if (url.endsWith('/cart')) return Response.json({ items: [], analytics_context_data: { items_list: [] } });
      return new Response(null, { status: 204 });
    }));
    try {
      const api = createAbortablePicnicProvider();
      expect(await api.login('user@example.invalid', 'secret')).toMatchObject({ authKey: 'pending-key', requiresSms: true });
      await api.requestSms('pending-key');
      expect(await api.verifySms('pending-key', '123456')).toEqual({ authKey: 'resume-key' });
      expect((await api.search('resume-key', 'tomaat'))[0]).toMatchObject({ id: 'sku-1', quantity: { amount: '500' } });
      expect(await api.cart('resume-key')).toEqual([]);
      expect(calls.map(call => new URL(call.url).pathname)).toEqual([
        '/api/15/user/login', '/api/15/user/2fa/generate', '/api/15/user/2fa/verify', '/api/15/pages/search-page-results', '/api/15/cart',
      ]);
      expect(calls.every(call => call.init.signal instanceof AbortSignal)).toBe(true);
      expect(JSON.parse(String(calls[1]?.init.body))).toEqual({ channel: 'SMS' });
      expect(JSON.parse(String(calls[2]?.init.body))).toEqual({ otp: '123456' });
      expect((calls[1]?.init.headers as Record<string, string>)['x-picnic-auth']).toBe('pending-key');
      expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({ key: 'user@example.invalid', client_id: 30100 });
      expect(JSON.parse(String(calls[0]?.init.body)).secret).not.toBe('secret');
    } finally { vi.unstubAllGlobals(); }
  });

  it('aborts a hanging SMS request after one bounded attempt', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const pending = createAbortablePicnicProvider().requestSms('pending-key');
      const rejected = expect(pending).rejects.toBeInstanceOf(PicnicTimeoutError);
      await vi.advanceTimersByTimeAsync(10_001);
      await rejected;
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
  });

  it('creates a fresh NL client per call, forwards only auth keys, and never sets a custom URL', async () => {
    const fixture = clientFixture();
    const configs: { countryCode: 'NL'; authKey?: string }[] = [];
    const factory = (config: { countryCode: 'NL'; authKey?: string }) => { configs.push(config); return fixture; };
    const api = createPicnicProvider(factory);
    await api.login('user@example.invalid', 'transient-password');
    await api.search('resume-key', 'tomaat');
    expect(configs).toEqual([{ countryCode: 'NL' }, { countryCode: 'NL', authKey: 'resume-key' }]);
    expect(configs.every(config => !('url' in config))).toBe(true);
    expect(fixture.auth.login).toHaveBeenCalledWith('user@example.invalid', 'transient-password');
  });

  it('normalizes supported pack sizes, unknown packaging, conditional prices, and exact SKU identity', async () => {
    const api = createPicnicProvider(() => clientFixture());
    const products = await api.search('auth', 'tomaat');
    expect(products[0]).toMatchObject({ quantity: { kind: 'exact', amount: '500', unit: 'g', basis: null }, priceCertainty: 'known', identity: { groupId: 'sku-1', variantId: 'sku-1' } });
    expect(products[1]?.quantity).toBeNull();
    expect(products[2]).toMatchObject({ priceCertainty: 'conditional', priceRanges: [{ fromQuantity: 2, priceCents: 180 }] });
    expect(normalizeProduct({ id: 'sku-no-price', name: 'No price', image_id: '', display_price: Number.NaN, unit_quantity: '500 g', max_count: 1, decorators: [], price_ranges: null }))
      .toMatchObject({ displayPriceCents: null, priceCertainty: 'unknown' });
    expect(products[0]?.identity).toEqual({ groupId: 'sku-1', variantId: 'sku-1' });
  });

  it('whitelists cart lines and preserves unknown analytics quantity and availability safely', async () => {
    const api = createPicnicProvider(() => clientFixture());
    expect(await api.cart('auth')).toEqual([
      { productId: 'sku-1', name: 'Product', unitQuantity: '2 x 250 g', quantity: 2, unitPriceCents: 210, isAvailable: true },
      { productId: 'sku-2', name: 'Unknown count', unitQuantity: 'unknown', quantity: 1, unitPriceCents: 99, isAvailable: false },
    ]);
  });
});
