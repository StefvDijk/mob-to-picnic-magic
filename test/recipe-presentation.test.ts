import { describe, expect, it } from 'vitest';
import { ingredientNotes, quantityLabel, recipeStepText, shoppingQuantityLabel } from '../src/lib/recipe-presentation';
import { recipeImageUrl } from '../shared/recipe-image';

describe('source quantities in the recipe interface', () => {
  it('keeps a readable spoon measure instead of claiming the amount is absent', () => {
    const ingredient = { originalText: '4 eetlepels sherryazijn', quantity: { kind: 'unknown' as const },
      uncertainty: ['Hoeveelheid controleren', 'Een hoeveelheid ontbreekt in de bron.', 'Controleer de soort azijn.'] };
    expect(quantityLabel(ingredient.quantity, ingredient.originalText)).toBe('4 eetlepels');
    expect(ingredientNotes(ingredient)).toEqual(['Controleer de soort azijn.']);
    expect(ingredient.quantity).toEqual({ kind: 'unknown' });
  });
  it('retains warnings when the source amount really is unclear', () => {
    expect(ingredientNotes({ originalText: 'een beetje rijst', quantity: { kind: 'unknown' }, uncertainty: ['De hoeveelheid is niet eenduidig leesbaar.'] })).toEqual(['De hoeveelheid is niet eenduidig leesbaar.']);
    expect(quantityLabel({ kind: 'range', amount: '200', maximum: '300', unit: 'g' })).toBe('200–300 g');
  });
  it('removes duplicated step numbering without removing cooking temperatures', () => {
    expect(recipeStepText('1. Verwarm de oven tot 180 graden.')).toBe('Verwarm de oven tot 180 graden.');
    expect(recipeStepText('10 minuten laten rusten.')).toBe('10 minuten laten rusten.');
    expect(recipeStepText('1 Doe de kip in de pan.')).toBe('Doe de kip in de pan.');
    expect(recipeStepText('Laat 10 minuten staan.')).toBe('Laat 10 minuten staan.');
  });
});

describe('publisher recipe covers', () => {
  it('accepts supported source images and rejects credentials, local addresses and unrelated hosts', () => {
    const source = 'https://www.culy.nl/recepten/kip/';
    expect(recipeImageUrl('https://img.culy.nl/kip.jpg', source)).toBe('https://img.culy.nl/kip.jpg');
    for (const image of ['http://img.culy.nl/kip.jpg', 'https://user:password@img.culy.nl/a', 'https://127.0.0.1/a', 'https://img.culy.nl.evil.test/a', 'data:image/png;base64,a']) {
      expect(recipeImageUrl(image, source)).toBeNull();
    }
    expect(recipeImageUrl('https://img.culy.nl/a', 'https://other.test/')).toBeNull();
  });
});

it('formats shopping fractions without changing exact purchasing quantities', () => {
  const quantity = { kind: 'exact' as const, amount: '800/3', unit: 'g' as const };
  expect(shoppingQuantityLabel(quantity)).toBe('≈ 267 g');
  expect(quantity.amount).toBe('800/3');
  expect(shoppingQuantityLabel({kind:'exact',amount:'1/2',unit:'piece'})).toBe('0,5 stuks');
  expect(shoppingQuantityLabel({kind:'exact',amount:'1/1000',unit:'g'})).toBe('< 0,01 g');
});
