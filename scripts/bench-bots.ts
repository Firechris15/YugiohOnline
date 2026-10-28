// Quick benchmark: bot vs bot games between starter decks.
import { createGame, applyAction, STARTER_DECKS } from '../src/engine';
import { Bot, type BotLevel } from '../src/engine/ai/bot';

const levelA = (process.argv[2] ?? 'normal') as BotLevel;
const levelB = (process.argv[3] ?? 'normal') as BotLevel;
const games = Number(process.argv[4] ?? 8);
let wins = [0, 0, 0];
let totalTurns = 0;
const t0 = Date.now();
for (let i = 0; i < games; i++) {
  const a = STARTER_DECKS[i % 8], b = STARTER_DECKS[(i + 3) % 8];
  const g = createGame({ decks: [a.deck, b.deck], names: ['A', 'B'], seed: 77 + i });
  const bots = [new Bot({ level: levelA, seed: i }), new Bot({ level: levelB, seed: i + 100 })];
  let steps = 0;
  while (g.winner === null && steps < 4000 && g.turn < 80) {
    const p = (g.pending as { player: 0 | 1 }).player;
    const act = bots[p].decide(g, p);
    const r = applyAction(g, p, act);
    if (!r.ok) { console.log('illegal', JSON.stringify(act), r.error, g.pending); break; }
    steps++;
  }
  wins[g.winner === null ? 2 : g.winner === 'draw' ? 2 : g.winner]++;
  totalTurns += g.turn;
  console.log(`game ${i}: ${a.archetype} vs ${b.archetype} -> winner ${g.winner} (${g.winReason}) turns ${g.turn} steps ${steps} lp ${g.players[0].lp}/${g.players[1].lp}`);
}
console.log('wins', wins, 'avg turns', totalTurns / games, 'ms/game', (Date.now() - t0) / games);
