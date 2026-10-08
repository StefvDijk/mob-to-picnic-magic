# Gedeeld API-contract voor de MVP

Werkcontract tussen implementatieteams, 8 oktober 2026. De manager die een route implementeert legt het exacte schema ook vast in browserveilige TypeScript-contracten onder `shared/`. Dit document is de overeengekomen interface, geen bewijs dat routes al bestaan. Wijzigingen worden met de directeur afgestemd voordat frontend en backend uiteenlopen.

## Algemene regels

JSON onder `/api`, sessie uitsluitend via HttpOnly-cookie. Persoonlijke antwoorden gebruiken `Cache-Control: no-store`. Schrijfacties vereisen geldige origin/CSRF-controle. Identiteit en rol komen uit serverauthenticatie. Een object van iemand anders levert dezelfde 404 op als een onbekend object. Validatiefouten zijn 400, niet ingelogd 401, geweigerde accounttoegang 403, verouderde versie 409, limiet 429 en tijdelijk ontbrekende integratie 503.

Foutvorm: `{ error: { code, message, fields? } }`, met Nederlandse veilige melding, geen providerpayload, stack of secrets. Bedragen zijn gehele eurocenten; hoeveelheden zijn exacte strings met `g`, `ml` of `piece`, of expliciet onbekend/globaal. Numerieke strings zijn een begrensde decimale notatie of een exacte breuk `n/d`; bijvoorbeeld `1/3` mag niet stil worden afgerond bij opslaan en teruglezen. De gedeelde parser valideert en normaliseert de notatie. Instellingen en onzekere kenmerken worden niet stil aangevuld. Server geeft eigenaren nooit rechtstreeks controle over executionstatus, prijs of autorisatie.

## Routes

| Route | Verantwoordelijkheid en resultaat |
| --- | --- |
| `GET /api/health` | Publieke minimale liveness, geen secrets/configdump |
| `/api/auth/*` | Better Auth Email OTP, alleen ingeschakelde noodzakelijke endpoints; invite-only ook vóór codeverzending controleren |
| `GET /api/me` | App-account, rol, sessiestatus, Picnic-koppelstatus, eigen resterende budgetten en expliciet omgevingslabel |
| `POST /api/logout` | Huidige startsessie intrekken en onverzonden eigen acties volgens beleid stoppen |
| `POST /api/logout-all` | Alle eigen sessies intrekken |
| `DELETE /api/account` | Recente verificatie en expliciete bevestiging; direct ontoegankelijk, duurzame verwijdertaak; 202 |
| `GET /api/recipes` | Eigen bewaarde recepten, begrensde pagina en cursor |
| `POST /api/recipes` | Gevalideerd bewerkbaar recept bewaren; 201 met recept |
| `GET /api/recipes/:id` | Eigen recept met ingrediënten, bron, versienummer en uploadverwijzingen |
| `PUT /api/recipes/:id` | Volledige bewerkbare inhoud plus verwachte versie; conditionele update |
| `DELETE /api/recipes/:id` | Eigen recept verwijderen en verweesde bronbestanden duurzaam opruimen |
| `DELETE /api/recipes/:id/source` | Alleen de zelfstandige bewaarde bronkopie verwijderen; recept en bewerkingen blijven bestaan; 204 |
| `POST /api/uploads` | Begrensde afbeelding, gecontroleerde inhoud en atomair gereserveerde ruimte; private ID |
| `GET /api/uploads/:id` | Alleen eigenaar, veilige content headers; geen publieke R2-link |
| `DELETE /api/uploads/:id` | Bron los verwijderen; herkende recepttekst behouden |
| `POST /api/imports` | Type tekst/link/afbeelding, broninhoud of eigen upload-ID's; duurzame import; 202 |
| `GET /api/imports/:id` | Status queued/running/needs_review/failed en bewerkbaar resultaat; niet ongecontroleerd opslaan als definitief recept |
| `POST /api/picnic/connect` | Picnic-inloggegevens alleen transient; status connected of verification_required |
| `POST /api/picnic/verify` | Begrensde SMS-code voor lopende eigen koppeling |
| `DELETE /api/picnic/connection` | Eigen hervatsleutel ongeldig en verwijderd; geen verwijdering extern account/mand |
| `GET /api/picnic/cart` | Actuele mand plus eigen expliciete toewijzingen |
| `GET /api/picnic/products?q=...` | Begrensd zoeken via eigen koppeling; genormaliseerde productgegevens en expliciete onbekende eenheden |
| `POST /api/proposals` | Eigen recept-ID/versie en gewenste porties; actueel voorstel met onopgeloste keuzes |
| `PATCH /api/proposals/:id` | Verwachte versie en expliciete keuze, toewijzing, overslaan of onthouden; server rekent en versie verhoogt |
| `POST /api/proposals/:id/approve` | Verwachte versie; server controleert alle noodzakelijke keuzes; één duurzame actie per goedkeuring |
| `GET /api/actions/:id` | Toestand en resultaten per regel, inclusief onbekend en herstelopties |
| `POST /api/actions/:id/resolve` | Expliciete gebruikersverklaring na mandcontrole; nooit presenteren als API-bewijs |
| `POST /api/actions/:id/recovery` | Nieuw voorstel uitsluitend voor toepasselijke resterende regels, opnieuw goedkeuren |
| `POST /api/feedback` | Alleen bewust meegestuurde inhoud, niet het hele receptaccount |
| `GET /api/admin/overview` | Beheer: accounts, uitnodigingen, kosten/quota en redacted fouten; geen receptinhoud |
| `POST /api/admin/invitations` | Beheer plus recente verificatie; adresgebonden, capaciteitscontrole, verzendquota |
| `DELETE /api/admin/invitations/:id` | Intrekken en gereserveerde plek vrijgeven |
| `PATCH /api/admin/accounts/:id` | Actief/geblokkeerd, sessies en lopende acties volgen beleid |
| `PATCH /api/admin/switches` | AI en toevoegen afzonderlijk aan/uit; recente verificatie |

