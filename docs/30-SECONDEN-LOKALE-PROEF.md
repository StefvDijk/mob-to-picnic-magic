# Lokale praktijkproef — 9 oktober 2026

Uitgevoerd via de ingelogde lokale app en bestaande Picnic-koppeling. Productie en mandje ongewijzigd. Drie bronnen, twee afgeronde modelaanroepen; kostenadministratie registreert samen 2 eurocent, ruim binnen het goedgekeurde totaalbudget van €1. Geen onbekende betaalde uitkomsten of automatische herhalingen.

## Uitkomst

| Bron | Tijd/eindpunt | Kwaliteit | Volledig correct binnen 30s |
| --- | --- | --- | --- |
| Aangeleverde screenshot, 4 personen | Herkenningsfout bij bewaren zichtbaar na uiterlijk 8,45s; modelfase 7,29s | Alle negen regels en porties herkend; vier lepelregels unknown. Ontbrekende titel blokkeerde bewaren. Na lokale reparatie en expliciet herlezen: acht productgroepen, nul gekozen producten. | Nee |
| MOB-link mango-passion-fruit-chia-pot | Server blokkeerde binnen 0,20s; browserobservatie uiterlijk 10,69s | IMPORT_PAYWALLED; geen modelverzoek | Nee |
| Culy kip-marbella | Productvoorstel zichtbaar bij observatie na 23,55s; modelfase 11,99s | 11 gekozen producten, 13 verpakkingen; vijf groepen zonder match. Rode-rijstvermelding resulteert in witte snelkookrijst. Zout/peper verschijnt uit twee bronregels; bronafbakening vereist controle. | Nee |

Browsermetingen zijn bovengrenzen op basis van observatiemomenten, geen precieze rendertelemetrie. Herstel van de foto is een aparte read-only poging na reparatie, geen geslaagde oorspronkelijke 30s-run. Drie praktijkgevallen zijn geen populatiebenchmark; Culy-producten zijn nog niet onafhankelijk allemaal gelabeld.

## Bevindingen en lokale reparaties

1. Een titel ontbreekt terecht op de screenshot. De omzetting gaf een lege titel door aan een API die een titel verplicht stelt. Nu krijgt een herkend titelvrij recept de duidelijk generieke naam **Recept zonder titel**. De oorspronkelijke kandidaat blijft title=null; er is geen verzonnen herkenning. Gerichte regressietest geslaagd, zeven import-draft-tests geslaagd; frontendtypecheck geslaagd.
2. IMPORT_PAYWALLED had geen specifieke browsermelding. Nu verschijnt een uitleg met de optie om een screenshot te gebruiken. Er is geen betaalmuur omzeild.
3. De ingrediëntenkennisbank kent de Engelse foto-termen niet en mist deze productsoorten ook grotendeels in het Nederlands. Zelfs de aanwezige verse mango-kandidaten zijn daarom niet selecteerbaar. Alleen een vertaalalias toevoegen lost ontbrekende productregels niet op.
4. Engelse tbsp/tsp en Unicode-breuken blijven in bronregels behouden, maar zijn unknown in de geïnterpreteerde hoeveelheid. De honingregels zijn zichtbaar gegroepeerd; een correcte numerieke som van 3½ tbsp is nog niet berekend.

## Eerstvolgende verbeteringen

- Ontkoppel beoordeling van productsoort van de beperkte seed-kennisbank. Voeg een begrensde, controleerbare beoordelingsroute voor onbekende ingrediënten toe, met NL-zoektermen en expliciete productvorm. Behoud afwijzing van bijvoorbeeld mangodrank als vervanging voor verse mango.
- Bewaar oorspronkelijke lepelmaten als getypeerde hoeveelheden; converteer alleen waar een onderbouwde schatting beschikbaar is en toon die als schatting. Correct sommeren en porties schalen moeten zonder model mogelijk zijn.
- Controleer de afbakening van Culy-bronnen en variantbehoud (rode rijst), en onderzoek waarom vijf bekende groepen geen selectie krijgen.
- Voer na deze wijzigingen opnieuw dezelfde proeven uit, daarna de onafhankelijke referentietest. Een timeout of een lijst zonder producten telt niet als snel succes.

