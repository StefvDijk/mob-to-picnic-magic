# Lokale implementatie en verificatie

Afgerond op 9 oktober 2026, volgens `RECEPT-NAAR-MANDJE-PLAN.md`. De gebruiker heeft daarna op 9 oktober expliciet toestemming gegeven voor de hieronder genoemde mandjesproef en gevraagd in een nieuwe sessie verder te gaan. De proef is uitgevoerd en geslaagd; zie de aanvulling hieronder.

## Gebouwde flow

- URL of afbeelding en gewenst aantal personen → **Zoek mijn boodschappen** → automatisch opgeslagen recept en één boodschappenlijst. Alleen bij meerdere recepten of ontbrekende oorspronkelijke porties is aanvullende invoer nodig.
- Ingrediënten blijven aan hun bronregels gekoppeld. Dubbele ingrediënten worden vóór het afronden op verpakkingen opgeteld. Omrekeningen en schattingen zijn zichtbaar; onbekende hoeveelheden krijgen geen verzonnen standaardhoeveelheid.
- Passende producten worden vergeleken op de totale prijs van voldoende verpakkingen, inclusief aantoonbare prijsstaffels. Aantallen en productkeuze zijn aanpasbaar. Alternatieven die een vervanging zijn vereisen een expliciete keuze.
- Zout, zwarte peper en gewone bakolie blijven zichtbaar en staan standaard uit. Persoonlijke productvoorkeuren worden uitsluitend na expliciete opt-in opgeslagen, per gebruiker.
- **Voeg N producten toe** gebruikt de bestaande toevoegroute met idempotente verzoeken en herstel na herladen. Verdwenen producten worden overgeslagen; andere regels kunnen doorgaan. Bij een onbekende uitkomst van een mutatie wordt niet automatisch opnieuw verzonden. Het bestaande mandje wordt niet geleegd of van de receptbehoefte afgetrokken.

## Technische overdracht

- Nieuwe routes: `POST /api/shopping/plan` en `POST /api/shopping/proposals` in `worker/routes/shopping.ts`.
- Berekeningen en matching: `worker/domain/shopping.ts`, `shared/ingredient-knowledge.ts` en `shared/product-pricing.ts`. De kleine Nederlandse kennisbank bevat versieerbare aliases, voorraadregels en expliciete keukeninschattingen.
- `migrations/0013_shopping_flow.sql` is uitsluitend lokaal toegepast. Deze voegt een cataloguscache, persoonlijke voorkeuren en idempotente winkelverzoeken toe. De cache is gebonden aan gebruiker en Picnic-verbinding; productgegevens worden vóór toevoeging opnieuw gecontroleerd.
- De Picnic-adapter verwerkt Nederlandse verpakkingseenheden, volledige prijsstaffels, beschikbaarheid en grotere zoekantwoorden met begrensde verwerking.
- `src/lib/shopping-choice.ts` bewaakt herstel van de selectie: een verdwenen expliciete keuze wordt niet stilzwijgend vervangen.
- Geen deployment, subagents of wijzigingen aan `src/services/picnicService.ts` tijdens deze uitvoering. SHA-1 vóór en na: `2fac3b7a1aaaecc3d8797c73f1b8b2bee27e97b2`. Alle reeds aanwezige wijzigingen zijn behouden.
- Voor de lokale migratie is een SQLite-back-up gemaakt: `/tmp/picnic-before-shopping-1791490255.sqlite`. De lokale database-integriteitscontrole gaf `ok`.

## Uitgevoerde controles

Geautomatiseerd, met gemockte Picnic-mutaties:

- Volledige suite: **175 tests in 27 bestanden geslaagd** via `npm run test:worker`.
- Na de laatste extractie van selectieherstel: **3 aanvullende tests geslaagd** via `npm run test:worker -- test/shopping-choice.test.ts`. Daarmee zijn 178 afzonderlijke tests uitgevoerd; de hele suite is na die extractie niet nogmaals gedraaid.
- Worker-typecheck, frontend-typecheck, productiebuild en `git diff --check` geslaagd na de laatste codewijziging.
- De tests dekken onder andere hoeveelheidsschaal, dubbele ingrediënten, verpakkingskosten, ongeschikte samengestelde producten, ontbrekende porties, gebruikersisolatie, opt-in, gelijktijdige verzoeken, gewijzigde prijzen, verdwenen producten en onzekere mutatie-uitkomsten.
- De build meldt verouderde Browserslist-data; dit blokkeert de build niet.

