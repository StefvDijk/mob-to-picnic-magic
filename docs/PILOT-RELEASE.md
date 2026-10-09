# Eerste online testversie — picnic.devstef.nl

Bijgewerkt: 9 oktober 2026. Dit is de actieve releasespecificatie op verzoek van de eigenaar. Deze bepaalt samen met MVP-FOCUS.md de eerstvolgende oplevering; het uitgebreide BOUWPLAN.md blijft de productbacklog. Statusregels hieronder onderscheiden gebouwd, lokaal getest en werkelijk online bewezen.

## Resultaat

Een uitgenodigde tester opent https://picnic.devstef.nl op zijn eigen telefoon, logt in met een mailcode, importeert een recept uit een URL of foto, koppelt zijn eigen Picnic NL-account en voegt na controle de benodigde producten aan zijn eigen Picnic-mandje toe. Recepten blijven na herladen en opnieuw inloggen bestaan. Niemand ziet recepten, koppelingen of acties van andere gebruikers. Bestellen en betalen gebeuren uitsluitend in Picnic.

Eerst de eigenaar plus één tester, daarna maximaal tien accounts totaal. De site is bereikbaar via internet; de gegevens en functies zijn alleen toegankelijk met een actief uitgenodigd account. Geen openbare registratie of gedeeld testaccount.

## Afbakening

| Onderdeel | Eerste online versie |
| --- | --- |
| Account | Vast persoonlijk account, uitnodiging, zes cijfers per e-mail, uitloggen en toegang intrekken |
| Recepten | Importeren, bekijken, corrigeren en verwijderen; ingrediënten, hoeveelheden, porties, stappen en bron |
| Invoer | URL en foto/screenshot als enige gebruikersingangen; automatische extractie van titel, porties, ingrediënten, hoeveelheden en stappen |
| Herkenning | Automatische herkenning is releasevereiste. Alleen onduidelijke onderdelen vragen controle; geen leeg formulier als uitwijkroute |
| Picnic | Eigen koppeling, eventuele sms-verificatie, ontkoppelen, zoeken en huidig mandje bekijken |
| Producten | Automatische passende voorstellen met zichtbare alternatieven; expliciete inhoudelijke vervangingen. Laagste totaalbedrag voor voldoende product; één SKU per ingrediëntgroep |
| Controle | Benodigde hoeveelheid, product/verpakking, aantal verpakkingen, totaalprijs en overschot zichtbaar; vergelijkbare eenheidsprijs waar beschikbaar |
| Toevoegen | Eén recept per voorstel, servercontrole en expliciete goedkeuring. Geen automatische alternatieven of tweede verzending bij een onzekere uitkomst |
| Beheer | Eigenaar nodigt uit, trekt toegang in en kan toevoegen stoppen. Geen toegang tot andermans receptinhoud voor feedback zonder expliciete deling |
| Interface | Nederlandse mobiele webapp in de onderzochte Picnic-stijl; Recepten, Picnic, Account en alleen voor beheerder Beheer |

Opt-in productvoorkeuren en zichtbare voorraad zijn lokaal gebouwd; voorraad staat standaard uit. Later: combinaties van verschillende verpakkingsgroottes, meerdere recepten tegelijk, automatische mandverrekening en automatische dieetpersonalisatie. Decisions en volledige catalogusscans blijven uit zolang toegang, kostentelling, kwaliteit en categoriedekking niet bewezen zijn.

## Gebruikersroute en acceptatie

