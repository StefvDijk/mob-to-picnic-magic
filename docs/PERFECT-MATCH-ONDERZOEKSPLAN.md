# Onderzoeksplan: betrouwbare recept- en productherkenning

Datum: 9 oktober 2026. Status: onderzoeksopdracht voor een nieuwe sessie; geen implementatie- of modelkeuze vooraf vastgelegd.

## Doel en productgrenzen

Onderzoek hoe de app voor alledaagse Nederlandse en Engelse recepten vrijwel altijd het bedoelde recept volledig herkent en passende Picnic-producten met voldoende hoeveelheden voorstelt. Maak meetbaar welke kwaliteit haalbaar is binnen de huidige mobiele flow en budgetten.

‘Perfect match’ omvat vier afzonderlijke uitkomsten: juiste bron/recept gekozen, ingrediënten en porties correct gelezen, betekenis/hoeveelheden correct geïnterpreteerd, en inhoudelijk geschikte producten gevonden. Prijsoptimalisatie volgt pas daarna. Een geschikt product dat werkelijk niet in het assortiment bestaat is iets anders dan een zoek- of herkenningsfout.

Behoud URL/foto als invoer, één recept per voorstel, alleen noodzakelijke correcties, bronbehoud, goedkoopste voldoende hoeveelheid, expliciete vervangingen en één aankoopakkoord. Geen checkout, automatische dieetvervanging of impliciet leren van gebruikerswijzigingen. Niche is vooraf gedefinieerd, geen etiket voor iedere mislukking.

## Voorlopige audit van de huidige keten

Deze conclusies volgen uit de huidige code en het verificatieverslag; ze zijn geen gemeten accuracyscores.

- URL-fetch accepteert alleen Culy en MOB. HTML/gestructureerde receptdata wordt geëxtraheerd; daaruit samengestelde tekst of leesbare HTML-tekst gaat naar de herkenner. Onderzoek verlies van secties/context en het samenvoegen van meerdere kandidaten in die overdracht.
- De huidige multimodale OpenAI-route levert een strikt JSON-schema. Bronverwijzingen, hoeveelheidsvalidatie, budgetreservering en duurzame pogingen zijn aanwezig. Schema-validiteit bewijst geen inhoudelijke juistheid.
- Foto's worden verkleind/hergecodeerd en rechtstreeks als beelden aan hetzelfde model aangeboden. Er is geen onafhankelijke OCR-/layoutcontrole bewezen. De controle dat sourceQuote gelijk is aan originalText bij een foto vergelijkt twee modelvelden; zij bewijst niet dat de tekst werkelijk op het beeld staat.
- Voor tekst worden broncitaten en originele regels op voorkomen gecontroleerd. Onderzoek of ook genormaliseerde namen, getallen, eenheden, porties en stappen inhoudelijk aan de bron worden getoetst; een aanwezig citaat alleen sluit een verkeerde interpretatie niet uit.
- Het hoeveelheidscontract ondersteunt g/kg/ml/l/stuks. Lepels/handjes blijven onbekend tijdens import, waarna code ingrediëntafhankelijke schattingen kan gebruiken. De beperkte eigen kennisbank bevat hoofdzakelijk Nederlandse aliassen en initiële keukenschattingen; geen brede gevalideerde tweetalige ontologie.
- Productmatching gebruikt regels, zoekresultaten, details en versiegebonden relaties. Decisions is technisch voorbereid maar staat uit. De zestig synthetische matchingparen bewijzen contract-/regelgedrag, geen marktbrede of live modelkwaliteit.
- Positieve beschikbaarheid en gecorreleerd toevoegbewijs blijven afzonderlijke externe beperkingen. Een betere herkenner lost deze niet vanzelf op.
- Online login, Picnic-koppeling en echte Culy-import zijn bewezen. Echte camerafoto, brede Engelse dekking en een onafhankelijke eind-tot-eind kwaliteitsbenchmark ontbreken.

Startpunten: worker/imports/{extract,processor,ai}.ts, src/lib/import-photo.ts, shared/{quantities,ingredient-knowledge}.ts, worker/domain/{shopping,quantityMath,productSelector}.ts, worker/matching/{assessment,decisions}.ts en worker/catalog/. Lees ook RECEPT-NAAR-MANDJE-PLAN.md, CATALOGUS-EN-DECISIONS-IMPLEMENTATIEPLAN.md en de nieuwste aanvullingen van RECEPT-NAAR-MANDJE-VERIFICATIE.md.

