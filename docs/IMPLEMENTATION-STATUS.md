# MVP uitvoering

Start 8 oktober 2026. De gebruiker heeft het bouwplan goedgekeurd en opdracht gegeven de MVP met directeur, managers en goedkopere uitvoerders te bouwen. Deze opdracht vervangt de eerdere grens ‘alleen specificeren’. Het volledige [bouwplan](BOUWPLAN.md) blijft de scope; een demonstratie met mocks is geen afgeronde pilot.

## Werkverdeling

De directeur integreert, bewaakt scope en voert de eindcontrole uit. Vakmanagers gebruiken GPT-6 Sol; hun uitvoerders GPT-6 Luna. Er zijn maximaal vier gelijktijdige agents beschikbaar. Daarom lopen implementatie en onafhankelijke reviews in rondes; niet alle managers houden tegelijk een uitvoerder bezet.

| Rol | Verantwoordelijkheid | Status |
| --- | --- | --- |
| Infrastructuurmanager | Workers-runtime, lokale bindings, pakketten, build/testconfig en deployvoorbereiding | Lokale basis geïmplementeerd en akkoord na manager- en directeurscontrole; externe gates blijven open |
| Databasemanager | D1-schema, tenantrelaties, transacties, budgetten en verwijdering | Basis goedgekeurd na 9 D1-tests; directeur heeft deze en 2 infrastructuurtests herhaald |
| Backendmanager | Import, productberekening, Picnic-adapter, goedkeuring en duurzame uitvoering | Hoeveelheden, recepten en pure selectie goedgekeurd en aangesloten; adapters/imports/uitvoering volgen |
| Accountmanager | Better Auth, uitnodigingen, sessies en accountbeheer | Eerste implementatie en API-aansluiting gecontroleerd door manager en directeur; 9 gerichte tests groen |
| Frontendmanager | Mobiele Nederlandstalige flow en toegankelijkheid | Eerste account-/recept-/beheerschermen beoordeeld; directeur heeft mobiele browserflow getest; Picnic/import volgen |
| Beveiligingsmanager | Onafhankelijke isolatie-, geheimen-, input- en misbruikcontrole | Eerste onafhankelijke review vastgelegd; verwijder- en schrijfraces blijven open |
| Privacymanager | Gegevensstromen, retentie, verwijderproef en eerlijke privacy-uitleg | Ontwerpt duurzame opruiming en retentie; goedkope uitvoerder volgt na huidige Picnic-ronde |
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
