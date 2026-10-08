# Accounts en inloggen

Ontwerp bijgewerkt op 8 oktober 2026. Dit onderdeel volgt op de vastgelegde gebruikerskeuzes voor productselectie. Gebruikersafspraken en door Codex gekozen standaardinstellingen staan afzonderlijk vermeld; er zijn nog geen accountfuncties op basis hiervan gebouwd. De gebruiker heeft gevraagd gewone ontwerpkeuzes zelfstandig te maken.

## Reeds afgesproken

- Privépilot voor maximaal tien mensen. De gekozen capaciteitsregel hieronder telt de beheerder mee.
- Iedereen heeft een vast persoonlijk app-account en een eigen Picnic-koppeling. Recepten en voorkeuren blijven bij hetzelfde account horen, ook na uitloggen of opnieuw inloggen.
- Inloggen in de app met een tijdelijke code via e-mail.
- Op het eigen apparaat ingelogd blijven tussen bezoeken; niet bij elk bezoek opnieuw een e-mailcode vragen. De gekozen sessieduur staat hieronder.
- App-inloggen en Picnic koppelen zijn afzonderlijke handelingen.
- De beheerder ziet accounts, gebruik, kosten en foutstatus. Receptinhoud wordt alleen bij feedback zichtbaar als de gebruiker die bewust deelt.

## Bevestigde toegang en uitnodigingen

Stef beheert de uitnodigingen. Een uitnodiging is gekoppeld aan één specifiek e-mailadres. De ontvanger krijgt pas toegang na verificatie met een e-mailcode voor dat adres; een doorgestuurde uitnodigingslink geeft iemand met een ander adres geen toegang.

Een gebruiker mag met een geverifieerd app-account alvast recepten importeren, bewaren en bewerken. Picnic koppelen is pas nodig voor persoonlijke productinformatie, het mandje en toevoegen. Het app-e-mailadres hoeft niet hetzelfde te zijn als het e-mailadres van het eigen Picnic-account.

De e-mailcode is een tijdelijk inlogmiddel voor een blijvend account. Een nieuwe code maakt geen nieuw account; na verificatie komt de gebruiker terug bij de eigen recepten en voorkeuren. De levensduur van het account staat los van de tijd dat een apparaat ingelogd blijft. Er zijn geen uitnodigingen verstuurd of accounts aangemaakt.

## Bevestigd gedrag bij terugkomst

Op het eigen apparaat blijft de app-sessie tussen bezoeken behouden zolang die geldig is. Het sluiten en opnieuw openen van de app vraagt dus niet op zichzelf om een nieuwe e-mailcode. Als opnieuw inloggen nodig is, krijgt de gebruiker toegang tot hetzelfde vaste account met de bewaarde recepten en voorkeuren.

De app-sessie en de Picnic-koppeling hebben een afzonderlijke status: ingelogd blijven in de app garandeert niet dat Picnic nooit opnieuw gekoppeld hoeft te worden.

## Gekozen standaardinstellingen voor toegang

Dit zijn ontwerpkeuzes van Codex binnen de gedelegeerde ruimte. De genoemde getallen zijn pilotinstellingen, geen voorgeschreven beveiligingsnormen.

| Onderdeel | Standaard en reden |
| --- | --- |
| App-sessie | Maximaal 30 dagen vanaf inloggen; eerder verlopen na 14 dagen zonder gebruik. Dit ondersteunt wekelijks gebruik en begrenst ongebruikte toegang |
| Gevoelige handelingen | Een e-mailverificatie van maximaal 10 minuten oud voor accountverwijdering, vervangen van de Picnic-koppeling en beheerhandelingen zoals uitnodigen en blokkeren |
| Inlogcode | Zes willekeurige cijfers, 10 minuten geldig, eenmalig, maximaal vijf pogingen per code. Een nieuwe code maakt de vorige ongeldig; opnieuw versturen reset niet de limieten per account |
| Versturen | Minimaal 60 seconden tussen codes, maximaal vijf per uur per adres. Aanvullende limieten per netwerkbron en voor het gehele systeem voorkomen omzeiling; precieze waarden worden in de integratietest afgestemd |
| Uitnodiging | Zeven dagen geldig, eenmalig en aan het geverifieerde e-mailadres gebonden. Maximaal tien actieve accounts inclusief de beheerder; uitstaande uitnodigingen reserveren een beschikbare plek |
| Nieuwe browser | Opnieuw inloggen met e-mailcode; bestaande sessies op andere apparaten blijven geldig tot uitloggen, verlopen of intrekken |

