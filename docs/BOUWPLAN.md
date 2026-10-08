# Van recept naar Picnic: plan voor de pilot

Samengesteld op 8 oktober 2026 uit de herstelde gesprekken, bevestigde keuzes en technisch bronnenonderzoek. De specificatie is nu samenhangend genoeg om uitvoering te plannen. Er is nog geen nieuwe app gebouwd, betaald abonnement geactiveerd of productieomgeving ingericht.

## Het product

Een uitgenodigde gebruiker logt in op een vast eigen account, importeert een recept via link, tekst of afbeelding en bewaart de bewerkbare inhoud. Na keuze van het aantal personen stelt de app passende Picnic-producten voor. De standaard is de laagste totale prijs voor voldoende product; expliciet onthouden producten krijgen voorrang. De gebruiker ziet verpakkingen, overschot, prijs en eventuele afwijkingen, kan bestaande boodschappen bewust laten meetellen en keurt daarna één receptactie goed.

De app laat zien wat werkelijk is toegevoegd. Bij een onzekere uitkomst stopt zij en helpt zij controleren; zij probeert niet ongemerkt opnieuw. De gebruiker rondt bestellen en betalen zelf af in Picnic.

De eerste pilot is Nederlands, mobiel en besloten, voor maximaal tien mensen inclusief Stef. Latere aankoopwensen zoals biologisch zijn voorzien in het model, maar krijgen pas in een volgende uitbreiding hun eigen instellingen en conflictregels. Een eigen account, bronafbeeldingen bewaren, corrigeren en betrouwbaar toevoegen horen wel bij de eerste pilot.

## Leeswijzer en besluiten

| Document | Functie |
| --- | --- |
| [Projectstatus](PROJECTSTATUS.md) | Herkomst, teruggevonden werk, bevestigde keuzes en werkelijk bereikte status |
| [Begrippen](../CONTEXT.md) | Betekenis van recept, voorstel, toevoegactie en voorkeur |
| [Productselectie](PRODUCTSELECTIE.md) | Schalen, geschiktheid, prijs, verpakkingen, mandtoewijzing en afwijkingen |
| [Accounts](ACCOUNTS.md) | Inloggen, koppelen, beheer en verwijderen |
| [Betrouwbaarheid](BETROUWBAARHEID.md) | Goedkeuring, gedeeltelijk slagen, onbekende uitkomst en herstel |
| [Technisch ontwerp](TECHNISCH-ONTWERP.md) | Stack, leveranciers, queues, runtimegrenzen en onderbouwing |
| [Datamodel](DATAMODEL.md) | Eigenaarschap, relaties, hoeveelheden, versies en invarianten |
| [Import en AI](IMPORT-EN-AI.md) | Herkenning, invoerbeveiliging, budgetten en quota |

Codex heeft reguliere ontwerpdetails zelfstandig ingevuld. Dat voorkomt een nieuwe vragenronde over ieder getal. Bevestigde gebruikerskeuzes gaan vóór die standaardinstellingen en vóór de oude specificatiebranch. Een technische proef kan een gekozen hulpmiddel afwijzen zonder de productafspraken te veranderen.

## Belangrijkste schermen

1. **Mijn recepten:** bewaarde recepten, zoeken, importeren en zichtbaar herstel van een onderbroken import. Geen Picnic-koppeling nodig om te bewaren.
2. **Import controleren:** bron en herkende gegevens naast elkaar, titel, porties, ingrediënten en beschikbare stappen bewerken. Onduidelijkheden bij de betreffende regel tonen; conceptstatus en vervaldatum zichtbaar.
3. **Boodschappen voorbereiden:** aantal personen, geschaalde behoefte en productvoorstellen. Per regel prijs, verpakking, overschot, onthouden keuze en eventuele afwijking. Bestaande mandinhoud apart tonen met expliciete toewijzing.
4. **Controleren en toevoegen:** volledige samenvatting voor één recept. Onopgeloste noodzakelijke keuzes blokkeren toevoegen. De knop noemt het aantal verpakkingen en totaalbedrag; expliciete afwijkingen worden vóór die knop afgehandeld.
5. **Resultaat en herstel:** voortgang per aankoopregel en onderscheid tussen toegevoegd, niet verstuurd en onbekend. Bij gedeeltelijk slagen alleen een nieuw voorstel voor toepasselijke resterende regels.
6. **Account en koppeling:** vaste app-identiteit, Picnic-koppelvenster, koppelstatus, apparaten uitloggen, ontkoppelen en verwijderen. Elke actie legt het eigen gevolg uit.
7. **Beheer:** uitnodigingen, beschikbare plekken, blokkeren, quota, kosten en foutstatus. Geen recepten bekijken tenzij bewust meegestuurd als feedback.

