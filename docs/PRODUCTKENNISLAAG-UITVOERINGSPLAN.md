# Productkennislaag voor betrouwbare en snelle Picnic-matches

Datum: 9 oktober 2026. Status: uitvoeringsplan voor een nieuwe sessie; geen nieuwe scan, betaalde analyse of deployment gestart door het schrijven van dit document.

## 1. Opdracht en gewenste uitkomst

Bouw de bestaande catalogusopslag uit tot een herbruikbare productkennislaag. Analyseer productinhoud buiten de interactieve receptflow. Zoek tijdens het samenstellen van boodschappen lokaal op betekenis, beoordeel vereiste productvormen en bereken aankoopaantallen deterministisch. Controleer commerciële gegevens voor de gekoppelde Picnic-klant afzonderlijk.

De eigenaar verlangt maximaal 30 seconden van submit tot een bruikbaar boodschappenvoorstel, inclusief fotoverwerking, upload, bronherkenning, opslaan, retrieval, beoordeling en rendering. Een snelle fout of een lijst zonder noodzakelijke producten voldoet niet. Het kwaliteitsdoel blijft minstens 95% van goed leesbare, gangbare recepten zonder inhoudelijke correctie naar een volledig bruikbaar voorstel. Dit is een te toetsen doel, geen bestaande garantie.

De nieuwe sessie moet implementeren en meten, niet uitsluitend een nieuw advies opleveren. Werk in kleine verticale stappen. Lever eerst aantoonbare verbetering op de bestaande recepten; daarna gecontroleerde uitbreiding van categorieën en onafhankelijke evaluatie.

## 2. Feitelijke uitgangssituatie

De werkboom bevat veel bestaande wijzigingen en ongetrackte bestanden. Bewaar die allemaal. Ga niet uit van een schone checkout of van documenten als bewijs dat functionaliteit al bestaat: controleer code en tests.

Aanwezig:

- `worker/catalog/index.ts`: product/detailopslag, inhoudelijke en commerciële fingerprints, lokale retrieval. De huidige retrieval en opslag hebben grenzen; controleer truncatie, geldigheid en zoekgedrag voordat deze als complete index worden gebruikt.
- `worker/catalog/sync.ts`, `maintenance.ts`, `diagnostics.ts`, `current.ts`: bestaande bouwstenen voor onderhoud en actuele controle; audit hun daadwerkelijke bereik en aansluiting op queues/scheduling.
- `worker/matching/assessment.ts`: contextgebonden opgeslagen ingrediënt-productrelaties, regels en optionele Decisions-route.
- `worker/matching/decisions.ts` en `worker/adapters/decisions.ts`: kosten- en dedupbouwstenen. Decisions staat uit; inschakelen is geen voorwaarde voor de eerste verbetering.
- `shared/ingredient-knowledge.ts`: beperkte NL/EN-profielen. De laatste wijzigingen lossen concrete voorbeelden op, maar zijn geen algemene productontologie.
- `shared/spoons.ts`: exacte lepelmaten uit bronregels. Gramconversies blijven aparte, zichtbaar geschatte ingredientafhankelijke berekeningen.
- `worker/domain/shopping.ts`: groepering, variantcontrole, beoordeling, verpakkingsberekening en ranking.
- `worker/routes/shopping.ts`: maximaal drie groepen tegelijk, begrensde detailreads, gedeelde deadline en productcontrole.
- Migraties `0014_catalog.sql`, `0015_match_attempts.sql`, `0016_product_relations.sql`, `0017_import_workflow_deadline.sql`.
- Bronextractie via gestructureerde data, conservatieve parser en compacte modelinterpretatie; fotoherkenning gebruikt nog een modelroute.

Laatste lokale bewijs:

- Foto met chia-pudding voor vier personen: negen bronregels, acht productgroepen. Na reparaties zes producten automatisch gekozen, zout uit als keukenkastproduct, vanillepasta zonder automatische match. Voorstel geobserveerd na 11,12 seconden vanaf submit. Dit is één lokale run met eerder opgebouwde productcache, geen koude-cache p95 of volledig correct recept.
- Kokosyoghurt met marketingnaam Coco Start wordt via expliciete productomschrijving bevestigd; een 350g-verpakking wordt gekozen zonder gram/milliliter gelijk te stellen.
- Honing: twee regels, samen 3½ tbsp; geschat 73½g. Bronregels behouden.
- Culy: dertien gekozen producten na reparaties; sherryazijn, kaneelpoeder en verse oregano nog zonder automatische keuze. Beschikbaarheid respectievelijk vormbewijs ontbreken in de bekeken resultaten.
- De bron noemt `(rode) rijst`; huidige code behandelt dat als optionele variant. Het eerdere verslag noemde witte rijst te stellig fout. Bepaal de bronbetekenis vóór een nieuw oordeel.
- Volledige suite met 370 tests geslaagd; daarna twee aanvullende variant/wijntests en gerichte suites geslaagd. Verifieer de actuele aantallen zelf. Worker/frontendtypechecks en build geslaagd.
- Kostenadministratie registreert voor alle eerdere praktijkproeven samen €0,04. Het goedgekeurde totale proefbudget is €1, binnen bestaande maandlimieten van €15 app en €5 gebruiker. €0,96 is alleen de nominale resterende onderzoeksruimte; controleer ledger en andere uitgaven vóór betaalde proeven.

