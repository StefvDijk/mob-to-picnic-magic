# Datamodel

Logisch ontwerp, 8 oktober 2026. Dit document bepaalt de gegevensgrenzen; het is nog geen databaseschema of migratie. Begrippen staan in [CONTEXT.md](../CONTEXT.md).

## Eigenaarschap en relaties

Iedere persoonlijke tabel heeft een eigenaar. De server bepaalt die vanuit de geldige sessie, nooit vanuit een door de browser aangeleverd gebruikers-ID. Queries en relaties controleren dezelfde eigenaar; een onraadbare ID is geen toegangscontrole. Beheerrechten geven geen toegang tot recepten of uploads.

| Entiteit | Inhoud en belangrijkste regel |
| --- | --- |
| Account | Vaste identiteit, geverifieerd adres, rol en status: uitgenodigd, actief, geblokkeerd of in verwijdering |
| Uitnodiging | Doeladres, vervaldatum, status en gereserveerde pilotplek; atomair eenmalig verbruiken |
| App-sessie | Account, onveranderlijke inlogdatum, laatste activiteit, recente verificatie en intrekking; geen Picnic-sleutel |
| Picnic-koppeling | Account, status, generatie en versleutelde hervatsleutel; nooit blijvend wachtwoord. Nieuwe koppeling maakt oude voorstellen ongeldig |
| Import | Eigenaar, bronsoort, verwerkingsstatus, conceptverval en eventuele foutcode |
| Bronbestand | Private object-ID, eigenaar, bestandstype, grootte en verwijderstatus; geen publieke URL |
| Recept | Eigenaar, titel, bronvermelding, basisporties, actuele versie en beschikbare bereidingsstappen |
| Ingrediëntregel | Recept, onderdeel, oorspronkelijke tekst, genormaliseerde behoefte, kenmerken, herkomst en afzonderlijke onzekerheden |
| Voorstel | Receptversie, gewenste porties, koppelinggeneratie, versie, status en moment van product-/mandcontrole |
| Aankoopbehoefte | Verenigbare ingrediëntregels samen met hun geschaalde behoefte; verwijzingen naar alle bronregels blijven bestaan |
| Mandtoewijzing | Voorstel/behoefte, product, expliciet toegewezen hoeveelheid en laatst gecontroleerde mandaantal; geen Picnic-reservering |
| Aankoopregel | Behoefte, exact product/variant/verpakking, integer verpakkingsaantal, prijs en eventueel expliciet geaccepteerde afwijking |
| Goedkeuring | Eigenaar, startsessie, voorstelversie en onveranderlijke momentopname van toegestane aankopen en toewijzingen |
| Toevoegactie | Unieke goedkeuring, koppelinggeneratie, toestand, vervolgactie en tijdstippen |
| Uitvoeringsregel | Goedgekeurde aankoopregel, poging-ID en status volgens [betrouwbaarheid](BETROUWBAARHEID.md); gebruikersverklaring apart van API-bewijs |
| Productvoorkeur | Eigenaar, toepassingskenmerken en expliciet onthouden product; niet automatisch afgeleid uit een aankoop |
| Budgetreservering | Eigenaar, kalendermaand, import/poging, maximaal bedrag, status en werkelijk verbruik voor zover bekend |
| Uitgaand taakbericht | Unieke taak/versie, leverstatus en volgende poging; transactioneel met de bijbehorende domeinwijziging |
| Verwijdertaak | Afgeschermde objectverwijzingen, voortgang en uiterste verwijderdatum; ook opruimen na voltooien |
| Gedeelde feedback | Alleen bewust meegestuurde inhoud, afzender en vervaldatum; geen impliciete toegang tot de rest van het account |

Productgegevens worden als tijdgebonden momentopname bewaard, niet als blijvende waarheid. Een persoonlijke productvoorkeur kan blijven bestaan als het product tijdelijk ontbreekt; dat geeft geen toestemming om ongezien een ander product toe te voegen.

## Hoeveelheden en prijzen

Bewaar hoeveelheden als exacte decimale waarden met een eenheid, niet als afgeronde floats. Rekenen kan met geschaalde integers of rationale getallen; afronden gebeurt pas bij de aankoop. Conversies tussen gram en kilogram of milliliter en liter zijn exact. Stuks, massa en volume worden niet onderling omgerekend zonder een aantoonbare productconversie.