Echt uitgevoerd via de lokale app en bestaande providerkoppelingen:

- Het bestaande Culy-importresultaat `dbcd1d1c-a287-4dcc-8b41-9f97c2c2531e` is hergebruikt voor **Kip Marbella met rijst**. Hiervoor is geen nieuwe AI-import gestart.
- Een afbeelding met een synthetisch recept voor tomatensoep is via de afbeeldingsupload geïmporteerd met één geslaagde echte AI-aanroep. Import `91dd0b2f-f0df-48a2-97db-16da280c0142` is automatisch opgeslagen en leidde rechtstreeks tot de boodschappenlijst. Dit was een screenshot met recepttekst, geen camerafoto of fotokwaliteitsbenchmark.
- Echte Picnic-zoekresultaten zijn via de normale app-flow bekeken. Daarbij gevonden foutmatches, waaronder paneermix voor knoflook, yoghurt voor pistache en blikproducten voor verse tomaten, zijn aangescherpt en van regressietests voorzien.
- In de browser zijn productwissel zonder opt-in, aantallen wijzigen, voorraad aan- en uitvinken, deselectie en herstel na herladen gecontroleerd.
- De lijst is visueel gecontroleerd op desktop en op 390 × 844 pixels: op mobiel stapelen de kolommen zonder horizontale overflow.

## Grenzen en oorspronkelijke proefselectie (historisch)

- De matcher gebruikt de lokale regels en echte Picnic-resultaten. Jev is niet geïntegreerd of op betaalde kwaliteit getest; daarvoor is geen toegang vastgesteld.
- Sommige ingrediënten blijven terecht zonder automatische keuze wanneer geschiktheid of productvorm onvoldoende vaststaat, zoals sherryazijn, verse oregano en water in de gebruikte voorbeelden. De interface toont dit expliciet.
- Bij de oorspronkelijke bouwsessie was nog niets toegevoegd. Op 9 oktober is de echte provider-mutatie eenmalig uitgevoerd en gecontroleerd; zie de aanvulling hieronder.
- Bij de oorspronkelijke overdracht stond voor de afgesproken kleine proef alleen **1 verpakking Gele uien, 3 stuks, € 0,80** geselecteerd. De gebruiker heeft op 9 oktober 2026 hiervoor expliciet toestemming gegeven met “ja mag”. Controleer bij hervatting de selectie, actuele prijs en eventuele bestaande actie. Vraag voor deze selectie geen herhaalde toestemming. Andere producten of een hogere prijs vallen buiten dit akkoord. Voeg uitsluitend deze selectie toe en controleer daarna de gerapporteerde uitkomst. Dit is geen bestelling of betaling.

## Oorspronkelijke overdracht vóór de proef (historisch)

- Volg `VOLGENDE-SESSIE-PROMPT.md`. Code en documentatie staan lokaal op schijf; er is geen commit of push gemaakt. De vele gewijzigde en nieuwe bestanden omvatten eerder werk van de gebruiker en deze implementatie. Reset, clean of overschrijf die niet.
- De app was bereikbaar op `http://localhost:5173/`, met de lokale Worker op poort 8787. Controleer of beide nog draaien na het sluiten van de laptop. Start zo nodig de bestaande lokale scripts zonder browseropslag of database te wissen.
- De laatste selectie stond in **Testrecept: tomatensoep**: alleen 1 verpakking Gele uien; tomaten en voorraad uit, water zonder match. Inspecteer de huidige toestand opnieuw vóór toevoegen.
- Gebruik normale app-routes en de browser. Een eerdere directe diagnose die opgeslagen Picnic-credentials buiten de app zou ontsleutelen is door automatische goedkeuringscontrole afgewezen en niet uitgevoerd. Het probleem is via de normale app-flow opgelost; herhaal die credential-aanpak niet.
- Test bewezen gedrag niet telkens volledig opnieuw. Voer gerichte controles uit bij nieuwe wijzigingen of concrete fouten en werk dit verslag bij met de echte uitkomst van de proef.

## Echte mandjesproef — 9 oktober 2026

