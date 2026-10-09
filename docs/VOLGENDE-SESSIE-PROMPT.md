
### Hoeveelheidlabels bijgewerkt — 9 oktober 2026

Release `30caa950-2791-43b5-bd72-fdfd7bb4f9be` vervangt de eerste online versie. Nieuwe imports geven geen generieke controlewaarschuwing bij geldige exacte/rangehoeveelheden. Niet ondersteunde huishoudmaten blijven onbekend maar vermelden een aparte schatting in plaats van ten onrechte een ontbrekende bronhoeveelheid. Bestaande opgeslagen waarschuwingen zijn niet herschreven. Zes gerichte importtests, beide typechecks, build en diffcontrole geslaagd; deployment en HTTPS-health bevestigd. Geen nieuwe import of mandmutatie tijdens deze correctie. De eigenaar test eerst zelf; nodig de tweede tester niet uit zonder later akkoord.


### Eigenaarstest gestart — 9 oktober 2026

De eigenaar heeft de productie-Picnic-koppeling zelf afgerond. De online app toont verbonden en leest het bestaande mandje met precies de eerder gecontroleerde uien- en tomatenregel; geen nieuwe mandmutatie uitgevoerd. De eigenaar wil eerst zelf alles testen. Daarom is de uitnodiging aan de tweede tester uitgesteld tot nieuw akkoord na die eigen test; ontvangerverificatie is nog niet afgerond. Dit vervangt de eerdere instructie om direct na Verified uit te nodigen.

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


> Oudere overdracht hieronder is historisch; bovenstaande actuele status heeft voorrang.

## Laatste update: Cloudflare opnieuw geautoriseerd

Eigenaar keurde gerichte herautorisatie goed. CLI login geslaagd; D1/R2/queues inventory werkt. Geen pilotresources aanwezig. EU-D1 create picnic-production is vóór uitvoering door auto-review geweigerd wegens onvoldoende specifiek akkoord op blijvende resource/kosten. Nieuwe vraag op precies EU-D1, private EU-R2 en 3 productiequeues met 3 DLQs is pending. Geen provisioning/deploy/mail. Herhaal geblokkeerde aanmaak niet zonder nieuwe menselijke toestemming. Concrete commands en prijzenbronnen staan onderaan PILOT-RELEASE.md. Een browserpoging op Cloudflare-welkompagina is eveneens door review geblokkeerd; niet omzeild en niet meer nodig.

## Laatste update: tomatenproef uitgevoerd

Eigenaar keurde 1 verpakking Tomaten s1015589, 500 gram, maximaal €1,61 goed. Actie 290a7550-a5b9-467f-bf24-ab8d734b92fc ging naar unknown; daarna mand gelezen: exact 1 verpakking aanwezig. Bestaande herstelroute confirmed_added vastgelegd; actie resolved en herladen toont Toegevoegd. Niet opnieuw verzenden: toestemming verbruikt. Oude gele-uienactie blijft succeeded. Beide mandregels melden niet beschikbaar; aanwezigheid bewijst geen bestelbaarheid. Tweede tester-email is aangewezen in de chat; zet geen privé-adressen in repository. Geen uitnodiging verstuurd. Cloudflare-herautorisatie ter toestemming voorgelegd; nog niet gestart.

## Vervolg stap 1 → 2 → 3 (9 oktober 2026)

287 Worker-tests/33 bestanden, beide TypeScript-checks, build, bootstrap 6/6 en production dry-run groen. Negatieve beschikbaarheid via UNAVAILABLE-decorator normaliseert expliciet false; current-helper laat positieve search dat nooit overschrijven. Laatste live proef: categorieroot, 3 details en 1 zoekvraag (maximaal 5 aanvragen), géén expliciete positieve beschikbaarheid. Exacte add receipt blijft niet bewezen, normale ORDER-respons wordt unknown en nooit gereplayed.

Lokale browserselectie: alleen Tomaten SKU s1015589, 500 gram, 1 verpakking, € 1,61. Concrete toestemming gevraagd maar nog niet ontvangen; niet klikken voordat de menselijke reactie aantoonbaar toestemming geeft. Oude gele-uienactie nooit replayen. Tweede tester gevraagd; nog niet aangewezen.

