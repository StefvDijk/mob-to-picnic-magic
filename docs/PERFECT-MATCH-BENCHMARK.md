# Benchmark: nulmeting en referentieprotocol

9 oktober 2026. Status: offline nulmeting/evaluator gereed; onafhankelijke echte receptbenchmark nog niet uitgevoerd. Geen betaalde requests of productieaanpassingen. Onderzoeksbudget maximaal €1 is goedgekeurd; besteed €0.

## Uitgevoerde nulmeting

| Onderdeel | Resultaat | Wat dit bewijst |
| --- | ---: | --- |
| Bestaande synthetische ontwikkelparen | 30/30 | Geprogrammeerde matchingregels op deze paren |
| Bestaande synthetische testparen | 30/30 | De reeds bestaande aparte fixtures; geen nieuwe onafhankelijke testset |
| Hoeveelheidcontracten | 5/5 | Breuk/porties, eenheidsoptelling, rangebovenkant, NL-lepelschatting en onbekendbehoud |
| Evaluatortests | 3/3 | Detectie van bewuste mismatch, rationale gelijkheid, ontbrekende telemetry en ongeldige input |
| Volledige lokale suite na wijzigingen | 291/291, 34 bestanden | Regressiecontracten, inclusief nieuwe detailpool en transactionele publicatie |
| Worker-typecheck en diffcontrole | Geslaagd | Type-/diffcontrole, geen accuracy- of live latencybewijs |

Herhaalbare output: [synthetische regels](benchmarks/perfect-match-synthetic-v1.json) en [bewust foutieve evaluatordemo](benchmarks/perfect-match-evaluator-demo-v1.json). De demo is verzonnen en telt niet als echt recept. Regelmeting: 100 × 30 beoordelingen in circa 11ms op deze machine, exclusief compileren/laden. Dit is geen end-to-end tijd.

```sh
node scripts/perfect-match-benchmark.mjs
node --test scripts/perfect-match-reference.test.mjs
node scripts/perfect-match-benchmark.mjs --reference /private/path/reference.json --predictions /private/path/predictions.json
```

CLI: uitsluitend lokale saved-resultvergelijking, geen provider of database. Documentatie en gesaneerde schemafixtures: [README](../scripts/fixtures/perfect-match/README.md). De eerste evaluator ondersteunt exacte hoeveelheden, geen unknown/range/global labels. Deze beperking expliciet oplossen voordat de volledige representatieve set wordt gescoord; moeilijke huishoudmaten niet uit de echte denominator verwijderen.

## Gereproduceerde inhoudelijke gaten

- `½ eetlepel olijfolie`: geen bruikbare hoeveelheid uit huishoudmaatschatter.
- `2 tablespoons olive oil`, `1 cup bloem`: geen bewezen EN-/cupconversie.
- `1/2 handje pistachenoten`: schatter leest een heel handje in plaats van half.
- `200 g abrikozen` zonder vormbewijs: kennisprofiel stuurt standaard naar gedroogd.

Deze probes worden afzonderlijk getoond en niet bij de positieve contractscores opgeteld. Zie de ingrediëntenaudit voor code en gevolgen.

## Gezamenlijk protocol voor echte recepten

Eén versiegebonden manifest met 100 echte recepten: 50 URL's, 25 screenshots, 25 camerafoto's; 60 ontwikkeling en 40 gesloten test, minstens vijf domeinen, NL/EN. Zelfde recept en verwante varianten blijven in dezelfde split. Bronmateriaal buiten Git, bronhash en toestemming/provenance registreren. Kritieke labels door onafhankelijke tweede beoordeling adjudiceren. Geen privéfoto's of accounts doorzoeken.

Referentielabels per recept: juiste kandidaat, titel/porties, alle regels en secties, brontekst/getal/eenheid/basis, canonieke naam/aankoopvorm, vereiste versus optionele ingrediënten, acceptabele SKU-set en verpakkingsaantallen, werkelijk ontbrekend assortiment apart. Predictions krijgen dezelfde stabiele bronregel-IDs, kandidaat-IDs en gekozen product/aantal/automatische status. Log model/prompt/parser/regel/catalogusversies en cold/warm afzonderlijk.

De evaluator telt complete receptcorrectheid, gezamenlijke correctheid binnen 30.000ms, ontbrekende/extra regels, kritieke velden, candidate recall, automatische precision, selectiecoverage, onthouding, correcties en bekende kosten. Ontbrekende telemetry wordt niet als nul geteld. Titelgelijkheid is voorlopig een proxy voor receptselectie; echte kandidaatevidence en sectiemetrics moeten vóór de brede benchmark worden toegevoegd. Een parallelle equivalentenlijst voor titels/ingrediëntnamen voorkomt onterechte afkeuring van inhoudelijk equivalente normalisatie.

Fouttaxonomie: unsupported/ontoegankelijke bron; verkeerde kandidaat; transcriptie/OCR; ontbrekende/dubbele/verzonnen regel; verkeerd getal/porties; verkeerde betekenis/vorm; ontbrekende productkandidaat; onjuiste geschiktheid; verpakking/conversie; verouderde commerciële data; uitvoerbewijs; publicatie/overdracht; deadlineoverschrijding. Onbeslist blijft zichtbaar en telt mee voor gebruikerswerk.

Meet de gehele tijd vanaf submit tot zichtbare volledig bruikbare boodschappen, inclusief fotoverwerking/upload, queuewait, telling, generatie, opslaan, retrieval en UI. Menselijke keuzes/correcties afzonderlijk registreren naast ruwe totaalduur. Rapporteer p50/p95/max en overschrijdingen, ook op fouten. Een volledige juiste uitkomst na 45s faalt het gezamenlijke doel; een onvolledige uitkomst na 5s eveneens.

## Resterend bewijs en begrensde modelproef

Er is nu geen gelabelde 100-receptenset of echte fotoset beschikbaar. De bestaande echte Culy-import en de vastgelopen eigenaarstest leveren casusbewijs, geen onafhankelijke accuracypercentages. Geen 95%- of 30s-prestatieclaim mogelijk.

Volgende proef: eerst vijftien ontwikkelcases onafhankelijk labelen, huidige baseline bevriezen, maximaal twee uitdagers op dezelfde inputhash evalueren. Binnen €1 totaal blijven via bestaande ledger, start met een kleine batch en stop op werkelijke/reserveringskosten; geen onzekere betaalde poging replayen. Geen nieuwe OCR-cloudservice. Volledige onafhankelijke testset pas openen na routekeuze. Rapporteer denominatoren en onzekerheidsintervallen op echte receptmetingen; veertig gevallen geven beperkte precisie.

Productgegevens uitsluitend via bestaande begrensde contextgebonden leesroutes; alle aankoopproeven mocks. Productie blijft ongemoeid tijdens het onderzoek. De backlog beschrijft wat nog nodig is om de 30s-architectuur werkelijk vrij te geven.

## Vervolgimplementatie — 9 oktober 2026

Na akkoord is de snelle gestructureerde/compacte route plus gedeeld tijdsbudget lokaal gebouwd. Lees [30-SECONDEN-IMPLEMENTATIE.md](30-SECONDEN-IMPLEMENTATIE.md) voor de precieze status, 349 geslaagde tests, migratie en grenzen. Dit vervangt eerdere vermeldingen dat deadline en snelle route uitsluitend ontwerp zijn. Productie blijft ongewijzigd; echte kwaliteit/latency en browserproef nog niet bewezen.
