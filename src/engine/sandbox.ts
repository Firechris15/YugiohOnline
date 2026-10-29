// Free duel ("sandbox") engine: every real card can be played because the
// players apply card effects themselves – the engine only keeps the table
// consistent (zones, hidden information, life points, turn order, log).
import { getDef, hasDef, isExtraDeckCard } from './db';
import type { DeckList, Phase, PlayerId, Position } from './types';
import { nextRandom, shuffleInPlace } from './rng';

export type SbZone = 'deck' | 'hand' | 'mzone' | 'szone' | 'fzone' | 'emz' | 'gy' | 'banished' | 'extra' | 'void';

export interface SbCard {
  uid: string;
  defId: string;
  owner: PlayerId;
  controller: PlayerId;
  zone: SbZone;
  slot: number;
  faceUp: boolean;
  position: Position;
  counters: number;
  token?: { atk: number; def: number };
}

export interface SbPlayer {
  id: PlayerId;
  name: string;
  lp: number;
  deck: string[];
  hand: string[];
  gy: string[];
  banished: string[];
  extra: string[];
  mzone: (string | null)[];
  szone: (string | null)[];
  fzone: string | null;
}

export interface SbEvent {
  seq: number;
  type: string;
  player: PlayerId;
  uid?: string;
  defId?: string | null;
  from?: SbZone;
  to?: SbZone;
  amount?: number;
  target?: string | null;
  text?: string;
  hidden?: boolean;
}

export interface SbLog {
  turn: number;
  player: PlayerId;
  key: string;
  params?: Record<string, string | number>;
}

export interface SbState {
  mode: 'free';
  rng: number;
  turn: number;
  turnPlayer: PlayerId;
  firstPlayer: PlayerId;
  phase: Phase;
  players: [SbPlayer, SbPlayer];
  emz: (string | null)[];
  cards: Record<string, SbCard>;
  tokenCounter: number;
  winner: PlayerId | 'draw' | null;
  winReason: string | null;
  events: SbEvent[];
  eventSeq: number;
  log: SbLog[];
  drewThisTurn: boolean;
}

export type SbAction =
  | { type: 'draw'; n?: number }
  | { type: 'move'; uid: string; to: SbZone; slot?: number; faceUp?: boolean; position?: Position; bottom?: boolean }
  | { type: 'position'; uid: string }
  | { type: 'flip'; uid: string }
  | { type: 'control'; uid: string }
  | { type: 'shuffle' }
  | { type: 'mill'; n?: number }
  | { type: 'lp'; player: PlayerId; delta: number }
  | { type: 'reveal'; uid: string }
  | { type: 'token'; atk: number; def: number; position?: Position }
  | { type: 'counter'; uid: string; delta: number }
  | { type: 'phase'; to: Phase }
  | { type: 'endTurn' }
  | { type: 'attack'; uid: string; target: string | null }
  | { type: 'coin' }
  | { type: 'dice' }
  | { type: 'viewDeck' }
  | { type: 'surrender' };

const opp = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);
const FIELD: SbZone[] = ['mzone', 'szone', 'fzone', 'emz'];
const isField = (z: SbZone) => FIELD.includes(z);

function emit(s: SbState, e: Omit<SbEvent, 'seq'>) {
  s.events.push({ ...e, seq: ++s.eventSeq });
  if (s.events.length > 300) s.events.splice(0, s.events.length - 300);
}

function log(s: SbState, player: PlayerId, key: string, params?: Record<string, string | number>) {
  s.log.push({ turn: s.turn, player, key, params });
  if (s.log.length > 300) s.log.splice(0, s.log.length - 300);
}

function newSbPlayer(id: PlayerId, name: string, lp = 8000): SbPlayer {
  return { id, name, lp, deck: [], hand: [], gy: [], banished: [], extra: [], mzone: [null, null, null, null, null], szone: [null, null, null, null, null], fzone: null };
}