De mobiele flow behoudt ingevoerde gegevens bij sluiten van een venster of verlopen koppeling. Toetsenbordfocus, zichtbare labels, foutmeldingen, voldoende contrast en bedienbare aanraakvlakken horen bij iedere fase. Status wordt niet alleen met kleur aangegeven. Upload- en toevoegvoortgang blijven terugvindbaar na het sluiten van de browser; uitvoering volgt wel de sessie- en intrekkingsregels.

## Bouwvolgorde met oplevercriteria

### 0. Technische toelatingsproeven

Kleine wegwerpbare proeven in een geïsoleerde testomgeving; geen migratie van het prototype en geen productiegebruik. Verifieer de exacte `picnic-api`-release op Workers, de Better Auth/D1/OTP-flow en gemeten Free CPU-marge. Test uitnodigingsraces, directe sessie-intrekking, sessieduur en sleutelversleuteling. Toon veilige URL-ophaling aan of beperk het eerste linkaanbod expliciet tot getoetste bronnen.

**Gereed wanneer:** de technische aannames met vastgelegde versies en reproduceerbare resultaten zijn bevestigd, of een concreet alternatief is gekozen. Voor extra terugkerende kosten zoals Workers Paid is eerst een echte kostenbeslissing nodig; er wordt geen abonnement stil geactiveerd. Echte Picnic-validatie blijft een afzonderlijke beperkte proef met eigen account en bewuste testboodschappen. Voorwaarden/toelaatbaarheid zijn vóór een vriendenpilot beoordeeld; de wrapperlicentie is geen bewijs daarvan.

### 1. Vast account en bewaarbaar recept

Maak gescheiden omgevingen, uitnodiging/e-mailcode, sessies, persoonlijke opslag, handmatig recept invoeren en bewerken. Voeg accountbeheer en de eerste verwijdertaak meteen toe. Een uitnodiging maakt maximaal één account; een terugkerende gebruiker ziet dezelfde recepten.

**Gereed wanneer:** twee accounts elkaars objecten niet kunnen lezen of wijzigen, blokkeren direct werkt en recepten zonder Picnic bewaard blijven. De sessiegrenzen worden met een testklok bewezen. Geen blijvende Picnic-wachtwoorden of prototypegebruikers overnemen.

### 2. Importeren en controleren

Voeg tekst, foto's en toegelaten links toe, met private bronopslag en achtergrondverwerking. Eerst deterministisch uitlezen waar mogelijk, daarna begrensde AI-herkenning. Bouw budgetreservering vóór de eerste betaalde modelaanroep. Maak onzekerheden bewerkbaar en afbeeldingen apart verwijderbaar.

**Gereed wanneer:** de referentierecepten correct te controleren zijn, ontbrekende informatie niet wordt verzonnen en technische duplicaten verdwijnen zonder receptonderdelen te verliezen. Budget-, opslag- en e-maillimieten blijven onder gelijktijdig gebruik intact. Herladen of een dubbel queuebericht veroorzaakt geen extra betaalde poging.

### 3. Picnic koppelen en een voorstel maken

Koppel via het afzonderlijke toegankelijke venster, hervat met een beschermde sessiesleutel en lees producten en mandinhoud. Implementeer de rekenmodule onafhankelijk van de adapter, met exacte hoeveelheden, geschikte producten, verpakkingscombinaties, expliciete voorkeuren en mandtoewijzing. In deze fase alleen lezen en voorstellen maken.

**Gereed wanneer:** actuele productdata voldoende betrouwbare eenheden, kenmerken en prijzen opleveren. De voorbeelden uit productselectie werken; onbekende conversies en vervangingen leiden tot een zichtbare keuze. Opnieuw koppelen maakt verouderde voorstellen onbruikbaar.

### 4. Goedkeuren, toevoegen en herstellen

Voeg versiegebonden goedkeuring, transactionele taakopslag, uitvoering per regel, actuele hercontrole en herstel toe. Bouw stopinstellingen voor toevoegen en AI. Toon ontvangen API-bewijs en gebruikersverklaringen als verschillende soorten resultaat.

**Gereed wanneer:** dubbel klikken en queueherlevering intern één uitvoering geven, een prijsstijging nieuwe toestemming vraagt en uitval na externe verzending nooit tot blind herhalen leidt. Gedeeltelijk slagen en onbekende uitkomsten zijn via de interface af te handelen zonder bevestigde regels opnieuw te kopen.

### 5. Beperkte pilot en overdraagbare oplevering

Maak privacy-uitleg, operationele instructies, beheerscherm en herstelprocedure af. Doe de verwijder-/back-upherstelproef en de mobiele toegankelijkheidscontrole. Begin met Stef en een klein aantal uitgenodigden; breid alleen uit als gebruik en foutafhandeling kloppen, maximaal tien accounts.