1. **Uitnodiging en inloggen.** De tester is vooraf als mailontvanger geverifieerd, krijgt daarna een app-uitnodiging en kan een code aanvragen. Een geldige code opent uitsluitend zijn eigen account. Ongeldige/verlopen codes geven herstelbare feedback. Uitnodigen en OTP worden op het echte domein getest; de al ontvangen losse testmail vervangt dit niet.
2. **Eerste recept.** Een lege bibliotheek biedt een receptlink of foto-upload. De tester levert een echt recept aan; de app vult het recept automatisch in. URL én foto moeten beide zelfstandig slagen, inclusief hoeveelheden. Na herladen blijft het recept gelijk. Een leeg geopend formulier wordt niet telkens als onafgemaakt recept opgedrongen; bestaande echte concepten blijven behouden.
3. **Picnic koppelen.** Via de eigen navigatiebestemming Picnic vult de tester zijn gegevens in de app in. Indien nodig kan sms-verificatie na herladen worden hervat. Wachtwoorden/codes komen niet in chat, browseropslag of logs; opgeslagen koppelsleutels zijn versleuteld op de server.
4. **Boodschappen samenstellen.** Van 2 naar 4 porties verandert 1/3 kg in 2/3 kg. Ontbrekende hoeveelheden of verpakkingsbasis blokkeren een oncontroleerbaar voorstel en verwijzen naar correctie. Productzoeken zonder verbinding verwijst naar koppelen, niet naar een technische fout.
5. **Goedkeuren.** Pas na het overzicht en expliciet akkoord wordt toegevoegd. Dubbelklik, herladen of opnieuw aangeboden queuebericht veroorzaakt geen nieuwe toevoegactie voor dezelfde goedkeuring. Het scherm maakt duidelijk dat niet is besteld of afgerekend.
6. **Herstel.** Bij een timeout na mogelijk toevoegen verschijnt een onzekere uitkomst. De gebruiker controleert de Picnic-mand; de app verstuurt niet blind opnieuw. Nog niet uitgevoerde regels zijn herkenbaar.
7. **Scheiding en beheer.** Een tweede account kan geen recepten, voorstellen, acties of koppeling van het eerste openen, ook niet via een gekopieerde URL/ID. Blokkeren trekt toegang in. Uitloggen, ontkoppelen en accountverwijdering hebben een duidelijke bevestiging waar nodig.

## Huidige stand

| Onderdeel | Bewijs | Nog te doen |
| --- | --- | --- |
| Account/recepten/importbasis | Gebouwd; lokale route- en opslagproeven | Uitnodiging en OTP op het echte domein met tweede account |
| E-mail | Cloudflare-binding, domein actief, echte testmail ontvangen en door eigenaar bevestigd | Iedere tester verifiëren; echte online uitnodiging/OTP-proef |
| Picnic-koppeling/zoeken/mand | Lokale echte koppeling, zoek- en mandroute; gesaneerde adaptertests | Online eigen koppeling per account; volledige detailvelddekking en actuele controle bewijzen |
| Voorstel/toevoegen/herstel | Echte gele-uienactie geslaagd; goedgekeurde tomatenproef (1 × 500 g, €1,61) na mandcontrole via herstelroute bevestigd; herladen toont dezelfde actie. Beide toestemmingen verbruikt | Online tweepersoonsproef; nieuwe mandproef uitsluitend met nieuwe concrete opdracht |
| URL/fotoherkenning | Echte Culy-import en foto-import met synthetische recepttekst lokaal uitgevoerd; privéuploads/AI-budgetbewaking gebouwd | Echte camerafoto, Engelse URL en productie-AI-configuratie/prijsattestatie bewijzen |
| Interface | Vernieuwd; app-TypeScript/build en browsercontrole 1280/390/320px | Eenvoudige eerste-gebruik-route en resterende concept-/koppelfeedback nalopen |
| Hosting | Production-config heeft domeinroute, import-AI-secretvereisten en gesloten alternatieve hosts; D1-placeholder resteert | Afzonderlijke resources, sleutels, migraties, domein en deploy |
| Beheer/privacy/herstel | Implementatie en eerdere lokale controles | Beperkte live controle van isolatie, blokkeren, opschonen en herstel |

Een ingelogde lokale browser is geen bewijs van een complete geslaagde OTP-proef op de online omgeving. Historische notities in IMPLEMENTATION-STATUS.md zijn geen actuele openstaande blokkades als ze later zijn opgelost.

