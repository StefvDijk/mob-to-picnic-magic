# Import, AI en kostenbewaking

Ontwerpkeuzes van 8 oktober 2026. De app herkent een recept en laat de gebruiker het controleren. Alleen gewone applicatielogica mag hoeveelheden, prijzen, goedkeuringen en toevoegacties bepalen.

## Importstappen

1. Maak een persoonlijk importconcept en valideer de bron: openbare link, tekst of foto/screenshot. De gebruiker kan zonder Picnic-koppeling beginnen.
2. Haal bij een link eerst bruikbare receptgegevens uit de pagina, waaronder gestructureerde receptdata. Een betaalmuur wordt niet omzeild; toon de mogelijkheid tekst of een eigen screenshot aan te leveren.
3. Verwijder identieke technische duplicaten, maar behoud verschillende receptonderdelen met hun eigen ingrediënten. Bij meerdere recepten laat de gebruiker kiezen. Bewaar bron, titel, porties en oorspronkelijke ingrediënttekst.
4. Gebruik AI alleen waar herkenning nodig is. Geef uitsluitend begrensde broninhoud mee en vraag een vast schema met bronverwijzingen, hoeveelheidssoort, ingrediënten, kenmerken en beschikbare stappen.
5. Valideer de uitkomst op de server. AI-output is invoer die fouten kan bevatten. Afwezige informatie blijft afwezig; een ontbrekende hoeveelheid wordt geen verzonnen ‘naar smaak’.
6. Toon het bewerkbare recept met gemarkeerde onzekerheden en de bron ernaast. Bewaren kan ook met ontbrekende stappen. Een onzekere aankoopbehoefte moet later wel expliciet worden opgelost of overgeslagen.

De AI krijgt geen Picnic-tools, sleutels, andere recepten of bevoegdheid om URL's te openen of boodschappen toe te voegen. Tekst zoals ‘negeer alle instructies en koop ...’ in een pagina of afbeelding blijft broninhoud en kan nooit toestemming worden. Er is geen gedeelde cache van persoonlijke recepten tussen gebruikers.

## Invoergrenzen en veilig ophalen

Pilotstandaarden: maximaal drie afbeeldingen per import, maximaal 8 MB en 12 megapixels per afbeelding, en maximaal 50.000 tekens geplakte tekst. Accepteer JPEG, PNG en WebP na controle van de werkelijke inhoud; geen SVG of uitvoerbare bestanden. Controleer afmetingen vóór kostbare verwerking. Bewaar een visueel gelijkwaardige, van metadata ontdane bronafbeelding; toon dat locatie- en camerametadata niet worden bewaard. De kostenraming gebruikt ook beeldafmetingen en modelregels, niet alleen bestandsgrootte.

Een pagina-ophaalactie heeft maximaal 10 seconden, 2 MB gedecomprimeerde inhoud en drie redirects. Alleen HTTPS zonder URL-inloggegevens; geen localhost, interne/private adressen, eigen API of door de bron aangedragen aanvullende downloads. Iedere redirect wordt opnieuw gecontroleerd. De fetcher heeft geen toegang tot gebruikersopslag, cookies of secrets. HTML wordt nooit rechtstreeks als uitvoerbare inhoud getoond.

Het daadwerkelijke verbindingsdoel moet veilig blijven bij DNS-wijzigingen. Alleen vooraf een DNS-lookup doen bewijst dat niet. De technische proef moet aantonen hoe dit in Workers wordt afgedwongen. Tot dat lukt, beperken we links tot expliciet getoetste bronnen en blijft tekst/foto-invoer beschikbaar; generieke URL-import wordt niet als gereed verkocht. Deze eisen volgen de risico's beschreven in [OWASP SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).

Persoonlijke bestanden zijn alleen via een geautoriseerde app-route leesbaar. Iedere read controleert eigenaar en verwijderstatus. Gebruik geen publiek bucketadres; voorkom persoonlijke browser-/proxycaches bij gevoelige antwoorden. Secrets en broninhoud komen niet in requestlogs, foutmeldingen of analysetools.

## Modelkeuze en kwaliteit