Bronnen: `30-SECONDEN-LOKALE-PROEF.md`, `30-SECONDEN-IMPLEMENTATIE.md`, `PERFECT-MATCH-AUDIT.md`. Tijdelijke referenties en screenshots staan buiten Git in `/private/tmp/picnic-perfect-match-real-20261009/`; controleer bestaan. Backup/herstelproef van de lokale gebruikersdatabase staat in `/private/tmp/picnic-latency-backup-20261009/`. De lokale database is tot en met 0017 gemigreerd. Productie is tijdens dit werk niet aangepast; verifieer actuele versies zonder ze uit oude documenten te raden.

## 3. Productmodel: feiten, interpretatie en beoordeling

Maak onderscheid tussen drie soorten gegevens.

### A. Bronfeiten

SKU/verkoop-ID, markt en accountcontext, naam, merk, categoriepad voor zover waargenomen, omschrijving, oorspronkelijke verpakkingstekst, getypeerde netto-/uitlekhoeveelheid, ingrediënten, aparte allergenengroepen en aantoonbare productkenmerken. Bewaar route, controletijd, parser-versie en fingerprint. Ontbrekende gegevens blijven onbekend.

### B. Herbruikbare productinterpretatie

Bijvoorbeeld `productKind=coconut_yoghurt`, `form=fermented`, `flavour=plain`, `storage=unknown`. Definieer een kleine, uitbreidbare taxonomie met stabiele IDs. Gebruik expliciete waarden voor onbekend en conflict. Een product mag meerdere functies hebben, maar een ingrediënt in een samenstelling bewijst niet dat het product zelf die ingrediëntsoort is.

Bewaar per geïnterpreteerd veld: waarde, methode (`source_field`, `rule`, `model`, `human`), relevante brontekst/veldpad, versie en controlebeleid. Een modelscore is geen geijkte kans op correctheid. Conflicten en ontbrekend bewijs blokkeren automatische toepassing waar de eigenschap essentieel is.

### C. Relatie met een receptvereiste

Een product kan passend zijn voor het ene recept en ongeschikt voor het andere. De relatie bevat ingrediëntsoort, verplichte vorm/variant/merk, productinhoudsfingerprint en oordeel: exact passend, expliciete vervanging, ongeschikt of onzeker. Afwezigheid van een kandidaat is een retrievaluitkomst, geen bewijs van ongeschiktheid of assortimentafwezigheid.

Voorbeelden:

| Receptvereiste | Productbewijs | Oordeel |
| --- | --- | --- |
| Verse mango, twee stuks | Verse mango, één stuk | Passend; twee verpakkingen |
| Verse mango | Mangonectar of gedroogde mango | Geen automatische match |
| Kokosyoghurt, 350g | Gefermenteerd kokosmelkproduct naturel, 350g | Passend |
| Kokosyoghurt, 350g | Kokosyoghurt, 400ml | Soort passend; aantallen niet zonder dichtheidsbewijs berekenen |
| Vanillepasta | Vanille-extract | Expliciete vervanging; geen stille selectie |
| Kaneelpoeder | Alleen naam Kaneel | Nog onzeker als de poedervorm nergens wordt bewezen |
| Verse oregano | Alleen onduidelijke marketingnaam | Eerst detail-/categorie-/ander bronbewijs |

Gebruik bronbewijs om deze laatste twee problemen op te lossen; verzin geen vorm omdat die waarschijnlijk is.

## 4. Architectuur

Achtergrondpad:

`waargenomen categorieën/zoekresultaten → productfeiten → normalisatie → productinterpretatie → index en gecontroleerde relaties`

Interactief pad:

`bronherkenning → getypeerde receptvereisten → lokale kandidaten → bewijscontrole → berekening/ranking → beperkte actuele Picnic-controle → voorstel`

Vereisten:

- Productkennis is herbruikbaar tussen recepten binnen de toegestane context. Geen volledige productanalyse per ingrediënt tijdens elke import.
- Nederlandse/Engelse synoniemen horen bij de ingrediënttaxonomie; merknamen en marketingnamen horen bij productinterpretatie.
- Kandidaten ophalen en kandidaten beoordelen zijn afzonderlijke modules. Meet hun fouten afzonderlijk.
- SQL-/tekstindex eerst. Embeddings alleen toevoegen als een vergelijking aantoonbaar recall verbetert; embeddings mogen geen geschiktheid of verpakkingsaantal bewijzen.
- Hergebruik D1, queues en bestaande diensten. Geen nieuwe leverancier of vectordatabase in de eerste implementatie.
- Maak bulkreads/bulkwrites mogelijk; voorkom een D1-rondreis per kandidaat waar één query voldoende is.
- Eén beperkte batchcontrole kan nieuwe onzekere gevallen beoordelen als het tijd- en kostenbudget dat toelaat. Geen modelketen per product. Onzeker blijven is toegestaan en moet begrijpelijk zichtbaar zijn.

## 5. Catalogusdekking: groeien zonder onbewezen volledigheid

De gebruikte Picnic-wrapper is onofficieel. Categorie-, zoek- en detailroutes zijn bouwstenen, geen bewezen export van het gehele assortiment. Controleer actuele primaire wrapperbronnen en geïnstalleerde versie. Volg uitsluitend daadwerkelijk waargenomen, toegestane leesverwijzingen. Bewijs paginering, vervolgacties en Fusion/RSC-verwerking met fixtures.

Begin met een begrensde pilot van maximaal 50 unieke producten en maximaal 75 Picnic-leesrequests in één sessie; tel alle pagina-, zoek-, detail- en retryrequests mee. Eén achtergrondrequest tegelijk, configureerbare vertraging, totale request-/tijdlimiet, checkpoints en stopknop. Dit is een conservatieve interne proefgrens, geen door Picnic gepubliceerde limiet. Verlaag bij vertraging/fouten; respecteer Retry-After en stop op authenticatiefouten of herhaalde 429/5xx. Geen brede volledige crawl in deze opdracht.

Prioriteitscategorieën: fruit, zuivel/plantaardige yoghurt, bakproducten, kruiden, olie/azijn en basisgranen. Gebruik bestaande waarnemingen eerst; de eerste verbetering behoeft geen nieuwe scan.

Rapporteer per scan: context, categorieën/links gezien, pagina's verwerkt, vervolgladingen onopgelost, unieke verkoop-ID's, detaildekking, velddekking, fouten en getrunceerde lijsten. Onbekende dekking blijft onbekend. Een product dat vandaag niet in een zoeklijst staat, wordt niet automatisch verwijderd.

Na een bewezen pilot: leg een concreet requestbudget en onderhoudsschema voor uitbreiding voor. De eigenaar kan later een grotere assortimentsinventarisatie autoriseren. Een officiële datafeed of samenwerking is een mogelijke latere vervanging van de wrapper, geen eerste bouwafhankelijkheid.

## 6. Gegevensopslag en verversing

Breid bestaande tabellen uit in nieuwe migraties na het hoogste werkelijk aanwezige nummer. Geen parallelle vervangende database ontwerpen zonder noodzaak.

Minimaal nodig:

- Productinterpretaties gekoppeld aan context, SKU, contentfingerprint, schema-/regel-/modelversie, status, veldbewijs en beoordeeltijd.
- Zoekindex met productsoort, synoniemen en bewezen vormen; indexeert ook marketingnamen maar verwart die niet met bewijs.
- Scanruns/paginataken met bereik, checkpoints, leases, aantallen en stop-/foutstatus.
- Analysepogingen met unieke inputhash, status, reservering, usage en onbekende uitkomsten; hergebruik bestaande kostenmechanismen waar passend.

Inhoudswijziging invalideert productinterpretatie en relaties. Prijswijziging vernieuwt commerciële waarneming en ranking, niet automatisch de inhoudsanalyse. Verpakking beïnvloedt de berekening en soms het inhoudsbewijs. Analyseer alleen gewijzigde inhoud opnieuw. Bewaar productfeiten en commerciële context zodanig dat een reconnect, gewijzigde generatie of accountverwijdering geen oude bevoegdheid laat doorwerken.

Algemene productinformatie blijft aanvankelijk account-/marktgebonden zoals nu. Een gedeelde index tussen gebruikers vereist later aantoonbare contextonafhankelijkheid en een expliciete ontwerpkeuze. Logs bevatten geen tokens, credentials, complete recepten of analyticsdump. Neem nieuwe tabellen op in retentie en accountverwijdering.