Productionconfig bevat domeinroute en8 secretvereisten; Decisions en synchronisatie uit; D1-placeholder. Cloudflare whoami met netwerktoegang werkt, D1/R2 geven fout 10000 door ontbrekende scopes; queues list leeg. Gerichte herautorisatieopdracht in PILOT-RELEASE.md is voorbereid, niet uitgevoerd. Geen deploy, provisioning of mail. Production dry-run bundle /private/tmp/picnic-production-bundle. Lees het nieuwste vervolg in RECEPT-NAAR-MANDJE-VERIFICATIE.md en PILOT-RELEASE.md.

> Actuele aanvulling — 9 oktober 2026: catalogus/matching/Decisions-contracten zijn inmiddels lokaal geïntegreerd. Lees de nieuwe uitvoeringssectie in `RECEPT-NAAR-MANDJE-VERIFICATIE.md` vóór de historische overdracht hieronder. Migraties 0014–0016 zijn lokaal toegepast na consistente backup en herstelproef. Behoud alle wijzigingen en gegevens. Decisions en catalogussynchronisatie staan uit. Laatste volledige suite: 279 geslaagd; aansluitend 111 gerichte tests voor de laatste bronregelcorrectie, beide typechecks en definitieve build groen. Culy toont na herstel 12 geselecteerde producten met 14 verpakkingen (€42,82), zonder aankoop. Start geen identieke betaalde poging of mandmutatie. De standaard mandadapter blijft bij ontbrekend gecorreleerd product/aantalbewijs onbekend; historische geslaagde uienactie blijft geslaagd. Vervolgwerk: bewezen actuele verkoop-ID-beschikbaarheid/waargenomen aanvullende leesroute, categoriedekking, Decisions-telling/toegang/kwaliteitsproef en mutatiebewijs. Subagents waren in deze uitvoering expliciet door de gebruiker gevraagd; de oudere verbodsregel hieronder is historisch.

Werk in `/Users/stef/Code/picnic`.

De nieuwe vervolgopdracht is de gecombineerde catalogus- en Decisions-integratie. Lees [CATALOGUS-EN-DECISIONS-IMPLEMENTATIEPLAN.md](CATALOGUS-EN-DECISIONS-IMPLEMENTATIEPLAN.md); hoofdstuk 7 bevat de volledige startopdracht voor uitvoering in een nieuwe sessie. De onderstaande overdracht beschrijft de behouden uitgangssituatie. Jev-integratie wordt voorlopig uitgesteld.

Lees eerst `docs/RECEPT-NAAR-MANDJE-PLAN.md`, daarna `docs/RECEPT-NAAR-MANDJE-VERIFICATIE.md`, inclusief de aanvulling **Echte mandjesproef — 9 oktober 2026**. De lokale flow is gebouwd en de echte mandjesproef is geslaagd; heropen de ontwerpdiscussie niet.

De toestemming voor eenmalig 1 verpakking Gele uien (3 stuks, € 0,80) is **verbruikt**. Niet opnieuw toevoegen en geen nieuwe aankoopronde starten. Actie `e88f50b6-b701-4e75-81df-67c64e508826` is `succeeded`; de app heeft één verpakking teruggelezen. Herladen herstelt de geslaagde status. Behoud deze lokale actie en browseropslag.

Tijdens de proef is de mandweergave gericht hersteld: bij één artikel/één verpakking gebruikt de Picnic-adapter de expliciete PRICE-korting, hier € 0,80 in plaats van de basisprijs € 0,89. De provider meldt op de mandjeregel nog “niet beschikbaar”; de betekenis voor levering is niet vastgesteld. Er is niets besteld of betaald. Geen onzekere of geslaagde mutatie opnieuw verzenden.

De catalogus- en Decisions-uitbreiding staat in het nieuwe implementatieplan; ze is nog niet gebouwd. Een echte camerafoto blijft afzonderlijk resterend pilotbewijs. Hergebruik bestaande Culy- en testimports en beperk nieuwe AI-aanroepen. Geen nieuwe mandmutatie zonder concrete toestemming.

Behoud ALLE bestaande wijzigingen en lokale gegevens, vooral `src/services/picnicService.ts`. Geen reset, clean, deployment of subagents. Migratie 0013 is al lokaal toegepast. Frontend en Worker zijn gestart op `http://localhost:5173/` en poort 8787; controleer of ze nog draaien en start zo nodig de bestaande scripts zonder data te wissen. Gebruik de normale app-koppeling, geen handmatig uitgelezen of ontsleutelde credentials. Print geen geheimen.

Test bij nieuwe fouten gericht, controleer zelf de browser en werk het verificatierapport bij. Herhaal geen volledig bewezen controles zonder aanleiding. Geef korte concrete voortgang en een precies resultaat.
