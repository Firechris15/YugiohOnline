// Low level state manipulation: moving cards, summoning, destroying, LP,
// drawing, event emission and trigger collection.
import { getDef } from './db';
import type {
  CardDef,
  CardInstance,
  GameEvent,
  GameState,
  LocalizedText,
  PlayerId,
  Position,
  Prompt,
  SummonMethod,
  TriggerEvent,
  Zone,
} from './types';
import { hasAbility } from './stats';
import { shuffleInPlace } from './rng';

export const opp = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

export function card(g: GameState, uid: string): CardInstance {
  const c = g.cards[uid];
  if (!c) throw new Error(`Unknown card instance ${uid}`);
  return c;
}

export function defOf(g: GameState, uid: string): CardDef {
  return getDef(card(g, uid).defId);
}

export function emit(g: GameState, ev: Omit<GameEvent, 'seq'>): void {
  g.events.push({ ...ev, seq: ++g.eventSeq });
  if (g.events.length > 400) g.events.splice(0, g.events.length - 400);
}

export function log(g: GameState, key: string, params?: Record<string, string | number>, player?: PlayerId): void {
  g.log.push({ turn: g.turn, player, key, params });
  if (g.log.length > 300) g.log.splice(0, g.log.length - 300);
}

export function isOnField(c: CardInstance): boolean {
  return c.zone === 'mzone' || c.zone === 'szone' || c.zone === 'fzone';
}

export function fieldMonsters(g: GameState, p: PlayerId): string[] {
  return g.players[p].mzone.filter((x): x is string => x !== null);
}

export function fieldSpellTraps(g: GameState, p: PlayerId, includeField = true): string[] {
  const out = g.players[p].szone.filter((x): x is string => x !== null);
  if (includeField && g.players[p].fzone) out.push(g.players[p].fzone);
  return out;
}

export function allFieldCards(g: GameState): string[] {
  return [...fieldMonsters(g, 0), ...fieldSpellTraps(g, 0), ...fieldMonsters(g, 1), ...fieldSpellTraps(g, 1)];
}

export function freeMonsterZones(g: GameState, p: PlayerId): number {
  return g.players[p].mzone.filter((x) => x === null).length;
}

export function freeSpellZones(g: GameState, p: PlayerId): number {
  return g.players[p].szone.filter((x) => x === null).length;
}

export function zoneList(g: GameState, p: PlayerId, zone: Zone): string[] {
  const ps = g.players[p];
  switch (zone) {
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
      return fieldMonsters(g, p);
    case 'szone':
      return ps.szone.filter((x): x is string => x !== null);
    case 'fzone':
      return ps.fzone ? [ps.fzone] : [];
    default:
      return [];
  }
}

function removeFromZone(g: GameState, c: CardInstance): void {
  const ps = g.players[c.controller];
  const own = g.players[c.owner];
  const rm = (arr: string[]) => {
    const i = arr.indexOf(c.uid);
    if (i >= 0) arr.splice(i, 1);
  };
  switch (c.zone) {
    case 'deck':
      rm(own.deck);
      break;
    case 'hand':
      rm(own.hand);
      break;
    case 'gy':
      rm(own.gy);
      break;
    case 'banished':
      rm(own.banished);
      break;
    case 'extra':
      rm(own.extra);
      break;
    case 'mzone': {
      const i = ps.mzone.indexOf(c.uid);
      if (i >= 0) ps.mzone[i] = null;
      break;
    }
    case 'szone': {
      const i = ps.szone.indexOf(c.uid);
      if (i >= 0) ps.szone[i] = null;
      break;
    }
    case 'fzone':
      if (ps.fzone === c.uid) ps.fzone = null;
      break;
  }
}

export interface MoveOpts {
  faceUp?: boolean;
  position?: Position;
  controller?: PlayerId;
  slot?: number;
  bottom?: boolean;
  reason?: 'battle' | 'effect' | 'cost' | 'material' | 'tribute' | 'discard' | 'rule' | 'resolve' | 'draw' | 'summon';
  silent?: boolean;
}

