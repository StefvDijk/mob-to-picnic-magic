import type { ImportCandidate } from '../../shared/imports';
import { formatRational, parseRational } from '../../shared/quantities';

const MAX_CANDIDATES = 30;
const MAX_INGREDIENTS = 200;
const MAX_STEPS = 100;
const MAX_TEXT = 50_000;
const MAX_FIELD = 2_000;
const MAX_RESULT_CHARS = 250_000;

function clean(value: unknown, max = MAX_FIELD): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = entityDecode(String(value).replace(/<[^>]*>/g, ' ')).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function entityDecode(text: string): string {
  return text.replace(/&nbsp;/gi, ' ').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&amp;/gi, '&').replace(/&#(\d+);/g, (_m, n: string) => {
      const code = Number(n); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }).replace(/&#x([\da-f]+);/gi, (_m, n: string) => {
      const code = Number.parseInt(n, 16); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    });
}

function isRecipe(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  const raw = (node as Record<string, unknown>)['@type'];
  return (typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : []).some(type =>
    type === 'Recipe' || (typeof type === 'string' && /(?:^|[/#])Recipe$/i.test(type)));
}

function isPaywalled(node: Record<string, unknown>): boolean {
  const restricted = (value: unknown) => value === false || (typeof value === 'string' && value.toLowerCase() === 'false');
  if (restricted(node.isAccessibleForFree)) return true;
  const parts = Array.isArray(node.hasPart) ? node.hasPart : node.hasPart ? [node.hasPart] : [];
  return parts.some(part => {
    if (!part || typeof part !== 'object' || Array.isArray(part)) return false;
    const item = part as Record<string, unknown>;
    return restricted(item.isAccessibleForFree) ||
      (typeof item.cssSelector === 'string' && /paywall|subscriber|premium/i.test(item.cssSelector));
  });
}

function scanPaywall(value: unknown, depth = 0, budget = { nodes: 0 }): { found: boolean; exceeded: boolean } {
  if (depth > 32 || ++budget.nodes > 2000) return { found: false, exceeded: true };
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = scanPaywall(item, depth + 1, budget);
      if (result.found || result.exceeded) return result;
    }
    return { found: false, exceeded: false };
  }
  if (!value || typeof value !== 'object') return { found: false, exceeded: false };
  const node = value as Record<string, unknown>;
  if (isPaywalled(node)) return { found: true, exceeded: false };
  const graph = scanPaywall(node['@graph'], depth + 1, budget);
  if (graph.found || graph.exceeded) return graph;
  return scanPaywall(node.hasPart, depth + 1, budget);
}

function recipeNodes(value: unknown, out: Record<string, unknown>[], flags: { truncated: boolean }, depth = 0): void {
  if (depth > 32 || out.length >= 500) { flags.truncated = true; return; }
  if (Array.isArray(value)) { for (const item of value) recipeNodes(item, out, flags, depth + 1); return; }
  if (!value || typeof value !== 'object') return;
  if (isRecipe(value)) out.push(value);
  const object = value as Record<string, unknown>;
  if (Array.isArray(object['@graph'])) recipeNodes(object['@graph'], out, flags, depth + 1);
}

function instructions(value: unknown): { steps: string[]; truncated: boolean } {
  const result: string[] = [];
  let visited = 0;
  let truncated = false;
  const visit = (step: unknown, depth = 0) => {
    if (++visited > 500 || depth > 32 || result.length >= MAX_STEPS) { truncated = true; return; }
    if (typeof step === 'string') {
      const text = clean(step, 4000); if (text) result.push(text);
      if (step.length > 4000) truncated = true;
      return;
    }
    if (Array.isArray(step)) { for (const entry of step) visit(entry, depth + 1); return; }
    if (!step || typeof step !== 'object') return;
    const item = step as Record<string, unknown>;
    // HowToSection names are retained inline so component/section boundaries survive.
    const section = clean(item.name);
    if (typeof item.name === 'string' && item.name.length > MAX_FIELD) truncated = true;
    if (Array.isArray(item.itemListElement)) {
      if (section) result.push(`${section}:`);
      visit(item.itemListElement, depth + 1);
    } else {
      const text = clean(item.text ?? item.name, 4000);
      if (text) result.push(text);
      if (typeof (item.text ?? item.name) === 'string' && String(item.text ?? item.name).length > 4000) truncated = true;
    }
  };
  visit(value);
  return { steps: result.slice(0, MAX_STEPS), truncated };
}

function candidate(node: Record<string, unknown>, sourceUrl: string | null): ImportCandidate | null {
  const title = clean(node.name, 300);
  const ingredientValues = Array.isArray(node.recipeIngredient) ? node.recipeIngredient : [];
  const sectionValues = Array.isArray(node.recipeInstructions) ? node.recipeInstructions : [];
  const ingredients = ingredientValues.slice(0, MAX_INGREDIENTS).flatMap(raw => {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const value = raw as Record<string, unknown>;
      const section = clean(value.section ?? value.recipeSection, 200);
      const originalText = clean(value.text ?? value.name, 1000);
      return originalText ? [{ section, originalText }] : [];
    }
    const originalText = clean(raw, 1000);
    return originalText ? [{ section: null, originalText }] : [];
  });
  if (!title && ingredients.length === 0) return null;
  const sections = sectionValues.flatMap(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const item = raw as Record<string, unknown>;
    return item['@type'] === 'HowToSection' && clean(item.name) ? [clean(item.name)!] : [];
  }).slice(0, 50);
  const servingsRaw = node.recipeYield;
  const yieldText = typeof servingsRaw === 'string' || typeof servingsRaw === 'number'
    ? String(servingsRaw).trim() : Array.isArray(servingsRaw) ? String(servingsRaw[0] ?? '').trim() : '';
  const servingsMatch = yieldText.match(/^(?:(?:voor|serves)\s+)?((?:0|[1-9]\d*)(?:\.\d+)?|(?:0|[1-9]\d*)\/(?:[1-9]\d*))(?:\s*(?:servings?|serves|people|persons?|personen|porties?|portions?))?$/i);
  const servings = servingsMatch ? parseRational(servingsMatch[1]) : null;
  const baseServings = servings && servings.numerator > 0 ? formatRational(servings) : null;
  const stepResult = instructions(node.recipeInstructions);
  const truncated = ingredientValues.length > MAX_INGREDIENTS || sectionValues.length > 50 || stepResult.truncated ||
    sectionValues.some(raw => !!raw && typeof raw === 'object' && !Array.isArray(raw) &&
      typeof (raw as Record<string, unknown>).name === 'string' && String((raw as Record<string, unknown>).name).length > MAX_FIELD) ||
    ingredients.some(item => item.originalText.length >= 1000 || (item.section?.length ?? 0) >= 200) || (title?.length ?? 0) >= 300;
  return {
    title, sourceTitle: title, sourceUrl, baseServings,
    sections, ingredients, steps: stepResult.steps,
    uncertainty: [!title ? 'recipe_title_missing' : '', ingredients.length === 0 ? 'ingredients_missing' : '',
      ingredients.length ? 'ingredients_unparsed' : '', ingredients.length ? 'quantity_review_required' : '',
      !baseServings ? 'servings_missing' : '', stepResult.steps.length === 0 ? 'steps_missing' : '',
      truncated ? 'truncated_fields' : ''].filter(Boolean),
  };
}

