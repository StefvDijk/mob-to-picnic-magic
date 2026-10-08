import { describe, expect, it } from 'vitest';
import type { PicnicProduct } from '../shared/picnic';
import type { RecipeIngredientDto } from '../shared/recipes';
import { planIngredientProducts } from '../src/lib/product-plan';

const ingredient = (quantity: RecipeIngredientDto['quantity']): RecipeIngredientDto => ({
  id: 'ingredient-1', ordinal: 0, section: null, originalText: 'bloem', normalizedName: 'bloem', quantity,
  sourceOrigin: 'user', attributes: {}, uncertainty: [],
});
const product = (id: string, amount: string, unit: 'g' | 'ml' | 'piece', price: number, basis: 'net' | 'drained' | null = null): PicnicProduct => ({
  id, name: id, unitQuantity: `${amount} ${unit}`, quantity: { kind: 'exact', amount, unit, basis },
  displayPriceCents: price, priceCertainty: 'known', priceRanges: [], identity: { groupId: 'verified-group', variantId: id },
});

describe('planIngredientProducts', () => {
  it('scales fractional recipe quantities exactly and selects the lowest sufficient total', () => {
    const small = product('750g', '750', 'g', 140);
    const sufficient = product('500g', '500', 'g', 120);
    const result = planIngredientProducts({
      ingredient: ingredient({ kind: 'exact', amount: '1/3', unit: 'kg', basis: 'net' }),
      baseServings: '2', requestedServings: '3', products: [small, sufficient],
      suitableProductIds: new Set(['750g', '500g']), confirmedProductBasisIds: new Set(['750g', '500g']),
    });

    expect(result.status).toBe('selected');
    if (result.status !== 'selected') return;
    expect(result.needed).toBe('1/2');
    expect(result.selection.selected).toMatchObject({ totalCents: 120, supplied: '500', overshoot: '0', packageCounts: [{ productId: '500g', count: 1 }] });
  });

  it('requires a user basis confirmation for provider packages with no basis and ignores unknown or incompatible candidates', () => {
    const noBasis = product('no-basis', '500', 'g', 100, null);
    const wrongUnit = product('wrong-unit', '500', 'ml', 40, null);
    const unknownPrice = { ...product('unknown-price', '500', 'g', 20, null), priceCertainty: 'unknown' as const };
    const base = { ingredient: ingredient({ kind: 'exact' as const, amount: '500', unit: 'g' as const, basis: 'net' as const }),
      baseServings: '2', requestedServings: '2', products: [noBasis, wrongUnit, unknownPrice],
      suitableProductIds: new Set(['no-basis', 'wrong-unit', 'unknown-price']) };

    const unconfirmed = planIngredientProducts(base);
    expect(unconfirmed.status).toBe('selected');
    if (unconfirmed.status === 'selected') expect(unconfirmed.selection.status).toBe('unresolved');

    const confirmed = planIngredientProducts({ ...base, confirmedProductBasisIds: new Set(['no-basis']) });
    expect(confirmed.status).toBe('selected');
    if (confirmed.status === 'selected') expect(confirmed.selection.selected?.packageCounts).toEqual([{ productId: 'no-basis', count: 1 }]);
  });

  it('leaves unknown recipe quantities unresolved for recipe correction', () => {
    const result = planIngredientProducts({ ingredient: ingredient({ kind: 'unknown' }), baseServings: '2', requestedServings: '2',
      products: [product('500g', '500', 'g', 100)], suitableProductIds: new Set(['500g']) });
    expect(result).toMatchObject({ status: 'unresolved' });
  });
});
