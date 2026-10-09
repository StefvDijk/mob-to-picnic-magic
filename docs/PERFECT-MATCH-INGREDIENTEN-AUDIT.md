# Ingrediënten en hoeveelheden: onafhankelijke offline audit

9 oktober 2026. Onderdeel van PERFECT-MATCH-ONDERZOEKSPLAN.md. Productie, providerkoppelingen en bestaande wijzigingen zijn ongemoeid gelaten. De actuele verificatieoverdracht is gelezen; historische mandtoestemmingen zijn niet hergebruikt.

## Conclusie

De rekenlaag is exact voor reeds correct genormaliseerde hoeveelheden en porties. De semantische invoer is nog grotendeels een modelantwoord plus 33 Nederlandse kennisprofielen. Een correct JSON-schema en broncitaat bewijzen geen juiste interpretatie. De lokale rekenlaag veroorzaakt op deze kleine synthetische proef geen wachttijd van tientallen seconden. Voor maximaal 30 seconden moet de architectuur vooral de externe kritieke keten verkorten; meer modellen achter elkaar toevoegen vergroot die keten.

## Codegaranties versus aannamen

| Onderdeel | Codegarantie | Niet bewezen |
| --- | --- | --- |
| `shared/quantities.ts` | Exacte veilige rationale getallen; expliciete g/kg/ml/l/piece; geldige ranges en netto/uitlekbasis | Dat het getal, de eenheid of basis bij de bron past; ondersteuning van bronnotaties zoals ½ en 1,5 hoort elders |
| `worker/imports/ai.ts:92` | Voor tekst komen quote en originalText in de bron voor; veldlengtes/schema gecontroleerd; onbruikbare hoeveelheid wordt unknown | Geen deterministische vergelijking tussen brongetal en hoeveelheid, bronnaam en normalizedName, of bronporties en baseServings. Foto-evidence vergelijkt twee modelvelden |
| `worker/domain/quantityMath.ts` | Exact schalen zonder decimale afronding, geldige positieve bron-/doelporties | Bronporties zijn correct gelezen |
| `worker/domain/shopping.ts:58` | Bekende NL-lepels worden zichtbaar geschat; bronvelden blijven intact; ranges gebruiken bovengrens | Keukengewichten zijn projectschattingen; ontbreken van een hoeveelheid en een niet-ondersteunde hoeveelheid delen sommige fallbackregels |
| `worker/domain/shopping.ts:86` | Compatibele groepen optellen vóór verpakkingsafronding; bronregels behouden | Een herhaalde bronkopie is niet hetzelfde als een tweede echte ingrediëntregel: beide worden opgeteld |
| `shared/ingredient-knowledge.ts` | Versieerbare, inspecteerbare aliassen en uitsluitingen | Brede NL/EN-dekking, gevalideerde ontologie en universele conversies |

Sections blijven in sources aanwezig maar zijn geen groepssleutel. Dat is bruikbaar voor dezelfde ui in marinade en dressing; foutieve dubbele extractie verdubbelt ook de behoefte. Aankoopvorm en bereiding worden met beperkte Nederlandse regels gescheiden (`purchaseAttribute`); Engelse cutting notes en nieuwe aankoopvormen vereisen bewijs. Er is geen afzonderlijk required/optional-veld in RecipeIngredientDto. `(rode)` krijgt een specifieke uitzondering, geen algemene optional-parser.

## Reproduceerbare bevindingen

Uitvoeren: `node scripts/perfect-match-benchmark.mjs`. De harness transpileert uitsluitend de bestaande pure TypeScript-modules in geheugen, gebruikt projectgeschreven fixtures en doet nul externe aanvragen. Vereist de reeds geïnstalleerde projectdependency TypeScript. Er worden geen broninhoud, credentials of databases gelezen. Het bestaande synthetische labelbestand is zichtbaar in de repository; het woord held-out betekent hier de bestaande interne split, geen onafhankelijke echte recepttest.

