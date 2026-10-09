# Productretrieval, matching en de grens van 30 seconden

Audit: 9 oktober 2026. Code-/documentatieonderzoek plus een lokale wijziging met mocks; geen live Picnic-leesproef, betaalde modelaanroep, mandmutatie of productieaanpassing. De historische detailmetingen hieronder zijn overgenomen bewijs, geen nieuwe meting. Codeverwijzingen beschrijven de baseline vóór de kleine wijziging onderaan.

## Feitelijke route en kwaliteitsgrenzen

`shoppingGroups` → zoekcache/index + Picnic zoeken → kandidaatdetails → regels/opgeslagen beoordeling → rangschikking/hoeveelheden → geselecteerde SKU → afzonderlijke actuele controle bij voorstelvoorbereiding.

| Stap | Codebewijs | Implicatie |
| --- | --- | --- |
| Zoekterm | `worker/domain/shopping.ts:96-121`: kennisprofielnaam, anders genormaliseerde invoer; één query per groep | Onbekende Engelse naam krijgt geen aantoonbaar brede vertaling of variantenzoekstrategie. Een reranker kan een ontbrekende kandidaat niet herstellen. |
| Cache | `worker/routes/shopping.ts:44-75`: querycache tien minuten; requestlokale deduplicatie | Warme cache vermindert zoekrequests. Bij cachemiss blijft live search nodig, ook met indexhits. Index dient als aanvulling/fallback. |
| Lokale index | `worker/catalog/index.ts:36-48`: maximaal 200 recente producten, alle zoekwoorden letterlijk in naam, maximaal 40 hits | Geen semantische of volledige assortimentsindex. Recall is niet gemeten. `checked_at` wordt ook op zoekcachehergebruik vernieuwd: onderscheid observatiedatum en cachegebruikdatum is wenselijk. |
| Searchmerge | `worker/routes/shopping.ts:64-72`: 40 zoekhits, union maximaal 80; `storeCatalogProducts` verwerkt eerste 40 | Het getoonde kandidatenuniversum en bewaarde index kunnen verschillen. Detailbudget/volgorde beïnvloedt welke kandidaten verrijkt worden. |
| Productsoort | `worker/domain/shopping.ts:135-187`: naamregexen, kennisprofielen, harde uitsluitingen, expliciete merk/vorm/variant | Beschermt concrete bekende gevallen, maar brede naamregex is geen gevalideerde productontologie. Bijvoorbeeld generieke uitsluiting van `yoghurt` of `kaas` kan een toekomstig passend yoghurt-/kaasprofiel blokkeren. Deze regels per productfamilie evalueren. |
| Onbekende soort | Zelfde functie: geen profiel of geen productregex → `unresolved` | Veilig onthouden vermindert automatische dekking; niet als accurate automatische match tellen. |
| Beoordelingscache | `worker/matching/assessment.ts:15-44`: eigenaar/koppeling/generatie, ingrediëntsleutel, inhoudfingerprint, regelversie | Sterke isolatie en wijzigingscontrole. Kwaliteit van een gecachet oordeel blijft afhankelijk van regels/model. Prijs is apart. |
| Hoeveelheid | `candidateFor`/`rankCandidates`, `worker/domain/productSelector.ts` | Exact rekenen, geschiktheid en productfamilies behouden. Geen reden prijsoptimalisatie aan model over te dragen. De actuele shoppingroute selecteert één SKU per groep; algemene selector bewijst niet dat de UI meerdere SKU's optimaliseert. |
| Decisions | `worker/matching/decisions.ts:12-44`, `worker/adapters/decisions.ts:21-24` | Stand off retourneert direct. Ingebouwde provider blokkeert telling/verzending; alleen geïnjecteerde mocks kunnen verzenden. Huidige traagheid wordt niet door betaalde Decisions-verzoeken veroorzaakt. |

De zestig synthetische paren toetsen regels/contracten. Ze bewijzen geen Recall@k, live modelkwaliteit of percentage hele recepten zonder correctie. Meet ontbrekende kandidaten vóór beoordeling; scheid ongeschikt, substitutie, onbeslist en geschikte maar onvoldoende/ontoegankelijke verpakking.

## Concrete latencyproblemen

`worker/routes/shopping.ts:28-33` verwerkt maximaal drie ingrediëntgroepen tegelijk. Binnen iedere groep loopt een seriële kandidaatlus (`:99-115`). Per kandidaat wordt detailcache apart gelezen; een nieuwe beoordeling doet een relationele SELECT, INSERT en SELECT (`worker/matching/assessment.ts:19-35`). Bij 15 groepen en 40 kandidaten zijn dat maximaal circa 2.400 afzonderlijke D1-operaties voor deze twee onderdelen, vóór overige opslag/controles; dit is een berekende bovengrens, geen gemeten requesttijd.

