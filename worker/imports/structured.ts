import type { ImportCandidate, ImportIngredientCandidate } from '../../shared/imports';
import { INGREDIENTS, normalizeIngredient } from '../../shared/ingredient-knowledge';
import { formatRational, parseRational, type Quantity } from '../../shared/quantities';

export const STRUCTURED_PARSER_VERSION = 'structured-exact-v1';
// No semantic translations outside this explicit, inspectable list.
const ENGLISH_NAMES: Record<string, string> = {
  'olive oil': 'olijfolie', rice: 'rijst', 'white rice': 'witte rijst', flour: 'tarwebloem',
  sugar: 'suiker', 'white sugar': 'kristalsuiker', garlic: 'knoflook', onion: 'ui', onions: 'uien',
  'red onion': 'rode ui', 'red onions': 'rode uien', 'tomato puree': 'tomatenpuree', passata: 'passata',
  'chopped tomatoes': 'tomatenblokjes', 'diced tomatoes': 'tomatenblokjes', 'chicken breast': 'kipfilet',
  'chicken breasts': 'kipfilet', 'boneless skinless chicken thighs': 'kippendijen',
  lemon: 'citroen', lemons: 'citroenen', 'fresh oregano': 'verse oregano',
};
const FRACTIONS: Record<string, string> = { '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8' };
const AMOUNT = '(?:[0-9]+\\s+[0-9]+/[1-9][0-9]*|[0-9]+/[1-9][0-9]*|[0-9]+(?:[.,][0-9]+)?[½¼¾⅓⅔⅛⅜⅝⅞]?|[½¼¾⅓⅔⅛⅜⅝⅞])';
function amountValue(text: string): string | null {
  let value = text.trim();
  // NL/EN thousands and decimal separators overlap; do not guess the locale.
  if (/^[1-9][0-9]*[.,][0-9]{3}$/.test(value)) return null;
  const unicode = value.match(/^([0-9]*)([½¼¾⅓⅔⅛⅜⅝⅞])$/);
  if (unicode) value = `${unicode[1] || '0'} ${FRACTIONS[unicode[2]]}`;
  const mixed = value.match(/^([0-9]+)\s+([0-9]+)\/([1-9][0-9]*)$/);
  if (mixed) {
    const n = BigInt(mixed[1]) * BigInt(mixed[3]) + BigInt(mixed[2]);
    value = `${n}/${mixed[3]}`;
  }
  const parsed = parseRational(value.replace(',', '.'));
  return parsed?.numerator ? formatRational(parsed) : null;
}
const units: Record<string, NonNullable<Quantity['unit']>> = {
  g: 'g', gram: 'g', grams: 'g', gr: 'g', kg: 'kg', kilogram: 'kg', kilograms: 'kg',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitres: 'ml', l: 'l', liter: 'l', liters: 'l', litres: 'l',
  stuks: 'piece', stuk: 'piece', pieces: 'piece', piece: 'piece', teentje: 'piece', teentjes: 'piece', cloves: 'piece', clove: 'piece',
};
const preparation = /^(?:fijn gehakt|fijngehakt|in dunne plakjes|in stukken|in blokjes|gesnipperd|gehakt|gehalveerd|finely chopped|chopped|diced|sliced|halved)$/;
export type StructuredIngredient = Omit<ImportIngredientCandidate, 'sourceOrigin'> & { sourceOrigin: 'parser' };
export type StructuredCandidate = Omit<ImportCandidate, 'ingredients'> & { ingredients: StructuredIngredient[] };

