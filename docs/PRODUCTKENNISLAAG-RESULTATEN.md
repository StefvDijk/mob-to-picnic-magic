# Productkennislaag: lokale oplevering en bewijs

9 oktober 2026. Gebouwd in de bestaande gewijzigde werkboom. Geen deployment, mandmutatie, uitnodiging of betaalde modelaanvraag uitgevoerd. Bestaande wijzigingen zijn behouden. Dit is een werkende verticale uitvoering van het uitvoeringsplan; de volledige assortimentsinventarisatie en onafhankelijke 100-receptenbenchmark zijn niet afgerond.

## Architectuur en gegevens

`worker/catalog/knowledge.ts` interpreteert bestaande productwaarnemingen. Productsoorten gebruiken de stabiele IDs uit `shared/ingredient-knowledge.ts`, aangevuld met `vanilla-extract`. Vormwaarden zijn onder meer `fresh`, `dried`, `powder`, `fermented`, `paste`, `extract`, `juice`; smaakwaarden onderscheiden naturel en aangetroffen smaakvarianten. Elk veld heeft `known`, `unknown` of `conflict`, een waarde en bewijs met methode, veldpad en relevante brontekst. Ontbrekende informatie wordt niet ingevuld. Verpakking bewaart oorspronkelijke tekst en getypeerde hoeveelheid; geen impliciete gram/ml-conversie.

De kleine taxonomie is een start, geen volledige productontologie. Productnamen, de eerste beschrijvende zin en expliciete productomschrijvingen leveren identiteit. Markdown-koppen worden ondersteund. Ingrediënten, allergenen, voedingswaarde en bereidingsinstructies zijn geen identiteitbewijs. Die bronfeiten blijven afzonderlijk in de bestaande `details_json`; samenstelling wordt nog niet volledig in losse getypeerde bestanddelen ontleed. Tegenstrijdige productidentiteit/vorm/smaak verhindert automatische toepassing. “Gemalen” ondersteunt de aankoopvorm “poeder”; marketingnamen kunnen via een bewezen productomschrijving een soort krijgen. Er is geen SKU- of merk-hardcoding.

Migratie `0018_product_knowledge.sql` voegt nullable `knowledge_json`, `knowledge_version` en `search_text` toe aan `catalog_products`. Bewijs en semantische index blijven daardoor binnen dezelfde eigenaar/koppeling/generatie/markt, bestaande cascadeverwijdering en 90-dagenretentie. Kennis bevat analysetijd; de record bewaart bronroute, waarnemingstijd en inhoudsfingerprint. De kennisversie bevat ook de ingrediëntvocabulaireversie. Gewijzigde naam, verpakking, getypeerde hoeveelheid, samenstelling/detail of parser maakt de inhoudsfingerprint ongeldig. Alleen prijswijziging hergebruikt dezelfde analyse; commerciële gegevens blijven apart.

Retrieval filtert in SQL vóór de limiet van 40. De voormalige afkap op de 200 nieuwste records is verwijderd. Synoniemen en bewezen marketingidentiteit zijn doorzoekbaar. Ook een geldige zoekcache wordt aangevuld uit de index. Semantische waarnemingen kunnen 90 dagen worden gevonden; na tien minuten zijn prijs en beschikbaarheid uit de index onbekend. Een echte zoek-/detailwaarneming moet commerciële gegevens opnieuw bewijzen. Zoekcacheversie `picnic-products-v3-semantics` bewaart uitsluitend echte zoekresultaten, met hun oorspronkelijke waarnemingstijd. Indexkandidaten worden niet als nieuwe waarnemingen teruggeschreven; oudere cachewaarnemingen kunnen recentere records niet overschrijven. De bestaande verkoop-ID-controle vóór bevestiging blijft verplicht.

`worker/matching/knowledge.ts` combineert veldbewijs met de bestaande receptconstraints. Voorstel en bevestiging gebruiken dezelfde service. Vanille-extract blijft een expliciete vervanging. Kaneel zonder bewezen poedervorm en oregano zonder versbewijs blijven onzeker. Rekenen, bronregels, afronding en zichtbare lepel-/stuksinschattingen blijven in de bestaande domeinlaag.

