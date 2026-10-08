# MVP uitvoering

Start 8 oktober 2026. De gebruiker heeft het bouwplan goedgekeurd en opdracht gegeven de MVP met directeur, managers en goedkopere uitvoerders te bouwen. Deze opdracht vervangt de eerdere grens ‘alleen specificeren’. Het volledige [bouwplan](BOUWPLAN.md) blijft de scope; een demonstratie met mocks is geen afgeronde pilot.

## Werkverdeling

De directeur integreert, bewaakt scope en voert de eindcontrole uit. Vakmanagers gebruiken GPT-6 Sol; hun uitvoerders GPT-6 Luna. Er zijn maximaal vier gelijktijdige agents beschikbaar. Daarom lopen implementatie en onafhankelijke reviews in rondes; niet alle managers houden tegelijk een uitvoerder bezet.

| Rol | Verantwoordelijkheid | Status |
| --- | --- | --- |
| Infrastructuurmanager | Workers-runtime, lokale bindings, pakketten, build/testconfig en deployvoorbereiding | Lokale basis geïmplementeerd en akkoord na manager- en directeurscontrole; externe gates blijven open |
| Databasemanager | D1-schema, tenantrelaties, transacties, budgetten en verwijdering | Basis goedgekeurd na 9 D1-tests; directeur heeft deze en 2 infrastructuurtests herhaald |
| Backendmanager | Import, productberekening, Picnic-adapter, goedkeuring en duurzame uitvoering | Recepten, selectie, versleutelde Picnic-adapter en importwachtrij lokaal gecontroleerd; blijvende bronopslag in review; AI, voorstellen en toevoegacties volgen |
| Accountmanager | Better Auth, uitnodigingen, sessies en accountbeheer | Eerste implementatie en API-aansluiting gecontroleerd door manager en directeur; 9 gerichte tests groen |
| Frontendmanager | Mobiele Nederlandstalige flow en toegankelijkheid | Accounts, recepten, beheer en Picnic-popup lokaal gecontroleerd; importeditor in eindcontrole |
| Beveiligingsmanager | Onafhankelijke isolatie-, geheimen-, input- en misbruikcontrole | Eerste review en gevonden verwijder-/schrijfraces afgehandeld; nieuwe import- en uitvoeringsflows krijgen aanvullende controle |
| Privacymanager | Gegevensstromen, retentie, verwijderproef en eerlijke privacy-uitleg | Hervatbare lokale D1/R2-opruiming met lease- en quota-raceproeven akkoord; live herstel- en leveranciersgates open |
| Kwaliteitsmanager | Integratietests, foutinjectie en acceptatiematrix | Gepland |
| Directeur | Integratie en definitieve controle tegen alle eisen | Actief |

Een manager geeft pas akkoord na inspectie van de uitvoerderswijzigingen en relevante testresultaten. Open bewijs of ontbrekende externe configuratie blijft zichtbaar; een groene unit-test is geen bewijs van een werkende echte Picnic-koppeling.

## Technische werkafspraken

- Root `package.json` en `package-lock.json` zijn de pakketbron; wijzigingen lopen via de infrastructuurmanager.
- Nieuwe backend onder `worker/`, SQL onder `migrations/`, gedeelde browserveilige contracten onder `shared/`.
- Bindings: `DB`, `UPLOADS`, `IMPORT_QUEUE`, `ADD_QUEUE`; expliciete `APP_ENV` en `APP_ORIGIN`.
- API onder dezelfde origin op `/api`; Vite stuurt lokaal door naar Workers zonder `/api` weg te schrijven.
- Geen publieke dev-login of credentials in een productiebundle. Testadapter en eventuele lokale mailopvang vereisen expliciete test-/ontwikkelconfiguratie.
- Behoud de oorspronkelijke ongecommitteerde wijziging in `src/services/picnicService.ts`; die staat buiten deze implementatie.
- Werkbranch: `codex/picnic-mvp`. Basiscommit: `79e121f6c15f6e920846dce5f14824afe12352ee`. Geen oude branch automatisch samenvoegen.

