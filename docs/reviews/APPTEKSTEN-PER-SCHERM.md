# Goedgekeurde appteksten per scherm

De huidige teksten staan hieronder per scherm en toestand, ieder op een eigen regel. Inclusief knoppen, invoervoorbeelden, laadteksten, lege toestanden, foutmeldingen, bevestigingsvensters, toegankelijkheidslabels en app-e-mails. De bijlagen bevatten de componentbibliotheek en oudere schermen uit de code.

**Reviewdatum:** 10 oktober 2026. **Goedkeuring:** alle tekstregels zijn door de gebruiker goedgekeurd. De gewijzigde teksten en verwijderingen zijn verwerkt in de appbroncode.

De gebruiker heeft alle teksten expliciet goedgekeurd zonder zelf de vakjes af te vinken. De vakjes zijn daarom als goedgekeurd gemarkeerd. Bij een volgende wijziging kun je de tekst rechtstreeks aanpassen en het regelnummer behouden; geef daarna aan dat de wijziging in de app mag worden verwerkt.

`{…}` staat voor variabele inhoud. `⏎` betekent een nieuwe regel in een invoervoorbeeld. Beoordeel het hele sjabloon, inclusief hoofdletters, leestekens, eenheden en pijlen. Gelijke tekst op verschillende schermen staat opnieuw vermeld als de context anders is. Binnen één toestand is dezelfde tekst één keer opgenomen.

**Goedgekeurd:** 1295 regels. Alle vaste teksten en tekstsjablonen in dit bestand zijn akkoord. Variabele inhoud, zoals receptgegevens, Picnic-producten en teksten op afbeeldingen, verandert per resultaat. Browserteksten hebben hun eigen reviewpunten.

## Schermenoverzicht

- 01 Appnaam en navigatie
- 02 Inloggen
- 03 E-mailadres opnieuw bevestigen
- 04 Mand en recept toevoegen
- 05 Voortgang bij import en boodschappen zoeken
- 06 Boodschappen controleren
- 07 Ander Picnic-product kiezen
- 08 Ingrediënt aanpassen
- 09 Toevoegstatus in Picnic
- 10 Recepten met bewaarde productkeuzes
- 11 Picnic en het huidige mandje
- 12 Picnic koppelen of de koppeling vervangen
- 13 Picnic ontkoppelen
- 14 Account
- 15 Account verwijderen
- 16 Beheer
- 17 Pagina niet gevonden
- 18 Gedeelde productkaarten en hoeveelheidsknoppen
- 19 Gedeelde netwerk en servermeldingen
- 20 E-mails die de gebruiker ontvangt
- 21 Variabele inhoud en browserteksten
- 22 Oude welkom en receptoverzicht
- 23 Oude receptdetailweergave
- 24 Oude receptimportweergave
- 25 Oude recepteditor en versieconflicten
- 26 Oud recept of bronkopie verwijderen
- 27 Oude boodschappenweergave
- 28 Componentbibliotheek
- 29 Losse oudere componenten

## 01 Appnaam en navigatie

De gedeelde teksten verschijnen op de hoofdschermen. Op mobiel verdwijnt de verbindingsknop; de navigatie verhuist naar onderaan.

### Appnaam en knoppen

Bron: [src/pages/ShoppingPreview.tsx](/Users/stef/Code/picnic/src/pages/ShoppingPreview.tsx).

- [x] **01.001** — Mand
- [x] **01.002** — Recepten
- [x] **01.003** — Picnic
- [x] **01.004** — Account
- [x] **01.005** — Picnic verbonden
- [x] **01.006** — Verbind Picnic
- [x] **01.007** — Ga naar inhoud
- [x] **01.008** — Preview
- [x] **01.009** — Lokale preview met testgegevens · er gaan geen producten naar je echte mandje

### Toegankelijkheidslabels

Bron: [src/pages/ShoppingPreview.tsx](/Users/stef/Code/picnic/src/pages/ShoppingPreview.tsx).

- [x] **01.010** — Naar Mand
- [x] **01.011** — Hoofdnavigatie

### Browsertab en omschrijving

Bron: [index.html](/Users/stef/Code/picnic/index.html), [src/pages/ShoppingPreview.tsx](/Users/stef/Code/picnic/src/pages/ShoppingPreview.tsx).

- [x] **01.012** — Boodschappen · Picnic
- [x] **01.013** — Boodschappen · Preview
- [x] **01.014** — Ieder recept snel in je Picnic-mandje.

### Laden en herstellen

Bron: [src/pages/ShoppingPreview.tsx](/Users/stef/Code/picnic/src/pages/ShoppingPreview.tsx).

- [x] **01.015** — Je boodschappen laden…
- [x] **01.016** — Boodschappen ophalen…
- [x] **01.017** — Opnieuw proberen
- [x] **01.018** — Je sessie is verlopen. Log opnieuw in om verder te gaan.
- [x] **01.019** — Verbinden is niet gelukt.
- [x] **01.020** — Je boodschappen zijn niet geladen.


## 02 Inloggen

Verschijnt wanneer je nog niet bent ingelogd. Route: / en de andere hoofdschermen zonder sessie. Boven het formulier staat Mand.

### E-mailadres invullen

Bron: [src/components/AuthPanel.tsx](/Users/stef/Code/picnic/src/components/AuthPanel.tsx).

- [x] **02.003** — Log in met je e-mailadres. Je ontvangt een code, dus een wachtwoord onthouden hoeft niet.
- [x] **02.004** — E-mailadres
- [x] **02.005** — jij@voorbeeld.nl
- [x] **02.006** — Stuur mij een code
- [x] **02.007** — Code aanvragen…

### Code invullen

Bron: [src/components/AuthPanel.tsx](/Users/stef/Code/picnic/src/components/AuthPanel.tsx).

- [x] **02.009** — Code aangevraagd voor {e-mailadres}.
- [x] **02.010** — Zescijferige e-mailcode
- [x] **02.011** — Inloggen
- [x] **02.012** — Controleren…
- [x] **02.013** — Ander adres of nieuwe code
- [x] **02.014** — Als dit adres toegang heeft, ontvang je een code per e-mail. De code is 10 minuten geldig.

### Foutmeldingen

Bron: [src/components/AuthPanel.tsx](/Users/stef/Code/picnic/src/components/AuthPanel.tsx).

- [x] **02.015** — De code kon niet worden aangevraagd.
- [x] **02.016** — Deze code is ongeldig of verlopen. Vraag zo nodig een nieuwe aan.
- [x] **02.017** — Inloggen is mislukt.

### Foutmeldingen van de server

Bron: [worker/auth/index.ts](/Users/stef/Code/picnic/worker/auth/index.ts).

- [x] **02.018** — Niet gevonden.
- [x] **02.019** — Methode niet toegestaan.
- [x] **02.020** — Verzoek geweigerd.
- [x] **02.021** — Inloggen is tijdelijk niet beschikbaar.
- [x] **02.022** — Je hebt te veel pogingen gedaan. Wacht even en probeer opnieuw.
- [x] **02.023** — De code is ongeldig of verlopen. Vraag zo nodig een nieuwe code aan.


## 03 E-mailadres opnieuw bevestigen

Dit scherm verschijnt bij een handeling die opnieuw bevestigen vereist, vanuit Account, Picnic of Beheer. De gewone codevelden en knoppen van Inloggen staan hier ook.

### Teksten bij opnieuw bevestigen

Bron: [src/components/AuthPanel.tsx](/Users/stef/Code/picnic/src/components/AuthPanel.tsx), [src/components/AccountPanel.tsx](/Users/stef/Code/picnic/src/components/AccountPanel.tsx), [src/components/AdminPanel.tsx](/Users/stef/Code/picnic/src/components/AdminPanel.tsx).

- [x] **03.002** — Bevestig je e-mailadres
- [x] **03.003** — Voor deze handeling vragen we een nieuwe e-mailcode.
- [x] **03.004** — E-mailadres
- [x] **03.005** — jij@voorbeeld.nl
- [x] **03.006** — Stuur mij een code
- [x] **03.007** — Code aanvragen…
- [x] **03.008** — Code aangevraagd voor {e-mailadres}.
- [x] **03.009** — Zescijferige e-mailcode
- [x] **03.010** — Inloggen
- [x] **03.011** — Controleren…
- [x] **03.012** — Nieuwe code aanvragen
- [x] **03.013** — Annuleren
- [x] **03.014** — Als dit adres toegang heeft, ontvang je een code per e-mail. De code is 10 minuten geldig.
- [x] **03.015** — E-mailadres bevestigd. Kies de handeling opnieuw.

### Foutmeldingen

Bron: [src/components/AuthPanel.tsx](/Users/stef/Code/picnic/src/components/AuthPanel.tsx), [worker/auth/index.ts](/Users/stef/Code/picnic/worker/auth/index.ts).

- [x] **03.016** — De code kon niet worden aangevraagd.
- [x] **03.017** — Deze code is ongeldig of verlopen. Vraag zo nodig een nieuwe aan.
- [x] **03.018** — Inloggen is mislukt.
- [x] **03.019** — Niet gevonden.
- [x] **03.020** — Methode niet toegestaan.
- [x] **03.021** — Verzoek geweigerd.
- [x] **03.022** — Inloggen is tijdelijk niet beschikbaar.
- [x] **03.023** — Je hebt te veel pogingen gedaan. Wacht even en probeer opnieuw.
- [x] **03.024** — De code is ongeldig of verlopen. Vraag zo nodig een nieuwe code aan.


## 04 Mand en recept toevoegen

Route: /. De bronkeuze opent direct. De bronnaam en de bovenste terugknop uit de component worden hier door CSS verborgen; ze staan bij de oude importweergave.

### Begin en bronkeuze

Bron: [src/components/ImportPanel.tsx](/Users/stef/Code/picnic/src/components/ImportPanel.tsx).

- [x] **04.001** — Wat wil je toevoegen?
- [x] **04.002** — Ieder recept snel in je Picnic-mandje.
- [x] **04.003** — Kies een bron
- [x] **04.004** — Foto
- [x] **04.005** — Link
- [x] **04.006** — Personen
- [x] **04.007** — Zoek boodschappen
- [x] **04.008** — Recept versturen…

### Foto kiezen

Bron: [src/components/ImportPanel.tsx](/Users/stef/Code/picnic/src/components/ImportPanel.tsx).

- [x] **04.009** — Foto’s van je recept
- [x] **04.010** — Maximaal 3 foto’s, 8 MB en 12 megapixels per foto. JPG, PNG of WebP.
- [x] **04.011** — {aantal} foto geselecteerd
- [x] **04.012** — {aantal} foto’s geselecteerd
- [x] **04.013** — Kies maximaal 3 foto’s van hetzelfde recept.

### Link invoeren

Bron: [src/components/ImportPanel.tsx](/Users/stef/Code/picnic/src/components/ImportPanel.tsx).

- [x] **04.014** — Link naar het recept
- [x] **04.015** — https://voorbeeld.nl/recept
- [x] **04.016** — Plak een link naar een recept. Sommige websites blokkeren automatisch ophalen; dan kun je een foto of screenshot gebruiken.

### Meerdere recepten gevonden

Bron: [src/components/ImportPanel.tsx](/Users/stef/Code/picnic/src/components/ImportPanel.tsx).

- [x] **04.017** — Welke boodschappen wil je toevoegen?
- [x] **04.018** — {gevonden recepttitel}
- [x] **04.019** — Recept {volgnummer}
- [x] **04.020** — Recept zonder titel

### Personen in de bron ontbreken

Bron: [src/components/ImportPanel.tsx](/Users/stef/Code/picnic/src/components/ImportPanel.tsx).

- [x] **04.021** — {brondomein of Je foto}
- [x] **04.022** — {gevonden recepttitel}
- [x] **04.023** — Voor hoeveel personen zijn de hoeveelheden in de bron? Zo rekenen we jouw boodschappen goed om.
- [x] **04.024** — Bekijk het oorspronkelijke recept ↗
- [x] **04.025** — Personen in de bron
- [x] **04.026** — Zoek producten voor {aantal} personen

### Resultaat en herstel

Bron: [src/components/ImportPanel.tsx](/Users/stef/Code/picnic/src/components/ImportPanel.tsx).

- [x] **04.027** — Het recept is na 30 seconden nog niet klaar. Je bron blijft bewaard.
- [x] **04.028** — Bekijk bestaand resultaat
- [x] **04.029** — Opnieuw proberen
- [x] **04.030** — Boodschappen opnieuw openen
- [x] **04.031** — We konden de ingrediënten nog niet lezen
- [x] **04.032** — Deze bron is verlopen. Kies je link of foto opnieuw.
- [x] **04.033** — Andere bron kiezen

### Andere bron kiezen bevestigen

Bron: [src/components/ImportPanel.tsx](/Users/stef/Code/picnic/src/components/ImportPanel.tsx).

De vraag verschijnt in een browserdialoog; de browser bepaalt de knopteksten.

- [x] **04.034** — Wil je een andere bron kiezen? Het huidige importconcept blijft nog op de server bestaan, maar verdwijnt uit dit scherm.

### Foutmeldingen

Bron: [src/components/ImportPanel.tsx](/Users/stef/Code/picnic/src/components/ImportPanel.tsx).

- [x] **04.035** — Dit importconcept is niet meer beschikbaar. Je kunt een nieuwe bron kiezen.
- [x] **04.036** — De importstatus kon niet worden opgehaald.
- [x] **04.037** — De verwerking duurde langer dan 30 seconden. Je opgeslagen bron blijft behouden.
- [x] **04.038** — De uitkomst van het verzenden is onbekend. Je bron blijft hier staan; controleer je verbinding voordat je opnieuw probeert.
- [x] **04.039** — De bron kon niet worden verstuurd.
- [x] **04.040** — Je boodschappen konden niet worden geopend.

### Fotoverwerking mislukt

Bron: [src/lib/import-photo.ts](/Users/stef/Code/picnic/src/lib/import-photo.ts).

- [x] **04.041** — Kies een JPG-, PNG- of WebP-foto.
- [x] **04.042** — Deze foto is groter dan 8 MB. Kies een kleiner bestand.
- [x] **04.043** — Deze foto kan niet worden gelezen. Kies een andere foto.
- [x] **04.044** — Deze foto is groter dan 12 megapixels. Verklein of knip de foto eerst bij.
- [x] **04.045** — Foto verwerken lukt niet in deze browser.
- [x] **04.046** — Foto verwerken is mislukt.
- [x] **04.047** — De verwerkte foto is te groot. Knip de foto bij tot het recept.

### Import geweigerd of mislukt

