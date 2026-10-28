import { createGame, applyAction, STARTER_DECKS, getDef } from '../src/engine';
import { Bot } from '../src/engine/ai/bot';
const a = STARTER_DECKS[Number(process.argv[2] ?? 2)], b = STARTER_DECKS[Number(process.argv[3] ?? 5)];
const g = createGame({ decks: [a.deck, b.deck], names: ['A', 'B'], seed: Number(process.argv[4] ?? 79) });
const bots = [new Bot({ level: 'normal', seed: 1 }), new Bot({ level: 'normal', seed: 2 })];
const nm = (u?: string | null) => (u && g.cards[u] ? getDef(g.cards[u].defId).name.en : String(u));
let steps = 0;
while (g.winner === null && steps < 400) {
  const p = (g.pending as { player: 0 | 1 }).player;
  const act = bots[p].decide(g, p) as any;
  const desc = act.type === 'answer' ? `answer ${JSON.stringify(Array.isArray(act.choice) ? act.choice.map(nm) : act.choice)}` : `${act.type} ${act.uid ? nm(act.uid) : ''} ${act.target !== undefined ? '-> ' + nm(act.target) : ''} ${act.targets ? 'T:' + act.targets.map(nm) : ''} ${act.to ?? ''} ${act.tributes ? 'trib:' + act.tributes.map(nm) : ''}`;
  console.log(`T${g.turn} P${p} ${g.phase} [${g.pending.kind}] ${desc}   LP ${g.players[0].lp}/${g.players[1].lp} hand ${g.players[0].hand.length}/${g.players[1].hand.length}`);
  const r = applyAction(g, p, act);
  if (!r.ok) { console.log('ILLEGAL', r.error); break; }
  steps++;
}
console.log('winner', g.winner, g.winReason);
