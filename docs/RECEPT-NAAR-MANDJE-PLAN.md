# Recept naar Picnic-mandje — productplan en overdracht

> **Actuele overdracht — 9 oktober 2026:** de lokale flow is gebouwd. Lees `RECEPT-NAAR-MANDJE-VERIFICATIE.md` voor implementatie en testbewijs en `VOLGENDE-SESSIE-PROMPT.md` voor de vervolgopdracht. Oudere beschrijvingen van de beginsituatie hieronder zijn historisch. De gebruiker heeft expliciet toestemming gegeven voor één echte mandjesproef: **1 verpakking Gele uien, 3 stuks, € 0,80**. Deze proef is op 9 oktober eenmalig uitgevoerd en geslaagd; de toestemming is verbruikt. Niet opnieuw toevoegen. Zie de aanvulling in het verificatierapport. Voor exact deze selectie is geen nieuwe toestemming nodig; andere producten, een hogere prijs, bestellen of betalen vallen buiten dit akkoord. Behoud alle bestaande wijzigingen en lokale gegevens.

Vastgelegd: 8 oktober 2026. Werkmap: `/Users/stef/Code/picnic`.

Dit document legt de expliciete besluiten uit de laatste gebruikerssessie vast. Voor de hier beschreven productflow vervangt het tegenstrijdige oudere ontwerpkeuzes in onder meer BOUWPLAN, MVP-FOCUS, PRODUCTSELECTIE en PILOT-RELEASE. Bestaande technische beveiliging en gegevensintegriteit blijven gelden. Oudere documenten zijn achtergrond, geen reden om deze productbesluiten opnieuw ter discussie te stellen.

## 1. Doel

Een gebruiker maakt een foto van een recept of plakt een URL, kiest het aantal personen en krijgt automatisch passende Picnic-boodschappen. In het normale geval zijn na bronkeuze twee bevestigingen voldoende:

1. **Zoek mijn boodschappen**: bron uitlezen, recept automatisch bewaren, alle ingrediënten matchen en aantallen berekenen.
2. **Voeg N producten toe**: de geselecteerde boodschappen in één keer aan het bestaande Picnic-mandje toevoegen.

De kern is boodschappen doen, niet een uitgebreid kookboek beheren. Geen verplichte recepteditor, handmatige zoekactie per ingrediënt, apart opslaan of extra voorstelbevestiging tussen deze twee stappen. Bereiding en brongegevens mogen behouden blijven maar domineren deze route niet.

De gebruiker wil uiteindelijk richting 10.000 gebruikers groeien en de oplossing aan Picnic pitchen. Dat is de langetermijnambitie, geen opdracht om nu een grote infrastructuur, alle wereldwijde ingrediënten of een complete supermarktinterface te bouwen.

## 2. Vaststaande productbesluiten

### Bron en porties

- Eén recept per keer; meerdere recepten gezamenlijk plannen is voor later.
- Recepten komen uitsluitend uit URL's of foto's, niet uit vrije tekst of AI-bedachte recepten.
- Gewenst aantal personen staat bij de import.
- Ontbreekt het oorspronkelijke aantal personen, stel één gerichte vraag. Niet raden en niet stilzwijgend gelijkstellen aan het gewenste aantal.
- Bij een bron met meerdere recepten mag een noodzakelijke receptkeuze worden gevraagd; het normale geval met één recept gaat automatisch door.

### Productkeuze

- Standaard trouw aan het recept. Geen automatische vegetarische of andere inhoudelijke vervangingen.
- Binnen passende producten kiezen we de laagste totaalprijs voor voldoende hoeveelheid; niet noodzakelijk de laagste kiloprijs of het minste overschot.
- Voorbeeld: 600 g nodig, 2 × 300 g kost €5, 1 kg kost €4: kies 1 kg.
- Een grotere verpakking van hetzelfde ingrediënt is geen vervanging. Twee uien nodig, alleen een zak beschikbaar: stel een geschikte zak voor, niet nul uien.
- Bij grotere behoeften moet het aantal verpakkingen wel voldoende zijn. Geen universele regel “onbekend = altijd één verpakking”.
- Verpakkingsaantallen mogen onderbouwd worden geschat; toon dit compact en laat ze aanpassen.
- Onduidelijke hoeveelheden mogen niet het volledige recept of alle andere boodschappen blokkeren.

