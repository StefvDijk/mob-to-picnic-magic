# Dependency-audit bij start MVP

Uitgevoerd op 8 oktober 2026 met `npm audit --json --fetch-timeout=15000 --fetch-retries=0`, na installatie van de lokale Workers-testomgeving. Dit is een nulmeting, geen beveiligingsakkoord.

De registry rapporteert 36 meldingen: 29 hoog en 7 middel. Aantallen omvatten doorwerking van dezelfde advisory via bovenliggende pakketten; het zijn niet automatisch 36 verschillende exploiteerbare fouten in de app. De ruwe lokale uitvoer staat tijdens deze sessie in `/tmp/picnic-mvp-npm-audit.json` en kan opnieuw worden gegenereerd.

Te onderzoeken groepen: bestaande routerdependencies, TypeScript/ESLint-tools, Tailwind/glob/PostCSS en de nieuwe Wrangler/Miniflare/teststack. Automatische fixvoorstellen zijn niet zonder beoordeling geschikt: de audit stelt onder andere Vitest-plugin `0.0.0` en een oudere Wrangler voor. Geen geforceerde downgrade of major frameworkmigratie uitvoeren uitsluitend om het aantal meldingen te verminderen.

De beveiligingsmanager moet per advisory de werkelijk getroffen versie, uitvoerpad (productie, lokale ontwikkeling of alleen test), gepatchte versies en bereikbaarheid bepalen. Relevante updates worden uitgevoerd en gevolgd door build, typechecks en toepasselijke tests. Een nog open melding vereist een expliciete technische onderbouwing; ‘alleen development’ is op zichzelf geen beoordeling.

De oude Picnic-browserimport wordt bij de frontendmigratie verwijderd uit de productiebundel. De tijdelijke tweede wrapperdependency beschermt de bestaande, afzonderlijke gebruikerswijziging; zij is geen keuze om Picnic-geheimen in de browser te bewaren.