| Geval | Werkelijk resultaat | Ernst en gevolg |
| --- | --- | --- |
| ½ eetlepel olijfolie, unknown invoer | demand null | Dekking: Unicode-breuk in fallback niet ondersteund; correctie nodig |
| 2 tablespoons olive oil, normalizedName olijfolie | demand null | Dekking: Engelse bronmaat niet ondersteund |
| olive oil als normalizedName | unverified:olive oil | Semantiek/retrieval: geen Engelse alias; model moet eerst correct vertalen |
| 1 cup bloem | demand null | Onbekend is veilig; cupstelsel en ingrediëntdichtheid moeten expliciet worden vastgesteld |
| 1/2 handje pistachenoten | demand 30 g | Middel: fractie wordt genegeerd en één volledig handje geschat. Met huidige schatting zou half handje 15 g zijn; kan een extra verpakking veroorzaken |
| abrikozen zonder vorm | knowledgeKey dried-apricot | Middel: kale vruchtnaam legt gedroogde aankoopvorm vast zonder bronevidence. Kan verkeerde productsoort suggereren |

De laatste vruchtprobe gebruikt bewust unknown hoeveelheid om de naamkeuze afzonderlijk te tonen; het betreft geen gemeten fout in een echte import. De modelnormalisatie kan zulke gevallen verbeteren of verslechteren, wat alleen echte labels kunnen vaststellen.

## Offline nulmeting

Op deze uitvoering: bestaande 30 ontwikkelparen 30 correct; bestaande 30 synthetische testparen 30 correct; vijf synthetische hoeveelheidcontracten vijf correct. Deze checks omvatten exacte fractionele porties, som van g/kg, bovengrens van ranges, NL-lepelinschatting en veilig onbekende behoefte. Geen receptselectie, OCR, kandidaat-recall, actuele Picnic-verpakkingen of volledig receptsucces gemeten. De zes exploratieve probes tellen niet als geslaagde regressies.

Een herhaling van 3.000 lokale regelbeoordelingen duurde circa 12 ms op deze machine. Dit is een diagnostische orde van grootte, zonder netwerk/DB en zonder cold start. Het bewijst geen p50/p95 voor de app of maximaal 30 seconden.

## Advies voor 30 seconden

1. Maak een deterministische parser voor bronaantal, breuken, NL/EN-eenheid en netto/uitlekbasis. Vergelijk getal/eenheid met de modeluitvoer; wijs tegenstrijdigheden gericht aan. Bewaar een aangewezen onbekende bronmaat als onbekend in plaats van een ontbrekende-hoeveelheidfallback. Geen extra modelaanvraag voor gewone rekenkunde.
2. Laat gestructureerde webingrediënten direct door dezelfde parser gaan; gebruik modelinterpretatie alleen voor bronselectie en semantische twijfel. Houd de volledige bronkopie voor controle.
3. Doe één gebundelde interpretatie voor het recept, geen sequentiële modelcontrole per regel. Gebruik harde variantregels en selectieve controle voor overgebleven onzekere kandidaten; de hoofdflow moet een totale deadline krijgen.
4. Meet afzonderlijk source_fetch, queue_wait, token_count, model_send, validation, shopping_retrieval, assessment en UI_presentation. De huidige count-timeout van 10 s plus send-timeout van 60 s in ai.ts passen samen al niet in de gewenste grens, nog vóór ophalen en matching.
5. Doe tweetalige kennisuitbreiding op gelabelde gevallen, inclusief kip met bot/vel, vers/gedroogd en tomatenvormen. Leg aankoopkenmerken expliciet vast; gebruik vage synoniemen niet om een ontbrekende vorm in te vullen.

Voorgesteld eerste verticale verbetering: brongetalparser plus vergelijking voor g/kg/ml/l/stuks en breuken, op gestructureerde URL-invoer. Rollback: gebruik bestaande route voor ongedekte of tegenstrijdige cases. Test de hele receptuitkomst en latency met dezelfde echte ontwikkelcases. Geen modelkeuze of kwaliteit van 95% uit de synthetische proef afleiden.