- Lokale frontend en Worker opnieuw gestart met de bestaande scripts; geen migratie, datareset, deployment of subagents.
- Vóór verzending: herstelde selectie uitsluitend **1 verpakking Gele uien, 3 stuks, € 0,80**; tomaten en zout uit, water zonder match. De lokale database bevatte **0 toevoegacties**. De normale Picnic-mandweergave bevatte **0 mandjeregels**.
- Eén klik op **Voeg 1 product toe**. Actie `e88f50b6-b701-4e75-81df-67c64e508826` eindigde als `succeeded`, met één uitvoeringsregel `added`, één verpakking en gecontroleerde snapshotprijs **80 cent**. Geen tweede verzending.
- Via de normale app-koppeling daadwerkelijk teruggelezen: **Gele uien, aantal 1, verpakking 3 stuks**. Er is niets besteld of betaald.
- De eerste mandweergave toonde onterecht de basisprijs € 0,89. Gerichte diagnose van uitsluitend prijs-/productvelden liet een Picnic `PRICE`-decorator met **80 cent** zien, naast basisprijs 89 cent. De adapter gebruikt nu die expliciete kortingsprijs als de orderregel ondubbelzinnig één artikel en één verpakking bevat. Bij meerdere of onbekende verpakkingen blijft de bestaande basisprijsweergave behouden; bredere kortingsberekening is niet bewezen.
- Picnic geeft voor deze mandjeregel analytisch `is_available: false` terug, terwijl het artikel `max_count: 50` heeft en de toevoeging is geaccepteerd. De app behoudt de providerwaarschuwing **niet beschikbaar**. Dit bewijst geen leverbaarheid of definitieve afrekenprijs.
- Na herstel en verversen toont het echte mandje **1 × Gele uien, 3 stuks, € 0,80**, met bovenstaande beschikbaarheidswaarschuwing. Bewijs: `/tmp/picnic-mandjesproef-2026-10-09.jpg`.
- Herladen herstelde rechtstreeks de geslaagde toevoegstatus. Geen nieuwe aankoopronde gestart; de opgeslagen actie blijft behouden om dubbele toevoeging te voorkomen.
- Regressietest reproduceerde eerst **expected 89 to be 80**. Daarna **11 gerichte adaptertests geslaagd**, inclusief bescherming bij meerdere/onbekende verpakkingen. Worker-typecheck en `git diff --check` geslaagd. Tijdelijke diagnose-instrumentatie verwijderd.
- `src/services/picnicService.ts` behouden; SHA-1 nog steeds `2fac3b7a1aaaecc3d8797c73f1b8b2bee27e97b2`.

De toestemming voor de eenmalige mandjesproef is hiermee verbruikt. **Deze proef niet opnieuw uitvoeren.** Eventuele volgende mandmutaties vereisen een nieuwe concrete opdracht. Resterend bewijs: echte camerafoto en Jev-toegang/integratie; hiervoor is geen nieuwe import of betaalde proef gestart.

## Catalogus en Decisions — uitvoering 9 oktober 2026

De uitbreiding is uitgevoerd met drie afgebakende subagents (catalogus, matching/interface, Decisions/budget) en gezamenlijke route-integratie. Het expliciete gebruikersverzoek voor subagents vervangt de oudere beperking in de gekopieerde startopdracht. Bestaande wijzigingen, inclusief `src/services/picnicService.ts`, zijn behouden. Geen deployment, betaalde modelproef of echte mandmutatie uitgevoerd.

### Kritische toets aan het appdoel

URL/foto → één recept → gecontroleerde boodschappen → één akkoord blijft de kern. De nieuwe index en beoordelingen zijn ondersteuning van die route. Een volledige categoriecatalogus, een geactiveerd Decisions-model en nieuwe productfamilies zijn geen voorwaarden voor die kern. Alleen geschikte producten worden automatisch geselecteerd; inhoudelijke vervangingen vergen expliciete keuze; ongeschikte en onbesliste producten zijn niet via algemeen akkoord te autoriseren. Bereidingsnotities moeten onderscheiden blijven van vereiste productvormen. Goedkoopste voldoende hoeveelheid blijft code; één SKU per ingrediëntgroep blijft de uitvoeringsroute.

### Gebouwd en geïntegreerd