## Interne grenzen

### Geïmplementeerde importopslag

`POST /api/imports` accepteert momenteel `{ type: 'text', text }` of `{ type: 'url', url, sourceLabel? }`. Tekst is maximaal 50.000 tekens; links zijn beperkt tot de gecontroleerde HTTPS-bronnen. Afbeeldingsinvoer volgt later. `GET /api/imports/:id` gebruikt `ImportDto` uit `shared/imports.ts`, inclusief kandidaten, oorspronkelijke tekst/link, onzekerheden en de oorspronkelijke vervaldatum. Ook de statussen `saved` en `expired` zijn onderdeel van het contract.

Om een gecontroleerd importrecept te bewaren, bevat `POST /api/recipes` naast de bewerkte inhoud optioneel `importSource: { importId, candidateIndex }`. Een index selecteert één resultaat; `null` bewaart de beschikbare bron zonder een automatisch gekozen kandidaat, bijvoorbeeld bij handmatige invoer. De server valideert eigenaar, status en geldigheid en kopieert de bron atomair met het recept. Een al bewaard importconcept kan tot zijn oorspronkelijke vervaldatum voor een andere kandidaat worden gebruikt. De vervaldatum wordt niet verlengd door bewaren.

Receptdetail en schrijfresultaten bevatten `sourceSnapshot` (of `null`); de receptenlijst laat dit veld weg. De kopie bevat de oorspronkelijke tekst/link en eventueel de geselecteerde kandidaat. `PUT /api/recipes/:id` wijzigt deze kopie niet en wijst `importSource` af. Los verwijderen vereist `DELETE /api/recipes/:id/source`; verwijderen van het recept verwijdert de kopie mee. Tijdelijke importretentie verwijdert de zelfstandige kopie bij het recept niet.

`worker/auth/` bepaalt account en sessie voor elke route. `worker/db/` bezit transactie-invarianten. `worker/domain/` bevat pure rekenregels; geen AI, netwerk of toegangsbesluiten. `worker/adapters/` beperkt Picnic, e-mail en AI. `worker/routes/` valideert invoer en gebruikt deze modules. `worker/jobs/` verwerkt queues, outbox en onderhoud met duurzame status. `worker/index.ts` is uitsluitend de samenstelling en handlers.

Queueberichten bevatten versie, taaksoort en ID; nooit broninhoud, wachtwoorden of sleutels. Productprijzen worden altijd door de server uit de adapter gehaald. Testmodus vereist expliciete configuratie en blijft herkenbaar; productie kan nooit op ontbrekende credentials reageren met een succesvolle mock.

Frontendteams mogen ondertussen tegen contractfixtures werken, maar de eindcontrole vereist echte routes met lokale D1/R2 en gesimuleerde externe providers. Fixtures worden niet stilzwijgend de productiebackend.

## Gefocuste MVP: productvoorstel en toevoegactie

- `POST /api/proposals`: `{recipeId, recipeVersion, servings, choices:[{ingredientId, query, productId, basis}]}`. Prijzen en verpakkingen worden opnieuw bij Picnic opgehaald; antwoord `{proposal}` met versie, vervaldatum, regels en totaal.
- `GET /api/proposals/:id`: eigen actuele voorstel, of 409 als het verlopen/achterhaald is.
- `POST /api/proposals/:id/approve`: `{expectedVersion}`. Antwoord `{action}`; herhaling geeft dezelfde actie terug.
- `GET /api/proposals/:id/action`: terugvinden van een eerder aangemaakte actie, ook na een verloren goedkeuringsantwoord.
- `GET /api/actions/:id`: eigenaargebonden status met regels.
- `POST /api/actions/:id/resolve`: `{lineId, resolution:'confirmed_added'|'confirmed_not_added'}` na controle door de gebruiker. Dit verstuurt niets opnieuw.

Migratie 0010 controleert de actuele receptversie en toevoegschakelaar atomisch bij goedkeuren en verzenden. `purchase_lines.price_cents` is de prijs per verpakking; totaal is prijs maal `pack_count`. Queueberichten bevatten alleen actie-ID en versie. Onbekende uitkomsten blijven geblokkeerd voor automatisch opnieuw verzenden.
