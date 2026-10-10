import { expect, it } from 'vitest';
import { restoreShoppingChoice } from '../src/lib/shopping-choice';
import type { ShoppingRow } from '../shared/shopping';
const row: ShoppingRow = { id: 'ui', name: 'ui', knowledgeKey: 'onion', query: 'uien', pantry: false, sources: [], demand: null, estimates: [], preferred: false, error: null,
  selectedProductId: 'new', candidates: [{ match: 'suitable', packCount: 1, totalPriceCents: 100, estimates: [], product: { id: 'new', name: 'Uien', unitQuantity: '1 kg', quantity: null, priceCertainty: 'known', displayPriceCents: 100, priceRanges: [], identity: { groupId: 'new', variantId: 'new' } } }] };
it('does not replace an unavailable explicit choice', () => {
  expect(restoreShoppingChoice(row, { productId: 'old', selected: true, count: 1, changed: true, remember: true, substitutionAccepted: false })).toMatchObject({ productId: null, selected: false, remember: false, note: expect.any(String) });
});
it('selects normal shopping and leaves pantry products off without remembering', () => {
  expect(restoreShoppingChoice(row)).toMatchObject({ selected: true, remember: false });
  expect(restoreShoppingChoice({ ...row, pantry: true })).toMatchObject({ selected: false, remember: false });
});
it('preserves deselection and custom counts', () => {
  expect(restoreShoppingChoice(row, { productId: 'new', selected: false, count: 3, changed: false, countChanged: true, remember: false, substitutionAccepted: false })).toMatchObject({ selected: false, count: 3 });
});
it('preserves an explicit pantry omission even when fresh matches become available', () => {
  expect(restoreShoppingChoice(row, { productId: null, selected: false, count: null, changed: false, omitted: true, remember: false, substitutionAccepted: false }))
    .toMatchObject({ productId: null, selected: false, omitted: true, remember: false });
});
it.each(['unresolved', 'unsuitable'] as const)('never restores %s using a saved substitution acceptance', match => {
  const uncertain = { ...row, candidates: row.candidates.map(candidate => ({ ...candidate, match })) };
  expect(restoreShoppingChoice(uncertain, { productId: 'new', selected: true, count: 1, changed: true, remember: true, substitutionAccepted: true })).toMatchObject({ selected: false, productId: null });
  expect(restoreShoppingChoice(uncertain)).toMatchObject({ selected: false });
});
it('requires usable quantity and price before automatic selection', () => {
  expect(restoreShoppingChoice({ ...row, candidates: row.candidates.map(candidate => ({ ...candidate, packCount: null })) }).selected).toBe(false);
  expect(restoreShoppingChoice({ ...row, candidates: row.candidates.map(candidate => ({ ...candidate, totalPriceCents: null })) }).selected).toBe(false);
});
