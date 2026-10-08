# Lokale start en operationele toelating

Dit is het bedieningspad voor de besloten pilot. Een lokaal geslaagde proef geeft
geen toestemming om productie te openen. [Implementatiestatus](IMPLEMENTATION-STATUS.md)
houdt bij welk bewijs al bestaat; [privacyoperaties](PRIVACY-OPERATIONS.md)
beschrijven verwijdering en herstel in detail.

## Lokaal of in de gescheiden testomgeving starten

Gebruik Node.js 24 en de vastgelegde npm-lockfile. Voer de migraties uit voordat
de Worker account- of receptroutes verwerkt. De standaardomgeving gebruikt de
lokale D1-identiteit `DB`; `--env test` gebruikt
`preview_database_id: picnic-test-local` en daardoor een afzonderlijke lokale
D1-bestandenset. De namen `picnic-local` en `picnic-test` zijn labels, geen
lokale opslagidentiteiten. De test-Worker, testmigraties en bootstrap-CLI
selecteren alle drie diezelfde testbinding.

```sh
npm ci
npm run build
CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false npx wrangler d1 migrations apply DB --local
```

Voor een schone lokale testomgeving:

```sh
CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false npx wrangler d1 migrations apply DB --env test --local
npm run dev:worker:test
```

Voor de gewone ontwikkelomgeving: start `npm run dev:worker` en in een tweede
terminal `npm run dev`. Vite serveert op `http://localhost:5173` en stuurt `/api`
door naar de Worker op poort 8787. De genegeerde `.dev.vars` (of
`.dev.vars.test` voor de benoemde testomgeving) bevat uitsluitend de lokale,
afzonderlijke waarden die de Worker nodig heeft; de oude root-`.env` wordt door
de scripts niet geladen. Maak geen `VITE_*`-variabele voor een geheim. De
`.dev.vars.example` noemt de vereiste sleutels, maar bevat geen bruikbare
waarden. Een echte OTP-mail vereist een eigen Resend-sleutel en geverifieerde
afzender; de geïnjecteerde mailopvang in tests is niet beschikbaar als publiek
ontwikkelendpoint.

Controleer na migratie en starten `GET /api/health` en de SPA-root. Voer daarna
`npm run typecheck:worker`, `npx tsc -p tsconfig.app.json --noEmit`,
`npm run test:worker` en `npm run build` uit. De Worker-tests draaien met lokale
D1/R2-bindings en gemockte externe antwoorden. Voor import- en toevoegjobs
zijn ook herleverings- en foutproeven nodig zodra hun handlers compleet zijn.

## Eerste beheerder via de bootstrap-CLI

De eerste beheerder moet in een lege, gemigreerde database worden aangemaakt met
een expliciete `scripts/bootstrap-admin.mjs`-CLI. Er bestaat geen publieke
bootstraproute. De CLI doet standaard alleen een read-only proef; gebruik
`--apply` pas nadat de lege, gemigreerde doelomgeving is bevestigd. De CLI moet
beide records als één D1-transactie invoegen: een
native Better Auth-`user` met een ISO-datum in `createdAt` en `updatedAt`,
gevolgd door het actieve `app_accounts`-record met dezelfde UUID en het
genormaliseerde e-mailadres. `emailVerified` begint op `0`; de eigenaar
verifieert het adres door een echte e-mailcode te gebruiken. De
`app_accounts_insert_policy`-trigger laat precies de eerste actieve beheerder
zonder uitnodiging toe. Beide inserts moeten in dezelfde transactie ook
conditioneel controleren dat zowel de native `user`- als de `app_accounts`-
tabel nog leeg is. De tweede insert accepteert uitsluitend de zojuist
aangemaakte UUID. Een herhaalde of gelijktijdige bootstrap mag in geen van
beide tabellen een extra rij achterlaten.

Voor lokaal gebruik zijn de bedoelde aanroepen:

```sh
node scripts/bootstrap-admin.mjs --env development --email beheerder@example.nl
node scripts/bootstrap-admin.mjs --env development --email beheerder@example.nl --apply
node scripts/bootstrap-admin.mjs --env test --email beheerder@example.nl --apply
```

De CLI mag in productie uitsluitend met `--env production --remote
--database-id <exacte-d1-uuid> --email beheerder@example.nl --apply` werken,
nadat de productiepoortjes hieronder zijn afgehandeld. Remote gebruik zonder
`--remote`, een ontbrekende/sentinel database-ID of een ID die niet exact bij
de geselecteerde Wrangler-omgeving past, wordt geweigerd. Hij schrijft geen
SQL, OTP, sessietoken of secret naar de terminal. Wrangler-logs voor deze
aanroep staan tijdelijk in een private map en worden na afloop verwijderd.
Een gewone uitnodiging
voor latere leden loopt via de beheerdersfunctie na inloggen; opnieuw
bootstrap uitvoeren is daarvoor niet toegestaan. Bewaar het gekozen
beheerdersadres in de operationele administratie, los van de repository.

