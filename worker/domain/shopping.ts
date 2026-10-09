import { unitPriceForPacks } from '../../shared/product-pricing';
import { INGREDIENTS, normalizeIngredient, type IngredientKnowledge } from '../../shared/ingredient-knowledge';
import { compareRationals, formatRational, multiplyRationals, parseRational, type Quantity, type Rational } from '../../shared/quantities';
import type { PicnicProduct } from '../../shared/picnic';
import type { RecipeDto, RecipeIngredientDto } from '../../shared/recipes';
import type { ShoppingCandidate, ShoppingGroup, ProductAssessment, MatchStatus } from '../../shared/shopping';
import { scaleExactQuantity } from './quantityMath';
import { sourceSpoon } from '../../shared/spoons';

function add(a: Rational, b: Rational): Rational | null {
  let n = BigInt(a.numerator) * BigInt(b.denominator) + BigInt(b.numerator) * BigInt(a.denominator);
  let d = BigInt(a.denominator) * BigInt(b.denominator);
  let x = n, y = d; while (y) [x, y] = [y, x % y];
  n /= x || 1n; d /= x || 1n;
  return n <= BigInt(Number.MAX_SAFE_INTEGER) && d <= BigInt(Number.MAX_SAFE_INTEGER) ? { numerator: Number(n), denominator: Number(d) } : null;
}
function canonical(quantity: Quantity): Quantity | null {
  if (!quantity.unit || (quantity.kind !== 'exact' && quantity.kind !== 'range')) return null;
  const amount = parseRational(quantity.kind === 'range' ? quantity.maximum : quantity.amount);
  if (!amount || amount.numerator <= 0) return null;
  const value = multiplyRationals(amount, { numerator: ['kg', 'l'].includes(quantity.unit) ? 1000 : 1, denominator: 1 });
  return value ? { kind: 'exact', amount: formatRational(value), unit: quantity.unit === 'kg' ? 'g' : quantity.unit === 'l' ? 'ml' : quantity.unit, basis: quantity.basis ?? null } : null;
}
function profileFor(ingredient: RecipeIngredientDto): IngredientKnowledge | undefined {
  const name = normalizeIngredient(ingredient.normalizedName ?? ingredient.originalText);
  return INGREDIENTS.find(item => item.aliases.includes(name));
}
/** Import attributes also contain recipe preparation notes. Keep source text intact,
 * but only purchase characteristics determine grouping and matching. */
