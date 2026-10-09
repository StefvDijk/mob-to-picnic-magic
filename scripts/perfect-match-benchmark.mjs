/** Offline synthetic diagnostic only. No requests, database, secrets or production mutations. */
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length) {
  try {
    if (args.length !== 4 || args[0] !== '--reference' || args[2] !== '--predictions') throw new Error('Usage: node scripts/perfect-match-benchmark.mjs --reference <json> --predictions <json>');
    const { evaluateReferences } = await import('./perfect-match-reference.mjs');
    const [reference, predictions] = await Promise.all(args.filter((_, i) => i % 2 === 1).map(async path => JSON.parse(await readFile(path, 'utf8'))));
    console.log(JSON.stringify(evaluateReferences(reference, predictions), null, 2));
  } catch (error) {
    console.error(error.message); process.exit(2);
  }
  process.exit(0);
}
const cache = new Map();
async function moduleUrl(path) {
  if (cache.has(path)) return cache.get(path);
  let js = ts.transpileModule(await readFile(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const imports = [...js.matchAll(/from\s+(['"])(\.[^'"]+)\1/g)];
  for (const match of imports) {
    const child = resolve(dirname(path), match[2] + (match[2].endsWith('.ts') ? '' : '.ts'));
    js = js.replace(match[0], `from '${await moduleUrl(child)}'`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
  cache.set(path, url); return url;
}
const { shoppingGroups, assessProduct, MATCH_RULES_VERSION } = await import(await moduleUrl(resolve(root, 'worker/domain/shopping.ts')));
const { MATCH_DEVELOPMENT_CASES, MATCH_TEST_CASES } = await import(await moduleUrl(resolve(root, 'worker/domain/shopping-cases.ts')));
const { KNOWLEDGE_VERSION } = await import(await moduleUrl(resolve(root, 'shared/ingredient-knowledge.ts')));
let ordinal = 0;
const ingredient = (name, quantity = { kind: 'exact', amount: '300', unit: 'g', basis: null }, text = name, attributes = {}) => ({ id: `i${ordinal++}`, ordinal, normalizedName: name, originalText: text, quantity, attributes, section: null, sourceOrigin: 'ai', uncertainty: [] });
const recipe = (ingredients, baseServings = '4') => ({ id: 'synthetic', title: 'Synthetic', ingredients, baseServings, version: 1, steps: [], uploads: [], sourceLabel: null, sourceUrl: null, createdAt: 0, updatedAt: 0 });
const product = name => ({ id: 'synthetic', name, quantity: { kind: 'exact', amount: '500', unit: 'g', basis: null }, unitQuantity: '500 g', displayPriceCents: 100, priceCertainty: 'known', priceRanges: [], identity: { groupId: 'synthetic', variantId: 'synthetic' } });
const summary = results => ({ count: results.length, passed: results.filter(x => x.pass).length, failures: results.filter(x => !x.pass) });
const matching = cases => summary(cases.map(([name, candidate, expected]) => {
  const actual = assessProduct(shoppingGroups(recipe([ingredient(name)]), '4')[0], product(candidate)).status;
  return { name, candidate, expected, actual, pass: actual === expected };
}));
const quantityCases = [
  ['scale fraction', [ingredient('rijst', { kind: 'exact', amount: '1/3', unit: 'kg' })], '6', '500', 'g'],
  ['sum mass units', [ingredient('rijst', { kind: 'exact', amount: '200', unit: 'g' }), ingredient('rijst', { kind: 'exact', amount: '1', unit: 'kg' })], '2', '600', 'g'],
  ['range upper bound', [ingredient('rijst', { kind: 'range', amount: '200', maximum: '300', unit: 'g' })], '4', '300', 'g'],
  ['NL spoon estimate', [ingredient('olijfolie', { kind: 'unknown' }, '4 eetlepels olijfolie')], '8', '120', 'ml'],
  ['unknown stays unknown', [ingredient('mysterie', { kind: 'unknown' }, 'naar smaak')], '4', null, null],
];
const quantities = summary(quantityCases.map(([name, inputs, servings, amount, unit]) => {
  const demand = shoppingGroups(recipe(inputs), servings)[0].demand;
  const actual = demand ? { amount: demand.amount, unit: demand.unit } : null;
  const expected = amount === null ? null : { amount, unit };
  return { name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) };
}));
// Exploratory gaps are recorded, never included in the regression pass percentage.
const probes = [
  ['Unicode spoon fraction', 'olijfolie', '½ eetlepel olijfolie'],
  ['English spoon', 'olijfolie', '2 tablespoons olive oil'],
  ['English ingredient vocabulary', 'olive oil', '2 tablespoons olive oil'],
  ['Cup quantity', 'bloem', '1 cup bloem'],
  ['Fractional handful', 'pistachenoten', '1/2 handje pistachenoten'],
  ['Unspecified dried/fresh fruit', 'abrikozen', '200 g abrikozen'],
].map(([name, normalized, text]) => {
  const [group] = shoppingGroups(recipe([ingredient(normalized, { kind: 'unknown' }, text)]), '4');
  return { name, knowledgeKey: group.knowledgeKey, demand: group.demand, estimates: group.estimates };
});
const start = performance.now();
for (let n = 0; n < 100; n++) matching(MATCH_TEST_CASES);
const output = { datasetVersion: 'synthetic-offline-v1', evidence: 'Synthetic contract/rule evaluation only; not recipe accuracy, retrieval recall, provider latency or 30-second proof.', versions: { knowledge: KNOWLEDGE_VERSION, matching: MATCH_RULES_VERSION }, development: matching(MATCH_DEVELOPMENT_CASES), existingSyntheticHeldOut: matching(MATCH_TEST_CASES), quantities, probes, localRuleEvaluation: { repetitions: 100, casesPerRepetition: 30, elapsedMs: Math.round((performance.now() - start) * 100) / 100 }, externalRequests: 0, costCents: 0 };
console.log(JSON.stringify(output, null, 2));
if (output.development.failures.length || output.existingSyntheticHeldOut.failures.length || quantities.failures.length) process.exitCode = 1;