**Gereed wanneer:** de onderstaande acceptatiematrix is uitgevoerd, resterende beperkingen zichtbaar zijn, kostenmonitoring werkt en de productieconfiguratie bewust is gecontroleerd. Iedere deployment heeft terugrolinstructies die de duurzame actiestatus behouden. De pilot bestelt of betaalt nooit automatisch.

## Acceptatiematrix

Dit zijn te implementeren en uit te voeren controles, geen reeds geslaagde tests. Unit-tests toetsen rekenregels; integratietests toetsen transacties en adapters; mobiele eindgebruikersproeven toetsen de hele flow. Echte Picnic-tests dienen alleen om externe aannames beperkt te bevestigen.

| Geval | Verwachte uitkomst |
| --- | --- |
| Twee accounts raden elkaars recept-, upload- of actie-ID | Geen lees- of schrijftoegang, ook niet via feedback of beheer |
| Gelijktijdig de laatste pilotplek claimen | Hoogstens één nieuwe bezette plek, nooit meer dan tien |
| Oude sessie, geblokkeerd account of ingetrokken startsessie | Toegang en nog niet verzonden acties stoppen volgens het sessiebeleid |
| 350 g voor twee personen naar vier personen | Eerst 700 g behoefte; daarna pas verpakkingskeuze |
| 200 g expliciet aanwezig bij 700 g behoefte | Voorstel koopt voldoende voor de resterende 500 g |
| Acht stuks kip, alleen gramverpakking bekend | Geen ongefundeerde conversie; gebruiker moet de behoefte oplossen |
| Dezelfde ingrediëntenlijst dubbel op een pagina | Eén bronlijst; echte onderdelen blijven apart herkenbaar |
| Onthouden product duurder dan passend alternatief | Onthouden product voorgesteld, goedkoper alternatief zichtbaar |
| Andere variant als vervanging | Afzonderlijke expliciete acceptatie of overslaan vereist |
| Goedkoopste combinatie heeft meerdere verpakkingsgroottes | Alleen dezelfde productvariant combineren, voldoende inhoud en correct totaal |
| Prijs stijgt na goedkeuring | Gewijzigd voorstel en nieuwe goedkeuring vóór betrokken aankoop |
| Alleen prijs daalt, al het overige identiek | Uitvoering toegestaan, werkelijke lagere prijs zichtbaar |
| Recept of mandtoewijzing wijzigt na goedkeuring | Geen uitvoering met stil aangepaste inhoud |
| Dubbel klikken plus dubbele queuelevering | Dezelfde interne actie; geen dubbele eigen verzending |
| Crash na Picnic-succes vóór lokale bevestiging | Uitkomst onbekend; geen automatische herhaling |
| Regel vier onzeker na drie successen | Drie bevestigd, één onbekend, rest onverstuurd; veilig herstel |
| Promptinjectie in pagina of foto | Geen tools, nieuwe machtigingen of externe aankopen |
| Private URL, redirect naar intern adres of DNS-wissel | Ophalen geweigerd of generieke linkfunctie nog niet toegelaten |
| Honderd gelijktijdige AI-reserveringen rond budgetgrens | Zowel gebruikers- als appgrens blijven intact |
| AI-time-out en opnieuw geleverd bericht | Reservering blijft meetellen; geen tweede betaalde poging |
| Account verwijderd tijdens import/uitvoering | Geen nieuwe persoonlijke data of verzending; eigen opslag wordt opgeruimd |
| Herstel van een oude databaseback-up | Verwijderde accounts/sleutels blijven ontoegankelijk na opnieuw toepassen verwijderlijst |
| Toetsenbord, schermlezer, smal scherm en foutmelding | Koppelen, corrigeren, goedkeuren en herstel blijven begrijpelijk bedienbaar |

## Wat vaststaat en wat nog bewijs vraagt

Productflow, standaardselectie, accounts, grenzen voor AI en betrouwbaarheid zijn uitgewerkt. De gekozen stack is React/Vite, Cloudflare Workers/D1/R2/Queues, Better Auth en Resend. Het bronnenonderzoek ondersteunt die keuze, maar uitvoerbaarheid binnen Workers Free, de exacte Picnic-wrapper, werkelijke productvelden, veilige URL-ophaling en leveranciersretentie blijven toelatingsproeven.

De oude branch en de lokale URL-helperfix worden niet blind samengevoegd. Bij aanvang van bouwen beoordelen we afzonderlijk welke frontendonderdelen bruikbaar zijn. Automatisch toevoegen boven een AI-confidencegrens, in-memory accounts en XOR-opslag worden niet overgenomen.

De eerste uitvoeringsstap is fase 0. Het plan zelf is nu opgesteld; open technische bewijzen zijn werkpakketten, geen nieuwe reeks voorkeursvragen aan de gebruiker.