## Productiepoortjes vóór enige uitrol

De huidige `wrangler.jsonc` bevat opzettelijk
`REPLACE_WITH_PROVISIONED_D1_ID`. Laat die blokkade staan totdat een operator
de productiebronnen heeft aangemaakt, de IDs heeft gekoppeld en de isolatie
heeft gecontroleerd. Ontwikkeling, test en productie krijgen ieder eigen D1,
private R2-bucket, import- en toevoegqueue, secrets en afzenderinstellingen.
Leg voor D1 en R2 bij creatie EU-jurisdictie vast waar beschikbaar; dit maakt
de gehele verwerkingsketen niet automatisch EU-only. Geen testaccounts of
recepten naar productie kopiëren.

| Poort | Concreet bewijs vóór openen |
| --- | --- |
| Binding en domein | Werkelijke D1-ID, private R2-bucket, afzonderlijke queues en `APP_ORIGIN=https://picnic.devstef.nl`; DNS/TLS en dezelfde-origin cookies gecontroleerd. Geen automatische productieprovisioning op basis van lege IDs. |
| Geheimen | Per omgeving onafhankelijke `AUTH_SECRET`, `OTP_HMAC_SECRET`, `EMAIL_ADDRESS_HMAC_SECRET` en een 32-byte `PICNIC_ENCRYPTION_KEY` als base64, plus versie; alleen via Cloudflare secrets of genegeerde lokale dev-vars. Geen waarde in git, terminaloutput, URL of browserbundel. |
| E-mail | Resend-sleutel en `EMAIL_FROM` met geverifieerd domein, echte uitnodigings- en OTP-proef, quota en onzekere verzenduitkomst bekeken. Geen test-mailopvang in productie. |
| Jobs | Beide queues hebben werkende consumers en elk een aparte dead-letterqueue. Voorstel: `picnic-imports-dead-production` en `picnic-additions-dead-production`; in test respectievelijk `picnic-imports-dead-test` en `picnic-additions-dead-test`, lokaal `picnic-imports-dead-local` en `picnic-additions-dead-local`. D1 blijft de duurzame taakwaarheid; een onbekende externe toevoeguitkomst wordt nooit blind opnieuw verstuurd. |
| Kosten en runtime | Representatieve warme en koude paden op echte Workers Free meten: p95 CPU onder 7 ms en geen aanroep boven 10 ms in de testset. D1/R2/Queues-gebruik en Resend-limieten volgen. Een betaald plan vraagt een afzonderlijk kostenbesluit. |
| Herstel en privacy | R2-lifecycle voor tombstones/back-ups, D1-herstelproef met herhaalde verwijderlijst, echte accountverwijdering inclusief R2 en leveranciersretentie gecontroleerd volgens [privacyoperaties](PRIVACY-OPERATIONS.md). |
| Leveranciers en product | Echte Picnic-koppeling/SMS, productvelden, veilige toevoeg- en herstelproef met eigen account, voorwaarden/toelaatbaarheid, URL- en uploadbeveiliging, AI-budget en mobiele acceptatiematrix beoordeeld. |

De bron van waarheid voor deze poortstatus blijft de implementatiestatus. Bij
een ontbrekende poort blijft de pilot gesloten; een groene lokale build of
gemockte Workers-test vervangt geen live validatie. Observability staat nu uit
om persoonlijke gegevens en secrets niet onbedoeld te loggen. Vóór productie
is een beperkte, geredigeerde foutregistratie en een controle op logretentie
nodig.

## Onderhoud en incidenten

De configuratie heeft een minuut- en uurtrigger. De huidige `scheduled()`-
handler roept bij beide triggers zowel `runMaintenance` als
`dispatchImportOutbox` aan; deze taken moeten daarom veilig herhaalbaar zijn.
Controleer na activering dat beide triggers daadwerkelijk draaien en dat
mislukte of verlopen berichten zichtbaar blijven
in D1 en de dead-letterqueues. Inspecteer een dead-letterbericht samen met
zijn D1-status. Verstuur een regel met onzekere Picnic-uitkomst niet opnieuw
voordat de gebruiker die uitkomst heeft gecontroleerd. Gebruik de afzonderlijke
stopinstellingen voor AI en toevoegen bij incidenten; laat recepttoegang waar
mogelijk beschikbaar.

Bij herstel of rollback: stop verkeer en verzending, bewaar de actuele
actie- en verwijderstatus, pas de R2-verwijderlijst opnieuw toe op een oude
D1-kopie en heropen pas na de eigenaar-/verwijdercontrole. Een code-rollback
mag geen nieuwe taakversie stil als succesvol behandelen. Zie
[privacyoperaties](PRIVACY-OPERATIONS.md) voor de restorevolgorde en de grenzen
van de 24-uurs- en 30-dagenbewaarclaims.
