# SPECIFICATION: MOB → Picnic Boodschappenmatcher

## 1. Inleiding

**Naam project:** MobToPicnic (of PicMob)

**Doel:**
Maakt het mogelijk om ingrediënten van recepten van MOB.co.uk automatisch te matchen met producten bij Picnic, zodat je ze met minimale klikken in je winkelwagen kunt zetten.

**Belang:**
Snel, efficiënt boodschappen doen, foutjes vermijden, geen handmatig zoeken naar elk ingredient.

---

## 2. Begrippen / definities

| Term            | Betekenis                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| MOB             | De site mob.co.uk waar je de recepten vandaan haalt                                                      |
| Picnic          | De Nederlandse supermarktservice via de app/website                                                      |
| Ingredientregel | De zin in het recept met ingrediënten, bijvoorbeeld “Firm tofu 400g”                                     |
| Normalisatie    | Proces van omzetten van raw ingredient-tekst naar gestructureerde data (type, variant, hoeveelheid etc.) |
| Kandidaten      | Resultaten uit `picnic-api.search(...)`, mogelijke producten in Picnic die overeenkomen                  |
| Confidence      | Mate waarin AI denkt dat een kandidaat de juiste match is (waarde tussen 0 en 1)                         |
| Endpoint        | API route van jouw server (bv `/api/match-session`)                                                      |

---

## 3. Functionele eisen

Dit zijn de features die de app moet hebben:

1. **Inloggen bij Picnic**

   * De server moet inloggen met Picnic (email + wachtwoord / authKey) en sessie behouden totdat uitgelogd of sessie verlopen.
   * Foutafhandeling als login mislukt.

2. **Ingredientextractie van MOB pagina**

   * Via bookmarklet of content-script: lezen van de ingredientlijst op de recetaspagina van MOB.
   * Uit de HTML elementen de regels met ingrediënten halen.

3. **Normalisatie (met AI)**

   * Voor elke ingredientregel: AI zet om naar JSON zoals: query, category, variant, brand (optioneel), organic (boolean), hoeveelheid (count, unit, size_hint) etc.

4. **Zoeken bij Picnic**

   * Gebruik gemaakt van `picnic-api.search(...)` op basis van de genormaliseerde query en eventueel extra hints (variant, organic etc.).
   * Ophalen van top N candidates (bv 10-15).

5. **Match-beslissing (met AI)**

   * AI kiest de beste kandidaat uit de candidates + geeft confidence + reden.
   * Beslissing: “pick” of “none”.

6. **Automatisch toevoegen aan winkelmand**

   * Als confidence boven een ingestelde drempel (configurabel, bv 0.7 of .72), dan automatisch product toevoegen.

7. **Review-UI / Bevestiging**

   * Voor de ingredienten waar AI niet overtuigd is (confidence < drempel) of waar geen goede kandidaten zijn, tonen in een UI.
   * Je laat top drie kandidaten zien per ingredient, je kiest welke je wil toevoegen.
   * UI moet kunnen bevestigen welke producten toegevoegd moeten worden.

8. **Feedback / leermogelijkheid**

   * Mapping van raw ingredient → gekozen Picnic product wordt opgeslagen (lokaal of in database) zodat later dezelfde mapping zonder AI of snel hergebruikt kan worden.
   * Mogelijkheid om synoniemen / merkvoorkeur toe te voegen.

9. **Veiligheid & privacy**

   * Je login-gegevens voor Picnic worden niet openbaar gedeeld.
   * Geen scraping van meer data dan nodig.
   * Alleen jouw eigen account gebruiken.

10. **Configuratie**

    * Drempel voor automatische toevoeging instelbaar (via `.env` of config file).
    * Instellingen voor merkvoorkeur, organic vs non-organic etc.

---

## 4. Niet-functionele eisen

* **Performance:** Reacties van AI + Picnic zoekopdrachten moeten acceptabel snel zijn (≤ enkele seconden per ingredientregel).
* **Robuustheid:** Fouten afhandelen (geen internet, API fails, login verlopen).
* **Modulariteit:** Code moet opgesplitst zijn in modules: AI-normalisatie, Picnic API wrapper, UI-review, bookmarklet / frontend.
* **Uitbreidbaarheid:** Later kunnen toevoegen van features zoals hoeveelheidsparsing (bijv. “2 x 400g”), verpakking formaat kiezen, merkvoorkeuren etc.
* **Gebruiksvriendelijkheid:** UI moet simpel zijn, duidelijk welke items toegevoegd zijn, welke nog gekozen moeten worden.

---

## 5. Use-cases / gebruikersscenario’s

| Scenario                                | Gebruiker doet                         | Resultaat                                                                                                                            |
| --------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Recept openen op MOB en klik “voeg toe” | Bookmarklet gebruikt                   | Ingrediënten worden gestuurd naar server, AI matcht, producten boven drempel automatisch toegevoegd, UI opent reviewpagina voor rest |
| Ingrediënt zoals “Firm tofu 400g”       | AI normalisatie / zoek & match         | Correcte Picnic product “Tofu naturel stevig …” wordt gekozen                                                                        |
| Ingrediënt onbekend of geen match       | AI geeft “none”                        | UI toont opties of gebruiker kan handmatig toevoegen of overslaan                                                                    |
| Merkvoorkeur ingesteld                  | Bijvoorbeeld altijd “Merk X” voor tofu | Kandidaten van merk X krijgen voorkeur of worden standaard gekozen                                                                   |

