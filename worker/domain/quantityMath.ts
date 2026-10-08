import type { Rational } from '../../shared/quantities';

const MAX = BigInt(Number.MAX_SAFE_INTEGER);
function gcd(a: bigint, b: bigint): bigint { while (b) [a, b] = [b, a % b]; return a; }

/** Scales a source amount by requestedServings / baseServings without decimal rounding. */
export function scaleExactQuantity(source: Rational, requestedServings: Rational, baseServings: Rational): Rational | null {
  const values = [source, requestedServings, baseServings];
  if (values.some(value => !Number.isSafeInteger(value.numerator) || !Number.isSafeInteger(value.denominator) ||
    value.numerator < 0 || value.denominator <= 0)) return null;
  if (baseServings.numerator === 0 || requestedServings.numerator === 0) return null;
  let numerator = BigInt(source.numerator) * BigInt(requestedServings.numerator) * BigInt(baseServings.denominator);
  let denominator = BigInt(source.denominator) * BigInt(requestedServings.denominator) * BigInt(baseServings.numerator);
  // Cross-cancel all numerator/denominator pairs before imposing the DB integer cap.
  let divisor = gcd(numerator, denominator);
  numerator /= divisor;
  denominator /= divisor;
  if (numerator > MAX || denominator > MAX) return null;
  return { numerator: Number(numerator), denominator: Number(denominator) };
}
