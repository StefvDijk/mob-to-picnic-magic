/** Small, inspectable Dutch seed vocabulary. Synonyms are not substitutions.
 * Source: project-maintained recipe vocabulary, versioned here; no external dataset copied.
 * Weights are initial kitchen estimates, not measured product facts. Always labelled in the UI.
 */
export const KNOWLEDGE_VERSION = 'nl-kitchen-2026-10-09.3';
export interface IngredientKnowledge {
  key: string; name: string; aliases: string[]; product: RegExp; exclude?: RegExp;
  pantry?: boolean; pieceGrams?: number; tablespoonGrams?: number; liquid?: boolean;
  handfulGrams?: number; garnishGrams?: number;
}
export const INGREDIENTS: IngredientKnowledge[] = [
  { key: 'chia', name: 'chiazaad', aliases: ['chiazaad', 'chia seeds', 'chia seed', 'chiazaden'], product: /\bchiazaad\b/, exclude: /sap|smoothie|reep|mix|pudding|brood/ },
  { key: 'kefir', name: 'kefir', aliases: ['kefir'], product: /\bkefir\b/, exclude: /mango|aardbei|framboos|vanille|kokos|citroen|perzik|suiker|waterkefir/ },
  { key: 'coconut-yoghurt', name: 'kokosyoghurt', aliases: ['kokosyoghurt', 'coconut yoghurt', 'coconut yogurt', 'kokos yoghurt'], product: /kokos.*yogh?urt|yogh?urt.*kokos/, exclude: /drink|mango|ananas|aardbei|vanille|ijs/ },
  { key: 'vanilla-paste', name: 'vanillepasta', aliases: ['vanillepasta', 'vanilla bean paste', 'vanilla paste'], product: /vanille.*pasta|vanilla.*paste/, exclude: /suiker|extract|aroma|ijs/ },
  { key: 'honey', name: 'honing', aliases: ['honing', 'honey'], product: /\bhoning\b/, exclude: /mosterd|saus|noten|reep|koek|yoghurt|drop|snoep|wafel|ontbijtgranen/, tablespoonGrams: 21 },
  { key: 'passionfruit', name: 'passievrucht', aliases: ['passievrucht', 'passievruchten', 'passionfruit', 'passionfruits', 'passion fruit'], product: /^(?:picnic |bio )?passievrucht(?:en)?$/, exclude: /sap|drank|smoothie|yoghurt|ijs|puree|diepvries/ },
  { key: 'mango', name: 'mango', aliases: ['mango', 'mangos', 'mangoes'], product: /^(?:(?:picnic|bio|biologische|spaanse|eetrijpe) )*mango(?:s|['’]s)?(?: eetrijp)?$/, exclude: /sap|nectar|drank|smoothie|yoghurt|ijs|gedroogd|stukjes|diepvries/ },
  { key: 'chicken-thigh', name: 'kippendijen', aliases: ['kippendijen', 'kipdijfilet', 'kippendijfilet'], product: /kip(?:pen)?dij(?:en|filet)?/, exclude: /vegetar|vegan|gekruid|gemarineerd|gerookt|gegaard|bereid|sat[eé]/, pieceGrams: 125 },
  { key: 'chicken-breast', name: 'kipfilet', aliases: ['kipfilet', 'kipfilets'], product: /kipfilet/, exclude: /vegetar|vegan|gerookt|gebraden|beleg|reep|gekruid|gemarineerd/, pieceGrams: 150 },
  { key: 'onion', name: 'uien', aliases: ['ui', 'uien', 'gele ui', 'gele uien'], product: /\b(?:uien|ui)\b/, exclude: /rood|rode|bos|lente|gebakken|gesneden|ringen|soep|poeder|zilver/, pieceGrams: 150 },
  { key: 'red-onion', name: 'rode uien', aliases: ['rode ui', 'rode uien'], product: /rode uien?/, exclude: /gesneden|zoetzuur|ingelegd/, pieceGrams: 150 },
  { key: 'spring-onion', name: 'bosui', aliases: ['bosui', 'bosuitjes', 'bosuien', 'lente ui', 'lente uitjes', 'lenteui'], product: /bosui|lente.?ui/, pieceGrams: 20 },
  { key: 'garlic', name: 'knoflook', aliases: ['knoflook', 'teentje knoflook', 'knoflookteentjes'], product: /knoflook/, exclude: /saus|poeder|puree|pasta|gehakt|granulaat|brood/, pieceGrams: 5 },
  { key: 'sherry-vinegar', name: 'sherryazijn', aliases: ['sherryazijn', 'sherry azijn'], product: /sherry.?azijn|sherry vinegar/, liquid: true },
  { key: 'olive-oil', name: 'olijfolie', aliases: ['olijfolie'], product: /olijfolie/, exclude: /spray|basilicum|truffel|knoflook|citroen/, liquid: true },
  { key: 'cooking-oil', name: 'bakolie', aliases: ['olie', 'bakolie', 'zonnebloemolie', 'plantaardige olie'], product: /zonnebloemolie|bakolie/, exclude: /spray/, liquid: true, pantry: true },
  { key: 'green-olives', name: 'groene olijven zonder pit', aliases: ['groene olijven', 'olijven'], product: /groene olijven/, exclude: /gevuld|knoflook|feta|met pit/, tablespoonGrams: 15 },
  { key: 'capers', name: 'kappertjes', aliases: ['kappertjes'], product: /kappertjes/, exclude: /appel|saus/, tablespoonGrams: 10 },
  { key: 'dried-apricot', name: 'gedroogde abrikozen', aliases: ['abrikozen', 'gedroogde abrikozen'], product: /abrikozen/, exclude: /jam|confituur|sap|reep|vers|blik|siroop/, handfulGrams: 40 },
  { key: 'dried-prune', name: 'gedroogde pruimen', aliases: ['pruimen', 'gedroogde pruimen'], product: /pruimen/, exclude: /jam|sap|vers|siroop/, handfulGrams: 40 },
  { key: 'cinnamon', name: 'kaneelpoeder', aliases: ['kaneelpoeder', 'gemalen kaneel', 'kaneel'], product: /kaneel/, exclude: /stok|suiker|koek|brood|reep/, tablespoonGrams: 8 },
  { key: 'coriander-seed', name: 'korianderzaad', aliases: ['korianderzaadjes', 'korianderzaad'], product: /korianderzaad|koriander gemalen|gemalen koriander/, tablespoonGrams: 6 },
  { key: 'pomegranate-molasses', name: 'granaatappelmelasse', aliases: ['granaatappelmelasse', 'granaatappel melasse'], product: /granaatappel.*melasse/, liquid: true },
  { key: 'salt', name: 'keukenzout', aliases: ['zout', 'salt', 'keukenzout', 'zeezout'], product: /(?:keuken|zee|tafel)?zout\b/, exclude: /arm|chips|noten|boter|karamel|peper|kruiden|vaatwas|bad/, pantry: true, tablespoonGrams: 18 },
  { key: 'black-pepper', name: 'zwarte peper', aliases: ['zwarte peper', 'peper'], product: /zwarte peper/, exclude: /saus/, pantry: true, tablespoonGrams: 7 },
  { key: 'white-wine', name: 'droge witte wijn', aliases: ['witte wijn', 'droge witte wijn'], product: /sauvignon blanc|pinot grigio|chardonnay|verdejo|droge witte wijn|^picnic huiswijn wit fris & droog$/, exclude: /alcoholvrij|0[.,]0|zoet|azijn/, liquid: true },
  { key: 'brown-sugar', name: 'bruine suiker', aliases: ['bruine suiker', 'bruine basterdsuiker'], product: /(?:bruine|donkere|donkerbruine) basterdsuiker|bruine suiker|basterdsuiker donker/, tablespoonGrams: 13 },
  { key: 'sugar', name: 'suiker', aliases: ['suiker', 'kristalsuiker'], product: /kristalsuiker/, exclude: /poeder|basterd|vanille/, tablespoonGrams: 12 },
  { key: 'oregano-fresh', name: 'verse oregano', aliases: ['oregano', 'verse oregano'], product: /oregano/, exclude: /gedroogd|gemalen/, garnishGrams: 5 },
  { key: 'pistachio', name: 'pistachenoten', aliases: ['pistachenootjes', 'pistachenoten'], product: /pistache/, exclude: /ijs|pasta|chocol|croissant|mix|reep/, tablespoonGrams: 10, handfulGrams: 30 },
  { key: 'rice', name: 'rijst', aliases: ['rijst', 'witte rijst'], product: /rijst/, exclude: /pap|wafel|bloem|olie|azijn|noedel|maaltijd|kant.en.klaar|minuten|magnetron|risotto|sushi|dessert|curry|nasi/ },
  { key: 'flour', name: 'tarwebloem', aliases: ['bloem', 'tarwebloem'], product: /tarwebloem/, exclude: /zelfrijzend/, tablespoonGrams: 8 },
  { key: 'cooking-cream', name: 'kookroom', aliases: ['kookroom'], product: /kookroom/, exclude: /plantaardig|haver|soja|light/, liquid: true },
  { key: 'whipping-cream', name: 'slagroom', aliases: ['slagroom'], product: /slagroom/, exclude: /spuit|geklopt|gezoet|plantaardig/, liquid: true },
  { key: 'tomato-puree', name: 'tomatenpuree', aliases: ['tomatenpuree'], product: /tomatenpuree/ },
  { key: 'passata', name: 'passata', aliases: ['passata', 'gezeefde tomaten', 'tomatenpassata'], product: /passata|gezeefde tomaten/ },
  { key: 'tomato-cubes', name: 'tomatenblokjes', aliases: ['tomatenblokjes'], product: /tomatenblokjes/, exclude: /basilicum|knoflook/ },
  { key: 'tomato', name: 'tomaten', aliases: ['tomaat', 'tomaten'], product: /tomaten/, exclude: /puree|blokjes|gezeefd|gedroogd|saus|soep|cherry|snoep|gepeld|polpa|blik|sap/, pieceGrams: 100 },
  { key: 'lemon', name: 'citroen', aliases: ['citroen', 'citroenen'], product: /citroenen?\b/, exclude: /sap|rasp|limonade|ijs|smaak/, pieceGrams: 120 },
  { key: 'milk', name: 'melk', aliases: ['melk', 'halfvolle melk'], product: /halfvolle melk/, exclude: /choco|haver|soja/, liquid: true },
];
export const normalizeIngredient = (value: string) => value.toLocaleLowerCase('nl').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[-–]/g, ' ').replace(/\s+/g, ' ').trim();
