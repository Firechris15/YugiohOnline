# DuelForge – Online-Sammelkartenspiel im Browser

DuelForge ist eine komplette Trading-Card-Game-Webseite im Stil der bekannten Online-Simulatoren:

- **Kartenbibliothek:** über 100 Karten mit Filtern, Suche, Sortierung und einer Detailansicht mit Holo- und 3D-Effekt
- **Deck-Builder:** Drag & Drop, Live-Statistiken (Stufenkurve, Zusammensetzung, Attribute), Testhand, Starthand-Wahrscheinlichkeiten und Deck-Codes zum Teilen
- **Meta-Statistiken:** Tier-Liste, Siegquoten, Matchup-Matrix, meistgespielte Karten und Duell-Länge, aus einer Bot-Liga (simulierte Duelle) und aus echten Online-Duellen
- **Duelle gegen Bots:** drei Stufen (Leicht, Normal, Schwer), laufen komplett im Browser und auch offline
- **Duelle gegen Freunde:** private Räume per Code oder Einladungslink, öffentliche Räume, Schnellsuche, Chat und Emotes, Reconnect, Zeitlimit und Revanche
- **Animationen:** Karten gleiten zwischen den Zonen, dazu Beschwörungs-Schockwellen, Angriffs-Ausfallschritte, Zerstörungs-Partikel, Schadenszahlen, Aktivierungs-Spotlight, Ketten-Anzeige, VS-Intro mit Münzwurf und Sieg-/Niederlage-Screen
- **Synthetisierte Soundeffekte**, Oberfläche auf **Deutsch und Englisch**, einstellbares Animationstempo

## Regeln & Karten

Das Regelwerk ist an klassische Duell-Kartenspiele angelehnt: 8000 LP, Normal-, Tribut-, Flipp-, Spezial- und Fusionsbeschwörung, Zauber und Fallen (inklusive Schnellzauber und Konterfallen), Ketten, Trigger-Effekte, Kampfschaden und Durchschlagsschaden. Die Regeln stehen auch auf der Seite **/rules**.

**Alle Karten, Namen, Texte und Grafiken sind eigene Entwürfe.** Es gibt 8 Archetypen (Glutschwinge, Gezeitenrufer, Eisenpanzer, Düsterschleier, Lumina, Sturmklinge, Dornwild, Astral) plus allgemeine Karten. Die Kartenkunst wird für jede Karte prozedural als SVG erzeugt. Originalkarten, -bilder und -texte bekannter Sammelkartenspiele sind urheberrechtlich geschützt und werden deshalb nicht verwendet.

## Schnellstart

Voraussetzung: Node.js ≥ 20

```bash
npm install
```

```bash
npm run dev
```

Danach **http://localhost:5173** öffnen. `npm run dev` startet den Vite-Dev-Server und den Multiplayer-Server (Port 8787) gleichzeitig.

### Produktion

```bash
npm run build
```

```bash
npm start
```

Der Server liefert Webseite, API und WebSocket unter **http://localhost:8787** aus (Port über `PORT` änderbar). Online-Ergebnisse speichert er in `data/records.json` (Pfad über `DUELFORGE_DATA` änderbar).

### Docker

```bash
docker build -t duelforge .
```

```bash
docker run -p 8787:8787 -v duelforge-data:/app/data duelforge
```

## Hosting

- **Komplett (mit Online-Duellen):** auf jedem Node-Host mit WebSocket-Unterstützung, z. B. Render, Railway, Fly.io oder einem eigenen VPS (Docker-Image oder `npm run build && npm start`).
- **Nur statisch (ohne Server):** `dist/` kann auf GitHub Pages, Netlify usw. liegen. Bot-Duelle, Bibliothek, Deck-Builder und Bot-Liga-Meta funktionieren dann, Online-Duelle nicht.
- **Getrennter Server:** Liegt der Server auf einer anderen Domain, beim Build `VITE_SERVER_URL=https://dein-server.example` setzen.

## Nützliche Befehle

| Befehl | Zweck |
| --- | --- |
| `npm test` | Engine- und Server-Tests (inklusive Fuzzing mit hunderten Zufallspartien) |
| `npm run typecheck` | TypeScript-Prüfung |
| `npm run simulate -- 40` | Bot-Liga neu simulieren und `src/data/meta-sim.json` erzeugen (40 Duelle pro Paarung) |
| `npx tsx scripts/bench-bots.ts easy hard 40` | Bot-Stufen gegeneinander testen |
| `npx tsx scripts/ws-smoke.ts ws://localhost:8787/ws` | Komplettes Online-Duell gegen einen laufenden Server |

## Projektstruktur

```
src/engine/        Regel-Engine (reines TypeScript, läuft im Browser und auf dem Server)
  cards/           Kartendefinitionen (eigene Karten, zweisprachig)
  ai/bot.ts        Bots (simulationsbasiert, ohne Blick auf verdeckte Karten)
  decks.ts         Starterdecks, Deck-Validierung, Deck-Codes
  meta.ts          Aggregation der Meta-Statistiken
src/web/           React-Frontend (Seiten, Duell-Brett, Animationen, Kartenkunst)
src/shared/        WebSocket-Protokoll
server/            Node-Server: Räume, Schnellsuche, Statistik-API
scripts/           Bot-Liga-Simulation, Benchmarks, Build-Skript
```

## Eigene Karten hinzufügen

Karten werden deklarativ in `src/engine/cards/*.ts` beschrieben, zum Beispiel:

```ts
spell('MY-001', ['Arcane Insight', 'Arkane Einsicht'], 'normal',
  ['Draw 2 cards.', 'Ziehe 2 Karten.'],
  [{ kind: 'activate', ops: [{ op: 'draw', who: 'self', n: 2 }] }]);
```

Effekte setzen sich aus Bausteinen zusammen: Ziehen, Schaden, LP, Zerstören, Verbannen, Suchen, Spezialbeschwörung, Spielmarken, ATK-Änderungen, Annullieren, Fusion und weitere. Für Sonderfälle gibt es `custom`. Die Bots können neue Karten automatisch spielen, weil sie Züge simulieren.

Den Seitennamen änderst du in `src/web/config.ts`.

---

*DuelForge is an independent fan project with original cards, names and artwork. It is not affiliated with any trading card game publisher.*
