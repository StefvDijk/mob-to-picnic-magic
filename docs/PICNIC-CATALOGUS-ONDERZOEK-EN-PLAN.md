# Picnic API onderzoek en plan voor de productcatalogus

Onderzoeksdatum: 9 oktober 2026.

Voor de receptenapp is een eigen productindex met herbruikbare ingrediëntkoppelingen zinvol. Productgegevens worden lokaal gezocht en getoond; prijs en bestelbaarheid worden voor de gekoppelde klant opnieuw bij Picnic gecontroleerd. Een wekelijkse scan is geschikt voor catalogusonderhoud, maar onvoldoende als garantie dat een gekozen product nu besteld kan worden.

Dit plan bouwt voort op de productbesluiten in [Recept naar mandje](RECEPT-NAAR-MANDJE-PLAN.md). Het voegt onderzoek en een implementatievolgorde toe. Er is geen live assortimentsmeting uitgevoerd: aantallen producten, categorievolledigheid, aanvraaglimieten en verschillen tussen accounts blijven meetpunten. Er is geen nieuwe synchronisatie of mandjemutatie gestart.

## Hoe de gebruikte API werkt

De worker gebruikt `picnic-api-worker`, een npm-alias voor `picnic-api@4.10.0`. Er staat daarnaast nog `picnic-api@3.1.3` voor oudere code in het project. Nieuwe catalogusfunctionaliteit moet via de worker en de bestaande serveradapter lopen. De wrapper noemt zichzelf onofficieel en niet verbonden aan Picnic. De standaard Nederlandse basisroute is `https://storefront-prod.nl.picnicinternational.com/api/15`.

Login stuurt een gebruikersnaam en een MD5-afgeleide van het wachtwoord naar `/user/login`. De sessiesleutel komt uit de responseheader `x-picnic-auth`; daaropvolgende aanvragen dragen die header mee. Indien vereist volgen `/user/2fa/generate` en `/user/2fa/verify`. Verificatie levert een vernieuwde sleutel op. Er is geen gedocumenteerde vaste geldigheidsduur waarop dit plan kan vertrouwen. Een verbroken verbinding pauzeert de bijbehorende synchronisatie tot herverbinden.

