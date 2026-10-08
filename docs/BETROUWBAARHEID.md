# Betrouwbaar toevoegen aan Picnic

Ontwerpkeuzes van Codex, 8 oktober 2026, binnen de door de gebruiker gedelegeerde ruimte. Uitgangspunt: uitvoeren wat is goedgekeurd, zichtbaar maken wat werkelijk is gebeurd en bij onzekerheid geen dubbele boodschappen veroorzaken. Dit ontwerp is nog niet geïmplementeerd en veronderstelt geen onbewezen garanties van de Picnic-API.

## Eén goedkeuring en één uitvoering

Een goedkeuring hoort bij een specifieke versie van het voorstel en krijgt één unieke toevoegactie. Dubbel klikken, verversen of opnieuw versturen van dezelfde goedkeuring levert dezelfde actie op. De koppeling tussen goedkeuring en actie wordt atomair vastgelegd en is uniek in de opslag; alleen een uitgeschakelde knop is onvoldoende.

Per Picnic-koppeling voert de app maximaal één toevoegactie tegelijk uit. Een volgende actie wacht en wordt daarna opnieuw gecontroleerd. Een expliciete volgende aankoop van hetzelfde recept is wel mogelijk met een nieuw voorstel en een nieuwe goedkeuring. Andere wijzigingen via de Picnic-app blijven mogelijk en vallen buiten deze onderlinge uitsluiting.

## Resultaat per aankoopregel

| Status | Betekenis en vervolg |
| --- | --- |
| Nog niet verstuurd | Geen externe wijziging uitgevoerd; mag na geldige controles worden verstuurd |
| Wordt verstuurd | De poging is duurzaam vastgelegd vóór de externe aanroep; een tweede uitvoerder mag hem niet overnemen en herhalen |
| Bevestigd toegevoegd | Picnic heeft een volgens het gevalideerde API-contract succesvolle toevoeging bevestigd |
| Bevestigd niet toegevoegd | Picnic heeft aantoonbaar geweigerd zonder wijziging; herstel kan een nieuw voorstel voor die regel opleveren |
| Uitkomst onbekend | Het verzoek kan zijn uitgevoerd, maar het resultaat is niet betrouwbaar vastgelegd; geen automatische herhaling |

Een procesuitval na verzenden maar vóór het opslaan van het antwoord levert ook ‘uitkomst onbekend’ op. Een verlopen vergrendeling betekent niet dat die regel veilig opnieuw verstuurd kan worden. HTTP-fouten worden alleen als ‘niet toegevoegd’ ingedeeld als de API die conclusie rechtvaardigt; anders blijft de uitkomst onbekend.

Zonder ondersteunde externe idempotentiesleutel of sluitend actieoverzicht kunnen we geen exact-eenmaalgarantie bij Picnic geven. De app biedt wel bescherming tegen dubbele eigen uitvoering en kiest bij een onzekere externe uitkomst voor stoppen.

## Bij gedeeltelijk slagen

Voer aankoopregels achter elkaar uit en controleer vóór iedere verzending of toegang, koppeling en goedkeuring nog geldig zijn. Bij een fout of onzekere uitkomst stoppen de resterende regels. Toon bijvoorbeeld ‘3 toegevoegd, 1 uitkomst onbekend, 2 nog niet verstuurd’. Reeds toegevoegde regels worden niet automatisch verwijderd: dat kan andere boodschappen raken.

Voor zeker niet toegevoegde of nog niet verstuurde regels mag de gebruiker een herstelvoorstel openen. Dat bevat actuele gegevens en vraagt opnieuw goedkeuring. Bevestigd toegevoegde regels keren daar niet in terug. Een onbekende regel wordt eerst apart opgelost.