export function purchaseAttribute(value: unknown): string {
  if (typeof value !== 'string') return '';
  let text = normalizeIngredient(value);
  if (text === 'droge') text = 'droog';
  if (/^\(rode\)$/.test(text)) return ''; // Optional recipe choice, not a required red variety.
  text = text.replace(/\bin (?:dunne |kleine |grove )?(?:plakjes|stukken|stukjes|blokjes|ringen|reepjes)\b/g, '')
    .replace(/\b(?:fijn\s*gehakt|fijn\s*gemalen|gehalveerd|geroosterd)\b/g, '')
    .replace(/^[ ,;]+|[ ,;]+$/g, '').replace(/\ben\b/g, ' ').replace(/\s+/g, ' ').trim();
  return text;
}
const representedCharacteristic = /^(?:vers(?:e)?|gedroogd(?:e)?|vegetarisch|vegan|rood|rode|zwart|zwarte|bruin|bruine|zonder pit|met pit|volkoren|basmati)$/;
function traits(ingredient: RecipeIngredientDto): string[] {
  const text = normalizeIngredient([ingredient.originalText, ingredient.attributes.variant, ingredient.attributes.form].filter(Boolean).join(' '));
  const result: string[] = [];
  if (/\bvers(?:e)?\b/.test(text)) result.push('vers');
  if (/\bgedroogd(?:e)?\b/.test(text)) result.push('gedroogd');
  if (/zonder pit/.test(text)) result.push('zonder pit');
  if (/\bmet pit/.test(text)) result.push('met pit');
  if (/\brod(?:e)?\b/.test(text) && !/\(rode\)/.test(text)) result.push('rood');
  if (/\bzwart(?:e)?\b/.test(text)) result.push('zwart');
  if (/\bbruin(?:e)?\b/.test(text)) result.push('bruin');
  if (/\bvolkoren\b/.test(text)) result.push('volkoren');
  if (/\bbasmati\b/.test(text)) result.push('basmati');
  if (/\bvegetarisch|\bvegan/.test(text)) result.push('vegetarisch');
  if (/\bvegan\b/.test(text)) result.push('vegan');
  for (const field of ['brand', 'form', 'variant'] as const) {
    const value = ingredient.attributes[field];
    const purchase = field === 'brand' ? typeof value === 'string' ? normalizeIngredient(value) : '' : purchaseAttribute(value);
    if (purchase && (field === 'brand' || !representedCharacteristic.test(purchase))) result.push(`${field}:${purchase}`);
  }
  return result;
}
function rawDemand(ingredient: RecipeIngredientDto, profile?: IngredientKnowledge): { quantity: Quantity | null; estimates: string[] } {
  const original = canonical(ingredient.quantity);
  if (original) return { quantity: original, estimates: ingredient.quantity.kind === 'range' ? ['Berekend met de bovengrens van het recept.'] : [] };
  const line = normalizeIngredient(ingredient.originalText);
  const spoon = sourceSpoon(ingredient.originalText);
  if (spoon && profile) {
    const amount = spoon.amount;
    const isTeaspoon = spoon.unit === 'tsp';
    const grams = profile.tablespoonGrams;
    const factor = profile.liquid ? { numerator: isTeaspoon ? 5 : 15, denominator: 1 }
      : grams ? { numerator: grams, denominator: isTeaspoon ? 3 : 1 } : null;
    const converted = amount && factor && multiplyRationals(amount, factor);
    if (converted) return { quantity: { kind: 'exact', amount: formatRational(converted), unit: profile.liquid ? 'ml' : 'g', basis: ['green-olives', 'capers'].includes(profile.key) ? 'drained' : 'net' },
      estimates: [profile.liquid ? 'Rekenmaat: eetlepel 15 ml, theelepel 5 ml.' : `Geschat: eetlepel ${profile.name} ≈ ${grams} g.`] };
  }
  if (profile?.handfulGrams && /hand(?:je|vol)/.test(line)) {
    const count = line.match(/^(\d+)\s*hand/)?.[1] ?? '1';
    return { quantity: { kind: 'exact', amount: String(Number(count) * profile.handfulGrams), unit: 'g', basis: 'net' }, estimates: [`Geschat: een handje ≈ ${profile.handfulGrams} g.`] };
  }
  if (profile?.garnishGrams || profile?.pantry) {
    const grams = profile.garnishGrams ?? (profile.key === 'black-pepper' ? 1 : profile.liquid ? 15 : 2);
    return { quantity: { kind: 'exact', amount: String(grams), unit: profile.liquid ? 'ml' : 'g', basis: 'net' }, estimates: [`Hoeveelheid ontbreekt; startschatting ${grams} ${profile.liquid ? 'ml' : 'g'} voor het bronrecept. Pas zo nodig aan.`] };
  }
  return { quantity: null, estimates: ['Hoeveelheid onbekend. Kies zelf een verpakkingsaantal.'] };
}

