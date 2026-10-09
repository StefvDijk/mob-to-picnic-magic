# Offline referentie-evaluatie

Deze fixtures zijn verzonnen schema-demonstraties, geen echte receptlabels.

Run:

```sh
node scripts/perfect-match-benchmark.mjs --reference scripts/fixtures/perfect-match/reference.synthetic.json --predictions scripts/fixtures/perfect-match/predictions.synthetic-mismatch.json
node --test scripts/perfect-match-reference.test.mjs
```

Zonder CLI-argumenten draait de bestaande synthetische regelbenchmark. Met argumenten worden uitsluitend aangeleverde JSON-bestanden vergeleken; er worden geen imports, catalogusvragen of providerverzoeken uitgevoerd. Een geldige evaluatie retourneert exitcode 0, ook bij kwaliteitsfouten; ongeldige input retourneert 2.

Voor echte proeven bewaar bronmateriaal en JSON buiten Git. Maak labels onafhankelijk van predictions. Gebruik dezelfde `datasetVersion`, unieke recept-IDs en stabiele `sourceId` per gelabelde ingrediëntregel. Registreer `sourceHash`, split, taal en brontype; hashes worden hier alleen op aanwezigheid gecontroleerd. Splits en labelprovenance worden niet automatisch geverifieerd. Sluit de testset tot de architectuurkeuze vastligt. Leg model-, prompt-, parser- en catalogusversie naast de predictionbestanden vast.

Iedere referentieregel heeft canonicalName, form en exact quantity amount/unit/basis; amounts ondersteunen decimale of rationale strings. Vergelijking gebruikt exacte rationale gelijkheid, geen automatische eenheidsconversie. Verschillen kg/g blijven zichtbaar als unitfout. Een unknown/range/global label is nog niet ondersteund en wordt geweigerd; label zulke brongevallen afzonderlijk voordat de evaluator wordt uitgebreid. `form` mag een lege string zijn als geen aankoopvorm is voorgeschreven.

`required` bepaalt of productkeuze nodig is; `available` sluit aantoonbaar afwezige assortimentproducten uit de selectie-denominator. Zo'n uitzondering moet door de menselijke labels onderbouwd zijn. Per aanvaardbare product-ID bevat `packCounts` de expliciet geaccepteerde aantallen. Meerdere correcte merken en aantallen zijn mogelijk. Kandidaten worden gerapporteerd via candidateProductIds, selections via productId/packCount/automatic; null selection is onthouding. Het script rapporteert correctheid van alle selecties via receptfouten en precision van alleen automatische selecties afzonderlijk.

Predictions hebben hele-flow `latencyMs`, gemeten `costCents` en totaal `corrections`. Ontbrekende kosten/latency tellen als ontbrekende telemetry, niet als nul. `wholeRecipePass` vereist correcte titel, porties, alle ingrediëntvelden, geen extra/ontbrekende regels, correcte verpakkingskeuzes voor beschikbare noodzakelijke producten en nul correcties. `wholeRecipeWithin30Seconds` vereist daarnaast een gemeten tijd van maximaal 30.000 ms. De referentie-ID bepaalt het recept; een verkeerde titel telt als receptselectiefout. Latency-percentielen gebruiken de nearest-rank-methode en zijn geen betrouwbare populatieschatting bij kleine aantallen.

De output bevat foutcategorieën en IDs, geen titel/broninhoud. IDs zelf kunnen gevoelig zijn: publiceer de output alleen na sanitatie. De benchmark geeft aantallen, denominatoren, splitresultaten, candidate recall, selection coverage, automatische precision, onthouding, ontbrekende/extra regels, kosten en p50/p95. Geen betrouwbaarheidsinterval of brede accuracyclaim op basis van de demo.
