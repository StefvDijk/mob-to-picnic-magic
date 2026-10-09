# Bronextractie, foto en latency: onafhankelijke audit

9 oktober 2026. Codeaudit en primaire documentatie; geen betaalde verzoeken, productiehandelingen of echte foto-accuracyproeven. Nieuwste overdracht in RECEPT-NAAR-MANDJE-VERIFICATIE.md gelezen: productieversie 30caa950-2791-43b5-bd72-fdfd7bb4f9be; eigenaar test zelf, geen uitnodiging of mandmutatie.

## Conclusie

Een bruikbaar volledig voorstel binnen 30 seconden is met de huidige architectuur niet gegarandeerd. De extractieketen heeft op zichzelf seriële externe deadlines van 10 seconden bronfetch, 10 seconden tokentelling en 60 seconden generatie, voordat productmatching klaar is. Dit zijn configuratiegrenzen, geen gemeten doorlooptijden en geen bewijs dat alle stappen hun maximale tijd gebruiken. Het model vervangen lost de overige afhankelijkheden niet op.

De snelste kansrijke verbetering is gestructureerde webdata behouden en direct normaliseren, met een compact modelverzoek alleen voor ambigue regels. Voor foto's is eerst meten nodig: directe vision vergelijken met OCR plus layout en gerichte interpretatie. OCR toevoegen is geen automatische snelheidswinst: een extra seriële provider kan juist vertragen.

## Feitelijke keten

1. `src/components/ImportPanel.tsx:85`: fotoverkleining en uploads lopen per foto serieel. `src/lib/import-photo.ts:13` beperkt tot 12 megapixels en langste zijde 2048 px, hercodeert altijd naar PNG. Dat verwijdert metadata, maar een foto van een hele pagina kan kleine tekst verliezen; PNG is geen gegarandeerde bytebesparing tegenover JPEG. Tot drie foto's zijn toegestaan; uploadtijd hoort bij het gebruikersdoel.
2. `worker/index.ts:55`: na POST wordt de importoutbox direct gedispatcht. `worker/imports/processor.ts:9` accepteert uitsluitend Culy/MOB. HTTPS-, redirect-, grootte- en paywallcontroles begrenzen de bron.
3. `worker/imports/extract.ts:153`: uitsluitend JSON-LD Recipe; exact gelijke kandidaten worden gededupliceerd. `HowToSection` blijft deels bewaard. Ingrediënten zijn nog ongeparseerde bronregels.
4. `worker/imports/processor.ts:24`: alle kandidaten worden tot één tekst samengevoegd. Kandidaatidentiteit en selectiegrenzen ontbreken in deze modeloverdracht. Zonder kandidaten wordt maximaal 50.000 tekens leesbare paginaplattetekst gebruikt.
5. `worker/queue.ts:36`: na verwerken volgt onmiddellijk `dispatchAiAttempts`; de hoofdketen wacht dus niet standaard op de minuutcron. Cron is herstel. Queue-batchtimeout is 5 seconden in `wrangler.jsonc`; dit is geen bewijs van een vaste wachttijd bij batchgrootte één. Busy/retry kan wel 60 seconden toevoegen.
6. `worker/imports/ai.ts:168`: foto's worden uit private R2 opgehaald, base64 gecodeerd en met `detail: high` gehydrateerd; reads zijn serieel. De generatie gebruikt `gpt-6-luna`, reasoning none, Responses, strikt JSON-schema, maximaal 6000 uitvoertokens.
7. `worker/imports/ai.ts:195`: externe tokentelling vóór budgetreservering; daarna generatie. Bij ongeldige/incomplete uitvoer mag een tweede volledige generatie volgen, alleen na een bekende uitkomst, nooit na onbekende betaalde verzending.
8. `worker/imports/ai.ts:244`: een succesvolle generatie overschrijft de oorspronkelijke kandidaten met één modelkandidaat. `src/components/ImportPanel.tsx:58` pollt elke 3 seconden, maximaal ongeveer 60 seconden bij succesvolle statusvragen. Een late uitkomst kan daardoor pas na extra gebruikersactie zichtbaar worden.

## Inhoudelijke bevindingen en reproduceerbare gevallen

| Ernst | Geval | Codebewijs en gevolg |
| --- | --- | --- |
| Hoog | Pagina met twee verschillende JSON-LD recepten | Extractor bewaart beide (bestaande `extract.test.ts`), processor voegt ze samen, AI-schema kan maar één recept teruggeven en resultaat vervangt beide. Geen codecontract voor correcte keuze of afwezigheid van vermenging. |
| Hoog | Foto waarop `½` of `150` verkeerd wordt gelezen | Validatie `ai.ts:109` vergelijkt `sourceQuote` met `originalText`, twee velden uit hetzelfde antwoord. Een identieke foute transcriptie passeert deze controle; geen OCR-boundingbox of onafhankelijke broncontrole. |
| Hoog | Bron `200 g bloem`, modelhoeveelheid `300 g` | Bronregel/citaat kunnen exact voorkomen terwijl de genormaliseerde hoeveelheid inhoudelijk fout is. `parseQuantity` valideert contractvorm, geen numerieke overeenkomst met de bron. Hetzelfde geldt voor betekenis en aankoopvorm. |
| Middel | JSON-LD `recipeYield: "Voor 4 personen"` of `"4–6 servings"` | `extract.ts:125` ondersteunt deze formuleringen niet; porties worden null. AI kan herstel proberen, maar geen verliesloze deterministische route. |
| Middel | Recipe genest in `mainEntity` of `@graph` als object | `recipeNodes` volgt arrays en array-`@graph`, geen algemene `mainEntity`-recursie. Leesbare paginaplattetekst wordt fallback; gestructureerd bewijs gaat verloren. |
| Middel | Meerdere ingrediëntsecties in gewone stringarrays | Sectietoewijzing bestaat alleen als ingrediëntobject `section/recipeSection` bevat. Sectienamen in instructies bewijzen geen toewijzing aan ingrediënten. |
| Middel | Lengte boven tekstlimiet of complexe lange bron | Bronoverdracht wordt op 50.000 tekens afgekapt. Extractor markeert eigen grenzen, maar processor voegt geen expliciete truncatievlag voor zijn samengestelde tekst toe. |
| Middel | HTML `200&nbsp;g` in JSON-LD-regel | JSON-LD `clean/entityDecode` decodeert `&nbsp;` niet; leesbare HTML-fallback doet dat wel. Prompt moet dan onnodig afwijkende bronnotatie interpreteren. |

