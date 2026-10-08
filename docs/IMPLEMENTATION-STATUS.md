# MVP uitvoering

Start 8 oktober 2026. De gebruiker heeft het bouwplan goedgekeurd en opdracht gegeven de MVP met directeur, managers en goedkopere uitvoerders te bouwen. Deze opdracht vervangt de eerdere grens ‘alleen specificeren’. Het volledige [bouwplan](BOUWPLAN.md) blijft de scope; een demonstratie met mocks is geen afgeronde pilot.

## Werkverdeling

De directeur integreert, bewaakt scope en voert de eindcontrole uit. Vakmanagers gebruiken GPT-6 Sol; hun uitvoerders GPT-6 Luna. Er zijn maximaal vier gelijktijdige agents beschikbaar. Daarom lopen implementatie en onafhankelijke reviews in rondes; niet alle managers houden tegelijk een uitvoerder bezet.

| Rol | Verantwoordelijkheid | Status |
| --- | --- | --- |
| Infrastructuurmanager | Workers-runtime, lokale bindings, pakketten, build/testconfig en deployvoorbereiding | Lokale basis geïmplementeerd en akkoord na manager- en directeurscontrole; externe gates blijven open |
| Databasemanager | D1-schema, tenantrelaties, transacties, budgetten en verwijdering | Schemaontwerp beoordeeld; implementatieronde gestart |
| Backendmanager | Import, productberekening, Picnic-adapter, goedkeuring en duurzame uitvoering | Eerste afgebakende taak voor exacte productselectie ontworpen |
| Accountmanager | Better Auth, uitnodigingen, sessies en accountbeheer | Geïnstalleerde Better Auth onderzocht; integratievoorwaarden vastgelegd |
| Frontendmanager | Mobiele Nederlandstalige flow en toegankelijkheid | Gepland |
| Beveiligingsmanager | Onafhankelijke isolatie-, geheimen-, input- en misbruikcontrole | Gepland |
| Privacymanager | Gegevensstromen, retentie, verwijderproef en eerlijke privacy-uitleg | Gepland |
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

### Accountonderzoek — nog geen implementatieakkoord

De accountmanager controleerde de werkelijk geïnstalleerde Better Auth-code. Een onbekend codeverzoek kan vóór de gebruikerscontrole een verificatierij schrijven; daarom komt de adres-/uitnodigingscontrole vóór de bibliotheekhandler. Authantwoorden kunnen sessietokens bevatten en worden voor de browser gesaneerd. Slechts benodigde OTP-/sessieroutes worden toegelaten. Absolute en inactieve sessiegrenzen vereisen eigen metadata naast Better Auth. De directeur heeft het native databaseschema uit de geïnstalleerde 1.7.7-code uitgelezen als invoer voor de databasemanager.


## Externe toelatingspunten

Echte Picnic-authenticatie/SMS en productdata, CPU-meting op de echte Workers Free-runtime, e-maildomein en benodigde leverancierssecrets, en beoordeling van Picnic-toegang blijven afzonderlijk te bewijzen. Lokale ontwikkeling en tests kunnen intussen doorgaan. Er worden geen betaalde abonnementen of echte boodschappen stil geactiveerd.
