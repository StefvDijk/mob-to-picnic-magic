# Eerst een bruikbare MVP

Deze herprioritering volgt de gebruikersvraag van 8 oktober 2026: zo snel mogelijk een werkende MVP, zonder zijpaden. Dit document bepaalt samen met [PILOT-RELEASE.md](PILOT-RELEASE.md) de eerstvolgende oplevering: een besloten online test op picnic.devstef.nl. Het uitgebreide bouwplan blijft de backlog, niet de acceptatiegrens voor deze eerste versie.

## Klaar betekent

Eén gebruiker kan met een vast account inloggen, Picnic koppelen, een URL of foto importeren en alleen onduidelijkheden controleren, porties kiezen, producten controleren en de goedgekeurde producten één keer aan de Picnic-winkelmand toevoegen. De app bestelt of rekent niet af. Een tweede gebruiker mag geen toegang krijgen tot diens gegevens.

Productkeuze gebruikt het laagste totaalbedrag voor voldoende product. Toon benodigde hoeveelheid, aantal verpakkingen, totaalprijs en overschot. Onbekende hoeveelheden of onzekere matches vragen handmatige correctie. Bio en andere voorkeuren volgen later.

## Correctie: import is de kern

De eigenaar heeft expliciet verduidelijkt dat alle recepten uitsluitend uit URL’s of foto’s komen. Handmatige receptaanmaak en tekst overtypen zijn geen gebruikersroute. Automatische herkenning, foto-upload en de benodigde kostenbewaking zijn daarom verplichte onderdelen van de eerste release. De eerdere keuze om AI/foto’s uit te stellen is vervallen. Eerst deze importketen, daarna de echte Picnic-proef en online pilot.

## Eerdere uitvoervolgorde (ondergeschikt aan bovenstaande correctie)

1. **Werkende basis herstellen en echte afhankelijkheden vroeg toetsen.** Bewaar de onafgeronde AI-wijzigingen afzonderlijk en maak de gecontroleerde basis zonder AI de werkversie. Controleer opstarten, account en receptopslag. Controleer benodigde configuratie en voer, zodra echte toegang beschikbaar en toegestaan is, Picnic-login/productzoeken uit. Meld ontbrekende toegang direct; wacht hiermee niet tot het einde. Geen wachtwoorden of codes in chat of logs.
2. **Eén volledig productvoorstel.** Verbind de bestaande portieberekening en productselectie met echte zoekresultaten en één eenvoudig controlescherm. De gebruiker kan een alternatief kiezen en onduidelijke hoeveelheden verbeteren. Eerst één recept per voorstel.
3. **Goedgekeurd voorstel naar de mand.** Voeg de goedgekeurde versie één keer toe. Dubbelklikken mag geen tweede actie maken. Bij een onzekere externe uitkomst niet automatisch opnieuw versturen; toon dat controle van de mand nodig is. Voeg geen checkout toe.
4. **Samenhangende gebruiksproef en oplevering.** Doorloop de volledige route op mobiel formaat, inclusief herladen en één foutscenario. Doe een echte mandmutatie uitsluitend na expliciete toestemming voor de concrete inhoud. Controleer accountisolatie, geheimen en de geraakte code; lever daarna de kleinste bruikbare omgeving en korte startinstructies op. Externe configuratie blijft zichtbaar als blokkade, nooit als geslaagd bewijs.

## Bewust later

Bio-/merkvoorkeuren, meerdere recepten combineren en geavanceerde voorraadverrekening, extra beheerfuncties en brede refactors. De inmiddels gevraagde Picnic-vormgeving is onderdeel van de huidige basis. Bestaande werkende functies blijven behouden. Essentiële sessie-, geheimen-, gegevensisolatie- en dubbelverzendbeveiliging worden niet uitgesteld.

## Werkafspraken

- Eén eigenaar en één actieve opleverstap. Geen nieuwe management- of reviewrondes als standaardproces.
- Bouw verticaal tot de gebruiker een resultaat ziet. Geen extra infrastructuur zonder aantoonbare noodzaak voor deze route.
- Eén gerichte controle per wijziging; één integratiecontrole bij oplevering. Alleen herhalen na een relevante wijziging of fout.
- Meld kort wat werkt, wat nu gebeurt en wat werkelijk blokkeert. Geen beslisvragen over routinekeuzes.
- Als een onderdeel de route ophoudt, beperk de scope. Handmatige receptinvoer is geen alternatief voor URL-/fotoherkenning.
- Geen datum of tijd beloven voordat de echte Picnic- en accountafhankelijkheden zijn getoetst. Een lokale proef met fixtures is geen bewezen live MVP.

## Actuele basis

Accounts, recepten, import met bronbehoud, porties, productvoorstel en duurzame toevoegacties zijn lokaal gebouwd en getest. Cloudflare-mail heeft een werkelijk ontvangen testbericht opgeleverd. De interface is in Picnic-stijl vernieuwd. Echte Picnic-uitvoering, online resources en de proef met twee gebruikers zijn nog niet bewezen. De eerdere AI-wijzigingen zijn hersteld en uitgebreid met privéfoto’s. Live herkenning wacht op de API-sleutel en de prijsconfiguratie. Zie de release-statusmatrix voor de eerstvolgende open punten.
