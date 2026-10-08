# Verwijdering, retentie en herstel voor de pilot

Dit document beschrijft de eigen actieve opslag van de app. De termijnen uit
[Accounts](ACCOUNTS.md) zijn ontwerpdoelen voor de pilot; een lokale test bewijst
geen bewaartermijn van Cloudflare, Picnic, Resend of OpenAI.

## Runtimecontract

`worker/jobs/maintenance.ts` exporteert `runMaintenance({ DB, UPLOADS }, now)`.
`worker/index.ts` roept dit op vanuit de geplande trigger. D1 is de duurzame
werklijst; de taak mag opnieuw starten na een crash, verlopen lease of dubbele
trigger. Een `delete_upload`-outboxrij is een hint, niet de enige bron: de
onderhoudstaak scant ook `uploads.status='deleting'`. Er is geen queue-ack
zonder uitvoerder.

Bij accountverwijdering worden sessies en de eigen Picnic-hervatsleutel direct
ingetrokken. De taak claimt met een begrensde lease, wacht maximaal 15 minuten
voor reeds gereserveerde uploads en lopende externe aanroepen, wist daarna
iedere bekende objectkey in R2,
controleert opnieuw op uploadrijen en objecten, en zet pas daarna
`r2_verified_at`. `purgeAccountData` weigert een ontbrekende of verlopen lease,
ontbrekende R2-bevestiging en resterende niet-verwijderde uploads. Een
lease-assertie als eerste stap van de D1-transactie draait de hele purge terug
als een andere werker de lease na de voorcontrole overneemt. Bij fouten
blijven de objectverwijzingen, uploadquota en taakstatus beschikbaar voor een
nieuwe poging. Een verlopen losse upload wordt eerst atomisch geclaimd met een
nieuwe controle op recept- en importkoppelingen; pas na bevestigde R2-verwijdering
komt gereserveerde ruimte vrij.
Een onzekere Picnic-toevoegactie krijgt nooit een automatische herhaling.
Accountverwijdering houdt persoonlijke uitvoeringshistorie niet onbeperkt vast:
lopende externe verzoeken krijgen een begrensde aflooptijd, waarna de eigen
sleutels en historie verwijderd worden. Reeds verzonden boodschappen kunnen
bij Picnic blijven staan.

Een toekomstige uploadroute moet na `R2.put` altijd `markUploadStored` uitvoeren.
Als die `false` teruggeeft, moet dezelfde route de zojuist geschreven R2-key
wissen en de write als mislukt behandelen. De route moet een bovengrens voor
uploadduur afdwingen die korter is dan de wachttijd van de verwijdertaak.
De opslaghelpers en D1-triggers weigeren nieuwe reserveringen en `stored`-
overgangen zodra het account niet actief is. Alleen een geslaagde reservering
geeft recht om de bijbehorende objectkey te schrijven; de uploader mag geen
key van een ander account of een reeds verwijderde reservering hergebruiken.

## Retentie in actieve opslag

| Gegevens | Onderhoudsregel |
| --- | --- |
| Niet-bewaarde importconcepten en bronbestanden | Na zeven dagen zonder bewerking; bestand pas als geen actief recept of import het gebruikt |
| Voorstellen, goedkeuringen en afgeronde toevoegacties | Na 90 dagen, met behoud van onopgeloste actie-evidence tot veilige afhandeling binnen de accountverwijdergrens |
| Bewust gedeelde feedback | Uiterlijk bij `expires_at`, maximaal 90 dagen; eerder bij accountverwijdering |
| Technische verzend-/foutregistratie | 14 dagen voor afgeronde records; geen broninhoud of geheimen in logs |
| Beveiligings- en beheerlog | 30 dagen wanneer deze tabellen bestaan; minimale persoonsgegevens |
| Verlopen uitnodigingen | Status `expired` maken en de gereserveerde pilotplek vrijgeven |
| Accountverwijdering | Direct ontoegankelijk; eigen actieve opslag binnen 24 uur als uitvoerbaar doel, fouttaken zichtbaar opvolgen |

Verlopen native `verification`-rijen worden voor zowel epoch- als ISO-vervaldatum
opgeruimd; de eigen Picnic-OTP-rateLimitrijen na twee uur en overige oude
rateLimitrijen na 30 dagen. Een onbekende
uitgaande e-mail of AI-poging wordt niet stil als mislukt verrekend alleen omdat
een timer afliep. Voor de huidige bouwstand bestaan nog geen aparte technische
of beveiligingslogtabellen; er kan dus geen automatisch log-retentiebeleid voor
die toekomstige tabellen worden geclaimd. Cloudflare-platformlogs vallen
eveneens buiten deze D1-taak en vereisen een afzonderlijke productie-instelling.

## Back-ups, verwijderlijst en herstelproef

Na bevestigde verwijdering blijft maximaal 30 dagen een minimale verwijderlijst
in private R2-opslag staan: account-ID, verzoekmoment en vervaldatum, zonder
e-mail, recept, auth-token of Picnic-sleutel. Dit is een herstel-tombstone,
geen anoniem gebruikstotaal. De lijst moet onafhankelijk van een teruggezette
D1-database beschikbaar zijn; een D1-rij alleen is geen bescherming tegen een
ouder herstelpunt. Eigen R2-back-ups mogen verwijderde gegevens maximaal 30
dagen bevatten. Configureer vóór productie een R2-lifecyclegrens voor tijdelijke
tombstones en eigen back-upkopieën, controleer die instelling periodiek en houd
de database-onderhoudstaak als tweede opruimpad. Zonder die live instelling en
een gemeten herstelproef is de 30-dagengrens nog geen bewezen garantie.
Leveranciersretentie moet apart worden getoetst.

Herstelprocedure, ook voor een lokale oefening:

1. Stop publiek verkeer en achtergrondverzending naar de herstelde database.
2. Herstel een D1-kopie met een account dat na het herstelpunt verwijderd werd.
3. Lees de nog geldige R2-verwijderlijst en pas elke verwijdering opnieuw toe op
   de kopie. Wis daarbij geen objecten van andere eigenaars; houd de tombstone
   aan tot haar vervaldatum.
4. Controleer dat het verwijderde account, sessies, Picnic-sleutel, recepten en
   uploads afwezig of ontoegankelijk zijn en dat een ander account intact is.
5. Open verkeer pas na die controle. Als de R2-lijst niet leesbaar is, blijft
   de herstelde database gesloten totdat een operator de verwijderingen heeft
   gereconcilieerd.

Een echte restore kan zelf een nieuw herstelpunt maken waarin de oude data kort
terugkeert. Houd de minimale tombstone daarom opnieuw tot maximaal 30 dagen na
die restore beschikbaar en beperk toegang tot de herstelde kopie totdat de
gegevens opnieuw zijn verwijderd. Dit is een afzonderlijk te testen
herstelrisico; de oorspronkelijke 30-dagengrens is zonder die proef geen harde
garantie over alle herstelpunten.

Een lokale restore-rehearsal gebruikt testdata en een private testbucket. De
uitkomst en de oudste beschikbare herstelpuntdatum horen in het pilotverslag.
De app noemt een verwijdering pas voltooid na bevestigde eigen R2- en D1-
opruiming; dit is geen garantie over externe back-ups of leverancierslogs.
