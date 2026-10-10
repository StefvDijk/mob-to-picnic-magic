import type { RecipeIngredientDto } from '../../shared/recipes';
import { formatRational, parseRational, type Quantity } from '../../shared/quantities';
import { sourceSpoon } from '../../shared/spoons';

const units = { g: 'g', kg: 'kg', ml: 'ml', l: 'l', piece: 'stuks' };
export function quantityLabel(quantity: Quantity, originalText = ''): string {
  if (quantity.kind === 'global') return 'Naar smaak';
  if (quantity.kind === 'unknown') {
    const spoon = sourceSpoon(originalText);
    if (spoon) {
      const amount = spoon.amount.numerator / spoon.amount.denominator;
      const label = Number.isInteger(amount * 100) ? new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 }).format(amount) : formatRational(spoon.amount);
      return `${label} ${spoon.unit === 'tbsp' ? 'eetlepel' : 'theelepel'}${amount === 1 ? '' : 's'}`;
    }
    if (/^(?:\d+\s+)?hand(?:je|vol)\b/i.test(originalText.trim())) return 'Handje';
    return 'Hoeveelheid controleren';
  }
  return `${quantity.amount}${quantity.kind === 'range' ? `–${quantity.maximum}` : ''} ${units[quantity.unit!]}`;
}

/** Source measures are readable even when their conversion to a pack needs an estimate. */
export function ingredientNotes(item: Pick<RecipeIngredientDto, 'quantity' | 'originalText' | 'uncertainty'>): string[] {
  const sourceMeasure = sourceSpoon(item.originalText) || /^(?:\d+\s+)?hand(?:je|vol)\b/i.test(item.originalText.trim());
  const generic = /^(?:Hoeveelheid controleren|Een hoeveelheid ontbreekt in de bron\.|De hoeveelheid is niet eenduidig leesbaar\.|Deze maat wordt apart geschat bij de boodschappenberekening\.|quantity_missing|quantity_unit_unsupported)$/;
  const notes = item.uncertainty.filter(note => !(sourceMeasure && generic.test(note)) &&
    !(item.quantity.kind === 'exact' && note === 'Hoeveelheid controleren'));
  return [...new Set(notes)];
}

export function recipeStepText(text: string): string {
  return text.replace(/^\s*(?:[Ss]tap\s+\d+[.)]?\s+|\d+[.)]\s+|\d+\s+(?=[A-ZÀ-Ý]))/, '').trim();
}

/** Rounded display only; purchasing continues to use the exact rational demand. */
export function shoppingQuantityLabel(quantity: Quantity): string {
  if (quantity.kind === 'global') return 'Naar smaak';
  if (quantity.kind === 'unknown') return quantityLabel(quantity);
  function amount(value: string | undefined): string {
    const rational = parseRational(value);
    if (!rational) return value ?? '';
    const number = rational.numerator / rational.denominator;
    const digits = number >= 100 ? 0 : number < 1 ? 2 : 1;
    const rounded = Math.round(number * 10 ** digits) / 10 ** digits;
    if (number > 0 && rounded === 0) return '< 0,01';
    return `${rounded === number ? '' : '≈ '}${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: digits }).format(rounded)}`;
  }
  return `${amount(quantity.amount)}${quantity.kind === 'range' ? `–${amount(quantity.maximum)}` : ''} ${units[quantity.unit!]}`;
}
