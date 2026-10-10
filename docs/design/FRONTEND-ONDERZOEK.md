# Frontend onderzoek en verbeteradvies voor Mijn recepten

9 oktober 2026

Mijn recepten kan een verzorgde consumentenapp worden door het kookboek, de import en de boodschappenkeuze als één ervaring te ontwerpen. De grootste winst zit in beeldgebruik, informatiehiërarchie, voorspelbare interacties en minder controlewerk. De huidige React-, Radix- en shadcn-basis kan dat dragen. Extra componentbibliotheken zijn slechts gericht nodig.

De voorgestelde richting is een warm, eigentijds persoonlijk kookboek: uitnodigend bij het kiezen van eten, compact en precies bij het kiezen van boodschappen. Receptfotografie bepaalt de sfeer; groene acties en herkenbare productverpakkingen verbinden de ervaring met Picnic.

## Reikwijdte en zekerheid

Het welkomstscherm en de componentgalerij zijn lokaal in de browser bekeken. De ingelogde recepten-, import-, editor- en boodschappenervaring is beoordeeld op de huidige broncode; die volledige flow is niet met een ingelogd account doorlopen. Uitspraken over visuele verhoudingen van die schermen zijn daarom ontwerpdiagnoses op basis van hun markup en CSS, geen volledige gebruikerstest.

Alle 25 opgegeven domeinen zijn benaderd. AppShot was niet toegankelijk via de onderzoekstool. Kitbitz en Liquid Glass leverden onvoldoende uitleesbare inhoud voor een inhoudelijke codebeoordeling. Enkele Motion Primitives-pagina’s blokkeerden directe toegang; officiële geïndexeerde documentatie was wel beschikbaar. Bibliotheekaantallen en marketingclaims zijn geen kwaliteitsbewijs en vormen geen selectiecriterium.

## Wat de huidige interface tegenhoudt

### De eerste indruk communiceert weinig eten

Het welkomstscherm heeft duidelijke grote typografie en een rustige tweekolomsindeling. Maar het bestaat bijna volledig uit tekst, pictogrammen en een e-mailveld. Een bezoeker ziet de belofte van een kookboek zonder het kookboek zelf te zien. Een goed samengesteld receptvoorbeeld of een eigen foodfoto maakt de waarde concreter dan extra slogans of decoratieve effecten.

Dezelfde aandacht geldt voor de lege receptenlijst. De bestaande toestand legt uit hoe je begint, maar een boekpictogram en een knop laten weinig van de uiteindelijke ervaring zien. Toon een compacte voorbeeldcompositie met een duidelijke demonstratieaanduiding; laat die geen echte opgeslagen recepten suggereren.

### De styling bestaat uit meerdere correctielagen

`src/main.tsx` laadt `index.css`, daarna `tokens.css`, daarna `app-ui.css`. In `index.css` komen onder meer `.recipe-list`, `.recipe-list-card`, `.recipe-heading` en `.recipe-search` meermaals voor. `app-ui.css` overschrijft opnieuw een deel daarvan. Er bestaan zowel shadcn-kleurtokens als `--pc-*`-tokens, naast veel letterlijke kleurwaarden.

Dat maakt verdere verfijning kwetsbaar: een verandering aan spacing of mobiel gedrag kan een oude regel laten herleven. Consolidatie is een ontwerptaak omdat voorspelbare CSS nodig is voor consequente schermen. Behoud de bestaande componenten, maar geef elk patroon één gezaghebbende stijl en laat beide tokenfamilies naar dezelfde semantische kleuren verwijzen.

### Receptkaarten hebben geen consistente beeldloze toestand

`RecipeCover` retourneert niets bij een ontbrekende of defecte foto. Een mix van recepten met en zonder foto krijgt daardoor verschillende visuele gewichten. Dat is vooral zichtbaar in de drie kolommen van de huidige receptenlijst.

Maak een bewust ontworpen variant zonder foto: een vast beeldvlak met rustige textuur en bronnaam, of een volledig tekstgerichte kaart met dezelfde minimale hoogte. Gebruik geen willekeurige maaltijd als vervangende foto; de afbeelding moet het opgeslagen recept representeren. Reserveer ook ruimte tijdens laden om verschuivingen te beperken.

### Het kookboek benadrukt administratie

