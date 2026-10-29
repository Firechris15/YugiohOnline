import { describe, expect, it } from 'vitest';
import { RoomManager, type Conn } from './rooms';
import { STARTER_DECKS, getOptions, type GameView } from '../src/engine';
import type { RoomInfo, ServerMsg } from '../src/shared/protocol';
import type { GameRecord } from '../src/engine/meta';
import { Bot } from '../src/engine/ai/bot';
import type { SbView } from '../src/engine/sandbox';
import { compactCards } from '../src/shared/ygo';
import { fixtureCards } from '../src/engine/real/fixture';
import { registerRealCards } from '../src/engine/real';
import { REAL_STARTERS, resolveRealStarter } from '../src/engine/real/decks';

function fakeConn(id: string): Conn & { inbox: ServerMsg[]; last<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }> | undefined } {
  const inbox: ServerMsg[] = [];
  return {
    id,
    clientId: '',
    name: '',
    inbox,
    send: (m) => inbox.push(m),
    last(t) {
      for (let i = inbox.length - 1; i >= 0; i--) if (inbox[i].t === t) return inbox[i] as never;
      return undefined;
    },
  };
}

const deck = STARTER_DECKS[0].deck;

describe('RoomManager', () => {
  it('creates a room, lets a friend join and plays a full duel', () => {
    const records: GameRecord[] = [];
    const rm = new RoomManager({ onRecord: (r) => records.push(r) });
    const a = fakeConn('a');
    const b = fakeConn('b');
    rm.connect(a);
    rm.connect(b);
    rm.handle(a, { t: 'hello', name: 'Alice', clientId: 'client-alice-1' });
    rm.handle(b, { t: 'hello', name: 'Bob', clientId: 'client-bob-123' });
    rm.handle(a, { t: 'createRoom', deck, deckName: 'Fire' });
    const code = (a.last('room')!.room as RoomInfo).code;
    expect(code).toMatch(/^[A-Z2-9]{5}$/);
    rm.handle(b, { t: 'joinRoom', code, deck: STARTER_DECKS[1].deck, deckName: 'Water' });
    expect(a.last('room')!.room.status).toBe('playing');
    const va = a.last('state')!.view as GameView;
    const vb = b.last('state')!.view as GameView;
    expect(va.you).toBe(0);
    expect(vb.you).toBe(1);
    // hidden information never leaks
    expect(va.players[1].hand.every((c) => c.defId === null)).toBe(true);

    // Drive the duel with bots acting through the room manager.
    const bots = [new Bot({ level: 'easy', seed: 1 }), new Bot({ level: 'easy', seed: 2 })];
    const conns = [a, b];
    for (let i = 0; i < 3000; i++) {
      const g = rm.getRoom(code)!.game!;
      if (g.winner !== null) break;
      const p = (g.pending as { player: 0 | 1 }).player;
      rm.handle(conns[p], { t: 'action', action: bots[p].decide(g, p) });
    }
    const room = rm.getRoom(code)!;
    expect(room.status).toBe('finished');
    expect(records).toHaveLength(1);
    expect(records[0].mode).toBe('online');

    // rematch
    rm.handle(a, { t: 'rematch' });
    expect(rm.getRoom(code)!.status).toBe('finished');
    rm.handle(b, { t: 'rematch' });
    expect(rm.getRoom(code)!.status).toBe('playing');
  });

  it('rejects illegal decks and actions from the wrong player', () => {
    const rm = new RoomManager();
    const a = fakeConn('a');
    const b = fakeConn('b');
    rm.connect(a);
    rm.connect(b);
    rm.handle(a, { t: 'hello', name: 'A', clientId: 'aaaaaaaaaa' });
    rm.handle(b, { t: 'hello', name: 'B', clientId: 'bbbbbbbbbb' });
    rm.handle(a, { t: 'createRoom', deck: { main: ['GEN-001'], extra: [] }, deckName: 'x' });
    expect(a.last('error')!.code).toBe('invalid_deck');
    rm.handle(a, { t: 'createRoom', deck, deckName: 'x' });
    const code = a.last('room')!.room.code;
    rm.handle(b, { t: 'joinRoom', code, deck, deckName: 'y' });
    const g = rm.getRoom(code)!.game!;
    const waiting = (g.pending as { player: 0 | 1 }).player;
    const wrong = waiting === 0 ? b : a;
    rm.handle(wrong, { t: 'action', action: { type: 'phase', to: 'end' } });
    expect(wrong.last('error')!.code).toBe('illegal_action');
    // the right player can act
    const right = waiting === 0 ? a : b;
    const opt = getOptions(g, waiting).find((o) => o.action.type === 'phase')!;
    right.inbox.length = 0;
    rm.handle(right, { t: 'action', action: opt.action });
    expect(right.last('error')).toBeUndefined();
    expect(right.last('state')).toBeDefined();
  });

  it('pairs players through quick match and supports reconnecting', () => {
    const rm = new RoomManager();
    const a = fakeConn('a');
    const b = fakeConn('b');
    rm.connect(a);
    rm.connect(b);
    rm.handle(a, { t: 'hello', name: 'A', clientId: 'aaaaaaaaaa' });
    rm.handle(b, { t: 'hello', name: 'B', clientId: 'bbbbbbbbbb' });
    rm.handle(a, { t: 'quickMatch', deck, deckName: 'x' });
    expect(a.last('queued')).toBeDefined();
    rm.handle(b, { t: 'quickMatch', deck, deckName: 'y' });
    const code = b.last('room')!.room.code;
    expect(b.last('room')!.room.status).toBe('playing');
    rm.disconnect(a);
    expect(b.last('room')!.room.players[0]!.connected).toBe(false);
    const a2 = fakeConn('a2');
    rm.connect(a2);
    rm.handle(a2, { t: 'hello', name: 'A', clientId: 'aaaaaaaaaa' });
    expect(a2.last('room')!.room.code).toBe(code);
    expect(a2.last('state')).toBeDefined();
    // chat
    rm.handle(a2, { t: 'chat', text: '  good luck <b>!</b> ' });
    expect(b.last('chat')!.text).toBe('good luck <b>!</b>'); // rendered escaped by React
  });

  it('auto-plays for a player who runs out of time and forfeits abandoned games', () => {
    let now = 0;
    const rm = new RoomManager({ decisionMs: 1000, reconnectMs: 5000, now: () => now });
    const a = fakeConn('a');
    const b = fakeConn('b');
    rm.connect(a);
    rm.connect(b);
    rm.handle(a, { t: 'hello', name: 'A', clientId: 'aaaaaaaaaa' });
    rm.handle(b, { t: 'hello', name: 'B', clientId: 'bbbbbbbbbb' });
    rm.handle(a, { t: 'createRoom', deck, deckName: 'x' });
    const code = a.last('room')!.room.code;
    rm.handle(b, { t: 'joinRoom', code, deck, deckName: 'y' });
    const g = rm.getRoom(code)!.game!;
    const turn = g.turn;
    now = 2000;
    rm.tick();
    expect(g.turn).toBeGreaterThan(turn);
    rm.disconnect(a);
    now = 10_000;
    rm.tick();
    expect(g.winner).toBe(1);
  });

  it('runs free duels: manual actions, hidden information and records', () => {
    registerRealCards(compactCards(fixtureCards()), 'fixture-rooms');
    const realDeck = resolveRealStarter(REAL_STARTERS[0])!;
    const records: GameRecord[] = [];
    const rm = new RoomManager({ onRecord: (r) => records.push(r) });
    const a = fakeConn('a');
    const b = fakeConn('b');
    rm.connect(a);
    rm.connect(b);
    rm.handle(a, { t: 'hello', name: 'A', clientId: 'aaaaaaaaaa' });
    rm.handle(b, { t: 'hello', name: 'B', clientId: 'bbbbbbbbbb' });
    rm.handle(a, { t: 'createRoom', deck: realDeck, deckName: 'Real', mode: 'free', banlist: 'none' });
    const info = a.last('room')!.room;
    expect(info).toMatchObject({ mode: 'free', pool: 'real', format: 'none' });
    // a demo deck cannot join a real-card room
    rm.handle(b, { t: 'joinRoom', code: info.code, deck, deckName: 'Demo' });
    expect(b.last('error')!.code).toBe('wrong_pool');
    rm.handle(b, { t: 'joinRoom', code: info.code, deck: resolveRealStarter(REAL_STARTERS[1])!, deckName: 'Real 2' });
    const room = rm.getRoom(info.code)!;
    expect(room.status).toBe('playing');
    expect(room.sb).not.toBeNull();
    expect(room.deadline).toBeNull(); // no decision clock in free duels
    const va = a.last('state')!.view as SbView;
    expect(va.mode).toBe('free');
    const first = room.sb!.turnPlayer;
    const [cur, other] = first === 0 ? [a, b] : [b, a];
    const card = room.sb!.players[first].hand[0];
    rm.handle(cur, { t: 'action', action: { type: 'move', uid: card, to: 'szone', faceUp: false } });
    const seen = (other.last('state')!.view as SbView).players[first].szone.find((c) => c?.uid === card);
    expect(seen?.defId).toBeNull(); // set cards stay hidden from the opponent
    rm.handle(other, { t: 'action', action: { type: 'endTurn' } });
    expect(other.last('error')!.code).toBe('illegal_action');
    rm.handle(cur, { t: 'action', action: { type: 'endTurn' } });
    expect(room.sb!.turnPlayer).not.toBe(first);
    rm.handle(other, { t: 'action', action: { type: 'lp', player: first, delta: -8000 } });
    expect(room.status).toBe('finished');
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ pool: 'real', format: 'free' });
  });

  it('keeps quick match queues apart per mode', () => {
    const rm = new RoomManager();
    const a = fakeConn('a');
    const b = fakeConn('b');
    rm.connect(a);
    rm.connect(b);
    rm.handle(a, { t: 'hello', name: 'A', clientId: 'aaaaaaaaaa' });
    rm.handle(b, { t: 'hello', name: 'B', clientId: 'bbbbbbbbbb' });
    rm.handle(a, { t: 'quickMatch', deck, deckName: 'x', mode: 'free' });
    rm.handle(b, { t: 'quickMatch', deck, deckName: 'y' });
    expect(b.last('queued')).toBeDefined();
    expect(b.last('room')).toBeUndefined();
    rm.handle(b, { t: 'quickMatch', deck, deckName: 'y', mode: 'free' });
    expect(b.last('room')!.room).toMatchObject({ mode: 'free', status: 'playing' });
  });
});