## Bewijsregister

### Lokale infrastructuur — manager akkoord, directeur gecontroleerd

De infrastructuurmanager heeft de uitvoerderwijzigingen geïnspecteerd en de controles zelf herhaald. De directeur heeft daarna onafhankelijk de onderstaande typechecks, build en smoke-tests uitgevoerd:

- `npm run typecheck:worker`: geslaagd, inclusief test-TypeScript.
- `npx tsc -p tsconfig.app.json --noEmit`: geslaagd na een beperkte correctie van een bestaande type-import.
- `npm run build`: geslaagd met Vite 6.4.4. Bestaande browserimport van de oude Picnic-wrapper geeft nog een crypto-waarschuwing; verwijderen uit de nieuwe frontend is een release-eis.
- `npm run test:worker`: twee tests geslaagd in de lokale Workers-runtime. Getoetst: D1 read/write, private R2 read/write, queueproducerbindings en de MD5/login-code van `picnic-api` 4.10.0 met uitsluitend een nagebootst netwerkantwoord.
- `git diff --check`: geslaagd.
- Infrastructuuruitvoerder rapporteert daarnaast lokale testomgeving `/api/health` en SPA-root beide HTTP 200; dit is niet opnieuw als browsertest door de directeur uitgevoerd.

De rookproef bewijst geen queueconsumer, cronafhandeling, echte Picnic-authenticatie of Free CPU-marge. De globale testconfig schakelt consumers voorlopig uit; uitvoeringsproeven moeten later echte handlers expliciet testen. De productieconfig bevat een onbruikbare D1-ID totdat echte resources bewust zijn ingericht.

Exacte nieuwe pins: Wrangler 4.148.0, Vitest 4.1.10, Cloudflare Vitest-plugin 1.3.7, Vite 6.4.4 en Better Auth 1.7.7. Tijdelijke migratie: legacy `picnic-api` 3.1.3 blijft voor bestaande broncode; nieuwe backend gebruikt alias `picnic-api-worker` naar 4.10.0. De oorspronkelijke servicewijziging is byte voor byte behouden (SHA-256 `d6126505cf21062b2dcf1d8af9bc8395d047a31e3df5dfe0bcb4bd58a8dacf36`).

Open kwaliteitswerk: bestaande lintfouten in vijf bron/configlocaties en 36 door npm gerapporteerde dependencykwetsbaarheden moeten nog worden beoordeeld en waar relevant opgelost. Geen groen totaalrelease-oordeel op basis van deze eerste tests.

### Accounts — eerste implementatie gecontroleerd, integratie volgt

De accountmanager controleerde de werkelijk geïnstalleerde Better Auth-code. Een onbekend codeverzoek kan vóór de gebruikerscontrole een verificatierij schrijven; daarom komt de adres-/uitnodigingscontrole vóór de bibliotheekhandler. Authenticatieantwoorden kunnen sessietokens bevatten en worden voor de browser gesaneerd. Slechts benodigde OTP-/sessieroutes worden toegelaten. Absolute en inactieve sessiegrenzen vereisen eigen metadata naast Better Auth. De directeur heeft het native databaseschema uit de geïnstalleerde 1.7.7-code uitgelezen als invoer voor de databasemanager.

De eerste authenticatie- en accountroutes zijn gebouwd. Na directeursbevindingen zijn onzekere e-mailuitkomsten blijvend ten laste van het quotum gebracht, AI-budgetmaanden op Europe/Amsterdam gebaseerd en gelijktijdige wijzigingen aan beheer-stopinstellingen veilig gemaakt. De manager heeft deze correcties gecontroleerd. De directeur heeft op 8 oktober opnieuw `npm run test:worker -- worker/auth/index.test.ts worker/routes/accounts.test.ts` uitgevoerd: 6/6 geslaagd in de lokale Workers-runtime. Leveranciersantwoorden zijn in deze tests vervangen; er is geen echte mail verzonden.