Sessies worden op de server gecontroleerd en kunnen daar direct worden ingetrokken. De browser krijgt een beveiligde HttpOnly-cookie met Secure en SameSite=Lax; schrijfacties controleren ook de herkomst en hebben CSRF-bescherming. App-sessiesleutels komen niet in localStorage. Onbekende adressen en toegestane adressen krijgen dezelfde neutrale reactie op een codeverzoek. De code wordt niet leesbaar opgeslagen of gelogd. De gekozen implementatie gebruikt een keyed HMAC met een afzonderlijk serversecret om korte codes tegen offline raden op alleen een databasekopie te beschermen.

Deze beveiligingsmechanismen sluiten aan bij [OWASP over sessiebeheer](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). De regels voor eenmaligheid, verval en verzoeklimieten gebruiken ook principes uit [OWASP over herstelcodes](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html); die bron gaat over wachtwoordherstel en bewijst niet op zichzelf de veiligheid van onze e-mailinlogflow. De gekozen termijnen zijn onze eigen afweging voor de pilot.

## Picnic koppelen in de interface

De gebruiker wil een toegankelijke manier om Picnic-gegevens in te voeren en noemt daarvoor een popup. De voorgestelde uitwerking is een venster binnen de app met de titel ‘Koppel je Picnic-account’; op mobiel kan dit schermvullend worden weergegeven. Het is herkenbaar een koppeling vanuit deze app en wordt niet voorgesteld als een officiële Picnic-inlogpagina.

Het venster vraagt om het e-mailadres en wachtwoord van het eigen Picnic-account. Als Picnic aanvullende verificatie vereist, volgt daarvoor een aparte stap in dezelfde flow. Na een bevestigde koppeling toont de app de koppelstatus. De precieze verificatiestappen en sessiehervatting moeten nog met de gekozen wrapper worden gevalideerd.

De voorgestelde toegankelijkheidseisen zijn zichtbare veldlabels, ondersteuning voor wachtwoordmanagers, een toon/verberg-knop bij het wachtwoord, toetsenbordbediening, correct focusbeheer en begrijpelijke foutmeldingen bij het betreffende veld. Sluiten of annuleren laat de gebruiker terugkeren naar het recept zonder de invoer daarvan te verliezen. Wachtwoorden worden niet opnieuw getoond na het sluiten.

Voor de technische uitwerking blijft het uitgangspunt: het Picnic-wachtwoord alleen gebruiken om te koppelen, niet blijvend opslaan; een eventuele hervatbare sessiesleutel afzonderlijk beschermen. Uitloggen uit de app of een verlopen Picnic-koppeling verwijdert het vaste app-account en de recepten niet.

## Bevestigd accountbeheer

Stef kan uitnodigingen versturen en intrekken, en toegang van een bestaande gebruiker blokkeren. Blokkeren beëindigt de app-toegang, inclusief bestaande app-sessies, en verhindert nieuwe toevoegacties. Het verwijdert niet automatisch recepten of het account. Wat al naar Picnic is verstuurd, kan hiermee niet als ongedaan gemaakt worden beschouwd; lopende acties krijgen afzonderlijke herstelregels.

Gebruikers krijgen afzonderlijke acties voor uitloggen op dit apparaat, uitloggen op alle apparaten, Picnic ontkoppelen en het eigen account verwijderen. Ontkoppelen bewaart recepten en voorkeuren, maar stopt het gebruik van de Picnic-koppeling vanuit deze app. Accountverwijdering krijgt een eigen bevestiging en volgt het onderstaande bevestigde beleid; de gekozen technische verwijderdoelen staan hieronder en moeten vóór de pilot worden beproefd.

Deze verdeling van het accountbeheer is bevestigd. Blokkeren, uitloggen, ontkoppelen en verwijderen blijven afzonderlijke handelingen met verschillende gevolgen.

## Bevestigde accountverwijdering

Na een duidelijke bevestiging stopt de toegang direct en wordt de Picnic-koppeling vanuit deze app beëindigd. Het verwijderproces wist het persoonlijke app-account, recepten, bronuploads, productvoorkeuren en bijbehorende persoonlijke historie. Alleen werkelijk niet tot de gebruiker herleidbare totalen, bijvoorbeeld totaalgebruik van de app, mogen behouden blijven.

Het verwijderen van het app-account verwijdert geen Picnic-account en maakt bestaande boodschappen in het Picnic-mandje niet ongedaan. De interface maakt dit onderscheid duidelijk voordat de gebruiker bevestigt.

Dit verwijderbeleid is bevestigd. De technische verwijderdoelen staan hieronder; het datamodel en betrouwbaarheidsontwerp behandelen gedeelde feedback en lopende acties. De werking bij back-ups en externe verwerkers moet vóór de pilot worden beproefd. De app mag pas melden dat gegevens verwijderd zijn wanneer dat aantoonbaar klopt; direct gestopte toegang is niet hetzelfde als reeds voltooide gegevensverwijdering. Deze afspraak betreft het ontwerp; er zijn geen bestaande accounts of gegevens verwijderd.

## Bevestigd bewaren van bronafbeeldingen