## 1. Audit en nulmeting

Teken de feitelijke keten met gegevensverlies, beslissingen, caches en externe aanvragen per stap. Controleer op receptselectie, dubbele bronlijsten, secties, optionele ingrediënten, bereidingsnotities versus aankoopvorm, netto/uitgelekt gewicht en bronevidence. Noteer wat code garandeert, wat alleen een prompt vraagt en wat live bewezen is.

Maak een fouttaxonomie: bron niet ondersteund/ontoegankelijk; verkeerd recept; OCR/transcriptie; ontbrekende/dubbele regel; verkeerd getal/portie; verkeerde betekenis; ontbrekende kandidaat; verkeerde geschiktheid; conversie/verpakking; verouderde commerciële data; onzeker uitvoerbewijs. Laat fouten niet verdwijnen in één algemene score.

Oplevering: auditrapport met concrete voorbeelden, ernst, geraakte code en reproduceerbare gevallen. Eerst meten, dan aanpassen.

## 2. Representatieve referentieset

Begin met 100 echte recepten: 50 URL's, 25 heldere screenshots en 25 echte camerafoto's. Verdeel over Nederlands/Engels, minstens vijf brondomeinen voor de onderzoeksvergelijking, verschillende gerechten en korte/lange lijsten. Rapporteer huidige brondekking apart van nauwkeurigheid binnen ondersteunde bronnen. Gebruik alleen rechtmatig toegankelijke bronnen; geen betaalmuren omzeilen.

Reserveer bijvoorbeeld 60 voor ontwikkeling en 40 als afgeschermde testset. Houd hetzelfde recept en verwante foto/URL-varianten in dezelfde split om lekkage te voorkomen. Leg verdeling en versies vooraf vast. Gebruik door de eigenaar bewust aangeleverde testgevallen; zoek niet stilzwijgend in privéfoto's of andere accounts.

Label per recept: juiste kandidaat, porties, volledige regels/secties, letterlijke hoeveelheden, eenheden/basis, canoniek ingrediënt, relevante aankoopvorm en een verzameling aanvaardbare productmatches. Verschillende merken kunnen even correct zijn. Label vervangingen apart en markeer of een geschikte kandidaat beschikbaar is in de gemeten Picnic-context.

Neem lastige gevallen op: breuken, 1 × 350 g pot, ½ blik, eetlepels, US/metric cups, knoflookteentjes, bot/vel, uitlekgewicht, vers/gedroogd, puree/passata/blokjes, marinade+dressing, meerdere recepten, twee kolommen, afgesneden foto's, schaduw/onscherpte en ingredienten in stappen. Handgeschreven/niche/onleesbare bronnen blijven een afzonderlijke vooraf beschreven uitdagingenset.

Controleer kritieke labels onafhankelijk; leg onenigheid vast en adjudiceer. Synthetische regressies blijven nuttig, maar tellen niet als echte receptproef.

## 3. Markt- en techniekvergelijking

Gebruik actuele primaire bronnen. Productmarketing is geen onafhankelijk accuracybewijs. Maak een korte vergelijking van dekking, bewijsbaarheid, NL/EN, runtime, privacy, onderhoud, kosten en integratiecomplexiteit.

Vergelijk maximaal drie zinvolle end-to-end routes na een kleine screening:

1. Huidige keten als onveranderde baseline.
2. Hybride route: gestructureerde webextractie of OCR met layout, deterministische getal-/eenheidsparser, gerichte modelinterpretatie voor ambiguïteit.
3. Multimodale route met betere evidence/validatie en selectieve inzet van een sterker model op moeilijke gevallen.

Onderzoek afzonderlijk kandidaatophaling versus productbeoordeling: tweetalige aliassen, lexicale zoekvarianten en eventueel semantisch zoeken voor kandidaten; harde productvoorwaarden plus een reranker/Decisions voor geschiktheid. Semantische gelijkenis is geen bewijs dat verse tomaat en tomatenpuree uitwisselbaar zijn.

Startbronnen, gecontroleerd op 9 oktober 2026:

