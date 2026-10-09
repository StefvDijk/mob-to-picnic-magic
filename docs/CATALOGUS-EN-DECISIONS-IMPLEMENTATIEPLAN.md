# Implementatieplan voor Picnic catalogus en Decisions matching

Datum: 9 oktober 2026. Status: onafhankelijke onderdelen lokaal gebouwd en geïntegreerd; live activering op meerdere beslispunten geblokkeerd. Zie de sectie “Catalogus en Decisions — uitvoering 9 oktober 2026” in [het verificatierapport](RECEPT-NAAR-MANDJE-VERIFICATIE.md) voor daadwerkelijk bewijs. De fasen hieronder zijn het oorspronkelijke plan, geen claim dat alle live acceptatiecriteria zijn gehaald.

Doel: de bestaande recept-naar-mandjeflow sneller en inhoudelijk betrouwbaarder maken met een eigen productindex, herbruikbare ingrediëntkoppelingen en OpenAI Decisions voor onbekende of ambigue kandidaten. Jev wordt voorlopig niet geïntegreerd. De index kan groeien vanuit echte zoekopdrachten; een volledige categoriecatalogus is geen voorwaarde voor een werkende uitbreiding.

## 1. Actuele uitgangssituatie

De nieuwste uitvoeringsbron is de chat **Voeg gele uien toe aan mandje**, ID `01a11f7a-04c3-7980-ab26-85387d53320f`, en de aanvulling van 9 oktober in [het verificatierapport](RECEPT-NAAR-MANDJE-VERIFICATIE.md). Deze gaan voor oudere statusregels in PROJECTSTATUS.md, IMPLEMENTATION-STATUS.md en PILOT-RELEASE.md.

- De lokale tweeschermenflow is gebouwd: URL/foto en personen kiezen, daarna boodschappen controleren en na één akkoord toevoegen. Automatisch zoeken, alternatieven, voorraad, persoonlijke opt-invoorkeuren en gedeeltelijke selectie bestaan al.
- Echte Culy-import en een foto-import met synthetische recepttekst zijn eerder uitgevoerd. Een echte camerafoto is nog niet bewezen.
- De echte mandjesproef is geslaagd: één verpakking Gele uien, 3 stuks, € 0,80. Actie `e88f50b6-b701-4e75-81df-67c64e508826` is `succeeded`; herladen herstelde dezelfde status. Deze toestemming is verbruikt. Niet opnieuw toevoegen.
- De mandprijsfix gebruikt een expliciete PRICE-decorator uitsluitend bij ondubbelzinnig één artikel en één verpakking. Algemene promotie- en staffelberekening is hiermee niet bewezen.
- De mandjeregel meldde `is_available: false`, ondanks geaccepteerde toevoeging en `max_count: 50`. Bewaar deze tegenstrijdigheid; interpreteer haar niet als bewijs van toekomstige leverbaarheid of als reden om opnieuw te verzenden.
- De laatste mandprijswijziging is gecontroleerd met 11 adaptertests, Worker-typecheck en diffcontrole. Eerdere flowcontroles omvatten 175 tests en daarna drie hersteltests. Dit is historisch bewijs, geen nieuwe volledige-suite-uitkomst.
- Migraties 0011–0013 zijn volgens de overdracht lokaal toegepast. Controleer de werkelijke migratiestatus voordat nieuwe migraties worden gemaakt. De werkmap bevat veel ongecommitte gebruikerswijzigingen en lokale gegevens.
- De huidige `shopping_catalog` is een cache per eigenaar, koppeling, generatie en zoekterm met tien minuten geldigheid. Zoekresultaten zijn lokaal begrensd op 40; dit is geen complete Picnic-catalogus.
- De matcher gebruikt vooral namen en vaste regels. Zowel voorstelvoorbereiding als verzending controleren gekozen producten opnieuw via zoekresultaten. Een product buiten de eerste 40 resultaten kan daardoor onterecht ontbreken.
- Decisions, productdetails op verkoop-ID, categorieontdekking en catalogussynchronisatie zijn nog niet geïntegreerd. Accounttoegang tot Decisions en geschikte productdetailvelden moeten worden bewezen.
- Er is geen productiedeployment of complete online tweepersoonsproef aangetoond. De online pilot blijft een afzonderlijke releaseopdracht.