Bronlabels, importresultaten en screenshotbewijs staan buiten Git in `/private/tmp/picnic-perfect-match-real-20261009/`. De consistente databasebackup en herstelproef staan in `/private/tmp/picnic-latency-backup-20261009/`. Beide zijn lokale tijdelijke bestanden; geen blijvende datasetopslag.

## Reparatie en herproef

Na “oke fix het” zijn NL/EN-productprofielen toegevoegd voor chia, kefir, kokosyoghurt, vanillepasta, honing, passievruchten en mango. Zoekvragen gebruiken Nederlandse productnamen. Sap, smoothies, gedroogde mango en vanillesuiker gelden niet als hetzelfde ingrediënt. Productomschrijving kan een marketingnaam aanvullen: een expliciet gefermenteerd kokosmelkproduct zonder afwijkende smaak bevestigt kokosyoghurt, zonder merkwens of expliciete andere vorm te overrulen. Gewichten en volumes blijven afzonderlijk; 350g is niet stilzwijgend gelijkgesteld aan 350ml.

Een gedeelde bronparser leest exacte Nederlandse/Engelse lepelmaten, rationale/Unicode-breuken en gemengde getallen. Honing wordt vóór afronden samengevoegd: 3½ tbsp, geschat 73½g op basis van 21g per eetlepel. Zout is geschat 1½g voor ¼ tsp. Schattingen zijn zichtbaar; originele regels en onbekende opgeslagen modelhoeveelheden blijven intact. Vanillepasta krijgt geen ongefundeerde dichtheid. Vanille-extract/stokjes staan als expliciete vervanging, zonder automatische selectie.

De nieuwe foto-import leverde bij browserobservatie na **11,12s** zes gekozen producten en acht verpakkingen op, plus zout uitgeschakeld als keukenkastproduct. Alle negen bronregels behouden. Alleen vanillepasta bleef zonder automatische match; de bekeken assortimentresultaten bevatten geen bewezen pasta. Dat is nog steeds geen volledig correct voorstel zonder correctiewerk. Twee herimports kostten samen 2 eurocent; totaal alle praktijkproeven 4 eurocent. Geen mandmutatie of productieaanpassing.

Ook gerepareerd: exacte sherryazijn werd vóór productbevestiging onterecht als generieke azijnvervanging behandeld; droge/droog en bruin/donker werden te letterlijk vergeleken. Droge witte huiswijn kan nu worden bevestigd, zoete wijn niet. De eerdere kwalificatie van witte rijst als zeker fout was te sterk: de bron noemt `(rode)` tussen haakjes en de bestaande interpretatie behandelt dit als optionele variant. Een expliciet verplichte rode variant blijft beschermd.

Culy-herproef via bestaande opgeslagen bron: 13 gekozen producten in plaats van 11. Droge witte wijn en bruine suiker worden nu gekozen. Sherryazijn, kaneelpoeder en verse oregano blijven zonder automatische keuze; de gerepareerde sherryregel bewijst geen aanwezigheid in het assortiment en de specifieke poeder-/verse vorm is in de bekeken gegevens onvoldoende bevestigd.

Validatie: volledige suite met 370 tests geslaagd; daarna twee aanvullende wijn/variant-regressies en hun gerichte suite geslaagd. Worker/frontendtypechecks en frontendbuild geslaagd. Cacheversies bijgewerkt zodat eerdere beoordelingen niet hergebruikt worden voor gewijzigde regels. Brede onbekende ingrediënten en bronafbakening zijn nog geen bewezen opgelost probleem; de onafhankelijke 95%-benchmark blijft noodzakelijk.
