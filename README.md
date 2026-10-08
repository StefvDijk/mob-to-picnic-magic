# Picnic receptenapp

Een besloten, Nederlandstalige webapp om recepten te bewaren, passende boodschappen te controleren en na goedkeuring toe te voegen aan je eigen Picnic-mandje.

De MVP wordt gebouwd volgens het goedgekeurde [bouwplan](docs/BOUWPLAN.md). De actuele implementatie, testresultaten en resterende toelatingspunten staan in [implementatiestatus](docs/IMPLEMENTATION-STATUS.md). De lokale Workers-basis werkt; de volledige nieuwe gebruikersflow is nog in aanbouw.

## Lokaal ontwikkelen

Gebruik Node.js 24 en npm. Installeer de vastgelegde dependencies en bouw eerst de statische bestanden:

```sh
npm ci
npm run build
CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false npx wrangler d1 migrations apply DB --local
```

Start daarna in twee terminals:

```sh
npm run dev:worker
```

```sh
npm run dev
```

De website draait op `http://localhost:5173`; `/api` wordt zonder padwijziging doorgestuurd naar de lokale Worker op poort 8787. `GET /api/health` geeft een minimale status. D1, R2 en queuebindings worden lokaal nagebootst. De eerste beheerder krijgt een afzonderlijke lokale CLI na migratie; die CLI is nog niet geïmplementeerd. Het contract, de testomgeving en productiepoortjes staan in het [operationele runbook](docs/OPERATIONS.md). De oorspronkelijke frontend wordt tijdens de bouw vervangen; een geslaagde healthcheck betekent nog niet dat alle recept- en accountfuncties klaar zijn.

Workers-scripts laden de oude root-`.env` bewust niet automatisch. Gebruik uitsluitend lokale, genegeerde `.dev.vars` voor ontwikkelgeheimen zodra de betreffende integratie is ingericht. Zet geen Picnic-, AI-, e-mail- of authenticatiegeheimen in `VITE_*`: die variabelen kunnen in de browserbundel terechtkomen.

## Controles

```sh
npm run types:worker
npm run typecheck:worker
npx tsc -p tsconfig.app.json --noEmit
npm run test:worker
npm run build
```

De Workers-tests hebben lokale netwerkpoorten nodig. Ze gebruiken geen echte Picnic-accountgegevens. De eerste smoke-tests toetsen opslagbindings en een nagebootst Picnic-loginantwoord; echte queueafhandeling en de volledige acceptatiematrix volgen met hun implementatie.

`npm run lint` en `npm audit` worden ook beoordeeld. Er zijn nog bekende bestaande lintfouten en dependency-advisories; zie het [bewijsregister](docs/IMPLEMENTATION-STATUS.md) en de [dependency-nulmeting](docs/reviews/DEPENDENCIES.md).

## Structuur

- `src/`: React-interface, in migratie vanaf het oorspronkelijke prototype.
- `worker/`: nieuwe Cloudflare-backend, domeinlogica, adapters en duurzame verwerking.
- `migrations/`: D1-schema en migraties zodra de databasefase is opgenomen.
- `shared/`: browserveilige contracten tussen frontend en backend.
- `test/`: lokale Workers-proeven; domeintests staan ook bij de betreffende modules.
- `docs/`: productafspraken, ontwerp, uitvoering en beoordelingen.

De oude Express-server in `server/` is historisch prototypewerk en niet de nieuwe pilotbackend. De tijdelijke dependencies `picnic-api` 3.1.3 en `picnic-api-worker` 4.10.0 houden bestaande broncode en nieuwe backend gescheiden tijdens de migratie. De nieuwe interface mag geen Picnic-client of Picnic-geheimen bevatten.

## Uitrollen

Er is nog niets uitgerold. De productieconfig heeft bewust nog geen bruikbare D1-resource-ID. Echte resources, geheimen, e-maildomein, runtimegrenzen, verwijderproef en beperkte Picnic-eindtest moeten eerst zijn ingericht en gecontroleerd volgens het [runbook](docs/OPERATIONS.md). Een lokale mocktest is geen bewijs van een werkende productie-integratie.