/** Move a card instance to a zone, keeping all zone arrays consistent. */
export function moveCard(g: GameState, uid: string, to: Zone, opts: MoveOpts = {}): void {
  const c = card(g, uid);
  const d = getDef(c.defId);
  const from = c.zone;
  const wasOnField = isOnField(c);
  removeFromZone(g, c);

  // Tokens cease to exist when they leave the field.
  if (d.token && to !== 'mzone') {
    c.zone = 'void';
    if (!opts.silent) emit(g, { type: 'move', uid, from, to: 'void', player: c.controller, defId: c.defId });
    return;
  }
  // Fusion monsters return to the Extra Deck instead of hand/deck.
  if ((to === 'hand' || to === 'deck') && d.frame === 'fusion') to = 'extra';

  const leavingField = wasOnField && to !== 'mzone' && to !== 'szone' && to !== 'fzone';
  if (leavingField || !wasOnField) {
    c.modifiers = [];
    c.attacks = 0;
    c.equippedTo = undefined;
  }

  const controller = to === 'mzone' || to === 'szone' || to === 'fzone' ? (opts.controller ?? c.controller) : c.owner;
  c.controller = controller;
  const ps = g.players[controller];
  c.zone = to;
  switch (to) {
    case 'deck':
      if (opts.bottom) ps.deck.unshift(uid);
      else ps.deck.push(uid);
      c.faceUp = false;
      break;
    case 'hand':
      ps.hand.push(uid);
      c.faceUp = false;
      break;
    case 'gy':
      ps.gy.push(uid);
      c.faceUp = true;
      break;
    case 'banished':
      ps.banished.push(uid);
      c.faceUp = true;
      break;
    case 'extra':
      ps.extra.push(uid);
      c.faceUp = false;
      break;
    case 'mzone': {
      const slot = opts.slot !== undefined && ps.mzone[opts.slot] === null ? opts.slot : ps.mzone.indexOf(null);
      if (slot < 0) throw new Error('No free monster zone');
      ps.mzone[slot] = uid;
      c.slot = slot;
      c.faceUp = opts.faceUp ?? true;
      c.position = opts.position ?? 'atk';
      c.turnPlaced = g.turn;
      break;
    }
    case 'szone': {
      const slot = opts.slot !== undefined && ps.szone[opts.slot] === null ? opts.slot : ps.szone.indexOf(null);
      if (slot < 0) throw new Error('No free spell/trap zone');
      ps.szone[slot] = uid;
      c.slot = slot;
      c.faceUp = opts.faceUp ?? false;
      c.position = 'atk';
      c.turnPlaced = g.turn;
      break;
    }
    case 'fzone': {
      if (ps.fzone) {
        const old = ps.fzone;
        moveCard(g, old, 'gy', { reason: 'rule' });
      }
      ps.fzone = uid;
      c.slot = 0;
      c.faceUp = opts.faceUp ?? true;
      c.turnPlaced = g.turn;
      break;
    }
  }
  if (!opts.silent) {
    const hidden = (to === 'hand' || to === 'deck' || to === 'extra' || (!c.faceUp && to !== 'gy')) && from !== 'mzone';
    emit(g, {
      type: 'move',
      uid,
      from,
      to,
      player: controller,
      defId: c.defId,
      hidden,
      text: opts.reason,
    });
  }
  if (to === 'gy') {
    queueSelfTriggers(g, uid, 'sentToGY');
    if (wasOnField) queueSelfTriggers(g, uid, 'sentToGYFromField');
    if (opts.reason === 'material') queueSelfTriggers(g, uid, 'sentToGYAsMaterial');
  }
  if (leavingField) cleanupEquips(g);
}