De bestaande kaart bevat bron, titel, aantal ingrediënten, porties en een aparte regel “Bekijk recept”. Dat is begrijpelijk, maar ingredientaantal en bronnaam helpen beperkt bij de vraag wat je vanavond wilt eten. Geef titel en beeld meer gewicht, en zet beschikbare, betrouwbare kookinformatie eronder. Bereidingstijd of dieetlabels mogen pas verschijnen als die gegevens expliciet aanwezig en betrouwbaar zijn.

Een gelijkmatig receptgrid is hier functioneel. Het hoeft geen asymmetrische portfolio of bento-layout te worden. De verbetering zit in kaartverhoudingen, teksthiërarchie, beeldkwaliteit en consistente states.

### De import vraagt veel uitleg voordat het resultaat zichtbaar is

De import heeft foto/link-keuze, uploadbeperkingen, porties, optionele bronnaam en vervolgens herkennings- en controletoestanden. De editor vraagt daarna veel aandacht voor afzonderlijke ingrediënten. Bestaande details-elementen verbergen al complexiteit, maar het geheel blijft een lange formulierervaring.

De kernvraag voor ontwerp is welke gegevens de gebruiker op welk moment moet bevestigen. Een bronfoto of link is de eerste taak. Het oorspronkelijke aantal personen en het gewenste aantal personen zijn verschillende gegevens; maak dat onderscheid expliciet. Onderzoek of de gewenste porties later, bij boodschappen, kunnen worden gekozen. Dat vereist controle van de bestaande importcontracten en is geen uitsluitend visuele wijziging.

### De boodschappenregels stapelen kleine beslissingen

`RecipeProducts` toont per ingrediënt broninformatie, berekende behoefte, selectie, “Heb ik al”, productkeuze, verpakkingen, prijs, schatting en soms voorkeuren. Alle informatie kan relevant zijn, maar tegelijk tonen maakt het een controleformulier.

De bestaande foto’s, productcomponenten, samenvatting van aandachtspunten en vaste onderbalk zijn waardevol. Bouw daarop voort. Geef een gewone, passende productregel een compacte samenvatting. Maak de berekening en het onthouden van voorkeuren secundair. Geef ontbrekende of onzekere keuzes juist extra ruimte en een duidelijke eerstvolgende actie.

### Niet alle foutmeldingen helpen op dezelfde plek

Er zijn globale notices, lokale meldingen, twee gemonteerde toastvoorzieningen en verschillende statuspanelen. Twee toastproviders bewijzen geen dubbele meldingen, maar maken de feedbackarchitectuur onnodig breed.

Leg vast: veldfouten staan bij het veld, schermproblemen bij de betreffende inhoud, korte bevestigingen gebruiken één toastvoorziening en aankoopuitkomsten blijven zichtbaar op de pagina. Een onzekere toevoeging mag nooit verdwijnen in een tijdelijke toast.

### Zoekgedrag kan meer beloven dan het levert

De receptenzoekfunctie zoekt in geladen recepten; er bestaat ook cursorpaginatie. Het zichtbare zoekveld suggereert gemakkelijk zoeken in het hele kookboek. Maak die beperking zichtbaar of voeg echte serverzoekfunctionaliteit toe. Dat tweede vraagt backendwerk. Een mooier zoekveld lost deze verwachting niet op.

## Beoordeling van de 25 bronnen

De prioriteit hieronder is mijn oordeel voor deze specifieke recepten-naar-Picnic-app. Een lage prioriteit betekent dat een bron weinig bijdraagt aan de huidige kerntaak.

