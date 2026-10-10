import { describe, expect, it } from 'vitest';
import type { RecipeDto, RecipeIngredientDto } from '../../shared/recipes';
import type { PicnicProduct } from '../../shared/picnic';
import { candidateFor, classifyProduct, rankCandidates, shoppingGroups } from './shopping';

function ingredient(name: string, amount = '300', unit: 'g' | 'kg' | 'piece' = 'g', extra: Partial<RecipeIngredientDto> = {}): RecipeIngredientDto {
  return { id: crypto.randomUUID(), ordinal: 0, normalizedName: name, originalText: `${amount} ${unit} ${name}`, quantity: { kind: 'exact', amount, unit, basis: null }, section: null, attributes: {}, sourceOrigin: 'ai', uncertainty: [], ...extra };
}
function recipe(ingredients: RecipeIngredientDto[], baseServings: string | null = '4'): RecipeDto {
  return { id: 'recipe', version: 1, title: 'Test', baseServings, ingredients, sourceLabel: null, sourceUrl: null, steps: [], uploads: [], createdAt: 0, updatedAt: 0 };
}
function product(id: string, name: string, amount = '500', price = 100, unit: 'g' | 'piece' | 'ml' = 'g'): PicnicProduct {
  return { id, name, quantity: { kind: 'exact', amount, unit, basis: null }, unitQuantity: `${amount} ${unit}`, displayPriceCents: price, priceCertainty: 'known', priceRanges: [], identity: { groupId: id, variantId: id } };
}
describe('recipe shopping rules', () => {
  it('sums duplicate sources before rounding and chooses lowest total sufficient price', () => {
    const source = recipe([ingredient('rijst'), ingredient('rijst')]);
    const [group] = shoppingGroups(source, '4');
    expect(group.sources).toHaveLength(2); expect(group.demand?.amount).toBe('600');
    const candidates = rankCandidates(group, [product('small', 'Rijst', '300', 250), product('large', 'Rijst', '1000', 400)]);
    expect(candidates[0]).toMatchObject({ product: { id: 'large' }, packCount: 1, totalPriceCents: 400 });
    const [fraction] = shoppingGroups(recipe([ingredient('rijst', '1/3'), ingredient('rijst', '1/3'), ingredient('rijst', '1/3')]), '4');
    expect(fraction.demand?.amount).toBe('1');
  });
  it('covers two onions with a bag and scales large requirements', () => {
    const source = recipe([ingredient('uien', '2', 'piece')]);
    expect(candidateFor(shoppingGroups(source, '4')[0], product('onion', 'Uien', '1000'))).toMatchObject({ match: 'suitable', packCount: 1 });
    expect(candidateFor(shoppingGroups(source, '40')[0], product('onion', 'Uien', '1000'))).toMatchObject({ packCount: 3 });
  });
  it('distinguishes cloves and bulbs and scales spoon estimates without changing source data', () => {
    const garlic = ingredient('knoflook', '25', 'piece', { originalText: '25 teentjes knoflook' });
    expect(candidateFor(shoppingGroups(recipe([garlic]), '4')[0], product('garlic', 'Knoflook', '2', 100, 'piece')).packCount).toBe(2);
    const oil = ingredient('olijfolie', '0', 'g', { originalText: '4 eetlepels olijfolie', quantity: { kind: 'unknown' } });
    const [group] = shoppingGroups(recipe([oil]), '8');
    expect(group.demand).toMatchObject({ amount: '120', unit: 'ml' });
    expect(group.sources[0].quantity).toEqual({ kind: 'unknown' });
  });
  it('keeps only the agreed pantry visible and splits combined salt/pepper source lines', () => {
    const groups = shoppingGroups(recipe([ingredient('zout', '1'), ingredient('rijst'), ingredient('bloem'), ingredient('suiker'), ingredient('olijfolie'), ingredient('olie'), ingredient('', '1', 'g', { originalText: 'Zout & peper', normalizedName: null, quantity: { kind: 'unknown' } })]), '4');
    expect(groups.filter(item => item.pantry).map(item => item.name).sort()).toEqual(['bakolie', 'keukenzout', 'zwarte peper']);
    expect(groups.find(item => item.name === 'keukenzout')?.sources).toHaveLength(2);
  });
  it.each([
    ['kookroom', 'Slagroom', 'substitution'], ['slagroom', 'Kookroom', 'substitution'], ['tomatenpuree', 'Passata gezeefde tomaten', 'substitution'],
    ['passata', 'Tomatenblokjes', 'substitution'], ['tomatenblokjes', 'Tomatenblokjes', 'suitable'], ['kippendijen', 'Vegetarische kippendijen', 'substitution'],
  ] as const)('classifies %s against %s as %s', (name, candidate, match) => {
    const group = shoppingGroups(recipe([ingredient(name)]), '4')[0];
    expect(classifyProduct(group, product('test', candidate))).toBe(match);
  });
  it('keeps fresh/dried herbs separate and never invents an unknown pack count', () => {
    const groups = shoppingGroups(recipe([ingredient('oregano', '1', 'g', { originalText: 'Verse oregano', quantity: { kind: 'unknown' } }), ingredient('oregano', '5', 'g', { originalText: 'Gedroogde oregano' })]), '4');
    expect(groups).toHaveLength(2);
    expect(classifyProduct(groups[0], product('dry', 'Gedroogde oregano'))).toBe('unsuitable');
    const unknown = shoppingGroups(recipe([ingredient('mysterie', '1', 'g', { quantity: { kind: 'unknown' } })]), '4')[0];
    expect(candidateFor(unknown, product('x', 'mysterie')).packCount).toBeNull();
  });
  it('requires actual source servings and sums compatible mass units', () => {
    expect(() => shoppingGroups(recipe([ingredient('rijst')], null), '2')).toThrow('BASE_SERVINGS_REQUIRED');
    expect(shoppingGroups(recipe([ingredient('rijst', '200'), ingredient('rijst', '1', 'kg')]), '2')[0].demand?.amount).toBe('600');
  });
});