Bronnen: [catalogusonderzoek](PICNIC-CATALOGUS-ONDERZOEK-EN-PLAN.md), [productafspraken](RECEPT-NAAR-MANDJE-PLAN.md), [verificatie](RECEPT-NAAR-MANDJE-VERIFICATIE.md). Oudere documenten bevatten inmiddels achterhaalde blokkades en productroutes; gebruik ze voor achtergrond, niet om de gebouwde flow terug te draaien.

## 2. Vaststaande productgrenzen

Behoud URL/foto als invoer, één recept per keer, zichtbare voorraad standaard uit, ontbrekende ingrediënten zonder blokkade van de rest en expliciete toestemming voor inhoudelijke vervangingen. Combineer dezelfde verenigbare ingrediëntbehoeften vóór verpakkingsafronding. Verse en gedroogde vormen blijven verschillend.

Bereken porties, eenheden, verpakkingsaantallen en prijzen met code. Kies binnen passende producten de goedkoopste voldoende hoeveelheid. Een expliciet onthouden passend en beschikbaar product mag voorrang krijgen; toon een goedkoper passend alternatief. Trek bestaand mandje niet automatisch van de receptbehoefte af. Deze uitbreiding voegt geen mandtoewijzing of automatische dieetpersonalisatie toe.

Behoud de huidige aankooproute met één SKU per ingrediëntgroep. De pure optimizer voor combinaties van verpakkingsgroottes is aanwezig, maar het aansluiten daarvan op contracten, interface en uitvoering is een afzonderlijke uitbreiding. Geen nieuwe productfamilies afleiden uit alleen naam of modelantwoord.

## 3. Gewenste architectuur

De route wordt: bron importeren → ingrediënten groeperen → gecontroleerde lokale relaties zoeken → ontbrekende kandidaten bij Picnic zoeken → noodzakelijke productdetails ophalen → regels en Decisions beoordelen → voldoende verpakkingen en prijs berekenen → voorstel tonen → actuele controle op verkoop-ID → bestaande duurzame toevoegactie.

Splits vier verantwoordelijkheden:

1. **Catalogus:** producten vinden, normaliseren en verversen; geen oordeel over receptgeschiktheid.
2. **Matching:** relatie tussen ingrediëntkenmerken en productinhoud beoordelen; geen prijsoptimalisatie.
3. **Berekening:** hoeveelheden, verpakkingen en totale kosten bepalen; geen modelaanroep.
4. **Uitvoering:** goedgekeurde selectie controleren en versturen; geen nieuwe vervanging of betaalde classificatie tijdens mutatie.

Gebruik bestaande D1, queues en onderhoudsinfrastructuur. Geen extra zoekdienst, vectordatabase of leverancier in deze fase. Algemene gegevens blijven aanvankelijk eveneens binnen de waargenomen accountcontext; deel pas tussen gebruikers na bewijs en een expliciete ontwerpkeuze.

## 4. Gegevensmodel

Maak nieuwe migraties na het hoogste werkelijk aanwezige nummer. Breid bestaande tabellen aan met behoud van recepten, voorkeuren, voorstellen en acties. Maak vóór een lokale datamigratie een consistente backup, inclusief benodigde SQLite-journal/WAL-gegevens, en bewijs herstel op een aparte testkopie.

| Gegevens | Minimale inhoud en geldigheid |
| --- | --- |
| Productrecords | Eigenaar/context, markt, verkoop-ID, naam, merk, verpakking, afbeeldingsreferentie, eerste/laatste waarneming |
| Productdetails | Relevante beschrijving, productsoort, vorm, originele informatiesecties, ingrediënten, aparte allergenengroepen, parser-versie en inhoudsfingerprint |
| Productwaarnemingen | Koppeling/generatie, prijs en prijszekerheid, staffels, beschikbaarheidsstatus, bestellimiet, bronroute en controletijd; slotcontext alleen indien werkelijk waargenomen |
| Ingrediëntrelaties | Ingrediëntkenmerken, verkoop-ID, inhoudsfingerprint, oordeel, herkomst, regels/prompt/modelversie en beoordeeltijd |
| Matchpogingen | Unieke payloadsleutel, eigenaar/context, status, kostenreservering, gebruik, providerrequest-ID en gesaneerde foutcode |
| Scans en taken | Bereik, checkpoints, lease, taakstatus, pogingen, aantallen, formatversie en bewijs van dekking |

