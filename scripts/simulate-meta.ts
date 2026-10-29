// Bot league: plays round-robin bot-vs-bot duels between the archetype decks
// (plus randomized variants) and writes the aggregated meta statistics to
// src/data/meta-sim.json, which seeds the Meta page.
//
// Usage: npm run simulate -- [gamesPerPairing=24]
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame, applyAction, STARTER_DECKS, allCards, validateDeck, type DeckList, type PlayerId } from '../src/engine';
import { Bot } from '../src/engine/ai/bot';
import { aggregate, countIds, playedCards, type GameRecord } from '../src/engine/meta';
import { mulberry } from '../src/engine/testkit';

const perPairing = Number(process.argv[2] ?? 24);
const rand = mulberry(20261028);

const generics = allCards().filter((d) => !d.archetype && d.frame !== 'fusion' && !d.token);

function variant(base: DeckList): DeckList {
  const main = [...base.main];
  for (let tries = 0, swaps = 0; swaps < 5 && tries < 60; tries++) {
    const i = Math.floor(rand() * main.length);
    if (main[i].startsWith('GEN-')) {
      const pick = generics[Math.floor(rand() * generics.length)].id;
      const next = [...main];
      next[i] = pick;
      if (validateDeck({ main: next, extra: base.extra }).length === 0) {
        main.splice(0, main.length, ...next);
        swaps++;
      }
    }
  }
  return { main, extra: base.extra };
}

const pool = STARTER_DECKS.flatMap((s) => [
  { archetype: s.archetype, deck: s.deck },
  { archetype: s.archetype, deck: variant(s.deck) },
  { archetype: s.archetype, deck: variant(s.deck) },
]);

const records: GameRecord[] = [];
const archetypes = STARTER_DECKS.map((s) => s.archetype);
const t0 = Date.now();
let seed = 1;
for (let i = 0; i < archetypes.length; i++) {
  for (let j = i + 1; j < archetypes.length; j++) {
    for (let k = 0; k < perPairing; k++) {
      const pa = pool.filter((p) => p.archetype === archetypes[i]);
      const pb = pool.filter((p) => p.archetype === archetypes[j]);
      const A = pa[k % pa.length];
      const B = pb[(k + 1) % pb.length];
      const first: PlayerId = (k % 2) as PlayerId;
      const g = createGame({ decks: [A.deck, B.deck], names: ['A', 'B'], seed: seed++, firstPlayer: first });
      const bots = [new Bot({ level: 'normal', seed: seed * 3 }), new Bot({ level: 'normal', seed: seed * 7 })];
      let steps = 0;
      const played: [Record<string, number>, Record<string, number>] = [{}, {}];
      let lastSeq = 0;
      while (g.winner === null && steps < 5000 && g.turn <= 60) {
        const p = (g.pending as { player: PlayerId }).player;
        const r = applyAction(g, p, bots[p].decide(g, p));
        if (!r.ok) break;
        steps++;
        // events are capped in the state, so harvest them incrementally
        const fresh = g.events.filter((e) => e.seq > lastSeq);
        lastSeq = g.eventSeq;
        const counted = playedCards({ ...g, events: fresh });
        for (const q of [0, 1] as PlayerId[]) for (const [id, n] of Object.entries(counted[q])) played[q][id] = (played[q][id] ?? 0) + n;
      }
      records.push({
        archetypes: [A.archetype, B.archetype],
        decks: [countIds([...A.deck.main, ...A.deck.extra]), countIds([...B.deck.main, ...B.deck.extra])],
        first,
        winner: g.winner,
        turns: g.turn,
        reason: g.winReason ?? 'timeout',
        played,
        mode: 'sim',
        at: Date.now(),
      });
    }
    process.stdout.write(`\r${records.length} games simulated…`);
  }
}
const stats = aggregate(records, 'sim');
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/meta-sim.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(stats, null, 1));
console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${out}`);
for (const a of stats.archetypes) console.log(`${a.tier} ${a.id.padEnd(11)} ${(a.winRate * 100).toFixed(1)}%  (${a.games} games)`);
console.log('first player win rate', (stats.firstPlayerWinRate * 100).toFixed(1) + '%', 'avg turns', stats.avgTurns.toFixed(1));