| Bron | Prioriteit | Concrete toepassing en begrenzing |
| --- | --- | --- |
| [Jiro](https://jiro.build/) | Gericht | Templates en sectieprompts voor welkomstscherm en lege toestand. De catalogus leunt sterk op marketingpagina’s; een volledige template past niet automatisch op de ingelogde tool. |
| [Minimal Gallery](https://minimal.gallery/tag/food-drink/) | Hoog | Beeldregie, rustige compositie en typografische hiërarchie. De foodcategorie bevat onder meer Union Boulangerie en Sonderdays. Gebruik de relatie tussen beeld en tekst; neem hun marketingnavigatie niet vanzelf over. |
| [Kage](https://kage.design/) | Gericht | Relevante kaarten, galerijen en tabs als referentie met bijbehorende prompts. De zichtbare catalogus bevat veel landingspagina’s. Selecteer per probleem en toets het voorbeeld met onze productdata. |
| [Refero Styles](https://styles.refero.design/) | Hoog | Kleur-, type-, spacing- en componentkeuzes uitdrukken in een samenhangend ontwerpcontract. Een afgeleid DESIGN.md blijft een interpretatie van een website, geen officiële interne designsysteembibliotheek. |
| [Component Gallery](https://component.gallery/) | Hoog | Vergelijken hoe volwassen systemen zoekvelden, disclosure, dialogs en selectie oplossen. Vooral bruikbaar voor de productkiezer en foutstates. Het is een referentiecatalogus; geen kant-en-klare uniforme runtimebibliotheek. |
| [AppShot](https://appshot.gallery/) | Voorlopig | Mobiele receptenlijst, selectie en navigatie zijn relevante onderzoeksvragen. De site kon niet worden geverifieerd; daarom geen aanbeveling voor specifieke voorbeelden of aankoop. |
| [DESIGNmd](https://designmd.ai/) | Hoog als werkwijze | Leg de eigen visuele keuzes en interactieregels vast in leesbare Markdown. De repository heeft al een designsysteemdocument; verfijn dat tot een bruikbaar contract en vermijd een tweede conflicterende bron. |
| [VibePrompt](https://vibeprompts.dev/) | Gericht | Alternatieve composities voor authenticatie en onboarding snel beschrijven. De zichtbare categorieën bevatten ook veel marketingblokken; prompts zijn startmateriaal, geen UX-validatie. |
| [21st.dev](https://21st.dev/) | Gericht | React/Tailwind-componenten vinden voor een concreet ontbrekend patroon. Het registryformaat sluit aan op shadcn. Meerdere auteurs betekent variatie in kwaliteit, afhankelijkheden en stijl; beoordeel elk geselecteerd onderdeel afzonderlijk. |
| [Kinetics](https://kinetics.colorion.co/) | Gericht | Feedback op selectie, ingeklapte inhoud en wijzigingen in aantallen. Kopieer de beweging als idee. Sommige voorbeelden gebruiken klikbare divs of vaste hoogtes; verbeter semantiek en variabele inhoud voordat code wordt overgenomen. |
| [shadcn/ui](https://ui.shadcn.com/docs) | Hoog | Bestaand fundament voor toegankelijke knoppen, dialogs, menus en formulieren verfijnen. Dit is de kortste technische route. Onze installatie gebruikt Radix en Tailwind 3; nieuwe voorbeelden moeten daarbij passen. |
| [Aceternity UI](https://ui.aceternity.com/) | Laag voor de kern | Alleen een rustig beeld- of kaartpatroon onderzoeken. Spotlight, cursortracking en sterke 3D-effecten geven de boodschappenkeuze weinig functionele waarde. |
| [Magic UI](https://magicui.design/) | Gericht | Eventueel een terughoudende overgang of onboardingdetail. De officiële site positioneert de bibliotheek ook nadrukkelijk voor landingspagina’s; marketingeffecten zijn geen vanzelfsprekende productverbetering. |
| [Motion Primitives](https://motion-primitives.com/docs/animated-background) | Hoog voor afwerking | Actieve tab of bronkeuze subtiel laten verschuiven; [Animated Number](https://motion-primitives.com/docs/animated-number) onderzoeken voor een rustig veranderend totaal. Pas dit pas toe nadat het gedrag en de statische layout kloppen. |
| [Uiverse](https://uiverse.io/) | Gericht | Losse CSS-interacties onderzoeken voor geselecteerde checkbox of drukfeedback. Communitycode moet langs ons token-, toetsenbord- en licentiecontract. Geen collectie verschillende buttonstijlen invoeren. |
| [UIAble](https://uiable.com/) | Gericht | Samenhang tussen componenten en app-layouts bestuderen. De huidige site noemt Base UI-primitives; onze Radix-basis maakt directe uitwisselbaarheid geen gegeven. Een migratie heeft nu weinig bewezen voordeel. |
| [mapcn](https://www.mapcn.dev/) | Niet nodig | React/MapLibre-kaarten zijn relevant bij kaartgebaseerde taken. De huidige tool heeft geen kaarttaak of bezorgtracking. Toevoegen vergroot de scope zonder het koken of selecteren te helpen. |
| [MicroKit](https://microkit.co/) | Hoog voor kleine details | [Focus Field](https://microkit.co/components/focus-input) voor verzorgd focusgedrag en Sliding Underline Tabs als navigatie-inspiratie. Veel voorbeelden zijn hovergericht; vertaal naar aanraking en toetsenbord. |
| [Liquid Glass](https://glass.samasante.com/) | Laag | Hoogstens een experimentele navigatielaag buiten kritieke informatie. Code en uitvoeringskosten zijn niet beoordeeld. Prijzen, productnamen en waarschuwingen hebben meer baat bij solide contrast. |
| [CSS Text Effects](https://text-effects.colorion.co/) | Laag | Eventueel één rustige reveal op een publiek welkomstscherm. Bewegende recepttitels, glitch en neon maken terugkerende taken onrustiger. |
| [Circle Loaders](https://circleloaders.dominikakissi.com/) | Gericht | Eén compacte statusanimatie bij herkenning. Combineer met echte statuswoorden en bestaande skeletons. Geen verzonnen voortgangspercentage of timer die een gegarandeerde eindtijd suggereert. |
| [Gradient Buttons](https://gradientbuttons.colorion.co/) | Laag | Onderzoek druk- en hoverfeedback, maar behoud één herkenbare primaire actie. Gradientdecoratie is geen prioriteit voor deze visuele richting. |
| [Kitbitz](https://kitbitz.art/) | Voorlopig | Een consistente handgetekende kookillustratie kan lege toestanden helpen. Illustraties en gebruiksrechten moeten eerst concreet worden bekeken; de site was onvoldoende uitleesbaar. |
| [3Dicons](https://3dicons.co/) | Laag | Mogelijk één illustratie in onboarding. Geen vervanging van onze functionele iconen of echte productfoto’s; een tweede beeldtaal kan de samenhang verzwakken. |
| [Anime.js](https://animejs.com/) | Later | Geschikt voor uitgebreidere timelines en SVG-animatie. De huidige behoeften passen grotendeels bij CSS en eventueel één React-motionlaag. Er is geen reden om direct twee animatie-engines toe te voegen. |

## Aanbevolen ontwerpkeuzes

### Visuele identiteit

Behoud warm wit, donker leesbaar tekstcontrast en het bestaande actiegroen. Gebruik rood voornamelijk voor de Picnic-verwijzing en een aparte expliciete foutrol. Definieer onder meer canvas, oppervlak, tekst, secundaire tekst, grens, selectie, focus, waarschuwing en fout als semantische tokens.

Inter is lokaal beschikbaar en past bij de bestaande Picnic-kookreferentie. Een fontwissel is geen noodzakelijke eerste stap. Probeer eerst een consistente schaal: circa 32–40px voor schermtitels op desktop, 26–32px mobiel, 18–22px voor recepttitels en 14–16px voor bediening en lopende tekst. Dit zijn ontwerpvoorstellen die met echte scherminhoud moeten worden verfijnd.

Gebruik rustigere visuele grenzen. Een receptkaart mag een eigen object zijn; een gewone uitlegregel hoeft geen extra kaart te worden. Geef hoofdsecties meer ruimte dan velden binnen dezelfde taak. Gebruik schaduw vooral om overlays of een vaste actiezone van de inhoud te scheiden.

### Kookboek en receptdetail

Maak een compacte kop met zoekfunctie en “Recept toevoegen”. Laat het grid visueel dragen door echte maaltijdbeelden en korte titels. Een neutrale filter op bron kan eventueel uit bestaande data komen. Favorieten, bereidingstijd, tags en “recent gekookt” vragen nieuwe of gevalideerde gegevens; behandel ze als afzonderlijke productuitbreidingen.

Op desktop kunnen receptbeeld en titel/porties naast elkaar staan, met ingrediënten en stappen eronder. Op mobiel moet de titel vroeg zichtbaar zijn en mag een grote foto de portiekeuze niet te ver naar beneden duwen. Een primaire actie “Kies boodschappen” blijft duidelijk bereikbaar. Een kookmodus met afvinkbare stappen is een latere uitbreiding, geen vereiste voor een eerste volwassen redesign.

### Import en controleren

Maak de foto/link-keuze een herkenbare gesegmenteerde bediening met duidelijke geselecteerde state. Toon voor gekozen bestanden kleine previews en benoemde verwijderknoppen; accepteer alleen de huidige ondersteunde bronnen en bestandstypen. Een mobiel foto-invoerpunt moet gewoon bedienbaar blijven zonder drag-and-drop.

Tijdens herkenning blijft de gekozen bron zichtbaar. Toon alleen werkelijk bekende fases. Presenteer het resultaat als een receptpreview, waarna de editor de aandachtspunten nadrukkelijker toont dan reeds betrouwbare velden. Een compact ingrediënt kan op aanvraag openklappen voor hoeveelheid, eenheid en sectie.

Er bestaat al een vierstappenindicator. Gebruik die bij de importtaak, maar forceer hem niet op gewone receptenbewerking: een bestaand recept corrigeren hoeft geen reis richting boodschappen of Picnic te zijn. De stap “Picnic” is verwerking van toevoeging, geen bestelling of betaling.

### Boodschappenkeuze

Maak de normale regel leesbaar als: ingrediënt en benodigde hoeveelheid → gekozen verpakking → aantal en regelprijs. Laat “Heb ik al” direct zien als een overgeslagen toestand, met een eenvoudige terugweg. Houd alternatieven in een dialog op desktop; onderzoek een drawer op mobiel, met focusherstel naar precies de geopende regel.

Toon in de productkiezer naast verpakking en stukprijs ook het relevante aantal verpakkingen en recepttotaal wanneer die gegevens betrouwbaar beschikbaar zijn. Onderscheid passende alternatieven, zelf te beoordelen vervangingen en onvoldoende informatie. Een mooiere kaart mag die grenzen niet afzwakken.

Behoud de bestaande aandachtspuntsamenvatting. Voeg eventueel een filter “Nog controleren” toe terwijl de oorspronkelijke ingrediëntvolgorde beschikbaar blijft. Automatisch hersorteren tijdens selectie kan een regel onder de pointer verplaatsen en de oriëntatie verstoren.

De vaste actiezone toont totaal, productaantal en de reden als doorgaan geblokkeerd is. Maak duidelijk dat het om volledige verpakkingen gaat. Op mobiel moet de zone rekening houden met safe areas, toetsenbord en de laatste lijstregel; een willekeurige vaste onderpadding is onvoldoende bewijs dat niets bedekt raakt.

### Verwerking en resultaat

De bestaande `AdditionStatus` behandelt toegevoegd, niet toegevoegd en onbekend afzonderlijk. Dat is een sterk onderdeel van de tool. Geef een volledige uitkomst een duidelijke samenvatting en maak gedeeltelijke of onbekende uitkomsten even zorgvuldig vormgegeven.

Een succesanimatie volgt de bevestigde serveruitkomst. Bij onzekerheid moet dezelfde toevoeging hervat of gecontroleerd worden; een nieuw opvallend “Opnieuw toevoegen”-knopje kan dubbele acties uitlokken. Bewaar het huidige contract voor hervatten en bevestigen.

## Frontendarchitectuur voor uitvoering

Behoud React 18, Vite, TypeScript, Tailwind 3, Radix en Lucide. Vermijd een frameworkmigratie als onderdeel van de visuele verbeterslag. Laat geïmporteerde registrycode aansluiten op de bestaande versies, tokens en semantiek; voer geen blind `latest`-installatie uit.

Maak herbruikbare patronen voor een schermkop, receptkaart, importbronkeuze, aandachtspunt, productregel, lege toestand en actiezone. Houd prijsberekening, geschiktheid, bewaarde keuzes en aankoopherstel buiten decoratieve componenten. De bestaande scheiding tussen `catalog.tsx` en `RecipeProducts` is hiervoor een goed uitgangspunt.

Gebruik CSS voor focus, hover, drukfeedback en eenvoudige opacity/transform-overgangen. Onderzoek Motion Primitives/Motion alleen waar elementen tussen states van positie of vorm veranderen. Voorgestelde duur: circa 120–180ms voor directe feedback en 180–240ms voor een inhoudsovergang. Dit zijn te testen ontwerpwaarden, geen prestatieresultaten.

Anime.js is pas zinvol wanneer er een concrete complexe animatietaak ontstaat. Kinetics-voorbeelden die hoogte of breedte animeren moeten met echte lange inhoud worden getest; hun demonstratie bewijst geen goede performance in onze lijst.

Werk het bestaande designsysteemdocument bij met daadwerkelijk gebruikte regels: typografieschaal, ruimteverhoudingen, beeldvarianten, interactiestates, mobiele gedragspatronen en goede/slechte voorbeelden. Breid `/design-system` uit met receptkaarten en complete patroonstates. Markdown geeft de intentie; tokens, componenten en screenshots controleren de uitvoering.

## Volgorde van aanpak

| Fase | Werk | Resultaat om te beoordelen |
| --- | --- | --- |
| 1 | Eén ontwerpcontract; CSS-correctielagen consolideren; representatieve schermdata verzamelen | Consistente tokens en voorbeelden met lange titels, ontbrekende beelden en fouten |
| 2 | Welkom, lege kookboektoestand, receptkaart en receptdetail ontwerpen | De app voelt als een kookboek; beelden en kaartvarianten zijn overtuigend op desktop en mobiel |
| 3 | Import en editor vereenvoudigen zonder bron- of hoeveelheidsinformatie te verliezen | Een duidelijke eerste taak en gerichte controle van aandachtspunten |
| 4 | Productregels, alternatieven en vaste actiezone verfijnen | Minder scanwerk en zichtbaar onderscheid tussen zeker, onzeker en overgeslagen |
| 5 | Feedback en korte beweging toevoegen; statusresultaten verfijnen | Handelingen voelen responsief en uitkomsten blijven begrijpelijk |
| 6 | Nieuwe productmogelijkheden apart beoordelen | Favorieten, volledige zoekfunctie of kookmodus krijgen eigen datacontract en acceptatiecriteria |

Fase 2 geeft waarschijnlijk de grootste onmiddellijke visuele winst. Fase 3 en 4 leveren waarschijnlijk de meeste winst in dagelijks gebruik. Die verwachting moet met concrete taken worden getoetst; er is nog geen gemeten conversie- of tijdwinst.

## Criteria voor een geslaagd redesign

- Een gebruiker kan een recept kiezen, gewenste porties instellen, één product vervangen en aangeven dat iets al in huis is zonder uitleg van een begeleider.
- Fotoloze recepten, lange productnamen en onzekere hoeveelheden ogen als volwaardige toestanden.
- Zoeken maakt duidelijk of het het hele kookboek of alleen geladen recepten doorzoekt.
- Op 360px, 390px, tablet en desktop ontstaat geen horizontale paginaoverflow; overlays en vaste zones bedekken geen noodzakelijke bediening.
- Toetsenbordfocus blijft zichtbaar, dialogs geven focus terug en belangrijke uitkomsten blijven beschikbaar buiten toasts. Controleer ook tekstvergroting en reduced motion.
- Een totaal blijft inhoudelijk correct bij veranderde porties, aantallen en overgeslagen ingrediënten. Animatie verandert alleen de presentatie.
- Uitverkochte of onvoldoende beoordeelde producten krijgen geen selecteerbare stijl die hun blokkade tegenspreekt.
- Herladen tijdens verwerking behoudt de bestaande herstelroute en leidt niet tot dubbel toevoegen.
- Beelden hebben vaste ruimte, passende resoluties en een bruikbare foutvariant. Meet de feitelijke laad- en interactiesnelheid; een componentdemo levert daar geen bewijs voor.

Gebruik voor visuele vergelijking dezelfde recepten en productdata vóór en na de wijziging. Test één gewone succesvolle route en minstens een importfout, ontbrekende foto, onbekende hoeveelheid, geblokkeerde productkeuze en onzekere toevoeging. Laat gebruikers zowel de eerste taak als een herhaaltaak uitvoeren; een indrukwekkend eerste scherm zegt weinig over dagelijks gebruik.

## Selectieadvies

Gebruik Minimal Gallery voor beeld en compositie, Refero Styles en de DESIGN.md-werkwijze voor samenhang, Component Gallery voor interactiepatronen en de bestaande shadcn/Radix-componenten voor uitvoering. Voeg daarna selectief MicroKit en Motion Primitives toe voor afwerking.

Jiro, Kage, VibePrompt en 21st.dev kunnen alternatieven versnellen, zolang elk gekozen voorbeeld aan dezelfde taak en hetzelfde ontwerpcontract wordt getoetst. Glass, tekstanimaties, gradientknoppen en 3D-iconen krijgen pas een plaats wanneer een concrete schermtaak er aantoonbaar beter van wordt.
