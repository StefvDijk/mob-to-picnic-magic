# Mob → Picnic Boodschappenmatcher

Deze repository bevat de MobToPicnic webapplicatie en een lichte Node API-server. De app extraheert ingrediënten uit MOB-recepten, normaliseert ze en matcht ze automatisch met Picnic-producten. Matches boven de ingestelde drempel worden direct aan het winkelmandje toegevoegd; overige items verschijnen in een review-UI waar je de beste kandidaat kunt kiezen.

## Projectstructuur

- `src/` – React/Tailwind frontend met shadcn-ui componenten
- `server/` – Lichtgewicht HTTP-server (zonder Express) met Picnic integratie, AI-normalisatie (OpenAI optioneel) en sessiebeheer
- `SPECIFICATION.md` – Functionele en technische requirements

## Ontwikkelen

1. Installeer dependencies (eenmalig):

   ```sh
   npm install
   ```

   > **Let op:** in omgevingen zonder toegang tot npm kan deze stap falen. In dat geval kun je bestaande `node_modules` gebruiken of de installatie later uitvoeren.

2. Start de API-server (laadt .env indien aanwezig):

   ```sh
   npm run server
   ```

3. Start in een tweede terminal het Vite frontend:

   ```sh
   npm run dev
   ```

4. Open de browser op de URL die Vite toont (standaard `http://localhost:5173`).

## Configuratie

Maak een `.env` bestand aan voor lokale development:

```
PICNIC_EMAIL=...
PICNIC_PASSWORD=...
OPENAI_API_KEY=... # Optioneel, heuristieken worden gebruikt als de key ontbreekt of het pakket niet geïnstalleerd is
AUTO_ADD_THRESHOLD=0.72
PORT=3000
```

Wanneer er geen Picnic-inloggegevens beschikbaar zijn, draait de server automatisch in mock-modus met voorbeeldproducten. Zo kun je de volledige flow testen zonder echte API-calls.

## Features

- Extractie van MOB-ingrediënten (bookmarklet/URL input)
- Normalisatie via OpenAI (optioneel) of heuristiek
- Picnic-zoekopdrachten met fallback naar mock data
- Automatisch toevoegen bij hoge confidence en review-UI voor twijfelgevallen
- Handmatige bevestiging stuurt feedback naar een in-memory mapping voor toekomstige matches

## Tech stack

- React + Vite + TypeScript
- Tailwind CSS & shadcn-ui
- Node HTTP-server met Picnic SDK en optionele OpenAI-integratie

## Deployment

De frontend kan via Lovable gedeployed worden. Voor productgebruik is een persistent backend (bijv. op Render, Railway, Fly.io) nodig die `npm run server` draait en bereikbaar is voor de frontend.