Voor lokale migraties: consistente SQLite-backup inclusief WAL, herstelcontrole op een kopie, recordaantallen/integriteit vóór en na. De bestaande backup is bewijs van toen, geen automatische backup voor nieuwe wijzigingen.

## 7. Analysebeleid en kosten

Analyseer eerst met bronvelden en deterministische regels. Modellen vullen ontbrekende semantiek aan, niet de berekeningen. Verstuur alleen de minimale relevante productgegevens, geen gebruikersprofiel, credentials of volledige apppagina.

Vraag getypeerde velden plus bronbewijs. Controleer schema, enums, bronkoppeling en tegenstrijdigheden. Behoud harde uitsluitingen. Een model mag geen mandactie starten. Controleer eventuele Decisions-API tegen actuele officiële documentatie en bestaande toegang voordat je die kiest; neem beschikbaarheid of pricing niet aan. Een gewone gestructureerde Responses-route is een mogelijke vergelijkingsoptie, geen verplichting.

Betaalde proeven blijven binnen het bestaande totale €1-akkoord en actuele maandruimte. Begin bijvoorbeeld met maximaal tien onzekere producten en een afzonderlijke reservering van maximaal €0,10, mits de ledger ruimte toont. Meld de werkelijk geregistreerde kosten; ronde reservaties zijn niet hetzelfde als providerfactuur. Geen onbeperkte retries. Na een verzonden maar onbekende uitkomst: unknown bewaren, geen automatische replay. Offline voorbereiding gaat door als betaling/configuratie ontbreekt.

## 8. Implementatiefasen en acceptatiecriteria

### Fase 0 — Audit en baseline

Lees genoemde bestanden en toepasselijke AGENTS.md. Inspecteer gitstatus, bestaande queues, taxonomie, detailparser en ledger. Leg vast welke catalogusbouwen werkelijk draaien. Gebruik opgeslagen foto- en Culy-imports voor matching; herken ze niet opnieuw met een model tenzij bronherkenning zelf gewijzigd is.

Opleveren: compact baselinemanifest met bronhash, context, versies, kandidaten, selectie, ontbrekende velden, requests, kosten en latency. Geen historische mandacties herhalen.

### Fase 1 — Productfeiten naar getypeerde kennis

Ontwerp klein schema en implementeer deterministische analyse met veldbewijs. Sluit bestaande cataloguswaarnemingen aan; publiceer geen complete bronpagina's. Migreer veilig.

Acceptatie: Coco Start herkend zonder SKU/merk-hardcoding; sap/nectar/gedroogd blijven onderscheiden van verse mango; vanille-extract wordt geen pasta; melk-/yoghurtvarianten en gram/ml blijven afzonderlijk; gewijzigde inhoud maakt kennis ongeldig. Laat onvoldoende bewezen vormen onzeker.

### Fase 2 — Retrieval en matching aansluiten

Laat shopping lokale semantische kandidaten ophalen. Combineer met begrensde Picnic-fallback voor ontbrekende dekking. Bewaak bronvereisten en exposeer redenen voor exact passend, vervanging en onzeker. Hergebruik dezelfde beoordeling bij voorstel en bevestiging.

Acceptatie: foto kiest alle bewezen beschikbare exacte producten met juiste aantallen; één onbekend ingrediënt blokkeert de rest niet. Geen smaakproducten als hoofdingrediënt. Een product buiten de eerste zoeklijst kan via de index alsnog gevonden worden. Verpakkingen worden na samenvoegen afgerond. Geen per-kandidaat betaalde keten.

### Fase 3 — Achtergrondverrijking en beperkte ontdekking

Maak hervatbare onderhoudstaken op bestaande infrastructuur. Eerst on-demand waarnemingen verrijken; daarna de begrensde categoriepilot. Analyseer alleen nieuwe of gewijzigde inhoud. Controleer account/koppeling/generatie bij claim en vóór opslag/vervolgwerk.

Acceptatie: checkpoints, leaseherstel, disconnect-stop, geen duplicate betaalde analyse, requestbudget afgedwongen, paginaverwijzingen gecontroleerd en dekking expliciet gerapporteerd. Interactieve imports wachten niet op een scan.

### Fase 4 — Selectieve modelvergelijking

Alleen als fasen 1–3 nog relevante semantische gaten laten. Label lastige producten onafhankelijk, vergelijk regels met hoogstens twee beschikbare methoden op dezelfde cases. Test verschillen zoals poeder/stokjes, verse kruiden, gefermenteerde yoghurt, extract/pasta en smaakdrank/fruit.