Bewaar de aangeleverde receptfoto of screenshot bij het recept, zodat de gebruiker later de herkenning en oorspronkelijke hoeveelheden kan controleren. De gebruiker kan de afbeelding afzonderlijk verwijderen zonder het herkende recept kwijt te raken. Bij het verwijderen van het recept wordt ook de bijbehorende bronafbeelding verwijderd wanneer die niet meer bij een ander bewaard recept hoort; accountverwijdering omvat alle eigen bronuploads.

Dit bewaren is bevestigd. Afbeeldingen zijn alleen voor de eigenaar beschikbaar, behalve wanneer deze ze bewust met feedback deelt. Na afzonderlijke verwijdering blijft de tekstuele bronvermelding bestaan, maar toont de app geen werkende afbeeldinglink meer.

## Gekozen bewaartermijnen

De volgende termijnen zijn ontwerpdoelen van Codex, te toetsen aan de gekozen opslag en leveranciers vóór de pilot. Het zijn geen juridische uitspraken of reeds werkende garanties.

| Gegevens | Bewaarbeleid |
| --- | --- |
| Bewaarde recepten, voorkeuren en bijbehorende afbeeldingen | Tot de gebruiker ze verwijdert of het account verwijdert; inactiviteit alleen verwijdert geen recepten |
| Niet opgeslagen of mislukte imports met uploads | Zeven dagen na de laatste bewerking; de interface toont wanneer een concept vervalt |
| Voorstellen en persoonlijke toevoeggeschiedenis | 90 dagen, zodat fouten en recente toevoegingen kunnen worden teruggevonden; accountverwijdering gaat voor |
| Technische foutlogs | 14 dagen; geen receptinhoud, afbeeldingen, e-mailcodes, wachtwoorden of sessiesleutels |
| Beveiligings- en beheerlog | 30 dagen met minimale gegevens; herleidbare gegevens vallen ook onder accountverwijdering |
| Bewust gedeelde feedback met inhoud | 90 dagen; eerder verwijderen op verzoek of bij accountverwijdering |
| Verwijderde persoonlijke gegevens in eigen actieve opslag | Direct ontoegankelijk; verwijdering afronden binnen 24 uur als uitvoerbaar ontwerpdoel |
| Back-ups met verwijderde gegevens | Maximaal 30 dagen uitfaseren; bij herstel verwijderingen opnieuw toepassen voordat toegang wordt heropend |

Een verwijdertaak houdt noodzakelijke verwijzingen afgeschermd zolang de verwijdering bij opslag, back-ups en externe verwerkers wordt afgehandeld. Daarna worden die verwijzingen ook verwijderd. Leverancierslogs zijn afzonderlijk begrensd: Cloudflare-mailretentie moet bij inrichting worden gecontroleerd; OpenAI kent standaard maximaal 30 dagen misbruikmonitoring met uitzonderingen. De 24 uur geldt daarom voor onze eigen actieve opslag, niet als algemene toezegging over alle leveranciers. De privacy-uitleg en leverancierscontrole moeten dit vóór de pilot afdekken; zie [technisch ontwerp](TECHNISCH-ONTWERP.md). ‘Anoniem’ betekent niet slechts dat een gebruikers-ID is gehasht; bij tien gebruikers kunnen gedetailleerde tijdstippen en kosten nog steeds herleidbaar zijn. Bewaar daarom alleen grove totalen zonder individuele tijdlijn als blijvende statistiek.

Picnic ontkoppelen maakt de opgeslagen koppeling direct onbruikbaar voor deze app en verwijdert de eigen sessiesleutel. Intrekken bij Picnic zelf wordt alleen als geslaagd getoond als de API dat werkelijk ondersteunt en bevestigt.

## Nog technisch bewijzen

1. De gekozen authenticatieoplossing toetsen op de bovenstaande instellingen, intrekken van sessies en gelijktijdige verzoeken.
2. De Picnic-koppelflow technisch valideren, inclusief aanvullende verificatie, hervatten zonder opgeslagen wachtwoord en opnieuw koppelen.
3. De bewaartermijnen toetsen aan actieve opslag, back-ups en externe verwerkers en een verwijderproef ontwerpen.
4. Lopende toevoegacties bij blokkeren, uitloggen of ontkoppelen afhandelen volgens [betrouwbaarheid](BETROUWBAARHEID.md).

Better Auth met D1 en Cloudflare Email Service zijn gekozen. Cloudflare-mail vervangt de eerdere Resend-keuze op verzoek van de gebruiker. Uitnodigingen activeren een vooraf aangemaakte inactieve identiteit; publieke signup staat uit. Absolute sessieduur en inactiviteit worden aanvullend bewaakt en cookie-sessioncache blijft uit voor directe intrekking. De implementatie wordt pas toegelaten nadat deze afspraken technisch zijn bewezen; zie [bouwfase 0](BOUWPLAN.md).