De hoofdhandler is aangesloten op auth en accounts. Binnenkomende bodies zijn begrensd op werkelijke bytes, ook bij chunked overdracht of onjuiste Content-Length. Alle API-antwoorden verhinderen caching en verbergen interne foutdetails. De accountmanager heeft deze integratie onafhankelijk geïnspecteerd en beperkt akkoord gegeven. De directeur draaide de 6 accountproeven plus 3 HTTP-proeven: 9/9 groen. Daarna zijn ook de twee account-routeproeven via de hoofdhandler herhaald: beide groen. Browserintegratie en de onafhankelijke beveiligingsreview blijven open. De testconfig neemt nu ook gedeelde parserproeven onder `shared/` mee.


## Externe toelatingspunten

Echte Picnic-authenticatie/SMS en productdata, CPU-meting op de echte Workers Free-runtime, e-maildomein en benodigde leverancierssecrets, en beoordeling van Picnic-toegang blijven afzonderlijk te bewijzen. Lokale ontwikkeling en tests kunnen intussen doorgaan. Er worden geen betaalde abonnementen of echte boodschappen stil geactiveerd.

Eerste vastgelegde bouwstap: commit `3249c05` op `codex/picnic-mvp`, met specificaties en lokaal gecontroleerde infrastructuur. De oorspronkelijke servicewijziging is niet in die commit meegenomen.

### Databasebasis — manager akkoord, directeur gecontroleerd

`migrations/0001_initial.sql` en `worker/db/` zijn toegevoegd. De manager heeft de uitvoerder beoordeeld; de directeur heeft de uiteindelijke helpers geïnspecteerd en `npm run test:worker -- --run worker/db/index.test.ts test/bindings.test.ts` opnieuw uitgevoerd: 11/11 geslaagd, waarvan 9 databaseproeven. Worker-typechecking slaagde eveneens. De testomgeving is expliciet `APP_ENV=test` en gebruikt Cloudflares officiële migratiehulpmiddel.

Bewezen binnen deze databaseproeven: tenantrelaties, de laatste uitnodigingsplek bij gelijktijdige verzoeken, budgetreserveringen en onbekende uitkomsten, gehele centen, duurzame uitvoeringsclaims, sessieverval/intrekking, sessieverwijdering met bestaande goedkeuring en opruimen van lid- en beheeraccounts zonder andere gebruikers te verwijderen. De gevonden blokkerende verwijzingen naar sessies en persoonlijke historie zijn hersteld.

Nog geen volledige toevoeg- of verwijderflow: routes moeten herhaalde goedkeuringen naar dezelfde actie terugvertalen; jobs moeten externe bestanden werkelijk verwijderen voordat de laatste database-opruiming wordt afgerond. Nieuwe routes en jobs moeten bij schrijven de actuele accountstatus bewaken. Een databaseproef bewijst die toekomstige integraties niet.

De directeur heeft daarnaast een singleton voor de twee beheer-stopinstellingen toegevoegd (`0002`) en een expliciete netto-/uitlekgewichtbasis voor mandtoewijzingen (`0003`). Die basis mag bij NULL niet als bewezen productmatch worden gebruikt. Accounts-tests en latere producttests toetsen de bijbehorende functionaliteit.

De bekende namen van de authenticatie- en e-mailsecrets staan nu in Wrangler-configuratie en de gegenereerde types. `.dev.vars.example` bevat uitsluitend lege invulvelden. Er zijn geen echte credentials vastgelegd. Ontbrekende secrets veroorzaken bewust geen automatische productie-mock.

### Recepten en berekeningen — manager akkoord, directeur gecontroleerd