Bron: [worker/routes/imports.ts](/Users/stef/Code/picnic/worker/routes/imports.ts).

- [x] **04.048** — Dit verzoek is niet toegestaan.
- [x] **04.049** — Verstuur geldige JSON.
- [x] **04.050** — Geen toegang.
- [x] **04.051** — Log opnieuw in.
- [x] **04.052** — Ongeldig tijdsbudget.
- [x] **04.053** — Je recept kon niet binnen 30 seconden worden verwerkt.
- [x] **04.054** — Importeer een recept via een HTTPS-link of foto.
- [x] **04.055** — Kies 1 tot 3 opgeslagen receptfoto’s.
- [x] **04.056** — Deze HTTPS-link wordt niet ondersteund.
- [x] **04.057** — Gebruik een HTTPS-link naar een openbare website zonder inloggegevens.
- [x] **04.058** — Ongeldige bronnaam.
- [x] **04.059** — Kies een receptfoto of ondersteunde HTTPS-link.
- [x] **04.060** — Import kon niet worden aangemaakt.
- [x] **04.061** — Niet gevonden.
- [x] **04.062** — Deze handeling is niet beschikbaar.
- [x] **04.063** — Ongeldige importverwijzing.

### Upload geweigerd of mislukt

Bron: [worker/routes/uploads.ts](/Users/stef/Code/picnic/worker/routes/uploads.ts).

- [x] **04.064** — Geen toegang.
- [x] **04.065** — Log opnieuw in.
- [x] **04.066** — Dit verzoek is niet toegestaan.
- [x] **04.067** — Upload een PNG-afbeelding.
- [x] **04.068** — De afbeelding is groter dan 8 MB.
- [x] **04.069** — Deze PNG-afbeelding is ongeldig.
- [x] **04.070** — Deze PNG-afbeelding is ongeldig of wordt niet ondersteund.
- [x] **04.071** — De upload kon niet worden aangemaakt.
- [x] **04.072** — De beschikbare opslagruimte is bereikt.
- [x] **04.073** — De afbeelding kon niet worden opgeslagen. Probeer het later opnieuw.
- [x] **04.074** — Niet gevonden.
- [x] **04.075** — Deze handeling is niet beschikbaar.
- [x] **04.076** — Ongeldige afbeeldingsverwijzing.

### Recept uit de import opslaan mislukt

Bron: [worker/routes/recipes.ts](/Users/stef/Code/picnic/worker/routes/recipes.ts).

- [x] **04.077** — Import niet gevonden.
- [x] **04.078** — Deze import is verlopen.
- [x] **04.079** — Deze import is nog niet klaar.
- [x] **04.080** — Kies een geldig importresultaat.
- [x] **04.081** — Controleer de receptgegevens.
- [x] **04.082** — Ongeldige importverwijzing.
- [x] **04.083** — Kies een herkend recept.
- [x] **04.084** — Een bronafbeelding is niet beschikbaar.
- [x] **04.085** — Deze import kan niet meer worden opgeslagen.
- [x] **04.086** — Het recept kon niet worden bewaard.

### Uitleg bij importproblemen

Bron: [src/lib/import-draft.ts](/Users/stef/Code/picnic/src/lib/import-draft.ts).

- [x] **04.087** — Gebruik een HTTPS-link naar een openbare website zonder inloggegevens.
- [x] **04.088** — Dit recept staat achter een betaalmuur. Gebruik een foto of screenshot van het recept.
- [x] **04.089** — De website stuurde door naar een onveilige of ongeldige link.
- [x] **04.090** — Er is geen volledig voorstel binnen 30 seconden. Je bron blijft bewaard.
- [x] **04.091** — Het ophalen van de pagina duurde te lang.
- [x] **04.092** — De pagina is te groot om te verwerken.
- [x] **04.093** — De pagina kon niet worden opgehaald. Mogelijk blokkeert de website automatisch ophalen; probeer een foto of screenshot.
- [x] **04.094** — De link verwijst niet naar een ondersteunde webpagina.
- [x] **04.095** — De import kon niet worden verwerkt.
- [x] **04.096** — Foto-import is nog niet beschikbaar.

### Herkenning niet beschikbaar

Bron: [src/lib/import-draft.ts](/Users/stef/Code/picnic/src/lib/import-draft.ts).

- [x] **04.097** — De herkenning heeft het tijdsbudget overschreden. Je bron blijft bewaard. Probeer later opnieuw of kies een andere bron.
- [x] **04.098** — Automatische herkenning staat tijdelijk uit. Probeer later opnieuw of kies een andere bron.
- [x] **04.099** — Automatische herkenning is nog niet beschikbaar. Probeer later opnieuw of kies een andere bron.
- [x] **04.100** — Automatische herkenning wacht op een kostencontrole. Probeer later opnieuw of kies een andere bron.
- [x] **04.101** — De kosten van deze herkenning konden niet betrouwbaar worden bepaald. Probeer later opnieuw of kies een andere bron.
- [x] **04.102** — Deze herkenning past niet binnen het beschikbare budget. Probeer later opnieuw of kies een andere bron.
- [x] **04.103** — Deze bron is te groot voor automatische herkenning. Probeer later opnieuw of kies een andere bron.
- [x] **04.104** — Het herkenningsresultaat kon niet betrouwbaar worden verwerkt. Probeer later opnieuw of kies een andere bron.
- [x] **04.105** — De herkenningsdienst is tijdelijk niet beschikbaar. Probeer later opnieuw of kies een andere bron.
- [x] **04.106** — Dit importconcept is verlopen. Probeer later opnieuw of kies een andere bron.
- [x] **04.107** — De oorspronkelijke bron is niet meer beschikbaar. Probeer later opnieuw of kies een andere bron.
- [x] **04.108** — Automatische herkenning is niet beschikbaar voor deze import. Probeer later opnieuw of kies een andere bron.


## 05 Voortgang bij import en boodschappen zoeken

Verschijnt tijdens het ophalen van een bron, het lezen van ingrediënten en het zoeken van producten.

### Bron boven de voortgang

Bron: [src/components/ShoppingProgress.tsx](/Users/stef/Code/picnic/src/components/ShoppingProgress.tsx), [src/components/ImportPanel.tsx](/Users/stef/Code/picnic/src/components/ImportPanel.tsx).

- [x] **05.001** — {brondomein}
- [x] **05.002** — Je receptlink
- [x] **05.003** — Je foto
- [x] **05.004** — {recepttitel}
- [x] **05.005** — Jouw boodschappen

### Fases en uitleg

Bron: [src/components/ShoppingProgress.tsx](/Users/stef/Code/picnic/src/components/ShoppingProgress.tsx).

- [x] **05.006** — Je bron ophalen
- [x] **05.007** — We halen je link of foto op en zetten de ingrediënten klaar.
- [x] **05.008** — Ingrediënten lezen
- [x] **05.009** — We halen de ingrediënten en hoeveelheden uit je bron.
- [x] **05.010** — Producten zoeken
- [x] **05.011** — We zoeken passende verpakkingen en berekenen de aantallen.
- [x] **05.012** — Bron
- [x] **05.013** — Ingrediënten
- [x] **05.014** — Producten
- [x] **05.015** — 1
- [x] **05.016** — 2
- [x] **05.017** — 3

### Verstreken tijd

Bron: [src/components/ShoppingProgress.tsx](/Users/stef/Code/picnic/src/components/ShoppingProgress.tsx).

- [x] **05.018** — {aantal} sec verstreken
- [x] **05.019** — Na 30 sec kun je opnieuw controleren
- [x] **05.020** — Het duurt langer. Je bron blijft bewaard.

### Toegankelijkheidslabels

Bron: [src/components/ShoppingProgress.tsx](/Users/stef/Code/picnic/src/components/ShoppingProgress.tsx).

- [x] **05.021** — Boodschappen voorbereiden
- [x] **05.022** — Voortgang


## 06 Boodschappen controleren

Route: /boodschappen/{receptId}. Op mobiel zijn de terugknop en de kleine kop boven de recepttitel verborgen.

### Kop en personen

Bron: [src/components/RecipeProducts.tsx](/Users/stef/Code/picnic/src/components/RecipeProducts.tsx).

- [x] **06.001** — Boodschappen
- [x] **06.002** — Controleer je boodschappen
- [x] **06.003** — {recepttitel}
- [x] **06.004** — Personen
- [x] **06.005** — Voor hoeveel personen is het oorspronkelijke recept?
- [x] **06.006** — Bereken mijn boodschappen
- [x] **06.007** — Boodschappen ophalen

### Filters en lege toestand

Bron: [src/components/RecipeProducts.tsx](/Users/stef/Code/picnic/src/components/RecipeProducts.tsx).

- [x] **06.008** — Alles {aantal}
- [x] **06.009** — Te kiezen {aantal}
- [x] **06.010** — Heb ik al {aantal}
- [x] **06.011** — Alles is gekozen. Je boodschappen staan klaar.

### Product en hoeveelheid

Bron: [src/components/RecipeProducts.tsx](/Users/stef/Code/picnic/src/components/RecipeProducts.tsx).

- [x] **06.012** — {Picnic-productnaam of ingrediëntnaam}
- [x] **06.013** — {verpakkingsomschrijving} · {hoeveelheid} nodig
- [x] **06.014** — {hoeveelheid} nodig
- [x] **06.015** — Naar smaak
- [x] **06.016** — Geen hoeveelheid in de bron
- [x] **06.017** — {bronhoeveelheden gescheiden door +} uit bron
- [x] **06.018** — Product kiezen
- [x] **06.019** — Aantal kiezen
- [x] **06.020** — Keuze controleren
- [x] **06.021** — Opnieuw kiezen
- [x] **06.022** — Kies een product
- [x] **06.023** — Kies het aantal verpakkingen
- [x] **06.024** — Heb ik al
- [x] **06.025** — Toch toevoegen
- [x] **06.026** — Berekening bekijken
- [x] **06.027** — Onthoud dit product
- [x] **06.028** — Zelf gekozen vervanging
- [x] **06.029** — +
- [x] **06.030** — −

### Uit eigen keuken

Bron: [src/components/RecipeProducts.tsx](/Users/stef/Code/picnic/src/components/RecipeProducts.tsx).

- [x] **06.031** — Uit eigen keuken
- [x] **06.032** — Deze producten slaan we over. Voeg toe als je ze nodig hebt.

### Selectie bewaren

Bron: [src/components/RecipeProducts.tsx](/Users/stef/Code/picnic/src/components/RecipeProducts.tsx).

- [x] **06.033** — Herinner recept voor een andere keer
- [x] **06.034** — Bewaar selectie
- [x] **06.035** — Maak voor ieder ingrediënt een keuze of sla het over om te bewaren.
- [x] **06.036** — Recept bewaard.

### Totaal en toevoegen

Bron: [src/components/RecipeProducts.tsx](/Users/stef/Code/picnic/src/components/RecipeProducts.tsx).

- [x] **06.037** — {totaalprijs in euro}
- [x] **06.038** — {aantal} verpakkingen · {aantal} product
- [x] **06.039** — {aantal} verpakkingen · {aantal} producten
- [x] **06.040** — Nog {aantal} keuze nodig
- [x] **06.041** — Nog {aantal} keuzes nodig
- [x] **06.042** — Geen aantal gekozen: {ingrediëntnamen gescheiden door komma}. Vul een geldig aantal in.
- [x] **06.043** — Toevoegen…
- [x] **06.044** — Zet in Picnic-mandje
- [x] **06.045** — Toevoegen aan je bestaande mandje. Bestellen en betalen doe je in Picnic.
- [x] **06.046** — Producten en prijzen vernieuwen

### Toevoeging hervatten

Bron: [src/components/RecipeProducts.tsx](/Users/stef/Code/picnic/src/components/RecipeProducts.tsx).

- [x] **06.047** — Je selectie wordt gecontroleerd en toegevoegd…
- [x] **06.048** — Je bevestiging is bewaard. Hervat dezelfde toevoeging om veilig verder te gaan.
- [x] **06.049** — Bezig…
- [x] **06.050** — Hervat dezelfde toevoeging
- [x] **06.051** — Niet verstuurd; beschikbaarheid kon niet worden bevestigd: {productnamen gescheiden door komma}.

### Toegankelijkheidslabels

Bron: [src/components/RecipeProducts.tsx](/Users/stef/Code/picnic/src/components/RecipeProducts.tsx).

- [x] **06.052** — Boodschappenfilter
- [x] **06.053** — Product kiezen voor {ingrediëntnaam}
- [x] **06.054** — Heb ik al: {ingrediëntnaam}
- [x] **06.055** — Toch nodig: {ingrediëntnaam}
- [x] **06.056** — Ingrediënt aanpassen: {ingrediëntnaam}
- [x] **06.057** — Geselecteerde boodschappen

### Foutmeldingen

Bron: [src/components/RecipeProducts.tsx](/Users/stef/Code/picnic/src/components/RecipeProducts.tsx), [src/lib/shopping-choice.ts](/Users/stef/Code/picnic/src/lib/shopping-choice.ts).

- [x] **06.058** — De vorige toevoeging kon niet worden gecontroleerd. Probeer dezelfde toevoeging opnieuw om de status op te halen.
- [x] **06.059** — Deze bewaarde selectie hoort bij een oudere receptversie. Controleer de actuele keuzes en bewaar ze opnieuw.
- [x] **06.060** — Boodschappen zoeken is niet gelukt.
- [x] **06.061** — Maak eerst voor ieder ingrediënt een geldige keuze of sla het over.
- [x] **06.062** — Het recept is gewijzigd. Haal de boodschappen opnieuw op en bewaar de selectie daarna weer.
- [x] **06.063** — Je receptkeuzes zijn niet bewaard.
- [x] **06.064** — Bewaren is niet gelukt.
- [x] **06.065** — Het recept is gewijzigd. Er is niets toegevoegd. Haal de boodschappen opnieuw op en bewaar de selectie daarna weer.
- [x] **06.066** — Er is niets toegevoegd omdat je receptkeuzes niet bewaard konden worden. {foutmelding}
- [x] **06.067** — Deze bevestiging is verlopen of gewijzigd. Er is niets verstuurd; controleer de actuele selectie.
- [x] **06.068** — De vorige toevoeging kon niet worden gecontroleerd. Hervat dezelfde toevoeging.
- [x] **06.069** — {foutmelding} Hervat dezelfde toevoeging; die wordt niet dubbel verstuurd.
- [x] **06.070** — Uitkomst onbekend. Hervat dezelfde toevoeging.
- [x] **06.071** — Je gekozen product is niet meer beschikbaar of passend. Kies een alternatief.