Bronnen: [wrapper en gebruik](https://github.com/MRVDH/picnic-api), [HTTP-client](https://raw.githubusercontent.com/MRVDH/picnic-api/main/src/http-client.ts), [authenticatie](https://raw.githubusercontent.com/MRVDH/picnic-api/main/src/domains/auth/service.ts).

### Routes voor onze toepassing

| Doel | Route na de basisroute | Wat de broncode aantoont |
| --- | --- | --- |
| Producten zoeken | `GET /pages/search-page-results?search_term=...` | De wrapper verzamelt `sellingUnit`-objecten uit de pagina |
| Zoeksuggesties | `GET /suggest?search_term=...` | Suggesties, geen volledige catalogus |
| Categoriewortel | `GET /pages/category-tree-root` | Bekende pagina die RSC kan teruggeven |
| Hoofdcategorie | `GET /pages/L1-category-page-root?category_id=...` | Gedocumenteerde paginaroute |
| Subcategorie | `GET /pages/L2-category-page-root?category_id=...` | Gedocumenteerde paginaroute |
| Productdetails | `GET /pages/product-details-page-root?id=...` | Pagina voor een concrete verkoop-ID; wrapper voegt twee actieparameters toe |
| Afbeelding | `/static/images/{imageId}/{size}.png` op de storefront-host | Los beeldbestand buiten `/api/15` |
| Mandje lezen | `GET /cart` | Mandregels, prijzen, beschikbaarheid en context |
| Product toevoegen | `POST /cart/add_product` | Body met `product_id` en `count` |
| Meerdere producten toevoegen | `POST /cart/products/add` | Body met product-ID’s als sleutels en aantallen als waarden |

De broncode bewijst de routes en parsers, geen gegarandeerde live dekking of transactie-eigenschappen. De zoekmethode heeft geen cursor, offset of serverpaginering als parameter. Een eigen `limit` of `offset` bovenop de ontvangen array bewijst daarom niet dat volgende serverresultaten worden opgehaald. Categoriepagina’s moeten worden onderzocht op verwijzingen, vervolgacties en eventueel uitgesteld geladen inhoud.

Bronnen: [catalogusservice](https://raw.githubusercontent.com/MRVDH/picnic-api/main/src/domains/catalog/service.ts), [app-pagina’s](https://raw.githubusercontent.com/MRVDH/picnic-api/main/src/domains/app/service.ts), [mandjeservice](https://raw.githubusercontent.com/MRVDH/picnic-api/main/src/domains/cart/service.ts).

### Paginaformaten en volledigheid

Fusion is een JSON-pagina met layout, componenten en acties. RSC komt als `text/x-component` met rijen die naar andere rijen kunnen verwijzen. Dezelfde pagina kan afhankelijk van de clientversie een ander formaat krijgen. Alleen recursief naar `sellingUnit` zoeken in JSON is dus geen universele catalogusparser.

De huidige RSC-helper leest JSON-rijen en slaat andere rijvormen over. Die helper is een startpunt; volledige categorie-extractie vereist controle op verwijzingen en op inhoud die niet zelfstandig als JSON-rij verschijnt. We volgen alleen waargenomen catalogusverwijzingen naar toegestane leesroutes. Paginadata of scripts worden nooit als code uitgevoerd.

Oudere voorbeelden met `getCategories()`, `getLists()` of `getArticle()` zijn geen geschikte basis. Deze functies zijn in versie 4 vervangen door paginaroutes. Een gegarandeerde export van alle artikelen is niet aanwezig in de onderzochte catalogusservice.

Bronnen: [paginaformaten](https://raw.githubusercontent.com/MRVDH/picnic-api/main/src/domains/app/service.ts), [RSC-parser](https://raw.githubusercontent.com/MRVDH/picnic-api/main/src/domains/app/rsc.ts), [wijzigingen in versie 4](https://github.com/MRVDH/picnic-api/releases/tag/v4.0.0).

## Productinformatie en de grenzen daarvan

Zoekresultaten bevatten verkoop-ID, naam, afbeelding-ID, getoonde prijs, verpakkingstekst, maximaal bestelaantal, decoraties en eventueel prijsstaffels. Details voegen merk, prijs per eenheid, galerij, omschrijving, kenmerken, informatiesecties, allergenen, aanbieding, bundels en alternatieven toe. Een voedingswaardetabel of ingrediëntenlijst kan tekst in een informatiesectie zijn in plaats van afzonderlijke numerieke velden.

De verkoop-ID is de sleutel voor toevoegen. Een bundel kan een eigen verkoop-ID hebben. Varianten en bundels worden niet automatisch samengevoegd tot één productfamilie. Een geverifieerde familie- of variantrelatie moet afzonderlijk worden vastgelegd.

De detailparser is expliciet experimenteel. Twee concrete beperkingen in de geïnstalleerde versie zijn relevant:

- De allergenenparser verwijdert zowel de kop ‘Bevat’ als ‘Bevat mogelijk’ en bewaart daarna één lijst. Onze gegevens moeten beide groepen apart houden, inclusief de originele tekst.
- Ontbrekende prijs en ontbrekend `max_count` kunnen in de parser als nul eindigen. Een parserfout mag daardoor geen gratis product of bewezen onbeschikbaarheid opleveren. Ontbrekend blijft bij ons `unknown`.

`max_count` is een bestellimiet, geen exacte magazijnvoorraad. Een alternatief op een productpagina is een bron van kandidaten, geen bewijs van geschiktheid voor een recept. Afwezigheid in een zoekresultaat is evenmin bewijs dat het product verwijderd is.

Bronnen: [producttypes](https://raw.githubusercontent.com/MRVDH/picnic-api/main/src/domains/catalog/types.ts), [detailparser](https://raw.githubusercontent.com/MRVDH/picnic-api/main/src/domains/catalog/helpers.ts).

## Synchronisatie en actuele gegevens

In de onderzochte wrapper en bronnen is geen bruikbare cataloguswebhook, wijzigingsfeed of `updated_since`-route vastgesteld. Het ontwerp gebruikt daarom periodiek ophalen en vergelijken. Dit betekent niet dat Picnic intern geen andere mogelijkheden heeft. Een officiële samenwerking kan deze afhankelijkheid later vervangen.

Evenmin is een toegestane Picnic-aanvraagfrequentie vastgesteld. Ook ondersteuning voor ETag, Last-Modified en conditionele aanvragen moet live blijken. Een lokale inhoudshash voorkomt onnodige opslag en classificatie, maar bespaart op zichzelf geen netwerkrequest.

Producten zijn waarnemingen binnen een account- en marktcontext. De mandjetypes bevatten ook bezorgslot-, hub- en fulfilmentcontext. Dat bewijst niet welke productvelden tussen klanten verschillen. Tot die verschillen zijn gemeten, blijven actuele prijzen, aanbiedingen, beschikbaarheid en klantgebonden resultaten gescheiden per verbinding. Een centrale pilotindex beschrijft uitsluitend het assortiment dat het pilotaccount heeft waargenomen.

Bron voor mandje- en slotvelden: [mandjetypes](https://raw.githubusercontent.com/MRVDH/picnic-api/main/src/domains/cart/types.ts).

## Wat al in de app aanwezig is

De werkmap bevat reeds een beperkte index en selectieflow:

- `shopping_catalog` bewaart zoekresultaten per eigenaar, verbinding, verbindingsgeneratie en zoekterm. De geldigheid is tien minuten.
- De adapter en selectiecode begrenzen zoekresultaten op 40 producten. Dit is onze limiet, geen bewezen Picnic-limiet.
- `ingredient_preferences` bewaart persoonlijke keuzes na expliciete opt-in.
- De ingrediëntenkennis bevat synoniemen, uitsluitingen en hoeveelheidsaannames. De matcher werkt voornamelijk met productnamen.
- De voorbereiding en verzendverwerking zoeken gekozen producten opnieuw en controleren prijs, beschikbaarheid en aantallen.
- De toevoegverwerking heeft duurzame uitvoeringsregels en onderscheidt toegevoegd, niet toegevoegd en onbekende uitkomst.

De huidige knoflookregel sluit bijvoorbeeld saus, poeder en brood uit, maar bevat geen algemene productsoortcontrole die snacks uitsluit. Een product met ‘knoflook’ in de naam kan daardoor ten onrechte geschikt lijken. Dit is met de huidige code mogelijk; het is geen aangetoonde live fout.

Een tweede beperking is dat een controle opnieuw via de oorspronkelijke zoekterm loopt. Een gekozen product kan buiten de eerste 40 resultaten vallen. Productdetails op verkoop-ID zijn een betere basis, mits de benodigde prijs- en bestelbaarheidsvelden daarin betrouwbaar worden aangetroffen. Anders is een aanvullende waargenomen leesroute nodig; we vallen niet terug op een onvolledige zoeklijst als bewijs van verwijdering.

Lokale bronnen: `worker/adapters/picnic.ts`, `worker/routes/shopping.ts`, `worker/domain/shopping.ts`, `worker/additions/processor.ts`, `shared/ingredient-knowledge.ts` en `migrations/0013_shopping_flow.sql`.

## Voorgestelde gegevensopslag

Gebruik de bestaande D1-database voor doorzoekbare gegevens en relaties. Bewaar desgewenst beperkte bronfragmenten in R2 voor parseronderzoek. Volledige app-pagina’s kunnen analytics of klantinformatie bevatten: bewaar uitsluitend relevante productfragmenten zonder sessiesleutels en persoonlijke gegevens, met een bewaartermijn.

| Gegevens | Inhoud |
| --- | --- |
| Producten | Markt, verkoop-ID, naam, merk, verpakking, afbeeldingen, eerste en laatste waarneming |
| Productdetails | Originele informatiesecties, omschrijving, ingrediënten, allergenengroepen en optionele voedingswaarden |
| Productwaarnemingen | Verbinding en generatie, eventueel waargenomen slotcontext, prijs, staffels, aanbieding, beschikbaarheidsstatus, bestellimiet en controletijd |
| Categorieën | Waargenomen boom, route, bovenliggende categorie en scancontext |
| Categorierelaties | Product-ID en alle waargenomen categorieën, met laatste waarneming |
| Ingrediëntkoppelingen | Canoniek ingrediënt, vorm, product-ID, passend/vervanging/ongeschikt/onzeker, bewijs en matcher-versie |
| Synchronisatieruns | Bereik, taken, checkpoints, fouten, tellingen, formatversie en voltooiingsstatus |

Een inhoudsversie maakt zichtbaar dat een match opnieuw moet worden beoordeeld na wijziging van samenstelling, verpakking of productsoort. Een prijswijziging alleen vereist geen nieuwe inhoudelijke classificatie. Persoonlijke voorkeuren blijven apart van algemene geschiktheid.

De eerste versie heeft geen aparte zoekdienst of vectordatabase nodig. Begin met geïndexeerde ingrediëntrelaties en gewone tekstzoekopdrachten. Meet daarna waar complexere zoektechniek werkelijk helpt.

## Verversbeleid

De intervallen hieronder zijn startinstellingen, aanpasbaar na metingen.

| Onderdeel | Voorstel |
| --- | --- |
| Categorieboom en ontdekking | Wekelijks, alleen na een geslaagde categorieproef |
| Nieuwe producten | Basisgegevens direct opslaan; details in een wachtrij |
| Veelgebruikte productdetails | Wekelijks opnieuw lezen |
| Overige productdetails | Verspreid over ongeveer een maand |
| Prijs en bestelbaarheid | Korte cache per verbinding; bij selectie verversen als verouderd |
| Definitieve verzending | Verse controle in dezelfde gebruikerscontext vóór de mutatie |
| Onbekend ingrediënt | Zoekfallback bij Picnic en gevonden producten opnemen |

Een wekelijkse categoriehash kan verborgen wijzigingen in ingrediënten niet detecteren. Detailverversing blijft daarom nodig, ook als naam en prijs gelijk zijn. Voor een geheel nieuw product classificeren we één keer; een gewijzigd relevant detail maakt die classificatie opnieuw nodig.

Ontbreekt een product in één scan, dan krijgt het hooguit ‘niet gezien’. Een tijdelijke uitverkoop is een andere status. Pas na bijvoorbeeld twee geslaagde scans van hetzelfde bereik en een aanvullende productcontrole wordt het als mogelijk verdwenen gemarkeerd. Zonder volledige dekking van dat bereik is deze conclusie niet toegestaan. Historie en bestaande verwijzingen blijven behouden.

Synchronisatie loopt in kleine hervatbare taken via de bestaande queue- en scheduled-infrastructuur. Begin met één gelijktijdige leesaanvraag en een configureerbare pauze. Dat is een conservatieve startinstelling, geen door Picnic goedgekeurde snelheid. Respecteer eventueel `Retry-After`, vertraag bij 429 en tijdelijke fouten, pauzeer bij authenticatiefouten en stop een scan bij onverwachte formaten of opvallende daling in productaantallen. Een mislukte scan verandert nooit massaal productstatussen.

## Selectie van recepten naar producten

Een canoniek ingrediënt krijgt een vorm en relevante kenmerken: bijvoorbeeld knoflook, vers, bol of gepelde teen. Het product krijgt een productsoort, samenstelling, vorm en verpakking. ‘Bevat knoflook’ is geen relatie ‘is geschikt als knoflook’.

De selectievolgorde is:

1. Identificeer het ingrediënt en behoud relevante receptkenmerken.
2. Zoek eerder gecontroleerde koppelingen en passende catalogusproducten.
3. Sluit ongeschikte productsoorten en strijdige vormen uit.
4. Beoordeel onbekende kandidaten met categorie, naam en relevante details; twijfel blijft zichtbaar.
5. Bereken voldoende verpakkingen en de laagste totaalprijs voor passende producten.
6. Pas een expliciet onthouden gebruikersvoorkeur toe als die nog passend en verkrijgbaar is.
7. Controleer gekozen producten bij Picnic voordat ze worden toegevoegd.

Voor knoflook zijn verse bollen passende kandidaten; knoflookchips zijn ongeschikt. Poeder of puree kan een vervanging zijn, met expliciete keuze en afzonderlijke hoeveelheidsregels. Het ontbreken van een exacte match mag geen snack of inhoudelijke vervanging automatisch selecteren.

Code verwerkt eenheden, porties, aantallen en kosten. Een model kan helpen bij onbekende productclassificaties, maar krijgt alleen relevante kandidaten. Een modelscore is geen bewijs. We toetsen classificaties met een handmatig beoordeelde set en hergebruiken bewezen koppelingen. Gewichtsinschattingen voor een bol of teen blijven herkenbaar als schatting.

## Toevoegen aan het mandje

De app behoudt één bevestiging voor de hele selectie. Intern blijven toevoegingen voorlopig per product verwerkt met de bestaande duurzame uitvoeringsregels. De bulkroute is beschikbaar in de wrapper, maar atomiciteit, gedeeltelijke fouten en een herhaalbare request-ID zijn niet vastgesteld. Daarom is bulktoevoegen geen voorwaarde voor deze catalogus.

Na een verse controle kan de situatie nog veranderen. De response van Picnic blijft bepalend. Een structureel geldige mandjeresponse alleen bewijst niet dat elk bedoeld aantal is toegevoegd: de bevestiging moet de relevante mandregel en hoeveelheden controleren. Bewaar de uitgangswaarneming en ontvangen uitkomst waar mogelijk. Gelijktijdige handmatige wijzigingen in Picnic maken een verschilmeting niet automatisch sluitend.

Bij timeout na verzenden kan de mutatie al uitgevoerd zijn. Geen automatische retry. Lees het mandje om de gebruiker te helpen, maar markeer de uitkomst alleen bevestigd als het bewijs voldoende is. Producten die aantoonbaar nog niet verzonden zijn kunnen afzonderlijk worden afgehandeld. Een selectie blijft gekoppeld aan de juiste verbinding en generatie; herverbinden maakt oude controles ongeldig.

Actuele staffelprijzen kunnen samenhangen met het aantal in het bestaande mandje. Bestaande inhoud wordt volgens het productplan niet afgetrokken van de receptbehoefte, maar kan wel een korting beïnvloeden. Toon een schatting waar promotieberekening onzeker is en controleer de werkelijke mandjeprijzen. Een prijswijziging vraagt om bijgewerkte informatie; inhoudelijke vervanging gebeurt alleen na gebruikerskeuze.

## Implementatievolgorde en meetbare oplevering

### Stap 1 Bewijs de leesroutes

Bouw een begrensde diagnostische proef met de bestaande gekoppelde Picnic-verbinding. Lees de categorieboom, enkele uiteenlopende categorieën, zoekresultaten en circa 20 tot 50 representatieve productdetails. Dit is een voorgesteld proefbereik, geen uitgevoerde meting. De proef schrijft alleen onderzoeksresultaten en verandert het mandje niet.

Leg vast: formaten, contenttypes, bruikbare velden, vervolgverwijzingen, dubbele ID’s, lege waarden, responsegrootte, vertraging en eventuele cacheheaders. Test details voor bekende verkoop-ID’s zonder ze via zoeken opnieuw te ontdekken. Controleer reguliere producten, verse producten, uitverkochte artikelen indien aangetroffen, bundels en staffelkorting.

Oplevering: echte, opgeschoonde parserfixtures en een verslag met velddekking en aanvraagkosten. Pas als categorieën volledig doorloopbaar blijken, volgt een volledige waargenomen catalogusscan. Als categorieën onvolledig zijn, blijft de index groeien via echte receptzoekopdrachten en bekende product-ID’s.

### Stap 2 Breid de huidige index uit

Voeg productrecords, details en contextgebonden waarnemingen toe. Vul ze bij bestaande zoekopdrachten. Neem afbeelding en merk op in de kaarten, en toon alternatieven vanuit de lokale index. Behoud de bestaande persoonlijke voorkeuren en uitvoeringsregels. Vervang de controle op zoekpositie door een betrouwbare controle op verkoop-ID.

Oplevering: herhaald zoeken en alternatieven tonen hoeft bij geldige cache niet opnieuw naar Picnic. Verouderde gegevens worden herkenbaar en een vertraagde API blokkeert het bekijken van reeds bekende producten niet.

### Stap 3 Maak de matching inhoudelijk betrouwbaar

Begin met veelgebruikte ingrediënten en lastige paren: knoflook/chips, ui/uiensoep, kookroom/slagroom, vers/gedroogd, tomatenpuree/passata/blokjes en vlees/vegetarische alternatieven. Leg vorm, productsoort, herkomst en beoordeling vast.

Oplevering: op een vooraf beoordeelde regressieset worden verkeerde productsoorten nooit automatisch gekozen. Meet daarnaast hoeveel ingrediënten automatisch een juiste kandidaat krijgen, hoeveel correcties nodig zijn en hoeveel ontbrekend blijven. Een kleine testsuite is geen garantie voor alle producten; onbekende gevallen krijgen een voorzichtige status.

### Stap 4 Voeg hervatbare synchronisatie toe

Activeer het wekelijkse schema voor bewezen leesroutes. Ontdek nieuwe ID’s, plan detailverversing en vergelijk inhoudsversies. Houd voortgang en foutpercentages bij. Productverwijdering wordt alleen afgeleid uit geslaagde scans met vergelijkbaar bereik en aanvullend bewijs.

Oplevering: onderbreken en hervatten veroorzaakt geen dataverlies, geen dubbele classificaties en geen onterechte massale verwijdering. Een verbroken Picnic-verbinding stopt alleen de bijbehorende taken.

### Stap 5 Verifieer de volledige gebruikersflow

Test receptimport, lokale selectie, alternatieven, verse controle en bevestigde mandjetoevoeging. Controleer dubbele klikken, prijswijziging, onvoldoende bestellimiet, tijdelijke onbeschikbaarheid, afwijkend responseformaat en onzekere mutatie-uitkomst. Echte mandjemutaties horen bij een afzonderlijke expliciet gevraagde proef.

Meet lokale zoektijd en tijd tot het voorstel op p50/p95, cachegebruik, Picnic-aanvragen per recept, modelaanroepen, productdekking en foutieve automatische matches. Doelwaarden stellen we na een eerste baseline vast. De pilot rapporteert aantallen unieke verkoop-ID’s en de waargenomen accountcontext; ‘alle Picnic-producten’ wordt pas geclaimd met bewijs van volledige dekking.

## Besluit

Bouw een eigen productindex en gecontroleerde ingrediëntkoppelingen bovenop de bestaande app. Gebruik periodieke synchronisatie voor ontdekking en onderhoud en verse Picnic-controles voor definitieve keuzes. Maak een volledige cataloguscrawl afhankelijk van de categorieproef, zodat de app ook bij onvolledige API-dekking sneller en beter kan werken. De eerste uitvoeringstaak is de begrensde leesproef uit stap 1.