Houd inhoudsfingerprint en commerciële fingerprint apart. Samenstelling, vorm of relevante naamwijziging maakt een match ongeldig; alleen een prijswijziging niet. Een verpakkingswijziging vernieuwt altijd de berekening en ook de beoordeling als die verpakking onderdeel van het inhoudelijke bewijs was.

Persoonlijke voorkeuren geven geen bewijs van geschiktheid. Valideer ze tegen de huidige relatie en productgegevens. Neem alle nieuwe gegevens op in accountverwijdering en retentie. Bewaar alleen gesaneerde relevante fixtures; volledige app-pagina's of analytics niet standaard opslaan.

## 5. Uitvoering in fasen

### Fase 0 Basis vaststellen en bewaren

Lees de actuele overdracht en toepasselijke AGENTS.md, inspecteer gitstatus en de relevante code. Behoud alle bestaande wijzigingen, vooral `src/services/picnicService.ts`. Controleer frontend/Worker en bestaande lokale acties zonder een nieuwe aankoopronde te starten.

Leg een baseline vast voor één bestaand Culy-recept en één bestaand testrecept: aantal kandidaten, Picnic-aanvragen, tijd tot voorstel en bestaande selectie. Hergebruik imports; geen nieuwe betaalde bronextractie voor matchingonderzoek. Voer alleen controles uit die nodig zijn om de nieuwe veranderingen te beoordelen.

Oplevering: korte baseline en gecontroleerde datamigratiestatus. Bestaande gele-uienactie blijft ongewijzigd.

### Fase 1 Bewijs Picnic leesroutes en normalisatie

Breid `worker/adapters/picnic.ts` en de providerinterface uit met begrensde productdetails op verkoop-ID en categoriepagina's. Gebruik de bestaande serverkoppeling en toegestane leesroutes. Geen credentials handmatig uit opslag halen of buiten de app ontsleutelen.

Bouw een lokale, geauthenticeerde diagnostische route of CLI die via de app-service loopt. Begin met categorieboom, enkele categorieën en 20 representatieve details; breid alleen uit tot maximaal 50 wanneer extra velden/gevallen dat nodig maken. Eén leesrequest tegelijk; configureerbare vertraging, responsgrens, timeout en maximaal aantal verzoeken per proef.

Controleer Fusion en RSC, verwijzingen en mogelijke vervolglading. Volg uitsluitend waargenomen toegestane leesverwijzingen; voer nooit scripts uit. Noteer route, contenttype, velddekking, latency, cacheheaders en fouten. Bewaar gesaneerde fixtures voor gewone/verse producten, onbekende prijzen, bundels en aanbiedingen indien aangetroffen.

Normaliseer ontbrekende prijs of bestellimiet als onbekend. Bewaar ‘Bevat’ en ‘Bevat mogelijk’ apart met originele tekst. Scheid bestellimiet van voorraad. Los tegenstrijdige beschikbaarheidsvelden niet op met een algemene regel dat `max_count > 0` altijd beschikbaar betekent.

**Beslispunt:** productdetails zijn bruikbaar voor actuele controle alleen als prijs, verpakking, bestelbaarheid en ID betrouwbaar uit de response blijken. Anders onderzoek één aanvullende waargenomen leesroute. Een zoeklijst zonder het product bewijst geen verwijdering.

Oplevering: werkende leesadapter, fixturetests en velddekkingsverslag. Onvolledige categorieën blokkeren latere matching niet; ze blokkeren alleen de claim en activering van een volledige scan.

### Fase 2 Productindex aansluiten op bestaande zoekflow

Voeg productopslag en contextgebonden waarnemingen toe. Vul die bij huidige zoekopdrachten en productdetailaanvragen. Behoud `shopping_catalog` als tijdelijke zoekcache en migreer haar bruikbare waarnemingen zonder ze als volledige catalogus te presenteren.