De goedkope backenduitvoerder bouwde gedeelde exacte hoeveelheden, portieschaling, de pure productselectie en recept-CRUD. De manager heeft het werk beoordeeld, correcties laten uitvoeren en typechecking herhaald. De directeur las de uiteindelijke code, liet randgevallen voor gewichtsbasis, goedkopere alternatieven en schrijven tijdens accountblokkering herstellen, en sloot de receptmodule aan op de hoofdhandler.

Receptbewerkingen gebruiken een verwachte versie en unieke schrijftoken binnen één D1-batch. Een verliezend gelijktijdig verzoek verandert geen ingrediënten van de winnaar. Migratie `0004` behoudt oudere ingrediënten zolang voorstellen ernaar verwijzen; de uitvoerder heeft deze migratie aanvullend met vooraf gevulde SQLite-tabellen beproefd. De recepttests toetsen bewaren en teruglezen van `1/3`, eigenaarschap, uploadrelaties, gelijktijdig bewerken, behoud van voorstelverwijzingen, blokkeren vlak vóór schrijven en duurzame opruimopdrachten bij verwijderen.

De directeur heeft na aansluiten de volledige huidige Workers-suite uitgevoerd: **36/36 tests geslaagd in 9 bestanden**, plus Worker-typechecking en diffcontrole. Daarna is receptopslag expliciet via de hoofdhandler herhaald: beide recepttests slagen. Dit bewijst nog geen werkende Picnic-koppeling, importverwerking, queueconsumer, fysieke bronverwijdering of volledige browserflow.

Open detail voor de komende opslag-/privacyronde: als een receptbewerking een bron loskoppelt, moet de opruimflow ook die verweesde bron vinden. Receptverwijdering maakt al een outboxopdracht; de daadwerkelijke R2-opruimer wordt nog gebouwd.

### Eerste browserflow en aanvullende sessiefix

De frontendmanager en Luna-uitvoerder hebben de oude aangesloten prototypeflow vervangen door echte account-, recept- en beheerpagina's. De manager corrigeerde onder meer conceptbehoud en versieconflicten. De directeur herhaalde frontend-typechecking en productiebuild en controleerde de browser met een fictief account in uitsluitend lokale D1. De testcode was een tijdelijke lokale fixture; er is geen e-mail verzonden en geen publieke ontwikkellogin ingebouwd.

Browserbewijs: e-mailcodescherm en focus, inloggen, recept met `1/3 kg` bewaren, terugvinden na herladen, exact teruglezen, concept met `2/3 kg` herstellen na herladen, vervolgens een gelijktijdige databasewijziging detecteren als versieconflict zonder het eigen concept kwijt te raken. Vergelijken toont de actuele inhoud naast het behouden concept. Account, beheer en uitloggen zijn gecontroleerd. De directeur herstelde navigatie-overflow, maakte de ontwikkelomgeving zichtbaar en verbeterde knopcontrast/aanraakruimte. De gecontroleerde indeling heeft geen horizontale overflow op 320 pixels. Dit is nog geen volledige schermlezer- of eindacceptatieproef.

De browserproef leidde tot een echte datumcorrectie: Better Auth bewaart native datums als ISO-tekst, terwijl enkele eigen SQL-guards epochmilliseconden verwachtten. De accountmanager heeft de helpers en goedkeurings-/verzendtriggers gecorrigeerd in `0006`; native uitnodigingsdatums zijn ook aangepast. De directeur las de fix en herhaalde auth/database/accounts: **16/16 geslaagd**, inclusief een echte OTP-login met exact genormaliseerde vervaldatum. Het accountscherm toont nu een geldige einddatum.

De [beveiligingsreview](reviews/SECURITY.md) beschrijft resterende P1/P2-punten. Er is nog geen toelating voor productie of pilot. De Picnic-manager bouwt nu versleutelde koppeling en alleen-lezen product-/mandroutes; de privacymanager bereidt fysieke opruiming en retentie voor.