### Boodschappen zoeken of voorbereiden mislukt

Bron: [worker/routes/shopping.ts](/Users/stef/Code/picnic/worker/routes/shopping.ts).

- [x] **06.072** — Verstuur een geldige verwerkingstermijn.
- [x] **06.073** — Het volledige boodschappenvoorstel lukte niet binnen 30 seconden. Probeer opnieuw.
- [x] **06.074** — Kies een geldig aantal personen.
- [x] **06.075** — Recept niet gevonden.
- [x] **06.076** — Voor hoeveel personen is het oorspronkelijke recept?
- [x] **06.077** — Dit recept bevat te veel ingrediënten.
- [x] **06.078** — Koppel je Picnic-account via Picnic in het menu. Je recept is bewaard.
- [x] **06.079** — PicnicResponseTooLargeError
- [x] **06.080** — Picnic gaf een te groot zoekantwoord.
- [x] **06.081** — PicnicTimeoutError
- [x] **06.082** — Picnic antwoordde niet op tijd.
- [x] **06.083** — Zoeken bij Picnic is niet gelukt.
- [x] **06.084** — De Picnic-koppeling of sessie is gewijzigd.
- [x] **06.085** — Controleer je selectie en verpakkingsaantallen.
- [x] **06.086** — Deze bevestiging hoort bij een andere selectie.
- [x] **06.087** — Het recept is gewijzigd. Haal de boodschappen opnieuw op.
- [x] **06.088** — Een ingrediënt hoort niet bij dit recept.
- [x] **06.089** — Koppel eerst je Picnic-account.
- [x] **06.090** — Actuele productgegevens ontbreken.
- [x] **06.091** — De actuele selectie kon niet worden gecontroleerd. Er is nog niets verstuurd.
- [x] **06.092** — De productinhoud is gewijzigd. Ververs de boodschappen en controleer je keuze.
- [x] **06.093** — Dit product is ongeschikt of onvoldoende bevestigd. Kies een passend product.
- [x] **06.094** — Het gekozen aantal is bij Picnic niet beschikbaar. Pas het aantal aan.
- [x] **06.095** — Kies een vervanging eerst expliciet.
- [x] **06.096** — Een prijs is gewijzigd of onzeker. Ververs de boodschappen en bevestig de actuele prijs.
- [x] **06.097** — De verpakking is niet bekend. Kies een ander product.
- [x] **06.098** — Alleen een passende keuze kan worden onthouden.
- [x] **06.099** — De actuele producten konden niet worden bevestigd. Er is niets verstuurd.
- [x] **06.100** — Geen geselecteerd product is nog beschikbaar. Er is niets verstuurd.
- [x] **06.101** — Deze selectie is te groot.
- [x] **06.102** — Recept, koppeling of sessie is gewijzigd. Haal de boodschappen opnieuw op.

### Selectie bewaren mislukt

Bron: [worker/routes/recipes.ts](/Users/stef/Code/picnic/worker/routes/recipes.ts).

- [x] **06.103** — Controleer je productkeuzes en overgeslagen ingrediënten.
- [x] **06.104** — Niet gevonden.
- [x] **06.105** — Het recept is gewijzigd. Controleer je boodschappen opnieuw.
- [x] **06.106** — Voor hoeveel personen is het oorspronkelijke recept?
- [x] **06.107** — Kies of sla over elk ingrediënt.
- [x] **06.108** — Koppel eerst je Picnic-account.
- [x] **06.109** — Een gekozen product is niet meer bekend bij Picnic. Haal de boodschappen opnieuw op.
- [x] **06.110** — Een gekozen product is niet passend bevestigd.
- [x] **06.111** — Bevestig een vervanging voordat je die bewaart.
- [x] **06.112** — De selectie kon niet worden bewaard.


## 07 Ander Picnic-product kiezen

Venster binnen Boodschappen controleren.

### Kop en bron

Bron: [src/components/RecipeProducts.tsx](/Users/stef/Code/picnic/src/components/RecipeProducts.tsx).

- [x] **07.001** — {ingrediëntnaam}
- [x] **07.002** — {oorspronkelijke ingrediëntregels gescheiden door +}

### Zoekresultaten

Bron: [src/components/RecipeProducts.tsx](/Users/stef/Code/picnic/src/components/RecipeProducts.tsx).

- [x] **07.003** — Er is geen product gevonden. Sluit dit venster en geef aan of je dit ingrediënt al hebt.
- [x] **07.004** — Een deel van de zoekresultaten is bekeken; dit is geen volledig assortiment.
- [x] **07.005** — Passende alternatieven
- [x] **07.006** — Mogelijke vervangingen · zelf beoordelen
- [x] **07.007** — Nog onvoldoende informatie
- [x] **07.008** — Geen resultaten gevonden.
- [x] **07.009** — {aantal} verpakkingen · {totaalprijs in euro} totaal
- [x] **07.010** — Kies het aantal na selectie
- [x] **07.011** — Kies deze vervanging
- [x] **07.012** — Kies dit product
- [x] **07.013** — {reden waarom dit product wel of niet past}

### Toegankelijkheidslabels

Bron: [src/components/RecipeProducts.tsx](/Users/stef/Code/picnic/src/components/RecipeProducts.tsx), [src/components/ui/dialog.tsx](/Users/stef/Code/picnic/src/components/ui/dialog.tsx).

- [x] **07.014** — Producten voor {ingrediëntnaam}: passend
- [x] **07.015** — Producten voor {ingrediëntnaam}: vervangingen
- [x] **07.016** — Producten voor {ingrediëntnaam}: onbeoordeeld
- [x] **07.017** — Sluiten


## 08 Ingrediënt aanpassen

Venster binnen Boodschappen controleren.

### Velden en keuzes

Bron: [src/components/ShoppingIngredientEditor.tsx](/Users/stef/Code/picnic/src/components/ShoppingIngredientEditor.tsx).

- [x] **08.001** — Ingrediënt aanpassen
- [x] **08.002** — De boodschappen worden daarna opnieuw berekend.
- [x] **08.003** — {oorspronkelijke ingrediëntregel}
- [x] **08.004** — Ingrediënt
- [x] **08.005** — {ingrediëntnaam}
- [x] **08.006** — Uit de bron
- [x] **08.007** — Hoeveelheid
- [x] **08.008** — Exacte hoeveelheid
- [x] **08.009** — Vanaf / tot
- [x] **08.010** — Naar smaak
- [x] **08.011** — Bronmaat gebruiken
- [x] **08.012** — {bronhoeveelheid}. Lepels en handjes blijven als bronmaat behouden.
- [x] **08.013** — Vanaf
- [x] **08.014** — Aantal
- [x] **08.015** — Tot
- [x] **08.016** — Eenheid
- [x] **08.017** — g
- [x] **08.018** — kg
- [x] **08.019** — ml
- [x] **08.020** — l
- [x] **08.021** — stuks
- [x] **08.022** — Pas boodschappen aan
- [x] **08.023** — Aanpassen…
- [x] **08.024** — Sluiten

### Foutmeldingen

Bron: [src/components/ShoppingIngredientEditor.tsx](/Users/stef/Code/picnic/src/components/ShoppingIngredientEditor.tsx).

- [x] **08.025** — Vul een ingrediënt en een geldige hoeveelheid in, bijvoorbeeld 200 of 1/2.
- [x] **08.026** — Aanpassen is niet gelukt. Je wijzigingen staan nog hier.
- [x] **08.027** — Vanaf
- [x] **08.028** — Aantal
- [x] **08.029** — Aanpassen…
- [x] **08.030** — Pas boodschappen aan

### Wijziging opslaan mislukt

Bron: [worker/routes/recipes.ts](/Users/stef/Code/picnic/worker/routes/recipes.ts).

- [x] **08.031** — De bron van een recept kan niet worden gewijzigd.
- [x] **08.032** — Controleer de receptgegevens.
- [x] **08.033** — Niet gevonden.
- [x] **08.034** — Het recept is gewijzigd. Laad het opnieuw.
- [x] **08.035** — Een bronafbeelding is niet beschikbaar.


## 09 Toevoegstatus in Picnic

Verschijnt na toevoegen, ook wanneer je vanuit Recepten opnieuw toevoegt.

### Kop en status

Bron: [src/components/AdditionStatus.tsx](/Users/stef/Code/picnic/src/components/AdditionStatus.tsx).

- [x] **09.001** — Naar je Picnic-mand
- [x] **09.002** — Status ophalen…
- [x] **09.003** — De producten zijn toegevoegd aan je Picnic-mand.
- [x] **09.004** — Je boodschappen worden verwerkt.
- [x] **09.005** — Controleer hieronder welke producten zijn toegevoegd.
- [x] **09.006** — {aantal} × {productnaam}
- [x] **09.007** — Nog niet verstuurd
- [x] **09.008** — Wordt toegevoegd
- [x] **09.009** — Toegevoegd
- [x] **09.010** — Niet toegevoegd
- [x] **09.011** — Uitkomst onbekend
- [x] **09.012** — Niet verstuurd

### Onbekende uitkomst controleren

Bron: [src/components/AdditionStatus.tsx](/Users/stef/Code/picnic/src/components/AdditionStatus.tsx).

- [x] **09.013** — Controleer dit product in de Picnic-app. We versturen het niet opnieuw. Bevestig daarna wat je hebt vastgesteld:
- [x] **09.014** — Ik heb gecontroleerd: toegevoegd
- [x] **09.015** — Ik heb gecontroleerd: niet toegevoegd

### Afronden en volgende keer

Bron: [src/components/AdditionStatus.tsx](/Users/stef/Code/picnic/src/components/AdditionStatus.tsx).

- [x] **09.016** — Er is niets besteld of afgerekend. Je rondt een bestelling zelf af in Picnic.
- [x] **09.017** — Boodschappen voor de volgende keer
- [x] **09.018** — Status vernieuwen

### Foutmeldingen

Bron: [src/components/AdditionStatus.tsx](/Users/stef/Code/picnic/src/components/AdditionStatus.tsx).

- [x] **09.019** — Nog niet verstuurd
- [x] **09.020** — Wordt toegevoegd
- [x] **09.021** — Toegevoegd
- [x] **09.022** — Niet toegevoegd
- [x] **09.023** — Uitkomst onbekend
- [x] **09.024** — Niet verstuurd
- [x] **09.025** — De status kon niet worden opgehaald. Verstuur de boodschappen niet opnieuw; controleer eerst de status.
- [x] **09.026** — Bevestigen is niet gelukt.

### Toevoegen of bevestigen mislukt

Bron: [worker/routes/actions.ts](/Users/stef/Code/picnic/worker/routes/actions.ts).

- [x] **09.027** — De actie kan tijdelijk niet worden geladen.
- [x] **09.028** — Voorstel heeft nog geen actie.
- [x] **09.029** — Ververs het voorstel en probeer opnieuw.
- [x] **09.030** — Voorstel niet gevonden.
- [x] **09.031** — Dit voorstel is gewijzigd of verlopen. Maak een nieuw voorstel.
- [x] **09.032** — Het recept of de Picnic-koppeling is gewijzigd. Maak een nieuw voorstel.
- [x] **09.033** — Toevoegen aan Picnic staat tijdelijk uit.
- [x] **09.034** — Het voorstel is niet compleet. Maak het voorstel opnieuw.
- [x] **09.035** — Een productregel in het voorstel kan niet worden gecontroleerd.
- [x] **09.036** — De totaalprijs kan niet veilig worden berekend.
- [x] **09.037** — Het voorstel kan niet meer worden goedgekeurd. Ververs het en probeer opnieuw.
- [x] **09.038** — De actie is aangemaakt maar kan tijdelijk niet worden geladen.
- [x] **09.039** — Controleer de mand en kies een geldige uitkomst.
- [x] **09.040** — Actie niet gevonden.
- [x] **09.041** — Deze regel heeft geen onzekere uitkomst om op te lossen.
- [x] **09.042** — Deze actie heeft geen onzekere uitkomst om op te lossen.
- [x] **09.043** — Dit verzoek is niet toegestaan.
- [x] **09.044** — Verstuur geldige JSON.
- [x] **09.045** — Log opnieuw in.
- [x] **09.046** — Deze handeling is niet beschikbaar.


## 10 Recepten met bewaarde productkeuzes

Route: /recepten. Na direct toevoegen verschijnen de teksten van Toevoegstatus in Picnic.

### Lijst en lege toestand

Bron: [src/components/SavedRecipesPanel.tsx](/Users/stef/Code/picnic/src/components/SavedRecipesPanel.tsx).

- [x] **10.001** — Recepten
- [x] **10.002** — Je bewaarde productkeuzes staan klaar om opnieuw toe te voegen.
- [x] **10.003** — Je recepten laden…
- [x] **10.004** — {recepttitel}
- [x] **10.005** — {aantal} producten · {aantal} personen
- [x] **10.006** — {aantal} producten · {aantal} personen · {aantal} overgeslagen
- [x] **10.007** — Toevoegen
- [x] **10.008** — Bezig…
- [x] **10.009** — Je hebt nog geen receptkeuzes bewaard. Bewaar een selectie bij je boodschappen.
- [x] **10.010** — Meer recepten

### Keuzes controleren

Bron: [src/components/SavedRecipesPanel.tsx](/Users/stef/Code/picnic/src/components/SavedRecipesPanel.tsx).

- [x] **10.011** — Opnieuw proberen
- [x] **10.012** — Er is niets toegevoegd.
- [x] **10.013** — Controleer deze keuzes en probeer het daarna opnieuw:
- [x] **10.014** — {productnaam} · opnieuw controleren
- [x] **10.015** — {productnaam} · niet beschikbaar
- [x] **10.016** — Keuzes aanpassen
- [x] **10.017** — Keuzes opnieuw bekijken

### Toegankelijkheidslabels

Bron: [src/components/SavedRecipesPanel.tsx](/Users/stef/Code/picnic/src/components/SavedRecipesPanel.tsx).

- [x] **10.018** — Voeg {recepttitel} met de bewaarde productkeuzes opnieuw toe
- [x] **10.019** — Bezig met toevoegen {recepttitel} met de bewaarde productkeuzes opnieuw toe
- [x] **10.020** — Pas {recepttitel} aan

### Foutmeldingen

Bron: [src/components/SavedRecipesPanel.tsx](/Users/stef/Code/picnic/src/components/SavedRecipesPanel.tsx).

