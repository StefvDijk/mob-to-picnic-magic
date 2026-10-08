import { describe, expect, it } from 'vitest';
import { compareRationals, formatRational, multiplyRationals, parseQuantity, parseRational } from './quantities';

describe('exact shared quantities', () => {
  it('accepts exact fractions and finite decimals without rounding', () => {
    expect(formatRational(parseRational('1/3')!)).toBe('1/3');
    expect(formatRational(parseRational('0.125')!)).toBe('1/8');
    expect(parseRational('0,5')).toBeNull();
    expect(parseRational('١')).toBeNull();
    expect(parseRational('1/0')).toBeNull();
    expect(parseRational('9007199254740992')).toBeNull();
  });

  it('multiplies and compares exactly within safe bounds', () => {
    expect(formatRational(multiplyRationals({ numerator: 1, denominator: 3 }, { numerator: 6, denominator: 1 })!)).toBe('2');
    expect(compareRationals({ numerator: Number.MAX_SAFE_INTEGER, denominator: 1 }, { numerator: Number.MAX_SAFE_INTEGER - 1, denominator: 1 })).toBe(1);
  });

  it('validates quantity wire objects and basis fields', () => {
    expect(parseQuantity({ kind: 'range', amount: '1/3', maximum: '0.5', unit: 'g', basis: 'drained' })).toEqual({
      kind: 'range', amount: '1/3', maximum: '1/2', unit: 'g', basis: 'drained',
    });
    expect(parseQuantity({ kind: 'exact', amount: '1', unit: 'piece', basis: 'drained' })).toBeNull();
    expect(parseQuantity({ kind: 'global', extra: true })).toBeNull();
  });

  it('round-trips unknown and global quantities without assigning a measurement basis', () => {
    for (const kind of ['unknown', 'global']) {
      const normalized = parseQuantity({ kind });
      expect(normalized).toEqual({ kind, basis: null });
      expect(parseQuantity(JSON.parse(JSON.stringify(normalized)))).toEqual(normalized);
      expect(parseQuantity({ kind, basis: 'net' })).toBeNull();
      expect(parseQuantity({ kind, amount: '1' })).toBeNull();
    }
  });
});