Zoek voor een ingrediënt eerst geldige lokale relaties en indexkandidaten. Vul ontbrekende of verouderde kandidaten aan via Picnic. Bewaar afkomst en leeftijd; de lokale index is geen garantie van actuele prijs/beschikbaarheid. Een onbekend ingrediënt moet nog steeds live kunnen zoeken.

Haal details selectief op voor kandidaten die zonder aanvullende informatie niet kunnen worden beoordeeld. Beperk kandidaten en prioriteer op lexicale relevantie en reeds bewezen relaties; snijd niet uitsluitend op goedkoopste prijs af. Registreer truncatie, zodat ‘geen passende kandidaat gevonden’ geen claim wordt over het hele assortiment.

Oplevering: herhaald zoeken en productpopup gebruiken geldige lokale gegevens; merk/afbeelding waar beschikbaar. Een traag Picnic-verzoek blokkeert het bekijken van bestaande kandidaten niet. Verse aankoopcontrole blijft verplicht.

### Fase 3 Matchingcontract en regels scheiden

Splits `classifyProduct`, `candidateFor` en `rankCandidates` in `worker/domain/shopping.ts` zodat berekening een reeds vastgestelde beoordeling accepteert. Gebruik dezelfde beoordelingsservice bij plan en voorstelvoorbereiding.

Vier statussen: `suitable`, `substitution`, `unsuitable`, `unresolved`. Alleen passende kandidaten met bruikbare hoeveelheid en prijs mogen automatisch geselecteerd worden. Vervangingen vereisen expliciete keuze; ongeschikt wordt niet aangeboden. Onvoldoende informatie blijft zichtbaar en wordt niet door een generiek akkoord op het hele voorstel automatisch passend.

Harde uitsluitingen zoals verkeerde productsoort of strijdige expliciete receptkenmerken mogen niet door Decisions worden opgeheven. Scheid bewezen negatieve regels van regels die alleen ‘nog onbekend’ betekenen. Herzie de huidige naamfilters zodat een onbekende passende kandidaat kan worden onderzocht.

Breid `shared/shopping.ts` en de productpopup uit zonder extra standaardscherm: passende alternatieven, apart vervangingen, compacte onzekerheid en geen confidence-percentages als kwaliteitsbelofte.

Oplevering: regelflow werkt zonder Decisions, inclusief correcte serverbevestiging en opt-invoorkeuren. Regressies omvatten knoflookchips, uiensoep en verschillende ingrediëntvormen.

### Fase 4 Decisions adapter en kostenbewaking

Maak `worker/adapters/decisions.ts` achter een injecteerbare providerinterface. Gebruik uitsluitend servercredentials en het bestaande OpenAI-account. Controleer vóór live gebruik huidige officiële schema's, prijzen, accounttoegang en regionale instellingen. De geraadpleegde API is publieke beta met `gpt-6-luna`.

Gebruik een `choice`-vraag per ingrediënt-productpaar met de vier statussen. Geef uitsluitend noodzakelijke ingrediëntkenmerken, productnaam, categorie en relevante detailfragmenten. Beschouw broninhoud als onbetrouwbare data. Geen receptfoto of volledige kennisbank nodig voor deze matchingstap. Combineer onafhankelijke vragen alleen binnen aantoonbare limieten en een begrensde payload.

Valideer antwoordtype, vraagnamen, antwoordaantal, labels en eventuele waarschijnlijkheden. Weigering, ontbrekende antwoorden en ongeldige respons worden onbeslist. Bewaar model-, prompt- en beoordelingsversie. Een modeloordeel is aanvankelijk een kandidaatrelatie, geen handmatig bewezen match.

Voeg standen `off`, `shadow`, `enabled` toe. `shadow` beïnvloedt de selectie niet. Vraag Decisions alleen voor resterende onbekende/ambigue gevallen; hergebruik beoordelingen op ongewijzigde inhoud.