## Online omgeving

- Eén Cloudflare Worker serveert zowel de gebouwde webapp als /api onder https://picnic.devstef.nl. APP_ENV=production en APP_ORIGIN exact dit adres; geen localhost-verwijzingen in de online route.
- Een nieuwe lege D1-database voor de pilot, met gekozen EU-locatie waar ondersteund. Gebruik een werkelijke resource-ID, geen automatische provisioning vanuit een placeholder. Alle momenteel aanwezige migraties 0001–0016 in volgorde gecontroleerd toepassen; leg vóór toepassing de actuele remote migratielijst vast. Geen bestaande lokale database kopiëren.
- Eigen private R2-opslag, importqueue, AI-queue en toevoegqueue met elk een afzonderlijke dead-letterqueue; consumers en bestaande onderhoudstriggers controleren.
- Nieuwe sleutels voor AUTH_SECRET, OTP_HMAC_SECRET, EMAIL_ADDRESS_HMAC_SECRET en PICNIC_ENCRYPTION_KEY. Automatische import vereist bovendien serverconfiguratie OPENAI_API_KEY, AI_PRICE_ATTESTATION, AI_PRICE_VALID_UNTIL en AI_EUR_PER_USD_BPS binnen bestaande €15/maand-app- en €5/gebruikerbudgetten. Geen lokale sleutels, sessies, fictieve recepten of databasekopie publiceren.
- Custom domain, HTTPS, Secure/HttpOnly/SameSite-sessiecookies, exacte Origin-controle en private no-store-antwoorden controleren. Alternatieve hosts mogen de toegangscontrole niet omzeilen.
- Native EMAIL-binding met beperkte afzender noreply@devstef.nl. Geen Resend of extra databaseleverancier.
- Alleen noodzakelijke, gesaneerde foutinformatie. Geen wachtwoorden, codes, sessies, recepttekst of ruwe Picnic-antwoorden loggen. Een eenvoudige supportinstructie volstaat; geen nieuwe feedbackdienst.
- De naam Mijn recepten blijft zichtbaar. Het is een onafhankelijke testapp met Picnic-koppeling, geen officiële Picnic-app. Voor extern gebruik de herkomst en toegestane toepassing van de overgenomen fotografie expliciet afhandelen; zo nodig vervangen door eigen materiaal met dezelfde visuele richting.

## Uitnodigen zonder extra dienst

De gekozen beginroute is Cloudflare Free met vooraf geverifieerde ontvangers. Dit is een operationele beperking, geen open inschrijving:

1. Eigenaar kiest een tester en diens e-mailadres.
2. Cloudflare-ontvangerverificatie wordt aangevraagd; tester bevestigt die zelf.
3. Pas zodra de ontvanger Verified is, verstuurt de beheerder de app-uitnodiging.
4. Tester opent de app en vraagt een inlogcode aan.

Een gebruiker die alleen een app-uitnodiging heeft maar nog niet als Cloudflare-ontvanger is geverifieerd, kan op deze route geen mail ontvangen. De beheerinstructie moet dit vóór uitnodigen duidelijk maken. Geen mail naar testers sturen voordat de eigenaar de ontvangers heeft aangewezen. Als de gratis route technisch onvoldoende blijkt, eerst een concrete kostenkeuze voorleggen; niet stil upgraden.

## Uitvoering in vier stappen

### 1. Automatische import, daarna de echte Picnic-route

Bouw en bewijs eerst URL- en fotoherkenning, private bronopslag en budgetbewaking. Een lege editor of overtypen is geen geslaagde import. Test minimaal één Nederlandse URL, één Engelse URL en een foto/screenshot met fracties en ontbrekende waarden. Voer daarna met de eigenaar de echte Picnic-koppeling, zoeken en mand-lezen uit. Herstel alleen problemen die de pilotroute blokkeren, waaronder leeg concept herstellen en ontbrekende koppeling bij productkeuze. Vergelijk de echte productvelden met de rekenregels. Maak één klein voorstel; wijzig de echte mand alleen na akkoord op de concrete inhoud. Klaar wanneer de eigenaar de inhoud in Picnic terugziet en herladen dezelfde actie toont.