- [x] **10.021** — Je herinnerde recepten zijn niet geladen.
- [x] **10.022** — Voor dit recept zijn geen producten geselecteerd.
- [x] **10.023** — Er is niets toegevoegd. Controleer de actuele keuzes en probeer opnieuw.
- [x] **10.024** — De toevoeging wordt niet opnieuw verstuurd. Controleer de status of hervat dezelfde toevoeging.
- [x] **10.025** — Dit recept is gewijzigd. Kies de boodschappen opnieuw en bewaar de selectie daarna weer.
- [x] **10.026** — Een bewaard product moet opnieuw worden gecontroleerd. Pas de keuzes aan en probeer het daarna opnieuw.
- [x] **10.027** — Het recept is niet toegevoegd.

### Herhalen mislukt

Bron: [worker/routes/shopping.ts](/Users/stef/Code/picnic/worker/routes/shopping.ts).

- [x] **10.028** — Verstuur geldige JSON.
- [x] **10.029** — Ongeldige herhaalverzoek.
- [x] **10.030** — Niet gevonden.
- [x] **10.031** — Er is geen boodschappenkeuze voor dit recept bewaard.
- [x] **10.032** — De bewaarde boodschappenkeuze kan niet worden gelezen.
- [x] **10.033** — Deze herhaling hoort bij een andere bewaarde selectie.
- [x] **10.034** — Het recept is gewijzigd. Bewaar je productkeuzes opnieuw.
- [x] **10.035** — De bewaarde porties passen niet meer bij dit recept.
- [x] **10.036** — De bewaarde keuzes passen niet meer bij dit recept. Bewaar ze opnieuw.
- [x] **10.037** — Koppel eerst je Picnic-account.
- [x] **10.038** — Een bewaard product moet opnieuw worden gecontroleerd voordat het kan worden toegevoegd.

### Recepten ophalen mislukt

Bron: [worker/routes/recipes.ts](/Users/stef/Code/picnic/worker/routes/recipes.ts).

- [x] **10.039** — Ongeldige paginering.
- [x] **10.040** — Log opnieuw in.
- [x] **10.041** — Gebruik GET.
- [x] **10.042** — Gebruik POST.
- [x] **10.043** — Ongeldige receptverwijzing.
- [x] **10.044** — Deze handeling is niet beschikbaar.
- [x] **10.045** — Niet gevonden.


## 11 Picnic en het huidige mandje

Route: /picnic.

### Kop en koppeling

Bron: [src/pages/ShoppingPreview.tsx](/Users/stef/Code/picnic/src/pages/ShoppingPreview.tsx), [src/components/PicnicPanel.tsx](/Users/stef/Code/picnic/src/components/PicnicPanel.tsx).

- [x] **11.001** — Jouw Picnic
- [x] **11.002** — Je koppeling en je huidige mandje.
- [x] **11.003** — Picnic-koppeling
- [x] **11.004** — Verbonden
- [x] **11.005** — Sms-code nodig
- [x] **11.006** — Opnieuw koppelen nodig
- [x] **11.007** — Niet verbonden
- [x] **11.008** — Koppeling vervangen
- [x] **11.009** — Picnic koppelen
- [x] **11.010** — Picnic ontkoppelen

### Sms hervatten

Bron: [src/components/PicnicPanel.tsx](/Users/stef/Code/picnic/src/components/PicnicPanel.tsx).

- [x] **11.011** — Voor de lopende vervanging is nog een Picnic-sms-code nodig. Je bestaande koppeling blijft actief. De sms kan al zijn verstuurd; er wordt geen nieuwe aangevraagd.
- [x] **11.012** — Er staat een Picnic-sms-verificatie klaar om te hervatten. De sms kan al zijn verstuurd; er wordt geen nieuwe aangevraagd.
- [x] **11.013** — Verder met sms-code

### Mandje

Bron: [src/components/PicnicPanel.tsx](/Users/stef/Code/picnic/src/components/PicnicPanel.tsx).

- [x] **11.014** — Picnic-mandje
- [x] **11.015** — Je huidige boodschappen in Picnic.
- [x] **11.016** — Verversen
- [x] **11.017** — Verversen…
- [x] **11.018** — Mandje laden…
- [x] **11.019** — {productnaam}
- [x] **11.020** — Aantal onbekend
- [x] **11.021** — Aantal: {aantal}
- [x] **11.022** — Aantal: {aantal} · Picnic-verpakking: {verpakkingsomschrijving}
- [x] **11.023** — Aantal onbekend · Picnic-verpakking: {verpakkingsomschrijving}
- [x] **11.024** — Prijs per verpakking onbekend
- [x] **11.025** — Prijs per verpakking: {prijs in euro}
- [x] **11.026** — Prijs per verpakking: {prijs in euro} · niet beschikbaar
- [x] **11.027** — Prijs per verpakking: {prijs in euro} · beschikbaarheid onbekend
- [x] **11.028** — Prijs per verpakking onbekend · niet beschikbaar
- [x] **11.029** — Prijs per verpakking onbekend · beschikbaarheid onbekend
- [x] **11.030** — Er zijn geen mandjeregels gevonden.
- [x] **11.031** — {aantal} product in je mandje. Bekijk het volledige totaal in Picnic.
- [x] **11.032** — {aantal} producten in je mandje. Bekijk het volledige totaal in Picnic.

### Producten zoeken

Bron: [src/components/PicnicPanel.tsx](/Users/stef/Code/picnic/src/components/PicnicPanel.tsx).

- [x] **11.033** — Producten zoeken
- [x] **11.034** — Zoek in het assortiment van je Picnic-account.
- [x] **11.035** — Productnaam
- [x] **11.036** — Zoeken
- [x] **11.037** — Zoeken…
- [x] **11.038** — {productnaam}
- [x] **11.039** — {verpakkingsomschrijving}
- [x] **11.040** — Hoeveelheid onbekend
- [x] **11.041** — Hoeveelheid niet gespecificeerd
- [x] **11.042** — {hoeveelheid} {eenheid}
- [x] **11.043** — {hoeveelheid} {eenheid} uitgelekt
- [x] **11.044** — {hoeveelheid} {eenheid} netto
- [x] **11.045** — {minimum}–{maximum} {eenheid}
- [x] **11.046** — piece
- [x] **11.047** — Geen producten gevonden.

### Meldingen

Bron: [src/components/PicnicPanel.tsx](/Users/stef/Code/picnic/src/components/PicnicPanel.tsx).

- [x] **11.048** — De Picnic-koppeling is gewijzigd. Ververs het mandje.
- [x] **11.049** — Het mandje kon niet worden geladen.
- [x] **11.050** — De Picnic-koppeling is gewijzigd. Zoek opnieuw.
- [x] **11.051** — Zoeken is mislukt.
- [x] **11.052** — Je Picnic-account is gekoppeld.
- [x] **11.053** — De Picnic-verificatie is gelukt.
- [x] **11.054** — De Picnic-koppeling is verwijderd.

### Mandje of zoeken mislukt

Bron: [worker/routes/picnic.ts](/Users/stef/Code/picnic/worker/routes/picnic.ts).

- [x] **11.055** — Koppel eerst je Picnic-account.
- [x] **11.056** — De Picnic-koppeling kan tijdelijk niet worden gebruikt.
- [x] **11.057** — Vul een zoekterm van maximaal 100 tekens in.
- [x] **11.058** — De Picnic-koppeling is gewijzigd.
- [x] **11.059** — Picnic is tijdelijk niet bereikbaar.
- [x] **11.060** — Deze handeling is niet beschikbaar.


## 12 Picnic koppelen of de koppeling vervangen

Venster vanuit Picnic. De e-mailbevestiging gebruikt de teksten van E-mailadres opnieuw bevestigen.

### Inloggegevens

Bron: [src/components/PicnicPanel.tsx](/Users/stef/Code/picnic/src/components/PicnicPanel.tsx).

- [x] **12.001** — Koppel je Picnic-account
- [x] **12.002** — Je Picnic-inloggegevens worden alleen gebruikt om de koppeling te maken.
- [x] **12.003** — E-mailadres of telefoonnummer van Picnic
- [x] **12.004** — Picnic-wachtwoord
- [x] **12.005** — Picnic koppelen
- [x] **12.006** — Koppelen…
- [x] **12.007** — Sluiten

### Bestaande koppeling vervangen

Bron: [src/components/PicnicPanel.tsx](/Users/stef/Code/picnic/src/components/PicnicPanel.tsx).

- [x] **12.008** — Bevestig je e-mailadres
- [x] **12.009** — Voor het vervangen van een bestaande koppeling moet je je e-mailadres opnieuw bevestigen.
- [x] **12.010** — E-mailadres bevestigd. Vul de eerder aangevraagde Picnic-sms-code in.
- [x] **12.011** — E-mailadres bevestigd. Vul je Picnic-inloggegevens opnieuw in om de koppeling te vervangen.

### Sms controleren

Bron: [src/components/PicnicPanel.tsx](/Users/stef/Code/picnic/src/components/PicnicPanel.tsx).

- [x] **12.012** — Bevestig je Picnic-account
- [x] **12.013** — Vul de code in die Picnic per sms heeft gestuurd. De code is 4 tot 8 cijfers. Er wordt geen nieuwe sms aangevraagd.
- [x] **12.014** — De sms-aanvraag is niet bevestigd. De sms kan al zijn aangekomen; controleer je berichten. Er wordt niet automatisch een nieuwe sms aangevraagd.
- [x] **12.015** — Sms-code
- [x] **12.016** — Code controleren
- [x] **12.017** — Controleren…
- [x] **12.018** — Sluiten

### Foutmeldingen

Bron: [src/components/PicnicPanel.tsx](/Users/stef/Code/picnic/src/components/PicnicPanel.tsx).

- [x] **12.019** — Picnic koppelen is mislukt.
- [x] **12.020** — De code kon niet worden gecontroleerd.

### Koppeling of verificatie mislukt

Bron: [worker/routes/picnic.ts](/Users/stef/Code/picnic/worker/routes/picnic.ts).

- [x] **12.021** — Log opnieuw in.
- [x] **12.022** — Te veel koppelverzoeken. Probeer het later opnieuw.
- [x] **12.023** — Er loopt al een koppelverzoek.
- [x] **12.024** — Bevestig je e-mailadres opnieuw voordat je een koppeling vervangt.
- [x] **12.025** — De koppeling is verlopen. Probeer opnieuw.
- [x] **12.026** — Controleer je Picnic-inloggegevens.
- [x] **12.027** — Picnic is tijdelijk niet bereikbaar. Probeer het later opnieuw.
- [x] **12.028** — Vul de verificatiecode in.
- [x] **12.029** — Er staat geen geldige Picnic-verificatie open.
- [x] **12.030** — De Picnic-verificatie kan tijdelijk niet worden gebruikt.
- [x] **12.031** — De uitkomst van de Picnic-verificatie is onbekend. Begin de koppeling opnieuw.
- [x] **12.032** — De code is ongeldig of verlopen.
- [x] **12.033** — De Picnic-koppeling kon niet worden opgeslagen. Probeer het later opnieuw.


## 13 Picnic ontkoppelen

Bevestigingsvenster vanuit Picnic.

### Bevestiging en resultaat

Bron: [src/components/PicnicPanel.tsx](/Users/stef/Code/picnic/src/components/PicnicPanel.tsx).

- [x] **13.001** — Picnic ontkoppelen?
- [x] **13.002** — De app verwijdert de opgeslagen Picnic-koppelsleutel. Je externe Picnic-account en de inhoud van je Picnic-mandje blijven onaangetast.
- [x] **13.003** — Annuleren
- [x] **13.004** — Koppeling verwijderen
- [x] **13.005** — Ontkoppelen…
- [x] **13.006** — De Picnic-koppeling is verwijderd.
- [x] **13.007** — Ontkoppelen is mislukt.


## 14 Account

Route: /account. Beheer en Openen verschijnen alleen voor een beheerder.

### Gegevens en acties

Bron: [src/pages/ShoppingPreview.tsx](/Users/stef/Code/picnic/src/pages/ShoppingPreview.tsx), [src/components/AccountPanel.tsx](/Users/stef/Code/picnic/src/components/AccountPanel.tsx).

- [x] **14.001** — Account
- [x] **14.002** — E-mailadres
- [x] **14.003** — {e-mailadres}
- [x] **14.004** — Sessie
- [x] **14.005** — Uitloggen
- [x] **14.006** — Alle apparaten
- [x] **14.007** — Overal uitloggen
- [x] **14.008** — Beheer
- [x] **14.009** — Openen
- [x] **14.010** — Account verwijderen
- [x] **14.011** — Verwijderen

### Toegankelijkheidslabels

Bron: [src/components/AccountPanel.tsx](/Users/stef/Code/picnic/src/components/AccountPanel.tsx).

- [x] **14.012** — Accountgegevens
- [x] **14.013** — Account verwijderen

### Meldingen

Bron: [src/components/AccountPanel.tsx](/Users/stef/Code/picnic/src/components/AccountPanel.tsx).

- [x] **14.014** — E-mailadres bevestigd. Kies de handeling opnieuw.
- [x] **14.015** — De handeling is mislukt.

### Sessies of accountactie mislukt

Bron: [worker/routes/accounts.ts](/Users/stef/Code/picnic/worker/routes/accounts.ts).

- [x] **14.016** — Dit verzoek is niet toegestaan.
- [x] **14.017** — Verstuur geldige JSON.
- [x] **14.018** — Log opnieuw in.
- [x] **14.019** — Geen toegang.
- [x] **14.020** — Bevestig je e-mailadres opnieuw.


## 15 Account verwijderen

Bevestigingsvenster vanuit Account.

### Bevestiging

Bron: [src/components/AccountPanel.tsx](/Users/stef/Code/picnic/src/components/AccountPanel.tsx).

- [x] **15.001** — Account en recepten verwijderen?
- [x] **15.002** — Je toegang stopt direct. De app start daarna het verwijderen van je recepten en persoonlijke gegevens. Je Picnic-account en boodschappen blijven bestaan.
- [x] **15.003** — Typ VERWIJDER ACCOUNT om te bevestigen
- [x] **15.004** — VERWIJDER ACCOUNT
- [x] **15.005** — Annuleren
- [x] **15.006** — Verwijderen starten
- [x] **15.007** — Verwijderen…

### Verwijderen mislukt

Bron: [worker/routes/accounts.ts](/Users/stef/Code/picnic/worker/routes/accounts.ts).

- [x] **15.008** — Bevestig de verwijdering.


## 16 Beheer

Route: /beheer. Alleen toegankelijk voor beheerders. Hier verschijnt de oudere appheader.

### Header en toegang

Bron: [src/pages/Index.tsx](/Users/stef/Code/picnic/src/pages/Index.tsx).