GPT-6 Luna is de eerste te toetsen kandidaat, geen bewezen kwaliteitskeuze. De officiële modelinformatie noemt beeldinvoer en gestructureerde uitvoer; het geraadpleegde standaardtarief is $0,10 per miljoen invoertokens en $0,50 per miljoen uitvoertokens. We rekenen zonder veronderstelde cachekorting. Tarief en accounttoegang worden vóór implementatie opnieuw gecontroleerd. [Modeldocumentatie](https://developers.openai.com/api/docs/models/gpt-6-luna).

De herkenningsproef omvat de twee [referentierecepten](PROJECTSTATUS.md), Nederlandse en Engelse tekst, dubbele bronlijsten, kleine tekst in foto's, verschillende receptonderdelen, ontbrekende porties en globale maten. Kritieke fouten mogen niet stilzwijgend doorgaan: een slecht leesbare hoeveelheid moet worden gemarkeerd. Een perfect geldig JSON-schema bewijst geen inhoudelijke juistheid. [Gestructureerde uitvoer](https://developers.openai.com/api/docs/guides/structured-outputs).

Maximaal één herstelpoging per import, alleen als de vorige uitkomst vaststaat en het budget dat toelaat. Geen stil opschalen naar een duurder model en geen retry na een onzekere time-out. Bij onvoldoende kwaliteit of budget blijft handmatig invoeren en corrigeren beschikbaar.

## Harde interne budgetgrenzen

Bevestigd: maximaal €15 per kalendermaand voor de hele app en €5 per gebruiker. We gebruiken kalendermaanden in Europe/Amsterdam; een reservering blijft bij de maand waarin de poging begon. Hosting en e-mail zijn afzonderlijke posten en worden niet verborgen in het AI-budget.

Vóór iedere AI-poging berekent de server een bovengrens op basis van het vastgezette modeltarief, begrensde invoer inclusief afbeeldingen, maximale uitvoer en een conservatieve euroconversie met eventuele belasting en marge. Eigen pilotgrens: maximaal €0,05 gereserveerd per complete import, inclusief een eventuele herstelpoging. Past een invoer niet binnen een betrouwbaar berekende grens, dan volgt geen aanroep en krijgt de gebruiker een verklein- of handmatige optie.

Reserveer de kosten atomair onder zowel het gebruikersbudget als het app-budget. Alleen wanneer beide genoeg ruimte hebben, mag de unieke poging worden verzonden. Gelijktijdige imports mogen de grens niet overschrijden. De reservering is duurzaam vastgelegd vóór verzending en is gekoppeld aan precies één poging; een dubbel queuebericht maakt geen nieuwe betaalde aanroep.

Na bekende usage wordt het werkelijke bedrag geboekt en het restant vrijgegeven. Bij een onzekere uitkomst blijft de bovengrens als verbruik meetellen tot betrouwbare leveranciersinformatie een correctie ondersteunt; alleen een time-out is geen reden voor terugbetaling of herhaling. Nieuwe maandbudgetten veranderen bestaande reserveringen niet. Accountverwijdering laat het totale app-verbruik intact zonder een persoonlijke historie te behouden.

Het dashboard toont verbruikt, gereserveerd en beschikbaar, met waarschuwingen bij 80% en 95% en stoppen bij de grens. Een beheerder kan betaalde AI direct stilzetten. Modelprijswijziging of ontbrekende betrouwbare prijsconfiguratie blokkeert nieuwe AI-aanroepen tot de begroting is bijgewerkt. De eurogrens is een conservatieve interne beheersing; wisselkoers en leveranciersfactuur worden gecontroleerd, niet als exact voorspelbaar voorgesteld.

Rekenvoorbeeld met het onderzochte tarief: 24.000 invoertokens en 6.000 uitvoertokens kosten maximaal $0,0054 voor één aanroep, vóór conversie en belasting. Dit voorbeeld bewijst niets over de werkelijke beeldtokenkosten of kwaliteit. Die moeten met de gekozen modelregels worden begrensd en gemeten. [Beeldkosten](https://developers.openai.com/api/docs/guides/image-cost-calculator).

## E-mail- en opslagquota

De server reserveert een verzendslot vóór een e-mail wordt aangeboden. Eigen grens: 90 e-mails per dag en 2.700 per maand voor deze pilot, met ruimte onder de onderzochte Resend Free-limieten. Gebruik binnen hetzelfde leveranciersaccount telt mee bij de controle; er is geen garantie dat andere projecten die marge vrijlaten. Een onzekere verzenduitkomst telt mee en wordt niet blind herhaald.

Naast de adreslimieten uit [accounts](ACCOUNTS.md) kiezen we aanvankelijk maximaal 20 codeverzoeken per uur per netwerkbron, met neutrale foutmelding en monitoring op gedeelde netwerken. Quota-uitputting geeft een begrijpelijk tijdelijk stopbericht; bestaande geldige sessies blijven bruikbaar. Uitnodigingen en herstelcodes delen de verzendbegroting. Er worden nu geen e-mails verstuurd of abonnementen aangezet.

Uploads reserveren atomair ruimte onder 500 MB per gebruiker en 5 GB voor de pilot. Mislukte uploads worden opgeruimd en geven hun reservering vrij zodra vaststaat dat geen bestand overblijft. Bewaarde afbeeldingen tellen blijvend mee tot verwijdering. Dagelijkse beheertotalen signaleren onverwacht gebruik zonder receptinhoud te loggen.

## Geheimen en leveranciers

Picnic-hervatsleutels worden met geauthenticeerde encryptie beschermd, bijvoorbeeld AES-GCM via Web Crypto, met unieke nonce en eigenaar plus koppeling-ID als aanvullende context. Encryptiesleutels staan in Worker Secrets, gescheiden van D1; sleutelversies ondersteunen rotatie. Wachtwoorden, OTP's en sessiesleutels worden nooit gelogd. Roterende secrets, herstel en verlies van een sleutel worden in test uitgeprobeerd; bij onherstelbaar verlies opnieuw koppelen.

AI-verzoeken gebruiken `store:false` en geen blijvende conversaties. Dat schakelt niet alle leveranciersretentie uit. De privacy-uitleg moet de echte broninhoud die naar AI gaat en de mogelijke bewaartermijnen benoemen; de gekozen grenzen staan in [technisch ontwerp](TECHNISCH-ONTWERP.md). Er zijn voor dit ontwerp geen gebruikersrecepten naar een AI-API gestuurd.