/** Extracts only JSON-LD Recipe objects. Page markup remains inert data. */
export interface RecipeExtraction {
  candidates: ImportCandidate[];
  uncertainties: string[];
  paywalled: boolean;
  tooComplex: boolean;
}

export function extractRecipeCandidates(html: string, sourceUrl: string): RecipeExtraction {
  const candidates: ImportCandidate[] = [];
  const seen = new Set<string>();
  let resultChars = 0;
  let paywalled = false;
  let truncated = false;
  let tooComplex = false;
  let scriptCount = 0;
  const scripts = html.matchAll(/<script\b[^>]*type\s*=\s*(["'])application\/ld\+json\1[^>]*>([\s\S]*?)<\/script\s*>/gi);
  for (const match of scripts) {
    if (++scriptCount > 500) { tooComplex = true; break; }
    try {
      const parsed: unknown = JSON.parse((match[2] ?? '').trim());
      const markerScan = scanPaywall(parsed);
      if (markerScan.found) paywalled = true;
      if (markerScan.exceeded) tooComplex = true;
      if (truncated || tooComplex) continue;
      const nodes: Record<string, unknown>[] = [];
      const flags = { truncated: false };
      recipeNodes(parsed, nodes, flags);
      tooComplex ||= flags.truncated;
      for (const node of nodes) {
        if (isPaywalled(node)) { paywalled = true; continue; }
        const value = candidate(node, sourceUrl);
        if (!value) continue;
        const signature = JSON.stringify({ title: value.title, baseServings: value.baseServings,
          sections: value.sections, ingredients: value.ingredients, steps: value.steps });
        if (seen.has(signature)) continue;
        if (candidates.length >= MAX_CANDIDATES) { truncated = true; break; }
        const serializedLength = JSON.stringify(value).length;
        if (resultChars + serializedLength > MAX_RESULT_CHARS) { truncated = true; break; }
        seen.add(signature);
        candidates.push(value);
        resultChars += serializedLength;
      }
    } catch { /* malformed JSON-LD is skipped without exposing provider content */ }
  }
  if (paywalled || tooComplex) candidates.length = 0;
  if (truncated && candidates.length) candidates[candidates.length - 1].uncertainty.push('truncated_candidates');
  return { candidates, uncertainties: [tooComplex ? 'truncated_jsonld_complexity' : '', truncated ? 'truncated_candidates' : '', paywalled ? 'paywall_detected' : ''].filter(Boolean), paywalled, tooComplex };
}

export function textImportResult(_sourceText: string): { candidates: ImportCandidate[]; uncertainties: string[] } {
  return { candidates: [], uncertainties: ['recognition_pending', 'source_text_not_parsed'] };
}

export function safeSourceText(text: string): string {
  return text.slice(0, MAX_TEXT);
}
