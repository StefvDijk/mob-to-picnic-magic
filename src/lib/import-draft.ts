import type { ImportCandidate, ImportDto } from '../../shared/imports';
import type { RecipeInputDto } from '@/lib/api';

/** Import extraction does not establish quantities. The user must review every raw line. */
export function recipeInputFromImport(source: ImportDto, candidate: ImportCandidate | null): RecipeInputDto {
  return {
    title: candidate?.title ?? '',
    sourceLabel: source.sourceLabel ?? candidate?.sourceTitle ?? null,
    sourceUrl: source.sourceUrl ?? candidate?.sourceUrl ?? null,
    baseServings: candidate?.baseServings ?? null,
    steps: candidate?.steps ?? [],
    ingredients: (candidate?.ingredients ?? []).map(item => ({
      originalText: item.originalText,
      section: item.section,
      normalizedName: null,
      quantity: { kind: 'unknown' },
      sourceOrigin: 'parser',
      attributes: {},
      uncertainty: ['Hoeveelheid controleren'],
    })),
    uploads: [],
  };
}

const ISSUE_TEXT: Record<string, string> = {
  recognition_pending: 'Controleer de bron en vul de receptgegevens handmatig aan.',
  source_text_not_parsed: 'De geplakte tekst staat klaar om over te nemen.',
  structured_recipe_not_found: 'Op deze pagina is geen gestructureerd recept gevonden.',
  recipe_title_missing: 'Een recepttitel ontbreekt.',
  ingredients_missing: 'Er zijn geen ingrediënten gevonden.',
  ingredients_unparsed: 'De ingrediënten staan als oorspronkelijke tekst klaar voor controle.',
  quantity_review_required: 'Controleer de hoeveelheid van elk ingrediënt.',
  servings_missing: 'Het aantal porties ontbreekt.',
  steps_missing: 'Er zijn geen bereidingsstappen gevonden.',
};

export function importIssueText(code: string): string {
  return ISSUE_TEXT[code] ?? 'Controleer dit onderdeel van de import handmatig.';
}

const ERROR_TEXT: Record<string, string> = {
  IMPORT_URL_REJECTED: 'Deze link wordt niet ondersteund.',
  IMPORT_REDIRECT_REJECTED: 'De link verwijst door naar een niet-toegestane pagina.',
  IMPORT_TIMEOUT: 'Het ophalen van de pagina duurde te lang.',
  IMPORT_TOO_LARGE: 'De pagina is te groot om te verwerken.',
  IMPORT_FETCH_FAILED: 'De pagina kon niet worden opgehaald.',
  IMPORT_UNSUPPORTED_CONTENT: 'De link verwijst niet naar een ondersteunde webpagina.',
  IMPORT_FAILED: 'De import kon niet worden verwerkt.',
  UPLOAD_UNSUPPORTED: 'Foto-import is nog niet beschikbaar.',
};

export function importErrorText(code: string | null): string {
  return code ? ERROR_TEXT[code] ?? 'De import kon niet worden verwerkt.' : 'De import kon niet worden verwerkt.';
}