- [x] **16.001** — Mijn recepten
- [x] **16.002** — Recepten
- [x] **16.003** — Picnic
- [x] **16.004** — Account
- [x] **16.005** — Picnic verbonden
- [x] **16.006** — Koppel Picnic
- [x] **16.007** — Ga naar inhoud
- [x] **16.008** — Je hebt geen toegang tot beheer.
- [x] **16.009** — Je recepten laden…
- [x] **16.010** — Verbinding mislukt
- [x] **16.011** — Opnieuw proberen
- [x] **16.012** — De app kon niet worden geladen.
- [x] **16.013** — Je sessie is verlopen. Log opnieuw in om verder te gaan. Je concept blijft op dit apparaat bewaard.

### Toegankelijkheidslabels

Bron: [src/pages/Index.tsx](/Users/stef/Code/picnic/src/pages/Index.tsx).

- [x] **16.014** — Naar mijn recepten
- [x] **16.015** — Hoofdnavigatie

### Kop en laden

Bron: [src/components/AdminPanel.tsx](/Users/stef/Code/picnic/src/components/AdminPanel.tsx).

- [x] **16.016** — Besloten pilot
- [x] **16.017** — Beheer
- [x] **16.018** — Nodig mensen uit en beheer toegang en stopinstellingen. Recepten van anderen zijn hier niet zichtbaar.
- [x] **16.019** — Beheer laden…
- [x] **16.020** — Opnieuw laden

### Uitnodigingen

Bron: [src/components/AdminPanel.tsx](/Users/stef/Code/picnic/src/components/AdminPanel.tsx).

- [x] **16.021** — Uitnodigingen
- [x] **16.022** — {aantal} van 10 plekken vrij. Een open uitnodiging houdt een plek vrij.
- [x] **16.023** — E-mailadres
- [x] **16.024** — {e-mailadres}
- [x] **16.025** — Uitnodigen
- [x] **16.026** — Verzenden…
- [x] **16.027** — Nog geen uitnodigingen.
- [x] **16.028** — Open tot {datum in Nederlandse notatie}
- [x] **16.029** — consumed
- [x] **16.030** — revoked
- [x] **16.031** — expired
- [x] **16.032** — Intrekken
- [x] **16.033** — De uitnodiging is aangemaakt en verzonden.
- [x] **16.034** — Uitnodiging ingetrokken.

### Accounts

Bron: [src/components/AdminPanel.tsx](/Users/stef/Code/picnic/src/components/AdminPanel.tsx).

De code vertaalt active naar actief en blocked naar geblokkeerd. De accountstatussen invited en deleting worden onvertaald getoond. Uitnodigingen tonen consumed, revoked of expired onvertaald; pending wordt Open tot met een datum.

- [x] **16.035** — Accounts
- [x] **16.036** — {e-mailadres}
- [x] **16.037** — Beheerder · actief
- [x] **16.038** — Beheerder · geblokkeerd
- [x] **16.039** — Gebruiker · actief
- [x] **16.040** — Gebruiker · geblokkeerd
- [x] **16.041** — {rol} · {accountstatus}
- [x] **16.042** — invited
- [x] **16.043** — deleting
- [x] **16.044** — Blokkeren
- [x] **16.045** — Activeren
- [x] **16.046** — Account geblokkeerd.
- [x] **16.047** — Account opnieuw actief.

### Stopinstellingen

Bron: [src/components/AdminPanel.tsx](/Users/stef/Code/picnic/src/components/AdminPanel.tsx).

- [x] **16.048** — Stopinstellingen
- [x] **16.049** — Zet nieuwe AI-verwerking of nieuwe toevoegacties los van elkaar stil. Bestaande recepten blijven beschikbaar.
- [x] **16.050** — AI-verwerking
- [x] **16.051** — Nieuwe betaalde herkenning toestaan
- [x] **16.052** — Toevoegen aan Picnic
- [x] **16.053** — Nieuwe toevoegacties toestaan
- [x] **16.054** — AI-instelling opgeslagen.
- [x] **16.055** — Toevoeginstelling opgeslagen.

### Verbruik

Bron: [src/components/AdminPanel.tsx](/Users/stef/Code/picnic/src/components/AdminPanel.tsx).

- [x] **16.056** — Verbruik
- [x] **16.057** — AI-budget {maand}: €{bedrag met twee decimalen en komma} gebruikt van €{budget met twee decimalen en komma}.
- [x] **16.058** — E-mails {periode}: {aantal} verzonden, {aantal} gereserveerd van {limiet}.
- [x] **16.059** — Er zijn {aantal} gemelde fouten.

### Meldingen

Bron: [src/components/AdminPanel.tsx](/Users/stef/Code/picnic/src/components/AdminPanel.tsx).

- [x] **16.060** — Beheer kon niet worden geladen.
- [x] **16.061** — De handeling is mislukt.
- [x] **16.062** — E-mailadres bevestigd. Kies de handeling opnieuw.

### Beheeractie mislukt

Bron: [worker/routes/accounts.ts](/Users/stef/Code/picnic/worker/routes/accounts.ts).

- [x] **16.063** — Vul een geldig e-mailadres in.
- [x] **16.064** — De verzendlimiet is bereikt.
- [x] **16.065** — De pilot heeft geen vrije plek.
- [x] **16.066** — Dit adres heeft al toegang of een uitnodiging.
- [x] **16.067** — De uitnodiging is vastgelegd, maar bezorging kon niet worden bevestigd.
- [x] **16.068** — Niet gevonden.
- [x] **16.069** — Deze uitnodiging is niet meer open.
- [x] **16.070** — Ongeldige accountstatus.
- [x] **16.071** — Je kunt je eigen toegang niet blokkeren.
- [x] **16.072** — Dit account kan niet worden gewijzigd.
- [x] **16.073** — Beheerderstoegang kan hier niet worden gewijzigd.
- [x] **16.074** — Ongeldige schakelaar.
- [x] **16.075** — De schakelaars zijn tijdelijk niet beschikbaar.

### Lokale catalogusproef

Bron: [src/components/AdminPanel.tsx](/Users/stef/Code/picnic/src/components/AdminPanel.tsx), [worker/routes/catalog.ts](/Users/stef/Code/picnic/worker/routes/catalog.ts).

Verschijnt alleen in een ontwikkelbuild.

- [x] **16.076** — Lokale catalogusproef
- [x] **16.077** — Lees drie eerder gevonden producten en één bestaande zoekvraag via je eigen Picnic-koppeling, plus de categorieroute: maximaal vijf aanvragen.
- [x] **16.078** — Controleer productdetails
- [x] **16.079** — Productdetails lezen…
- [x] **16.080** — Leesproef voltooid.
- [x] **16.081** — Catalogusproef: {HTTP-status} ({foutcode of onbekend}).
- [x] **16.082** — Catalogusproef niet beschikbaar.
- [x] **16.083** — {catalogusrapport als JSON}


## 17 Pagina niet gevonden

Route: een onbekend pad.

### Teksten

Bron: [src/pages/NotFound.tsx](/Users/stef/Code/picnic/src/pages/NotFound.tsx).

- [x] **17.001** — Pagina niet gevonden
- [x] **17.002** — Deze pagina bestaat niet
- [x] **17.003** — De link is misschien verouderd. Ga terug naar je recepten.
- [x] **17.004** — Naar mijn recepten


## 18 Gedeelde productkaarten en hoeveelheidsknoppen

Deze teksten verschijnen binnen boodschappen, productkeuze, Picnic en de componentbibliotheek.

### Productkaart

Bron: [src/components/picnic/catalog.tsx](/Users/stef/Code/picnic/src/components/picnic/catalog.tsx), [src/lib/picnic-display.ts](/Users/stef/Code/picnic/src/lib/picnic-display.ts).

- [x] **18.001** — {productnaam}
- [x] **18.002** — {verpakkingsomschrijving}
- [x] **18.003** — {verpakkingsomschrijving} · {merk}
- [x] **18.004** — {prijs in euro}
- [x] **18.005** — Prijs onbekend
- [x] **18.006** — Afhankelijk van aantal
- [x] **18.007** — Geen afbeelding
- [x] **18.008** — Gekozen
- [x] **18.009** — Kies dit product
- [x] **18.010** — Niet beschikbaar voor selectie
- [x] **18.011** — Behoud dit product
- [x] **18.012** — {productnaam als alternatieve afbeeldingstekst}

### Hoeveelheidsknoppen

Bron: [src/components/picnic/catalog.tsx](/Users/stef/Code/picnic/src/components/picnic/catalog.tsx).

Onderwerp is de ingrediëntnaam, personen, personen in de bron of voorbeeldproduct.

- [x] **18.013** — Aantal
- [x] **18.014** — Minder {onderwerp}
- [x] **18.015** — Meer {onderwerp}
- [x] **18.016** — Aantal verpakkingen {onderwerp}
- [x] **18.017** — Personen
- [x] **18.018** — Minder personen
- [x] **18.019** — Meer personen
- [x] **18.020** — Personen in de bron
- [x] **18.021** — Minder personen in de bron
- [x] **18.022** — Meer personen in de bron

### Notatie van hoeveelheden

Bron: [src/lib/recipe-presentation.ts](/Users/stef/Code/picnic/src/lib/recipe-presentation.ts).

- [x] **18.023** — Naar smaak
- [x] **18.024** — Handje
- [x] **18.025** — Hoeveelheid controleren
- [x] **18.026** — {hoeveelheid} eetlepel
- [x] **18.027** — {hoeveelheid} eetlepels
- [x] **18.028** — {hoeveelheid} theelepel
- [x] **18.029** — {hoeveelheid} theelepels
- [x] **18.030** — {hoeveelheid} g
- [x] **18.031** — {hoeveelheid} kg
- [x] **18.032** — {hoeveelheid} ml
- [x] **18.033** — {hoeveelheid} l
- [x] **18.034** — {hoeveelheid} stuks
- [x] **18.035** — {minimum}–{maximum} {eenheid}
- [x] **18.036** — ≈ {afgeronde hoeveelheid}
- [x] **18.037** — < 0,01
- [x] **18.038** — ≈ < 0,01

### Berekeningen en schattingen

Bron: [worker/domain/shopping.ts](/Users/stef/Code/picnic/worker/domain/shopping.ts).

- [x] **18.039** — Berekend met de bovengrens van het recept.
- [x] **18.040** — Rekenmaat: eetlepel 15 ml, theelepel 5 ml.
- [x] **18.041** — Geschat: eetlepel {ingrediëntnaam} ≈ {gewicht} g.
- [x] **18.042** — Geschat: een handje ≈ {gewicht} g.
- [x] **18.043** — Hoeveelheid ontbreekt; startschatting {hoeveelheid} g voor het bronrecept. Pas zo nodig aan.
- [x] **18.044** — Hoeveelheid ontbreekt; startschatting {hoeveelheid} ml voor het bronrecept. Pas zo nodig aan.
- [x] **18.045** — Hoeveelheid onbekend. Kies zelf een verpakkingsaantal.
- [x] **18.046** — Geschat stuksgewicht: {gewicht} g.
- [x] **18.047** — Geschat: één teentje ≈ {gewicht} g.
- [x] **18.048** — Geschat: één stuk ≈ {gewicht} g.
- [x] **18.049** — Geschat: 10 teentjes per bol knoflook.
- [x] **18.050** — Geschat eetbaar gewicht bij mogelijke doppen: 50% van de verpakking.
- [x] **18.051** — Geschat uitlekgewicht: 50% van de verpakking.
- [x] **18.052** — Verpakking en recept berekend op nettohoeveelheid.

### Uitleg waarom een product past of niet past

Bron: [worker/domain/shopping.ts](/Users/stef/Code/picnic/worker/domain/shopping.ts).

- [x] **18.053** — Andere productsoort; alleen smaak of onderdeel van het product.
- [x] **18.054** — Niet het expliciet gevraagde merk.
- [x] **18.055** — Het expliciet gevraagde merk is niet bewezen.
- [x] **18.056** — Andere productsoort dan het ingrediënt.
- [x] **18.057** — Inhoud van de bundel is niet bewezen.
- [x] **18.058** — Strijdig met expliciete vegetarische variant.
- [x] **18.059** — Strijdig met expliciete verse of gedroogde vorm.
- [x] **18.060** — Strijdig met expliciete receptvariant.
- [x] **18.061** — Andere productsoort dan knoflook.
- [x] **18.062** — Vegan samenstelling is niet bewezen.
- [x] **18.063** — Andere vorm van het ingrediënt; kies expliciet.
- [x] **18.064** — Productsoort kan niet met de beschikbare regels worden bevestigd.
- [x] **18.065** — Andere vorm of variant; kies expliciet.
- [x] **18.066** — Vorm van de ui is niet bewezen.
- [x] **18.067** — Verse knoflook is niet bewezen.
- [x] **18.068** — Productvorm is niet bewezen.
- [x] **18.069** — Verse of gedroogde vorm ontbreekt.
- [x] **18.070** — Gedroogde vorm ontbreekt.
- [x] **18.071** — Vegetarische samenstelling is niet bewezen.
- [x] **18.072** — Vegetarische vervanging; kies expliciet.
- [x] **18.073** — Expliciete receptvariant is niet bewezen.
- [x] **18.074** — Expliciete vorm of variant is niet bewezen.
- [x] **18.075** — Gekruide variant; kies expliciet.
- [x] **18.076** — Productnaam bevestigt ingrediënt en vereiste variant.

### Aanvullende productbeoordeling

Bron: [worker/matching/knowledge.ts](/Users/stef/Code/picnic/worker/matching/knowledge.ts).

- [x] **18.077** — Tegenstrijdig productbewijs; controle nodig.
- [x] **18.078** — Poedervorm is niet bewezen.
- [x] **18.079** — Productomschrijving bevestigt gefermenteerde kokosyoghurt.
- [x] **18.080** — Productomschrijving bevestigt soort en vereiste vorm.

### Productbeoordeling door het model

Bron: [worker/matching/assessment.ts](/Users/stef/Code/picnic/worker/matching/assessment.ts).

- [x] **18.081** — Inhoudelijk beoordeeld; modelrelatie.

### Vaste ingrediëntnamen voor boodschappen

Bron: [shared/ingredient-knowledge.ts](/Users/stef/Code/picnic/shared/ingredient-knowledge.ts).

