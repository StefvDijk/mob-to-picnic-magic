# Picnic: onderzoek, componentbibliotheek en designsysteem

Onderzocht op 9 oktober 2026. Deze bibliotheek is een eigen React-webimplementatie op basis van openbare Picnic-bronnen, gemeten webstijlen en onze bestaande productadapter. Het is geen export van Picnic’s interne library. De actuele native app is niet volledig doorgemeten; exacte pixels daarvan zijn nog geen bewezen overeenkomst.

## Onderzoeksaanpak en bronnen

Drie oppervlakken moeten apart worden beoordeeld: de marketingwebsite, de kookwebsite en de native supermarktapp. Ze delen merkidentiteit, maar niet overal dezelfde fonts, dichtheid of navigatie. Onze vorige frontend leunde vooral op de kookwebsite; de screenshot van de productkeuze was een teksttabel zonder de beschikbare productfoto’s.

| Bron | Bewijs | Begrenzing |
| --- | --- | --- |
| [Officiële app-downloadpagina](https://picnic.app/nl/app-downloaden/) | Website direct bekeken; computed styles en afbeeldingverwijzingen uitgelezen op 9 oktober | Marketingpagina, geen live productcatalogus |
| [Officiële kookomgeving](https://picnic.app/nl/koken-met-picnic/) | Bestaande meting van 8 oktober: Inter, groene acties, wit en warm neutraal | Zie PICNIC-REFERENCE.md voor herkomst en lokaal font |
| [Picnic Component Library, 2018](https://medium.com/lifes-a-picnic/building-the-picnic-component-library-b89583df8e16) | Picnic beschrijft kleur, font, radius, schaduw en grid, atomic design en patroonbenaming | Historisch procesbewijs; geen actuele tokenexport |
| [Brownfield React Native development](https://jobs.picnic.app/en/blogs/brownfield-react-native-development-at-picnic) | Picnic beschrijft styled-components, Storybook en visuele snapshots voor componenten | Architectuurhistorie; geen publiek te installeren supermarkt-UI-package |
| [Mobile Page Platform, 2025](https://jobs.picnic.app/en/blogs/server-driven-ui-in-picnics-page-platform) | Core-, section- en layoutcomponenten; servergestuurde compositie; horizontale kaartsecties | Concepten zijn openbaar, exacte componentconfiguratie niet |
| [Beyond Static Pages](https://jobs.picnic.app/en/blogs/beyond-static-pages-bringing-ui-to-life) | Interactieve pagina’s en zoekervaring binnen de page-platformarchitectuur | Geen volledige visuele specificatie |
| [Define, Extract and Transform](https://jobs.picnic.app/en/blogs/define-extract-and-transform-inside-picnics-page-platform) | Data en presentatie worden binnen Picnic’s Page Platform gecombineerd | Geen garantie dat onze API-wrapper alle presentatievelden bewaart |
| Geïnstalleerde picnic-api 4.10.0, catalog/service.js | Afbeeldingsroute, ondersteunde afbeeldingsformaten en accountcatalogus | Onofficiële wrapper; beelden moeten per imageId bereikbaar zijn |

Zoekresultaten met “Picnic design system” verwijzen ook naar Attentive, Herman Miller en andere gelijknamige projecten. Deze zijn niet gebruikt voor supermarktcomponenten. Een automatisch gegenereerde kleurpalette met WordPress-defaultkleuren is evenmin bruikbaar als officiële Picnic-specificatie.

## Visuele referenties, daadwerkelijk bekeken

- [Receptenschermen, april 2026](https://d2jxuf8ovdiw8x.cloudfront.net/uploads/sites/18/2026/04/Screens-Meals-new-NL.png): bovenaan zoekveld, compacte categoriechips, witte achtergrond, ronde receptfoto’s, geselecteerde categorie groen, iconen onderaan. Het is een officiële promotieafbeelding; de pixels bevatten telefoonkaders en zijn geen schaalvaste UI-metingen.
- [Picnic boodschappenfoto](https://d2jxuf8ovdiw8x.cloudfront.net/uploads/sites/18/2025/11/Image-14-min.png): echte herkenbare verpakkingen, rood Picnic-krat, versproducten. Bruikbaar voor merkcontext, niet als afbeelding van een willekeurig specifiek product.
- [Europarade](https://d2jxuf8ovdiw8x.cloudfront.net/uploads/sites/18/2025/11/NLNEW-Europarade-min.png): campagnebeeld met echte verpakkingen en prominente prijzen. Campagnestijl mag niet ongemerkt een standaard productkaart worden.
- [Officiële favicon](https://d2jxuf8ovdiw8x.cloudfront.net/uploads/sites/18/2020/11/cropped-logo-150x150.png): lokaal opgeslagen als public/favicon-picnic.png en aangesloten in index.html.

De live marketingnavigatie is gemeten met Roboto 16px, tekst #333333, actieve navigatie #295813 en witte CTA-tekst. De kookomgeving gebruikt volgens de bestaande meting Inter. Onze webapp blijft bij het lokaal aanwezige Inter om consistent met de recepten te blijven. Native appfonts zijn nog niet exact vastgesteld.

## Foundations: tokencontract

De CSS-variabelen staan in src/components/picnic/tokens.css en worden na de bestaande stylesheet geladen. De naamruimte `--pc-*` voorkomt conflicten met de bestaande shadcn/Radix-foundation. Geen tweede framework of nieuw UI-package nodig.

| Token | Waarde | Herkomst/rol |
| --- | --- | --- |
| brand | #d52b1e | Bestaande gemeten Picnic-merkvertaling |
| action | #295813 | Gemeten groene websitenavigatie; bestaande kookacties |
| ink | #333333 | Gemeten websitetekst |
| muted | #68625e | Bestaande eigen webvertaling |
| surface | #ffffff | Website en appbeelden |
| canvas | #faf9f6 | Eigen warm neutraal oppervlak |
| line | #e9e6e2 | Eigen rustige grens |
| selected | #eef3e8 | Eigen vertaling van groene selectie |
| warning | #805015 op #fff4df | Eigen waarschuwingstoestand |
| spacing | 4, 8, 12, 16, 24, 32px | Webimplementatie; 8-punts uitgangspunt, halve stap toegestaan |
| radius | 8, 12, 16px | Webimplementatie geïnspireerd op zichtbare ronde kaarten |
| motion | 160ms | Eigen korte feedback, geen native meting |

Prijzen gebruiken tabular-nums. Productnaam circa 15px/600, verpakking 12–13px, prijs 20px/700. Het productbeeld gebruikt object-fit: contain: de hele verpakking blijft zichtbaar. Receptfoto’s mogen juist een vlak vullen. Geen gedeelde crop-regel voor beide.

## Componentinventaris

Deze inventaris dekt de publiek aantoonbare patronen en alle relevante onderdelen van onze toepassing. “Bestaand” betekent bruikbaar in deze codebase, niet dat een native Picnic-component één op één is geëxporteerd.

| Laag / patroon | Implementatie | Status en varianten |
| --- | --- | --- |
| Kleur, spacing, radius, prijsfont | tokens.css | Nieuw centraal tokencontract |
| Knop | components/ui/button.tsx | Bestaand; primary, outline, ghost, link, disabled |
| Tekstveld / multiline / label | components/ui/input, textarea, label | Bestaande toegankelijke form-foundation |
| Checkbox / radio / switch | components/ui + bestaande native formvelden | Bestaand; selectie en instellingen |
| Dialoog | components/ui/dialog.tsx | Radix focus trap, Escape, close en beschrijving |
| Meldingen / toast / voortgang | ui/alert, toast, progress; AdditionStatus | Bestaand |
| Tabs / filterchips | ui/tabs; bestaande navigatie | Bestaand fundament; exacte native chipmaten nog meten |
| ProductImage | components/picnic/catalog.tsx | Nieuw; compact/card, ontbrekend beeld, fout bij laden |
| ProductPrice | catalog.tsx | Nieuw; bedrag, onbekende prijs, voorwaardelijke prijs |
| ProductSummary | catalog.tsx | Nieuw; foto + naam + verpakking + prijs |
| MatchBadge | catalog.tsx | Nieuw; gekozen, waarschuwing, neutraal |
| QuantityStepper | catalog.tsx | Nieuw; min/max, directe invoer, leeg, disabled |
| ProductCard | catalog.tsx | Nieuw; gekozen, beschikbaar, disabled, uitleg en actie |
| ProductRail | catalog.tsx | Nieuw; horizontaal scrollen, snap, toetsenbordfocus |
| Ingrediënt/productregel | RecipeProducts | Aangepast; checkbox + behoefte + visuele productkeuze |
| Alternatievenkiezer | RecipeProducts + Dialog + ProductRail | Aangepast; passende producten, vervangingen, onbeoordeeld |
| Catalogusresultaten | PicnicPanel + ProductImage | Aangepast; echte foto naast productinformatie |
| Recepttegel / receptenlijst | RecipeWorkspace | Bestaand; verdere uitwerking na referentiemeting |
| Zoekveld / categorie / bottom navigation | bestaande frontend | Bestaande patronen, nog geen volledige native pariteit |
| Mandje / aankoopoverzicht | PicnicPanel, shopping-footer | Bestaand; mandje heeft nog geen imageId in DTO |
| Productdetail / galerij / voedingswaarden | backend PicnicProductDetails | Datafundament bestaat; geen nieuwe detail-UI in deze wijziging |
| Bezorgtijdselector / bezorgkaart | alleen openbare Picnic-referentie | Buiten onze huidige recept-naar-mandje-flow |
| Favorietknop / campagne / bundelbonus | publiek patroon, deels productdata | Nog geen exacte reconstructie; alleen tonen wanneer gegevens dat dragen |

## Productdata: meer visuele informatie ophalen

Ja: de bestaande zoekadapter bewaart `image_id` al als `PicnicProduct.imageId`. ShoppingCandidate draagt dat product naar de frontend. De foto ontbrak door presentatie, niet doordat we voor elk product opnieuw details moeten ophalen. De nieuwe component maakt de route die de geïnstalleerde catalogusservice ook gebruikt:

`https://storefront-prod.nl.picnicinternational.com/static/images/{imageId}/{size}.png`

Compacte foto’s gebruiken medium, kaarten large. imageId wordt URL-gecodeerd. Geen Picnic-authkey of accountgegevens in de URL; geen credentials naar het image-element. lazy loading, vaste beeldruimte, async decoding en een expliciete fallback voorkomen lege gaten en layoutverschuivingen. Een defecte oude src verhindert niet dat een nieuw imageId wordt geladen.

Productdetails bieden daarnaast omschrijving, informatiesecties en allergenen in het huidige DTO. De ruwe providerdata kan ook galerijbeelden, decoraties, eenheidsprijzen en promotie-informatie dragen; die moeten eerst expliciet genormaliseerd en met live responses gecontroleerd worden voordat we er badges of detailpagina’s aan verbinden. Volledige fusion/RSC-presentatieconfiguratie wordt nu niet rechtstreeks doorgegeven. Daardoor bewijst onze genormaliseerde productlijst geen toegang tot elk Picnic-scherm of intern design token.

De mandje-DTO mist imageId. Daarvoor is een aparte adapteruitbreiding of koppeling met de catalogus nodig; een artikel-ID is niet automatisch een afbeelding-ID. Productnamen zijn evenmin een veilige fotomapping. Geen willekeurige groentefoto bij een onbekend product.

## Gedrag en toegankelijkheid

Alternatieven blijven gegroepeerd op onze bestaande geschiktheidsbeoordeling. Een mooie kaart maakt een onbeoordeeld product niet automatisch selecteerbaar. Onbekende/voorwaardelijke prijzen en niet-exacte verpakkingshoeveelheden blijven geblokkeerd. Expliciet onbeschikbare artikelen en maxCount=0 zijn ook niet selecteerbaar. Een vervanging blijft een bewuste keuze en behoudt de bestaande bevestigingssemantiek.

Het aantalveld behoudt directe invoer, zodat grotere aantallen zonder herhaald klikken gekozen kunnen worden. Plus/min hebben benoemde knoppen en begrenzen tot min/max. Lege invoer blijft leeg: de checkoutcontrole vraagt om een geldig aantal. De bestaande bewaarde keuzes, portieberekening en idempotente toevoeging blijven in RecipeProducts.

Productrails gebruiken native overflow, zichtbare scrollbar en scroll-snap, zonder swipebibliotheek. Elke kaartactie is bereikbaar met Tab. De scrollregio heeft een toegankelijke naam. Dialog houdt focus binnen het venster en keert terug naar de opener. Mobiel wordt de ingrediënt/productregel één kolom; de rail laat een volgende kaart gedeeltelijk zien. Geen automatische animatie of carrouselrotatie.

## Bibliotheek gebruiken

Open `/design-system` voor de interactieve galerij: kleurstalen, knoppen, badges, hoeveelheidselector, compacte productkeuze en productrail. De galerij toont twee echte productnamen en imageId’s uit de lokale cataloguswaarneming, met expliciet als demonstratie gemarkeerde prijzen en states. Het imageId-veld maakt ook de ontbrekende en defecte afbeeldingsstates controleerbaar. De galerij doet geen accountrequests en heeft geen mandje-effecten.

Importeer componenten uit `@/components/picnic/catalog`. Zet ruwe API-data om via de bestaande workeradapter en geef PicnicProduct door. Businesslogica hoort niet in ProductCard. De component toont informatie en roept onChoose aan; de pagina beslist of de keuze geldig is.

## Exact één-op-één namaken: resterend bewijs

Voor pixelpariteit zijn per scherm actuele schaalvaste referenties nodig. Vastleggen: land/accountcontext, iOS of Android, appversie, viewport, tekstschaal, scherm en toestand. De openbare promotiescreenshots zijn voldoende voor patroononderzoek maar niet voor betrouwbare exacte afmetingen.

1. Productzoekresultaten: normale kaart, aanbieding, staffelprijs, uitverkocht, lange naam, geen foto.
2. Productdetail: galerij, ingrediënten/allergenen, voedingswaarden, alternatieven en aantal.
3. Mandje: geselecteerd product, wijzigingen, fout en voorraadstatus.
4. Recepten: zoekveld, chips, opgeslagen lijst, detail en ingrediëntenkeuze.
5. Shell: tabs, overlay, keyboard, sticky onderbalk en drukke/loading/empty states.

Meet daarna fonts, spacings, iconen, radius en states in die concrete referenties; pas de centrale tokens aan en vergelijk screenshots op dezelfde viewport. Tot dat moment zijn de eigen radius-/spacingwaarden expliciete implementatiekeuzes. De huidige library levert het herbruikbare fundament en lost de gemelde tekst-only productweergave op; zij claimt geen complete export van alle actuele Picnic-componenten.

## Uitgevoerde verificatie

- TypeScript frontendcontrole, gerichte ESLint-controle en productiebuild geslaagd.
- Browser: echte Picnic-imageId’s uit de lokale catalogus geladen; naturalWidth > 0 voor alle vijf getoonde afbeeldingen.
- Kaartselectie verplaatst de gekozen status en wisselt de actie naar “Behoud dit product”.
- Plusknop verandert aantal 1 naar 2; min is bij 1 uitgeschakeld.
- Leeg imageId geeft een fallback; herstel naar een geldig ID laadt opnieuw de foto.
- Mobiel 390px: documentbreedte 390px, productrail 342px met 882px scrollbreedte. De rail scrollt intern en veroorzaakt geen brede pagina.
- HTML verwijst naar de lokale Picnic-PNG-favicon; ook fallback favicon.ico vervangen.
- Geen aankoop gestart. De componentgalerij is visueel getest; een volledige ingelogde recept-naar-mandje-flow is in deze wijziging niet uitgevoerd.