- Migraties 0014–0016: private productindex, hervatbare catalogustaken, duurzame matchpogingen en versiegebonden ingrediënt-productrelaties. Eigenaar, koppeling en generatie begrenzen gegevens. Verwijdering volgt bestaande account-cascades; retentie verwijdert oude index/relaties en scrubt modelpayloads na veertien dagen met behoud van dedupsleutels.
- Zoeken schrijft waarnemingen naar de index en benut de bestaande zoekcache. Een gedeeltelijke index vervangt niet stilzwijgend een noodzakelijke live zoekactie. Details worden selectief en serieel gelezen, maximaal twintig per plan. Popup openen herimporteert geen recept. Vernieuwen behoudt het bestaande voorstel bij gelijke receptversie/porties totdat het antwoord er is.
- Matchcontract met `suitable`, `substitution`, `unsuitable`, `unresolved`; harde regels gaan vóór opgeslagen/modeloordelen. Plan en voorstelvoorbereiding gebruiken dezelfde beoordelingsservice. Voorkeuren gelden alleen voor passende relaties. Een gewijzigd beoordelings-ID vraagt een nieuw getoond voorstel.
- Decisions-contract en budgetledger delen atomair de bestaande €15 app-/€5 gebruikersmaxima met import. Werkelijke modelkosten hebben micro-europrecisie; centboekhouding is een conservatieve bovengrens. Lease/sendmarker en dedupsleutel voorkomen een tweede identieke betaalde verzending, ook na payloadretentie. Voorbereiding gebruikt alleen bestaande modelresultaten (`allowSend:false`); uitvoering classificeert niet.
- Verkoop-ID-controle is aangesloten op voorbereiding en verzending. Een bruikbaar detailantwoord vermijdt de eerste-veertig-zoekresultatenbeperking. Bij onvoldoende velden blijft positieve zoekinformatie voorlopig nodig. Geen zoekhit/leesfout betekent niet ‘verwijderd’; niet-bevestigde regels blijven aantoonbaar onverstuurd en blokkeren andere bevestigde regels niet. Snapshot bewaart beoordelingen, inhouds-/commerciële fingerprints en controlebron.
- Gesaneerde lokale diagnostiek via normale app-authenticatie/credentialservice, uitsluitend beheerder in development. Seriële leesproeven, contextcontrole, timeout/responsegrenzen en waargenomen vervolgverwijzingen; geen scripts uitvoeren of credentials handmatig lezen.
- Hervatbare taken voor reeds waargenomen producten zijn aangesloten op de bestaande scheduler, standaard uit. Geen volledige crawl of nieuwe queue/dienst.

### Lokale data en herstel

Beginstatus: migraties 0011–0013 daadwerkelijk aanwezig; 21 zoekcacheregels met samen 122 kandidaatwaarnemingen. Online SQLite-backup via `Connection.backup()` neemt ook actieve WAL-inhoud consistent mee. De aparte herstelkopie in `/private/tmp/picnic-catalog-baseline/` doorstond `integrity_check` en de nieuwe migraties, met behoud van recepten en actie. Daarna 0014–0016 lokaal via Wrangler toegepast. Nieuwe integriteitscontrole: `ok`, geen foreign-keyfouten. Actie `e88f50b6-b701-4e75-81df-67c64e508826` blijft `succeeded`; geen replay.

### Echte leesproeven en grenzen

Eerste proef: twintig bestaande verkoop-ID’s, één request tegelijk. De antwoorden bevatten informatiesecties en gescheiden allergenengroepen; aanvankelijk ontbraken genormaliseerde prijs/verpakking/beschikbaarheid. Gemeten detail-read latency in die twintig antwoorden: p50 260 ms, p95 480 ms (nearest-rank); geen end-to-end matchingbenchmark.

Parser v2 is daarna gericht met drie ID’s getoetst: `s1000133`, `s1000592`, `s1001244`. Verpakking 3/3, prijs 2/3, expliciete bestellimiet 3/3, expliciete beschikbaarheid 0/3; daarom actuele detailcontrole bruikbaar 0/3. Herhaling bevestigde dezelfde dekking. `category-tree-root` leesproef mislukte; geen categoriedekking bewezen. Alleen de bestaande productdetailroute werd als link waargenomen, geen onafhankelijke aanvullende route die beschikbaarheid bewijst. Fusion wordt structureel gelezen; RSC wordt niet als bewezen ondersteund gepresenteerd.