### 2. Release technisch gereedmaken

Bereid de exacte production-config, resources, onafhankelijke sleutels, migratie-/bootstrapcommando's en domeinkoppeling voor. Gebruik de bestaande bootstrap voor de eerste beheerder in een lege database. Voer de geraakte tests en één volledige releasecontrole uit (Worker-tests, beide TypeScript-checks, build en bootstrap-tests). Beoordeel open bevindingen op werkelijke bereikbaarheid; geen auditfix --force, frameworkmigratie of extra managementlaag. Geen nieuwe afhankelijkheidsinventaris verzenden via npm audit zonder de eerder ontbrekende toestemming.

### 3. Online proef met eigenaar en één tester

Deploy de beoordeelde release naar het doeladres, maak de eerste beheerder en verifieer TLS, cookies, mail, queues en gegevensopslag. Doorloop bovengenoemde acceptatie met twee afzonderlijke accounts. Controleer blokkeren/verwijderen met een daarvoor bedoeld testaccount en herstel met een afzonderlijke testdataset. Geen lokale fixtures meenemen.

### 4. Besloten pilot openen

De startinstructie vermeldt URL, mailcode, Picnic koppelen, eerste recept, boodschappen controleren en hoe een fout te melden zonder geheimen. Nodig pas verdere testers uit nadat de tweepersoonsproef slaagt. Houd de bestaande accountlimiet op tien. Leg de uitgerolde commit, werkelijke resource-identiteiten zonder geheimen, controle-uitkomsten en resterende beperkingen vast.

## Concrete releasevoorbereiding — 9 oktober 2026

Deze voorbereiding wijzigt geen online resources en vormt geen bewijs van een deployment. De aanwezige Wrangler-versie is 4.148.0; de bootstrap-tests slagen 6/6. De productieconfig noemt eigen D1/R2 en drie queues met drie dead-letterqueues, maar de D1-ID is nog `REPLACE_WITH_PROVISIONED_D1_ID`. De custom-domain-route voor picnic.devstef.nl is nu voorbereid; workers.dev en preview-URL’s staan uit. `APP_ENV`, `APP_ORIGIN`, `DECISIONS_MODE=off` en `CATALOG_SYNC_ENABLED=off` staan correct voor het voorgenomen doel. De productie-`secrets.required` bevat nu ook de vier import-AI-configuratienamen hierboven, zodat een ontbrekende importconfiguratie de deployment blokkeert. De ondersteunde prijsattestatie en vervaldatum moeten opnieuw tegen `worker/imports/ai.ts` en officiële prijzen worden geverifieerd; kopieer geen verlopen lokale waarden.

Op 9 oktober faalden de eerste uitsluitend lezende pogingen binnen de sandbox door een onbereikbare Cloudflare-authserver. De daaropvolgende `whoami` met toegestane netwerktoegang slaagde: dit was een sandboxbeperking, geen bewezen authenticatieblokker. D1- en R2-inventaris faalden ook buiten de sandbox met Cloudflare Authentication error 10000. Het OAuth-token mist onder andere `d1:write`, `workers:write`, `workers_routes:write`, `queues:write` en `zone:read`; het heeft slechts account/user-read, offline_access en workers_scripts-write. `queues list` eindigde met exit 0 zonder entries; geen productiequeues aangetroffen. D1/R2-identiteiten, migraties en domeinbeschikbaarheid blijven onbewezen. Er zijn geen secretwaarden gelezen, mails verstuurd of resourcewijzigingen uitgevoerd.

### Eerst lezen en lokaal controleren

