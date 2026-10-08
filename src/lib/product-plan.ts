import type { PicnicProduct } from '../../shared/picnic';
import { formatRational, parseRational, type Quantity, type QuantityUnit, type Rational } from '../../shared/quantities';
import type { RecipeIngredientDto } from '../../shared/recipes';
import { selectProducts, type ProductSelection } from '../../worker/domain/productSelector';
import { scaleExactQuantity } from '../../worker/domain/quantityMath';

export type ProductPlanResult =
  | { status: 'unresolved'; reason: string }
  | { status: 'selected'; needed: string; unit: QuantityUnit; basis: 'net' | 'drained' | null; selection: ProductSelection; products: PicnicProduct[] };

function compatibleUnits(left: QuantityUnit, right: QuantityUnit): boolean {
  return (left === 'g' || left === 'kg') && (right === 'g' || right === 'kg') ||
    (left === 'ml' || left === 'l') && (right === 'ml' || right === 'l') || left === 'piece' && right === 'piece';
}

function quantityNeed(quantity: Quantity, baseServings: string | null, requestedServings: string):
  { amount: Rational; unit: QuantityUnit; basis: 'net' | 'drained' | null } | null {
  if (quantity.kind !== 'exact' && quantity.kind !== 'range') return null;
  if (!quantity.unit || (quantity.unit !== 'piece' && !quantity.basis)) return null;
  const amount = parseRational(quantity.kind === 'range' ? quantity.maximum : quantity.amount);
  if (!amount || amount.numerator <= 0) return null;
  const requested = parseRational(requestedServings);
  const base = baseServings === null ? null : parseRational(baseServings);
  if (!requested || requested.numerator <= 0 || !base || base.numerator <= 0) return null;
  const scaled = scaleExactQuantity(amount, requested, base);
  return scaled && scaled.numerator > 0 ? { amount: scaled, unit: quantity.unit, basis: quantity.unit === 'piece' ? null : quantity.basis! } : null;
}

/** Build a plan only from products the user explicitly marked suitable. */
export function planIngredientProducts(input: {
  ingredient: RecipeIngredientDto;
  baseServings: string | null;
  requestedServings: string;
  products: PicnicProduct[];
  suitableProductIds: ReadonlySet<string>;
  /** Confirms the basis for provider packages that omit it (currently Picnic's mass/volume quantities). */
  confirmedProductBasisIds?: ReadonlySet<string>;
}): ProductPlanResult {
  const need = quantityNeed(input.ingredient.quantity, input.baseServings, input.requestedServings);
  if (!need) return { status: 'unresolved', reason: 'Controleer de hoeveelheid, eenheid en porties in het recept voordat je producten kiest.' };

  const confirmed = input.confirmedProductBasisIds ?? new Set<string>();
  const eligibleProducts = input.products.filter(product => {
    if (!input.suitableProductIds.has(product.id) || product.priceCertainty !== 'known' ||
      !Number.isSafeInteger(product.displayPriceCents) || product.displayPriceCents! < 0 ||
      product.quantity?.kind !== 'exact' || !product.quantity.unit) return false;
    const packAmount = parseRational(product.quantity.amount);
    if (!packAmount || packAmount.numerator <= 0) return false;
    if (!compatibleUnits(need.unit, product.quantity.unit)) return false;
    if (need.unit === 'piece') return product.quantity.basis == null;
    if (product.quantity.basis && product.quantity.basis !== need.basis) return false;
    return product.quantity.basis === need.basis || product.quantity.basis == null && confirmed.has(product.id);
  });

  const options = eligibleProducts.map(product => ({
    id: product.id,
    groupId: product.identity.groupId,
    variantId: product.identity.variantId,
    eligible: true,
    unit: product.quantity!.unit!,
    amount: parseRational(product.quantity!.amount)!,
    basis: need.unit === 'piece' ? null : need.basis,
    priceCents: product.displayPriceCents!,
  }));
  const selection = selectProducts({ need: need.amount, unit: need.unit, basis: need.basis, products: options });
  return { status: 'selected', needed: formatRational(need.amount),
    unit: need.unit, basis: need.basis, selection, products: eligibleProducts };
}