Breid budgetreservering uit naar matchpogingen buiten import. Behoud €15 per maand totaal en €5 per gebruiker, gezamenlijk voor import én matching. Atomiciteit voorkomt overschrijding bij gelijktijdige plannen. Controleer hoe exacte invoertelling voor Decisions werkt; neem Responses-telling niet als ondersteund aan. Als geen betrouwbare telling of aantoonbaar conservatieve bovengrens mogelijk is, blijft betaalde verzending uitgeschakeld.

De geraadpleegde basisprijs is $0,10 per miljoen invoertokens zonder uitvoer-/cachekosten. Controleer toeslagen en valutareservering; leg configuratie en prijscontroledatum vast. Bewaar kosten intern met voldoende precisie, zodat veel kleine matches niet ieder een cent werkelijke kosten suggereren. Onbekende uitkomst houdt een conservatieve reservering vast.

Dedupliceer met een duurzame payloadsleutel/lease. UI-herladen, porties wijzigen, popup openen en opnieuw aangeboden queueberichten mogen geen identieke betaalde beoordeling starten. Leg grenzen vast voor tokens, vragen, kandidaten, jobs, timeout en pogingen. Geen automatische retry na onbekende verzending; bewezen niet verzonden tijdelijke fouten mogen alleen binnen expliciete grenzen worden herprobeerd.

Oplevering: adapter en budgettests met mocks; betaalde proef blijft beperkt tot vooraf vastgesteld proefbudget en verifieerbare toegang. Dit plan op zichzelf verhoogt geen budgetten of activeert abonnementen.

### Fase 5 Kwaliteit aantonen en automatisch gebruik toelaten

Maak 50–100 handmatig gelabelde Nederlandse paren met positieve én negatieve gevallen: kookroom/slagroom, vers/gedroogd, puree/passata/blokjes, vlees/vegetarisch, merkvereisten, bundels, snacks met ingrediëntsmaak en ontbrekende details. Gebruik echte gesaneerde productgegevens waar mogelijk.

Vergelijk regels, Decisions in shadow en eventueel de reeds beschikbare Responses-route op dezelfde cases. Jev is geen dependency. Splits ontwikkelset en afzonderlijke testset; kies drempels op de ontwikkelset. Meet foute automatische matches, correcte passende matches, onbesliste gevallen, correcties, kosten en p50/p95 latency.

Startcriteria voor beperkte automatische inzet: nul verkeerde automatische productsoorten/strijdige varianten in de kritieke regressieset; alle weigeringen en onvoldoende bewijs blijven onbeslist; prestaties en kosten passen binnen de baseline en ingestelde grenzen. Dit is een proefcriterium, geen garantie voor het hele assortiment. Als kwaliteit onvoldoende is, houd Decisions in shadow en maak de overige integratie af.

Oplevering: verslag met werkelijke aantallen en voorbeelden; expliciet onderscheid tussen mocked contracttests en echte betaalde modelresultaten.

### Fase 6 Actuele controle en duurzame toevoeging aansluiten

Vervang controle via oorspronkelijke zoekterm door de bewezen verkoop-ID-route in zowel `worker/routes/shopping.ts` als `worker/additions/processor.ts`. Een prijs-, voorraad- of detailfout wordt niet ‘product verwijderd’. Controleer juiste gebruiker, koppeling/generatie, receptversie, verpakking, limiet en geaccordeerde prijs.

Bij voorstelvoorbereiding hergebruik je de opgeslagen inhoudelijke beoordeling alleen als de fingerprints nog gelden. Bij veranderde inhoud moet het voorstel eerst worden herbeoordeeld en getoond. Tijdens verzending geen betaalde classificatie of productwisseling. Een gewijzigd voorstel vraagt opnieuw akkoord volgens de bestaande prijsregels.

Bewaar beoordelings-ID, inhoudsversie en commerciële controle in de proposalsnapshot. Frontendlabels of product-ID's alleen zijn geen autorisatie voor geschiktheid. Een voorkeur kan alleen voor een passende relatie worden opgeslagen.

Versterk ook toevoegbewijs: de huidige adapter accepteert een structureel geldige ORDER-response; dat bewijst op zichzelf niet het bedoelde product en aantal. Bewaar een relevante uitgangswaarneming en valideer de ontvangen mutatie-uitkomst waar de response voldoende bewijs bevat. Een mandverschil alleen bij mogelijke gelijktijdige wijzigingen is onvoldoende. Ontbrekend bewijs wordt onbekend en nooit automatisch opnieuw verstuurd.