/** Source IDs and quantities stay intact, including one source containing both salt and pepper. */
export function shoppingGroups(recipe: RecipeDto, servings: string): ShoppingGroup[] {
  const requested = parseRational(servings), base = parseRational(recipe.baseServings);
  if (!requested?.numerator || !base?.numerator) throw new Error('BASE_SERVINGS_REQUIRED');
  const groups = new Map<string, ShoppingGroup>();
  for (const source of recipe.ingredients) {
    const split = /^zout\s*(?:&|en)\s*(?:zwarte\s+)?peper$/i.test(source.originalText.trim());
    const ingredients = split ? ['zout', 'zwarte peper'].map(normalizedName => ({ ...source, normalizedName, originalText: normalizedName, attributes: {} })) : [source];
    for (const ingredient of ingredients) {
      const profile = profileFor(ingredient);
      const flags = traits(ingredient);
      const knowledgeKey = [profile?.key ?? `unverified:${normalizeIngredient(ingredient.normalizedName ?? ingredient.originalText)}`, ...flags].join('|');
      const id = `${knowledgeKey}|${ingredient.quantity.basis ?? 'net'}`;
      const raw = rawDemand(ingredient, profile);
      let demand = raw.quantity;
      if (demand) {
        const value = scaleExactQuantity(parseRational(demand.amount)!, requested, base);
        demand = value ? { ...demand, amount: formatRational(value) } : null;
      }
      const existing = groups.get(id);
      if (existing) {
        existing.sources.push(split ? {...source, attributes: {}} : source);
        existing.estimates = [...new Set([...existing.estimates, ...raw.estimates])];
        if (demand && existing.demand && demand.unit !== existing.demand.unit && profile?.pieceGrams) {
          for (const target of [demand, existing.demand]) {
            if (target.unit === 'piece') {
              const weight = multiplyRationals(parseRational(target.amount)!, { numerator: profile.pieceGrams, denominator: 1 });
              if (weight) { target.unit = 'g'; target.amount = formatRational(weight); existing.estimates.push(`Geschat stuksgewicht: ${profile.pieceGrams} g.`); }
            }
          }
        }
        if (demand && existing.demand && demand.unit === existing.demand.unit) {
          const sum = add(parseRational(existing.demand.amount)!, parseRational(demand.amount)!);
          existing.demand = sum ? { ...demand, amount: formatRational(sum) } : null;
        } else existing.demand = null;
      } else groups.set(id, { id, knowledgeKey, name: profile?.name ?? ingredient.normalizedName ?? ingredient.originalText,
        query: profile?.name ?? (ingredient.normalizedName ?? ingredient.originalText).slice(0, 100), pantry: profile?.pantry ?? false,
        sources: [split ? {...source, attributes: {}} : source], demand, estimates: raw.estimates });
    }
  }
  return [...groups.values()].sort((a, b) => Number(a.pantry) - Number(b.pantry));
}

