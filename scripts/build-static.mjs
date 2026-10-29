// Builds a server-less version of the site into dist-static/ (bot duels,
// library, deck builder and bundled meta stats work; online play is hidden).
// It also writes dist-static/artifact.html: the same page without the
// document skeleton, for hosts that wrap the page themselves.
import { build } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';

process.env.VITE_STATIC = '1';
await build({ base: './', build: { outDir: 'dist-static', emptyOutDir: true }, logLevel: 'warn' });

const html = readFileSync('dist-static/index.html', 'utf8');
const pick = (re) => [...html.matchAll(re)].map((m) => m[0]);
const scripts = pick(/<script type="module"[^>]*><\/script>/g);
const links = pick(/<link rel="(?:stylesheet|modulepreload)"[^>]*>/g).filter((l) => !l.includes('fonts.googleapis'));
const page = `<title>DuelForge</title>
<meta name="description" content="DuelForge – Online-Sammelkartenspiel: Kartenbibliothek, Deck-Builder, Meta-Statistiken und Duelle gegen Bots.">
<link rel="icon" type="image/svg+xml" href="./favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
${links.join('\n')}
<div id="root"></div>
${scripts.join('\n')}
`;
writeFileSync('dist-static/artifact.html', page);
console.log('dist-static/ ready');