Een mandvergelijking helpt de gebruiker controleren, maar is geen bewijs dat onze actie de wijziging veroorzaakte. Bij ‘uitkomst onbekend’ blijft een volgende toevoegactie op die koppeling geblokkeerd totdat de gebruiker de getoonde producten in Picnic heeft gecontroleerd en de afhandeling kiest. Handmatige afhandeling wordt als gebruikersverklaring vastgelegd, niet als API-bevestiging; de app presenteert de latere aankoop als een nieuwe bewuste actie.

## Toewijzingen uit het bestaande mandje

Bewaar toewijzingen per voorstel en maak eerdere toewijzingen zichtbaar bij een volgend recept. Toon hoeveel van het huidige mandaantal al in de app aan een ander recept is toegewezen. Opnieuw gebruiken van die hoeveelheid vereist een zichtbare hertoewijzing; geen stille dubbeltelling.

Dit is een administratie in onze app, geen reservering bij Picnic. Bij afgenomen aantallen, een gewijzigde koppeling of een leeg mandje zijn betreffende toewijzingen niet meer betrouwbaar en worden ze vóór verdere uitvoering opnieuw gecontroleerd met de gebruiker. De rekenregels voor nieuwe goedkeuring blijven gelden.

## Intrekken en verwijderen tijdens uitvoering

Blokkeren, ontkoppelen en accountverwijdering verhinderen nieuwe externe aanroepen. Uitloggen op het apparaat dat de actie startte stopt de nog niet verzonden regels van die actie; uitloggen op een ander apparaat trekt niet de startsessie in. Uitloggen op alle apparaten stopt alle nog niet verzonden regels. Reeds verstuurde verzoeken kunnen alsnog slagen; de app belooft geen terugdraaiing.

Elke uitvoerder controleert sessie en koppeling op de server vlak vóór verzending. Een resterende race tussen controle en externe aanroep kan alleen begrensd, niet zonder API-ondersteuning atomair uitgesloten worden. Bij herstart wordt de duurzame actiestatus gelezen en wordt nooit een hele batch vanaf het begin afgespeeld.

## Minimale acceptatieproeven

- Twee gelijktijdige bevestigingsverzoeken maken precies één interne toevoegactie.
- Uitval vóór verzending, tijdens verzending en na Picnic-succes vóór lokale opslag levert telkens de juiste status op, zonder blinde herhaling.
- Bij een time-out op regel vier blijven de eerste drie bevestigd en regels vijf en zes onverstuurd.
- Een mandwijziging door de gebruiker wordt niet ten onrechte als bewijs voor onze toevoeging gebruikt.
- Een ingetrokken sessie of koppeling stopt resterende verzendingen; het resultaat van een al verstuurd verzoek blijft eerlijk weergegeven.
- Een herstelvoorstel bevat geen eerder bevestigde regels en vereist een nieuwe goedkeuring.
- Twee recepten kunnen niet ongemerkt dezelfde bestaande hoeveelheid claimen.

Deze proeven zijn eisen voor de integratietests. Mocktests alleen bewijzen niet hoe Picnic bij onderbrekingen reageert; dat gedrag moet met beperkte, expliciet geautoriseerde echte accounttests worden gevalideerd vóór de pilot.

## Technische vastlegging

Goedkeuring, actie en uitgaand taakbericht worden transactioneel in D1 opgeslagen. Queues mag hetzelfde bericht herleveren; conditionele claims en duurzame regelstatus bepalen of uitvoering nog mag. Een verlopen mogelijk verzonden claim wordt onbekend en nooit automatisch onverstuurd. De uitwerking staat in [technisch ontwerp](TECHNISCH-ONTWERP.md) en [datamodel](DATAMODEL.md).

De garantie is per koppeling. Wanneer de adapter een betrouwbare externe accountidentiteit levert, wordt ook dubbel koppelen van hetzelfde Picnic-account voorkomen. Zonder dat bewijs vereist de pilot afzonderlijke Picnic-accounts per gebruiker; alleen sessiesleutels vergelijken sluit een gedeelde mand niet uit.
