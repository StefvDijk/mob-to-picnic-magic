/** Evaluate saved predictions against independently labelled references. Never calls providers. */
import assert from 'node:assert/strict';
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const string = value => typeof value === 'string' && value.length > 0;
function rational(value) {
  if (typeof value !== 'string' || value.length > 32 || !/^(?:0|[1-9]\d*)(?:\.\d+|\/(?:[1-9]\d*))?$/.test(value)) return null;
  let n, d;
  if (value.includes('/')) [n, d] = value.split('/').map(BigInt);
  else { const [whole, decimals = ''] = value.split('.'); d = 10n ** BigInt(decimals.length); n = BigInt(whole) * d + BigInt(decimals || '0'); }
  return { n, d };
}
function equalAmount(a, b) { const x = rational(a), y = rational(b); return Boolean(x && y && x.n * y.d === y.n * x.d); }
function validate(document, reference) {
  assert(object(document) && document.schemaVersion === 1 && string(document.datasetVersion) && Array.isArray(document.recipes), 'Invalid document schema/version');
  assert(new Set(document.recipes.map(x => x.id)).size === document.recipes.length, 'Duplicate recipe IDs');
  for (const recipe of document.recipes) {
    assert(object(recipe) && string(recipe.id) && string(recipe.title) && rational(recipe.servings) && Array.isArray(recipe.ingredients), 'Invalid recipe');
    assert(new Set(recipe.ingredients.map(x => x.sourceId)).size === recipe.ingredients.length, 'Duplicate ingredient source IDs');
    if (reference) assert(['development', 'test', 'challenge'].includes(recipe.split) && string(recipe.sourceHash) && string(recipe.language) && string(recipe.sourceKind), 'Missing reference provenance/split');
    else {
      assert(recipe.latencyMs == null || Number.isFinite(recipe.latencyMs) && recipe.latencyMs >= 0, 'Invalid latency');
      assert(recipe.costCents == null || Number.isFinite(recipe.costCents) && recipe.costCents >= 0, 'Invalid cost');
      assert(Number.isInteger(recipe.corrections) && recipe.corrections >= 0, 'Missing correction count');
    }
    for (const ingredient of recipe.ingredients) {
      assert(object(ingredient) && string(ingredient.sourceId) && string(ingredient.canonicalName) && typeof ingredient.form === 'string' && object(ingredient.quantity), 'Invalid ingredient');
      assert(rational(ingredient.quantity.amount) && ['g', 'kg', 'ml', 'l', 'piece', 'tbsp', 'tsp'].includes(ingredient.quantity.unit) && [null, 'net', 'drained'].includes(ingredient.quantity.basis), 'Invalid labelled quantity');
      if (ingredient.quantity.kind === 'range') assert(rational(ingredient.quantity.maximum), 'Invalid range maximum');
      if (reference) {
        assert(typeof ingredient.required === 'boolean' && (typeof ingredient.available === 'boolean' || ingredient.available === null) && Array.isArray(ingredient.acceptableProducts), 'Invalid product reference');
        assert(!ingredient.required || !ingredient.available || ingredient.acceptableProducts.length > 0, 'Available required ingredient needs acceptable products');
        for (const product of ingredient.acceptableProducts) assert(string(product.productId) && Array.isArray(product.packCounts) && product.packCounts.length > 0 && product.packCounts.every(n => Number.isInteger(n) && n > 0), 'Invalid acceptable product/pack labels');
      } else {
        assert(Array.isArray(ingredient.candidateProductIds) && ingredient.candidateProductIds.every(string), 'Missing candidate IDs');
        assert(ingredient.selection === null || object(ingredient.selection) && string(ingredient.selection.productId) && Number.isInteger(ingredient.selection.packCount) && ingredient.selection.packCount > 0 && typeof ingredient.selection.automatic === 'boolean', 'Invalid selection');
      }
    }
  }
}
const fraction = (numerator, denominator) => ({ numerator, denominator, rate: denominator ? numerator / denominator : null });
const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(p * values.length) - 1] : null;
export function evaluateReferences(reference, predictions) {
  validate(reference, true); validate(predictions, false);
  assert(reference.datasetVersion === predictions.datasetVersion, 'Dataset versions differ');
  const predictionsById = new Map(predictions.recipes.map(x => [x.id, x]));
  const counters = { expectedIngredients: 0, observedIngredients: 0, missingIngredients: 0, extraIngredients: 0, ingredientFieldsCorrect: 0, eligibleProducts: 0, candidatesRecalled: 0, selected: 0, automaticSelected: 0, automaticCorrect: 0, abstentions: 0, unavailableProducts: 0, unknownAvailability: 0, recalledAt5: 0, recalledAt10: 0, packagingCorrect: 0 };
  const results = reference.recipes.map(label => {
    const prediction = predictionsById.get(label.id);
    const errors = [];
    if (!prediction) errors.push({ category: 'missing_recipe' });
    else { if (prediction.title !== label.title) errors.push({ category: 'recipe_selection' }); if (!equalAmount(prediction.servings, label.servings)) errors.push({ category: 'servings' }); }
    const byId = new Map((prediction?.ingredients ?? []).map(x => [x.sourceId, x]));
    const labelled = new Set(label.ingredients.map(x => x.sourceId));
    counters.expectedIngredients += label.ingredients.length;
    counters.observedIngredients += byId.size;
    for (const extra of byId.keys()) if (!labelled.has(extra)) { counters.extraIngredients++; errors.push({ sourceId: extra, category: 'extra_ingredient' }); }
    for (const ingredient of label.ingredients) {
      const actual = byId.get(ingredient.sourceId);
      if (!actual) { counters.missingIngredients++; errors.push({ sourceId: ingredient.sourceId, category: 'missing_ingredient' }); }
      else {
        const incorrect = [];
        if (actual.canonicalName !== ingredient.canonicalName) incorrect.push('meaning');
        if (actual.form !== ingredient.form) incorrect.push('form');
        if (!equalAmount(actual.quantity.amount, ingredient.quantity.amount)) incorrect.push('amount');
        if ((actual.quantity.kind ?? 'exact') !== (ingredient.quantity.kind ?? 'exact')) incorrect.push('quantity_kind');
        if (ingredient.quantity.kind === 'range' && !equalAmount(actual.quantity.maximum, ingredient.quantity.maximum)) incorrect.push('maximum');
        if (actual.quantity.unit !== ingredient.quantity.unit) incorrect.push('unit');
        if (actual.quantity.basis !== ingredient.quantity.basis) incorrect.push('basis');
        if (incorrect.length) errors.push({ sourceId: ingredient.sourceId, category: 'ingredient_fields', fields: incorrect }); else counters.ingredientFieldsCorrect++;
      }
      if (!ingredient.required) continue;
      if (ingredient.available === null) { counters.unknownAvailability++; errors.push({sourceId:ingredient.sourceId,category:'unknown_availability'}); continue; }
      if (!ingredient.available) { counters.unavailableProducts++; errors.push({sourceId:ingredient.sourceId,category:'required_unavailable'}); continue; }
      counters.eligibleProducts++;
      const options = ingredient.acceptableProducts;
      if (actual?.candidateProductIds.some(id => options.some(x => x.productId === id))) counters.candidatesRecalled++;
      for (const k of [5,10]) if (actual?.candidateProductIds.slice(0,k).some(id => options.some(x => x.productId === id))) counters[`recalledAt${k}`]++;
      const selection = actual?.selection;
      if (!selection) { counters.abstentions++; errors.push({ sourceId: ingredient.sourceId, category: 'abstention' }); continue; }
      counters.selected++;
      const correct = options.some(x => x.productId === selection.productId && x.packCounts.includes(selection.packCount));
      if (options.some(x => x.productId === selection.productId && x.packCounts.includes(selection.packCount))) counters.packagingCorrect++;
      if (selection.automatic) { counters.automaticSelected++; if (correct) counters.automaticCorrect++; }
      if (!correct) errors.push({ sourceId: ingredient.sourceId, category: 'product_or_pack' });
    }
    const qualityErrors = errors.length;
    const corrections = prediction?.corrections ?? null;
    if (corrections > 0) errors.push({ category: 'user_corrections', count: corrections });
    const latencyMs = prediction?.latencyMs ?? null;
    const within30Seconds = latencyMs === null ? null : latencyMs <= 30_000;
    return { id: label.id, split: label.split, sourceKind: label.sourceKind, language: label.language, qualityPass: qualityErrors === 0, wholeRecipePass: qualityErrors === 0 && corrections === 0, within30Seconds, wholeRecipeWithin30Seconds: qualityErrors === 0 && corrections === 0 && within30Seconds === true, latencyMs, costCents: prediction?.costCents ?? null, errors };
  });
  const knownLatencies = results.filter(x => x.latencyMs !== null).map(x => x.latencyMs);
  const knownCosts = results.filter(x => x.costCents !== null).map(x => x.costCents);
  const splitScores = Object.fromEntries(['development', 'test', 'challenge'].map(split => { const cases = results.filter(x => x.split === split); return [split, { wholeRecipePass: fraction(cases.filter(x => x.wholeRecipePass).length, cases.length), wholeRecipeWithin30Seconds: fraction(cases.filter(x => x.wholeRecipeWithin30Seconds).length, cases.length) }]; }));
  return { schemaVersion: 1, datasetVersion: reference.datasetVersion, evidence: reference.evidence ?? 'Label provenance must be independently verified; supplied labels are not ground truth established by this harness.', counts: counters, wholeRecipePass: fraction(results.filter(x => x.wholeRecipePass).length, results.length), wholeRecipeWithin30Seconds: fraction(results.filter(x => x.wholeRecipeWithin30Seconds).length, results.length), ingredientFieldAccuracy: fraction(counters.ingredientFieldsCorrect, counters.expectedIngredients), recallAt5: fraction(counters.recalledAt5, counters.eligibleProducts), recallAt10: fraction(counters.recalledAt10, counters.eligibleProducts), packagingAccuracy: fraction(counters.packagingCorrect, counters.selected), candidateRecall: fraction(counters.candidatesRecalled, counters.eligibleProducts), selectionCoverage: fraction(counters.selected, counters.eligibleProducts), automaticPrecision: fraction(counters.automaticCorrect, counters.automaticSelected), abstention: fraction(counters.abstentions, counters.eligibleProducts), latency: { measured: knownLatencies.length, missing: results.length - knownLatencies.length, p50Ms: percentile(knownLatencies, 0.5), p95Ms: percentile(knownLatencies, 0.95), within30Seconds: fraction(knownLatencies.filter(x => x <= 30_000).length, knownLatencies.length) }, cost: { measured: knownCosts.length, missing: results.length - knownCosts.length, totalCents: knownCosts.reduce((sum, x) => sum + x, 0) }, splitScores, unexpectedRecipeIds: predictions.recipes.filter(x => !reference.recipes.some(y => y.id === x.id)).map(x => x.id), recipes: results };
}
