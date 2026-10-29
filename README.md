# DuelForge – Yu-Gi-Oh! im Browser

DuelForge ist eine komplette Yu-Gi-Oh!-Webseite im Stil der bekannten Online-Simulatoren:

- **Kartenbibliothek:** alle **14.000+ offiziellen Yu-Gi-Oh!-Karten** mit deutschen und englischen Texten, aktueller TCG-/OCG-Banlist, Filtern (Typ, Attribut, Monstertyp, Archetyp, Stufe/Rang/Link, Banlist, „automatisch spielbar“), Suche und Detailansicht mit Holo- und 3D-Effekt
- **Deck-Builder:** Drag & Drop, Formate (Automatisch, TCG, OCG, ohne Banlist), Live-Statistiken, Testhand, Starthand-Wahrscheinlichkeiten, Deck-Codes und **YDK-Import/-Export** (YGOPRODeck, EDOPro, Dueling Nexus …)
- **Meta-Statistiken:** Tier-Liste, Siegquoten, Matchup-Matrix, meistgespielte Karten und Duell-Länge – aus einer Bot-Liga (simulierte Duelle) und aus echten Online-Duellen
- **Zwei Spielmodi:**
  - **Automatisches Duell:** Regeln, Ketten und Effekte laufen automatisch – gegen Bots (drei Stufen, auch offline) oder online. Rund 850 klassische Karten (Topf der Gier, Spiegelkraft, Dunkler Magier, Blauäugiger w. Drache, Exodia …) haben automatische Regeln; sechs echte Starterdecks sind spielfertig.
  - **Freies Duell:** wie am echten Tisch bzw. auf Dueling Book – **jede Karte ist spielbar**. Karten per Drag & Drop oder Menü bewegen, beschwören, setzen, aktivieren, angreifen, Kontrolle übernehmen; LP-Rechner, Münze, Würfel, Spielmarken, Zählmarken, Deck ansehen/mischen, Protokoll und Chat. Solo-Testmodus und online gegen Freunde.
- **Online gegen Freunde:** private Räume per Code oder Einladungslink, öffentliche Räume, Schnellsuche (getrennt nach Modus/Banlist), Chat und Emotes, Reconnect, Zeitlimit und Revanche
- **Animationen:** Karten gleiten zwischen den Zonen, Beschwörungs-Schockwellen, Angriffe, Zerstörungs-Partikel, Schadenszahlen, Aktivierungs-Spotlight, Ketten-Anzeige, Münz- und Würfelanimation, VS-Intro und Sieg-/Niederlage-Screen
- **Synthetisierte Soundeffekte**, Oberfläche auf **Deutsch und Englisch**, einstellbares Animationstempo
- Zusätzlich gibt es ein eigenes **Demo-Kartenset** (über 100 selbst entworfene Karten), das auch ohne Kartendatenbank funktioniert.

## Kartendaten

Die echten Karten werden **zur Laufzeit geladen** und nicht im Repository gespeichert:

1. **YGOPRODeck** (`db.ygoprodeck.com`, englische + deutsche Texte, Banlists) – bevorzugte Quelle.
2. Falls YGOPRODeck nicht erreichbar ist: die offenen **EDOPro-/YGOPro-Datenbanken** auf GitHub (ProjectIgnis/BabelCDB, mycard/ygopro-database für deutsche Texte, ProjectIgnis/LFLists für Banlists).

Der Server speichert die Daten in `data/cards.json`, aktualisiert sie täglich und liefert sie gepackt unter `/api/cards` aus. Kartenbilder kommen von `images.ygoprodeck.com` und werden vom Server unter `/img/…` zwischengespeichert (YGOPRODeck bittet darum, Bilder nicht direkt zu verlinken). Im Browser wird die Datenbank in IndexedDB gecacht.

Yu-Gi-Oh! sowie alle Kartennamen, -texte und -bilder gehören Konami. DuelForge ist ein inoffizielles, nicht-kommerzielles Fan-Projekt.

## Schnellstart

Voraussetzung: Node.js ≥ 22.13 (für den GitHub-Fallback der Kartendatenbank wird das eingebaute `node:sqlite` genutzt; mit Node 20 funktioniert alles außer diesem Fallback)

```bash
npm install
```

```bash
npm run dev
```

Danach **http://localhost:5173** öffnen. `npm run dev` startet den Vite-Dev-Server und den Server (Port 8787) gleichzeitig. Beim ersten Start lädt der Server die Kartendatenbank (ca. 15–30 Sekunden).

### Produktion

```bash
npm run build
```

