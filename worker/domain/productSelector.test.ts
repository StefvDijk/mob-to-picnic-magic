import { describe, expect, it } from 'vitest';
import { selectProducts, type ProductOption } from './productSelector';

const pack = (id: string, amount: number, priceCents: number, groupId = 'verified-tomato', variantId = 'whole'): ProductOption => ({
  id, groupId, variantId, eligible: true, unit: 'g', amount: { numerator: amount, denominator: 1 }, basis: 'net', priceCents,
});

describe('selectProducts', () => {
  it('chooses the lowest total needed cost rather than the lowest unit price', () => {
    const result = selectProducts({ need: { numerator: 700, denominator: 1 }, unit: 'g', basis: 'net', products: [
      pack('350g', 350, 160), pack('400g', 400, 140), pack('1000g', 1000, 300),
    ] });
    expect(result.selected).toMatchObject({ totalCents: 280, packageCounts: [{ productId: '400g', count: 2 }], overshoot: '100' });
  });

  it('combines verified sizes of one product variant and prefers less overshoot on a price tie', () => {
    const result = selectProducts({ need: { numerator: 750, denominator: 1 }, unit: 'g', basis: 'net', products: [
      pack('500g', 500, 200), pack('250g', 250, 120),
    ] });
    expect(result.selected).toMatchObject({ totalCents: 320, packageCounts: [{ productId: '250g', count: 1 }, { productId: '500g', count: 1 }], overshoot: '0' });
    const tie = selectProducts({ need: { numerator: 750, denominator: 1 }, unit: 'g', basis: 'net', products: [
      pack('500g', 500, 200), pack('250g', 250, 200),
    ] });
    expect(tie.selected?.packageCounts).toHaveLength(2);
    expect(tie.selected?.overshoot).toBe('0');
  });

  it('does not combine different brands or variants and favors a remembered product', () => {
    const result = selectProducts({ need: { numerator: 700, denominator: 1 }, unit: 'g', basis: 'net',
      rememberedProductId: 'preferred', products: [pack('preferred', 500, 500), pack('cheap', 500, 200, 'different-product')] });
    expect(result.selected?.packageCounts).toEqual([{ productId: 'preferred', count: 2 }]);
    expect(result.cheaperAlternative?.packageCounts).toEqual([{ productId: 'cheap', count: 2 }]);
    const separate = selectProducts({ need: { numerator: 750, denominator: 1 }, unit: 'g', basis: 'net',
      products: [pack('a', 500, 100, 'brand-a'), pack('b', 250, 100, 'brand-b')] });
    expect(separate.selected?.packageCounts).toEqual([{ productId: 'a', count: 2 }]);
    expect(separate.selected?.packageCounts.some(item => item.productId === 'b')).toBe(false);
  });

  it('treats remembered identity as its verified product and variant, and labels only lower cost as cheaper', () => {
    const products = [pack('remembered-small', 250, 100, 'same-product'), pack('same-product-large', 500, 150, 'same-product'),
      pack('equal-cost-alternative', 750, 250, 'other-product')];
    const result = selectProducts({ need: { numerator: 750, denominator: 1 }, unit: 'g', basis: 'net',
      rememberedProductId: 'remembered-small', products });
    expect(result.selected?.groupId).toBe('same-product');
    expect(result.selected?.packageCounts).toEqual([{ productId: 'remembered-small', count: 1 }, { productId: 'same-product-large', count: 1 }]);
    expect(result.cheaperAlternative).toBeNull();
  });

  it('subtracts only explicit basket allocations and requires matching net or drained basis', () => {
    const products = [pack('jar', 350, 160)];
    const assigned = selectProducts({ need: { numerator: 700, denominator: 1 }, unit: 'g', basis: 'net', products,
      basketAllocations: [{ basketLineId: 'cart-line-1', productId: 'jar', amount: { numerator: 350, denominator: 1 },
        availableAmount: { numerator: 350, denominator: 1 }, unit: 'g', basis: 'net', accepted: true }] });
    expect(assigned.remaining).toBe('350');
    expect(assigned.selected?.packageCounts).toEqual([{ productId: 'jar', count: 1 }]);
    const drained = selectProducts({ need: { numerator: 100, denominator: 1 }, unit: 'g', basis: 'drained',
      products: [{ ...pack('net', 400, 100), basis: 'net' }] });
    expect(drained.reason).toBe('missing_basis');
  });

  it('requires explicit substitution acceptance and reports bounded search as unresolved', () => {
    const substitution = { ...pack('dry-basil', 10, 100), substitution: true };
    expect(selectProducts({ need: { numerator: 10, denominator: 1 }, unit: 'g', basis: 'net', products: [substitution] }).status).toBe('unresolved');
    expect(selectProducts({ need: { numerator: 10, denominator: 1 }, unit: 'g', basis: 'net',
      products: [{ ...substitution, substitutionAccepted: true }] }).status).toBe('selected');
    const truncated = selectProducts({ need: { numerator: 5000, denominator: 1 }, unit: 'g', basis: 'net',
      products: [pack('pack', 1, 1)], maxPackages: 10 });
    expect(truncated).toMatchObject({ status: 'unresolved', reason: 'search_truncated', truncated: true });
  });

  it('ignores an exact-size candidate whose net or drained basis does not match', () => {
    const result = selectProducts({ need: { numerator: 10, denominator: 1 }, unit: 'g', basis: 'net', products: [
      pack('net-pack', 10, 100), { ...pack('unknown-drained', 10, 1, 'other-product'), basis: 'drained',
        amount: { numerator: 1, denominator: Number.MAX_SAFE_INTEGER } },
    ] });
    expect(result.status).toBe('selected');
    expect(result.selected?.packageCounts).toEqual([{ productId: 'net-pack', count: 1 }]);
  });

  it('rejects ambiguous product identity, piece basis, and zero basket assignment', () => {
    const duplicate = selectProducts({ need: { numerator: 1, denominator: 1 }, unit: 'piece', basis: null,
      products: [{ ...pack('same', 1, 10), unit: 'piece', basis: null }, { ...pack('same', 2, 10, 'other-group'), unit: 'piece', basis: null }] });
    expect(duplicate.reason).toBe('invalid_input');
    expect(selectProducts({ need: { numerator: 1, denominator: 1 }, unit: 'piece', basis: 'net', products: [] }).reason).toBe('invalid_input');
    expect(selectProducts({ need: { numerator: 10, denominator: 1 }, unit: 'g', basis: 'net', products: [pack('jar', 10, 1)],
      basketAllocations: [{ basketLineId: 'line', productId: 'jar', amount: { numerator: 0, denominator: 1 },
        availableAmount: { numerator: 100, denominator: 1 }, unit: 'g', basis: 'net', accepted: true }] }).reason).toBe('invalid_input');
  });

  it('scales kg and g exactly and preserves fractional requirements', () => {
    const result = selectProducts({ need: { numerator: 1, denominator: 2 }, unit: 'kg', basis: 'net',
      products: [pack('half-kilo', 500, 250)] });
    expect(result.needed).toBe('500');
    expect(result.selected?.supplied).toBe('500');
  });
});