Acceptatie: meet extra correcte dekking, verkeerde automatische goedkeuringen, abstention, kosten en latency. Kies modelinzet alleen bij aantoonbare winst. Een tweede model is geen onafhankelijke waarheid. Geen configswitch naar productie.

### Fase 5 — Benchmark en lokale browserproef

Gebruik echte referenties met gescheiden ontwikkel-/testset, verschillende talen, bronnen en vormen. Begin met 15 ontwikkelcases; sluit vóór tuning een afzonderlijke testset. Streef vervolgens naar minstens 100 echte recepten. Leg per product meerdere aanvaardbare keuzes en aantallen vast waar terecht.

Voer de bestaande evaluator uit waar het schema past. Breid haar expliciet uit voor lepelmaten, ranges of andere nu niet ondersteunde labels; vervang die niet door verzonnen exacte grammen. Leg correcties en bron-/productfouten apart vast. Browserproef via normale ingelogde app; geen authbypass. Bewaar bewijs buiten Git.

Acceptatie: volledig voorstel binnen 30s gemeten vanaf submit, koude/warme productcache apart, geen verborgen handmatige voorbereiding als automatische winst. Ontbrekende producten worden alleen als werkelijk afwezig gelabeld met voldoende onafhankelijk assortimentbewijs. Onduidelijke dekking blijft een falende/onzekere gebruikservaring.

### Fase 6 — Reviewbaar vrijgavepakket

Lever migraties, rollback-/compatibiliteitsnotities, tests, gesaneerde evaluatie, request-/kostenlimieten en resterende risico's op. Productie blijft tijdens de nieuwe sessie ongewijzigd. Deployment is een afzonderlijke opdracht. Geen volledige 95%-claim als de testset dat niet ondersteunt.

## 9. Metingen en beslisregels

| Maatstaf | Vereiste rapportage |
| --- | --- |
| Catalogusdekking | Geobserveerd bereik, onopgeloste pagina's, product-/detail-/velddekking; geen onbekende totale denominator verzinnen |
| Retrieval | Recall@5/@10 en welk aanvaardbaar product ontbreekt, per soort/vorm |
| Automatische beoordeling | Precision, coverage en abstention afzonderlijk; kritieke vorm-/dieetconflicten apart |
| Volledig recept | Alle noodzakelijke bronregels, juiste variant en aantallen, geen correctie |
| Correct binnen 30s | Gezamenlijke maat; timeout, onvolledig resultaat en handmatige correctie tellen niet als succes |
| Interactie | Correcties, extra vragen en tijd tot werkelijk bruikbaar voorstel |
| Prestaties | p50/p95 en maximum, koude/warme cache, fasetijden, Picnic-/model-/D1-aantallen |
| Kosten | Reservering, settled/unknown, werkelijke usage en cumulatief proefbudget |

Richting: minstens 99% juiste automatische productbeoordelingen en minstens 95% hele recepten correct zonder inhoudelijke correctie, met nul kritieke regressies in de gerichte tests. Vermeld aantallen, denominatoren en onzekerheidsintervallen; kleine datasets bewijzen geen hoge betrouwbaarheid. Meet UX inclusief werkelijk ontbrekende producten en rapporteer die afzonderlijk, zonder ze stilzwijgend uit het totaal te schrappen.

## 10. Opleveringen en werkgrenzen

Opleveren:

1. Werkende lokale productkennislaag en integratie in shopping.
2. Compacte taxonomie-/schema-/modulebeschrijving met beslissingen en bronbewijsbeleid.
3. Nieuwe migraties, consistente backup/herstelbewijs en retentie-aanpassingen.
4. Betekenisvolle regressietests en passende typecheck/build/migratiechecks.
5. Herhaalbare baseline/herproef, gesaneerd resultatenrapport en datasetmanifest.
6. Begrensde onderhoudsroute met dekking-/requestrapport, indien de pilot daadwerkelijk is uitgevoerd.
7. Concrete resterende backlog en releasepakket, met eerlijke status van het 30s/95%-doel.

Niet doen: productie wijzigen, uitnodigingen versturen, mandje muteren, accounts uitvragen, secrets tonen/kopiëren, historische uien-/tomatenacties herhalen, alle producten ongecontroleerd crawlen of nieuwe diensten aanschaffen. Deze grenzen verhinderen normale lokale implementatie, offline analyse, tests en geautoriseerde begrensde leesproeven niet. Vraag alleen ontbrekende informatie die werkelijk blokkeert; gebruik bestaande autorisatie en ga autonoom door met onafhankelijk werk.
