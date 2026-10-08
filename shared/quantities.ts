/** Exact rational values shared by browser and worker code. */
export interface Rational {
  numerator: number;
  denominator: number;
}

export type QuantityUnit = 'g' | 'kg' | 'ml' | 'l' | 'piece';
export type QuantityKind = 'exact' | 'range' | 'global' | 'unknown';

export interface Quantity {
  kind: QuantityKind;
  amount?: string;
  maximum?: string;
  unit?: QuantityUnit;
  basis?: 'net' | 'drained' | null;
}

const MAX_COMPONENT = Number.MAX_SAFE_INTEGER;
// At most 32 characters per value, plus the safe-integer numerator/denominator storage cap.
const INPUT_LIMIT = 32;

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function makeRational(numerator: number, denominator: number): Rational | null {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) ||
      numerator < 0 || denominator <= 0 || numerator > MAX_COMPONENT || denominator > MAX_COMPONENT) return null;
  const divisor = gcd(numerator, denominator) || 1;
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

/** Parses unsigned integers, finite decimal strings, or exact n/d fractions. No locale normalization is done here. */
export function parseRational(input: unknown): Rational | null {
  if (typeof input !== 'string' || input.length === 0 || input.length > INPUT_LIMIT) return null;
  if (/^(0|[1-9]\d*)\/(0|[1-9]\d*)$/.test(input)) {
    const [n, d] = input.split('/');
    return makeRational(Number(n), Number(d));
  }
  if (/^(0|[1-9]\d*)(?:\.(\d+))?$/.test(input)) {
    const [whole, fraction = ''] = input.split('.');
    if (fraction.length > 15) return null;
    const denominator = 10 ** fraction.length;
    const numerator = Number(whole) * denominator + Number(fraction || 0);
    return makeRational(numerator, denominator);
  }
  return null;
}

export function formatRational(value: Rational): string {
  const normalized = makeRational(value.numerator, value.denominator);
  if (!normalized) throw new RangeError('Rational is outside the supported exact range');
  return normalized.denominator === 1 ? String(normalized.numerator) : `${normalized.numerator}/${normalized.denominator}`;
}

export function multiplyRationals(left: Rational, right: Rational): Rational | null {
  const a = makeRational(left.numerator, left.denominator);
  const b = makeRational(right.numerator, right.denominator);
  if (!a || !b) return null;
  // Cross-cancel before multiplication to preserve the integer safety bound.
  const x = gcd(a.numerator, b.denominator) || 1;
  const y = gcd(b.numerator, a.denominator) || 1;
  return makeRational((a.numerator / x) * (b.numerator / y), (a.denominator / y) * (b.denominator / x));
}

export function compareRationals(left: Rational, right: Rational): number | null {
  const a = makeRational(left.numerator, left.denominator);
  const b = makeRational(right.numerator, right.denominator);
  if (!a || !b) return null;
  const leftScaled = BigInt(a.numerator) * BigInt(b.denominator);
  const rightScaled = BigInt(b.numerator) * BigInt(a.denominator);
  return leftScaled === rightScaled ? 0 : leftScaled < rightScaled ? -1 : 1;
}

export function parseQuantity(input: unknown): Quantity | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const item = input as Record<string, unknown>;
  if (item.kind === 'global' || item.kind === 'unknown') {
    return Object.keys(item).every(key => key === 'kind' || key === 'basis') && item.basis == null
      ? { kind: item.kind, basis: null } : null;
  }
  if (item.kind !== 'exact' && item.kind !== 'range') return null;
  if (typeof item.unit !== 'string' || !['g', 'kg', 'ml', 'l', 'piece'].includes(item.unit) || !validBasis(item.basis)) return null;
  if (item.basis != null && !['g', 'kg'].includes(item.unit) && !['ml', 'l'].includes(item.unit)) return null;
  const amount = parseRational(item.amount);
  if (!amount) return null;
  if (item.kind === 'exact') {
    return Object.keys(item).every(key => ['kind', 'amount', 'unit', 'basis'].includes(key))
      ? { kind: 'exact', amount: formatRational(amount), unit: item.unit as QuantityUnit,
        basis: item.basis === undefined ? null : item.basis as 'net' | 'drained' | null } : null;
  }
  const maximum = parseRational(item.maximum);
  if (!maximum || compareRationals(amount, maximum) === null || compareRationals(amount, maximum)! > 0) return null;
  return Object.keys(item).every(key => ['kind', 'amount', 'maximum', 'unit', 'basis'].includes(key))
    ? { kind: 'range', amount: formatRational(amount), maximum: formatRational(maximum), unit: item.unit as QuantityUnit,
      basis: item.basis === undefined ? null : item.basis as 'net' | 'drained' | null } : null;
}

function validBasis(value: unknown): boolean {
  return value === undefined || value === null || value === 'net' || value === 'drained';
}