### Overzicht en alternatieven

- Toon recepttitel en ingrediënten naast gekozen Picnic-producten, verpakkingsaantallen en prijzen.
- Alle gewone boodschappen zijn standaard geselecteerd.
- Klik op een product om een compacte popup met passende alternatieven te openen.
- Toon andere merken/verpakkingen van hetzelfde ingrediënt eerst; mogelijke vervangingen staan apart.
- Vervangingen vereisen een expliciete keuze, ook als er geen exacte match is.
- Producten en aantallen zijn aanpasbaar; regels kunnen worden uitgevinkt.
- Na een productwijziging staat een opt-in **Onthoud mijn keuze voor dit ingrediënt** beschikbaar, standaard uit.
- Alleen na opt-in wordt die keuze een persoonlijke voorkeur. Die geldt alleen voor de betreffende gebruiker, zolang het product beschikbaar en inhoudelijk passend is.
- Geen impliciet leren van elke wijziging. Automatische dieetpersonalisatie zoals kip vervangen door vegetarische stukjes is uitgesteld.

### Voorraad en ontbrekende ingrediënten

- Begin met een beperkte voorraadlijst: zout, zwarte peper en gewone bakolie.
- Voorraadproducten staan altijd zichtbaar onderaan, standaard uitgevinkt, en kunnen worden aangevinkt.
- Rijst, bloem, suiker, specifieke oliën en overige specerijen worden niet automatisch als aanwezige voorraad beschouwd.
- Een ontbrekend ingrediënt blokkeert de gevonden producten niet.
- Vermeld ontbrekende ingrediënten duidelijk vóór bevestiging; laat eventuele vervangingen kiezen.
- De bevestigingsknop benoemt het werkelijke geselecteerde aantal producten en suggereert niet dat een onvolledig recept compleet is.

### Optellen en toevoegen

- Tel dezelfde ingrediënten binnen het recept op vóór het afronden naar verpakkingen, ook over secties zoals marinade en dressing.
- Behoud de verwijzing naar de oorspronkelijke ingrediëntregels. Verschillende vormen zoals verse en gedroogde kruiden zijn niet automatisch hetzelfde.
- Trek bestaande mandinhoud nooit automatisch af: die kan voor andere gerechten of weekboodschappen bedoeld zijn.
- Voeg geselecteerde producten na één akkoord toe. Voorkom dubbele verzending bij dubbelklikken, herladen en herhaalde netwerkverzoeken.
- Is een product vlak voor of tijdens toevoegen niet beschikbaar: laat overige uitvoerbare regels doorgaan, meld wat ontbreekt en wissel niet stilzwijgend van product.
- Maak onderscheid tussen aantoonbaar niet toegevoegd en onbekende uitkomst. Bij een onbekende uitkomst niet blind opnieuw verzenden.
- Toon na afloop wat daadwerkelijk is toegevoegd. Toevoegen is geen bestelling plaatsen of afrekenen.

## 3. Kennisbank: richting en begrenzing

De gebruiker stemde in met starten bij veelgebruikte ingrediënten en uitbreiden vanuit echte imports. Een universele database is geen voorwaarde voor de eerste werkende flow.

Bouw in kleine stappen:

1. **Ingrediënten en synoniemen**: canonieke begrippen plus benamingen, taal en relevante vorm/variant. Bijvoorbeeld bosui/lente-ui. Houd een synoniem gescheiden van een vervanging.
2. **Hoeveelheden**: exacte eenheidsconversies in code; aparte, van bron en onzekerheid voorziene schattingen voor stuksgewichten en ingrediëntafhankelijke volume/gewicht-conversies. Een eetlepel bloem is niet hetzelfde gewicht als een eetlepel olie.
3. **Productindex**: Picnic-ID, productnaam, verpakking, kenmerken en laatst gecontroleerde gegevens. Gebruik actuele gegevens voor de gekoppelde klant bij de uiteindelijke controle.
4. **Gecontroleerde matches**: herbruikbare ingredient-productrelaties, met herkomst en versie. Persoonlijke opt-invoorkeuren blijven apart.

