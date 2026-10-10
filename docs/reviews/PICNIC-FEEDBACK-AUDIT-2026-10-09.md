# Feedback en flowaudit — 9 oktober 2026

## Uitgevoerde wijzigingen

1. Receptlinks zijn niet meer beperkt tot Culy en MOB. De import accepteert openbare HTTPS-websites, volgt gecontroleerde redirects en begrenst downloadgrootte en verwerkingstijd. Private adressen worden ook na DNS-resolutie en bij redirects afgewezen. Een site die automatische toegang blokkeert kan nog een foto of screenshot vereisen.
2. De header gebruikt het Picnic-logo en de naam **Mand**. De navigatie bevat Mand, Recepten, Picnic en Account; op mobiel staat deze onderaan.
3. Mand opent met de import. Het gedeelte **Nog een keer** is verwijderd en het linkveld heeft een neutrale placeholder. Bij wisselen van importbron wordt de vorige bron gewist.
4. Account heeft één titel, compacte gegroepeerde rijen, consistente knoppen en een aparte verwijderactie met bevestiging.
5. **Herinner recept voor een andere keer** bewaart expliciet de gekozen Picnic-product-ID's, verpakkingsaantallen, porties en overgeslagen ingrediënten in D1. Bewaren kan zonder producten toe te voegen. Recepten toont compacte rijen met direct herhalen en een aparte wijzigknop.

## Aanvullende bevindingen en reparaties

- De mobiele alternatievenweergave maakte productkaarten extreem smal en lang. De kaartbreedte en horizontale rail zijn hersteld; de kiesknop blijft bruikbaar op 320 px.
- De Picnic-tab toont eerst het bestaande mandje en daarna productzoeken. De verbonden status is compact en het vervangen van de koppeling is een secundaire actie.
- Een bewaard recept herstelt ook aangepaste producten, pantryproducten, aantallen en overgeslagen ingrediënten. Ontbrekende producten krijgen een expliciete melding; er wordt niet stilzwijgend een alternatief gekozen.
- Herhalen controleert opnieuw prijs en beschikbaarheid van dezelfde product-ID's. Bij een niet leverbaar of niet betrouwbaar gecontroleerd product wordt geen gedeeltelijke toevoegactie voorbereid.
- Herhaalde klikken, een onzekere netwerkrespons en verversen gebruiken dezelfde toevoegactie. Een volgende ronde vraagt een expliciete nieuwe actie. Een verlopen sessie wist de zichtbare accountgegevens, maar behoudt de informatie die nodig is om een lopende toevoegactie veilig te herstellen.
- Bewaren en herhalen controleren de eigenaar, receptversie en gekoppelde Picnic-catalogus. Een race met een gewijzigde koppeling of receptversie wordt afgewezen.
- Catalogusvragen worden opgesplitst om de D1-limiet op gebonden parameters te respecteren. Dit is ook met 101 gekozen product-ID's getest.
- De importdeadline wordt correct doorgegeven wanneer een kandidaat gekozen wordt, inclusief herstel van een eerdere import.

## Validatie

- 398 Worker-tests in 41 bestanden geslaagd.
- 14 aanvullende Node-tests geslaagd, waaronder migratiecontrole.
- Frontend- en Worker-typechecks, lint op gewijzigde bestanden, productiebuild en deployment dry-run geslaagd.
- Mobiele browsercontrole op 320 px zonder horizontale pagina-overflow, plus controle van de grotere layout.
- Geïsoleerde flowtest: import van een andere website → ander kipproduct → twee verpakkingen → tomaat overslaan → zout uit de voorraad selecteren → bewaren → herhalen → verversen → wijzigen. Exact dezelfde keuzes kwamen terug en verversen maakte geen tweede toevoegactie.
- Deze toevoegflow gebruikte testgegevens. Bij de livecontrole zijn geen producten aan het echte Picnic-mandje toegevoegd.

## Uitvoering

De hoofdagent voerde de audit en integratiecontrole aan. Drie uitvoerende agents met `gpt-6-luna` werkten aan universele import, opslag/herhalen en de interface. Bestaande lokale wijzigingen zijn behouden. Er is geen Git-commit gemaakt.

De releasegegevens staan in [het deploymentverslag](../deployments/2026-10-09-feedback.md).
