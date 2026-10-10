import type { ImportCandidate, ImportDto } from '../../shared/imports';
import { parseQuantity } from '../../shared/quantities';
import type { RecipeInputDto } from './api';

/** Keep original lines; only validated recognition may supply interpreted quantities. */
export function recipeInputFromImport(source: ImportDto, candidate: ImportCandidate | null): RecipeInputDto {
  return {
    // A cropped ingredient photo may have no title; keep its source snapshot intact.
    title: candidate ? candidate.title?.trim() || 'Recept zonder titel' : '',
    sourceLabel: source.sourceLabel ?? candidate?.sourceTitle ?? null,
    sourceUrl: source.sourceUrl ?? candidate?.sourceUrl ?? null,
    baseServings: candidate?.baseServings ?? null,
    steps: candidate?.steps ?? [],
    ingredients: (candidate?.ingredients ?? []).map(item => {
      const quantity = (item.sourceOrigin === 'ai' || item.sourceOrigin === 'parser') && item.quantity ? parseQuantity(item.quantity) ?? { kind: 'unknown' as const } : { kind: 'unknown' as const };
      return ({
      originalText: item.originalText,
      section: item.section,
      normalizedName: (item.sourceOrigin === 'ai' || item.sourceOrigin === 'parser') ? item.normalizedName ?? null : null,
      quantity,
      sourceOrigin: item.sourceOrigin === 'ai' ? 'ai' : 'parser',
      attributes: (item.sourceOrigin === 'ai' || item.sourceOrigin === 'parser') ? item.attributes ?? {} : {},
      uncertainty: [...new Set([...(quantity.kind === 'unknown' || quantity.kind === 'global' ? ['Hoeveelheid controleren'] : []), ...(item.uncertainty ?? []).map(note => ISSUE_TEXT[note] ?? note)])],
    }); }),
    uploads: source.uploadIds ?? [],
  };
}

const ISSUE_TEXT: Record<string, string> = {
  recognition_pending: 'Automatische herkenning wordt voorbereid.',
  source_text_not_parsed: 'De geplakte tekst staat klaar om over te nemen.',
  structured_recipe_not_found: 'Op deze pagina is geen gestructureerd recept gevonden.',
  recipe_title_missing: 'Een recepttitel ontbreekt.',
  ingredients_missing: 'Er zijn geen ingrediënten gevonden.',
  ingredients_unparsed: 'De ingrediënten staan als oorspronkelijke tekst klaar voor controle.',
  quantity_review_required: 'Controleer de hoeveelheid van elk ingrediënt.',
  servings_missing: 'Het aantal porties ontbreekt.',
  steps_missing: 'Er zijn geen bereidingsstappen gevonden.',
  quantity_unit_unsupported: 'Deze maat wordt apart geschat bij de boodschappenberekening.',
  quantity_missing: 'Een hoeveelheid ontbreekt in de bron.',
  quantity_ambiguous: 'De hoeveelheid is niet eenduidig leesbaar.',
  name_ambiguous: 'Controleer welk ingrediënt wordt bedoeld.',
  source_mismatch: 'Dit onderdeel komt niet duidelijk overeen met de bron.',
  recipe_incomplete: 'Er lijken gegevens in het recept te ontbreken.',
  source_ambiguous: 'Niet alle brongegevens zijn eenduidig.',
  other: 'Controleer dit onderdeel met de oorspronkelijke bron.',
};

export function importIssueText(code: string): string {
  return ISSUE_TEXT[code] ?? 'Controleer dit onderdeel van de import handmatig.';
}

const ERROR_TEXT: Record<string, string> = {
  IMPORT_URL_REJECTED: 'Gebruik een HTTPS-link naar een openbare website zonder inloggegevens.',
  IMPORT_PAYWALLED: 'Dit recept staat achter een betaalmuur. Gebruik een foto of screenshot van het recept.',
  IMPORT_REDIRECT_REJECTED: 'De website stuurde door naar een onveilige of ongeldige link.',
  WORKFLOW_TIMEOUT: 'Er is geen volledig voorstel binnen 30 seconden. Je bron blijft bewaard.',
  IMPORT_TIMEOUT: 'Het ophalen van de pagina duurde te lang.',
  IMPORT_TOO_LARGE: 'De pagina is te groot om te verwerken.',
  IMPORT_FETCH_FAILED: 'De pagina kon niet worden opgehaald. Mogelijk blokkeert de website automatisch ophalen; probeer een foto of screenshot.',
  IMPORT_UNSUPPORTED_CONTENT: 'De link verwijst niet naar een ondersteunde webpagina.',
  IMPORT_FAILED: 'De import kon niet worden verwerkt.',
  UPLOAD_UNSUPPORTED: 'Foto-import is nog niet beschikbaar.',
};

export function importErrorText(code: string | null): string {
  return code ? ERROR_TEXT[code] ?? 'De import kon niet worden verwerkt.' : 'De import kon niet worden verwerkt.';
}

export function recognitionFallbackText(code: string | null): string {
  const reasons: Record<string, string> = {
    WORKFLOW_TIMEOUT: 'De herkenning heeft het tijdsbudget overschreden. Je bron blijft bewaard.',
    AI_DISABLED: 'Automatische herkenning staat tijdelijk uit.',
    AI_NOT_CONFIGURED: 'Automatische herkenning is nog niet beschikbaar.',
    AI_PRICE_STALE: 'Automatische herkenning wacht op een kostencontrole.',
    AI_COUNT_FAILED: 'De kosten van deze herkenning konden niet betrouwbaar worden bepaald.',
    AI_BUDGET_EXCEEDED: 'Deze herkenning past niet binnen het beschikbare budget.',
    AI_INPUT_TOO_LARGE: 'Deze bron is te groot voor automatische herkenning.',
    AI_OUTPUT_INVALID: 'Het herkenningsresultaat kon niet betrouwbaar worden verwerkt.',
    AI_PROVIDER_UNAVAILABLE: 'De herkenningsdienst is tijdelijk niet beschikbaar.',
    AI_IMPORT_EXPIRED: 'Dit importconcept is verlopen.',
    AI_SOURCE_UNAVAILABLE: 'De oorspronkelijke bron is niet meer beschikbaar.',
  };
  return `${code && reasons[code] ? reasons[code] : 'Automatische herkenning is niet beschikbaar voor deze import.'} Probeer later opnieuw of kies een andere bron.`;
}