De verwerking wordt: bron uitlezen → bekende ingrediënten/regels toepassen → productkandidaten ophalen → onbekende of ambigue matches beoordelen → hoeveelheden en verpakkingen in code berekenen.

Stuur nooit de volledige kennisbank naar een model. Hergebruik zoekresultaten en bewezen matches waar dat geldig is. Een andere productkeuze mag geen volledige receptimport veroorzaken.

### Wat nog onderzocht moet worden

- Volledige Picnic-catalogus ophalen en wekelijks synchroniseren is een idee, geen bewezen API-mogelijkheid of afgesproken uitvoering. Onze huidige wrapper is onofficieel en de app heeft nu productzoekfuncties.
- Een periodieke index is niet automatisch actueel voor prijzen, aanbiedingen, assortiment en beschikbaarheid. Houd rekening met gebruikers-/marktcontext; deel geen accountgegevens of klantgebonden resultaten blind over gebruikers.
- Bestaande bronnen zoals FoodOn en Open Food Facts kunnen helpen, maar zijn geen kant-en-klare Nederlandse recepten-naar-Picnic-database. Controleer bruikbaarheid, dekking, herkomst en licentie vóór overname. Houd brondata en eigen gegevens traceerbaar.
- Geen omvangrijke cataloguscrawl, betaalde nieuwe dienst of infrastructuurverbouwing starten alleen omdat dit in de richting past.

## 4. Rol van Jev

Jev is een kandidaat voor selectie/classificatie uit gevonden producten, niet voor het uitlezen van foto's. De gebruiker ziet dit als kans om matching sneller en goedkoper te maken.

- De bestaande Luna-import blijft de bron uitlezen waar nodig.
- Code handelt bekende aliassen en onderbouwde matches af.
- Jev kan bij onbekende gevallen productgeschiktheid beoordelen, inclusief “geen passende kandidaat”.
- Porties, eenheden, aantallen en kosten worden met code berekend, niet door Jev.
- Jev is nog niet geïntegreerd en er is geen betaalde kwaliteitstest uitgevoerd. Beschikbare credentials/toegang zijn niet vastgesteld.
- Test eerst een kleine representatieve Nederlandse set: kookroom/slagroom, vers/gedroogd, puree/passata/blokjes, stuks versus zakken. Vergelijk met eenvoudige regels en de beschikbare bestaande modelroute.
- Een confidence-score is geen bewezen correctheid. Beoordeel verkeerde automatische matches en benodigde gebruikerscorrecties.
- Blokkeer de hele productflow niet op een ontbrekende Jev-sleutel; houd de matcher vervangbaar en rapporteer eerlijk welke route werkelijk is getest. Geen fictieve matches of mockresultaten als echt presenteren.

Onderzoek: taak **Onderzoek Jev als ingredient-classi**, ID `01a11cf4-f60a-76c1-9b2b-6b005e4e4322`.
Bronnen: https://docs.typesafe.ai/primitives/choice, https://docs.typesafe.ai/models, https://foodon.org/, https://github.com/openfoodfacts/openfoodfacts-server/blob/main/docs/api/index.md, https://github.com/MRVDH/picnic-api.

## 5. Technische overdracht — huidige toestand

### Aantoonbaar gedaan

- Bestaande werkmap heeft veel niet-gecommitte wijzigingen. Behoud die; geen reset, checkout of opruiming van onbekende wijzigingen.
- Lokale URL-import van `https://www.culy.nl/recepten/kip-marbella/` slaagde daadwerkelijk via OpenAI.
- Laatste geslaagde proef: import `dbcd1d1c-a287-4dcc-8b41-9f97c2c2531e`, herkenning `ready`, één geslaagde AI-poging, **Kip Marbella met rijst**, 4 personen, 18 ingrediënten, 4 stappen.
- Gebruik: 2.365 invoertokens, 1.759 uitvoertokens. Lokale budgetadministratie rondde conservatief af op 1 cent; dit is geen verklaring van de exacte providerfactuur.
- Geen echte foto-import of nieuwe automatische productmatching tot en met mandje bewezen in deze sessie.
- De afgesproken tweeschermenflow is nog NIET geïmplementeerd. Er is alleen code gelezen voor die verandering voordat de gebruiker het ontwerpgesprek begon.

