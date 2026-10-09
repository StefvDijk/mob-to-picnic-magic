import { describe, expect, it } from 'vitest';
import type { ImportCandidate } from '../../shared/imports';
import { normalizeStructuredCandidates, parseStructuredIngredient } from './structured';
const candidate = (lines: string[] = ['200 g rijst']): ImportCandidate => ({ title: 'Rice', sourceTitle: 'Rice', sourceUrl: 'https://www.culy.nl/example', baseServings: '4', sections: [], ingredients: lines.map(originalText => ({ originalText, section: null })), steps: ['Cook.'], uncertainty: ['ingredients_unparsed', 'quantity_review_required'] });
describe('structured exact source parsing', () => {
  it.each([
    ['200 g rijst', '200', 'g', 'rijst'], ['1,5 kg uien', '3/2', 'kg', 'uien'],
    ['½ l olijfolie', '1/2', 'l', 'olijfolie'], ['1½ kg rijst', '3/2', 'kg', 'rijst'],
    ['1 1/2 kg rijst', '3/2', 'kg', 'rijst'], ['3/4 l olive oil', '3/4', 'l', 'olijfolie'],
    ['200 grams white rice', '200', 'g', 'witte rijst'], ['2 cloves garlic', '2', 'piece', 'knoflook'],
    ['2 uien', '2', 'piece', 'uien'], ['400 g boneless skinless chicken thighs, diced', '400', 'g', 'kippendijen'],
    ['200 g ui, gesnipperd', '200', 'g', 'ui'],
  ])('reads %s exactly without changing its source text', (line, amount, unit, normalizedName) => {
    expect(parseStructuredIngredient(line)).toMatchObject({ originalText: line, sourceQuote: line, normalizedName, sourceOrigin: 'parser', quantity: { kind: 'exact', amount, unit, basis: null } });
  });
  it.each(['1 cup bloem', '2 tablespoons olive oil', '1 × 350 g pot tomatenblokjes', '½ blik tomatenblokjes', '200-300 g rijst', '200 g abrikozen', '2 knoflook', '1 g onbekend', '200 g melk', '200 g oregano', '200 g uien naar smaak', '200 g uien of sjalotten', '200 g ui, optioneel', '1/0 g rijst', '0 g rijst', '200 g chicken thighs with bone', '400 g rijst (gekookt)', '3 ml bloem', '200 g tomatenblokjes, uitgelekt'])('falls back for ambiguous/unsupported %s', line => expect(parseStructuredIngredient(line)).toBeNull());
  it('preserves sections and explicit fresh/red forms', () => {
    expect(parseStructuredIngredient('20 g verse oregano', 'Dressing')).toMatchObject({ section: 'Dressing', attributes: { form: 'vers' } });
    expect(parseStructuredIngredient('100 g red onions')).toMatchObject({ attributes: { variant: 'rood' } });
  });
  it('rejects overly long lines rather than truncating the evidence', () => expect(parseStructuredIngredient('200 g ' + 'ui '.repeat(200))).toBeNull());
  it.each(['1,000 g rijst', '1.000 g rijst', '2 pieces rice', '200 g kippendijen'])('does not guess locale or purchase form for %s', line => expect(parseStructuredIngredient(line)).toBeNull());
});
describe('all-or-nothing structured normalization', () => {
  it('returns separate complete recipes without merging ingredients', () => {
    const result = normalizeStructuredCandidates([candidate(), { ...candidate(['1 kg uien']), title: 'Onion', baseServings: 'voor 4 personen' }]);
    expect(result).toHaveLength(2);
    expect(result?.map(x => x.ingredients[0].normalizedName)).toEqual(['rijst', 'uien']);
    expect(result?.[1].baseServings).toBe('4');
  });
  it('does not mutate the original structured candidate', () => {
    const source = candidate(); const original = JSON.stringify(source);
    expect(normalizeStructuredCandidates([source])?.[0].uncertainty).toEqual([]);
    expect(JSON.stringify(source)).toBe(original);
  });
  it('rejects a whole collection if any candidate is incomplete or uncertain', () => {
    for (const bad of [{ ...candidate(), baseServings: null }, { ...candidate(), steps: [] }, { ...candidate(), uncertainty: ['truncated_fields'] }, candidate(['200 g rijst', '1 cup bloem']), candidate(['200 g rijst', '200 g rijst'])]) {
      expect(normalizeStructuredCandidates([candidate(), bad])).toBeNull();
    }
  });
  it('does not confuse yield alternatives with source servings', () => expect(normalizeStructuredCandidates([{ ...candidate(), baseServings: '4-6 people' }])).toBeNull());
});