Behoud duurzame sendmarkers en één uitvoering per koppeling. Bulktoevoegen is buiten scope. Aantoonbaar niet verzonden regels en onbekende mutatie-uitkomsten blijven onderscheiden. De reeds geslaagde gele-uienactie wordt niet gewijzigd of gereplayd.

Oplevering: integratietests met product buiten de zoeklimiet, prijswijziging, productinhoud gewijzigd, limiet bereikt, verkeerde generatie, dubbele bevestiging, onzekere response en geen tweede externe verzending.

### Fase 7 Hervatbare synchronisatie

Bouw kleine taken voor categorieontdekking, productdetails en eventueel herbeoordeling. Gebruik bestaande queue/scheduled-infrastructuur met checkpoints, leases, deduplicatie en grenzen per run. Een retrybare leesaanvraag is iets anders dan een niet herhaalbare mandmutatie of onbekende betaalde modelpoging.

Startbeleid: categorieontdekking wekelijks indien fase 1 dekking bewijst; veelgebruikte details wekelijks; overige details verspreid over een maand. Prijs/beschikbaarheid blijven kort gecachet per verbinding en worden vóór mutatie vers gecontroleerd. Alleen relevante inhoudswijziging plant een nieuwe classificatie; niet iedere wekelijkse waarneming.

Begin met één leesaanvraag tegelijk en configureerbare vertraging. Respecteer Retry-After, vertraag bij 429, pauzeer bij authproblemen en stop bij onverwacht formaat of opvallende daling. Taken controleren koppeling/generatie opnieuw. Geen globale scan door willekeurige gebruikersaccounts.

Ontbreken betekent eerst ‘niet gezien’. Alleen geslaagde vergelijkbare scans met bewezen dekking en aanvullende controle mogen ‘mogelijk verdwenen’ opleveren. Mislukte/onvolledige scans veranderen nooit massaal productstatussen. Zonder volledige categorieproef onderhoudt de synchronisatie uitsluitend al ontdekte producten en groeit de index via recepten.

Oplevering: onderbreken/hervatten zonder dubbele verwerking, geen cross-user data en geen massale verwijdering bij parserfout. Automatische scans lokaal verifiëren; productieactivering valt onder een afzonderlijke deploymentopdracht.

### Fase 8 Volledige verificatie en overdracht

Voer gerichte tests per fase uit. Op de uiteindelijke samenhangende code één volledige Worker-suite, Worker-typecheck, frontend-typecheck, productiebuild en diffcontrole. Browsercontrole op desktop en mobiele breedte met bestaande imports, productpopup, voorkeuren, onbesliste regels en herladen.

Test providerfouten, budgetlimiet, concurrente plannen, accountisolatie, ontkoppelen, retentie en invalidatie. Gebruik mocks voor mandmutaties. Een nieuwe echte mandproef vereist een nieuwe concrete gebruikersopdracht; de bestaande gele-uienproef geeft daarvoor geen toestemming. Een echte camerafoto en online OTP/tweepersoonsroute zijn afzonderlijke resterende pilotbewijzen.

Werk verificatierapport en volgende-sessieprompt bij met uitgevoerde fasen, werkelijke testuitkomsten, migraties, meetresultaten en blokkades. Werk alleen verouderde actuele statusregels bij; herschrijf historische verslagen niet alsof ze destijds anders waren.

## 6. Grenzen en uitwijkroutes

| Onzekerheid | Voortgang zonder ongefundeerde aannames |
| --- | --- |
| Categorieën niet volledig leesbaar | Index vanuit zoekopdrachten en bekende verkoop-ID's; geen volledige catalogusclaim |
| Details missen actuele prijs/bestelbaarheid | Aanvullende bewezen leesroute onderzoeken; onbeslist blijven bij ontbrekend bewijs |
| Decisions-toegang of inputkosten niet betrouwbaar | Adapter, opslag, contracten en mocks afronden; `off` behouden |
| Decisions-kwaliteit onvoldoende | `shadow`; bewezen regels en expliciete gebruikerskeuzes blijven werken |
| Budget bereikt of provider traag | Bestaande matches tonen, overige regels onbeslist; geen fictieve matches |
| Picnic-koppeling gewijzigd | Bijbehorende controles en taken ongeldig; geen verzending op oude generatie |
| Mutatie mogelijk uitgevoerd | Onbekende uitkomst; geen automatische herhaling |