it('uses complete quantity tiers to minimize the total price without deducting the existing basket', () => {
  const item = product('bulk', 'Rijst', '500', 200);
  item.priceRanges = [{ fromQuantity: 1, priceCents: 200 }, { fromQuantity: 2, priceCents: 90 }];
  const group = shoppingGroups(recipe([ingredient('rijst')]), '4')[0];
  expect(candidateFor(group, item)).toMatchObject({ packCount: 2, totalPriceCents: 180 });
});

 it.each([
  ['uien', 'Picnic opbakaardappeltjes met spek en ui'], ['uien', 'Gebraden gehakt ui'], ['tomaten', 'Heinz gepelde tomaten'], ['knoflook', 'Conimex crispy paneermix knoflook & gember'], ['knoflook', 'Drogheria knoflook'],
  ['pistachenoten', 'Almhof hoekje Venetië pistache yoghurt'], ['zwarte peper', 'Picnic Ribbelchips zwarte peper & zout'],
  ['oregano', 'Verstegen oregano'], ['kippendijen', "'t Slagershuys kipdijfilets knoflook en paprika"],
 ])('never auto-selects a flavoured or unproven product for %s', (name, productName) => {
  const group = shoppingGroups(recipe([ingredient(name)]), '4')[0];
  expect(classifyProduct(group, product('wrong', productName))).not.toBe('suitable');
 });

import { MATCH_DEVELOPMENT_CASES, MATCH_TEST_CASES } from './shopping-cases';
import { assessProduct } from './shopping';
for (const [split, cases] of [['development', MATCH_DEVELOPMENT_CASES], ['held-out', MATCH_TEST_CASES]] as const) {
  describe(`manually labelled synthetic NL ${split} rule evaluation`, () => {
    it.each(cases)('%s / %s is %s', (name, candidate, expected) => {
      const group = shoppingGroups(recipe([ingredient(name)]), '4')[0];
      expect(assessProduct(group, product('case', candidate)).status).toBe(expected);
    });
  });
}
it('calculation accepts an assessed result and does not upgrade uncertainty', () => {
  const group = shoppingGroups(recipe([ingredient('rijst')]), '4')[0];
  const assessment = { status: 'unresolved', reason: 'Missing composition', hardExclusion: false, version: 'test' } as const;
  expect(candidateFor(group, product('case', 'Rijst'), assessment)).toMatchObject({ match: 'unresolved', packCount: null, totalPriceCents: null });
});
it('keeps explicit brands and forms apart before rounding', () => {
  const groups = shoppingGroups(recipe([
    ingredient('kookroom', '100', 'g', { attributes: { brand: 'Merk A' } }),
    ingredient('kookroom', '100', 'g', { attributes: { brand: 'Merk B' } }),
    ingredient('kookroom', '100', 'g', { attributes: { form: 'poeder' } }),
  ]), '4');
  expect(groups).toHaveLength(3);
  expect(assessProduct(groups[0], { ...product('wrong', 'Merk B kookroom'), brand: 'Merk B' })).toMatchObject({ status: 'unsuitable', hardExclusion: true });
  expect(assessProduct(groups[2], product('wrong', 'Kookroom')).status).toBe('unresolved');
});
it('uses explicit product brand and applies requirements before substitution rules', () => {
  const group = shoppingGroups(recipe([ingredient('kookroom', '100', 'g', { attributes: { brand: 'Merk A' } })]), '4')[0];
  expect(assessProduct(group, { ...product('right', 'Kookroom'), brand: 'Merk A' }).status).toBe('suitable');
  expect(assessProduct(group, { ...product('wrong', 'Slagroom'), brand: 'Merk B' })).toMatchObject({ status: 'unsuitable', hardExclusion: true });
  expect(assessProduct(group, product('unknown', 'Slagroom')).status).toBe('unresolved');
});
it.each([['zout', 'Vaatwaszout'], ['gedroogde abrikozen', 'Abrikozenjam'], ['zwarte peper', 'Zwarte pepersaus']] as const)('hard excludes wrong product kinds for %s', (name, item) => {
  const group = shoppingGroups(recipe([ingredient(name)]), '4')[0];
  expect(assessProduct(group, product('wrong', item))).toMatchObject({ status: 'unsuitable', hardExclusion: true });
});

