// Room manager for online duels. The server owns the authoritative game
// state; clients only send actions and receive their own filtered view.
import {
  applyAction,
  createGame,
  detectArchetype,
  getOptions,
  getView,
  randomSeed,
  validateDeck,
  type Action,
  type DeckList,
  type GameState,
  type PlayerId,
} from '../src/engine';
import { Bot } from '../src/engine/ai/bot';
import { countIds, playedCards, type GameRecord } from '../src/engine/meta';
import type { ClientMsg, PublicRoom, RoomInfo, ServerMsg } from '../src/shared/protocol';
import { EMOTES } from '../src/shared/protocol';

export interface Conn {
  id: string;
  clientId: string;
  name: string;
  send(msg: ServerMsg): void;
  roomCode?: string;
  queued?: { deck: DeckList; deckName: string };
}

interface Seat {
  clientId: string;
  name: string;
  deck: DeckList;
  deckName: string;
  conn: Conn | null;
  lastSeq: number;
  rematch: boolean;
  disconnectedAt: number | null;
}

interface Room {
  code: string;
  isPublic: boolean;
  createdAt: number;
  seats: [Seat, Seat | null];
  game: GameState | null;
  status: 'waiting' | 'playing' | 'finished';
  deadline: number | null;
  played: [Record<string, number>, Record<string, number>];
  harvestedSeq: number;
  recorded: boolean;
}

export interface RoomManagerOptions {
  decisionMs?: number;
  reconnectMs?: number;
  onRecord?: (r: GameRecord) => void;
  now?: () => number;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function sanitizeName(raw: unknown, fallback = 'Duelist'): string {
  const s = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, 20);
  return s || fallback;
}