## 7. Startopdracht voor een nieuwe sessie

Kopieer onderstaande opdracht naar een nieuwe chat in deze repository:

```text
Werk in /Users/stef/Code/picnic.

Implementeer docs/CATALOGUS-EN-DECISIONS-IMPLEMENTATIEPLAN.md in de beschreven volgorde. Lees eerst dat plan, docs/RECEPT-NAAR-MANDJE-VERIFICATIE.md inclusief de echte mandjesproef van 9 oktober, en docs/PICNIC-CATALOGUS-ONDERZOEK-EN-PLAN.md. Gebruik docs/RECEPT-NAAR-MANDJE-PLAN.md voor de bestaande productafspraken. Oudere statusdocumenten bevatten historische beperkingen: draai de inmiddels gebouwde flow niet terug.

Begin met fase 0 en de begrensde Picnic-leesproef van fase 1. Bouw daarna de index, inhoudelijke matching en Decisions-adapter, gedeelde beoordeling bij plan/bevestiging, betrouwbare actuele controle op verkoop-ID en hervatbare synchronisatie voor bewezen routes. Jev voorlopig niet integreren. Ga zelfstandig door met alle onderdelen die niet afhangen van een aangetoonde blokkade; leg beslispunten en werkelijke resultaten vast.

Behoud alle bestaande wijzigingen, recepten, browseropslag en lokale acties, vooral src/services/picnicService.ts. Migratie 0013 is volgens de overdracht al lokaal toegepast; controleer dit. Maak een consistente backup vóór datamigraties. Geen reset, clean, deployment, subagents, nieuwe abonnementen of hogere budgetten. Gebruik bestaande app-services voor Picnic-toegang; print of ontsleutel geen credentials buiten die route.

De echte gele-uienactie e88f50b6-b701-4e75-81df-67c64e508826 is succeeded en de toestemming is verbruikt. Niet opnieuw toevoegen. Geen andere echte mandmutaties zonder nieuwe concrete opdracht. Bereid een eventuele nieuwe proef eerst volledig voor. Beperk betaalde Decisions-proeven tot een vooraf vastgesteld klein proefbudget binnen de bestaande gebruikers- en appmaxima; als dat budget of betrouwbare kostentelling ontbreekt, rond adapter/mocks en onafhankelijke fasen af en rapporteer precies wat live nog nodig is.

Herbruik bestaande imports, geef korte concrete voortgang, test zelf en onderscheid echte providerresultaten van mocks. Voer relevante checks per fase en één volledige eindcontrole uit. Werk het verificatierapport en de overdracht bij. Stop niet bij alleen een plan of ongeteste code; lever werkende onderdelen en exact onderbouwde resterende blokkades.
```

## 8. Technische bronnen

- [OpenAI Decisions handleiding](https://developers.openai.com/api/docs/guides/decisions): antwoordtypen, meerdere vragen, kalibratie en geraadpleegde prijzen.
- [Decisions API-reference](https://developers.openai.com/api/reference/resources/decisions/methods/create): request- en responsecontracten, weigeringen en invoergrenzen.
- [OpenAI gegevensbeleid](https://developers.openai.com/api/docs/guides/your-data): accountvoorwaarden, retentie en regionale verwerking vóór pilot toetsen.
- [Picnic catalogusonderzoek](PICNIC-CATALOGUS-ONDERZOEK-EN-PLAN.md): wrapperroutes, parserbeperkingen en synchronisatiehypothesen. Live dekking wordt in fase 1 vastgesteld.

Het plan kiest de architectuur en uitvoeringsvolgorde. Beschikbaarheid, tarieven, categoriedekking en modelkwaliteit worden op de relevante beslispunten gecontroleerd; ze zijn geen reeds behaalde implementatieresultaten.
