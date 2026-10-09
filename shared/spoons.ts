import { parseRational, type Rational } from './quantities';

/** Exact source measure. Gram conversion belongs to ingredient-specific estimates. */
export function sourceSpoon(text: string): { amount: Rational; unit: 'tbsp' | 'tsp' } | null {
  const fractions: Record<string,string> = {'½':'1/2','¼':'1/4','¾':'3/4','⅓':'1/3','⅔':'2/3','⅛':'1/8','⅜':'3/8','⅝':'5/8','⅞':'7/8'};
  const line = text.trim().toLowerCase().replace(/[½¼¾⅓⅔⅛⅜⅝⅞]/g, value => ` ${fractions[value]}`).trim();
  const match = line.match(/^(?:(\d+)\s+)?(\d+\/\d+|\d+(?:[.,]\d+)?)\s*(eetlepels?|el|theelepels?|tl|tbsp|tsp|tablespoons?|teaspoons?)\b/);
  if (!match) return null;
  const fraction = parseRational(match[2].replace(',', '.'));
  if (!fraction || fraction.numerator <= 0 || match[1] && !match[2].includes('/')) return null;
  const numerator = fraction.numerator + Number(match[1] ?? 0) * fraction.denominator;
  if (!Number.isSafeInteger(numerator)) return null;
  return {amount:{numerator,denominator:fraction.denominator},unit:/^(thee|tl|tsp|teaspoon)/.test(match[3]) ? 'tsp' : 'tbsp'};
}