export const MATCH_RULES_VERSION = 'nl-rules-2026-10-09.6';
const replacements: Record<string, RegExp> = {
  'cooking-cream': /slagroom/, 'whipping-cream': /kookroom/, 'sherry-vinegar': /azijn/,
  'tomato-puree': /passata|tomatenblokjes/, passata: /tomatenpuree|tomatenblokjes/, 'tomato-cubes': /tomatenpuree|passata/,
  'garlic': /gehakte knoflook|knoflookpoeder|knoflookpuree/,
  'vanilla-paste': /vanille.?extract|vanillearoma|vanillestokjes/,
};
/** Rules distinguish an actual contradiction from missing evidence. A model cannot lift hard exclusions. */
export function assessProduct(group: ShoppingGroup, product: PicnicProduct): ProductAssessment {
  const [key, ...flags] = group.knowledgeKey.split('|');
  const profile = INGREDIENTS.find(item => item.key === key);
  const name = normalizeIngredient(product.name);
  const result = (status: MatchStatus, reason: string, hardExclusion = false): ProductAssessment => ({ status, reason, hardExclusion, version: MATCH_RULES_VERSION });
  // Ingredient flavours are not evidence that a prepared food is that ingredient.
  if (profile && /chips|uiensoep|knoflooksoep|paprikasoep/.test(name)) return result('unsuitable', 'Andere productsoort; alleen smaak of onderdeel van het product.', true);
  if (profile && !['kefir','coconut-yoghurt'].includes(key) && /\b(?:paneermix|crackers|mayonaise|dressing|mosterd|chips|ribbelchips|yoghurt|yogurt|pudding|worst|fuet|kaas|chocolade|ijs|baklava|servetten|croissants?|cookies|crostini|toast|naan|maaltijd|salade|soep|uiensoep|paprikasoep|mortadella|cakebites|eiwitreep|ijskoffie)\b/.test(name)) return result('unsuitable', 'Andere productsoort; alleen smaak of onderdeel van het product.', true);
  const brand = group.sources.map(item => item.attributes.brand).find(value => typeof value === 'string' && value.trim());
  if (typeof brand === 'string') {
    const requested = normalizeIngredient(brand);
    if (product.brand && normalizeIngredient(product.brand) !== requested) return result('unsuitable', 'Niet het expliciet gevraagde merk.', true);
    if (!product.brand && !(` ${name} `).includes(` ${requested} `)) return result('unresolved', 'Het expliciet gevraagde merk is niet bewezen.');
  }
  if (key === 'salt' && /vaatwas|bad|strooi/.test(name) || ['dried-apricot', 'dried-prune'].includes(key) && /jam|confituur|sap|reep/.test(name) || key === 'black-pepper' && /saus/.test(name)) return result('unsuitable', 'Andere productsoort dan het ingrediënt.', true);
  if (profile && /\b(?:bundel|pakket|mixpakket)\b/.test(name)) return result('unresolved', 'Inhoud van de bundel is niet bewezen.');
  const requestedVegetarian = flags.includes('vegetarisch');
  if (requestedVegetarian && !/vegan|vegetar/.test(name) && /kip|vlees|gehakt|rund|varken/.test(name)) return result('unsuitable', 'Strijdig met expliciete vegetarische variant.', true);
  if (flags.includes('vers') && /gedroogd|gemalen|poeder/.test(name) || flags.includes('gedroogd') && /\bvers(?:e)?\b/.test(name)) return result('unsuitable', 'Strijdig met expliciete verse of gedroogde vorm.', true);
  if (flags.includes('rood') && /gele|witte/.test(name) || flags.includes('met pit') && /zonder pit|ontpit/.test(name) || flags.includes('zonder pit') && /met pit/.test(name)) return result('unsuitable', 'Strijdig met expliciete receptvariant.', true);
  if (key === 'garlic' && /saus|sauce|olie|brood/.test(name)) return result('unsuitable', 'Andere productsoort dan knoflook.', true);
  if (flags.includes('vegan') && !/vegan/.test(name)) return result('unresolved', 'Vegan samenstelling is niet bewezen.');
  if (!profile?.product.test(name) && replacements[key]?.test(name)) return result('substitution', 'Andere vorm van het ingrediënt; kies expliciet.');
  if (!profile || !profile.product.test(name)) return result('unresolved', 'Productsoort kan niet met de beschikbare regels worden bevestigd.');
  if (profile.exclude?.test(name) && !(key === 'oregano-fresh' && flags.includes('gedroogd') && /gedroogd/.test(name))) return result('substitution', 'Andere vorm of variant; kies expliciet.');
  if (key === 'onion' && !/^(?:picnic )?(?:bio )?(?:losse |gele |witte |zoete )?ui(?:en)?(?: klein)?$/.test(name)) return result('unresolved', 'Vorm van de ui is niet bewezen.');
  if (key === 'garlic' && !/^(?:bio |verse |biologische )*knoflook$/.test(name)) return result('unresolved', 'Verse knoflook is niet bewezen.');
  if (key === 'pistachio' && !/^(?:picnic |qualino |dr\. oetker )?(?:bio )?pistache(?:noten)?(?: (?:gezouten|ongezouten|kernels|fijngehakt|gepeld))*$/.test(name)) return result('unresolved', 'Productvorm is niet bewezen.');
  if (key === 'oregano-fresh' && !(flags.includes('gedroogd') ? /gedroogd/.test(name) : /\bvers(?:e)?\b/.test(name))) return result('unresolved', 'Verse of gedroogde vorm ontbreekt.');
  if (key === 'dried-apricot' || key === 'dried-prune') {
    if (!/gedroogd|zacht|zachte|ready to eat/.test(name)) return result('unresolved', 'Gedroogde vorm ontbreekt.');
  }
  if (requestedVegetarian && !/vegan|vegetar/.test(name)) return result('unresolved', 'Vegetarische samenstelling is niet bewezen.');
  if (!requestedVegetarian && /vegan|vegetar/.test(name)) return result('substitution', 'Vegetarische vervanging; kies expliciet.');
  for (const flag of flags) {
    const required: Record<string, RegExp> = { rood: /rode|rood/, zwart: /zwart/, bruin: /bruin|donker/, 'zonder pit': /zonder pit|ontpit/, 'met pit': /met pit/, volkoren: /volkoren|zilvervlies/, basmati: /basmati/ };
    if (required[flag] && !required[flag].test(name)) return result('unresolved', 'Expliciete receptvariant is niet bewezen.');
  }
  for (const field of ['form', 'variant'] as const) {
    const explicit = group.sources.map(item => item.attributes[field]).filter(value => typeof value === 'string' && value.trim());
    for (const value of explicit) {
      const normalized = purchaseAttribute(value);
      if (!normalized || representedCharacteristic.test(normalized)) continue;
      if (!name.includes(normalized)) return result('unresolved', 'Expliciete vorm of variant is niet bewezen.');
    }
  }
  if (key === 'black-pepper' && !/^(?:(?:picnic|verstegen|drogheria|euroma|euroma drogheria) )?(?:bio )?zwarte peper(?:korrels)?(?: (?:gemalen|bio))*$/.test(name)) return result('unresolved', 'Productvorm is niet bewezen.');
  if (key.startsWith('chicken-') && /knoflook|paprika|kebab|sate|curry|shoarma/.test(name)) return result('substitution', 'Gekruide variant; kies expliciet.');
  return result('suitable', 'Productnaam bevestigt ingrediënt en vereiste variant.');
}
export function classifyProduct(group: ShoppingGroup, product: PicnicProduct): MatchStatus {
  return assessProduct(group, product).status;
}

