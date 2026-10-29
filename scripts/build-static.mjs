// Builds a server-less version of the site into dist-static/ (bot duels,
// solo free duels, library, deck builder and bundled meta stats work; online
// play is hidden).
// It also writes dist-static/artifact.html: the same page without the
// document skeleton, for hosts that wrap the page themselves.
import { build } from 'vite';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

process.env.VITE_STATIC = '1';
await build({ base: './', build: { outDir: 'dist-static', emptyOutDir: true }, logLevel: 'warn' });

const html = readFileSync('dist-static/index.html', 'utf8');
const pick = (re) => [...html.matchAll(re)].map((m) => m[0]);
const scripts = pick(/<script type="module"[^>]*><\/script>/g);
const links = pick(/<link rel="(?:stylesheet|modulepreload)"[^>]*>/g).filter((l) => !l.includes('fonts.googleapis'));
const page = `<title>DuelForge</title>
<meta name="description" content="DuelForge – Yu-Gi-Oh! im Browser: alle echten Karten, Deck-Builder mit Banlist, Meta-Statistiken, Duelle gegen Bots und freie Duelle.">
<link rel="icon" type="image/svg+xml" href="./favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
${links.join('\n')}
<div id="root"></div>
${scripts.join('\n')}
`;
writeFileSync('dist-static/artifact.html', page);

// Ship the real card database with the static build (run `npm run cards` first).
if (existsSync('data/cards.json')) {
  const db = JSON.parse(readFileSync('data/cards.json', 'utf8'));
  // alternate artworks and type texts are not needed by the client
  const slim = { ...db, cards: db.cards.map(({ im, t, ...c }) => c) };
  const gz = gzipSync(JSON.stringify(slim), { level: 9 });
  writeFileSync('dist-static/cards.json.gz', gz);
  console.log(`dist-static/cards.json.gz: ${db.cards.length} cards, ${(gz.length / 1e6).toFixed(1)} MB`);
} else {
  console.log('No data/cards.json – the static build will load real cards from YGOPRODeck at runtime.');
}
console.log('dist-static/ ready');