Gebruik de geïnstalleerde CLI zonder installatie van een nieuwe versie. Leg alleen noodzakelijke resource-identiteiten vast; geen credentials of database-inhoud in het verslag. Het uitschakelen van dotenv-laden hieronder voorkomt automatische `.env`-import; open of kopieer ook geen `.dev.vars`-bestand. De read-only remote opdrachten vereisen werkende Cloudflare-authenticatie met passende scopes. De geïnstalleerde CLI ondersteunt `login --scopes-list`; de herstelopdracht hieronder is voorbereid maar niet uitgevoerd. D1/queues bieden in deze OAuth-lijst uitsluitend write-scopes, ook voor inventory. De gerichte set vermijdt unrelated Pages/KV/AI/containers-permissions; R2-toegang moet na nieuwe autorisatie apart met `r2 bucket list` worden bevestigd. E-mail-scopes zijn uitsluitend nodig bij de later gekozen echte mailconfiguratie.

```sh
node node_modules/wrangler/bin/wrangler.js login --scopes-list
node node_modules/wrangler/bin/wrangler.js login --scopes user:read account:read workers:write workers_scripts:write workers_routes:write d1:write queues:write zone:read
```

```sh
export CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false
export WRANGLER_SEND_METRICS=false
export WRANGLER_LOG_PATH=/tmp/picnic-release-wrangler
node node_modules/wrangler/bin/wrangler.js whoami
node node_modules/wrangler/bin/wrangler.js d1 list --json
node node_modules/wrangler/bin/wrangler.js r2 bucket list
node node_modules/wrangler/bin/wrangler.js queues list
```

Nadat de gekozen, geprovisioneerde productie-D1-ID in de configuratie is gecontroleerd, kunnen onderstaande opdrachten de remote migratiestatus en bestaande Worker-versies lezen. Ze passen geen migraties toe. Bootstrap zonder `--apply` controleert uitsluitend of beide accounttabellen leeg zijn; vervang de aangegeven waarden met het gekozen beheeradres en exact de geverifieerde D1-ID.

```sh
node node_modules/wrangler/bin/wrangler.js d1 migrations list DB --env production --remote
node node_modules/wrangler/bin/wrangler.js versions list --env production
node scripts/bootstrap-admin.mjs --env production --remote --database-id '<GEVERIFIEERDE_D1_UUID>' --email '<BEHEERADRES>'
```

Controleer lokaal de volledige Worker-suite, beide TypeScript-checks, productiebuild en bootstrap-tests op de definitieve samenhangende code. Een production dry-run bundelt lokaal en publiceert niet; bewaar de uitvoer buiten de repository en geef geen geheimen via argumenten mee. De dry-run op 9 oktober slaagde en schreef alleen `/private/tmp/picnic-production-bundle` (12 assets; Worker gzip 455,51 KiB). Dat bewijst bundelbaarheid, geen bestaande D1-ID, secrets, resources of domein. Configuratietypes zijn opnieuw gegenereerd, `wrangler types worker/runtime.d.ts --check` en Worker-typecheck slagen.

```sh
npm run test:worker
npm run typecheck:worker
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
npm run build
node --test test/bootstrap-admin.test.mjs
node node_modules/wrangler/bin/wrangler.js deploy --env production --dry-run --outdir /private/tmp/picnic-production-bundle
git diff --check
```

### Voorbereide mutaties voor de afzonderlijke online vrijgave

Onderstaande opdrachten zijn nog niet uitgevoerd. Eerst moeten de gekozen resources, kosten en eerste beheerder concreet vaststaan, de resourcebindingen kloppen en de definitieve releasecontroles slagen. Maak resources alleen wanneer de inventaris bewijst dat ze ontbreken; hergebruik geen lokale resources. Provisioningcommando’s en eventuele regio-/jurisdictiekeuze volgen pas uit die inventaris. De voorbereide `env.production` bevat `routes: [{"pattern":"picnic.devstef.nl","custom_domain":true}]`, `workers_dev:false` en `preview_urls:false`; controleer dat de zone beschikbaar is en dat geen bestaande dienst wordt overschreven.

