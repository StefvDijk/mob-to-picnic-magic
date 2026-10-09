import { afterEach, describe, expect, it, vi } from 'vitest';
import { addPicnicProduct, PicnicTransportUncertainError } from './picnic';

afterEach(() => vi.unstubAllGlobals());
describe('single Picnic addition transport', () => {
  it('sends the explicit package count once to the installed client endpoint', async () => {
    const fetcher = vi.fn(async () => Response.json({ type: 'ORDER', items: [] }));
    vi.stubGlobal('fetch', fetcher);
    await expect(addPicnicProduct('fixture-key', 'sku-1', 3)).rejects.toBeInstanceOf(PicnicTransportUncertainError);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://storefront-prod.nl.picnicinternational.com/api/15/cart/add_product');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ product_id: 'sku-1', count: 3 });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([503, 200])('does not retry an ambiguous provider reply (%s)', async status => {
    const fetcher = vi.fn(async () => new Response('{}', { status }));
    vi.stubGlobal('fetch', fetcher);
    await expect(addPicnicProduct('fixture-key', 'sku-1', 2)).rejects.toBeInstanceOf(PicnicTransportUncertainError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid counts before any network use', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(addPicnicProduct('fixture-key', 'sku-1', 1.5)).rejects.toBeInstanceOf(TypeError);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

it.each([1, 3])('does not mistake an exact SKU/count cart snapshot for a correlated receipt (%s)', async count => {
  // This can be a pre-existing basket or a simultaneous external edit. The reply
  // has no documented mutation identifier tying these units to our single POST.
  const fetcher = vi.fn(async () => Response.json({
    type: 'ORDER', id: 'shopping_cart', mts: 123456, total_count: count,
    items: [{ type: 'ORDER_LINE', id: 'line', items: [{ type: 'ORDER_ARTICLE', id: 'sku-1', name: 'Fixture product', unit_quantity: '500 g', price: 100 }] }],
    analytics_context_data: { items_list: [{ product_id: 'sku-1', quantity: count, is_available: true }] },
  }));
  vi.stubGlobal('fetch', fetcher);
  await expect(addPicnicProduct('fixture-key', 'sku-1', count)).rejects.toBeInstanceOf(PicnicTransportUncertainError);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