it.each([
  ['knoflook', 'in dunne plakjes', 'Knoflook'],
  ['kippendijen', 'in stukken', 'Kippendijen'],
  ['gedroogde abrikozen', 'gedroogd, gehalveerd', 'Gedroogde abrikozen'],
  ['korianderzaad', 'fijngemalen', 'Korianderzaad'],
  ['pistachenoten', 'geroosterd en fijn gehakt', 'Pistachenoten gepeld'],
] as const)('treats recipe preparation %s / %s as a cooking instruction', (name, form, item) => {
  const source = ingredient(name, '100', 'g', { attributes: { form } });
  const group = shoppingGroups(recipe([source]), '4')[0];
  expect(assessProduct(group, product('case', item)).status).toBe('suitable');
  expect(group.sources[0].attributes.form).toBe(form);
});
it('groups compatible ingredients despite cutting notes, keeping real purchase forms separate', () => {
  const groups = shoppingGroups(recipe([
    ingredient('knoflook', '10', 'g', { attributes: { form: 'in dunne plakjes' } }),
    ingredient('knoflook', '20', 'g', { attributes: { form: 'fijn gehakt' } }),
    ingredient('knoflook', '5', 'g', { attributes: { form: 'poeder' } }),
  ]), '4');
  expect(groups).toHaveLength(2);
  expect(groups[0].demand?.amount).toBe('30');
  expect(assessProduct(groups[1], product('fresh', 'Knoflook')).status).toBe('unresolved');
});
it('allows the optional red onion recipe note without making yellow onions wrong', () => {
  const group = shoppingGroups(recipe([ingredient('uien', '100', 'g', { originalText: '100 g (rode) uien', attributes: { variant: '(rode)', form: 'in stukken' } })]), '4')[0];
  expect(assessProduct(group, product('yellow', 'Gele uien')).status).toBe('suitable');
});
it('still enforces dried form extracted from compound preparation text', () => {
  const group = shoppingGroups(recipe([ingredient('oregano', '10', 'g', { attributes: { form: 'gedroogd, fijn gehakt' } })]), '4')[0];
  expect(group.knowledgeKey).toContain('|gedroogd');
  expect(assessProduct(group, product('fresh', 'Verse oregano'))).toMatchObject({ status: 'unsuitable', hardExclusion: true });
  expect(assessProduct(group, product('dry', 'Gedroogde oregano')).status).toBe('suitable');
});

it('keeps dried oregano as the requested product and does not replace an unconvertible teaspoon with a garnish estimate', () => {
  const source = ingredient('oregano', '1', 'g', { originalText: '1 tl gedroogde oregano', quantity: { kind: 'unknown' } });
  const [group] = shoppingGroups(recipe([source]), '4');
  expect(group.knowledgeKey).toBe('oregano-fresh|gedroogd');
  expect(group.id).toBe('oregano-fresh|gedroogd|net');
  expect(group.name).toBe('gedroogde oregano');
  expect(group.query).toBe('gedroogde oregano');
  expect(group.demand).toBeNull();
  expect(group.sources[0].originalText).toBe('1 tl gedroogde oregano');
  expect(group.estimates.join(' ')).toContain('Lepelmaat');
});

it('keeps hand estimates and true unknown garnish estimates when no source spoon conversion is needed', () => {
  const handful = shoppingGroups(recipe([ingredient('gedroogde abrikozen', '1', 'g', {
    originalText: '1 handje gedroogde abrikozen', quantity: { kind: 'unknown' },
  })]), '4')[0];
  expect(handful.demand).toMatchObject({ amount: '40', unit: 'g' });
  expect(handful.estimates.join(' ')).toContain('een handje');

  const garnish = shoppingGroups(recipe([ingredient('oregano', '1', 'g', {
    originalText: 'oregano', quantity: { kind: 'unknown' },
  })]), '4')[0];
  expect(garnish.demand).toMatchObject({ amount: '5', unit: 'g' });
  expect(garnish.estimates.join(' ')).toContain('startschatting');
});