- [x] **18.082** — chiazaad
- [x] **18.083** — kefir
- [x] **18.084** — kokosyoghurt
- [x] **18.085** — vanillepasta
- [x] **18.086** — honing
- [x] **18.087** — passievrucht
- [x] **18.088** — mango
- [x] **18.089** — kippendijen
- [x] **18.090** — kipfilet
- [x] **18.091** — uien
- [x] **18.092** — rode uien
- [x] **18.093** — bosui
- [x] **18.094** — knoflook
- [x] **18.095** — sherryazijn
- [x] **18.096** — olijfolie
- [x] **18.097** — bakolie
- [x] **18.098** — groene olijven zonder pit
- [x] **18.099** — kappertjes
- [x] **18.100** — gedroogde abrikozen
- [x] **18.101** — gedroogde pruimen
- [x] **18.102** — kaneelpoeder
- [x] **18.103** — korianderzaad
- [x] **18.104** — granaatappelmelasse
- [x] **18.105** — keukenzout
- [x] **18.106** — zwarte peper
- [x] **18.107** — droge witte wijn
- [x] **18.108** — bruine suiker
- [x] **18.109** — suiker
- [x] **18.110** — verse oregano
- [x] **18.111** — pistachenoten
- [x] **18.112** — rijst
- [x] **18.113** — tarwebloem
- [x] **18.114** — kookroom
- [x] **18.115** — slagroom
- [x] **18.116** — tomatenpuree
- [x] **18.117** — passata
- [x] **18.118** — tomatenblokjes
- [x] **18.119** — tomaten
- [x] **18.120** — citroen
- [x] **18.121** — melk


## 19 Gedeelde netwerk en servermeldingen

De app kan deze teksten op meerdere schermen tonen wanneer een aanvraag mislukt. De foutmeldingen per handeling staan ook bij het betreffende scherm.

### Netwerk en antwoord

Bron: [src/lib/api.ts](/Users/stef/Code/picnic/src/lib/api.ts).

- [x] **19.001** — Dit duurde langer dan 30 seconden. Je resultaat kan al bewaard zijn; controleer het bestaande resultaat.
- [x] **19.002** — Verbinding mislukt. Controleer je internetverbinding en probeer het opnieuw.
- [x] **19.003** — Er ging iets mis. Probeer het opnieuw.
- [x] **19.004** — Het antwoord duurde te lang. Je gegevens blijven bewaard; probeer het opnieuw.
- [x] **19.005** — De server gaf een onleesbaar antwoord. Probeer het opnieuw.

### Algemene servermeldingen

Bron: [worker/index.ts](/Users/stef/Code/picnic/worker/index.ts), [worker/http.ts](/Users/stef/Code/picnic/worker/http.ts), [worker/routes](/Users/stef/Code/picnic/worker/routes), [worker/auth/index.ts](/Users/stef/Code/picnic/worker/auth/index.ts).

- [x] **19.006** — Niet gevonden.
- [x] **19.007** — Dit lukt nu niet. Probeer het later opnieuw.
- [x] **19.008** — Dit verzoek is te groot.
- [x] **19.009** — Dit verzoek is niet toegestaan.
- [x] **19.010** — Verzoek geweigerd.
- [x] **19.011** — Methode niet toegestaan.
- [x] **19.012** — Verstuur geldige JSON.
- [x] **19.013** — Log opnieuw in.
- [x] **19.014** — Geen toegang.
- [x] **19.015** — Bevestig je e-mailadres opnieuw.
- [x] **19.016** — Deze handeling is niet beschikbaar.
- [x] **19.017** — Gebruik GET.
- [x] **19.018** — Gebruik POST.


## 20 E-mails die de gebruiker ontvangt

Dit zijn de app-e-mails, inclusief onderwerp, afzendernaam en inhoud. De e-mailclient voegt eigen bediening en labels toe.

### Afzendernaam

Bron: [worker/auth/index.ts](/Users/stef/Code/picnic/worker/auth/index.ts).

- [x] **20.001** — Mijn recepten

### Uitnodiging

Bron: [worker/auth/index.ts](/Users/stef/Code/picnic/worker/auth/index.ts).

- [x] **20.002** — Je Picnic-uitnodiging
- [x] **20.003** — Je bent uitgenodigd voor Picnic. Open deze link om verder te gaan: {uitnodigingslink}

### Inlogcode

Bron: [worker/auth/index.ts](/Users/stef/Code/picnic/worker/auth/index.ts).

- [x] **20.004** — Je Picnic-inlogcode
- [x] **20.005** — Je inlogcode is {code}. De code verloopt over 10 minuten.


## 21 Variabele inhoud en browserteksten

De regels hierboven leggen de vaste tekst en de tekstsjablonen vast. Goedkeuring daarvan keurt nog niet alle toekomstige gegevens goed.

### Inhoud per werkelijk resultaat beoordelen

Bron: src/components en de aangesloten bronnen.

Deze inhoud kan veranderen per gebruiker, import en Picnic-assortiment. Voor letterlijk elke getoonde letter moet ook het daadwerkelijke resultaat worden gelezen.

- [x] **21.001** — {gevonden of ingevoerde recepttitel}
- [x] **21.002** — {oorspronkelijke ingrediëntregel}
- [x] **21.003** — {herkende of ingevoerde ingrediëntnaam}
- [x] **21.004** — {receptstap}
- [x] **21.005** — {bronlabel}
- [x] **21.006** — {bronlink of brondomein}
- [x] **21.007** — {onzekerheidsmelding uit de import}
- [x] **21.008** — {bewaarde uitleg waarom een product past of niet past}
- [x] **21.009** — {Picnic-productnaam}
- [x] **21.010** — {Picnic-merk}
- [x] **21.011** — {Picnic-verpakkingsomschrijving}
- [x] **21.012** — {tekst op productafbeelding of bronfoto}
- [x] **21.013** — {hoeveelheid en aantal personen}
- [x] **21.014** — {prijs en totaalprijs}
- [x] **21.015** — {e-mailadres}
- [x] **21.016** — {datum en periode}
- [x] **21.017** — {accountstatus of uitnodigingsstatus}
- [x] **21.018** — {catalogusrapport als JSON}

### Tekst die de browser of het apparaat bepaalt

Bron: Browser en besturingssysteem.

De precieze tekst hangt af van browser, apparaat en taal. Deze regels zijn reviewpunten, geen vastgelegde appteksten.

- [x] **21.019** — {knoptekst om bestanden te kiezen}
- [x] **21.020** — {bestandsnaam of melding dat geen bestand is gekozen}
- [x] **21.021** — {validatiemelding bij een verplicht of ongeldig veld}
- [x] **21.022** — {knoppen in de bevestigingsdialoog}
- [x] **21.023** — {bestandskiezer of cameradialoog}


## 22 Oude welkom en receptoverzicht

Bijlage. De code bevat deze oudere weergave in Index en RecipeWorkspace. De huidige routes / en /recepten gebruiken ShoppingPreview; oude receptlinks verwijzen door naar boodschappen. Deze teksten zijn opgenomen voor review bij eventueel hergebruik.

### Oude welkompagina

Bron: [src/pages/Index.tsx](/Users/stef/Code/picnic/src/pages/Index.tsx).

- [x] **22.001** — Mijn recepten
- [x] **22.002** — Van kookidee naar boodschappen
- [x] **22.003** — Wat eten we vandaag?
- [x] **22.004** — Al je favoriete recepten op één plek. Kies je porties, bekijk je boodschappen en zet ze klaar in Picnic.
- [x] **22.005** — Bewaar je favoriete recepten
- [x] **22.006** — Kies wat bij jou past
- [x] **22.007** — Vul je Picnic-mandje
- [x] **22.008** — Jouw receptenapp, gekoppeld aan Picnic.
- [x] **22.009** — Van recept naar mandje
- [x] **22.010** — Jouw Picnic
- [x] **22.011** — Verbind je account, zoek producten en bekijk wat er in je mandje zit.
- [x] **22.012** — Mijn recepten is een onafhankelijke testapp. Bestellen en afrekenen doe je in de Picnic-app.

### Voortgangsstappen

Bron: [src/components/RecipeFlow.tsx](/Users/stef/Code/picnic/src/components/RecipeFlow.tsx).

- [x] **22.013** — Van recept naar Picnic
- [x] **22.014** — 1
- [x] **22.015** — Recept
- [x] **22.016** — 2
- [x] **22.017** — Controleren
- [x] **22.018** — 3
- [x] **22.019** — Boodschappen
- [x] **22.020** — 4
- [x] **22.021** — Picnic

### Kop en hervatten

Bron: [src/components/RecipeWorkspace.tsx](/Users/stef/Code/picnic/src/components/RecipeWorkspace.tsx).

- [x] **22.022** — Mijn recepten
- [x] **22.023** — Wat zet jij vanavond op tafel?
- [x] **22.024** — Recept toevoegen
- [x] **22.025** — Je concept staat nog klaar
- [x] **22.026** — Ga verder waar je gebleven was.
- [x] **22.027** — Verder met concept
- [x] **22.028** — Je recept wordt verwerkt
- [x] **22.029** — Bekijk het resultaat van je vorige import.
- [x] **22.030** — Bekijk import
- [x] **22.031** — Je onafgemaakte concept is teruggezet.
- [x] **22.032** — Het oorspronkelijke recept is nog niet beschikbaar. Je concept blijft bewaard.
- [x] **22.033** — Bewaar concept als nieuw recept

### Zoeken en receptkaarten

Bron: [src/components/RecipeWorkspace.tsx](/Users/stef/Code/picnic/src/components/RecipeWorkspace.tsx).

- [x] **22.034** — Zoek in geladen recepten
- [x] **22.035** — Zoek op recept, ingrediënt of bron
- [x] **22.036** — {aantal} in je kookboek
- [x] **22.037** — Recepten laden…
- [x] **22.038** — Je recepten zijn niet geladen.
- [x] **22.039** — Opnieuw proberen
- [x] **22.040** — Zoeken
- [x] **22.041** — Begin je kookboek
- [x] **22.042** — Geen recepten gevonden
- [x] **22.043** — Er staat nog niets in je kookboek
- [x] **22.044** — Probeer een andere zoekterm of ingrediënt.
- [x] **22.045** — Voeg een recept toe via een link of foto. Wij halen de ingrediënten en stappen eruit.
- [x] **22.046** — Recept toevoegen
- [x] **22.047** — {recepttitel}
- [x] **22.048** — {bronlabel}
- [x] **22.049** — Eigen recept
- [x] **22.050** — {aantal} porties
- [x] **22.051** — Bekijk recept
- [x] **22.052** — Laden…
- [x] **22.053** — Meer recepten laden

### Toegankelijkheidslabels

Bron: [src/components/RecipeWorkspace.tsx](/Users/stef/Code/picnic/src/components/RecipeWorkspace.tsx).

- [x] **22.054** — Recepten
- [x] **22.055** — Open recept: {recepttitel}

### Ander recept openen bevestigen

Bron: [src/components/RecipeWorkspace.tsx](/Users/stef/Code/picnic/src/components/RecipeWorkspace.tsx).

- [x] **22.056** — Je hebt nog een onafgemaakt concept. Als je nu een ander recept opent, wordt dat concept vervangen. Doorgaan?


## 23 Oude receptdetailweergave

Bijlage. Onderdeel van RecipeWorkspace; de huidige oude receptlinks verwijzen door naar Boodschappen.

### Details en acties

Bron: [src/components/RecipeWorkspace.tsx](/Users/stef/Code/picnic/src/components/RecipeWorkspace.tsx).

- [x] **23.001** — Mijn recepten
- [x] **23.002** — Recept laden…
- [x] **23.003** — Opnieuw proberen
- [x] **23.004** — Alle recepten
- [x] **23.005** — Bewerk recept
- [x] **23.006** — Recept verwijderen
- [x] **23.007** — Uit jouw kookboek
- [x] **23.008** — {recepttitel}
- [x] **23.009** — {bronlabel}
- [x] **23.010** — Bekijk de bron ↗
- [x] **23.011** — {aantal} porties
- [x] **23.012** — Porties niet opgegeven
- [x] **23.013** — {aantal} ingrediënten
- [x] **23.014** — {aantal} stappen
- [x] **23.015** — Personen
- [x] **23.016** — Kies boodschappen
- [x] **23.017** — Bronfoto’s
- [x] **23.018** — Ingrediënten
- [x] **23.019** — {oorspronkelijke ingrediëntregel}
- [x] **23.020** — Hoeveelheid: {hoeveelheid}
- [x] **23.021** — Hoeveelheid naar behoefte; controleer bij de boodschappen.
- [x] **23.022** — Nog geen ingrediënten toegevoegd.
- [x] **23.023** — Bereiding
- [x] **23.024** — {volgnummer}
- [x] **23.025** — {bereidingsstap}
- [x] **23.026** — Nog geen bereidingsstappen toegevoegd.
- [x] **23.027** — Oorspronkelijk recept bekijken
- [x] **23.028** — {bronlink} ↗
- [x] **23.029** — Verwijder bewaarde bronkopie
- [x] **23.030** — Koppel je account via Picnic om boodschappen toe te voegen.

### Oorspronkelijk gevonden recept

Bron: [src/components/RecipeWorkspace.tsx](/Users/stef/Code/picnic/src/components/RecipeWorkspace.tsx).

- [x] **23.031** — Oorspronkelijk gevonden recept
- [x] **23.032** — {recepttitel}
- [x] **23.033** — {recepttitel} · {aantal} porties
- [x] **23.034** — Oorspronkelijke ingrediënten
- [x] **23.035** — {oorspronkelijke ingrediëntregel}
- [x] **23.036** — Oorspronkelijke stappen
- [x] **23.037** — {staptekst}
- [x] **23.038** — Naar behoefte
- [x] **23.039** — Hoeveelheid onbekend
- [x] **23.040** — {hoeveelheid} {eenheid}
- [x] **23.041** — {minimum} tot {maximum} {eenheid}

### Toegankelijkheidslabels

Bron: [src/components/RecipeWorkspace.tsx](/Users/stef/Code/picnic/src/components/RecipeWorkspace.tsx).

- [x] **23.042** — Meer receptacties
- [x] **23.043** — Bronfoto van het recept
- [x] **23.044** — Personen

### Recept ophalen mislukt

Bron: [src/components/RecipeWorkspace.tsx](/Users/stef/Code/picnic/src/components/RecipeWorkspace.tsx).

- [x] **23.045** — Recept laden is niet gelukt.
- [x] **23.046** — Recepten laden is niet gelukt.
- [x] **23.047** — De oorspronkelijke bron kon niet worden geladen.


## 24 Oude receptimportweergave

Bijlage. Extra teksten voor ImportPanel zonder shoppingOnly. De gedeelde bronvelden, fotoverwerking en importfouten staan ook bij Mand.

