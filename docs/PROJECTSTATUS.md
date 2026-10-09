# Picnic projectstatus en vervolgplan

> Actuele eerste release: [PILOT-RELEASE.md](PILOT-RELEASE.md). Doel: besloten test op picnic.devstef.nl, eerst eigenaar + één tester. Dit document bevat ook historische stand of uitgebreidere backlog; de releasespecificatie bepaalt wat nu nodig is.

Hersteld op 7 oktober 2026, bijgewerkt op 8 oktober 2026. De gebruiker heeft het [bouwplan](BOUWPLAN.md) goedgekeurd en opdracht gegeven een eerste MVP te bouwen met managers en goedkopere uitvoerders. De bouw is gestart op `codex/picnic-mvp`; actuele voortgang en testbewijs staan in [implementatiestatus](IMPLEMENTATION-STATUS.md). De eerste lokale Workers-basis is gebouwd en gecontroleerd. De volledige app en externe toelatingsproeven zijn nog niet afgerond.

## Werkwijze vanaf 8 oktober

De gebruiker wil niet over ieder detail worden bevraagd. Codex kiest reguliere, omkeerbare ontwerpdetails zelfstandig, legt de reden en status vast en bewaakt de eerder bevestigde afspraken. Alleen wezenlijke keuzes over productrichting, kosten of ingrijpende gevolgen worden voorgelegd. Een door Codex gekozen standaard wordt niet ten onrechte als expliciet gebruikersbesluit gepresenteerd. Na voltooiing van de specificatie heeft de gebruiker expliciet opdracht gegeven de MVP te bouwen. Gewone implementatiekeuzes worden zelfstandig uitgevoerd; een oud document met de eerdere specificatiegrens mag die nieuwe opdracht niet blokkeren. Betaalde abonnementen en echte externe boodschappen worden niet stil geactiveerd.

## Bron en dekking