Deterministische relaties worden per maximaal 40 kandidaten gelezen/geschreven; concurrerende plannen krijgen de canonieke opgeslagen relation-ID. Het modelpad behoudt de bestaande ledger/deduplicatie en staat uit. De interactieve detailpool blijft maximaal twintig unieke reads, drie tegelijk en één gedeelde deadline. Bij een berekenbare naamkandidaat worden onbekende alternatieven niet meer allemaal onderzocht; bij een gat worden maximaal twee plausibele onzekere kandidaten onderzocht. Voor de eerst berekenbare niet-keukenkastkandidaat wordt ontbrekend detailbewijs behouden, zodat bevestiging niet op een nieuwe fingerprint verrast. Onverkende alternatieven blijven onzeker.

## Achtergrond en gecontroleerde dekking

`worker/catalog/enrichment.ts` verwerkt maximaal 40 reeds opgeslagen waarnemingen per batch, zonder Picnic of modellen. De kennisversie is het duurzame checkpoint; fingerprint en actieve account/koppeling/generatie worden vóór opslag gecontroleerd. Waarnemingstijd en retentie schuiven niet op door deze analyse. De bestaande scheduled-handler roept dit onderhoud aan. De lokale CLI gebruikt dezelfde implementatie.

Bestaande detailtaken krijgen prioriteit voor ontbrekende details en voor oude waarnemingen. Claims controleren ook accountstatus; een verkeerd verkoop-ID of disconnect tijdens de read wordt niet opgeslagen. De externe onderhoudsroute blijft met `CATALOG_SYNC_ENABLED=off` uitgeschakeld. Er is geen nieuwe categoriepilot uitgevoerd en geen automatische volledige scan geactiveerd. Scanrun-tabellen, bewezen paginering en een category-leasecontroller blijven vervolgwerk; bestaande `catalog_tasks` levert checkpoints/leases voor reeds ontdekte producten.

De bevroren beginbackup bevat **642 productwaarnemingen, 329 met details**. Deterministische analyse geeft **280 bekende soorten, 26 bekende vormen**. Deze denominatoren beschrijven alleen bestaande waarnemingen; het totale Picnic-assortiment is onbekend. Alle 642 records zijn lokaal verrijkt in 17 begrensde batches, met nul providerrequests en nul betaalde requests. Inhoud die niet is bewezen blijft onbekend.