export function createSandbox(opts: { decks: [DeckList, DeckList]; names: [string, string]; seed: number; firstPlayer?: PlayerId; startLp?: number }): SbState {
  const s: SbState = {
    mode: 'free',
    rng: opts.seed >>> 0,
    turn: 1,
    turnPlayer: 0,
    firstPlayer: 0,
    phase: 'main1',
    players: [newSbPlayer(0, opts.names[0], opts.startLp), newSbPlayer(1, opts.names[1], opts.startLp)],
    emz: [null, null],
    cards: {},
    tokenCounter: 0,
    winner: null,
    winReason: null,
    events: [],
    eventSeq: 0,
    log: [],
    drewThisTurn: false,
  };
  const used = new Set<string>();
  for (const p of [0, 1] as PlayerId[]) {
    for (const defId of [...opts.decks[p].main, ...opts.decks[p].extra]) {
      if (!hasDef(defId)) continue;
      let uid: string;
      do uid = `${p}${Math.floor(nextRandom(s) * 2176782336).toString(36)}`;
      while (used.has(uid));
      used.add(uid);
      const extra = isExtraDeckCard(getDef(defId));
      s.cards[uid] = { uid, defId, owner: p, controller: p, zone: extra ? 'extra' : 'deck', slot: -1, faceUp: false, position: 'atk', counters: 0 };
      (extra ? s.players[p].extra : s.players[p].deck).push(uid);
    }
    shuffleInPlace(s, s.players[p].deck);
  }
  s.firstPlayer = opts.firstPlayer ?? (nextRandom(s) < 0.5 ? 0 : 1);
  s.turnPlayer = s.firstPlayer;
  emit(s, { type: 'start', player: s.firstPlayer });
  for (const p of [s.firstPlayer, opp(s.firstPlayer)]) draw(s, p, 5, true);
  s.drewThisTurn = true; // the first player does not draw on turn 1
  return s;
}

function zoneArray(s: SbState, c: SbCard): string[] | (string | null)[] | null {
  const ps = s.players[c.zone === 'mzone' || c.zone === 'szone' || c.zone === 'fzone' ? c.controller : c.owner];
  switch (c.zone) {
    case 'deck':
      return ps.deck;
    case 'hand':
      return ps.hand;
    case 'gy':
      return ps.gy;
    case 'banished':
      return ps.banished;
    case 'extra':
      return ps.extra;
    case 'mzone':
      return ps.mzone;
    case 'szone':
      return ps.szone;
    case 'emz':
      return s.emz;
    default:
      return null;
  }
}

function detach(s: SbState, c: SbCard) {
  if (c.zone === 'fzone') {
    const ps = s.players[c.controller];
    if (ps.fzone === c.uid) ps.fzone = null;
    return;
  }
  const arr = zoneArray(s, c);
  if (!arr) return;
  const i = arr.indexOf(c.uid);
  if (i < 0) return;
  if (c.zone === 'mzone' || c.zone === 'szone' || c.zone === 'emz') (arr as (string | null)[])[i] = null;
  else (arr as string[]).splice(i, 1);
}

function place(s: SbState, c: SbCard, to: SbZone, controller: PlayerId, opts: { slot?: number; faceUp?: boolean; position?: Position; bottom?: boolean }): boolean {
  const ps = s.players[controller];
  const slotIn = (arr: (string | null)[]) => (opts.slot !== undefined && arr[opts.slot] === null ? opts.slot : arr.indexOf(null));
  switch (to) {
    case 'mzone':
    case 'szone':
    case 'emz': {
      const arr = to === 'emz' ? s.emz : ps[to];
      const slot = slotIn(arr);
      if (slot < 0) return false;
      detach(s, c);
      arr[slot] = c.uid;
      c.slot = slot;
      c.controller = controller;
      break;
    }
    case 'fzone':
      if (ps.fzone && ps.fzone !== c.uid) return false;
      detach(s, c);
      ps.fzone = c.uid;
      c.slot = 0;
      c.controller = controller;
      break;
    default: {
      // Extra Deck monsters never go to the hand or Main Deck.
      if ((to === 'hand' || to === 'deck') && !c.token && isExtraDeckCard(getDef(c.defId))) to = 'extra';
      detach(s, c);
      if (c.token && !isField(to)) {
        c.zone = 'void';
        return true;
      }
      c.controller = c.owner;
      const own = s.players[c.owner];
      const list = to === 'deck' ? own.deck : to === 'hand' ? own.hand : to === 'gy' ? own.gy : to === 'banished' ? own.banished : own.extra;
      if (to === 'deck' && !opts.bottom) list.push(c.uid);
      else if (to === 'deck') list.unshift(c.uid);
      else list.push(c.uid);
      c.slot = -1;
    }
  }
  const from = c.zone;
  c.zone = to;
  if (isField(to)) {
    c.faceUp = opts.faceUp ?? (to === 'szone' ? false : true);
    c.position = opts.position ?? (to === 'mzone' || to === 'emz' ? (c.faceUp ? 'atk' : 'def') : 'atk');
  } else {
    c.faceUp = to === 'gy' || to === 'banished' || (to === 'extra' && opts.faceUp === true);
    c.position = 'atk';
    c.counters = 0;
  }
  if (from === 'deck' && to !== 'deck') c.counters = 0;
  return true;
}