### Importfixes en kosteninstellingen

- `.dev.vars` bevat de lokale geheimen. Niet printen, kopiëren naar documentatie of committen. De gebruiker heeft API-tegoed aangevuld.
- Wrangler negeerde AI-variabelen doordat ze niet in de lokale `secrets.required` stonden; dat is in `wrangler.jsonc` hersteld.
- Database accepteerde invoertarief 10 terwijl de code 13 reserveerde. `migrations/0012_ai_input_price.sql` herbouwt de tabel met behoud van gegevens en triggers en accepteert oude en nieuwe tarieven. Lokaal toegepast en op integriteit gecontroleerd. Migratie 0011 is ook nog ongecommit; niets verwijderen.
- `worker/imports/ai.ts`: Luna, `reasoning.effort: none`, maximaal 24.000 invoertokens, 6.000 uitvoertokens; vooraf tellen/reserveren; generatietimeout 60 seconden en herstelgrens 65 seconden.
- Ongeschikte hoeveelheidnotatie wordt als onbekend met controlepunt bewaard, in plaats van het hele recept opnieuw betaald te extraheren.
- Porties zoals “4 personen” worden genormaliseerd. Niet interpreteerbare porties blijven leeg.
- `worker/imports/processor.ts`: navigatie en voetteksten uit tekstinvoer verwijderd. Gooi niet zomaar alle sidebars weg: Culy zet ingrediënten buiten de hoofdtekst.
- `src/lib/import-photo.ts`: foto's lokaal opnieuw gecodeerd, metadata verwijderd en langste zijde maximaal 2048 pixels. Kleiner beeld wordt niet opgeschaald. Dit is met mocks getest, geen echte fotokwaliteitsbenchmark.
- `worker/queue.ts`: ook na een AI-job eventuele begrensde herstelpoging dispatchen. Geen onbegrensde retries invoeren.
- Veilige foutdiagnostiek vermeldt codes/validatiecategorieën, geen sleutels of volledige bronfoto's.

### Lokaal draaien

- Frontend: `http://localhost:5173/`, backend: `http://localhost:8787/`. Controleer actuele processen; niet aannemen dat ze nog draaien.
- Backend werd gestart met `npm run dev:worker -- --local`: gewone start bleef hangen bij een externe e-mailbinding. `--local` schakelt remote bindings uit; Culy/OpenAI-HTTP-verzoeken zijn nog echte externe verzoeken.
- Backendlog van deze sessie: `/tmp/picnic-culy-worker.log`. Inspecteer gefilterd; neem niet aan dat alle logs veilig volledig afgedrukt kunnen worden.
- Lokale scheduled jobs lopen niet vanzelf. Indien nodig bestaand herstelpad activeren; geen nieuwe imports als vervanging voor onbekende reeds verzonden pogingen.
- Laat hot reload afronden voordat je een echte import start; een herstart tijdens een job kan verwerking onderbreken.

### Belangrijke code en beperkingen

