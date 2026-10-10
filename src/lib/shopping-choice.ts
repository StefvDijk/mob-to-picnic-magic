import type { ShoppingRow } from '../../shared/shopping';
export type ShoppingChoiceState = { productId: string | null; selected: boolean; count: number | null; changed: boolean; countChanged?: boolean; omitted?: boolean; remember: boolean; substitutionAccepted: boolean; note?: string };
/** Rechecking never silently replaces a user's explicit product choice. */
export function restoreShoppingChoice(row: ShoppingRow, previous?: ShoppingChoiceState): ShoppingChoiceState {
  if (previous?.omitted) return { productId: null, selected: false, count: null, changed: false, remember: false, substitutionAccepted: false, omitted: true };
  const product = previous && row.candidates.find(item => item.product.id === previous.productId);
  const stillSuitable = product && (product.match === 'suitable' || product.match === 'substitution' && previous.substitutionAccepted);
  if (previous?.productId && (previous.changed || previous.countChanged) && !stillSuitable) {
    return { productId: null, selected: false, count: null, changed: false, remember: false, substitutionAccepted: false,
      note: 'Je gekozen product is niet meer beschikbaar of passend. Kies een alternatief.' };
  }
  if (stillSuitable && (previous.changed || previous.countChanged || !previous.selected)) {
    return { ...previous, remember: previous.changed && product.match === 'suitable' && previous.remember };
  }
  const candidate = row.candidates.find(item => item.product.id === row.selectedProductId);
  return { productId: row.selectedProductId, selected: !row.pantry && candidate?.match === 'suitable' && candidate.packCount !== null && candidate.totalPriceCents !== null, count: candidate?.packCount ?? null,
    changed: false, remember: false, substitutionAccepted: false };
}