Bestaande Culy- en testimports zijn in de browser hergebruikt zonder betaalde extractie. Testrecept toont tomaten/uien/zout en water zonder passende match; de eerder uitgevinkte tomatenkeuze bleef behouden. De Culy-proef vond een regressie waarbij bereidingsnotities als producteis werden behandeld; die is apart hersteld en getest. Er is geen zuivere voor/na-benchmark van aantallen providerrequests en tijd tot voorstel vóór wijzigingen vastgelegd; claim daarom geen bewezen snelheidswinst.

### Validatie en werkelijk resterende blokkades

De eerste volledige integratiecontrole: 271 tests in 33 bestanden geslaagd; frontendbuild, frontend-/Worker-typecheck en diffcontrole geslaagd. Nieuwe controles omvatten verkoop-ID buiten zoeklimiet, inhouds-/prijswijziging, niet-autoriseerbare onzekerheid, dubbele bevestiging, generatie-isolatie, budget/dedup en ontbrekend mutatiebewijs. De matching-fixtures bevatten zestig synthetische, handmatig gelabelde Nederlandse paren (30 ontwikkeling/30 afzonderlijke testset). Dit zijn regel-/mocktests; geen echte Decisions-kwaliteitsmeting.

De officiële Decisions-documentatie is gecontroleerd op 9 oktober. Basistarief $0,10/M invoertokens kent regionale/langcontexttoeslagen. Geen ondersteunde betrouwbare telling, accounttoegang of regionale prijsattestatie bewezen. Daarom `DECISIONS_MODE=off`; de ingebouwde productieprovider verzendt geen betaalde requests. `enabled` zonder kwaliteitsattestatie blijft effectief shadow. Live kwaliteit, kostenvergelijking en beperkte automatische inzet zijn dus niet vrijgegeven. Referenties: https://developers.openai.com/api/docs/guides/decisions en https://developers.openai.com/api/reference/resources/decisions/methods/create.

**Materiële uitvoeringsbeperking:** een gewone `ORDER`-response is mandinhoud, geen gecorreleerd bewijs van het gevraagde product en aantal. De standaard toevoegadapter markeert toekomstige antwoorden zonder zulk bewijs daarom als onbekend, ook na een mogelijk geslaagde mutatie. Hij verstuurt éénmaal en herhaalt nooit automatisch. De bestaande geslaagde historie is niet veranderd. Exact mutatiebewijs moet nog via een waargenomen providercontract worden opgelost vóór een nieuwe live aankoopproef/releaseclaim.

Volledige scans en automatische detailrefresh blijven `CATALOG_SYNC_ENABLED=off`. Betrouwbare actuele verkoop-ID-beschikbaarheid, volledige categoriedekking, echte Decisions-toegang/telling/kwaliteit en exact toevoegbewijs zijn afzonderlijk open. Online pilot en echte camerafoto blijven aparte releasewerkzaamheden.

Laatste eindstand: na de bereidingsnotitiefix slaagden 279 tests in de volledige suite. Daarna is één extra regressie voor gecombineerde zout/peperbronnen toegevoegd en samen met matchingservice/aankooproutes gecontroleerd: 111 gerichte tests geslaagd. Zwarte-peperattributes worden bij het splitsen niet op zout toegepast; oorspronkelijke bronregels blijven intact. Beide typechecks en diffcontrole zijn opnieuw groen. De definitieve frontendbuild na de laatste domain-/serviceswijzigingen is ook groen. De privébackupmap bevat `baseline-0013.sqlite` met de oorspronkelijke gegevens/schema en de gemigreerde hersteltestkopie; beide zijn op integriteit gecontroleerd.

De browser bevestigt na herstel voor Culy, vier personen: 18 ingrediëntgroepen, 12 geselecteerde producten, 14 verpakkingen, €42,82. Niet bevestigd: sherryazijn, kaneelpoeder, droge witte wijn, verse oregano. Voorraad blijft zichtbaar/uit. Knoflook: passend product 100 g à €1,25 en passende alternatieven; knoflookpoeder/gehakte knoflook staan apart als expliciete vervanging; onbesliste kandidaten zijn niet klikbaar. Dit is een actuele selectieproef, geen aankoopakkoord, geen complete-receptclaim en geen bewezen verbetering ten opzichte van een zuivere oude baseline.


### Vervolg stap 1 → 2 → 3 — 9 oktober 2026

