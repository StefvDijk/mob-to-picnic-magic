# Onafhankelijke audit: recept naar bruikbare boodschappen

9 oktober 2026. Codebaseline is de behouden lokale werkboom bij aanvang, niet uitsluitend Git HEAD. Productie blijft release 30caa950-2791-43b5-bd72-fdfd7bb4f9be. Geen deployment, nieuwe dienst of mandmutatie. Eigenaar heeft maximaal €1 voor latere modelvergelijkingen goedgekeurd; deze uitvoering heeft €0 modelkosten.

## Oordeel

De architectuur biedt sterke uitvoerings- en budgetcontroles, maar bewijst nog geen 95% juiste hele recepten. Ook een volledig bruikbaar voorstel binnen maximaal 30 seconden wordt niet afgedwongen. De nieuwe gebruikersinstructie maakt snelheid een productvoorwaarde, naast inhoudelijke kwaliteit; snelheid krijgt daarom voorrang boven uitbreiden van brondekking.

De huidige gebruikerstest blijft op “Je recept is herkend” in het importscherm. Dit is op de bestaande productietab alleen gelezen. Het boodschappenvenster is nog niet zichtbaar. Dit is dus geen bewezen langzame Picnic-zoekactie: de overgang van herkenning naar opslaan kan vastlopen. Geen herimport, modelaanroep, reload of aankoop uitgevoerd tijdens inspectie.

## Feitelijke keten

```mermaid
flowchart LR
  A[URL of foto] --> B[Upload en importtaak]
  B --> C[JSON-LD of pagin tekst of beeld]
  C --> D[Externe tokentelling]
  D --> E[Volledige modelgeneratie]
  E --> F[Validatie en publicatie]
  F --> G[Browserpoll en automatisch opslaan]
  G --> H[Zoeken per ingrediëntgroep]
  H --> I[Details en beoordelingen]
  I --> J[Hoeveelheden en voorstel]
```

URL-fetch mag 10s gebruiken; tokentelling 10s; generatie 60s. Queuewait, uploads, opslag en polling komen erbij. Een reparatie kan een tweede generatie toevoegen. Queue-dispatch gebeurt direct na importverwerking; de minuutcron is herstel en mag niet als normale hoofdoorzaak worden aangewezen. Batchtimeout 5s bij batchgrootte één bewijst evenmin een vaste wachttijd.

Matching verwerkt drie groepen tegelijk, maar gebruikte één globale seriële detailketen: maximaal twintig detailrequests met elk 10s timeout. Daarnaast worden per kandidaat meerdere D1 reads/writes gedaan. Lokale hoeveelheidberekening is millisecondenwerk. Decisions staat uit en de ingebouwde provider verzendt niet; het kan de huidige vertraging niet veroorzaken.

## Vastlooprisico en eerste lokale wijzigingen

`worker/imports/ai.ts` publiceerde eerst `ai_attempts.state=succeeded` en pas na extra databasevragen het bijbehorende `imports.result_json`. `worker/routes/imports.ts` leest beide in één snapshot. Polling stopt bij ready. Een snapshot in dit tussenvenster kan daardoor ready zonder resultaat bevatten, zodat de browser nooit automatisch verdergaat. Dit risico is uit code aangetoond; dat de huidige productieproef precies dit venster raakte is niet bewezen.

Lokaal worden betaalafrekening, terminale status en receptpublicatie nu in dezelfde D1-transactie opgeslagen, met behoud van eigenaar, sendtoken, usage, budget, vervaldatum en accountcontroles. De regressie bekijkt elk afgerond databasebatch: iedere zichtbare succeeded-status moet al één recept bevatten. De bestaande importtests blijven groen.

De productroute gebruikt lokaal een requestgebonden detailpool: maximaal drie tegelijk, twintig unieke producten, deduplicatie en geen automatische retry na leesfout. Sessiegeneratie en product-ID-controle blijven behouden. Dit verwijdert seriële wachttijd, maar is geen 30s-garantie. Beide wijzigingen zijn lokaal en nog niet gedeployed.

## Kwaliteit en techniekvergelijking

Details: [bronnen](PERFECT-MATCH-BRON-AUDIT.md), [ingrediënten](PERFECT-MATCH-INGREDIENTEN-AUDIT.md), [producten](PERFECT-MATCH-PRODUCT-AUDIT.md).

| Route | Verwacht voordeel | Bewijs en beperking |
| --- | --- | --- |
| Huidige volledige multimodale generatie | Eenvoudige integratie, schema en budget aanwezig | Geen brede echte accuracybenchmark; bronquote bewijst geen juiste interpretatie |
| Gestructureerde URL + parser + selectieve interpretatie | Minder generatie, betere bronherleidbaarheid | Beste voorlopige keuze voor URL; parserdekking moet worden gemeten |
| Directe vision + selectieve OCR/layoutcontrole | Foto's blijven ondersteund, extra controle op moeilijke beelden | Selectieve OCR is hypothese; extra stap kan traagheid toevoegen |

[recipe-scrapers](https://docs.recipe-scrapers.com/) is een ontwerp-/offline vergelijkingsbron voor structuur en siteparsers. [Document AI OCR](https://docs.cloud.google.com/document-ai/docs/enterprise-document-ocr) biedt layout/tekst en kwaliteitsinformatie, maar geen bewezen receptprestatie voor deze app. Geen dienst geactiveerd.

[OpenAI Decisions](https://developers.openai.com/api/docs/guides/decisions) is geschikt om gevonden kandidaten met classificatie-/scorevragen te beoordelen, eventueel meerdere vragen op gedeelde input. Het vervangt geen ontbrekende kandidaten of vrije recepttranscriptie. Jev is eveneens als vervangbare beoordelaar beschreven in het eerdere plan; geen toegang of gemeten prestatie vastgesteld. Geen van beide is daarom nu als totale snelheidsoplossing geselecteerd.

De [officiële latencyrichtlijnen](https://developers.openai.com/api/docs/guides/latency-optimization) ondersteunen minder output, minder requests, parallel werk en deterministische verwerking. Toepassing hier is een ontwerpkeuze, geen leveranciergarantie voor 30s.

## Besluit en vrijgavegrens

Bouw een snelle gestructureerde URL-route en een compacte foto-route; meet de gehele keten, beperk het kritieke pad en gebruik productclassificatie selectief. Geen volledige cataloguscrawl of tweede universele AI-pass als voorwaarde. De geprioriteerde uitwerking staat in [de backlog](PERFECT-MATCH-BACKLOG.md).

Een harde deadline kan wachten begrenzen, maar een externe storing kan een volledig correct voorstel onmogelijk maken. Een tijdige foutmelding telt als mislukking voor het doel “bruikbaar binnen 30s”. Rapporteer volledigheid, correctheid en tijd gezamenlijk. Onderzoek blijft onvolledig totdat echte onafhankelijke referenties, fotoset en toegestane modelvergelijkingen zijn uitgevoerd.

## Vervolgimplementatie — 9 oktober 2026

Na akkoord is de snelle gestructureerde/compacte route plus gedeeld tijdsbudget lokaal gebouwd. Lees [30-SECONDEN-IMPLEMENTATIE.md](30-SECONDEN-IMPLEMENTATIE.md) voor de precieze status, 349 geslaagde tests, migratie en grenzen. Dit vervangt eerdere vermeldingen dat deadline en snelle route uitsluitend ontwerp zijn. Productie blijft ongewijzigd; echte kwaliteit/latency en browserproef nog niet bewezen.