### Picnic-koppeling en onderhoud — aangesloten, aanvullende racecontrole loopt

De Picnic-backend is aangesloten op de hoofdhandler: inloggen, hervatbare SMS-verificatie, ontkoppelen, productzoeken en het lezen van de winkelmand. Hervatsleutels worden per gebruiker versleuteld; wachtwoorden worden niet opgeslagen. De transportlaag heeft een echte afbreekbare deadline en een begrensd antwoord. De accountstatus meldt apart of een SMS-code nog nodig is, ook tijdens vervanging van een bestaande koppeling.

De directeur heeft de volledige lokale suite herhaald: **72/72 tests groen in 13 bestanden**, plus Worker-typechecking. Een daarna toegevoegde hoofdhandlerproef voor koppelen → accountstatus → SMS → gekoppeld slaagt ook: **17/17 Picnic-routeproeven**. De privacymanager heeft vervolgens de volledige set van **73/73** onafhankelijk herhaald. Dit zijn gesimuleerde leveranciersantwoorden met echte lokale D1/R2; echte Picnic-toegang is nog niet bewezen.

De scheduled handler roept het hervatbare onderhoud aan. De onafhankelijke review bevestigt de fixes voor ingetrokken sessies tijdens receptwrites en voor gelijktijdig accepteren/intrekken van een uitnodiging. De aanvullende directeurscontrole vond nog twee opslagraces: een receptwijziging tijdens verwijderen en een nieuwe bronkoppeling tijdens het claimen van een verweesde upload. Deze worden met deterministische regressietests hersteld voordat de onderhoudsslice definitief akkoord krijgt.

Volgende werkronde: Picnic-popup en product-/winkelmandweergave; vervolgens import, voorstellen en duurzame toevoegacties. De oorspronkelijke servicewijziging is opnieuw byte voor byte gecontroleerd en behouden.

### Aanvullende directeurscontrole — opslagraces opgelost

De laatste recipeDELETE/PUT-race is atomisch hersteld; de directeur herhaalde de recept- en accountrouteproeven: **6/6 groen**. Opruiming claimt verweesde uploads pas na een actuele controle op recept- en importkoppelingen. Een reeds geclaimde mislukte R2-verwijdering blijft in het opslagquotum meetellen. De accountpurge controleert zijn lease opnieuw binnen dezelfde D1-transactie, vóór enige gegevensverwijdering. De directeur inspecteerde de SQL en herhaalde de definitieve onderhouds- en opslagtests: **24/24 groen**, plus Worker-typecheck. Hiermee is deze backendstap lokaal akkoord; live leverancierstoegang en pilotgates blijven open.

### Picnic-popup — manager akkoord, directeur lokaal gecontroleerd

De frontend gebruikt de eigen Picnic-API voor koppelen/vervangen, SMS-verificatie, ontkoppelen en alleen-lezen product-/mandweergave. De manager corrigeerde hervatbaarheid, vernieuwde accountstatus, achterhaalde antwoorden na vervanging en toetsenbordfocus. De directeur herhaalde frontend-TypeScript en de productiebuild; beide groen.

De lokale browserproef gebruikt uitsluitend een fictieve account en een tijdelijke onbruikbare SMS-status, zonder Picnic te benaderen. Gecontroleerd: popup opent met focus op het eerste veld, sluiten wist ingevulde testcredentials, heropenen toont lege velden, focus keert terug naar de opener, en SMS is na paginaherladen hervatbaar zonder nieuwe sms-aanvraag. Op 320px breedte zijn document en scrollbreedte beide 320px; de dialoog past. De teststatus is opgeruimd, de testaccount uitgelogd en de viewport hersteld. Echte Picnic-authenticatie en de live product-/mandgegevens blijven afzonderlijke pilotproeven.

### Importbasis — duurzame verwerking en lokale keten bewezen