- Stap 1: `UNAVAILABLE`-decorators zijn expliciete negatieve informatie; een productdetail met `isAvailable=false` blijft leidend, ook als prijs/verpakking ontbreekt. Een zoekhit mag dat niet overschrijven. Conflicten blijven onbekend. `max_count`, steppers en beschikbaarheidscontainers bewijzen geen positieve beschikbaarheid.
- Nieuwe begrensde live proef via de bestaande app-koppeling: maximaal vijf leesaanvragen (categorieroot, drie productdetails, één al geobserveerde zoekvraag). Details voor `s1000133`, `s1000358` en `s1000592` bevatten géén expliciete beschikbaarheid; latenties 359/239/258 ms. De detailpagina's tonen een `UNAVAILABILITY_CONTAINER`, maar dat is een UI-component en geen bewijs dat het product onbeschikbaar is. De zoekroute vond `s1000133`, met prijs/verpakking/max_count, zonder beschikbaarheidsboolean of expliciete beschikbaarheidssignalen. Categorieroot bleef `read_failed`. Geen credentials of ruwe leverancierspagina's geëxporteerd.
- De geïnstalleerde SDK geeft op toevoegen een `Cart` terug; er is geen geverifieerd receipt gekoppeld aan deze request, SKU en toegevoegd aantal. Ook een respons met exact SKU/aantal of een voor/na-verschil blijft ambigu bij externe mandwijzigingen. Nieuwe regressies bewijzen dat zo'n antwoord `unknown` blijft en queue-herlevering geen tweede POST veroorzaakt. Stap 1 is daarmee aangescherpt, maar positief beschikbaarheidsbewijs en automatisch toevoegsucces zijn nog niet bewezen.
- Stap 2 voorbereid in de lokale app: alleen **Tomaten, 500 gram, één verpakking, €1,61** geselecteerd. UI-knop niet aangeklikt; geen nieuwe mandmutatie. Dit is een nieuw voorstel en geen replay van de oude gele-uienactie. Uitvoeren vereist nog concrete toestemming op dit product/aantal en maximumprijs; een onzekere uitkomst wordt daarna niet opnieuw verzonden.
- Stap 3: productieconfig voorbereid voor `picnic.devstef.nl`, alternatieve Workers-hosts uit, import-AI-secrets als vereisten toegevoegd; echte D1-ID blijft een placeholder. Migratiehandleiding bijgewerkt naar **0001–0016** en afzonderlijke AI-queue/DLQ. Cloudflare-login werkt buiten de sandbox; huidige scopes zijn onvoldoende voor D1/R2. Geen productiegegevens, resources of uitnodigingen gewijzigd. Tweede tester nog niet aangewezen.
- Definitieve lokale suite: **287 tests in 33 bestanden geslaagd**; Worker- en app-TypeScript-controles en productiebuild geslaagd. Bootstrap-CLI: 6 tests geslaagd. Dit vervangt de live tweepersoonsacceptatie niet.


### Goedgekeurde tomatenproef — 9 oktober 2026

De eigenaar gaf concrete toestemming voor één verpakking Tomaten, SKU `s1015589`, 500 gram, maximaal €1,61. Vóór verzending bevatte het mandje alleen de historische gele-uienregel; tomaten ontbraken. De normale UI verzond uitsluitend de geselecteerde tomatenregel. De actie `290a7550-a5b9-467f-bf24-ab8d734b92fc` werd eerst `unknown`, zonder tweede verzending.

Een nieuwe manduitlezing toonde daarna precies één verpakking Tomaten, 500 gram, €1,61, naast de ongewijzigde gele-uienregel. De gecontroleerde waarneming is met de bestaande herstelknop vastgelegd als `confirmed_added`; de actie is nu `resolved`. Herladen toont dezelfde tomatenregel als Toegevoegd. Er is niets besteld of betaald. De mandrespons meldde de regels ook als niet beschikbaar; aanwezigheid in het mandje bewijst dus geen actuele bestelbaarheid. Dit is een gecontroleerde praktijkproef en geen bewijs van een gecorreleerde automatische toevoegreceipt.