Sleutels worden onafhankelijk voor productie aangemaakt en uitsluitend interactief of via een veilige CI-secretstore ingesteld. Geen secretwaarden in chat, argumenten of logbestanden. `secret put` verandert online configuratie; laat dit afzonderlijk uitvoeren na de concrete releasekeuze.

```sh
node node_modules/wrangler/bin/wrangler.js secret put AUTH_SECRET --env production
node node_modules/wrangler/bin/wrangler.js secret put OTP_HMAC_SECRET --env production
node node_modules/wrangler/bin/wrangler.js secret put EMAIL_ADDRESS_HMAC_SECRET --env production
node node_modules/wrangler/bin/wrangler.js secret put PICNIC_ENCRYPTION_KEY --env production
node node_modules/wrangler/bin/wrangler.js secret put OPENAI_API_KEY --env production
node node_modules/wrangler/bin/wrangler.js secret put AI_PRICE_ATTESTATION --env production
node node_modules/wrangler/bin/wrangler.js secret put AI_PRICE_VALID_UNTIL --env production
node node_modules/wrangler/bin/wrangler.js secret put AI_EUR_PER_USD_BPS --env production
```

Bij een nieuwe lege database: migraties toepassen, lege-accountpreflight controleren en pas daarna de bestaande bootstrap met `--apply` uitvoeren. Bij een bestaande database: eerst een consistente remote backup volgens PRIVACY-OPERATIONS.md en een herstelcontrole, daarna alleen aantoonbaar ontbrekende migraties. Geen blind terugzetten of tweede bootstrap. Alle nieuwe migraties moeten vóór de bijbehorende Worker-code beschikbaar zijn.

```sh
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --env production --remote
node scripts/bootstrap-admin.mjs --env production --remote --database-id '<GEVERIFIEERDE_D1_UUID>' --email '<BEHEERADRES>'
node scripts/bootstrap-admin.mjs --env production --remote --database-id '<GEVERIFIEERDE_D1_UUID>' --email '<BEHEERADRES>' --apply
node node_modules/wrangler/bin/wrangler.js deploy --env production
```

Na deploy controleer je eerst `GET /api/health`, HTTPS en cookievlaggen op het doeladres, daarna de normale uitnodigings-/OTP-route en beide accounts. `health` alleen bewijst geen database-, queue-, AI- of e-mailwerking. Houd Decisions en synchronisaties uit. De oude gele-uientoestemming blijft verbruikt; bootstrap/deploy geven geen toestemming voor een nieuwe mandmutatie.

