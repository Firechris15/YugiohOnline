// Bot league with the real-card starter decks (automatic duels). Writes
// src/data/meta-real.json, which seeds the Meta page for real cards. Only card
// passcodes and numbers are stored, no card texts.
//
// Usage: npm run cards && npm run simulate:real -- [gamesPerPairing=12]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame, applyAction, registerRealCards, REAL_STARTERS, resolveRealStarter, type PlayerId } from '../src/engine';
import { Bot } from '../src/engine/ai/bot';
import { aggregate, countIds, playedCards, type GameRecord } from '../src/engine/meta';
import type { CardDb } from '../src/shared/ygo';

const perPairing = Number(process.argv[2] ?? 12);
const db = JSON.parse(readFileSync(resolve(process.env.DUELFORGE_DATA_DIR ?? 'data', 'cards.json'), 'utf8')) as CardDb;
registerRealCards(db.cards, db.version);

const starters = REAL_STARTERS.map((s) => ({ id: s.id, deck: resolveRealStarter(s) })).filter((s): s is { id: string; deck: NonNullable<typeof s.deck> } => !!s.deck);
const records: GameRecord[] = [];
const t0 = Date.now();
let seed = 1;
for (let i = 0; i < starters.length; i++) {
  for (let j = i + 1; j < starters.length; j++) {
    for (let k = 0; k < perPairing; k++) {
      const [A, B] = [starters[i], starters[j]];
      const first: PlayerId = (k % 2) as PlayerId;
      const g = createGame({ decks: [A.deck, B.deck], names: ['A', 'B'], seed: seed++, firstPlayer: first });
      const bots = [new Bot({ level: 'normal', seed: seed * 3 }), new Bot({ level: 'normal', seed: seed * 7 })];
      const played: [Record<string, number>, Record<string, number>] = [{}, {}];
      let lastSeq = 0;
      for (let steps = 0; g.winner === null && steps < 5000 && g.turn <= 60; steps++) {
        const p = (g.pending as { player: PlayerId }).player;
        if (!applyAction(g, p, bots[p].decide(g, p)).ok) break;
        const fresh = g.events.filter((e) => e.seq > lastSeq);
        lastSeq = g.eventSeq;
        const counted = playedCards({ events: fresh });
        for (const q of [0, 1] as PlayerId[]) for (const [id, n] of Object.entries(counted[q])) played[q][id] = (played[q][id] ?? 0) + n;
      }
      records.push({
        archetypes: [A.id, B.id],
        decks: [countIds([...A.deck.main, ...A.deck.extra]), countIds([...B.deck.main, ...B.deck.extra])],
        first,
        winner: g.winner,
        turns: g.turn,
        reason: g.winReason ?? 'timeout',
        played,
        mode: 'sim',
        at: Date.now(),
        pool: 'real',
        format: 'auto',
      });
    }
    process.stdout.write(`\r${records.length} games simulated…`);
  }
}
const stats = aggregate(records, 'sim');
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/meta-real.json');
writeFileSync(out, JSON.stringify(stats, null, 1));
console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${out}`);
for (const a of stats.archetypes) console.log(`${a.tier} ${a.id.padEnd(20)} ${(a.winRate * 100).toFixed(1)}%  (${a.games} games)`);