Migratie 0008, eigenaargebonden importroutes, begrensde extractie van gestructureerde Culy/MOB-bronnen en ID-only outbox/queueverwerking zijn aangesloten. Expliciete betaalmuurmarkeringen blokkeren extractie; afgekorte of te complexe bronnen worden gemarkeerd. Dubbele berichten, verlopen leases, achtergebleven verzending en late resultaten zijn getest. Onbekende berichttypen worden niet bevestigd; iedere queue heeft een afzonderlijk geconfigureerde dead-letterqueue.

De backendmanager controleerde zijn uitvoerder en herhaalde 11 gerichte import-/queueproeven. De directeur draaide daarna **88/88 tests in 16 bestanden**, plus Worker-typechecking. De lokale ontwikkeltestdatabase is gemigreerd tot 0008. Een afzonderlijke HTTP-proef via de draaiende Vite/Worker-app gaf POST 202, werkelijke lokale queueverwerking en daarna GET `needs_review` met ongewijzigde fictieve brontekst. De tijdelijke testsessie is uitgelogd; er zijn geen Picnic- of AI-aanroepen gedaan.

Deze eerste tekstpass claimt geen automatische herkenning: geplakte tekst blijft zichtbaar om te controleren. Volgende stappen zijn de importeditor, een blijvende zelfstandige bronkopie bij receptopslag (0009), AI-herkenning en foto-upload. De volledige MVP is daarmee nog niet afgerond.

### Importeditor en bronkopieën — lokaal gecontroleerd

De frontendmanager beoordeelde tekst-/linkinvoer, expliciete kandidaatkeuze, hervatbare concepten en het afzonderlijk verwijderen van de bewaarde bronkopie. De oorspronkelijke kandidaat blijft naast latere bewerkingen zichtbaar; een import met meerdere kandidaten blijft opnieuw te openen. De browser bewaart voor bronherstel alleen de importverwijzing naast de eigen receptbewerkingen, niet de volledige brontekst.

De directeur controleerde met fictieve lokale tekst de werkelijke queueverwerking, concept- en bronherstel na herladen, bewaren en teruglezen vanuit het kookboek, plus de uitleg en annulering van de bronverwijderdialoog. De editor heeft op 320px geen horizontale overflow. Een afzonderlijke localhost-HTTP-proef bevestigde bronbehoud na receptbewerking en afzonderlijke bronverwijdering met behoud van het recept. Er zijn geen externe leveranciers aangeroepen.

Deze browserproef vond een bestaande fout in de gedeelde hoeveelheidsparser: de genormaliseerde vorm van ‘onbekend’ en ‘naar behoefte’ werd bij opnieuw verwerken afgewezen. Een regressieproef faalde eerst en slaagt na de correctie; een onbekende hoeveelheid wordt nu ook werkelijk via de browser opgeslagen.

Migratie 0009 bewaart de bron en het recept in één transactie met een uitgestelde foreign key. Een ingetrokken sessie, geblokkeerd account of verlopen import kan daarbij geen gedeeltelijke opslag veroorzaken. Ook het verstrijken van de tijd tussen validatie en schrijven is getest. Importretentie gebruikt de oorspronkelijke vervaldatum, inclusief al bewaarde concepten; de zelfstandige receptbron blijft bestaan. De verwijderroute houdt rekening met extra databasewijzigingen door de bronverwijdertrigger, zodat een geslaagde verwijdering correct 204 teruggeeft.

De directeur herhaalde op de uiteindelijke code **94/94 tests in 16 bestanden**, beide TypeScript-controles en de productiebuild. Daarna slaagde de localhost-keten ook met het definitieve schema en met verwijderen van een recept waaraan nog een bron hangt. De lokale ontwikkeltabel is naar deze definitieve 0009-vorm gebracht met behoud van bestaande bronrijen en een schone foreign-keycontrole. AI-/fotoherkenning, productvoorstellen en duurzame boodschappenuitvoering blijven volgende bouwstappen.
