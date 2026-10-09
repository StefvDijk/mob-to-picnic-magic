import type { MatchStatus } from '../../shared/shopping';
/** Project-authored synthetic NL pairs, manually labelled. No provider/model evaluation or catalogue coverage claim. */
export const MATCH_CASES: ReadonlyArray<readonly [string, string, MatchStatus]> = [
  // Development set: 30 cases. The held-out set below must not select rule thresholds.
  ['uien', 'Gele uien', 'suitable'], ['uien', 'Uien', 'suitable'],
  ['knoflook', 'Knoflook', 'suitable'], ['knoflook', 'Verse knoflook', 'suitable'],
  ['rijst', 'Witte rijst', 'suitable'], ['rijst', 'Rijst', 'suitable'],
  ['kookroom', 'Kookroom', 'suitable'], ['slagroom', 'Slagroom', 'suitable'],
  ['tomatenpuree', 'Tomatenpuree', 'suitable'], ['passata', 'Passata', 'suitable'],
  ['tomatenblokjes', 'Tomatenblokjes', 'suitable'], ['kipfilet', 'Kipfilet', 'suitable'],
  ['kippendijen', 'Kipdijfilet', 'suitable'], ['olijfolie', 'Olijfolie', 'suitable'],
  ['zout', 'Keukenzout', 'suitable'], ['zwarte peper', 'Zwarte peper', 'suitable'],
  ['kookroom', 'Slagroom', 'substitution'], ['slagroom', 'Kookroom', 'substitution'],
  ['passata', 'Tomatenpuree', 'substitution'], ['tomatenpuree', 'Tomatenblokjes', 'substitution'],
  ['knoflook', 'Knoflookpoeder', 'substitution'], ['kipfilet', 'Vegetarische kipfilet', 'substitution'],
  ['knoflook', 'Knoflookchips', 'unsuitable'], ['uien', 'Uiensoep', 'unsuitable'],
  ['knoflook', 'Knoflooksaus', 'unsuitable'], ['knoflook', 'Knoflook brood', 'unsuitable'],
  ['oregano', 'Oregano', 'unresolved'], ['mysterie', 'Mysterie', 'unresolved'],
  ['kookroom', 'Room bundel', 'unresolved'], ['rijst', 'Onbekend product', 'unresolved'],
  // Held-out test set: 30 distinct cases, no confidence percentages or learned thresholds.
  ['uien', 'Bio gele uien', 'suitable'], ['knoflook', 'Biologische knoflook', 'suitable'],
  ['rijst', 'Basmati rijst', 'suitable'], ['kookroom', 'Picnic kookroom', 'suitable'],
  ['slagroom', 'Verse slagroom', 'suitable'], ['passata', 'Gezeefde tomaten', 'suitable'],
  ['tomatenpuree', 'Dubbel geconcentreerde tomatenpuree', 'suitable'], ['tomatenblokjes', 'Picnic tomatenblokjes', 'suitable'],
  ['kipfilet', 'Biologische kipfilet', 'suitable'], ['kippendijen', 'Kippendijen', 'suitable'],
  ['olijfolie', 'Extra vierge olijfolie', 'suitable'], ['zout', 'Zeezout', 'suitable'],
  ['citroen', 'Citroenen', 'suitable'], ['suiker', 'Kristalsuiker', 'suitable'],
  ['bloem', 'Tarwebloem', 'suitable'], ['melk', 'Halfvolle melk', 'suitable'],
  ['passata', 'Picnic tomatenblokjes', 'substitution'], ['tomatenblokjes', 'Passata gezeefde tomaten', 'substitution'],
  ['sherryazijn', 'Witte wijnazijn', 'substitution'], ['knoflook', 'Gehakte knoflook', 'substitution'],
  ['kookroom', 'Light kookroom', 'substitution'], ['kipfilet', 'Vegan kipfilet', 'substitution'],
  ['knoflook', 'Conimex paneermix knoflook', 'unsuitable'], ['uien', 'Picnic soep ui', 'unsuitable'],
  ['pistachenoten', 'Pistache yoghurt', 'unsuitable'], ['zwarte peper', 'Ribbelchips zwarte peper', 'unsuitable'],
  ['verse oregano', 'Gedroogde oregano', 'unsuitable'], ['knoflook', 'Drogheria knoflook', 'unresolved'],
  ['gedroogde abrikozen', 'Abrikozen', 'unresolved'], ['kookroom', 'Kookroom pakket', 'unresolved'],
];
export const MATCH_DEVELOPMENT_CASES = MATCH_CASES.slice(0, 30);
export const MATCH_TEST_CASES = MATCH_CASES.slice(30);