Nog belangrijker: `detailSerial` (`shopping.ts:90,105-112`) vormt één globale seriële keten voor maximaal twintig detailreads. Iedere Picnic-request heeft een afzonderlijke timeout van tien seconden (`worker/adapters/picnic.ts:32,89-94`). Twintig hangende detailreads kunnen daardoor ongeveer 200 seconden toevoegen; de route heeft geen gezamenlijke 30-seconden-deadline. De drie groepsworkers lossen deze globale wachtrij niet op. Nieuwe detailverrijking wacht bovendien op onbesliste kandidaten vóór de overige kandidaten in die groep.

Historisch rapporteert `RECEPT-NAAR-MANDJE-VERIFICATIE.md:95` twintig detailantwoorden met p50 260 ms en p95 480 ms. Dat maakt details normaal mogelijk enkele seconden werk, maar bewijst geen eind-tot-eind tijd en beschermt niet tegen trage externe antwoorden. Ook het model/importpad en upload/polling moeten in de totale 30 seconden passen.

## Aanbevolen architectuur

Maak één deadline vanaf submit tot **volledig bruikbaar** voorstel, inclusief upload, import, wachtrij, matching en UI. Streef naar p95 ≤30 seconden op de afgesproken leesbare dataset. Een harde deadline kan een veilige fout/onbesliste uitkomst begrenzen; garandeert geen volledig correct resultaat wanneer externe diensten niet antwoorden. Rapporteer die twee uitkomsten apart; een spinner of eerste lege rij telt niet als een bruikbaar voorstel.

1. Meet zonder broninhoud: correlation ID, stage start/einde, aantallen search/detail/D1/modelrequests, hit/miss, aantal groepen/kandidaten, deadline-outcome. Splits koude en warme cache. De totale kritieke keten is leidend.
2. Laad kandidaatdetails en bestaande relaties met begrensde bulkqueries per groep of heel plan. Evalueer deterministische regels in geheugen. Bewaar nieuwe relaties in batches; voorkom writes bij ongewijzigde cached relaties. Houd dezelfde fingerprints, generatie en harde uitsluitingen.
3. Doe goedkope soort-/variantfiltering vóór verrijking. Haal details alleen op voor kandidaten die de keuze nog kunnen veranderen: voorlopige winnaar plus begrensde kansrijke onzekerheden. Geen 20 willekeurige onbekende kandidaten op de kritieke keten. Meet kandidaatrecall en precisie zodat de cap geen stille kwaliteitsdaling veroorzaakt.
4. Vervang de onbegrenste totale detailwachttijd door één gedeeld tijdsbudget, annulering en een gecontroleerde kleine workerpool (bijvoorbeeld 2; capaciteit/toegestane Picnic-readbelasting eerst toetsen). Start geen nieuw detail na het budget. Een incomplete kandidaat blijft expliciet onbeslist. Niet alleen de timeout per fetch verlagen: ook wachttijd in de pool begrenzen.
5. Hergebruik onveranderde inhoud/fingerprints, met aparte oorspronkelijke observatiedatum. Verse prijs/beschikbaarheid horen bij actuele voorstelcontrole; oude commerciële data niet automatisch als actueel presenteren. Voor deadlinebewaking moeten ook D1/bodyreading/opslag stoppen of niet meer kritisch zijn.
6. Eventueel één begrensde Decisions-call voor resterende onafhankelijke kandidaatvragen; deel evidence, batch vragen, harde uitsluitingen vooraf. Niet een modelcall per product. Alleen na bewezen accounttoegang, kostentelling, proefbudget en kwaliteitstest. Het huidige adaptercontract met exact één vraag moet daarvoor expliciet worden geversioneerd.

Illustratief totaalbudget, te valideren: upload/bron ≤4 s; extractie/normalisatie ≤12 s; retrieval/detail/rerank ≤10 s; opslag/UI ≤2 s; reserve 2 s. Bron en upload meten beide mee; deze getallen zijn ontwerpbudgetten, geen prestatieclaims. Bij een reeds geïmporteerd recept geldt hetzelfde totaalcriterium voor de dan kortere route.

## Decisions en Jev