it('does not transfer pepper variant attributes to salt when splitting the original source', () => {
  const source=ingredient('zout en peper','1','g',{originalText:'Zout en zwarte peper',attributes:{variant:'zwarte peper'}});
  const groups=shoppingGroups(recipe([source]),'4');
  const salt=groups.find(group=>group.knowledgeKey.startsWith('salt'))!;
  expect(classifyProduct(salt,product('salt','Jozo tafelzout','500',50))).toBe('suitable');
  expect(source.attributes.variant).toBe('zwarte peper');
  expect(salt.sources[0].originalText).toBe('Zout en zwarte peper');
});

it('translates the chia screenshot, sums fractional honey spoons and preserves the original evidence', () => {
  const raw = (name: string, line: string) => ingredient(name, '1', 'g', {originalText:line,quantity:{kind:'unknown'}});
  const honey = shoppingGroups(recipe([raw('honey','3 tbsp Honey'),raw('honey','½ tbsp Honey')]),'4')[0];
  expect(honey.query).toBe('honing');
  expect(honey.demand).toMatchObject({amount:'147/2',unit:'g'});
  expect(honey.sources.map(x=>x.originalText)).toEqual(['3 tbsp Honey','½ tbsp Honey']);
  expect(honey.estimates.join(' ')).toContain('Geschat');
  expect(shoppingGroups(recipe([raw('salt','¼ tsp Salt')]),'8')[0].demand).toMatchObject({amount:'3',unit:'g'});
  const mango = shoppingGroups(recipe([ingredient('mango','2','piece')]),'4')[0];
  expect(candidateFor(mango,product('fresh','Spaanse mango','1',160,'piece'))).toMatchObject({match:'suitable',packCount:2});
  for (const name of ['Picnic mango nectar','Picnic bio gedroogde mango','Picnic mangostukjes','Optimel drinkyoghurt mango']) expect(classifyProduct(mango,product(name,name))).not.toBe('suitable');
});
it.each([
 ['chia seeds','Picnic chiazaad','Picnic appel mango chia sap'],
 ['kefir','Arla kefir naturel','Activia kefir drinkyoghurt mango'],
 ['coconut yoghurt','Alpro kokosyoghurt','Alpro vanille yoghurt'],
 ['vanilla bean paste','Dr. Oetker vanillepasta','Dr. Oetker vanillesuiker'],
 ['passionfruit','Passievruchten','Picnic verse smoothie mango passievrucht'],
])('matches %s by product kind, never merely by flavour', (name,good,bad)=>{
 const group=shoppingGroups(recipe([ingredient(name)]),'4')[0];
 expect(classifyProduct(group,product('good',good))).toBe('suitable');
 expect(classifyProduct(group,product('bad',bad))).not.toBe('suitable');
});
it('does not downgrade exact sherry vinegar to a replacement or silently select vanilla extract',()=>{
 const sherry=shoppingGroups(recipe([ingredient('sherryazijn')]),'4')[0];
 expect(classifyProduct(sherry,product('sherry','Sherryazijn'))).toBe('suitable');
 expect(classifyProduct(sherry,product('wine','Witte wijnazijn'))).toBe('substitution');
 const vanilla=shoppingGroups(recipe([ingredient('vanilla bean paste')]),'4')[0];
 expect(candidateFor(vanilla,product('extract','Nielsen Massey puur vanille-extract')).packCount).toBeNull();
 expect(classifyProduct(vanilla,product('extract','Nielsen Massey puur vanille-extract'))).toBe('substitution');
});
it('recognizes explicitly dry white house wine, preserving the dry variant',()=>{
 const group=shoppingGroups(recipe([ingredient('droge witte wijn','250','g',{quantity:{kind:'exact',amount:'250',unit:'ml'},attributes:{variant:'droog'}})]),'4')[0];
 expect(candidateFor(group,product('wine','Picnic huiswijn wit fris & droog','750',499,'ml'))).toMatchObject({match:'suitable',packCount:1});
 expect(classifyProduct(group,product('sweet','Picnic huiswijn wit zoet'))).not.toBe('suitable');
});
it('handles Dutch variant inflections while rejecting white sugar',()=>{
 const brown=shoppingGroups(recipe([ingredient('bruine suiker','1','g',{attributes:{variant:'bruin'}})]),'4')[0];
 expect(classifyProduct(brown,product('dark','Van Gilse basterdsuiker donker'))).toBe('suitable');
 expect(classifyProduct(brown,product('white','Van Gilse basterdsuiker wit'))).not.toBe('suitable');
 const wine=shoppingGroups(recipe([ingredient('droge witte wijn','1','g',{attributes:{variant:'droge'}})]),'4')[0];
 expect(classifyProduct(wine,product('wine','Picnic huiswijn wit fris & droog'))).toBe('suitable');
});
