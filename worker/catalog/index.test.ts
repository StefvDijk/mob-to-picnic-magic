import { describe, expect, it, vi } from 'vitest';
import { productFingerprints } from './index';
import { diagnoseProducts } from './diagnostics';
import { normalizeProductDetails } from '../adapters/picnic';
import type { PicnicProvider } from '../adapters/picnic';
const product = { id: 'sku', name: 'Uien', unit_quantity: '500 g', display_price: 80, max_count: 50, is_available: false };
const details = () => normalizeProductDetails('sku', { sellingUnit: product,
  allergens: { id: 'product-page-allergies', children: [{ markdown: 'Bevat' }, { markdown: 'Melk' }, { markdown: 'Bevat mogelijk' }, { markdown: 'Ei' }] } });
describe('private catalogue boundary', () => {
  it('preserves contrary availability and distinct allergen groups', () => {
    const result = details();
    expect(result.product.isAvailable).toBe(false);
    expect(result.product.maxCount).toBe(50);
    expect(result.allergens.contains).toEqual(['Melk']);
    expect(result.allergens.mayContain).toEqual(['Ei']);
    expect(result.currentCheckUsable).toBe(true);
  });
  it('keeps missing commercial facts unknown', () => {
    const result = normalizeProductDetails('sku', { sellingUnit: { id: 'sku', name: 'Uien', unit_quantity: '500 g' } });
    expect(result.product.displayPriceCents).toBeNull();
    expect(result.product.maxCount).toBeUndefined();
    expect(result.currentCheckUsable).toBe(false);
  });
  it('keeps price changes out of the content fingerprint', () => {
    const base = details().product;
    const before = productFingerprints(base);
    const after = productFingerprints({ ...base, displayPriceCents: 90 });
    expect(before.content).toBe(after.content);
    expect(before.commercial).not.toBe(after.commercial);
    expect(before.content).not.toBe(productFingerprints({ ...base, unitQuantity: '1 kg' }).content);
    expect(before.content).not.toBe(productFingerprints({...base,quantity:{kind:'exact',amount:'500',unit:'g',basis:'drained'}}).content);
  });
  it('deduplicates and stops a diagnostic after the first failure', async () => {
    const read = vi.fn().mockResolvedValueOnce(details()).mockRejectedValueOnce(new Error('private provider body'));
    const result = await diagnoseProducts({ productDetails: read } as unknown as PicnicProvider, 'fixture', ['sku', 'sku', 'other', 'third'], { delayMs: 0 });
    expect(read).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain('private provider body');
    await expect(diagnoseProducts({} as PicnicProvider, 'fixture', Array(51).fill('sku'))).rejects.toThrow();
  });
});

it('reads scoped Fusion packaging and price, preserves unknown availability and ignores crossed prices', () => {
  const result = normalizeProductDetails('sku', { sellingUnit: { id: 'sku', name: 'Uien', max_count: 50 }, layout: { body: {
    id: 'product-details-page-root-main-container', pml: { component: { children: [
      { textType: 'HEADER1', markdown: 'Gele uien' }, { textAttributes: { weight: 'REGULAR' }, markdown: 'Picnic' },
      { type: 'STACK', children: [{ type: 'RICH_TEXT', markdown: '500 g' }] },
      { type: 'PRICE', price: 80 }, { type: 'PRICE', price: 100, isCrossed: true },
    ] } },
  } } });
  expect(result.product).toMatchObject({ name: 'Gele uien', brand: 'Picnic', displayPriceCents: 80, quantity: { amount: '500', unit: 'g' } });
  expect(result.product.isAvailable).toBeUndefined();
  expect(result.currentCheckUsable).toBe(false);
  expect(result.diagnostic?.sellingUnitKeys).toContain('max_count');
});
it('rechecks diagnostic context before every read and calls detail storage only on success', async () => {
  const read = vi.fn(async () => details());
  const gate = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  const onDetail = vi.fn(async () => {});
  await diagnoseProducts({ productDetails: read } as unknown as PicnicProvider, 'fixture', ['sku', 'other'], { delayMs: 0, canRead: gate, onDetail });
  expect(gate).toHaveBeenCalledTimes(2);
  expect(read).toHaveBeenCalledTimes(1);
  expect(onDetail).toHaveBeenCalledTimes(1);
});
it('allows one observed followup within the total diagnostic request budget', async () => {
  const result = details();
  result.diagnostic = { sellingUnitKeys: [], fieldPaths: [], observedReadLinks: ['product-details-page-root?id=sku'] };
  const read = vi.fn(async () => result);
  const follow = vi.fn(async () => result);
  const report = await diagnoseProducts({ productDetails: read, observedProductDetails: follow } as unknown as PicnicProvider,
    'fixture', ['sku', 'other'], { maxRequests: 2, delayMs: 0, observedFollowup: 'product-details-page-root?id=sku' });
  expect(report.requestCount).toBe(2);
  expect(report.followupUsed).toBe(true);
  expect(read).toHaveBeenCalledTimes(1);
  expect(follow).toHaveBeenCalledTimes(1);
});
it('treats explicit UNAVAILABLE decorators as negative evidence but contradictory signals as unknown', () => {
  const negative = normalizeProductDetails('sku', { sellingUnit: { ...product, is_available: undefined, decorators: [{ type: 'UNAVAILABLE', reason: 'UNKNOWN' }] } });
  expect(negative.product.isAvailable).toBe(false);
  expect(negative.diagnostic?.availabilitySignals).toContainEqual(expect.objectContaining({ type: 'unavailable_decorator', value: false }));
  const contradictory = normalizeProductDetails('sku', { sellingUnit: { ...product, is_available: true, decorators: [{ type: 'UNAVAILABLE' }] } });
  expect(contradictory.product.isAvailable).toBeUndefined();
  expect(contradictory.currentCheckUsable).toBe(false);
});
it('does not infer availability from conditional UI containers or enabled controls', () => {
  const result = normalizeProductDetails('sku', { sellingUnit: { ...product, is_available: undefined },
    components: [{ type: 'UNAVAILABILITY_CONTAINER', sellingUnitId: 'sku' },
      { type: 'ACCESSIBILITY_CONTAINER', sellingUnitId: 'sku', availableAccessibility: { accessible: true }, unavailableAccessibility: { accessible: true } },
      { type: 'STEPPER', sellingUnitId: 'sku', enabled: true }] });
  expect(result.product.isAvailable).toBeUndefined();
  expect(result.diagnostic?.availabilitySignals?.map(signal => signal.type).sort()).toEqual(['ACCESSIBILITY_CONTAINER', 'STEPPER', 'UNAVAILABILITY_CONTAINER']);
});