De actuele primaire [Decisions-handleiding](https://developers.openai.com/api/docs/guides/decisions) en [create-reference](https://developers.openai.com/api/reference/resources/decisions/methods/create), gelezen op 9 oktober, beschrijven tekst-/beeldbewijs en predicate/choice/score-antwoorden. Onafhankelijke vragen kunnen één gedeelde input gebruiken. Dat past bij gebundelde geschiktheidsbeoordeling; vrije ingrediëntenextractie past niet rechtstreeks in deze antwoordtypen. De documentatie vormt geen bewijs van een app-specifieke latencygarantie of accounttoegang.

Basistarief is $0,10 per miljoen invoertokens, met mogelijke regionale/langcontexttoeslagen. De app moet totale requestoverhead, betaalde vragen, regio en inputbound bewijzen; Responses-telling is niet automatisch Decisions-telling. Confidence is modelinformatie, geen gevalideerde kans op een juist winkelvoorstel. Drempels op ontwikkelcases kiezen, daarna afzonderlijke testset.

Jev is in de overdracht geen huidige dependency. Zonder eenduidig product/API, primaire contractdocumentatie en eigen datasetmeting is overstappen geen onderbouwde snelheidsingreep. Een model/provider wisselen behoudt de huidige seriële detailketen en D1-vermenigvuldiging; eerst die architectuur begrenzen.

## Geprioriteerde verificatie

P0: tijdsmetingen en end-to-end deadline; offline mocks met 15 groepen, warme/koude cache en hangende detailreads. P1: bulk detail-/relationele reads en batched persistence; assert gelijke selecties/fingerprints en minder D1-roundtrips. P1: selectieve verrijking en detailpool; vergelijking van Recall@k en gehele-receptcorrectheid. P2: NL/EN lexicale varianten; gold products vóór ranking. P2: Decisions-batch in shadow met vooraf budget, accounttoegang en labels. Geen productiedeploy tot de eigenaar een concreet lokaal resultaat kan beoordelen.

## Eerste lokale verbetering

Op verzoek van de hoofdagent is de globale `detailSerial` vervangen door `worker/catalog/detailLoader.ts`: requestlokale concurrency drie, maximaal twintig unieke productreads, gedeelde promise per product-ID en geen automatische herhaling bij mislukking. `shopping.ts` behoudt de live-koppelings-/sessiecheck vóór ieder extern detailrequest, controleert exact product-ID en laat ontbrekende details onbeslist. Een gedeeld detailantwoord wordt per zoekproduct samengevoegd, zodat commerciële zoekdata niet door een andere rij wordt overschreven.

De gerichte mocks bewijzen drie overlappende reads, de cap twintig, deduplicatie en slotvrijgave na fouten. Beide testbestanden (`detailLoader` en shoppingroutes): 14 tests geslaagd. Worker-typecheck en `git diff --check` geslaagd. Dit elimineert de globale seriële wachtrij; maximaal drie detailreads komen nu tegelijk. Geen gemeten live snelheidsclaim en nog geen gezamenlijke 30-seconden-deadline. De wachtrij kan bij twintig keer tien seconden nog boven dertig seconden uitkomen. Productie staat ongewijzigd.

### Vervolg: gedeelde shoppingdeadline

De lokale planroute accepteert nu optioneel `deadlineAt` via het gedeelde tijdcontract. Zonder veld krijgt zij maximaal dertig seconden; een toekomstige deadline wordt op dertig seconden begrensd, een verstreken deadline geeft direct 504 en een ongeldige waarde 400. `worker/catalog/planDeadline.ts` omvat het gehele read-only plan met één timer en abortsignal. Zoek-/detailtransporten van de Picnic-adapter koppelen hun fetch aan dat signal; een geaborteerde scope start geen nieuwe fetch. De planroute begrenst ook niet-afbreekbare geïnjecteerde providers met een promise race. Timeout geeft `PLAN_DEADLINE_EXCEEDED`, zonder een onvolledig voorstel als succes te presenteren. Bestaande aankooproutes en adaptergebruik zonder signal behouden hun gedrag.

Gerichte suite uitgebreid: 32 tests geslaagd in vier bestanden, inclusief hangende search, hangend detail, geen reads bij verlopen deadline, abort van daadwerkelijk fetchtransport, timeropruiming en de eerdere concurrency/cap/dedup. Lopende D1-statements zijn niet annuleerbaar; checkpoints voorkomen verdere kandidaatverwerking na deadline, maar een reeds ingezette databasebewerking kan nog afronden. Dit begrenst de shoppingwachttijd; het bewijst nog niet dat 95% echte recepten binnen dertig seconden volledig bruikbaar is. De hoofdagent verbindt hetzelfde budget met import en frontend.

Ook de detailcache wordt nu per ingrediëntgroep in één begrensde SQL-query gelezen in plaats van één query per kandidaat. Bij vijftien groepen met veertig kandidaten verdwijnen daardoor 585 detailcache-roundtrips. Dit is een structurele requestreductie, geen gemeten live snelheidswinst; de relationele beoordelingsqueries blijven een afzonderlijke optimalisatie.
