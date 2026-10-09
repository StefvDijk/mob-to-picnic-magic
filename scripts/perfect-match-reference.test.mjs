import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateReferences } from './perfect-match-reference.mjs';
const fixture = async name => JSON.parse(await readFile(new URL(`./fixtures/perfect-match/${name}`, import.meta.url), 'utf8'));
test('reports intentional missing/extra, amount, packs, abstention, correction and latency failure', async () => {
  const result = evaluateReferences(await fixture('reference.synthetic.json'), await fixture('predictions.synthetic-mismatch.json'));
  assert.equal(result.wholeRecipePass.numerator, 0);
  assert.equal(result.wholeRecipeWithin30Seconds.numerator, 0);
  assert.equal(result.counts.missingIngredients, 1);
  assert.equal(result.counts.extraIngredients, 1);
  assert.equal(result.candidateRecall.rate, 0.5);
  assert.equal(result.selectionCoverage.rate, 0.5);
  assert.equal(result.automaticPrecision.rate, 0);
  assert.equal(result.abstention.rate, 0.5);
  assert.equal(result.cost.totalCents, 2);
  assert.deepEqual(result.recipes[0].errors.map(x => x.category), ['extra_ingredient', 'ingredient_fields', 'product_or_pack', 'missing_ingredient', 'abstention', 'user_corrections']);
});
test('passes exact rational equivalent amounts and separates missing telemetry from zero', async () => {
  const reference = await fixture('reference.synthetic.json');
  const predictions = { schemaVersion: 1, datasetVersion: reference.datasetVersion, recipes: reference.recipes.map(recipe => ({ ...recipe, corrections: 0, ingredients: recipe.ingredients.map(ingredient => ({ ...ingredient, quantity: { ...ingredient.quantity, amount: ingredient.sourceId === 'rice' ? '400/2' : '1.0' }, candidateProductIds: ingredient.acceptableProducts.map(x => x.productId), selection: { productId: ingredient.acceptableProducts[0].productId, packCount: 1, automatic: true } })) })) };
  const result = evaluateReferences(reference, predictions);
  assert.equal(result.wholeRecipePass.rate, 1);
  assert.equal(result.automaticPrecision.rate, 1);
  assert.equal(result.wholeRecipeWithin30Seconds.rate, 0);
  assert.equal(result.latency.missing, 1);
  assert.equal(result.latency.p50Ms, null);
  assert.equal(result.cost.missing, 1);
});
test('rejects duplicate IDs, mismatched dataset version and malformed quantity', async () => {
  const reference = await fixture('reference.synthetic.json');
  const prediction = await fixture('predictions.synthetic-mismatch.json');
  assert.throws(() => evaluateReferences(reference, { ...prediction, datasetVersion: 'different' }), /versions differ/);
  const duplicate = structuredClone(reference); duplicate.recipes[0].ingredients.push(duplicate.recipes[0].ingredients[0]);
  assert.throws(() => evaluateReferences(duplicate, prediction), /Duplicate ingredient/);
  const bad = structuredClone(prediction); bad.recipes[0].ingredients[0].quantity.amount = '1/0';
  assert.throws(() => evaluateReferences(reference, bad), /Invalid labelled quantity/);
});
test('retains source spoon units and ranges rather than inventing exact grams',async()=>{
 const reference=await fixture('reference.synthetic.json');
 reference.recipes[0].ingredients[0].quantity={kind:'range',amount:'1/2',maximum:'3/2',unit:'tbsp',basis:null};
 const predictions={schemaVersion:1,datasetVersion:reference.datasetVersion,recipes:reference.recipes.map(r=>({...r,corrections:0,ingredients:r.ingredients.map(i=>({...i,candidateProductIds:i.acceptableProducts.map(p=>p.productId),selection:{productId:i.acceptableProducts[0].productId,packCount:1,automatic:true}}))}))};
 assert.equal(evaluateReferences(reference,predictions).wholeRecipePass.rate,1);
 predictions.recipes[0].ingredients[0].quantity={amount:'21',unit:'g',basis:null};
 assert.equal(evaluateReferences(reference,predictions).wholeRecipePass.rate,0);
});
test('required unavailable or unproven assortment never counts as a fast complete recipe',async()=>{
 for(const available of [false,null]){
 const reference=await fixture('reference.synthetic.json');
 reference.recipes[0].ingredients[0].available=available;
 const predictions={schemaVersion:1,datasetVersion:reference.datasetVersion,recipes:reference.recipes.map(r=>({...r,latencyMs:100,corrections:0,ingredients:r.ingredients.map(i=>({...i,candidateProductIds:i.acceptableProducts.map(p=>p.productId),selection:{productId:i.acceptableProducts[0].productId,packCount:1,automatic:true}}))}))};
 assert.equal(evaluateReferences(reference,predictions).wholeRecipeWithin30Seconds.rate,0);
 assert.equal(evaluateReferences(reference,predictions).counts[available===null?'unknownAvailability':'unavailableProducts'],1);
 }
});