CLI-vormen en configuratie zijn getoetst aan de [officiële D1-commando’s](https://developers.cloudflare.com/d1/wrangler-commands/), [Worker-commando’s](https://developers.cloudflare.com/workers/wrangler/commands/workers/) en [Wrangler-configuratie](https://developers.cloudflare.com/workers/wrangler/configuration/) en het lokale configuratieschema op 9 oktober 2026.

## Stop en herstel

Bij onjuiste mandmutaties of gegevenslek: toevoegen stoppen of toegang intrekken; onzekere acties niet opnieuw uitvoeren. Vorige Worker-versie herstellen zonder een database blind terug te zetten. Databaseherstel gebeurt volgens PRIVACY-OPERATIONS.md en mag eerder verwijderde accounts niet opnieuw toegankelijk maken. Dezelfde privacy-/herstelvoorwaarden gelden voor de besloten pilot; ze worden met kleine concrete proeven ingevuld, niet met een nieuwe brede bouwfase.

## Vrijgavecriterium

De pilot is gereed als URL- én foto-import recepten automatisch opleveren en de echte tweepersoonsroute op picnic.devstef.nl slaagt, isolatie en herstel zijn gecontroleerd, mails aankomen, toevoegen alleen na akkoord gebeurt en de eigenaar weet hoe toegang/toevoegen kan worden gestopt. Lokaal groen, een mooie interface of een losse mailtest is afzonderlijk onvoldoende.


### Herautorisatie en concrete provisioning — 9 oktober 2026

De eigenaar gaf toestemming om de gerichte Cloudflare-herautorisatie te starten. De CLI bevestigde succesvol inloggen; de nieuwe scopes bevatten workers, scripts, routes, D1, queues en zone-read. Daarna slaagden D1-, R2- en queue-inventarisatie. Geen van de voorgenomen pilotresources bestaat. Andere projecten zijn ongemoeid gelaten.

Het eerste concrete aanmaakcommando voor EU-D1 `picnic-production` is **door automatische goedkeuringscontrole geweigerd vóór uitvoering**: blijvende productievoorzieningen met mogelijke kosten waren volgens de controle niet specifiek genoeg geautoriseerd. Er is daarom nog niets geprovisioneerd of uitgerold. De eigenaar is gevraagd om akkoord op precies deze acht voorzieningen:

| Voorziening | Naam | Afbakening |
| --- | --- | --- |
| D1 | picnic-production | Nieuwe lege database, EU-jurisdictie |
| R2 | picnic-uploads-production | Private bucket, EU-jurisdictie, Standard storage |
| Importqueue + DLQ | picnic-imports-production / picnic-imports-dead-production | Eigen productiequeues |
| AI-queue + DLQ | picnic-ai-production / picnic-ai-dead-production | Eigen productiequeues |
| Toevoegqueue + DLQ | picnic-additions-production / picnic-additions-dead-production | Eigen productiequeues |

Aanmaken is geen betaald planupgrade. [D1](https://developers.cloudflare.com/d1/platform/pricing/) en [Queues](https://developers.cloudflare.com/queues/platform/pricing/) bieden Workers Free-quota. [R2 Standard](https://developers.cloudflare.com/r2/pricing/) heeft gratis maandquota, maar overschrijding kan gebruikskosten veroorzaken; quota zijn accountbreed. Geen nul-kostengarantie voor onbeperkt toekomstig gebruik. Na specifieke toestemming hieronder uitvoeren, actualiteit controleren en echte IDs aan de configuratie koppelen. Gebruik geen automatische configuratiewijziging voor de algemene omgeving.

```sh
node node_modules/wrangler/bin/wrangler.js d1 create picnic-production --jurisdiction eu --update-config=false
node node_modules/wrangler/bin/wrangler.js r2 bucket create picnic-uploads-production --jurisdiction eu --storage-class Standard --update-config=false
node node_modules/wrangler/bin/wrangler.js queues create picnic-imports-production
node node_modules/wrangler/bin/wrangler.js queues create picnic-imports-dead-production
node node_modules/wrangler/bin/wrangler.js queues create picnic-ai-production
node node_modules/wrangler/bin/wrangler.js queues create picnic-ai-dead-production
node node_modules/wrangler/bin/wrangler.js queues create picnic-additions-production
node node_modules/wrangler/bin/wrangler.js queues create picnic-additions-dead-production
```

De EU-R2-binding krijgt `jurisdiction: "eu"` nadat de bucket bestaat. Vier authenticatie-/encryptiesleutels worden nieuw aangemaakt; productie-OpenAI-toegang en actuele importprijsattestatie ontbreken nog als bewezen releasebewijs. De aangewezen tweede tester krijgt pas mail wanneer ontvangerverificatie en de online omgeving gereed zijn. Privé-adressen en secretwaarden blijven buiten deze repository.

Read-only vervolgcontrole: `secret list --env production` meldt dat Worker `picnic-production` niet bestaat. Er zijn dus geen productiesecrets bevestigd. `picnic.devstef.nl` resolveert momenteel niet via de gebruikte resolver; geen bestaande pilotdienst aangetroffen. Geen deployment of secretwijziging uitgevoerd.

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