- [recipe-scrapers](https://docs.recipe-scrapers.com/): structured markup en siteparsers; onderzoek fixtures/licentie en mogelijke herbruikbare aanpak. Python is geen automatische keuze voor Workers.
- [Ingredient Parser](https://ingredient-parser.readthedocs.io/en/latest/): kandidaat voor ontleding van ingrediëntregels; taalbereik en toepasselijkheid zelfstandig toetsen.
- [Google Document AI OCR](https://docs.cloud.google.com/document-ai/docs/enterprise-document-ocr): tekst/layout, beeldkwaliteit en rotatie; vergelijken met directe vision en een open-source OCR-kandidaat. Geen nieuwe clouddienst zonder noodzakelijkheid en toestemming.
- [Samsung Food foto-import](https://samsungfood.com/add-from-photo-howto/): productreferentie voor scan/correctie. De leverancier noemt zelf mogelijke fouten; geen claim van perfecte herkenning of kennis van hun interne architectuur.
- Actuele officiële documentatie voor de bestaande OpenAI-route, Decisions en maximaal één andere relevante modelroute; verifieer toegang, schema, vision, prijs en regio op het moment van onderzoek.
- FoodOn/Open Food Facts alleen onderzoeken voor aantoonbaar nuttige terminologie/productkennis, met licentie en dekking; geen grote dataset overnemen zonder onderbouwde meerwaarde.

Geen hele markt inventariseren als drie routes de beslisvraag kunnen beantwoorden. Geen training/fine-tuning als eerste antwoord; eerst vaststellen of fouten door data, retrieval, parsing of modelinterpretatie ontstaan.

## 4. Metingen en voorgestelde kwaliteitsdoelen

Onderstaande doelen zijn ambitie en worden vóór experimenten aangescherpt met de eigenaar; geen bestaande garanties.

| Maatstaf | Meetwijze / richting |
| --- | --- |
| Receptselectie | Juiste kandidaat bij enkelvoudige bron; correcte keuzevraag bij meerdere recepten |
| Ingrediëntvolledigheid | Recall en precision, inclusief ontbrekende/verzonnen/dubbele regels |
| Kritieke velden | Getal, eenheid, basis, porties en variant afzonderlijk én gezamenlijk correct |
| Productkandidaten | Recall@k: zit een aanvaardbaar product überhaupt in de kandidaten? |
| Automatische matches | Precision, dekking en onthouding afzonderlijk; nul kritieke verkeerde productsoorten/strijdige varianten in de regressieset |
| Hele recept correct | Alle noodzakelijke ingrediënten en aankoopaantallen juist; rapporteren naast regelscores |
| Gebruikerswerk | Aantal noodzakelijke correcties, extra vragen en tijd tot bruikbaar voorstel |
| Kosten/snelheid | Werkelijke kosten en requests per bron, p50/p95; koude/warme cache apart |
| Onzekerheid | Fouten tussen automatisch geaccepteerde gevallen en bruikbaarheid van correcties |

Streef voor goed leesbare alledaagse bronnen naar minstens 95% recepten met een bruikbaar volledig voorstel zonder inhoudelijke correctie; expliciete keuze wegens werkelijk ontbrekende assortimentproducten apart rapporteren. Streef naar minstens 99% juiste automatische productbeoordelingen, met kritieke fouten apart en strenger. Verbeter dekking niet door onzekerheden stilzwijgend geschikt te noemen.

Een hoge regelscore is onvoldoende: bij 99% correctheid per regel is de kans op vijftien correcte regels ongeveer 86% als fouten onafhankelijk zijn. Meet daarom hele recepten werkelijk; ga niet uit van onafhankelijkheid.

Rapporteer aantallen, denominatoren, onzekerheidsintervallen en splits per bron/taal/moeilijkheid. Veertig testrecepten bewijzen geen betrouwbaarheid van 99,9%. Breid voor sterkere claims uit naar enkele honderden onafhankelijke cases en gerichte kritieke gevallen. Een ontbrekend product, onleesbare foto of unsupported URL telt mee in de gebruikservaring, met afzonderlijke oorzaak.

## 5. Beperkte experimenten

Voer eerst bron/documentatieonderzoek, codeaudit, labelwerk en offline baseline uit. Screening op circa 15 ontwikkelcases; daarna hoogstens twee uitdagers op exact dezelfde cases. Bepaal vooraf een kostenplafond voor het complete onderzoek en reserveer ruimte binnen €15 app/maand en €5 gebruiker/maand voor de eigenaar die ondertussen test. Geen betaald experiment zonder concreet proefbudget; voorbereiding hoeft daarop niet te wachten.

Leg bronhash, datasetversie, model/prompt/parserversie, parameters, kosten en uitkomst vast. Caches mogen verschillen niet verbergen. De testset blijft gesloten tot keuzes zijn vastgelegd; na tuning op testfouten is een nieuwe onafhankelijke set nodig.

Selectieve tweede controle is een hypothese: probeer alleen moeilijke/tegenstrijdige gevallen opnieuw met een andere methode, meet gemiste fouten en kosten. Twee modelantwoorden zijn geen onafhankelijke waarheid. Geen onbeperkte retries en geen replay van onbekende betaalde verzoeken.

Productdata via bestaande toegestane, begrensde leesroutes en gebruikerscontext; geen volledige crawl. Alle aankoopproeven met mocks. Geen mandmutaties voor dit onderzoek.

## 6. Advies en uitvoerbare backlog

Lever op:

- docs/PERFECT-MATCH-AUDIT.md: feitelijke audit, bewijs, marktvergelijking en grenzen.
- docs/PERFECT-MATCH-BENCHMARK.md: dataset/splits, scores, fouten, kosten en latency; geen privébroninhoud in openbare Git.
- Een lokale herhaalbare evaluatieharness en gesaneerde/licentiegeschikte fixtures; gevoelige referenties buiten Git.
- Geprioriteerde implementatiebacklog met per verbetering verwacht effect, complexiteit, bewijs, regressietest en terugvalroute.
- Een gemotiveerde beslissing: huidige modelroute verbeteren, hybride extractie inzetten of selectief andere modellen gebruiken. ‘Meer AI’ is geen doel op zichzelf.

Volgorde voor implementatieadvies: grootste foutbron oplossen → gangbare dekking verhogen → correcties vereenvoudigen → snelheid/kosten verbeteren → nieuwe bronnen toevoegen. Maak een eerste kleine verticale verbetering concreet; geen volledige architectuurverbouwing als standaarduitkomst.

## Uitvoering in nieuwe sessie

De eigenaar test ondertussen zelf op https://picnic.devstef.nl. Verander productie niet tijdens dit onderzoek. Nodig Anemoon niet uit; daarvoor komt later nieuw akkoord. Bewaar alle bestaande wijzigingen en gegevens. Geen secrets tonen/kopiëren, accounts uitvragen of historische uien-/tomatenacties herhalen. Actuele productieversie bij deze overdracht: 30caa950-2791-43b5-bd72-fdfd7bb4f9be.

Token-efficiënte verdeling als parallel agentwerk wordt gevraagd: één agent bronextractie/OCR, één ingrediënten/hoeveelheden, één productretrieval/matching. Hoofdagent bewaakt dataset, metingen, budget en geïntegreerd advies. Deel één manifest en gebruik compacte conclusies; voorkom overlappende brede zoekrondes.

Startopdracht om te kopiëren:

> Lees docs/PERFECT-MATCH-ONDERZOEKSPLAN.md en voer het onderzoek uit als onafhankelijke software-auditor. Begin met codeaudit, een feitelijke baseline en actuele primaire marktbronnen. Werk met drie afgebakende subagents voor bronextractie, ingrediënten/hoeveelheden en productmatching; houd één gezamenlijke benchmark en rapporteer token-efficiënt. Bouw de offline evaluatie en lever audit, benchmark en geprioriteerde implementatiebacklog op. De eigenaar test intussen de online app: geen productieaanpassingen, uitnodigingen, mandmutaties of nieuwe diensten. Stel een concreet klein proefbudget vast voordat betaalde vergelijkingen worden uitgevoerd; ga ondertussen verder met onafhankelijk voorbereidend werk. Bewaar alle lokale wijzigingen en gegevens en lees de nieuwste overdracht voordat je handelt.

## Aanvulling eigenaarstest en snelheidsvoorwaarde — 9 oktober 2026

De eigenaar verlangt maximaal 30 seconden vanaf aanvraag tot een volledig bruikbaar boodschappenvoorstel. Snelheid is een productvoorwaarde naast kwaliteit; meet de gezamenlijke uitkomst en geef aanpak van vastlopers/kritieke keten prioriteit boven nieuwe brondekking. De gemelde test bleef minuten op “Je recept is herkend”; dat bewijst nog geen trage Picnic-call. Productie blijft tijdens het onderzoek ongemoeid. Maximaal €1 totaal proefbudget voor latere modelvergelijkingen is door de eigenaar goedgekeurd, binnen bestaande maandlimieten; geen nieuwe diensten. Zie PERFECT-MATCH-AUDIT.md, PERFECT-MATCH-BENCHMARK.md en PERFECT-MATCH-BACKLOG.md voor de lokale resultaten en resterende bewijsstappen.