function draw(s: SbState, p: PlayerId, n: number, silent = false): number {
  let k = 0;
  for (let i = 0; i < n; i++) {
    const top = s.players[p].deck[s.players[p].deck.length - 1];
    if (!top) break;
    place(s, s.cards[top], 'hand', p, {});
    emit(s, { type: 'draw', player: p, uid: top, defId: s.cards[top].defId, hidden: true });
    k++;
  }
  if (k && !silent) log(s, p, 'free.log.draw', { n: k });
  if (k < n && !silent) log(s, p, 'free.log.deckEmpty');
  return k;
}

export type SbResult = { ok: true } | { ok: false; error: string };
const fail = (error: string): SbResult => ({ ok: false, error });

export function applySandbox(s: SbState, p: PlayerId, a: SbAction): SbResult {
  if (s.winner !== null) return fail('game over');
  const mine = (uid: string) => {
    const c = s.cards[uid];
    if (!c || c.zone === 'void') return null;
    const ctrl = isField(c.zone) ? c.controller : c.owner;
    return ctrl === p ? c : null;
  };
  switch (a.type) {
    case 'draw':
      if (draw(s, p, Math.max(1, Math.min(10, a.n ?? 1))) === 0) return fail('deck empty');
      if (p === s.turnPlayer) s.drewThisTurn = true;
      return { ok: true };
    case 'move': {
      const c = mine(a.uid);
      if (!c) return fail('not your card');
      if (a.to === 'void' || (a.to === 'extra' && !c.token && !isExtraDeckCard(getDef(c.defId)) && !getDef(c.defId).pendulum)) return fail('invalid zone');
      const from = c.zone;
      const wasFaceUp = c.faceUp;
      if (!place(s, c, a.to, p, { slot: a.slot, faceUp: a.faceUp, position: a.position, bottom: a.bottom })) return fail('zone occupied');
      const visible = c.faceUp || a.to === 'gy' || a.to === 'banished';
      emit(s, { type: 'move', player: p, uid: c.uid, defId: visible || wasFaceUp ? c.defId : null, from, to: c.zone, hidden: !visible && !wasFaceUp });
      if (from === 'hand' && isField(c.zone)) emit(s, { type: 'play', player: p, uid: c.uid, defId: c.defId, hidden: !c.faceUp });
      log(s, p, 'free.log.move', { card: visible || wasFaceUp ? c.defId : '?', from, to: c.zone });
      if (from === 'deck' && c.zone !== 'deck') {
        shuffleInPlace(s, s.players[p].deck);
        emit(s, { type: 'shuffle', player: p });
      }
      return { ok: true };
    }
    case 'position': {
      const c = mine(a.uid);
      if (!c || (c.zone !== 'mzone' && c.zone !== 'emz')) return fail('not a monster you control');
      c.position = c.position === 'atk' ? 'def' : 'atk';
      emit(s, { type: 'position', player: p, uid: c.uid, text: c.position });
      log(s, p, 'free.log.position', { card: c.faceUp ? c.defId : '?' });
      return { ok: true };
    }
    case 'flip': {
      const c = mine(a.uid);
      if (!c || !isField(c.zone)) return fail('not a card on your field');
      c.faceUp = !c.faceUp;
      if (c.zone === 'mzone' && !c.faceUp) c.position = 'def';
      emit(s, { type: c.faceUp ? 'flip' : 'set', player: p, uid: c.uid, defId: c.faceUp ? c.defId : null });
      log(s, p, c.faceUp ? 'free.log.flipUp' : 'free.log.flipDown', { card: c.faceUp ? c.defId : '?' });
      return { ok: true };
    }
    case 'control': {
      const c = s.cards[a.uid];
      if (!c || (c.zone !== 'mzone' && c.zone !== 'szone') || c.controller === p) return fail('cannot take control');
      const target = c.zone;
      const from = c.controller;
      if (!place(s, c, target, p, { faceUp: c.faceUp, position: c.position })) return fail('no free zone');
      emit(s, { type: 'control', player: p, uid: c.uid, defId: c.faceUp ? c.defId : null });
      log(s, p, 'free.log.control', { card: c.faceUp ? c.defId : '?', from: s.players[from].name });
      return { ok: true };
    }
    case 'shuffle':
      shuffleInPlace(s, s.players[p].deck);
      emit(s, { type: 'shuffle', player: p });
      log(s, p, 'free.log.shuffle');
      return { ok: true };
    case 'mill': {
      const n = Math.max(1, Math.min(10, a.n ?? 1));
      for (let i = 0; i < n; i++) {
        const top = s.players[p].deck[s.players[p].deck.length - 1];
        if (!top) break;
        place(s, s.cards[top], 'gy', p, {});
        emit(s, { type: 'move', player: p, uid: top, defId: s.cards[top].defId, from: 'deck', to: 'gy' });
      }
      log(s, p, 'free.log.mill', { n });
      return { ok: true };
    }
    case 'lp': {
      if (!Number.isFinite(a.delta) || a.delta === 0 || Math.abs(a.delta) > 100000) return fail('invalid amount');
      const target = s.players[a.player];
      if (!target) return fail('invalid player');
      target.lp = Math.max(0, Math.round(target.lp + a.delta));
      emit(s, { type: 'lp', player: a.player, amount: Math.round(a.delta), text: String(p) });
      log(s, p, a.delta < 0 ? 'free.log.damage' : 'free.log.gain', { target: target.name, amount: Math.abs(Math.round(a.delta)) });
      if (target.lp === 0) {
        s.winner = opp(a.player);
        s.winReason = 'lp';
        emit(s, { type: 'gameOver', player: s.winner });
      }
      return { ok: true };
    }
    case 'reveal': {
      const c = mine(a.uid);
      if (!c) return fail('not your card');
      emit(s, { type: 'reveal', player: p, uid: c.uid, defId: c.defId });
      log(s, p, 'free.log.reveal', { card: c.defId });
      return { ok: true };
    }
    case 'token': {
      const ps = s.players[p];
      if (!ps.mzone.includes(null)) return fail('no free zone');
      const uid = `tk${p}_${++s.tokenCounter}`;
      const atk = Math.max(0, Math.min(10000, Math.round(a.atk || 0)));
      const def = Math.max(0, Math.min(10000, Math.round(a.def || 0)));
      s.cards[uid] = { uid, defId: 'TOKEN', owner: p, controller: p, zone: 'void', slot: -1, faceUp: true, position: a.position ?? 'def', counters: 0, token: { atk, def } };
      place(s, s.cards[uid], 'mzone', p, { faceUp: true, position: a.position ?? 'def' });
      emit(s, { type: 'token', player: p, uid });
      log(s, p, 'free.log.token', { atk, def });
      return { ok: true };
    }
    case 'counter': {
      const c = s.cards[a.uid];
      if (!c || !isField(c.zone)) return fail('not on the field');
      c.counters = Math.max(0, Math.min(99, c.counters + Math.sign(a.delta)));
      emit(s, { type: 'counter', player: p, uid: c.uid, amount: c.counters });
      return { ok: true };
    }
    case 'phase':
      if (p !== s.turnPlayer) return fail('not your turn');
      s.phase = a.to;
      emit(s, { type: 'phase', player: p, text: a.to });
      log(s, p, 'free.log.phase', { phase: a.to });
      return { ok: true };
    case 'endTurn':
      if (p !== s.turnPlayer) return fail('not your turn');
      s.turn++;
      s.turnPlayer = opp(p);
      s.phase = 'draw';
      s.drewThisTurn = false;
      emit(s, { type: 'turn', player: s.turnPlayer, amount: s.turn });
      log(s, s.turnPlayer, 'free.log.turn', { turn: s.turn });
      if (s.players[s.turnPlayer].deck.length === 0) {
        s.winner = p;
        s.winReason = 'deckout';
        emit(s, { type: 'gameOver', player: p });
        return { ok: true };
      }
      draw(s, s.turnPlayer, 1);
      s.drewThisTurn = true;
      s.phase = 'main1';
      return { ok: true };
    case 'attack': {
      const c = mine(a.uid);
      if (!c || (c.zone !== 'mzone' && c.zone !== 'emz')) return fail('not your monster');
      if (a.target && !s.cards[a.target]) return fail('invalid target');
      emit(s, { type: 'attack', player: p, uid: c.uid, target: a.target, defId: c.defId });
      log(s, p, a.target ? 'free.log.attack' : 'free.log.directAttack', { card: c.defId, target: a.target && s.cards[a.target].faceUp ? s.cards[a.target].defId : '?' });
      return { ok: true };
    }
    case 'coin': {
      const heads = nextRandom(s) < 0.5;
      emit(s, { type: 'coin', player: p, text: heads ? 'heads' : 'tails' });
      log(s, p, heads ? 'free.log.heads' : 'free.log.tails');
      return { ok: true };
    }
    case 'dice': {
      const n = 1 + Math.floor(nextRandom(s) * 6);
      emit(s, { type: 'dice', player: p, amount: n });
      log(s, p, 'free.log.dice', { n });
      return { ok: true };
    }
    case 'viewDeck':
      log(s, p, 'free.log.viewDeck');
      emit(s, { type: 'viewDeck', player: p });
      return { ok: true };
    case 'surrender':
      s.winner = opp(p);
      s.winReason = 'surrender';
      emit(s, { type: 'gameOver', player: s.winner });
      return { ok: true };
  }
  return fail('unknown action');
}