De toestemming voor deze ene verpakking is verbruikt: nooit opnieuw verzenden of een nieuwe aankoopronde starten op basis van dit akkoord. De oude gele-uienactie blijft `succeeded`. Tweede tester is door de eigenaar aangewezen; het e-mailadres blijft buiten de repository. Geen uitnodiging verstuurd zolang de online omgeving niet gereed is. Gerichte Cloudflare-herautorisatie is voorgelegd en wacht op antwoord; nog geen deployment.

## Actuele online pilot — 9 oktober 2026

Deze update vervangt eerdere vermeldingen dat provisioning, secrets en deploy nog ontbreken.

- Alle acht goedgekeurde pilotresources zijn aangemaakt. D1 `85c947b8-ea1c-42c3-a3a8-c95ffe002c58` en private R2 hebben EU-jurisdictie; drie queues hebben ieder een DLQ.
- Migraties 0001–0016 zijn op productie toegepast. CASE-expressies in SQLite-triggers zijn geparentheseerd voor de remote Wrangler-parser, zonder wijziging van de schemawerking. Remote foreign-keycheck is leeg en quick-check is goed.
- Vier onafhankelijke nieuwe authenticatie-/encryptiesleutels en de goedgekeurde OpenAI-sleutel zijn ingesteld, met drie prijsinstellingen. Herstelkopie van uitsluitend de nieuwe authenticatiesleutels staat lokaal in de genegeerde map `.production-secrets/` met directorymodus 700 en bestandsmodus 600; geen waarden in dit document.
- Release `008167d6-65bf-4021-ae3a-d8823d80f7ba` staat op https://picnic.devstef.nl. Workers.dev en preview-URL's zijn uit. Decisions en catalogussynchronisatie blijven uit.
- Validatie: 287 Worker-tests in 33 bestanden, 9 bootstrap-/migratiechecks, beide TypeScript-checks, build en productie-dry-run geslaagd. HTTPS, health, unauthenticated 401 en verkeerde Origin 403 zijn online gecontroleerd.
- De eigenaar heeft zelf de mailcode ingevuld en is online ingelogd. Een echte Culy-URL-import leverde één opgeslagen recept met 18 ingrediënten, vier bronporties en vier stappen; herladen behoudt het recept en de sessie. Bronkopie is aanwezig. Huishoudmaten blijven veilig onbekend; de getallen staan in de originele bronregels. Misleidende hoeveelheidwaarschuwingen worden gericht hersteld.
- De eigenaar koppelt Picnic rechtstreeks in de online app. De tweede tester verifieert de eigenaar zelf bij Cloudflare; geen extra email-routing-scope aangevraagd en nog geen uitnodiging verzonden. Wacht op daadwerkelijke status Verified.

Resterend vrijgavebewijs: online Picnic-koppeling, tweede account en accountisolatie, uitnodigingsmail, echte foto-/Engelstalige import en herstel/toegang stoppen. De besloten tweepersoonspilot is dus nog niet volledig geverifieerd. Nieuwe mandmutaties vereisen opnieuw concrete toestemming: de eerdere tomaten- en uientoestemmingen zijn verbruikt.


### Eigenaarstest gestart — 9 oktober 2026

De eigenaar heeft de productie-Picnic-koppeling zelf afgerond. De online app toont verbonden en leest het bestaande mandje met precies de eerder gecontroleerde uien- en tomatenregel; geen nieuwe mandmutatie uitgevoerd. De eigenaar wil eerst zelf alles testen. Daarom is de uitnodiging aan de tweede tester uitgesteld tot nieuw akkoord na die eigen test; ontvangerverificatie is nog niet afgerond. Dit vervangt de eerdere instructie om direct na Verified uit te nodigen.

### Hoeveelheidlabels bijgewerkt — 9 oktober 2026

Release `30caa950-2791-43b5-bd72-fdfd7bb4f9be` vervangt de eerste online versie. Nieuwe imports geven geen generieke controlewaarschuwing bij geldige exacte/rangehoeveelheden. Niet ondersteunde huishoudmaten blijven onbekend maar vermelden een aparte schatting in plaats van ten onrechte een ontbrekende bronhoeveelheid. Bestaande opgeslagen waarschuwingen zijn niet herschreven. Zes gerichte importtests, beide typechecks, build en diffcontrole geslaagd; deployment en HTTPS-health bevestigd. Geen nieuwe import of mandmutatie tijdens deze correctie. De eigenaar test eerst zelf; nodig de tweede tester niet uit zonder later akkoord.
