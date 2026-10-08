import { compareRationals, parseRational, type Rational, type QuantityUnit } from '../../shared/quantities';

export interface ProductOption {
  id: string;
  /** Must come from a verified Picnic product relationship; never inferred from a name. */
  groupId: string;
  variantId: string;
  eligible: boolean;
  substitution?: boolean;
  substitutionAccepted?: boolean;
  unit: QuantityUnit;
  amount: Rational;
  basis: 'net' | 'drained' | null;
  priceCents: number;
}

export interface BasketAllocation {
  basketLineId: string;
  productId: string;
  amount: Rational;
  availableAmount: Rational;
  unit: QuantityUnit;
  basis: 'net' | 'drained' | null;
  /** This quantity was explicitly assigned by the user to this recipe. */
  accepted: boolean;
}

export interface ProductSelectionInput {
  need: Rational;
  unit: QuantityUnit;
  basis: 'net' | 'drained' | null;
  products: ProductOption[];
  basketAllocations?: BasketAllocation[];
  /** A SKU id used only to identify its verified groupId+variantId preference. */
  rememberedProductId?: string | null;
  maxStates?: number;
  maxPackages?: number;
}

export interface PackageCount { productId: string; count: number }
export interface ProductPlan {
  groupId: string;
  variantId: string;
  unit: 'g' | 'ml' | 'piece';
  packageCounts: PackageCount[];
  totalCents: number;
  supplied: string;
  overshoot: string;
}
export interface ProductSelection {
  status: 'selected' | 'covered_by_basket' | 'unresolved';
  reason?: 'invalid_input' | 'incompatible_units' | 'missing_basis' | 'search_truncated' | 'no_sufficient_product';
  needed: string;
  assigned: string;
  remaining: string;
  selected: ProductPlan | null;
  cheaperAlternative: ProductPlan | null;
  alternatives: ProductPlan[];
  truncated: boolean;
}

const MAX_PRODUCTS = 60;
const MAX_STATES_DEFAULT = 20_000;
const MAX_PACKAGES_DEFAULT = 10_000;
const MAX_SCALE = 1_000_000_000_000n;
const MAX_TRANSITIONS = 1_000_000;

function validRational(value: Rational): boolean {
  return !!parseRational(`${value.numerator}/${value.denominator}`);
}
function unitFactor(unit: QuantityUnit): bigint {
  return unit === 'kg' || unit === 'l' ? 1000n : 1n;
}
function baseAmount(value: Rational, unit: QuantityUnit): { n: bigint; d: bigint } {
  const n = BigInt(value.numerator) * unitFactor(unit);
  const d = BigInt(value.denominator);
  return { n, d };
}
function gcdBigInt(a: bigint, b: bigint): bigint { while (b) [a, b] = [b, a % b]; return a; }
function lcm(a: bigint, b: bigint): bigint { return (a / gcdBigInt(a, b)) * b; }
function compatibleUnit(a: QuantityUnit, b: QuantityUnit): boolean {
  return (a === 'g' || a === 'kg') && (b === 'g' || b === 'kg') ||
    (a === 'ml' || a === 'l') && (b === 'ml' || b === 'l') || a === 'piece' && b === 'piece';
}
function canonical(n: bigint, d: bigint): string {
  const divisor = gcdBigInt(n, d) || 1n;
  n /= divisor; d /= divisor;
  return d === 1n ? n.toString() : `${n}/${d}`;
}
function compareExactText(left: string, right: string): number {
  const parse = (value: string): [bigint, bigint] => {
    const [n, d = '1'] = value.split('/');
    return [BigInt(n), BigInt(d)];
  };
  const [an, ad] = parse(left), [bn, bd] = parse(right);
  const x = an * bd, y = bn * ad;
  return x === y ? 0 : x < y ? -1 : 1;
}
function comparePlan(a: ProductPlan, b: ProductPlan): number {
  if (a.totalCents !== b.totalCents) return a.totalCents < b.totalCents ? -1 : 1;
  const overshoot = compareExactText(a.overshoot, b.overshoot);
  if (overshoot) return overshoot;
  const countA = a.packageCounts.reduce((sum, item) => sum + item.count, 0);
  const countB = b.packageCounts.reduce((sum, item) => sum + item.count, 0);
  if (countA !== countB) return countA - countB;
  const keyA = a.packageCounts.map(item => item.productId).join('\0');
  const keyB = b.packageCounts.map(item => item.productId).join('\0');
  return keyA.localeCompare(keyB);
}
function plansForGroup(
  group: ProductOption[], requiredN: bigint, scale: bigint, maxStates: number, maxPackages: number,
): { plan: ProductPlan | null; truncated: boolean } {
  const normalized = group.slice().sort((a, b) => a.id.localeCompare(b.id));
  const sizes = normalized.map(p => BigInt(p.amount.numerator) * unitFactor(p.unit) * (scale / BigInt(p.amount.denominator)));
  const largest = sizes.reduce((a, b) => a > b ? a : b, 0n);
  const smallest = sizes.reduce((a, b) => a < b ? a : b);
  const maxSupply = requiredN + largest;
  const maxCountBig = (requiredN + smallest - 1n) / smallest + 1n;
  if (maxCountBig > BigInt(maxPackages)) return { plan: null, truncated: true };
  let states = new Map<bigint, { cents: number; counts: number[] }>([[0n, { cents: 0, counts: normalized.map(() => 0) }]]);
  let truncated = false;
  let transitions = 0;
  for (let count = 0; count < Number(maxCountBig); count += 1) {
    const next = new Map(states);
    for (const [supply, current] of states) {
      for (let i = 0; i < normalized.length; i += 1) {
        transitions += 1;
        if (transitions > MAX_TRANSITIONS) { truncated = true; break; }
        const product = normalized[i];
        const sum = supply + sizes[i];
        if (sum > maxSupply) continue;
        const cents = current.cents + product.priceCents;
        if (!Number.isSafeInteger(cents)) { truncated = true; continue; }
        const counts = current.counts.slice(); counts[i] += 1;
        const previous = next.get(sum);
        if (!previous || cents < previous.cents || cents === previous.cents && counts.reduce((a, b) => a + b, 0) < previous.counts.reduce((a, b) => a + b, 0)) {
          next.set(sum, { cents, counts });
        }
      }
      if (truncated && transitions > MAX_TRANSITIONS) break;
    }
    if (truncated && transitions > MAX_TRANSITIONS) break;
    if (next.size > maxStates) { truncated = true; break; }
    states = next;
  }
  let best: ProductPlan | null = null;
  for (const [supply, state] of states) {
    if (supply < requiredN) continue;
    const packageCounts = normalized.flatMap((p, i) => state.counts[i] ? [{ productId: p.id, count: state.counts[i] }] : []);
    const first = normalized[0];
    const plan = { groupId: first.groupId, variantId: first.variantId,
      unit: first.unit === 'kg' ? 'g' : first.unit === 'l' ? 'ml' : first.unit,
      packageCounts, totalCents: state.cents, supplied: canonical(supply, scale), overshoot: canonical(supply - requiredN, scale) };
    if (!best || comparePlan(plan, best) < 0) best = plan;
  }
  return { plan: best, truncated };
}