Geïnstalleerde Worker-wrapper gecontroleerd: `picnic-api-worker` is `picnic-api@4.10.0`; de oudere frontenddependency is 3.1.3. Actuele primaire [wrapperdocumentatie](https://github.com/MRVDH/picnic-api), [catalogusbron](https://raw.githubusercontent.com/MRVDH/picnic-api/main/src/domains/catalog/service.ts) en [paginabron](https://raw.githubusercontent.com/MRVDH/picnic-api/main/src/domains/app/service.ts) zijn opnieuw geraadpleegd. De wrapper is onofficieel; de geraadpleegde zoekmethode levert geen bewezen servercursor voor het hele assortiment. Daarom is geen volledigheidsclaim of brede crawl gestart.

## Evaluatie en lokale app

De herhaalbare offline replay draait op de beginbackup. Broninhoud blijft buiten Git; het gesaneerde resultaat bewaart hashes, versies, aantallen, gekozen verkoop-ID's, verpakkingen en redenen. Zie `docs/benchmarks/product-knowledge-replay-v1.json` en `scripts/product-knowledge-benchmark.mjs`.

- Culy: **15 gekozen producten**, sherryazijn onzeker. Kaneelpoeder en verse oregano worden met reeds aanwezig detailbewijs passend. De eerdere overdracht registreerde 13 keuzes; dat historische aantal is geen opnieuw gedraaide oude-codebaseline.
- Foto: **6 gekozen producten**, vanillepasta onzeker; zout staat uit. Negen bronregels, acht groepen, honing 3½ tbsp samengevoegd tot zichtbaar geschatte 73½g. Kokosyoghurt 350g, twee mango's en twee verpakkingen van drie passievruchten blijven correct berekend.
- **15 handmatig gespecificeerde ontwikkelparen**: 15 voldoen aan het vooraf opgegeven automatische-gebruiklabel. Zes automatische goedkeuringen zijn alle zes correct; zes beoordelingen onthouden zich. De overige drie zijn expliciete vervangingen. Positieve coverage 6/6; automatische precision 6/6. Dit zijn productparen, geen vijftien volledige recepten, en geen gesloten onafhankelijke testset. Wilson 95%-interval voor 6/6 is ongeveer 61–100%; voor 15/15 ongeveer 80–100%. Dit bewijst geen 99% of 95% betrouwbaarheid.

De referentie-evaluator ondersteunt nu bronmaten `tbsp`/`tsp` en ranges met maximum, zonder fictieve grammen. Verplichte onbeschikbare of niet bewezen beschikbare ingrediënten laten het hele recept falen; ze worden niet stilzwijgend uit het gebruikersdoel verwijderd. Recall@5/@10 en verpakkingscorrectheid worden afzonderlijk gerapporteerd. Unknown/global bronhoeveelheden en volledige onafhankelijke bronadjudicatie zijn nog niet volledig afgedekt.

Browserproeven gebruiken de normale, door de eigenaar ingelogde app en opgeslagen herkenning. Geen authbypass, nieuwe import of klik op toevoegen. De klok begint bij **Zoek mijn boodschappen**, dus exclusief eerdere herkenning/upload. Browserobservaties zijn bovengrenzen; serverduren meten alleen de planroute. Dat onderscheid voorkomt een onterechte submit-tot-resultaatclaim.

| Ontwikkelproef | Keuzes / ontbrekend | Server | Zichtbaar bij observatie |
| --- | --- | --- | --- |
| Culy, bestaande productkennis | 15 / sherryazijn | Niet apart geïnstrumenteerd | 11,83s |
| Foto, bestaande productkennis | 6 / vanillepasta | Niet apart geïnstrumenteerd | 8,93s |
| Foto, warme zoekcache vóór detailprioritering | 6 / vanillepasta | 4,897s; 0 zoek- en 19 detailreads | 14,086s |
| Foto, warme zoekcache na detailprioritering | 6 / vanillepasta | 0,121s; 0 zoek- en 0 detailreads | 5,909s |
| Culy, lege product-/zoekcache in herstelde kopie, eerste ontwikkelvariant | 13 / sherryazijn, kaneel, oregano | 6,098s; 18 zoek- en 20 detailreads | 27,910s |
| Culy, lege product-/zoekcache, gerichte kennishiaten | 15 / sherryazijn | 5,294s; 18 zoek- en 6 detailreads | 21,047s |
| Foto, koude eigen productgroepen na Culy in dezelfde kopie | 6 / vanillepasta | 2,779s; 7 zoek- en 4 detailreads | 27,801s |

De foto in de kopie deelt uitsluitend al opgewarmd zout met Culy; dit is geen volledig lege cache voor ieder ingrediënt. De laatste twee koude ontwikkelmetingen vonden plaats vóór het opnieuw behouden van ontbrekend detailbewijs voor de eerste berekenbare niet-keukenkastkandidaat. Ook de commerciële verouderingscorrectie en zoekcacheversie v3 kwamen na deze metingen. De definitieve code heeft daarvoor geslaagde bevestigings-/fingerprint-/cache-regressies; haar volledige koude en warme requestaantallen zijn nog niet opnieuw live gemeten. Ook de brede p50/p95, upload/herkenningstijd en onafhankelijk juiste verpakkingen op alle Culy-regels zijn niet bewezen.

**Correct én compleet binnen 30 seconden: nul van de twee bestaande recepten**, ondanks snelle resultaten. Beide missen een noodzakelijk product; sommige Culy-hoeveelheden blijven schattingen. Geen ontbrekend product is als assortimentsafwezigheid bewezen. Screenshots staan buiten Git in `/private/tmp/product-knowledge-*.png`; de koude database is een aparte herstelde kopie onder `/private/tmp/picnic-knowledge-cold/`.

## Backup, kosten en vrijgave

Eindcontrole op de definitieve code: **380 Worker-tests in 40 bestanden geslaagd**, plus **8 referentie-evaluator-/migratiechecks**. Worker- en frontendtypecheck, frontendbuild en `git diff --check` slagen. Opslagtests controleren onder meer retrieval voorbij de nieuwste 200 records, alle 205 waarnemingen opslaan, commerciële veroudering, bescherming tegen oudere cacheoverschrijving, disconnect en cascadeverwijdering. Beoordelingstests controleren gedeelde relation-ID's bij concurrerende batches, bronbewijs en harde uitsluitingen bij bevestiging. Bestaande niet-blokkerende waarschuwingen: verouderde Browserslist-data en ontbrekende sourcemapbronnen van de geïnstalleerde wrapper.

Voor migratie is SQLite-backup inclusief WAL gebruikt. Alle tabellen hebben gelijke recordaantallen op de herstelkopie; `integrity_check=ok`. Beginbackup: `/private/tmp/picnic-knowledge-backup-1791542008/`. Migratie 0018 is uitsluitend lokaal toegepast; 14 recepten en 642 producten behouden. De 2268 bestaande relaties bleven bij migratie behouden; nieuwe appproeven voegen relaties toe. Een tweede consistente backup is gemaakt onder `/private/tmp/picnic-knowledge-backup-1791542850/`. Geen retentie- of accountdata verwijderd in de originele database.

De appmaandledger bleef €0,12 besteed en €0,04 gereserveerd bij een cap van €15. De eerdere verslagen schrijven €0,04 aan onderzoeksproeven toe; dat is geen volledige appmaandledger. Deze uitvoering kostte **€0 aan modellen**. Geen unknown betaalde uitkomsten opnieuw verzonden. Decisions blijft uit; actuele Decisions-toegang/pricing is niet nodig geweest en daarom niet als beschikbaar bewezen.

Voor een latere deployment eerst migratie 0018 toepassen en Worker/frontend samen controleren. Oude code kan de nullable nieuwe kolommen negeren. Rollback: vorige code terugzetten en de extra kolommen laten staan; geen destructieve downmigratie nodig. Een volledige databaseherstelactie is een apart herstelbesluit, omdat die latere sessiegegevens kan vervangen. Productieactivering van provideronderhoud vereist een aparte opdracht en bewijs van de leesroute.

## Resterende prioriteiten

1. Vanillepasta/sherryazijn met waargenomen categorie-/detailverwijzingen onderzoeken. Geen model kan niet gevonden producten bewijzen. Volgende categoriepilot: maximaal 50 unieke producten, 75 totale reads inclusief retries, één tegelijk, 250ms instelbare pauze, timeouts, stop op auth/fout, checkpoints en expliciete pagineringsrapportage. Eerst een duurzame runcontroller bouwen; geen grotere uitbreiding zonder apart meetbaar requestbudget.
2. Definitieve koude en warme planroute opnieuw instrumenteren, plus echte submit-tot-resultaattelemetrie. Bewaak bewezen content bij selectie/voorkeur en behoud actuele controle bij bevestiging. Geen onvolledige resultaten als snel succes tellen.
3. Vijftien volledige echte ontwikkelrecepten verzamelen/labelen en vóór verdere tuning een aparte testset sluiten. Daarna uitbreiden naar 100 echte recepten met onafhankelijke beoordeling. Geen nieuwe privéfoto's of accounts doorzoeken. Unknown/global maten en bron-/productfouten expliciet evalueren.
4. Compositionele kenmerken verder typeren; alleen bij aantoonbare semantische gaten een kleine, gebudgetteerde modelvergelijking na nieuwe ledger-/toegangscontrole. De eerste implementatie heeft geen extra leverancier nodig.