### Begin en invoer

Bron: [src/components/ImportPanel.tsx](/Users/stef/Code/picnic/src/components/ImportPanel.tsx).

- [x] **24.001** — ← Mijn recepten
- [x] **24.002** — Andere bron kiezen
- [x] **24.003** — Recept toevoegen
- [x] **24.004** — Plak een link of kies een foto. Je controleert het recept voordat je boodschappen kiest.
- [x] **24.005** — Kies een bron
- [x] **24.006** — Foto
- [x] **24.007** — Link
- [x] **24.008** — Foto’s van je recept
- [x] **24.009** — Maximaal 3 foto’s, 8 MB en 12 megapixels per foto. JPG, PNG of WebP.
- [x] **24.010** — {aantal} foto geselecteerd
- [x] **24.011** — {aantal} foto’s geselecteerd
- [x] **24.012** — Link naar het recept
- [x] **24.013** — https://voorbeeld.nl/recept
- [x] **24.014** — Plak een link naar een recept. Sommige websites blokkeren automatisch ophalen; dan kun je een foto of screenshot gebruiken.
- [x] **24.015** — Bronnaam toevoegen (optioneel)
- [x] **24.016** — Bronnaam
- [x] **24.017** — Voor hoeveel personen kook je?
- [x] **24.018** — Minder personen
- [x] **24.019** — Meer personen
- [x] **24.020** — Lees het recept
- [x] **24.021** — Recept versturen…

### Voortgang en resultaat

Bron: [src/components/ImportPanel.tsx](/Users/stef/Code/picnic/src/components/ImportPanel.tsx).

- [x] **24.022** — We lezen de ingrediënten en bereidingsstappen van je recept.
- [x] **24.023** — Importconcept laden…
- [x] **24.024** — Opnieuw proberen
- [x] **24.025** — Recept openen…
- [x] **24.026** — Deze import is verlopen.
- [x] **24.027** — Je bron staat in de wachtrij.
- [x] **24.028** — We lezen je recept en de hoeveelheden…
- [x] **24.029** — Het aantal personen ontbreekt in de bron.
- [x] **24.030** — Je recept is herkend.
- [x] **24.031** — Automatische herkenning is nog niet gelukt.
- [x] **24.032** — Status vernieuwen
- [x] **24.033** — Welk recept wil je maken?
- [x] **24.034** — {gevonden recepttitel}
- [x] **24.035** — Recept {volgnummer}
- [x] **24.036** — Voor hoeveel personen is het oorspronkelijke recept “{recepttitel}”?
- [x] **24.037** — Bevestig personen
- [x] **24.038** — Je gevonden recept
- [x] **24.039** — {aantal} ingrediënten · {aantal} stappen
- [x] **24.040** — Controleer de ingrediënten en pas aan wat nodig is.
- [x] **24.041** — Openen…
- [x] **24.042** — Controleer recept
- [x] **24.043** — We zoeken producten en rekenen de verpakkingen voor je uit.
- [x] **24.044** — Controleer boodschappen
- [x] **24.045** — Je recept kon niet worden geopend.

### Aandachtspunten bij de import

Bron: [src/lib/import-draft.ts](/Users/stef/Code/picnic/src/lib/import-draft.ts).

- [x] **24.046** — Automatische herkenning wordt voorbereid.
- [x] **24.047** — De geplakte tekst staat klaar om over te nemen.
- [x] **24.048** — Op deze pagina is geen gestructureerd recept gevonden.
- [x] **24.049** — Een recepttitel ontbreekt.
- [x] **24.050** — Er zijn geen ingrediënten gevonden.
- [x] **24.051** — De ingrediënten staan als oorspronkelijke tekst klaar voor controle.
- [x] **24.052** — Controleer de hoeveelheid van elk ingrediënt.
- [x] **24.053** — Het aantal porties ontbreekt.
- [x] **24.054** — Er zijn geen bereidingsstappen gevonden.
- [x] **24.055** — Deze maat wordt apart geschat bij de boodschappenberekening.
- [x] **24.056** — Een hoeveelheid ontbreekt in de bron.
- [x] **24.057** — De hoeveelheid is niet eenduidig leesbaar.
- [x] **24.058** — Controleer welk ingrediënt wordt bedoeld.
- [x] **24.059** — Dit onderdeel komt niet duidelijk overeen met de bron.
- [x] **24.060** — Er lijken gegevens in het recept te ontbreken.
- [x] **24.061** — Niet alle brongegevens zijn eenduidig.
- [x] **24.062** — Controleer dit onderdeel met de oorspronkelijke bron.
- [x] **24.063** — Controleer dit onderdeel van de import handmatig.

### Recept zonder titel

Bron: [src/lib/import-draft.ts](/Users/stef/Code/picnic/src/lib/import-draft.ts).

- [x] **24.064** — Recept zonder titel


## 25 Oude recepteditor en versieconflicten

Bijlage. Onderdeel van RecipeWorkspace.

### Kop en bron

Bron: [src/components/RecipeWorkspace.tsx](/Users/stef/Code/picnic/src/components/RecipeWorkspace.tsx).

- [x] **25.001** — Terug
- [x] **25.002** — Recept bewerken
- [x] **25.003** — Importconcept
- [x] **25.004** — Nieuw recept
- [x] **25.005** — Recept aanpassen
- [x] **25.006** — Controleer je import
- [x] **25.007** — Jouw nieuwe recept
- [x] **25.008** — Pas de details aan en bewaar je wijzigingen.
- [x] **25.009** — Controleer de herkende gegevens. Je concept wordt tussendoor bewaard.
- [x] **25.010** — Bron bij dit recept bekijken
- [x] **25.011** — {bronlink} ↗
- [x] **25.012** — De bron wordt opnieuw opgehaald…
- [x] **25.013** — Bron opnieuw ophalen
- [x] **25.014** — Bronkoppeling verlopen
- [x] **25.015** — Je receptconcept blijft bewaard. Kies expliciet of je het zonder bronkoppeling als handmatig recept wilt bewaren.
- [x] **25.016** — Bewaar zonder bronkoppeling

### Receptvelden

Bron: [src/components/RecipeWorkspace.tsx](/Users/stef/Code/picnic/src/components/RecipeWorkspace.tsx).

- [x] **25.017** — Titel
- [x] **25.018** — Bronnaam (optioneel)
- [x] **25.019** — Bijvoorbeeld: familieboek
- [x] **25.020** — Bronlink (optioneel)
- [x] **25.021** — https://…
- [x] **25.022** — Basisporties (optioneel)
- [x] **25.023** — Bijvoorbeeld 4 of 1/2
- [x] **25.024** — Exacte getallen blijven behouden; laat leeg als je het niet weet.

### Ingrediënten bewerken

Bron: [src/components/RecipeWorkspace.tsx](/Users/stef/Code/picnic/src/components/RecipeWorkspace.tsx).

- [x] **25.025** — Ingrediënten
- [x] **25.026** — Controleer de regels. Open “Hoeveelheid aanpassen” als je iets wilt corrigeren.
- [x] **25.027** — ＋ Ingrediënt
- [x] **25.028** — Ingrediënt {volgnummer}
- [x] **25.029** — {oorspronkelijke ingrediëntregel}
- [x] **25.030** — Omschrijving
- [x] **25.031** — Bijvoorbeeld: rijpe tomaten
- [x] **25.032** — Hoeveelheid aanpassen
- [x] **25.033** — Hoeveelheid
- [x] **25.034** — Onbekend
- [x] **25.035** — Naar behoefte
- [x] **25.036** — Exact
- [x] **25.037** — Bereik
- [x] **25.038** — Sectie (optioneel)
- [x] **25.039** — Bijvoorbeeld: saus
- [x] **25.040** — Vanaf
- [x] **25.041** — 1/3
- [x] **25.042** — Tot
- [x] **25.043** — 2/3
- [x] **25.044** — Eenheid
- [x] **25.045** — g
- [x] **25.046** — kg
- [x] **25.047** — ml
- [x] **25.048** — l
- [x] **25.049** — stuk
- [x] **25.050** — Hoeveelheidstype
- [x] **25.051** — Niet opgegeven
- [x] **25.052** — Netto
- [x] **25.053** — Uitgelekt
- [x] **25.054** — Aandachtspunt: {melding}
- [x] **25.055** — Hoeveelheid controleren
- [x] **25.056** — Verwijder ingrediënt

### Bereiding en bewaren

Bron: [src/components/RecipeWorkspace.tsx](/Users/stef/Code/picnic/src/components/RecipeWorkspace.tsx).

- [x] **25.057** — Bereiding
- [x] **25.058** — ＋ Stap
- [x] **25.059** — Je kunt bereidingsstappen later toevoegen.
- [x] **25.060** — Stap {volgnummer}
- [x] **25.061** — {staptekst}
- [x] **25.062** — Verwijder stap {volgnummer}
- [x] **25.063** — Bronfoto’s
- [x] **25.064** — Bronfoto ter controle van het recept
- [x] **25.065** — Opslaan…
- [x] **25.066** — Bewaar en kies boodschappen
- [x] **25.067** — Alleen bewaren

### Versieconflict

Bron: [src/components/RecipeWorkspace.tsx](/Users/stef/Code/picnic/src/components/RecipeWorkspace.tsx).

- [x] **25.068** — Er is een nieuwere versie
- [x] **25.069** — Je concept blijft op dit apparaat bewaard. Bekijk de actuele inhoud voordat je kiest wat je wilt houden.
- [x] **25.070** — Bekijk nieuwste versie
- [x] **25.071** — Bewaar concept als nieuw recept
- [x] **25.072** — Actuele versie: {recepttitel}
- [x] **25.073** — Versie {versienummer} · {aantal} ingrediënten · {aantal} stappen
- [x] **25.074** — {hoeveelheid} — {ingrediënttekst}
- [x] **25.075** — Je concept wordt niet over de actuele versie heen geschreven.

### Foutmeldingen en resultaten

Bron: [src/components/RecipeWorkspace.tsx](/Users/stef/Code/picnic/src/components/RecipeWorkspace.tsx).

- [x] **25.076** — Recept laden is niet gelukt.
- [x] **25.077** — Controleer de porties en hoeveelheden. Gebruik bijvoorbeeld 1/3 of vul alle velden van een hoeveelheid in.
- [x] **25.078** — Vul een titel in.
- [x] **25.079** — Het oorspronkelijke recept kon niet worden geladen. Je kunt dit concept als nieuw recept bewaren.
- [x] **25.080** — Dit concept botst met een nieuwere versie. Vergelijk de versies of bewaar je concept als nieuw recept.
- [x] **25.081** — De bewerkversie ontbreekt. Je concept is bewaard; open het recept opnieuw.
- [x] **25.082** — Recept opgeslagen.
- [x] **25.083** — De bronkoppeling is verlopen. Kies of je dit concept zonder bronkoppeling als handmatig recept wilt bewaren.
- [x] **25.084** — Importrecepten kunnen tijdelijk niet worden opgeslagen. Je concept blijft bewaard; probeer het later opnieuw.
- [x] **25.085** — Dit recept is intussen gewijzigd. Je concept is bewaard. Vergelijk de nieuwste versie of bewaar je wijzigingen als nieuw recept.
- [x] **25.086** — Opslaan is niet gelukt. Je concept blijft bewaard.
- [x] **25.087** — De nieuwste versie staat hieronder ter vergelijking. Je concept is behouden.
- [x] **25.088** — De nieuwste versie kon niet worden geladen.
- [x] **25.089** — Controleer het concept voordat je het als nieuw recept bewaart.
- [x] **25.090** — Je concept is als nieuw recept bewaard.
- [x] **25.091** — Controleer het concept voordat je het als handmatig recept bewaart.
- [x] **25.092** — Je concept is als handmatig recept bewaard zonder bronkoppeling.

### Servermeldingen bij receptbewerking

Bron: [worker/routes/recipes.ts](/Users/stef/Code/picnic/worker/routes/recipes.ts).

- [x] **25.093** — De bron van een recept kan niet worden gewijzigd.
- [x] **25.094** — Controleer de receptgegevens.
- [x] **25.095** — Niet gevonden.
- [x] **25.096** — Het recept is gewijzigd. Laad het opnieuw.
- [x] **25.097** — Een bronafbeelding is niet beschikbaar.
- [x] **25.098** — Ongeldige paginering.
- [x] **25.099** — Bron niet gevonden.


## 26 Oud recept of bronkopie verwijderen

Bijlage. Bevestigingsvensters van RecipeWorkspace.

### Recept verwijderen

Bron: [src/components/RecipeWorkspace.tsx](/Users/stef/Code/picnic/src/components/RecipeWorkspace.tsx).

- [x] **26.001** — Recept verwijderen?
- [x] **26.002** — “{recepttitel}” en de gekoppelde receptgegevens worden verwijderd. Dit kan niet ongedaan worden gemaakt.
- [x] **26.003** — Annuleren
- [x] **26.004** — Verwijderen…
- [x] **26.005** — Ja, verwijder recept
- [x] **26.006** — Recept verwijderd.
- [x] **26.007** — Verwijderen is niet gelukt.

### Bronkopie verwijderen

Bron: [src/components/RecipeWorkspace.tsx](/Users/stef/Code/picnic/src/components/RecipeWorkspace.tsx).

- [x] **26.008** — Bewaarde bronkopie verwijderen?
- [x] **26.009** — De oorspronkelijke tekst of geselecteerde brongegevens verdwijnen uit “{recepttitel}”. Je bewerkte recept, ingrediënten en stappen blijven bestaan. Dit kan niet ongedaan worden gemaakt.
- [x] **26.010** — Annuleren
- [x] **26.011** — Verwijderen…
- [x] **26.012** — Ja, verwijder bronkopie
- [x] **26.013** — De bewaarde bronkopie is verwijderd. Het recept en je bewerkingen blijven bestaan.
- [x] **26.014** — De bronkopie verwijderen is niet gelukt.


## 27 Oude boodschappenweergave

Bijlage. Aanvullende teksten voor RecipeProducts en AdditionStatus zonder compact of shoppingOnly.

### Kop en aandachtspunten

Bron: [src/components/RecipeProducts.tsx](/Users/stef/Code/picnic/src/components/RecipeProducts.tsx).