export function candidateFor(group: ShoppingGroup, product: PicnicProduct, assessment: ProductAssessment = assessProduct(group, product)): ShoppingCandidate {
  const profile = INGREDIENTS.find(item => item.key === group.knowledgeKey.split('|')[0]);
  const estimates = [...group.estimates];
  let need = group.demand && canonical(group.demand);
  let pack = product.quantity && canonical(product.quantity);
  if (need && pack && need.unit !== pack.unit && profile?.pieceGrams) {
    if (need.unit === 'piece' && pack.unit === 'g') {
      const weight = profile.key === 'garlic' && group.sources.every(item => /bol/.test(item.originalText)) ? 50 : profile.pieceGrams;
      const amount = multiplyRationals(parseRational(need.amount)!, { numerator: weight, denominator: 1 });
      need = amount ? { ...need, amount: formatRational(amount), unit: 'g' } : null;
      estimates.push(`Geschat: één ${profile.key === 'garlic' && weight === 5 ? 'teentje' : 'stuk'} ≈ ${weight} g.`);
    } else if (pack.unit === 'piece' && need.unit === 'g') {
      const amount = multiplyRationals(parseRational(pack.amount)!, { numerator: profile.key === 'garlic' ? 50 : profile.pieceGrams, denominator: 1 });
      pack = amount ? { ...pack, amount: formatRational(amount), unit: 'g' } : null;
      estimates.push(`Geschat stuksgewicht: ${profile.key === 'garlic' ? 50 : profile.pieceGrams} g.`);
    }
  }
  // A clove in the recipe and a bulb in the shop are not the same "piece".
  if (profile?.key === 'garlic' && need?.unit === 'piece' && pack?.unit === 'piece' && group.sources.some(item => /teen/.test(item.originalText))) {
    const amount = multiplyRationals(parseRational(pack.amount)!, { numerator: 10, denominator: 1 });
    pack = amount ? { ...pack, amount: formatRational(amount) } : null;
    estimates.push('Geschat: 10 teentjes per bol knoflook.');
  }
  if (profile?.key === 'pistachio' && need?.unit === 'g' && pack?.unit === 'g' && !/kernels|gepeld|fijngehakt/.test(normalizeIngredient(product.name))) {
    const edible = multiplyRationals(parseRational(pack.amount)!, { numerator: 1, denominator: 2 });
    pack = edible ? { ...pack, amount: formatRational(edible) } : null;
    estimates.push('Geschat eetbaar gewicht bij mogelijke doppen: 50% van de verpakking.');
  }
  let packCount: number | null = null;
  if (need && pack && need.unit === pack.unit) {
    let packAmount = parseRational(pack.amount)!;
    if (need.basis === 'drained' && pack.basis !== 'drained') {
      if (['green-olives', 'capers'].includes(profile?.key ?? '')) {
        packAmount = multiplyRationals(packAmount, { numerator: 1, denominator: 2 })!;
        estimates.push('Geschat uitlekgewicht: 50% van de verpakking.');
      } else pack = null;
    }
    if (pack && packAmount.numerator > 0) {
      const n = parseRational(need.amount)!;
      const numerator = BigInt(n.numerator) * BigInt(packAmount.denominator);
      const denominator = BigInt(n.denominator) * BigInt(packAmount.numerator);
      const count = (numerator + denominator - 1n) / denominator;
      if (count > 0n && count <= 10_000n) packCount = Number(count);
    }
  }
  if (need && pack && need.unit !== 'piece' && need.basis == null) estimates.push('Verpakking en recept berekend op nettohoeveelheid.');
  if (packCount) {
    let bestTotal = packCount * (unitPriceForPacks(product, packCount) ?? Number.MAX_SAFE_INTEGER);
    for (const tier of product.priceRanges) {
      const total = tier.fromQuantity * tier.priceCents;
      if (tier.fromQuantity >= packCount && tier.fromQuantity <= 10_000 && total < bestTotal) { packCount = tier.fromQuantity; bestTotal = total; }
    }
  }
  const price = packCount ? unitPriceForPacks(product, packCount) : null;
  const match = assessment.status;
  if (match !== 'suitable' || product.isAvailable === false || product.maxCount !== undefined && packCount !== null && packCount > product.maxCount) packCount = null;
  return { product, match, assessment, packCount,
    totalPriceCents: packCount !== null && price !== null && Number.isSafeInteger(packCount * price) ? packCount * price : null,
    estimates: [...new Set(estimates)] };
}
/** Assessment and calculation are independently injectable; unavailable or proven wrong products are hidden. */
export function rankCandidates(group: ShoppingGroup, products: PicnicProduct[], assess = assessProduct): ShoppingCandidate[] {
  const order: Record<MatchStatus, number> = { suitable: 0, substitution: 1, unresolved: 2, unsuitable: 3 };
  return [...new Map(products.map(product => [product.id, product])).values()]
    .filter(product => product.isAvailable !== false)
    .map(product => candidateFor(group, product, assess(group, product)))
    .filter(candidate => candidate.match !== 'unsuitable')
    .sort((a, b) => order[a.match] - order[b.match] ||
      (a.totalPriceCents ?? Number.MAX_SAFE_INTEGER) - (b.totalPriceCents ?? Number.MAX_SAFE_INTEGER) || a.product.id.localeCompare(b.product.id));
}
export function validServings(value: unknown): value is string {
  const amount = parseRational(value);
  return !!amount && amount.numerator > 0 && compareRationals(amount, { numerator: 1000, denominator: 1 })! <= 0;
}