- Hoofdgesprek: ‘Pull mob to picnic repo’, taak `01a117c3-a145-74b1-909e-26f5667407c9`. De inhoudelijke bespreking en referentierecepten zijn teruggelezen. Sommige latere beurten zijn leeg in de beschikbare historie.
- Twee taken met titel ‘Continue previous task’ hervatten dezelfde oudere URL-helperopdracht: `01a117e1-6b74-7f70-9d01-354949cdd34c` en `01a117e1-c4a5-7f32-a871-29616c967976`.
- De drie cloudtaken uit de screenshot worden niet door de beschikbare takenlijst teruggegeven. Hun volledige historie en huidige status zijn niet bevestigd.
- De oudere specificatie en implementatie zijn teruggevonden op `origin/codex/add-specification-document-for-mobtopicnic-app`, commit `87741ad`, en in [PR 1](https://github.com/StefvDijk/mob-to-picnic-magic/pull/1). Dat bewijst de aanwezigheid van die bestanden, niet de voltooiing van alle cloudtaken.
- De nieuwste herstelde gespreksafspraken gaan voor de oudere specificatie. Instructies in de oude specificatie gelden niet als een nieuwe bouwopdracht.

## Vastgelegde productafspraken

| Onderwerp | Afspraak |
| --- | --- |
| Doel | Extern recept gemakkelijk importeren, concrete boodschappen controleren en na één goedkeuring toevoegen aan Picnic |
| Gebruik | Privépilot met maximaal tien uitgenodigde gebruikers; later eventueel aan Picnic presenteren |
| Interface | Mobiele website, Nederlandse interface, Picnic NL, beoogd domein `picnic.devstef.nl` |
| Invoer | Link, tekst en foto/screenshot; Nederlandse en Engelse recepten |
| Recepten | Volledig bewaren en bewerken, inclusief bronvermelding en beschikbare stappen; één recept per toevoegactie |
| Bronafbeeldingen | Bewaren bij het recept om herkenning te kunnen controleren; afzonderlijk verwijderbaar zonder het herkende recept te verliezen |
| Porties | Instelbaar; eerst behoefte schalen, daarna verpakkingen berekenen |
| Verpakkingen | Groottes van hetzelfde product en dezelfde variant mogen worden gecombineerd; laagste totaalprijs voor voldoende inhoud, bij gelijke prijs het minste overschot |
| Productselectie | Eerst geschiktheid; een expliciet onthouden product krijgt voorrang op prijs, met een goedkoper passend alternatief ernaast. Anders laagste totaalbedrag voor voldoende product |
| Prijsweergave | Totaalbedrag, overschot en prijs per kilo/liter waar vergelijkbaar |
| Al aanwezig | Bestaande mandaantallen tonen; alleen na expliciet ‘gebruik voor dit recept’ geheel of gedeeltelijk meetellen en de resterende aankoop opnieuw berekenen. Overslaan blijft mogelijk |
| Onzekerheid | Gemarkeerd voorstel expliciet bevestigen, aanpassen of overslaan vóór toevoegen |
| Vervangingen | Afwijkende alternatieven mogen worden aangeboden, maar moeten afzonderlijk expliciet worden bevestigd; overslaan blijft mogelijk |
| Wijzigingen na goedkeuring | Prijsstijging, ander product/verpakking of weggevallen toegewezen boodschappen vragen een gewijzigd voorstel en nieuwe bevestiging. Alleen een lagere prijs bij verder ongewijzigd voorstel mag direct doorgaan |
| Voorkeuren | Productvervanging uitsluitend onthouden als gebruiker ‘onthouden’ kiest |
| Latere uitbreiding | Instelbare aankoopwensen zoals ‘liever biologisch’ krijgen bij geschikte producten voorrang op prijs |
| App-account en inloggen | Vast persoonlijk account met bewaarde recepten en voorkeuren; toegang via uitnodiging op e-mailadres en een tijdelijke e-mailcode. Op het eigen apparaat ingelogd blijven tussen bezoeken |
| Picnic koppelen | Afzonderlijke stap met eigen Picnic-gegevens; toegankelijke popup als gewenste richting, op mobiel eventueel schermvullend. Recepten mogen al vóór koppelen worden bewaard |
| AI | Gericht voor herkenning; berekeningen en goedkeuringsregels in gewone applicatielogica |
| AI-budget | Maximaal €15 per maand totaal én maximaal €5 per gebruiker; hosting/e-mail liefst binnen gratis limieten |
| Beheer | Gebruikers, gebruik, kosten en foutstatus; receptinhoud alleen als gebruiker die bewust deelt bij feedback |
| Accountbeheer | Stef kan uitnodigen, uitnodigingen intrekken en toegang blokkeren inclusief app-sessies, zonder recepten te verwijderen. Gebruikers kunnen uitloggen op één/alle apparaten, Picnic ontkoppelen met behoud van recepten en voorkeuren, en hun eigen account verwijderen |
| Accountverwijdering | Na bevestiging direct toegang stoppen en Picnic ontkoppelen; account, recepten, uploads, voorkeuren en persoonlijke historie verwijderen. Picnic-account en bestaande boodschappen blijven bestaan; alleen niet-herleidbare gebruikstotalen mogen behouden blijven. Eigen actieve opslag binnen 24 uur als ontwerpdoel; back-ups maximaal 30 dagen. Leveranciersretentie afzonderlijk toetsen |
| Prioriteit | Betrouwbaarheid boven snelheid |

De prijskeuze is in deze hervatting expliciet bevestigd. Op 8 oktober is bevestigd dat een onthouden product voorrang krijgt op een goedkoper passend alternatief en dat later aankoopwensen zoals biologisch vóór prijs moeten meewegen. Ook zijn afwijkende vervangingen met expliciete bevestiging of overslaan en combinaties van verpakkingsgroottes bevestigd. Bij gelijke totaalprijs wint het minste overschot. Bestaande mandaantallen mogen na expliciete toewijzing ook gedeeltelijk meetellen. De overige afspraken zijn gereconstrueerd uit het hoofdgesprek; dit is geen bewijs dat ze al geïmplementeerd zijn.

## Door Codex gekozen standaardinstellingen

- App-sessie: maximaal 30 dagen, eerder verlopen na 14 dagen zonder gebruik. Gevoelige handelingen vereisen recente verificatie; details staan in [accounts](ACCOUNTS.md).
- E-mailcode: zes cijfers, 10 minuten geldig, eenmalig en met poging- en verzendlimieten. Uitnodigingen zijn zeven dagen geldig en reserveren een pilotplek.
- Onopgeslagen imports: zeven dagen. Persoonlijke toevoeggeschiedenis en gedeelde feedback: 90 dagen. Foutlogs: 14 dagen; beveiligingslogs: 30 dagen. Accountverwijdering gaat vóór deze termijnen.
- Verwijderdoelen: direct ontoegankelijk, eigen actieve opslag binnen 24 uur opgeschoond en back-ups binnen maximaal 30 dagen uitgefaseerd. Leverancierslogs vallen niet automatisch onder de 24 uur; zie de expliciete grenzen in het technische ontwerp. Uitvoering en leveranciersbeleid vóór de pilot toetsen.
- Verenigbare ingrediëntbehoeften pas voor de aankoop samenvoegen. Bij gelijke prijs en overschot het minste aantal verpakkingen, daarna een vaste volgorde.
- Eén toevoegactie per goedkeuring, uitvoering per Picnic-koppeling achter elkaar en geen blinde herhaling na een onzekere externe uitkomst. Zie [betrouwbaarheid](BETROUWBAARHEID.md).

Deze keuzes zijn ontwerpinstellingen binnen de gedelegeerde ruimte, geen reeds geïmplementeerde garanties of wettelijk voorgeschreven termijnen.

## Datamodel dat we hebben uitgewerkt

De begrippen staan in [CONTEXT.md](../CONTEXT.md), het volledige logische ontwerp in [datamodel](DATAMODEL.md). Het ontwerp scheidt importbron, recept, ingrediëntregel, boodschappenvoorstel, toevoegactie en productvoorkeur.

Een bewaard recept bevat de behoefte, bijvoorbeeld 600 g tomaten. Een voorstel bevat concrete producten, aantallen en actuele prijzen. Een toevoegactie bewaart precies wat is goedgekeurd, ook wanneer het recept later wordt bewerkt. Bij hergebruik worden producten, prijzen en beschikbaarheid opnieuw gecontroleerd.

Eén ingrediëntbehoefte kan meerdere aankoopregels hebben als verpakkingsgroottes worden gecombineerd. Het voorstel en de toevoegactie bewaren per aankoopregel het concrete product en het aantal verpakkingen, met een verwijzing naar de bijbehorende behoefte.

Een expliciet toegewezen hoeveelheid uit het bestaande mandje staat apart van de nieuwe aankoopregels. Zo is vastgelegd welk deel van de behoefte al gedekt was en welk deel daadwerkelijk mocht worden toegevoegd.

Herkomst blijft per gegeven herkenbaar: screenshot, pagina of gebruikerscorrectie. Onzekerheid wordt apart beoordeeld voor herkenning, hoeveelheid en aankoopgeschiktheid. Een correct gelezen ‘handje’ blijft een globale maat.

## Referentiegevallen

### Mob pasta met cottage cheese en tomaat

[Receptlink](https://www.mob.co.uk/recipes/lazy-cottage-cheese-tomato-pasta). In het hoofdgesprek is de door de gebruiker aangeleverde screenshot als hoeveelheidbron gebruikt; de pagina vereist een abonnement.

- Basis: twee personen.
- ‘1 × 350 g pot’ betekent 350 g behoefte, met behoud van de oorspronkelijke omschrijving.
- Vier personen betekent 700 g behoefte; pas daarna worden verpakkingen gekozen.
- ‘Vol’ en ‘vers’ blijven productkenmerken.
- Bij peper ontbreekt de hoeveelheid; de app mag niet verzinnen dat de bron ‘naar smaak’ zegt.
- Ontbrekende bereidingsstappen blokkeren het boodschappenvoorstel niet.

### Culy kip Marbella

[Receptlink](https://www.culy.nl/recepten/kip-marbella/). Het eerdere onderzoek constateerde een dubbel opgehaalde ingrediëntenlijst, exacte maten, stuks, eetlepels en handjes.

- Dezelfde bronlijst eenmaal importeren; echte herhaling in verschillende receptonderdelen behouden.
- Acht kippendijen niet zonder onderbouwing omrekenen naar een verpakking in gram.
- Globale of ontbrekende hoeveelheden vereisen een gemarkeerd voorstel en bewuste keuze.

## Historische uitgangsstaat van de code vóór de MVP-bouw

De uitgangscommit van de hoofdbranch is `79e121f` van 17 september 2025. Het nieuwe werk gebeurt op `codex/picnic-mvp`; onderstaande beschrijving betreft het oorspronkelijke prototype. Het is een prototype met React/Vite en een Express-backend. De backend kiest bij zoeken het eerste resultaat en voegt één verpakking toe. Gebruikers staan in werkgeheugen; Picnic-wachtwoorden worden met een eenvoudige XOR-bewerking bewaard. Dit voldoet niet aan het besproken ontwerp voor meerdere gebruikers.

In `src/services/picnicService.ts` staat een al bestaande, ongecommitteerde `buildUrl`-wijziging. De hoofdbranch gebruikt een andere backendservice en heeft niet de routes `/api/login` en `/api/match-session` waarvoor die oude opdracht bedoeld was.

De aparte specificatiebranch heeft die routes wel, maar bevat ook gedrag dat afwijkt van de huidige afspraken: automatisch toevoegen boven een confidence-drempel, een beperktere importflow en sessieopslag in geheugen. Die branch is historisch materiaal, geen kant-en-klare basis om ongewijzigd samen te voegen.

Beide hervattingstaken zijn inmiddels afgerond. De eerste rapporteert een geslaagde productiebuild en negen URL-controles, maar 404 op de genoemde routes in de hoofdbranch. De tweede rapporteert op `codex/fix-dev-api-base` een geslaagde build, acht URL-controles en HTTP 200 voor beide routes in een browsertest met mockmodus; lint heeft nul fouten en zeven bestaande waarschuwingen. Die fix is nog niet gecommit. Dit zijn de testresultaten uit die taken, niet opnieuw uitgevoerde controles in deze hervatting. Een mocktest bewijst geen werkende koppeling met een echt Picnic-account.

## Ontwerp afgerond; bewijs vóór uitvoering en pilot

1. **Productselectie:** de regels staan in [productselectie](PRODUCTSELECTIE.md). Werkelijke productkenmerken, verpakkingseenheden en aanbiedingsvoorwaarden vereisen gegevensvalidatie. Conflicten met latere aankoopwensen horen bij die uitbreiding.
2. **Accounts:** Better Auth, D1 en Resend zijn gekozen. Toets de eigen uitnodigingsregels, HMAC-opslag van codes, directe intrekking en absolute/idle sessiegrenzen. Zie [accounts](ACCOUNTS.md).
3. **Infrastructuur:** Workers, D1, R2 en Queues vormen het gekozen ontwerp. Officiële tarieven en limieten zijn onderzocht; vooral 10 ms CPU op Workers Free vraagt meting. Een betaald alternatief wordt niet automatisch aangezet. Zie [technisch ontwerp](TECHNISCH-ONTWERP.md).
4. **Picnic:** het prototype bevat wrapper 3.1.3; npm vermeldt 4.10.0, upstream main wijkt daarvan af. Test de exacte gepubliceerde release, SMS en hervatten zonder blijvend wachtwoord. Er zijn geen echte Picnic-aanroepen voor dit onderzoek uitgevoerd.
5. **Veiligheid en kosten:** gebruikersisolatie, private afbeeldingen, versleutelde hervatsleutels, begrensde URL-ophaling en atomair gereserveerde budgetten zijn gespecificeerd in [datamodel](DATAMODEL.md) en [import en AI](IMPORT-EN-AI.md). Ze moeten nog worden geïmplementeerd en getest.
6. **Betrouwbaarheid:** [uitvoering en herstel](BETROUWBAARHEID.md) zijn uitgewerkt met D1 en duurzame taken. Geen claim van exact-eenmaaluitvoering bij Picnic; onzekere externe resultaten stoppen de actie.
7. **Privacy en toegang:** leveranciersretentie en toelaatbaarheid van de Picnic-integratie blijven toelatingspunten vóór de vriendenpilot. Verwijdering en herstel worden daadwerkelijk beproefd. Er is geen nieuwe juridische conclusie of toestemming van Picnic verkregen.
8. **Bouwvolgorde:** het [bouwplan](BOUWPLAN.md) bevat schermen, zes fasen en de acceptatiematrix. Fase 0 bewijst de risicovolle technische aannames; daarna volgen account/recept, import, productvoorstel, gecontroleerd toevoegen en de pilot.

## Validatie van de eerdere specificatieoplevering

De ontwerpdocumenten zijn op onderlinge consistentie, lokale verwijzingen en witruimte gecontroleerd. Een afzonderlijke review van authenticatie, datamodel en budgetregels leverde een verschil in de formulering van het gebruikersmaximum op; dit is gelijkgetrokken op de gekozen pilotstandaard van tien accounts inclusief Stef. Er zijn geen nieuwe applicatietests uitgevoerd, omdat deze oplevering uitsluitend specificaties wijzigt. De al bestaande wijziging in `src/services/picnicService.ts` is behouden.