- [x] **27.001** — Terug naar recept
- [x] **27.002** — Jouw boodschappen
- [x] **27.003** — Passende producten voor je recept. Vink uit wat je al hebt en pas aan wat je wilt.
- [x] **27.004** — Je boodschappen worden gezocht
- [x] **27.005** — Dit duurt wat langer. Je recept blijft bewaard; je kunt teruggaan.
- [x] **27.006** — We controleren passende producten, verpakkingen en prijzen.
- [x] **27.007** — {aantal}s
- [x] **27.008** — {aantal} ingrediënt vraagt je aandacht
- [x] **27.009** — {aantal} ingrediënten vragen je aandacht
- [x] **27.010** — Kies een product en aantal, of geef aan wat je al hebt.
- [x] **27.011** — Bekijk eerste aandachtspunt
- [x] **27.012** — Maak je keuzes
- [x] **27.013** — Ingrediënt
- [x] **27.014** — Picnic-product

### Ingrediënten en productkeuzes

Bron: [src/components/RecipeProducts.tsx](/Users/stef/Code/picnic/src/components/RecipeProducts.tsx).

- [x] **27.015** — {aantal} bronregels samengeteld
- [x] **27.016** — {hoeveelheid} nodig voor {aantal} personen
- [x] **27.017** — Toch nodig
- [x] **27.018** — Heb ik al
- [x] **27.019** — Wordt overgeslagen
- [x] **27.020** — Geen passende match
- [x] **27.021** — Bekijk alternatieven
- [x] **27.022** — Ander product
- [x] **27.023** — Verpakkingen
- [x] **27.024** — Kies aantal
- [x] **27.025** — Zelf gekozen vervanging · controleer of deze past.
- [x] **27.026** — Aantal op basis van schatting
- [x] **27.027** — Berekening bekijken
- [x] **27.028** — Jouw onthouden keuze
- [x] **27.029** — Onthoud mijn keuze voor dit ingrediënt
- [x] **27.030** — Waarschijnlijk in je keukenkastje
- [x] **27.031** — Zout, zwarte peper en gewone bakolie staan uit. Vink ze aan als je ze nodig hebt.
- [x] **27.032** — Nog geen passende match: {ingrediëntnamen}. Kies een product of geef aan dat je dit al hebt.
- [x] **27.033** — Voeg toe aan Picnic ({aantal})
- [x] **27.034** — {aantal} verpakkingen · {prijs in euro} voor je recept
- [x] **27.035** — Nieuw voorstel voor een volgende aankoop

### Toegankelijkheidslabels

Bron: [src/components/RecipeProducts.tsx](/Users/stef/Code/picnic/src/components/RecipeProducts.tsx).

- [x] **27.036** — {ingrediëntnaam} toevoegen

### Voorstel voorbereiden mislukt

Bron: [worker/routes/proposals.ts](/Users/stef/Code/picnic/worker/routes/proposals.ts).

- [x] **27.037** — Verstuur geldige JSON.
- [x] **27.038** — Controleer recept, porties en productkeuzes.
- [x] **27.039** — Het recept is gewijzigd of niet meer beschikbaar.
- [x] **27.040** — Vul eerst de basisporties van het recept in.
- [x] **27.041** — Kies precies één Picnic-product voor elk ingrediënt.
- [x] **27.042** — Koppel eerst je Picnic-account.
- [x] **27.043** — De Picnic-koppeling kan tijdelijk niet worden gebruikt.
- [x] **27.044** — Controleer de hoeveelheid en eenheid van elk ingrediënt.
- [x] **27.045** — De Picnic-koppeling is gewijzigd.
- [x] **27.046** — Een gekozen Picnic-product kon niet in de actuele zoekresultaten worden bevestigd.
- [x] **27.047** — De gekozen Picnic-verpakking heeft een onzekere hoeveelheid of prijs.
- [x] **27.048** — Vul eerst in of de hoeveelheid netto of uitgelekt is.
- [x] **27.049** — De gekozen hoeveelheidbasis komt niet overeen met Picnic.
- [x] **27.050** — Kies netto of uitgelekt voor dit product.
- [x] **27.051** — De gekozen Picnic-verpakking heeft geen bruikbare hoeveelheid.
- [x] **27.052** — De gekozen verpakking kan de benodigde hoeveelheid niet veilig dekken.
- [x] **27.053** — De totaalprijs kan niet veilig worden berekend.
- [x] **27.054** — Picnic is tijdelijk niet bereikbaar.
- [x] **27.055** — Het recept, de sessie of de Picnic-koppeling is intussen gewijzigd. Maak het voorstel opnieuw.
- [x] **27.056** — Dit verzoek is niet toegestaan.
- [x] **27.057** — Log opnieuw in.
- [x] **27.058** — Voorstel niet gevonden.
- [x] **27.059** — Dit voorstel is verlopen of de recept- of Picnic-koppeling is gewijzigd.
- [x] **27.060** — Deze handeling is niet beschikbaar.


## 28 Componentbibliotheek

Route: /design-system. Dit is een bereikbare demonstratiepagina. De gedeelde productkaarten en knoppen staan ook in het onderdeel Gedeelde productkaarten.

### Kop en kleuren

Bron: [src/pages/DesignSystem.tsx](/Users/stef/Code/picnic/src/pages/DesignSystem.tsx).

- [x] **28.001** — ← Naar mijn recepten
- [x] **28.002** — Picnic componentbibliotheek
- [x] **28.003** — Onze webvertaling van Picnic. De producten hieronder komen uit een lokale cataloguswaarneming; prijzen zijn demonstratiegegevens, geen live aanbod; er wordt niets aan je mandje toegevoegd.
- [x] **28.004** — Kleur en typografie
- [x] **28.005** — Inter voor de kookomgeving · 8-punts spacing · ronde, rustige oppervlakken.
- [x] **28.006** — Merkrood
- [x] **28.007** — #d52b1e
- [x] **28.008** — Actiegroen
- [x] **28.009** — #295813
- [x] **28.010** — Tekst
- [x] **28.011** — #333333
- [x] **28.012** — Secundaire tekst
- [x] **28.013** — #68625e
- [x] **28.014** — Achtergrond
- [x] **28.015** — #faf9f6
- [x] **28.016** — Selectie
- [x] **28.017** — #eef3e8

### Acties en verpakkingen

Bron: [src/pages/DesignSystem.tsx](/Users/stef/Code/picnic/src/pages/DesignSystem.tsx).

- [x] **28.018** — Acties en statussen
- [x] **28.019** — Primaire actie
- [x] **28.020** — Secundaire actie
- [x] **28.021** — Niet beschikbaar
- [x] **28.022** — Gekozen
- [x] **28.023** — Zelf beoordelen
- [x] **28.024** — Onvoldoende informatie
- [x] **28.025** — Verpakkingen
- [x] **28.026** — Aantal verpakkingen
- [x] **28.027** — {aantal} gekozen
- [x] **28.028** — Geen gekozen
- [x] **28.029** — Minder voorbeeldproduct
- [x] **28.030** — Aantal verpakkingen voorbeeldproduct
- [x] **28.031** — Meer voorbeeldproduct

### Afbeelding en alternatieven

Bron: [src/pages/DesignSystem.tsx](/Users/stef/Code/picnic/src/pages/DesignSystem.tsx).

- [x] **28.032** — Productafbeelding en compacte productkeuze
- [x] **28.033** — Gebruik een imageId uit de Picnic-productdata om de echte verpakking te bekijken. Zonder foto of bij een fout verschijnt een herkenbare lege toestand.
- [x] **28.034** — Picnic imageId
- [x] **28.035** — Afbeelding-ID uit productdata
- [x] **28.036** — {afbeelding-ID}
- [x] **28.037** — Picnic water bruisend
- [x] **28.038** — 1.5 liter
- [x] **28.039** — € 0,79
- [x] **28.040** — Scrollbare alternatieven
- [x] **28.041** — Scroll horizontaal of gebruik het toetsenbord. Kaarten tonen gekozen, beschikbaar, onbekende prijs en niet-selecteerbare toestanden.
- [x] **28.042** — Voorbeeldalternatieven
- [x] **28.043** — Picnic water koolzuurvrij
- [x] **28.044** — Niet-selecteerbaar voorbeeld
- [x] **28.045** — Beschikbaarheid kan niet worden bevestigd.


## 29 Losse oudere componenten

Bijlage. Deze componenten worden door de huidige appschermen niet geïmporteerd. Ze staan hier om zichtbare tekst bij eventueel hergebruik ook te kunnen beoordelen.

### Oude Picnic-login

Bron: [src/components/PicnicLogin.tsx](/Users/stef/Code/picnic/src/components/PicnicLogin.tsx).

- [x] **29.001** — Picnic Inloggen
- [x] **29.002** — Log in met je Picnic account om ingrediënten toe te voegen
- [x] **29.003** — Email / Gebruikersnaam
- [x] **29.004** — Wachtwoord
- [x] **29.005** — Inloggen...
- [x] **29.006** — Inloggen bij Picnic
- [x] **29.007** — Je inloggegevens worden veilig gebruikt om verbinding te maken met Picnic

### Invoervoorbeelden in de oude login

Bron: [src/components/PicnicLogin.tsx](/Users/stef/Code/picnic/src/components/PicnicLogin.tsx).

- [x] **29.008** — je.email@example.com
- [x] **29.009** — ••••••••

### Oude Picnic-gegevens opslaan

Bron: [src/components/PicnicCredentialsPanel.tsx](/Users/stef/Code/picnic/src/components/PicnicCredentialsPanel.tsx).

- [x] **29.010** — Opgeslagen
- [x] **29.011** — Picnic-gegevens opgeslagen
- [x] **29.012** — Fout
- [x] **29.013** — Onbekende fout
- [x] **29.014** — Picnic-account koppelen
- [x] **29.015** — Bewaar je Picnic-inlog. Wij gebruiken dit alleen server-side.
- [x] **29.016** — Picnic gebruikersnaam / email
- [x] **29.017** — Picnic wachtwoord
- [x] **29.018** — Wijzigingen opslaan
- [x] **29.019** — Koppelen

### Ingrediënten plakken

Bron: [src/components/IngredientInput.tsx](/Users/stef/Code/picnic/src/components/IngredientInput.tsx).

- [x] **29.020** — Ingrediënten plakken
- [x] **29.021** — Plaats een lijst (regels of komma’s). Voorbeeld: "2x tomaten, 200 g kipfilet"
- [x] **29.022** — 2x tomaten ⏎ 200 g kipfilet ⏎ 1 ui
- [x] **29.023** — Parsen...
- [x] **29.024** — Ingrediënten parsen
- [x] **29.025** — Parser error
- [x] **29.026** — Fout bij parser
- [x] **29.027** — Onbekende fout

### Oude receptkaart

Bron: [src/components/RecipeCard.tsx](/Users/stef/Code/picnic/src/components/RecipeCard.tsx).

- [x] **29.028** — {recepttitel}
- [x] **29.029** — {receptomschrijving}
- [x] **29.030** — {bereidingstijd}
- [x] **29.031** — {aantal} porties
- [x] **29.032** — {aantal} ingrediënten
- [x] **29.033** — Ingrediënten:
- [x] **29.034** — {hoeveelheid} {eenheid}
- [x] **29.035** — {ingrediëntnaam}
- [x] **29.036** — Bereidingswijze:
- [x] **29.037** — {staptekst}
- [x] **29.038** — ... en nog {aantal} stappen meer

### Oude toevoegknop en meldingen

Bron: [src/components/AddToBasketButton.tsx](/Users/stef/Code/picnic/src/components/AddToBasketButton.tsx).

- [x] **29.039** — Niet ingelogd
- [x] **29.040** — Log eerst in bij de app en koppel je Picnic-account
- [x] **29.041** — Ingrediënten toegevoegd!
- [x] **29.042** — {aantal} ingrediënten zijn toegevoegd aan je Picnic winkelmandje
- [x] **29.043** — Enkele ingrediënten niet gevonden
- [x] **29.044** — {aantal} ingrediënten konden niet worden toegevoegd: {eerste drie ingrediëntnamen}
- [x] **29.045** — {aantal} ingrediënten konden niet worden toegevoegd: {eerste drie ingrediëntnamen}...
- [x] **29.046** — Geen ingrediënten toegevoegd
- [x] **29.047** — Geen van de ingrediënten kon worden gevonden in Picnic
- [x] **29.048** — Fout opgetreden
- [x] **29.049** — Er is een fout opgetreden bij het toevoegen van ingrediënten
- [x] **29.050** — Toegevoegd aan winkelmandje!
- [x] **29.051** — Ingrediënten toevoegen...
- [x] **29.052** — Voeg {aantal} ingrediënten toe aan Picnic

### Niet gevonden ingrediënt koppelen

Bron: [src/components/UnmatchedMapper.tsx](/Users/stef/Code/picnic/src/components/UnmatchedMapper.tsx).

- [x] **29.053** — Niet-gevonden ingrediënten koppelen
- [x] **29.054** — Kies een ingrediënt en zoek een Picnic product om te onthouden
- [x] **29.055** — {ingrediëntnaam}
- [x] **29.056** — Zoek op Picnic
- [x] **29.057** — Zoeken...
- [x] **29.058** — Geen resultaten
- [x] **29.059** — {productnaam}
- [x] **29.060** — · €{prijs met punt en twee decimalen}
- [x] **29.061** — Koppelen
- [x] **29.062** — Gekoppeld
- [x] **29.063** — {ingrediëntnaam} → {productnaam of product-ID}
- [x] **29.064** — Opslaan mislukt
- [x] **29.065** — Onbekende fout

### Oude servicefoutmeldingen

Bron: [src/services/backendService.ts](/Users/stef/Code/picnic/src/services/backendService.ts), [src/services/picnicService.ts](/Users/stef/Code/picnic/src/services/picnicService.ts), [src/services/recipeService.ts](/Users/stef/Code/picnic/src/services/recipeService.ts), [src/lib/product-plan.ts](/Users/stef/Code/picnic/src/lib/product-plan.ts).

- [x] **29.066** — Register failed
- [x] **29.067** — Login failed
- [x] **29.068** — Saving Picnic credentials failed
- [x] **29.069** — Failed to load Picnic credentials status
- [x] **29.070** — Adding ingredients failed
- [x] **29.071** — Failed to load mappings
- [x] **29.072** — Failed to save mapping
- [x] **29.073** — Search failed
- [x] **29.074** — Not authenticated with Picnic
- [x] **29.075** — Only mob.co.uk recipes are supported
- [x] **29.076** — Failed to fetch recipe content
- [x] **29.077** — Failed to fetch recipe. Please check the URL and try again.
- [x] **29.078** — Recipe from mob.co.uk
- [x] **29.079** — A delicious recipe from mob.co.uk
- [x] **29.080** — Controleer de hoeveelheid, eenheid en porties in het recept voordat je producten kiest.