Een hoeveelheid heeft een soort: exact, bereik, globale maat of onbekend. `null` betekent onbekend en nooit nul. Bewaar bij ‘handje’ de bronmaat; een geschatte gramwaarde heeft een afzonderlijke herkomst en vraagt de afgesproken bevestiging. Een bereik wordt niet stilzwijgend één getal. De gebruiker kiest of bevestigt de concrete behoefte vóór de aankoopberekening.

Bewaar verkoopprijzen in eurocenten met valuta en prijsbasis. Prijs per kilo/liter wordt uit vergelijkbare inhoud berekend en apart afgerond voor weergave. Onbekende prijs, onduidelijke verpakking of voorwaardelijke aanbieding is geen nulprijs. Een aanbieding telt pas mee als de voorwaarden voor deze mand aantoonbaar gelden. Anders toon je de onzekerheid en vraag je een keuze.

Voorbeeld: 350 g voor twee personen wordt 700 g voor vier personen. Bij een expliciete mandtoewijzing van 200 g resteert 500 g. Vervolgens zoekt de rekenmodule de goedkoopste passende combinatie die minstens 500 g dekt. De oorspronkelijk benodigde 700 g blijft bewaard.

## Versies en onveranderlijke besluiten

Bewerken van recept, porties, toewijzing of productkeuze verhoogt de voorstelversie en maakt een eerdere goedkeuring onbruikbaar voor nieuwe uitvoering. Het toevoegen gebruikt de goedgekeurde momentopname, niet een later gewijzigd recept. Alleen een prijsdaling met verder ongewijzigde inhoud mag binnen dezelfde toestemming worden verwerkt; bewaar zowel goedgekeurde als uitgevoerde prijs.

Unieke voorwaarden in de database: één actie per goedkeuring, één uitvoering per actie/aankoopregel, één actieve uitvoeringsclaim per koppeling en één budgetreservering per AI-poging. Toewijzingen en uitnodigingsplekken vereisen conditionele transacties. Een verlopen lock geeft geen recht om een mogelijk verzonden Picnic-aanroep te herhalen.

Als de adapter een betrouwbare Picnic-accountidentiteit levert, voorkomen we dat twee app-accounts dezelfde externe mand tegelijkertijd besturen. Is die identiteit niet betrouwbaar beschikbaar, dan is de garantie beperkt tot één koppeling en moet de pilot expliciet uitgaan van afzonderlijke Picnic-accounts. Een sessiesleutel vergelijken is geen betrouwbare accountidentiteit.

## Verwijderen en herstel

Accountverwijdering maakt toegang en koppeling meteen ongeldig. Daarna verwijdert een hervatbare taak alle persoonlijke rijen en bestanden, inclusief gedeelde feedback. Lopende workers controleren de verwijderstatus voordat zij resultaten opslaan; zij mogen een verwijderd account niet opnieuw vullen. Een reeds verzonden externe aanroep kan nog slagen en wordt niet teruggedraaid.

Een minimale verwijderregistratie blijft afgeschermd zolang oude herstelpunten bestaan, zodat herstellen geen verwijderd account terugbrengt. Zij bevat geen recepten of authenticatiegeheimen, is zelf tijdelijk en wordt niet als anonieme statistiek voorgesteld. De bewaartermijnen staan in [accounts](ACCOUNTS.md) en de leveranciersgrenzen in [technisch ontwerp](TECHNISCH-ONTWERP.md).

Accountgebonden budgetinformatie vervalt ook bij verwijdering. Het totale maandverbruik blijft als grof app-totaal bestaan, zodat verwijderen het algemene budget niet terugzet. Een verwijderd en opnieuw uitgenodigd account heeft geen blijvend verborgen persoonsprofiel; uitnodigen blijft beheerwerk. Gedetailleerde transactiehistorie wordt niet bewaard onder het etiket ‘anoniem’.

## Indexen en migraties

Indexeer persoonlijke lijsten op eigenaar plus bijgewerkt tijdstip, taken op status plus volgende verwerking, uitvoeringsregels op actie plus volgorde, en budgetten op eigenaar plus kalendermaand. Gebruik samengestelde relaties waar nodig om verwijzingen over accountgrenzen te verhinderen. Meet gelezen en geschreven rijen, inclusief indexonderhoud, tegen de D1-quota.

Migraties worden getest op lege én gevulde testopslag. De eerste pilot importeert geen oude in-memory gebruikers, XOR-wachtwoorden of onbewezen sessies. De bestaande frontend kan worden hergebruikt, maar nieuwe accounts en koppelingen beginnen schoon. Een herstelproef controleert zowel data-integriteit als opnieuw toepassen van verwijderingen.