// --------------------------------------------------------------------- views

export interface SbCardView {
  uid: string;
  defId: string | null;
  owner: PlayerId;
  controller: PlayerId;
  zone: SbZone;
  slot: number;
  faceUp: boolean;
  position: Position;
  counters: number;
  token?: { atk: number; def: number };
}

export interface SbPlayerView {
  id: PlayerId;
  name: string;
  lp: number;
  deckCount: number;
  deck: SbCardView[]; // own deck only, sorted (order stays secret)
  hand: SbCardView[];
  gy: SbCardView[];
  banished: SbCardView[];
  extra: SbCardView[];
  extraCount: number;
  mzone: (SbCardView | null)[];
  szone: (SbCardView | null)[];
  fzone: SbCardView | null;
}

export interface SbView {
  mode: 'free';
  you: PlayerId;
  turn: number;
  turnPlayer: PlayerId;
  firstPlayer: PlayerId;
  phase: Phase;
  players: [SbPlayerView, SbPlayerView];
  emz: (SbCardView | null)[];
  winner: PlayerId | 'draw' | null;
  winReason: string | null;
  events: SbEvent[];
  log: SbLog[];
  eventSeq: number;
}

export function sandboxView(s: SbState, viewer: PlayerId, sinceSeq = 0): SbView {
  const cv = (uid: string): SbCardView => {
    const c = s.cards[uid];
    let visible: boolean;
    switch (c.zone) {
      case 'gy':
      case 'banished':
        visible = true;
        break;
      case 'hand':
      case 'deck':
      case 'extra':
        visible = c.owner === viewer || (c.zone === 'extra' && c.faceUp);
        break;
      default:
        visible = c.faceUp || c.controller === viewer;
    }
    return { uid, defId: visible ? c.defId : null, owner: c.owner, controller: c.controller, zone: c.zone, slot: c.slot, faceUp: c.faceUp, position: c.position, counters: c.counters, token: c.token };
  };
  const pv = (p: PlayerId): SbPlayerView => {
    const ps = s.players[p];
    const own = p === viewer;
    return {
      id: p,
      name: ps.name,
      lp: ps.lp,
      deckCount: ps.deck.length,
      deck: own ? [...ps.deck].map(cv).sort((a, b) => String(a.defId).localeCompare(String(b.defId))) : [],
      hand: ps.hand.map(cv),
      gy: ps.gy.map(cv),
      banished: ps.banished.map(cv),
      extra: own ? ps.extra.map(cv) : ps.extra.filter((u) => s.cards[u].faceUp).map(cv),
      extraCount: ps.extra.length,
      mzone: ps.mzone.map((u) => (u ? cv(u) : null)),
      szone: ps.szone.map((u) => (u ? cv(u) : null)),
      fzone: ps.fzone ? cv(ps.fzone) : null,
    };
  };
  const events = s.events.filter((e) => e.seq > sinceSeq).map((e) => (e.hidden && e.player !== viewer ? { ...e, defId: null } : e));
  return {
    mode: 'free',
    you: viewer,
    turn: s.turn,
    turnPlayer: s.turnPlayer,
    firstPlayer: s.firstPlayer,
    phase: s.phase,
    players: [pv(0), pv(1)],
    emz: s.emz.map((u) => (u ? cv(u) : null)),
    winner: s.winner,
    winReason: s.winReason,
    events,
    log: s.log.slice(-100),
    eventSeq: s.eventSeq,
  };
}