function sanitizeDeck(raw: unknown): DeckList | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as { main?: unknown; extra?: unknown };
  if (!Array.isArray(d.main) || !Array.isArray(d.extra)) return null;
  if (d.main.length > 60 || d.extra.length > 15) return null;
  if (![...d.main, ...d.extra].every((x) => typeof x === 'string' && x.length < 16)) return null;
  return { main: d.main as string[], extra: d.extra as string[] };
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private queue: Conn[] = [];
  private conns = new Map<string, Conn>();
  private opts: Required<RoomManagerOptions>;
  private fallbackBot = new Bot({ level: 'easy', seed: 1 });

  constructor(opts: RoomManagerOptions = {}) {
    this.opts = {
      decisionMs: opts.decisionMs ?? 120_000,
      reconnectMs: opts.reconnectMs ?? 60_000,
      onRecord: opts.onRecord ?? (() => {}),
      now: opts.now ?? Date.now,
    };
  }

  get onlineCount(): number {
    return this.conns.size;
  }

  connect(conn: Conn): void {
    this.conns.set(conn.id, conn);
  }

  disconnect(conn: Conn): void {
    this.conns.delete(conn.id);
    this.queue = this.queue.filter((c) => c !== conn);
    const room = conn.roomCode ? this.rooms.get(conn.roomCode) : undefined;
    if (!room) return;
    const seat = room.seats.find((s) => s?.conn === conn);
    if (!seat) return;
    seat.conn = null;
    seat.disconnectedAt = this.opts.now();
    if (room.status === 'waiting') {
      this.rooms.delete(room.code);
      return;
    }
    this.broadcastRoom(room);
  }

  handle(conn: Conn, msg: ClientMsg): void {
    switch (msg.t) {
      case 'hello':
        return this.hello(conn, msg.name, msg.clientId);
      case 'ping':
        return conn.send({ t: 'pong', online: this.onlineCount });
      case 'createRoom':
        return this.createRoom(conn, msg.deck, msg.deckName, !!msg.isPublic);
      case 'joinRoom':
        return this.joinRoom(conn, String(msg.code ?? '').toUpperCase(), msg.deck, msg.deckName);
      case 'quickMatch':
        return this.quickMatch(conn, msg.deck, msg.deckName);
      case 'cancelQueue':
        this.queue = this.queue.filter((c) => c !== conn);
        conn.queued = undefined;
        return;
      case 'leaveRoom':
        return this.leave(conn);
      case 'action':
        return this.action(conn, msg.action);
      case 'chat':
        return this.chat(conn, msg.text);
      case 'emote':
        return this.emote(conn, msg.id);
      case 'rematch':
        return this.rematch(conn);
      case 'listRooms':
        return conn.send({ t: 'rooms', rooms: this.publicRooms() });
      default:
        return conn.send({ t: 'error', code: 'bad_message', message: 'Unknown message' });
    }
  }

  publicRooms(): PublicRoom[] {
    return [...this.rooms.values()]
      .filter((r) => r.isPublic && r.status === 'waiting' && r.seats[0].conn)
      .map((r) => ({ code: r.code, host: r.seats[0].name, deckName: r.seats[0].deckName, createdAt: r.createdAt }))
      .slice(0, 30);
  }

  // ------------------------------------------------------------------ steps

  private hello(conn: Conn, name: string, clientId: string): void {
    conn.name = sanitizeName(name);
    conn.clientId = /^[a-zA-Z0-9_-]{8,64}$/.test(clientId) ? clientId : conn.id;
    conn.send({ t: 'welcome', clientId: conn.clientId, online: this.onlineCount });
    // Reconnect to a running room.
    for (const room of this.rooms.values()) {
      const seat = room.seats.find((s) => s && s.clientId === conn.clientId && room.status !== 'waiting');
      if (seat) {
        if (seat.conn && seat.conn !== conn) seat.conn.roomCode = undefined;
        seat.conn = conn;
        seat.disconnectedAt = null;
        seat.lastSeq = 0;
        conn.roomCode = room.code;
        this.broadcastRoom(room);
        this.sendState(room);
        return;
      }
    }
  }

  private checkDeck(conn: Conn, raw: unknown): DeckList | null {
    const deck = sanitizeDeck(raw);
    if (!deck || validateDeck(deck).length) {
      conn.send({ t: 'error', code: 'invalid_deck', message: 'Your deck is not legal.' });
      return null;
    }
    return deck;
  }

  private newCode(): string {
    for (;;) {
      let c = '';
      for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!this.rooms.has(c)) return c;
    }
  }

  private seat(conn: Conn, deck: DeckList, deckName: string): Seat {
    return { clientId: conn.clientId, name: conn.name, deck, deckName: sanitizeName(deckName, 'Deck'), conn, lastSeq: 0, rematch: false, disconnectedAt: null };
  }

  private createRoom(conn: Conn, rawDeck: unknown, deckName: string, isPublic: boolean): Room | undefined {
    if (!conn.clientId) return void conn.send({ t: 'error', code: 'no_hello', message: 'Say hello first.' });
    const deck = this.checkDeck(conn, rawDeck);
    if (!deck) return;
    this.leave(conn);
    const room: Room = {
      code: this.newCode(),
      isPublic,
      createdAt: this.opts.now(),
      seats: [this.seat(conn, deck, deckName), null],
      game: null,
      status: 'waiting',
      deadline: null,
      played: [{}, {}],
      harvestedSeq: 0,
      recorded: false,
    };
    this.rooms.set(room.code, room);
    conn.roomCode = room.code;
    this.broadcastRoom(room);
    return room;
  }

  private joinRoom(conn: Conn, code: string, rawDeck: unknown, deckName: string): void {
    if (!conn.clientId) return conn.send({ t: 'error', code: 'no_hello', message: 'Say hello first.' });
    const room = this.rooms.get(code);
    if (!room) return conn.send({ t: 'error', code: 'room_not_found', message: 'Room not found.' });
    if (room.seats[0].clientId === conn.clientId) return conn.send({ t: 'error', code: 'own_room', message: 'You cannot join your own room.' });
    if (room.seats[1] || room.status !== 'waiting') return conn.send({ t: 'error', code: 'room_full', message: 'This room is already full.' });
    const deck = this.checkDeck(conn, rawDeck);
    if (!deck) return;
    this.leave(conn);
    room.seats[1] = this.seat(conn, deck, deckName);
    conn.roomCode = room.code;
    this.startGame(room);
  }

  private quickMatch(conn: Conn, rawDeck: unknown, deckName: string): void {
    if (!conn.clientId) return conn.send({ t: 'error', code: 'no_hello', message: 'Say hello first.' });
    const deck = this.checkDeck(conn, rawDeck);
    if (!deck) return;
    this.leave(conn);
    this.queue = this.queue.filter((c) => c !== conn && this.conns.has(c.id));
    const other = this.queue.find((c) => c.clientId !== conn.clientId);
    if (!other || !other.queued) {
      conn.queued = { deck, deckName };
      this.queue.push(conn);
      conn.send({ t: 'queued', position: this.queue.length });
      return;
    }
    this.queue = this.queue.filter((c) => c !== other);
    const q = other.queued;
    other.queued = undefined;
    const room = this.createRoom(other, q.deck, q.deckName, false);
    if (!room) return;
    room.seats[1] = this.seat(conn, deck, deckName);
    conn.roomCode = room.code;
    this.startGame(room);
  }

  private startGame(room: Room): void {
    const [a, b] = room.seats;
    if (!b) return;
    room.game = createGame({ decks: [a.deck, b.deck], names: [a.name, b.name], seed: randomSeed() });
    room.status = 'playing';
    room.played = [{}, {}];
    room.harvestedSeq = 0;
    room.recorded = false;
    a.lastSeq = 0;
    b.lastSeq = 0;
    a.rematch = false;
    b.rematch = false;
    this.touchDeadline(room);
    this.broadcastRoom(room);
    this.sendState(room);
  }

  private leave(conn: Conn): void {
    const room = conn.roomCode ? this.rooms.get(conn.roomCode) : undefined;
    conn.roomCode = undefined;
    if (!room) return;
    const idx = room.seats.findIndex((s) => s?.conn === conn);
    if (idx < 0) return;
    if (room.status === 'playing' && room.game && room.game.winner === null) {
      applyAction(room.game, idx as PlayerId, { type: 'surrender' });
      this.afterChange(room);
    }
    const other = room.seats[idx === 0 ? 1 : 0];
    this.rooms.delete(room.code);
    if (other?.conn) {
      other.conn.send({ t: 'roomClosed', reason: 'opponent_left' });
      other.conn.roomCode = undefined;
    }
  }

  private seatOf(conn: Conn): { room: Room; p: PlayerId } | null {
    const room = conn.roomCode ? this.rooms.get(conn.roomCode) : undefined;
    if (!room) return null;
    const p = room.seats.findIndex((s) => s?.conn === conn);
    return p < 0 ? null : { room, p: p as PlayerId };
  }

  private action(conn: Conn, action: Action): void {
    const s = this.seatOf(conn);
    if (!s || !s.room.game || s.room.status !== 'playing') return conn.send({ t: 'error', code: 'no_game', message: 'No running duel.' });
    if (!action || typeof action !== 'object' || typeof (action as { type?: unknown }).type !== 'string') {
      return conn.send({ t: 'error', code: 'bad_action', message: 'Malformed action.' });
    }
    let res;
    try {
      res = applyAction(s.room.game, s.p, action);
    } catch (e) {
      console.error('engine error', e);
      res = { ok: false as const, error: 'engine error' };
    }
    if (!res.ok) {
      conn.send({ t: 'error', code: 'illegal_action', message: res.error });
      this.sendState(s.room, s.p);
      return;
    }
    this.afterChange(s.room);
  }

  private afterChange(room: Room): void {
    const g = room.game;
    if (!g) return;
    // harvest played cards for stats before events are trimmed
    const fresh = g.events.filter((e) => e.seq > room.harvestedSeq);
    room.harvestedSeq = g.eventSeq;
    const counted = playedCards({ ...g, events: fresh });
    for (const q of [0, 1] as PlayerId[]) for (const [id, n] of Object.entries(counted[q])) room.played[q][id] = (room.played[q][id] ?? 0) + n;
    if (g.winner !== null) {
      room.status = 'finished';
      room.deadline = null;
      this.record(room);
    } else this.touchDeadline(room);
    this.sendState(room);
    this.broadcastRoom(room);
  }

  private record(room: Room): void {
    const g = room.game;
    if (!g || room.recorded || !room.seats[1]) return;
    room.recorded = true;
    if (g.turn < 2 && g.winReason === 'surrender') return; // ignore instant forfeits
    const decks = [room.seats[0].deck, room.seats[1].deck];
    this.opts.onRecord({
      archetypes: [detectArchetype(decks[0]), detectArchetype(decks[1])],
      decks: [countIds([...decks[0].main, ...decks[0].extra]), countIds([...decks[1].main, ...decks[1].extra])],
      first: g.firstPlayer,
      winner: g.winner,
      turns: g.turn,
      reason: g.winReason ?? 'unknown',
      played: room.played,
      mode: 'online',
      at: this.opts.now(),
    });
  }

  private touchDeadline(room: Room): void {
    room.deadline = this.opts.now() + this.opts.decisionMs;
  }

  private chat(conn: Conn, text: string): void {
    const s = this.seatOf(conn);
    if (!s) return;
    const clean = String(text ?? '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, 200);
    if (!clean) return;
    const msg: ServerMsg = { t: 'chat', from: s.p, name: conn.name, text: clean, at: this.opts.now() };
    for (const seat of s.room.seats) seat?.conn?.send(msg);
  }

  private emote(conn: Conn, id: string): void {
    const s = this.seatOf(conn);
    if (!s || !(EMOTES as readonly string[]).includes(id)) return;
    for (const seat of s.room.seats) seat?.conn?.send({ t: 'emote', from: s.p, id });
  }

  private rematch(conn: Conn): void {
    const s = this.seatOf(conn);
    if (!s || s.room.status !== 'finished') return;
    const seat = s.room.seats[s.p]!;
    seat.rematch = true;
    if (s.room.seats.every((x) => x?.rematch && x.conn)) this.startGame(s.room);
    else this.broadcastRoom(s.room);
  }

  /** Periodic housekeeping: decision timeouts and abandoned rooms. */
  tick(): void {
    const now = this.opts.now();
    for (const room of [...this.rooms.values()]) {
      const g = room.game;
      if (room.status === 'playing' && g && g.winner === null) {
        for (const [i, seat] of room.seats.entries()) {
          if (seat && !seat.conn && seat.disconnectedAt && now - seat.disconnectedAt > this.opts.reconnectMs) {
            applyAction(g, i as PlayerId, { type: 'surrender' });
            this.afterChange(room);
          }
        }
        if (g.winner === null && room.deadline && now > room.deadline) this.autoPlay(room);
      }
      const bothGone = room.seats.every((s) => !s || !s.conn);
      const stale = now - room.createdAt > 6 * 60 * 60 * 1000;
      if ((bothGone && room.status !== 'playing') || stale) this.rooms.delete(room.code);
      if (bothGone && room.status === 'playing' && room.seats.every((s) => !s || (s.disconnectedAt && now - s.disconnectedAt > this.opts.reconnectMs))) {
        this.rooms.delete(room.code);
      }
    }
  }

  /** The player on the clock took too long: make a safe default decision for them. */
  private autoPlay(room: Room): void {
    const g = room.game!;
    const pend = g.pending;
    if (pend.kind === 'none') return;
    const p = pend.player;
    let action: Action;
    if (pend.kind === 'response') action = { type: 'pass' };
    else if (pend.kind === 'prompt') action = this.fallbackBot.decide(g, p);
    else {
      const phase = getOptions(g, p).find((o) => o.action.type === 'phase' && o.action.to === 'end');
      action = phase ? phase.action : this.fallbackBot.decide(g, p);
    }
    applyAction(g, p, action);
    this.afterChange(room);
  }

  // ---------------------------------------------------------------- output

  private roomInfo(room: Room, you: PlayerId): RoomInfo {
    return {
      code: room.code,
      status: room.status,
      you,
      isPublic: room.isPublic,
      deadline: room.deadline,
      players: room.seats.map((s) => (s ? { name: s.name, deckName: s.deckName, connected: !!s.conn, rematch: s.rematch } : null)),
    };
  }

  private broadcastRoom(room: Room): void {
    room.seats.forEach((s, i) => s?.conn?.send({ t: 'room', room: this.roomInfo(room, i as PlayerId) }));
  }

  private sendState(room: Room, only?: PlayerId): void {
    const g = room.game;
    if (!g) return;
    room.seats.forEach((s, i) => {
      if (!s?.conn || (only !== undefined && only !== i)) return;
      const view = getView(g, i as PlayerId, s.lastSeq);
      s.lastSeq = g.eventSeq;
      s.conn.send({ t: 'state', view });
    });
  }

  /** For tests. */
  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }
}