Bestaande tests bewijzen onder meer deduplicatie, verschillende kandidaten, secties, SSRF-grenzen, paywallblokkering en fotoresizing met mocks. Ze bewijzen geen leeskwaliteit op echte foto's of volledige receptnauwkeurigheid. De overdracht bewijst één echte Culy-import met 18 ingrediënten; dit is geen onafhankelijke brede benchmark.

## Routevergelijking

| Route | Sterkte | Risico en 30s-gevolg |
| --- | --- | --- |
| Huidige directe vision/tekst | Eén semantische herkenner, huidig schema en duurzaam betaalcontract aanwezig | Transcriptie en interpretatie correleren; volledige JSON-uitvoer en reparatie kosten tijd. Geen modelbenchmark. |
| Structuur + deterministische parser + selectieve AI | Bronregels en kandidaatgrenzen blijven controleerbaar; geen volledige regeneratie van reeds aanwezige stappen | Parser moet NL/EN, huishoudmaten en vorm goed behandelen. Ambiguïteit moet zichtbaar blijven. Beste kandidaat voor snelle URL-route. |
| OCR/layout + parser + selectieve vision | Tekstposities, leesvolgorde en beeldkwaliteit kunnen verificatie ondersteunen | Twee externe stappen kunnen serieel trager zijn; OCR-fouten blijven mogelijk. Eerst proef op dezelfde heldere en moeilijke foto's. |

[recipe-scrapers](https://docs.recipe-scrapers.com/) ondersteunt HTML, JSON-LD, Microdata/RDFa en OpenGraph; is Python en MIT. Het doet zelf geen netwerkfetching en omzeilt geen botbescherming. Gebruik als offline vergelijkingsparser/ontwerpbron, niet zonder meer als extra productie-Workerdienst. [Ingredient groups](https://docs.recipe-scrapers.com/) verdienen afzonderlijke toetsing op behoud van secties.

[Document AI Enterprise OCR](https://docs.cloud.google.com/document-ai/docs/enterprise-document-ocr) levert blokken, regels, woorden en layout, met rotatiecorrectie en beeldkwaliteitsmetingen. De documentatie noemt Cloud Vision voor lage latency; dit geeft geen numerieke garantie voor onze recepten. Google-service niet geactiveerd. Meer OCR-capabilities zijn geen onafhankelijk bewijs van 95% correcte hele recepten.

## Geprioriteerde vervolgstappen

1. Leg klokmetingen vast vanaf gebruikerssubmit tot volledig voorstel: prepare/upload, queuewait, fetch, count, model, validation, retrieval, details en UI-zichtbaarheid. p50/p95, koud/warm en foutcodes gescheiden. Een timeoutmelding binnen 30s telt niet als bruikbaar voorstel.
2. Maak de bronkandidaten onveranderlijk; stuur gekozen kandidaat-ID en bewaarde bronregels door. Bij meerdere recepten vraag een keuze vóór interpretatie. Verifieer geen vermenging met twee sterk verschillende recepten.
3. Introduceer een URL-fast-path voor complete gestructureerde bronnen: deterministische hoeveelheden en bekende termen; compact modelverzoek voor alleen onbekende velden. Bewaar stappen uit extractie. Volledigheidscriteria en terugvalroute vooraf vastleggen.
4. Reserveer conservatief een veilige kostenbovengrens zonder een aparte externe tokentelling uitsluitend nadat de bovengrens voor tekst én beelden bewezen is; anders telling behouden. Budget/dedup/unknown-sendveiligheid blijven verplicht. Dit is ontwerpoptie, geen directe instructie het financiële contract te verwijderen.
5. Eén deadline voor de hele interactieve keten, geen volle tweede generatie binnen de 30s-flow. Voorzie expliciete herstelstatus; verlaag maximumuitvoer pas nadat lange geldige recepten geen truncatie krijgen. Mogelijk schema verkorten door dubbele citaten en stappen niet opnieuw te genereren, terwijl bronbewijs buiten het modelresultaat blijft.
6. Test foto-route op echte door eigenaar aangeleverde beelden: twee kolommen, breuken, glare, rotatie, ingrediënten plus dressing, afgesneden bron. OCR uitsluitend selectief toevoegen als kwaliteits-/latencymetingen voordeel bewijzen. Geen claim van 95% zonder onafhankelijke receptset.

Voorgesteld experiment: vijftien ontwikkelcases, dezelfde inputhash en onafhankelijk gelabelde regels/porties; baseline versus gestructureerde fast-path, daarna maximaal één foto-uitdager. Momenteel geen echte fotoverzameling of gefixeerde onafhankelijke referentieset beschikbaar; dus geen percentages of latencypercentielen uit mocktests afleiden.