export function parseStructuredIngredient(originalText: string, section: string | null = null): StructuredIngredient | null {
  if (!originalText.trim() || originalText.length > 500) return null;
  // Package multipliers, optional ingredients, alternatives, ranges, household units and annotations fall back.
  const text = originalText.replace(/\u00a0/g, ' ').trim();
  const match = text.match(new RegExp(`^(${AMOUNT})\\s*(g|gr|grams?|kg|kilograms?|ml|milliliters?|millilitres|l|liters?|litres|stuks?|pieces?|teentjes?|cloves?)\\s+(.+)$`, 'i'));
  const unitless = match ? null : text.match(new RegExp(`^(${AMOUNT})\\s+(ui|uien|citroen|citroenen|onion|onions|lemon|lemons)$`, 'i'));
  if (!match && !unitless) return null;
  const amount = amountValue((match ?? unitless)![1]);
  if (!amount) return null;
  const unit = match ? units[match[2].toLowerCase()] : 'piece';
  if (!unit) return null;
  const rawName = match ? match[3] : unitless![2];
  const fragments = normalizeIngredient(rawName).split(/,\s*/);
  if (fragments.length > 2 || fragments.length === 2 && !preparation.test(fragments[1])) return null;
  const sourceName = fragments[0];
  const normalized = ENGLISH_NAMES[sourceName] ?? sourceName;
  const profile = INGREDIENTS.find(item => item.aliases.includes(normalized));
  if (!profile || ['abrikozen', 'pruimen', 'oregano', 'olijven', 'melk', 'korianderzaad'].includes(normalized)) return null;
  if (unit === 'piece' && !profile.pieceGrams) return null;
  if (profile.key === 'chicken-thigh' && !['kipdijfilet', 'kippendijfilet'].includes(sourceName) && sourceName !== 'boneless skinless chicken thighs') return null;
  // These explicit containers/cloves mean pieces of their ingredient, not generic commodity pieces.
  if (match && /teentje|clove/i.test(match[2]) && profile.key !== 'garlic') return null;
  if (unit === 'piece' && ['garlic'].includes(profile.key) && !(match && /teentje|clove/i.test(match[2]))) return null;
  if ((unit === 'ml' || unit === 'l') && !profile.liquid) return null;
  const attributes = { form: null as string | null, variant: null as string | null, brand: null as string | null };
  // Preserve explicit purchase characteristics from the name; profile selection is not enough for variant safety.
  if (/\bverse?\b/.test(normalized)) attributes.form = 'vers';
  if (/\bgedroogde?\b/.test(normalized)) attributes.form = 'gedroogd';
  if (/\brode?\b/.test(normalized)) attributes.variant = 'rood';
  return { section, originalText, sourceQuote: originalText, normalizedName: normalized, quantity: { kind: 'exact', amount, unit, basis: null }, attributes, uncertainty: [], sourceOrigin: 'parser' };
}

/** All-or-nothing normalization: never combine recipes or partly accept an ambiguous ingredient list. */
export function normalizeStructuredCandidates(candidates: readonly ImportCandidate[]): StructuredCandidate[] | null {
  if (!candidates.length || candidates.length > 30) return null;
  const output: StructuredCandidate[] = [];
  for (const candidate of candidates) {
    const allowed = new Set(['ingredients_unparsed', 'quantity_review_required']);
    if (candidate.uncertainty.some(issue => !allowed.has(issue)) || !candidate.title?.trim() || candidate.title.length > 200 ||
      !candidate.steps.length || candidate.steps.length > 100 || candidate.steps.some(step => !step.trim() || step.length > 2000) ||
      !candidate.ingredients.length || candidate.ingredients.length > 200) return null;
    const servingsText = candidate.baseServings?.trim().replace(/^(?:voor|serves)\s+/i, '').replace(/\s+(?:personen|porties|servings?|people)$/i, '');
    const baseServings = servingsText ? amountValue(servingsText) : null;
    if (!baseServings) return null;
    const ingredients: StructuredIngredient[] = [];
    const seen = new Set<string>();
    for (const item of candidate.ingredients) {
      // Existing AI fields cannot establish that the structured source was complete.
      const parsed = parseStructuredIngredient(item.originalText, item.section);
      if (!parsed || item.uncertainty?.length) return null;
      const signature = `${item.section ?? ''}|${item.originalText.trim()}`;
      if (seen.has(signature)) return null;
      seen.add(signature); ingredients.push(parsed);
    }
    output.push({ ...candidate, baseServings, ingredients, uncertainty: [] });
  }
  return output;
}