```bash
npm start
```

Der Server liefert Webseite, API, Kartendaten, Bilder und WebSocket unter **http://localhost:8787** aus (Port über `PORT` änderbar). Online-Ergebnisse speichert er in `data/records.json` (Pfad über `DUELFORGE_DATA` änderbar), die Kartendatenbank und Bilder im selben Ordner.

### Docker

```bash
docker build -t duelforge .
```

```bash
docker run -p 8787:8787 -v duelforge-data:/app/data duelforge
```

## Hosting

- **Komplett (mit Online-Duellen):** auf jedem Node-Host mit WebSocket-Unterstützung, z. B. Render, Railway, Fly.io oder einem eigenen VPS (Docker-Image oder `npm run build && npm start`).
- **GitHub Pages (kostenlos, ohne Server):** Der Workflow `.github/workflows/pages.yml` baut die statische Version bei jedem Push auf `main` und veröffentlicht sie. Einmalig in GitHub unter *Settings → Pages → Source* „GitHub Actions“ wählen; die Seite liegt dann unter `https://<name>.github.io/<repo>/`.
- **Nur statisch (ohne Server):** `npm run cards && npm run build:static` erzeugt `dist-static/` inklusive Kartendatenbank. Bibliothek, Deck-Builder, Bot-Duelle, Solo-Testmodus und Bot-Liga-Meta funktionieren dann, Online-Duelle nicht. Kartenbilder kommen dabei direkt von YGOPRODeck.
- **Getrennter Server:** Liegt der Server auf einer anderen Domain, beim Build `VITE_SERVER_URL=https://dein-server.example` setzen.

## Nützliche Befehle

| Befehl | Zweck |
| --- | --- |
| `npm test` | Engine- und Server-Tests (inklusive Fuzzing mit hunderten Zufallspartien) |
| `npm run typecheck` | TypeScript-Prüfung |
| `npm run cards` | Kartendatenbank nach `data/cards.json` laden |
| `npm run simulate:real -- 40` | Bot-Liga mit den echten Starterdecks → `src/data/meta-real.json` |
| `npm run simulate -- 40` | Bot-Liga mit dem Demo-Set → `src/data/meta-sim.json` |
| `npm run build:static` | Server-lose Version in `dist-static/` |
| `npx tsx scripts/bench-bots.ts easy hard 40` | Bot-Stufen gegeneinander testen |
| `npx tsx scripts/ws-smoke.ts ws://localhost:8787/ws` | Komplettes Online-Duell gegen einen laufenden Server |

## Projektstruktur

```
src/engine/        Regel-Engine (reines TypeScript, läuft im Browser und auf dem Server)
  real/            echte Karten: Abbildung auf die Engine, automatische Regeln, Starterdecks
  sandbox.ts       Engine für freie Duelle (Zonen, verdeckte Infos, LP, Züge, Protokoll)
  cards/           Demo-Kartenset (eigene Karten, zweisprachig)
  ai/bot.ts        Bots (simulationsbasiert, ohne Blick auf verdeckte Karten)
  decks.ts         Formate, Banlists, Deck-Validierung, Deck-Codes
  meta.ts          Aggregation der Meta-Statistiken
src/web/           React-Frontend (Seiten, Duell-Bretter, Animationen)
src/shared/        WebSocket-Protokoll, YGOPRODeck- und EDOPro-Datenformate
server/            Node-Server: Räume (beide Modi), Schnellsuche, Kartendaten, Bild-Cache, Statistik-API
scripts/           Bot-Ligen, Kartendaten-Download, Benchmarks, Build-Skripte
```

## Weitere Karten automatisieren

Automatische Regeln für echte Karten stehen in `src/engine/real/effects.ts`, zugeordnet über den englischen Kartennamen:

```ts
'Pot of Greed': { effects: [{ kind: 'activate', ops: [{ op: 'draw', who: 'self', n: 2 }] }] },
```

Effekte setzen sich aus Bausteinen zusammen: Ziehen, Schaden, LP, Zerstören, Verbannen, Suchen, Spezialbeschwörung, Spielmarken, ATK-Änderungen, Kontrolle übernehmen, Annullieren, Fusion, Ritual und weitere. Normale Monster, einfache Fusionen und Rituale werden automatisch erkannt. Die Bots können neue Karten sofort spielen, weil sie Züge simulieren.

Den Seitennamen änderst du in `src/web/config.ts`.

---

*DuelForge is an unofficial, non-commercial fan project and is not affiliated with Konami. Yu-Gi-Oh! and all card names, texts and images belong to Konami.*