/** Equip spells whose equipped monster left the field are destroyed. */
export function cleanupEquips(g: GameState): void {
  for (const p of [0, 1] as PlayerId[]) {
    for (const uid of fieldSpellTraps(g, p, false)) {
      const c = card(g, uid);
      if (!c.equippedTo) continue;
      const host = g.cards[c.equippedTo];
      if (!host || host.zone !== 'mzone' || !host.faceUp) {
        c.equippedTo = undefined;
        moveCard(g, uid, 'gy', { reason: 'rule' });
        emit(g, { type: 'destroy', uid, player: c.controller, defId: c.defId });
      }
    }
  }
}

export function queueSelfTriggers(g: GameState, uid: string, ev: TriggerEvent, eventCards: string[] = []): void {
  const c = g.cards[uid];
  if (!c) return;
  const d = getDef(c.defId);
  d.effects?.forEach((e, i) => {
    if (e.kind === 'trigger' && e.event === ev) {
      const player = isOnField(c) ? c.controller : c.owner;
      if (!g.pendingTriggers.some((t) => t.uid === uid && t.effectIdx === i)) {
        g.pendingTriggers.push({ uid, effectIdx: i, player, eventCards });
      }
    }
  });
}

/** Triggers of face-up field cards that watch global events (standby, end phase, opponent summons). */
export function queueFieldTriggers(g: GameState, player: PlayerId, ev: TriggerEvent, eventCards: string[] = []): void {
  for (const uid of [...fieldMonsters(g, player), ...fieldSpellTraps(g, player)]) {
    const c = card(g, uid);
    if (!c.faceUp) continue;
    getDef(c.defId).effects?.forEach((e, i) => {
      if (e.kind === 'trigger' && e.event === ev) g.pendingTriggers.push({ uid, effectIdx: i, player, eventCards });
    });
  }
}

// ---------------------------------------------------------------------------
// LP, drawing, game end
// ---------------------------------------------------------------------------

export function setWinner(g: GameState, winner: PlayerId | 'draw', reason: string): void {
  if (g.winner !== null) return;
  g.winner = winner;
  g.winReason = reason;
  g.pending = { kind: 'none' };
  g.prompt = null;
  emit(g, { type: 'gameOver', player: winner === 'draw' ? undefined : winner, text: reason });
  log(g, 'log.gameOver', { reason });
}

export function checkLp(g: GameState): void {
  const dead0 = g.players[0].lp <= 0;
  const dead1 = g.players[1].lp <= 0;
  if (dead0 && dead1) setWinner(g, 'draw', 'lp');
  else if (dead0) setWinner(g, 1, 'lp');
  else if (dead1) setWinner(g, 0, 'lp');
}

export function changeLp(g: GameState, p: PlayerId, delta: number, kind: 'damage' | 'battle' | 'gain' | 'cost'): void {
  if (delta === 0) return;
  const ps = g.players[p];
  ps.lp = Math.max(0, ps.lp + delta);
  emit(g, { type: 'lp', player: p, amount: delta, text: kind });
  log(g, delta < 0 ? 'log.damage' : 'log.gain', { amount: Math.abs(delta) }, p);
  checkLp(g);
}

export function drawCards(g: GameState, p: PlayerId, n: number): number {
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    const ps = g.players[p];
    const top = ps.deck[ps.deck.length - 1];
    if (!top) {
      setWinner(g, opp(p), 'deckout');
      return drawn;
    }
    moveCard(g, top, 'hand', { reason: 'draw', silent: true });
    emit(g, { type: 'draw', player: p, uid: top, defId: g.cards[top].defId, hidden: true });
    drawn++;
  }
  if (drawn) log(g, 'log.draw', { n: drawn }, p);
  return drawn;
}

export function shuffleDeck(g: GameState, p: PlayerId): void {
  shuffleInPlace(g, g.players[p].deck);
  emit(g, { type: 'shuffle', player: p });
}

// ---------------------------------------------------------------------------
// Summoning & destruction
// ---------------------------------------------------------------------------