- `src/components/ImportPanel.tsx`: huidige import en polling; nog uitgebreid controlescherm en extra klik.
- `src/components/RecipeWorkspace.tsx`: import wordt nu een bewerkconcept; opslaan/detail/productkeuze zijn losse stappen.
- `src/components/RecipeProducts.tsx`: huidige productzoekactie en geschiktheids-/basisbevestiging zijn handmatig per ingrediënt. Ook voorstel controleren en goedkeuren zijn aparte klikken.
- `src/lib/product-plan.ts`, `worker/domain/productSelector.ts`, `worker/domain/quantityMath.ts`: bestaande exacte berekeningen hergebruiken waar passend.
- `shared/proposals.ts`, `worker/routes/proposals.ts`: server verlangt nu een keuze voor ELK ingrediënt, bekende porties en bruikbare exacte/rangehoeveelheden. Dat past nog niet bij uitgevinkte voorraad, ontbrekende matches en geschatte aantallen. Een frontend-only vereenvoudiging lost dit niet op.
- `worker/routes/actions.ts`, `worker/additions/processor.ts`, `src/components/AdditionStatus.tsx`: bestaande toevoeging, gedeeltelijke/onbekende uitkomsten en herstel behouden en aanpassen aan nieuwe selectie.
- `worker/adapters/picnic.ts`: werkelijke API-koppeling; geen volledige catalogussync.
- Houd oorspronkelijke recepthoeveelheid, schatting en door gebruiker gekozen verpakkingsaantal expliciet uit elkaar. Geen verzonnen exacte recepthoeveelheid opslaan om oude validatie te omzeilen.
- Onderzoek samenvoeging van ingrediënten én aankoopregels zorgvuldig: niet dubbel afronden of hetzelfde product onbedoeld meerdere keren toevoegen.
- `src/services/picnicService.ts` heeft belangrijke bestaande gebruikerswijzigingen. Laat deze intact; geen terugzetten. SHA-1 aan einde eerdere werkzaamheden: `2fac3b7a1aaaecc3d8797c73f1b8b2bee27e97b2` (alleen referentie, later gewijzigde inhoud niet overschrijven).

### Eerder geslaagde controles

- `npm run typecheck:worker`
- `npx tsc -p tsconfig.app.json --noEmit`
- `npm run test:worker -- worker/imports/ai.test.ts worker/imports/extract.test.ts worker/queue.test.ts test/import-photo.test.ts`: 12 tests, 4 bestanden.
- `tsconfig.worker.json` sluit de browserfototest uit van de Worker-typeomgeving. Vitest voert die test wel uit.
- Dit bewijst geen volledig groene hele testsuite of volledige mandjesflow. Controleer relevante wijzigingen opnieuw tijdens implementatie.

## 6. Aanbevolen bouwvolgorde

### A. Bestaande toestand kort vaststellen

Lees dit document en relevante code, controleer gitstatus en eventuele AGENTS.md. Breng de verschillen met deze flow in kaart. Stel reeds genomen productkeuzes niet opnieuw als vragen. Geen algemeen herontwerp of herschrijven van alle documentatie.

### B. Een complete route voor bestaande Culy-import

- Maak een klein expliciet model voor geselecteerde, uitgevinkte, ontbrekende en vervangen ingrediënten; exacte versus geschatte aantallen en persoonlijke voorkeuren.
- Pas contracten/servervalidatie aan voor geselecteerde deelverzamelingen, ontbrekende ingrediënten, samengevoegde aankopen en aanpasbare aantallen. Handhaaf eigenaar-/sessiecontrole, actuele productcontrole en idempotentie.
- Bouw automatische kandidaatzoekactie voor alle ingrediënten met beperkte gelijktijdigheid en hergebruik binnen de import. Toon voortgang zonder aparte handmatige zoekknoppen als verplichte stap.
- Verbind import rechtstreeks aan de compacte lijst. Receptgegevens automatisch bewaren, maar niet bij render/effect-herhaling dubbel creëren.
- Voeg productpopup, voorraadgroep en één definitieve toevoegknop toe. Actuele controle gebeurt achter die knop, geen extra standaard “controleer voorstel”-scherm.
- Test met de reeds geïmporteerde Culy-bron waar mogelijk om AI-kosten te beperken.

### C. Kennis en matching gericht toevoegen

Begin met kleine, traceerbare alias-/voorraad-/omrekentabellen, productindex en gecontroleerde matches. Voeg persoonlijke voorkeuropt-in toe. Evalueer Jev afzonderlijk met echte voorbeelden voordat automatische beslissingen eraan worden toevertrouwd. Geen volledige catalogusimport als voorwaarde voor B.

### D. Foto's en uitzonderingen

