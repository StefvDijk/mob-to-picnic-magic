import { config } from './config.js';

let openaiClient = null;
let openaiInitAttempted = false;

async function getOpenAIClient() {
  if (openaiClient || openaiInitAttempted) {
    return openaiClient;
  }

  openaiInitAttempted = true;
  if (!config.openaiApiKey) {
    return null;
  }

  try {
    const module = await import('openai');
    const OpenAI = module.default || module.OpenAI;
    if (!OpenAI) {
      console.warn('OpenAI module gevonden maar bevat geen standaard export');
      return null;
    }
    openaiClient = new OpenAI({ apiKey: config.openaiApiKey });
  } catch (error) {
    console.warn('OpenAI client niet beschikbaar, heuristieken worden gebruikt:', error.message || error);
  }

  return openaiClient;
}

const NORMALIZATION_SCHEMA = {
  name: 'normalized_ingredient',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      normalizedQuery: { type: 'string' },
      attributes: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: { type: 'string' },
          variant: { type: ['string', 'null'] },
          brand: { type: ['string', 'null'] },
          organic: { type: 'boolean' },
          notes: { type: ['string', 'null'] },
        },
        required: ['category', 'organic'],
      },
      quantity: {
        type: 'object',
        additionalProperties: false,
        properties: {
          count: { type: 'number' },
          unit: { type: ['string', 'null'] },
          sizeHint: { type: ['string', 'null'] },
        },
        required: ['count'],
      },
    },
    required: ['normalizedQuery', 'attributes', 'quantity'],
  },
};

const CATEGORY_KEYWORDS = [
  { category: 'produce', keywords: ['tomato', 'onion', 'garlic', 'pepper', 'apple', 'banana', 'cucumber', 'spinach', 'lettuce', 'herb'] },
  { category: 'protein', keywords: ['chicken', 'beef', 'pork', 'tofu', 'tempeh', 'salmon', 'egg', 'tuna', 'lamb', 'turkey'] },
  { category: 'dairy', keywords: ['milk', 'cheese', 'butter', 'cream', 'yoghurt', 'yogurt', 'mozzarella', 'cheddar'] },
  { category: 'pantry', keywords: ['flour', 'sugar', 'salt', 'pepper', 'oil', 'vinegar', 'syrup', 'rice', 'pasta', 'beans', 'lentil'] },
  { category: 'bakery', keywords: ['bread', 'bun', 'roll', 'baguette', 'wrap', 'tortilla', 'pita'] },
  { category: 'frozen', keywords: ['frozen', 'ice', 'gelato'] },
  { category: 'drinks', keywords: ['juice', 'soda', 'cola', 'beer', 'wine', 'milkshake'] },
  { category: 'spices', keywords: ['cumin', 'paprika', 'oregano', 'thyme', 'rosemary', 'spice', 'seasoning'] },
];

const VARIANT_KEYWORDS = ['smoked', 'firm', 'fresh', 'ground', 'dried', 'chopped', 'sliced', 'grated', 'crushed', 'minced'];

const ORGANIC_KEYWORDS = ['organic', 'bio', 'biologisch'];

const UNIT_ALIASES = new Map([
  ['grams', 'g'],
  ['gram', 'g'],
  ['g', 'g'],
  ['kg', 'kg'],
  ['kilogram', 'kg'],
  ['milliliter', 'ml'],
  ['milliliters', 'ml'],
  ['ml', 'ml'],
  ['l', 'l'],
  ['liter', 'l'],
  ['litre', 'l'],
  ['tbsp', 'tbsp'],
  ['tablespoon', 'tbsp'],
  ['tablespoons', 'tbsp'],
  ['tbs', 'tbsp'],
  ['teaspoon', 'tsp'],
  ['teaspoons', 'tsp'],
  ['tsp', 'tsp'],
  ['cup', 'cup'],
  ['cups', 'cup'],
  ['pack', 'pack'],
  ['packs', 'pack'],
  ['bag', 'bag'],
  ['bags', 'bag'],
  ['piece', 'piece'],
  ['pieces', 'piece'],
  ['clove', 'clove'],
  ['cloves', 'clove'],
  ['slice', 'slice'],
  ['slices', 'slice'],
  ['can', 'can'],
  ['cans', 'can'],
  ['tin', 'can'],
  ['tins', 'can'],
]);

function normaliseUnit(value) {
  if (!value) return null;
  const normalised = UNIT_ALIASES.get(value.toLowerCase());
  return normalised || value.toLowerCase();
}

