import type { PicnicProduct, PicnicProductDetails } from '../../shared/picnic';
import { INGREDIENTS, KNOWLEDGE_VERSION, normalizeIngredient } from '../../shared/ingredient-knowledge';

export const PRODUCT_KNOWLEDGE_VERSION = `product-knowledge-v1:${KNOWLEDGE_VERSION}`;
export interface FieldEvidence {
  value: string; method: 'source_field' | 'rule'; path: string; text: string;
}
export interface KnowledgeField { status: 'known' | 'unknown' | 'conflict'; value: string | null; evidence: FieldEvidence[] }
export interface ProductKnowledge {
  version: string; analyzedAt: number; kind: KnowledgeField; form: KnowledgeField; flavour: KnowledgeField;
  packaging: { original: string; quantity: PicnicProduct['quantity'] };
  searchText: string;
}
function field(evidence: FieldEvidence[]): KnowledgeField {
  const values = [...new Set(evidence.map(item => item.value))];
  return { status: values.length > 1 ? 'conflict' : values.length ? 'known' : 'unknown', value: values.length === 1 ? values[0] : null, evidence };
}
/** Identity fields only. Composition/allergens must never establish product identity. */
export function interpretProduct(product: PicnicProduct, details?: PicnicProductDetails): ProductKnowledge {
  const sources = [{ path: 'product.name', text: product.name }];
  if (details?.product.id === product.id) {
    if (details.description) sources.push({ path: 'details.description', text: details.description.split(/(?<=[.!?])\s|\n/)[0] });
    details.infoSections.forEach((section, i) => {
      if (/omschrijving|beschrijving|extra informatie/i.test(section.title)) {
        // Extra information may also include composition: use only an explicit product description.
        const description = /(?:\*\*)?productomschrijving(?:\*\*)?[:\s]+([^\n]+)/i.exec(section.content)?.[1];
        if (description) sources.push({ path: `details.infoSections[${i}].content`, text: description });
        else if (/omschrijving|beschrijving/i.test(section.title)) sources.push({path:`details.infoSections[${i}].content`,text:section.content});
      }
    });
  }
  const kinds: FieldEvidence[] = [], forms: FieldEvidence[] = [], flavours: FieldEvidence[] = [];
  for (const source of sources) {
    const text = normalizeIngredient(source.text);
    const add = (target: FieldEvidence[], value: string) => target.push({ value, method: 'rule', ...source });
    // Descriptions must assert what the product IS, not what it contains or serves with.
    const identity = !/\b(?:mix|dessert|saus|soep|koek|biscuit|cake|pudding|appelmoes|nectar|smoothie)\b/.test(text) && (source.path === 'product.name' || !/\b(?:met|bevat|ingredienten|samenstelling|serveer|lekker|gebruik|geschikt)\b/.test(text));
    if (source.path === 'product.name' && /sap|nectar|juice/.test(text)) add(forms,'juice');
    if (!identity) continue;
    for (const profile of INGREDIENTS) {
      if (profile.product.test(text) && !profile.exclude?.test(text)) add(kinds, profile.key);
    }
    if (/\bgefermenteerd kokosmelkproduct\b/.test(text)) { add(kinds, 'coconut-yoghurt'); add(forms, 'fermented'); }
    if (/\b(?:gemalen kaneel|kaneelpoeder|kaneel gemalen)\b/.test(text)) { add(kinds, 'cinnamon'); add(forms, 'powder'); }
    if (/\b(?:verse oregano|oregano vers)\b/.test(text)) { add(kinds, 'oregano-fresh'); add(forms, 'fresh'); }
    if (/\bgedroogd(?:e)?\b/.test(text)) add(forms, 'dried');
    if (/\b(?:nectar|sap|juice)\b/.test(text)) add(forms, 'juice');
    if (/\b(?:vanille.?extract|vanilla extract)\b/.test(text)) { add(kinds, 'vanilla-extract'); add(forms, 'extract'); }
    if (/vanille.*pasta|vanilla.*paste/.test(text)) add(forms, 'paste');
    if (/\bnaturel\b|\bplain\b/.test(text)) add(flavours, 'plain');
    for (const flavour of ['vanille', 'vanilla', 'mango', 'aardbei', 'ananas', 'karamel']) {
      if (new RegExp(`\\b${flavour}\\b`).test(text) && /yogh?urt|kefir|coco/.test(text)) add(flavours, flavour === 'vanilla' ? 'vanille' : flavour);
    }
  }
  const kind = field(kinds), form = field(forms), flavour = field(flavours);
  const profile = INGREDIENTS.find(item => item.key === kind.value);
  const searchText = normalizeIngredient([product.name, ...(profile ? [profile.name, ...profile.aliases] : []), form.value ?? ''].join(' '));
  return { version: PRODUCT_KNOWLEDGE_VERSION, analyzedAt: Date.now(), kind, form, flavour, packaging: { original: product.unitQuantity, quantity: product.quantity }, searchText };
}
