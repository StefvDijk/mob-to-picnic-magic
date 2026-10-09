import { describe, expect, it } from 'vitest';
import type { ImportCandidate } from '../../shared/imports';
import { compactStructuredInput, mergeCompactResult } from './compact';

const recipe = (): ImportCandidate => ({ title: 'Soep', sourceTitle: 'Soep', sourceUrl: 'https://culy.nl/soep',
  baseServings: '4', sections: ['Soep'], ingredients: [{ section: 'Soep', originalText: '200 g tomaten' },
    { section: 'Soep', originalText: '1 ui' }], steps: ['Snijd de ui.', 'Kook de soep.'],
  uncertainty: ['ingredients_unparsed', 'quantity_review_required'] });
const ingredient = (index: number) => ({ index, normalizedName: index ? 'ui' : 'tomaat',
  quantity: { kind: 'exact', amount: index ? '1' : '200', maximum: null, unit: index ? 'piece' : 'g', basis: 'net' },
  attributes: { form: null, variant: null, brand: null }, uncertainty: [] });

describe('compact structured recipe interpretation', () => {
  it('keeps an immutable complete source snapshot while omitting steps from model input', () => {
    const source = recipe();
    const compact = compactStructuredInput([source])!;
    expect(compact.sourceText).toContain('200 g tomaten');
    expect(compact.sourceText).toContain('"baseServings":"4"');
    expect(compact.sourceText).not.toContain('Kook de soep.');
    source.steps[0] = 'changed';
    expect(compact.candidate.steps[0]).toBe('Snijd de ui.');
  });

  it('rejects multiple candidates and incomplete or truncated sources', () => {
    expect(compactStructuredInput([])).toBeNull();
    expect(compactStructuredInput([recipe(), recipe()])).toBeNull();
    for (const uncertainty of ['truncated_fields', 'paywall_detected', 'servings_missing', 'recipe_incomplete']) {
      expect(compactStructuredInput([{ ...recipe(), uncertainty: [uncertainty] }])).toBeNull();
    }
    expect(compactStructuredInput([{ ...recipe(), steps: [] }])).toBeNull();
    expect(compactStructuredInput([{ ...recipe(), ingredients: [] }])).toBeNull();
  });

  it('restores authoritative wording, sections, steps and portions despite model extra fields', () => {
    const merged = mergeCompactResult({ baseServings: '99', title: 'Wrong', steps: ['Wrong'],
      ingredients: [{ ...ingredient(0), originalText: 'fake', sourceQuote: 'fake', section: 'Wrong' }, ingredient(1)] }, recipe());
    expect(merged).toMatchObject({ title: 'Soep', baseServings: '4', steps: ['Snijd de ui.', 'Kook de soep.'],
      ingredients: [{ section: 'Soep', originalText: '200 g tomaten', sourceQuote: '200 g tomaten' },
        { originalText: '1 ui' }], uncertainty: [] });
  });

  it('rejects omitted, duplicated, inserted or reordered ingredient interpretations', () => {
    for (const ingredients of [[ingredient(0)], [ingredient(0), ingredient(0)],
      [ingredient(1), ingredient(0)], [ingredient(0), ingredient(1), ingredient(2)]]) {
      expect(mergeCompactResult({ baseServings: '4', ingredients }, recipe())).toBeNull();
    }
    expect(mergeCompactResult({ ingredients: [ingredient(0), ingredient(1)] }, recipe())).toBeNull();
  });
});