---

## 6. API endpoints specificatie

| Endpoint                                   | Methode | Input                                                           | Output / gedrag                                                                                                                                                                                             |
| ------------------------------------------ | ------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/match-session`                  | POST    | `{ items: [{ raw: string }], autoAddThreshold?: number }`       | Voor elk raw item: normalisatie, zoek kandida(a)t(en), AI beslissing, product automatisch toegevoegd bij hoge confidence; retourneert `sessionId`, samenvatting (aantal auto toegevoegd, aantal ter review) |
| `GET /api/session/:sessionId`              | GET     | —                                                               | Geeft alle resultaten van sessie terug, inclusief welke items toegevoegd zijn, welke in review staan, de kandidaten per item, de besluitvormingen                                                           |
| `POST /api/session/:sessionId/confirm-add` | POST    | `{ picks: [{ raw: string, productId: string, qty?: number }] }` | Voegt gekozen producten toe aan winkelmand voor de items die nog niet automatisch toegevoegd waren                                                                                                          |

---

## 7. Data modellen

* **IngredientItem**

  ```ts
  {
    raw: string;
    normalizedQuery: string;
    attributes: {
      category: string;
      variant?: string;
      brand?: string;
      organic?: boolean;
      notes?: string;
    };
    quantity: {
      count: number;
      unit: string; // “g”, “ml”, “stuk”, “pack” etc.
      sizeHint?: string;
    };
    candidates: Candidate[];
    decision: {
      decision: "pick" | "none";
      chosenProductId?: string;
      confidence: number;
      reason?: string;
    };
    added?: boolean;
  }
  ```

* **Candidate**

  ```ts
  {
    id: string;
    name: string;
    brand?: string;
    isBio: boolean;
    unitSize?: string;
    priceEUR?: string;
  }
  ```

* **Session**

  ```ts
  {
    sessionId: string;
    createdAt: Date;
    items: IngredientItem[];
  }
  ```

---

## 8. UI / interface schematic

* **Bookmarklet / client-side script**

  * Extra knop/bladwijzer: “Add to Picnic”
  * Leest de ingredientregels van de pagina → stuurt naar server → opent de reviewpagina

* **Reviewpagina** (`review.html`)

  * Metadata: hoeveel items in sessie, hoeveel automatisch toegevoegd, hoeveel ter review
  * Voor elk item ter review: raw tekst, top 3 kandidaten, radio buttons om te kiezen
  * Bevestigingsknop: “Voeg geselecteerde toe”

* **Feedback / melding**

  * Alert/pop-up bij bookmarklet: sessie aangemaakt, reviewpagina geopend
  * Op reviewpagina: status na toevoegen (hoeveel toegevoegd)

---

## 9. Technologie stack / afhankelijkheden

* **Backend / server**

  * Node.js (ESModules)
  * Express
  * `picnic-api` npm package
  * `openai` (Responses API)
  * dotenv voor config

* **Frontend**

  * Simpele HTML / JavaScript + CSS
  * Bookmarklet script

* **Opslag** (voor leermaps / synoniemen etc.)

  * Voor MVP in-memory sessies; later uitbreiden met database als Supabase / SQLite / etc.

---

## 10. Configuratie & deployment

* `.env` met variabelen:

  * OPENAI_API_KEY
  * PICNIC_EMAIL, PICNIC_PASSWORD
  * COUNTRY_CODE, API versie
  * AUTO_ADD_THRESHOLD
* Deployment: lokaal of op server (Node host). Zorg dat server bereikbaar is vanaf je browser (zodat bookmarklet fetch werkt).
* HTTPS indien mogelijk wanneer openbaar gebruikt.

---

## 11. Testgevallen / acceptatiecriteria

* [ ] Ingrediënt “Firm tofu 400g” → correct stevig tofu product gekozen
* [ ] Ingrediënt “Caster sugar” → kristalsuiker of vergelijkbaar product gesuggereerd
* [ ] Ingrediënt “Golden syrup” → als Picnic product bestaat, anders “geen match”
* [ ] Automatisch toevoegen gebeurt alleen als confidence ≥ drempel
* [ ] Reviewpagina toont correcte kandidaten voor items onder drempel
* [ ] Sessies werken: sessionId uniek, data consistent bij GET /api/session/:id
* [ ] Handmatige confirm-add voegt producten correct toe aan winkelmand

---

## 12. Randvoorwaarden / beperkingen

* Mogelijk dat Picnic API endpoints veranderen → “picnic-api” wrapper moet up-to-date zijn
* AI kan fouten maken → altijd mogelijkheid voor review
* Hoeveelheden + units parsing beperkt in eerste versie
* Alleen jouw Picnic account gebruikt → geen ondersteuning voor meerdere gebruikers (tenzij uitbreiden)

---

Met deze specificatie kan Codex / een ontwikkelaar meteen aan de slag aan jouw gewenste app.

Als je wil, kan ik deze specificatie genereren in een formaat dat Codex graag ziet (bijv. YAML, markdown checklist, user stories)?
