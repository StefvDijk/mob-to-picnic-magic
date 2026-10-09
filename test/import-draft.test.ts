import { describe, expect, it } from 'vitest';
import { recipeInputFromImport } from '../src/lib/import-draft';
import type { ImportCandidate, ImportDto } from '../shared/imports';

const source: ImportDto = { id: 'test-import', sourceKind: 'url', sourceText: '1/3 kg tomaten',
  sourceUrl: null, sourceLabel: null, status: 'needs_review', candidates: [], uncertainties: [],
  errorCode: null, expiresAt: 10_000, createdAt: 0, updatedAt: 0 };
const candidate: ImportCandidate = { title: 'Soep', sourceTitle: null, sourceUrl: null,
  baseServings: null, sections: [], steps: [], uncertainty: [], ingredients: [] };

describe('editable import recognition', () => {
  it('gives a titleless recognized photo a clearly generic save title without changing its source', () => {
    const photo = { ...candidate, title: null, baseServings: '4' };
    const input = recipeInputFromImport({ ...source, sourceKind: 'upload' }, photo);
    expect(input.title).toBe('Recept zonder titel');
    expect(input.baseServings).toBe('4');
    expect(photo.title).toBeNull();
    expect(recipeInputFromImport(source, null).title).toBe('');
  });
  it('preserves the original line and exact validated fraction', () => {
    const input = recipeInputFromImport(source, { ...candidate, ingredients: [{
      section: 'Soep', originalText: '1/3 kg tomaten', normalizedName: 'tomaat', sourceOrigin: 'ai',
      quantity: { kind: 'exact', amount: '1/3', unit: 'kg' }, attributes: { form: 'vers' },
      uncertainty: ['Controleer het gewicht.'],
    }] });
    expect(input.ingredients[0]).toMatchObject({ originalText: '1/3 kg tomaten', section: 'Soep',
      normalizedName: 'tomaat', quantity: { kind: 'exact', amount: '1/3', unit: 'kg' }, sourceOrigin: 'ai',
      uncertainty: ['Controleer het gewicht.'] });
    expect(input.baseServings).toBeNull();
    expect(input.steps).toEqual([]);
  });

  it('keeps raw extraction and missing or invalid AI measurements unknown', () => {
    const input = recipeInputFromImport(source, { ...candidate, ingredients: [
      { section: null, originalText: 'zout' },
      { section: null, originalText: 'peper', sourceOrigin: 'ai' },
      { section: null, originalText: 'wat tomaten', sourceOrigin: 'ai',
        quantity: { kind: 'exact', amount: 'niet leesbaar', unit: 'g' } },
    ] });
    expect(input.ingredients.map(item => item.quantity.kind)).toEqual(['unknown', 'unknown', 'unknown']);
    expect(input.ingredients.map(item => item.originalText)).toEqual(['zout', 'peper', 'wat tomaten']);
    expect(input.ingredients.every(item => item.uncertainty.includes('Hoeveelheid controleren'))).toBe(true);
  });
  it('keeps photo ownership references when turning recognition into a review draft', () => {
    const input = recipeInputFromImport({ ...source, sourceKind: 'upload', sourceText: null, uploadIds: ['photo-1', 'photo-2'] }, candidate);
    expect(input.uploads).toEqual(['photo-1', 'photo-2']);
  });

});

it('shows a spoon estimate warning without claiming the source number is missing', () => {
  const input = recipeInputFromImport(source, { ...candidate, ingredients: [{ section: null, originalText: '4 eetlepels olijfolie', sourceOrigin: 'ai', quantity: { kind: 'unknown' }, uncertainty: ['quantity_unit_unsupported'] }] });
  expect(input.ingredients[0].quantity).toEqual({ kind: 'unknown', basis: null });
  expect(input.ingredients[0].uncertainty).toEqual(['Hoeveelheid controleren', 'Deze maat wordt apart geschat bij de boodschappenberekening.']);
});
it('does not add review warnings to a validated exact quantity with no issues', () => {
  const input = recipeInputFromImport(source, { ...candidate, ingredients: [{ section: null, originalText: '250 ml wijn', sourceOrigin: 'ai', quantity: { kind: 'exact', amount: '250', unit: 'ml' }, uncertainty: [] }] });
  expect(input.ingredients[0].uncertainty).toEqual([]);
});

it('uses deterministic parser quantities while preserving source origin', () => {
  const input=recipeInputFromImport(source,{...candidate,ingredients:[{section:null,originalText:'½ kg rijst',normalizedName:'rijst',sourceOrigin:'parser',quantity:{kind:'exact',amount:'1/2',unit:'kg'},uncertainty:[]}]});
  expect(input.ingredients[0]).toMatchObject({sourceOrigin:'parser',normalizedName:'rijst',quantity:{kind:'exact',amount:'1/2',unit:'kg'},uncertainty:[]});
});