export function summonMonster(
  g: GameState,
  uid: string,
  player: PlayerId,
  method: SummonMethod,
  position: Position = 'atk',
  faceUp = true,
): void {
  moveCard(g, uid, 'mzone', { controller: player, position, faceUp, reason: 'summon', silent: true });
  const c = card(g, uid);
  c.summonedTurn = g.turn;
  c.positionChangedTurn = -1;
  c.attacks = 0;
  emit(g, { type: method === 'set' ? 'set' : 'summon', uid, player, defId: faceUp ? c.defId : undefined, text: method, hidden: !faceUp });
  if (method === 'set') {
    log(g, 'log.setMonster', {}, player);
    return;
  }
  log(g, 'log.summon', { card: c.defId, method }, player);
  queueSelfTriggers(g, uid, 'summoned');
  if (method === 'normal' || method === 'tribute') queueSelfTriggers(g, uid, 'normalSummoned');
  if (method === 'tribute') queueSelfTriggers(g, uid, 'tributeSummoned');
  if (method === 'special' || method === 'fusion') queueSelfTriggers(g, uid, 'specialSummoned');
  if (method === 'fusion') queueSelfTriggers(g, uid, 'fusionSummoned');
  if (method === 'flip') queueSelfTriggers(g, uid, 'flipped');
  queueFieldTriggers(g, opp(player), 'oppSummon', [uid]);
}

/** Flip a face-down monster face-up (by attack or effect). */
export function flipFaceUp(g: GameState, uid: string, position?: Position): void {
  const c = card(g, uid);
  if (c.faceUp) return;
  c.faceUp = true;
  if (position) c.position = position;
  emit(g, { type: 'flip', uid, player: c.controller, defId: c.defId });
  queueSelfTriggers(g, uid, 'flipped');
}

export function destroyCards(g: GameState, uids: string[], reason: 'battle' | 'effect'): string[] {
  const destroyed: string[] = [];
  for (const uid of uids) {
    const c = g.cards[uid];
    if (!c || !isOnField(c)) continue;
    if (c.zone === 'mzone' && c.faceUp) {
      if (reason === 'battle' && hasAbility(g, uid, 'indestructibleBattle')) continue;
      if (reason === 'effect' && hasAbility(g, uid, 'indestructibleEffect')) continue;
    }
    destroyed.push(uid);
  }
  for (const uid of destroyed) {
    const c = card(g, uid);
    emit(g, { type: 'destroy', uid, player: c.controller, defId: c.defId, text: reason });
    log(g, 'log.destroy', { card: c.defId }, c.controller);
    moveCard(g, uid, 'gy', { reason });
    queueSelfTriggers(g, uid, 'destroyed');
    if (reason === 'battle') queueSelfTriggers(g, uid, 'destroyedByBattle');
  }
  return destroyed;
}

export function createToken(g: GameState, tokenId: string, player: PlayerId): string {
  const uid = `t${player}_${++g.tokenCounter}`;
  g.cards[uid] = newInstance(uid, tokenId, player);
  g.cards[uid].zone = 'void';
  return uid;
}

export function newInstance(uid: string, defId: string, owner: PlayerId): CardInstance {
  return {
    uid,
    defId,
    owner,
    controller: owner,
    zone: 'deck',
    slot: -1,
    faceUp: false,
    position: 'atk',
    turnPlaced: -1,
    summonedTurn: -1,
    attacks: 0,
    positionChangedTurn: -1,
    attackedTurn: -1,
    modifiers: [],
    opt: {},
  };
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export function ask(g: GameState, p: Omit<Prompt, 'id'>): void {
  const prompt: Prompt = { ...p, id: ++g.promptCounter };
  g.prompt = prompt;
  g.pending = { kind: 'prompt', player: p.player, prompt };
}

export function takeAnswer(g: GameState): GameState['taskAnswer'] {
  const a = g.taskAnswer;
  g.taskAnswer = undefined;
  return a;
}

export const T = (en: string, de: string): LocalizedText => ({ en, de });