Laat een echte receptfoto door dezelfde flow lopen. Test ontbrekende basisporties, onbekende hoeveelheden, voorraad aanvinken, product wisselen, onthouden met opt-in, dubbele ingrediënten en niet-beschikbare producten.

### E. Verifiëren en bewijs bewaren

Draai relevante server-/berekeningstests, typechecks en build. Controleer de interface zelf via de lokale browser, ook op mobiele breedte. Scheid mocktests van echte providerresultaten in de rapportage.

Een echte mandjesproef verandert de gebruikersmand. Bereid een concrete kleine selectie voor en vraag daarvoor de afgesproken expliciete toestemming, tenzij de gebruiker die voor die selectie al heeft gegeven. Wel alle andere implementatie en verificatie zelfstandig afronden; niet vroeg stoppen met een algemeen verzoek om te testen.

## 7. Acceptatiecriteria

- Normaal geval: na bron- en personenkeuze twee bevestigingen; geen recepteditor of individuele productzoekactie nodig.
- Alle ingrediënten krijgen automatisch een passende match, een duidelijk ontbrekend-resultaat of een expliciet te kiezen vervanging.
- Selectie blijft trouw aan het recept; geen automatische dieetvervanging.
- Goedkoopste totale passende hoeveelheid wordt gekozen; 2 uien kunnen een zak opleveren; grote behoeften krijgen voldoende verpakkingen.
- Dubbele ingrediënten worden vóór verpakkingsafronding opgeteld met behoud van bronverwijzingen.
- Voorraad staat zichtbaar onderaan en uit; overige boodschappen aan; uitgevinkte regels worden niet toegevoegd.
- Ontbrekende ingrediënten blokkeren de rest niet; lijst en knop communiceren de werkelijke selectie.
- Productpopup scheidt passende alternatieven van vervangingen; prijs en aantallen zijn inzichtelijk.
- Voorkeur alleen opslaan na expliciete opt-in, per gebruiker en passend ingrediënt/variant.
- Ontbrekende basisporties leiden tot één vraag, niet tot een stille aanname.
- Bestaand mandje blijft behouden en wordt niet afgetrokken; herhaalde bevestiging veroorzaakt geen dubbele actie.
- Bij gedeeltelijke toevoeging wordt per product eerlijk gerapporteerd; onbekende uitkomsten worden niet automatisch opnieuw verstuurd.
- Geen bereidingswijze, technische randinformatie of lange uitleg in de primaire boodschappenroute.

## 8. Grenzen en werkwijze

- Werk lokaal in deze repository. Geen deployment, nieuwe externe diensten of betaalde abonnementen zonder gerichte opdracht/toestemming. Jev evalueren is gewenst, maar onbeperkt betaald testen niet.
- Geen subagents: de gebruiker heeft die in deze sessie uitgesloten.
- Print geen geheimen. Behoud alle bestaande wijzigingen en lokale data. Maak een backup vóór een risicovolle lokale migratie; voer migraties niet remote uit.
- Voeg geen extra productfuncties toe zoals voedingsadvies, weekplanning, automatische dieetpersonalisatie of een volledige supermarktvervanger.
- Ontwerp voor scheiding tussen gebruikers en voor vervangbare matching/catalogusonderdelen; schaalbehoefte eerst meten in plaats van nu nieuwe diensten introduceren.
- Geef tijdens werk concrete voortgang. Lever werkend bewijs of een precies aangetoonde blokkade. De gebruiker raakt gefrustreerd van steeds toestemming vragen voor al opgedragen werk of hem ongeteste wijzigingen laten uitproberen.

## 9. Meetpunten voor latere pitch

Leg vóór een grotere proef vast: correct gematchte ingrediënten, foutieve automatische matches, correcties per recept, aandeel recepten dat in twee bevestigingen lukt, tijd tot boodschappenlijst, werkelijke tokens/kosten inclusief retries, succesvolle en gedeeltelijke mandtoevoegingen. Meet gebruik/retentie later met echte gebruikers. Nog geen bewezen geschiktheid voor 10.000 gebruikers of koopinteresse van Picnic claimen.
