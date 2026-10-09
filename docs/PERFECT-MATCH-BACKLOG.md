# Architectuurbacklog: volledig voorstel binnen 30 seconden

9 oktober 2026. Maximaal 30s vanaf “Zoek mijn boodschappen” tot een volledig bruikbaar voorstel, inclusief upload en browseroverdracht. Menselijke keuze-/correctietijd afzonderlijk loggen; niet stilzwijgend aftrekken uit ruwe tijd. Snelheid én kwaliteit zijn vrijgavevoorwaarden. De budgetten hieronder zijn ontwerpallocaties, geen gemeten prestaties.

| Fase | Ontwerpbudget |
| --- | ---: |
| Invoer voorbereiden/upload of bronfetch | 4s |
| Extractie, tokentelling en noodzakelijke modelinterpretatie | 12s |
| Kandidaten/details/beoordeling | 8s |
| Opslaan, rekenen en zichtbare overdracht | 3s |
| Reserve voor scheduling/netwerk | 3s |

## P0 — zichtbare vastlopers en kritieke keten

1. **Samen publiceren van resultaat en ready-status** — lokaal uitgevoerd in ai.ts. Effect: polling kan niet stoppen tussen status en resultaat. Complexiteit klein. Bewijs: batchsnapshotregressie en importtests. Terugval: vorige code alleen als publicatiecontract op andere wijze wordt gewaarborgd; geen onbekende betaalde poging opnieuw versturen.
2. **Begrensde parallelle details** — lokaal uitgevoerd, drie tegelijk, twintig unieke reads. Effect: seriële globale detailketen verwijderd. Complexiteit klein. Mocktests bewijzen overlap/cap/dedup/foutvrijgave; live providerbelasting en snelheid nog meten. Terugval: concurrency één.
3. **Eén workflowklok en trace** — correlation ID en serverdeadline vanaf aanvraag; browser meet vanaf submit, inclusief voorbereiding. Leg zonder brontekst of secrets per fase duur, cachehit, requests, kandidaten, deadline en foutcode vast. Budget over queues/routes heen doorgeven; timeout van iedere externe aanvraag beperken tot resterende tijd. Lease/dedup behouden. Test late queue, langzaam model/Picnic, overschreden deadline en onbekende verzending. Complexiteit middel. Terugval: meetmodus zonder deadlinehandhaving. Een timeout alleen telt niet als succes.
4. **Betrouwbare voortgang en hervatting** — browser mag na polllimiet niet stilzwijgend in een actieve status blijven. Ready vereist een bruikbare kandidaat; publicatieprobleem tonen en resultaat opnieuw lezen, zonder herimport/modelreplay. Automatisch opslaan is al deterministisch/idempotent. Test ready zonder kandidaat, multi-recipe keuze, ontbrekende porties en late publicatie. Complexiteit klein/middel.

## P1 — minder werk per recept

5. **Gestructureerde URL-route** — bewaar individuele JSON-LD kandidaten en bronregels; parser voor getallen, breuken, eenheden, porties en bekende NL/EN namen. Bij complete gevalideerde data geen volledige generatieve reconstructie. Alleen onbekende velden compact aan model; stappen uit bron behouden. Groot verwacht effect op URL-latency en evidence, complexiteit middel/hoog. Test meerdere recepten, twee secties, breuken en ontbrekende hoeveelheden. Terugval: huidige extractie met zichtbare onzekerheden.
6. **Compacte fotoherkenning** — één transcriptie/interpretatie, geen universele tweede generatie op het kritieke pad. Vermijd redundante output zonder bronbewijs weg te nemen. OCR/layout alleen waar proefset kwaliteitswinst toont binnen tijdsbudget. Lange recepten niet trunceren om tijd kunstmatig te halen. Complexiteit middel/hoog. Test echte foto's met kolommen, schaduw en breuken. Terugval: directe vision met correctieflow.
7. **Bulk kandidaatbeoordeling** — load details/relaties in batches, harde regels in geheugen, alleen veranderde beoordelingen opslaan. Verrijk voorlopige winnaar en kansrijke onzekerheden in plaats van iedere onbekende hit; cap evalueren tegen Recall@k. Complexiteit middel. Test eigenaar-/generatie-isolatie, fingerprints, voorkeuren en goedkoopste voldoende verpakking. Terugval: bestaande relationele service.
8. **Gebundelde Decisions/Jev-proef** — eerst toegang, telling, actuele prijzen/regio en latency aantonen; onafhankelijke ambigue vragen bundelen op gedeelde input. Gebruik maximaal €1 totaal voor onderzoek, binnen bestaande maandledger. Harde uitsluitingen, rekenwerk en uitvoering blijven code. Meet precision, coverage, abstention en totaalduur; geen 30s claim uit providerlatency alleen. Complexiteit middel. Terugval: off/regels.

## P2 — kwaliteit en dekking

9. **Bronveldcontrole en NL/EN** — valideer genormaliseerd getal/eenheid/porties tegen letterlijke bron; halve handjes niet als heel rekenen; aankoopvorm zonder bewijs onbekend houden. Complexiteit middel. Regressies uit audit: Unicode ½, tablespoons/cups, 1/2 handje pistache, vers/gedroogde abrikozen.
10. **Onafhankelijke echte referentieset** — 100 recepten, 60 ontwikkeling/40 test, 50 URLs/25 screenshots/25 camerafoto's, vijf domeinen, NL/EN. Verwante varianten in één split. Kritieke labels onafhankelijk beoordelen. Held-out set sluiten vóór tuning. Complexiteit hoofdzakelijk labelwerk. Geen modelresultaat als ground truth gebruiken.

## Acceptatie en resterend werk

Vooraf per route/split koude en warme cache meten: hele recept correct, volledig bruikbaar binnen 30s, correcties, p50/p95/max, timeoutpercentage, requestaantallen en werkelijke kosten. Doel minstens 95% gangbare leesbare recepten zonder inhoudelijke correctie, gecombineerd met de 30s grens; alle overschrijdingen zichtbaar rapporteren. Kleine testset rechtvaardigt geen universele garantie. Geen vrijgave zonder echte end-to-end proef en behoud van alle financiële/uitvoeringsguards.

## Vervolgimplementatie — 9 oktober 2026

Na akkoord is de snelle gestructureerde/compacte route plus gedeeld tijdsbudget lokaal gebouwd. Lees [30-SECONDEN-IMPLEMENTATIE.md](30-SECONDEN-IMPLEMENTATIE.md) voor de precieze status, 349 geslaagde tests, migratie en grenzen. Dit vervangt eerdere vermeldingen dat deadline en snelle route uitsluitend ontwerp zijn. Productie blijft ongewijzigd; echte kwaliteit/latency en browserproef nog niet bewezen.
