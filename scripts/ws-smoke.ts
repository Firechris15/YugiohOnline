// Smoke test against a running server: two WebSocket clients play a full duel with bots.
import WebSocket from 'ws';
import { STARTER_DECKS, type GameView } from '../src/engine';
import type { ServerMsg } from '../src/shared/protocol';

const url = process.argv[2] ?? 'ws://localhost:8787/ws';
type Client = { ws: WebSocket; inbox: ServerMsg[]; view?: GameView };
const open = (name: string, id: string) =>
  new Promise<Client>((res) => {
    const ws = new WebSocket(url);
    const c: Client = { ws, inbox: [] };
    ws.on('message', (d) => {
      const m = JSON.parse(String(d)) as ServerMsg;
      c.inbox.push(m);
      if (m.t === 'state') c.view = m.view;
    });
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'hello', name, clientId: id }));
      res(c);
    });
  });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const a = await open('Alice', 'alice-client-1');
const b = await open('Bob', 'bob-client-123');
a.ws.send(JSON.stringify({ t: 'createRoom', deck: STARTER_DECKS[0].deck, deckName: 'Fire' }));
await wait(200);
const code = (a.inbox.find((m) => m.t === 'room') as Extract<ServerMsg, { t: 'room' }>).room.code;
b.ws.send(JSON.stringify({ t: 'joinRoom', code, deck: STARTER_DECKS[3].deck, deckName: 'Dark' }));
await wait(300);
console.log('room', code, 'A sees', a.view?.you, 'B sees', b.view?.you);
// Play with "first option" policy: always pick the first non-phase option except attacks; else end phase.
const clients = [a, b];
for (let step = 0; step < 600; step++) {
  const v = a.view!;
  if (v.winner !== null) break;
  const p = v.pending.player!;
  const c = clients[p];
  const view = c.view!;
  let action;
  if (view.prompt) {
    const pr = view.prompt;
    action = pr.kind === 'selectCards' ? { type: 'answer', choice: (pr.options ?? []).slice(0, pr.max ?? 1).slice(0, Math.max(pr.min ?? 0, 1)) } : pr.kind === 'yesNo' ? { type: 'answer', choice: true } : { type: 'answer', choice: 'atk' };
  } else {
    const attack = view.options.find((o) => o.action.type === 'attack');
    const summon = view.options.find((o) => o.action.type === 'normalSummon' && o.requirements.length === 0);
    const pass = view.options.find((o) => o.action.type === 'pass');
    const toBattle = view.options.find((o) => o.action.type === 'phase' && o.action.to === 'battle');
    const end = view.options.find((o) => o.action.type === 'phase' && o.action.to === 'end');
    action = (pass ?? (view.phase === 'battle' ? attack : summon) ?? (view.phase === 'main1' ? toBattle : undefined) ?? end)!.action;
  }
  c.ws.send(JSON.stringify({ t: 'action', action }));
  await wait(15);
}
const errors = [...a.inbox, ...b.inbox].filter((m) => m.t === 'error');
console.log('winner', a.view?.winner, 'turn', a.view?.turn, 'LP', a.view?.players.map((p) => p.lp), 'errors', errors.length, errors.slice(0, 3));
a.ws.send(JSON.stringify({ t: 'chat', text: 'gg!' }));
await wait(100);
console.log('chat received by B:', b.inbox.filter((m) => m.t === 'chat').map((m) => (m as { text: string }).text));
a.ws.close();
b.ws.close();