function detectOrganic(text) {
  const lower = text.toLowerCase();
  return ORGANIC_KEYWORDS.some(keyword => lower.includes(keyword));
}

function detectVariant(text) {
  const lower = text.toLowerCase();
  const variants = VARIANT_KEYWORDS.filter(keyword => lower.includes(keyword));
  return variants.length > 0 ? variants.join(', ') : null;
}

function detectBrand(text) {
  const brandMatch = text.match(/\b([A-Z][A-Za-z&'`-]{2,})\b/g);
  if (!brandMatch) return null;
  // Filter out words at the beginning that are just capitalised for grammar
  const filtered = brandMatch.filter((word) => word.toLowerCase() !== word);
  return filtered.length > 0 ? filtered[0] : null;
}

function detectCategory(text) {
  const lower = text.toLowerCase();
  for (const mapping of CATEGORY_KEYWORDS) {
    if (mapping.keywords.some(keyword => lower.includes(keyword))) {
      return mapping.category;
    }
  }
  return lower.split(' ')[0] || 'unknown';
}

function stripQuantityTokens(text) {
  return text
    .replace(/\b\d+[.,]?\d*\s*(kg|g|gram|grams|ml|l|liter|litre|tbsp|tablespoon|tsp|teaspoon|cup|cups|pack|packs|bag|bags|piece|pieces|clove|cloves|slice|slices|can|cans|tin|tins)\b/gi, '')
    .replace(/\b\d+\s*[x×]\s*\d+[.,]?\d*\s*(g|gram|grams|ml|l|liter|litre)\b/gi, '')
    .replace(/\b\d+[.,]?\d*\b/g, '')
    .replace(/[•*-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseQuantity(rawText) {
  const text = rawText.replace(',', '.');
  const multipackMatch = text.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|gram|grams|ml|l|liter|litre)/i);
  if (multipackMatch) {
    return {
      count: Number(multipackMatch[1]),
      unit: normaliseUnit(multipackMatch[3]),
      sizeHint: `${multipackMatch[2]} ${multipackMatch[3]}`,
    };
  }

  const quantityMatch = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|gram|grams|ml|l|liter|litre|tbsp|tablespoon|tsp|teaspoon|cup|cups|pack|packs|bag|bags|piece|pieces|clove|cloves|slice|slices|can|cans|tin|tins)?/i);
  if (quantityMatch) {
    return {
      count: Number(quantityMatch[1]),
      unit: normaliseUnit(quantityMatch[2] || null),
    };
  }

  const leadingCountMatch = text.match(/^(\d+)/);
  if (leadingCountMatch) {
    return {
      count: Number(leadingCountMatch[1]),
      unit: null,
    };
  }

  return { count: 1, unit: null };
}

function fallbackNormalize(raw) {
  const quantity = parseQuantity(raw);
  const normalizedQuery = stripQuantityTokens(raw);
  const organic = detectOrganic(raw);
  const variant = detectVariant(raw);
  const brand = detectBrand(raw);
  const category = detectCategory(normalizedQuery);

  return {
    normalizedQuery: normalizedQuery || raw,
    attributes: {
      category,
      variant,
      brand,
      organic,
      notes: null,
    },
    quantity: {
      count: quantity.count,
      unit: quantity.unit,
      sizeHint: quantity.sizeHint || null,
    },
  };
}

async function normalizeWithOpenAI(raw) {
  const client = await getOpenAIClient();
  if (!client) return null;

  try {
    const response = await client.responses.create({
      model: 'gpt-4.1-mini',
      input: `Normaliseer het volgende ingrediënten-item vanuit een MOB recept en geef de data terug als JSON. Beschrijf een beknopte zoekquery voor Picnic, categoriseer het item en geef indien mogelijk variant/merk info. Ingrediënt: "${raw}"`,
      response_format: {
        type: 'json_schema',
        json_schema: NORMALIZATION_SCHEMA,
      },
    });

    const content = response.output?.[0]?.content?.[0];
    if (content?.type === 'output_text') {
      const parsed = JSON.parse(content.text);
      return parsed;
    }
  } catch (error) {
    console.error('OpenAI normalization failed, falling back to heuristic parser:', error.message || error);
  }

  return null;
}

export async function normalizeIngredient(raw) {
  if (!raw) {
    return fallbackNormalize('');
  }

  const aiResult = await normalizeWithOpenAI(raw);
  if (aiResult) {
    return aiResult;
  }

  return fallbackNormalize(raw);
}
