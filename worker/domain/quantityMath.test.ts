import { describe, expect, it } from 'vitest';
import { scaleExactQuantity } from './quantityMath';

describe('scaleExactQuantity', () => {
  it('scales before package rounding and keeps the result exact', () => {
    expect(scaleExactQuantity({ numerator: 350, denominator: 1 }, { numerator: 4, denominator: 1 },
      { numerator: 2, denominator: 1 })).toEqual({ numerator: 700, denominator: 1 });
    expect(scaleExactQuantity({ numerator: 1, denominator: 3 }, { numerator: 2, denominator: 1 },
      { numerator: 1, denominator: 1 })).toEqual({ numerator: 2, denominator: 3 });
  });

  it('rejects unknown base servings and results outside safe storage bounds', () => {
    expect(scaleExactQuantity({ numerator: 1, denominator: 1 }, { numerator: 2, denominator: 1 },
      { numerator: 0, denominator: 1 })).toBeNull();
    expect(scaleExactQuantity({ numerator: Number.MAX_SAFE_INTEGER, denominator: 1 },
      { numerator: Number.MAX_SAFE_INTEGER, denominator: 1 }, { numerator: 1, denominator: 1 })).toBeNull();
  });
});