/** Pure exact product/package selection. A truncated search returns unresolved instead of guessing. */
export function selectProducts(input: ProductSelectionInput): ProductSelection {
  const empty = { needed: '0', assigned: '0', remaining: '0', selected: null, cheaperAlternative: null,
    alternatives: [] as ProductPlan[], truncated: false };
  if (!validRational(input.need) || input.need.numerator <= 0 || input.products.length > MAX_PRODUCTS) {
    return { ...empty, status: 'unresolved', reason: 'invalid_input' };
  }
  if (input.unit === 'piece' && input.basis !== null) return { ...empty, status: 'unresolved', reason: 'invalid_input' };
  const maxStates = input.maxStates ?? MAX_STATES_DEFAULT;
  const maxPackages = input.maxPackages ?? MAX_PACKAGES_DEFAULT;
  if (!Number.isSafeInteger(maxStates) || maxStates < 1 || !Number.isSafeInteger(maxPackages) || maxPackages < 1) {
    return { ...empty, status: 'unresolved', reason: 'invalid_input' };
  }
  const need = baseAmount(input.need, input.unit);
  const candidates = input.products.filter(p => p.eligible && (!p.substitution || p.substitutionAccepted === true));
  if (new Set(candidates.map(p => p.id)).size !== candidates.length ||
      candidates.some(p => !p.id || p.id.length > 100 || !p.groupId || !p.variantId || !validRational(p.amount) ||
        p.amount.numerator <= 0 || !Number.isSafeInteger(p.priceCents) || p.priceCents < 0)) {
    return { ...empty, needed: canonical(need.n, need.d), status: 'unresolved', reason: 'invalid_input' };
  }
  const eligible = candidates.filter(p => compatibleUnit(input.unit, p.unit));
  const basisEligible = input.unit === 'piece' ? eligible.filter(p => p.basis === null)
    : input.basis === null ? [] : eligible.filter(p => p.basis === input.basis);
  const acceptedAllocations = (input.basketAllocations ?? []).filter(allocation => allocation.accepted);
  if (new Set(acceptedAllocations.map(allocation => allocation.basketLineId)).size !== acceptedAllocations.length ||
      acceptedAllocations.some(allocation => !allocation.basketLineId || allocation.basketLineId.length > 100)) {
    return { ...empty, needed: canonical(need.n, need.d), status: 'unresolved', reason: 'invalid_input' };
  }
  for (const allocation of acceptedAllocations) {
    const allocationCompare = validRational(allocation.amount) && validRational(allocation.availableAmount)
      ? compareRationals(allocation.amount, allocation.availableAmount) : null;
    if (!validRational(allocation.amount) || allocation.amount.numerator <= 0 || allocationCompare === null || allocationCompare > 0 ||
        !compatibleUnit(input.unit, allocation.unit)) {
      return { ...empty, needed: canonical(need.n, need.d), status: 'unresolved', reason: 'invalid_input' };
    }
    const product = eligible.find(p => p.id === allocation.productId);
    if (!product || !basisEligible.includes(product) || allocation.basis !== input.basis || product.basis !== input.basis) {
      return { ...empty, needed: canonical(need.n, need.d), status: 'unresolved', reason: 'missing_basis' };
    }
  }
  let scale = need.d;
  for (const product of basisEligible) {
    scale = lcm(scale, BigInt(product.amount.denominator));
    if (scale > MAX_SCALE) return { ...empty, needed: canonical(need.n, need.d), status: 'unresolved', reason: 'search_truncated', truncated: true };
  }
  for (const allocation of acceptedAllocations) {
    scale = lcm(scale, BigInt(allocation.amount.denominator));
    if (scale > MAX_SCALE) return { ...empty, needed: canonical(need.n, need.d), status: 'unresolved', reason: 'search_truncated', truncated: true };
  }
  const needScaled = need.n * (scale / need.d);
  const groups = new Map<string, ProductOption[]>();
  let assigned = 0n;
  for (const allocation of acceptedAllocations) {
    if (!allocation.accepted) continue;
    const product = eligible.find(p => p.id === allocation.productId);
    const massOrVolume = input.unit !== 'piece';
    if (!product || !compatibleUnit(input.unit, allocation.unit) ||
      massOrVolume && (input.basis === null || allocation.basis === null || product.basis === null) ||
      allocation.basis !== input.basis || product.basis !== input.basis) {
      return { ...empty, needed: canonical(need.n, need.d), status: 'unresolved', reason: 'missing_basis' };
    }
    const amount = baseAmount(allocation.amount, allocation.unit);
    assigned += amount.n * (scale / amount.d);
  }
  const assignedCapped = assigned > needScaled ? needScaled : assigned;
  const remaining = needScaled - assignedCapped;
  const base = { needed: canonical(needScaled, scale), assigned: canonical(assignedCapped, scale), remaining: canonical(remaining, scale) };
  if (remaining === 0n) return { ...base, status: 'covered_by_basket', selected: null, cheaperAlternative: null, alternatives: [], truncated: false };
  if (eligible.length > 0 && basisEligible.length === 0) {
    return { ...base, status: 'unresolved', reason: 'missing_basis', selected: null, cheaperAlternative: null, alternatives: [], truncated: false };
  }
  for (const product of basisEligible) {
    const key = `${product.groupId}\0${product.variantId}`;
    groups.set(key, [...(groups.get(key) ?? []), product]);
  }
  if (!eligible.length) return { ...base, status: 'unresolved', reason: candidates.length ? 'incompatible_units' : 'no_sufficient_product', selected: null, cheaperAlternative: null, alternatives: [], truncated: false };
  let truncated = false;
  const plans: ProductPlan[] = [];
  for (const group of groups.values()) {
    if (!group.every(product => product.unit === group[0].unit || compatibleUnit(product.unit, group[0].unit))) continue;
    const found = plansForGroup(group, remaining, scale, Math.min(maxStates, MAX_STATES_DEFAULT), Math.min(maxPackages, MAX_PACKAGES_DEFAULT));
    truncated ||= found.truncated;
    if (found.plan) plans.push(found.plan);
  }
  plans.sort(comparePlan);
  if (truncated) return { ...base, status: 'unresolved', reason: 'search_truncated', selected: null, cheaperAlternative: null, alternatives: plans, truncated: true };
  if (!plans.length) return { ...base, status: 'unresolved', reason: 'no_sufficient_product', selected: null, cheaperAlternative: null, alternatives: [], truncated: false };
  const rememberedSku = input.rememberedProductId ? basisEligible.find(product => product.id === input.rememberedProductId) : undefined;
  const remembered = rememberedSku ? plans.find(plan => plan.groupId === rememberedSku.groupId && plan.variantId === rememberedSku.variantId) : undefined;
  const selected = remembered ?? plans[0];
  const cheaperAlternative = remembered ? plans.find(plan => plan.totalCents < remembered.totalCents) ?? null : null;
  return { ...base, status: 'selected', selected, cheaperAlternative, alternatives: plans, truncated: false };
}
