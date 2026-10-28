// Game flow: creating games, applying actions, the task loop, chain
// resolution, triggers, battle and phases.
import { getDef, isExtraDeckCard } from './db';
import type {
  Action,
  ChainLink,
  DeckList,
  EffectContext,
  GameState,
  PlayerId,
  PlayerState,
  Position,
  Task,
  WindowCtx,
} from './types';
import {
  ask,
  card,
  changeLp,
  checkLp,
  cleanupEquips,
  destroyCards,
  drawCards,
  emit,
  fieldMonsters,
  flipFaceUp,
  freeMonsterZones,
  isOnField,
  log,
  moveCard,
  newInstance,
  opp,
  queueFieldTriggers,
  queueSelfTriggers,
  setWinner,
  summonMonster,
  T,
  takeAnswer,
} from './core';
import {
  checkActivation,
  checkSpecialProc,
  effectSpeed,
  isPersistent,
  makeCtx,
  payCost,
  targetCandidates,
  windowEventCards,
} from './activation';
import { execOp } from './ops';
import { getAtk, getDefense, hasAbility } from './stats';
import { nextRandom, shuffleInPlace } from './rng';
import { getOptions, canRespond, findMatchingOption } from './options';

export interface CreateGameOptions {
  decks: [DeckList, DeckList];
  names: [string, string];
  seed: number;
  firstPlayer?: PlayerId;
  startLp?: number;
}

export function createGame(opts: CreateGameOptions): GameState {
  const g: GameState = {
    version: 1,
    rng: opts.seed >>> 0,
    turn: 1,
    turnPlayer: 0,
    firstPlayer: 0,
    phase: 'draw',
    players: [newPlayer(0, opts), newPlayer(1, opts)],
    cards: {},
    chain: [],
    chainCounter: 0,
    stack: [],
    resolving: null,
    pending: { kind: 'none' },
    pendingTriggers: [],
    battle: null,
    window: null,
    prompt: null,
    promptCounter: 0,
    tokenCounter: 0,
    winner: null,
    winReason: null,
    events: [],
    eventSeq: 0,
    log: [],
    rules: { startLp: opts.startLp ?? 8000, handSize: 6 },
  };
  const used = new Set<string>();
  const mkUid = (p: PlayerId) => {
    for (;;) {
      const id = `${p}${Math.floor(nextRandom(g) * 2176782336).toString(36)}`;
      if (!used.has(id)) {
        used.add(id);
        return id;
      }
    }
  };
  for (const p of [0, 1] as PlayerId[]) {
    const deck = opts.decks[p];
    for (const defId of [...deck.main, ...deck.extra]) {
      const d = getDef(defId);
      const uid = mkUid(p);
      const inst = newInstance(uid, defId, p);
      g.cards[uid] = inst;
      if (isExtraDeckCard(d)) {
        inst.zone = 'extra';
        g.players[p].extra.push(uid);
      } else {
        inst.zone = 'deck';
        g.players[p].deck.push(uid);
      }
    }
    shuffleInPlace(g, g.players[p].deck);
  }
  g.firstPlayer = opts.firstPlayer ?? (nextRandom(g) < 0.5 ? 0 : 1);
  g.turnPlayer = g.firstPlayer;
  emit(g, { type: 'start', player: g.firstPlayer });
  for (const p of [g.firstPlayer, opp(g.firstPlayer)]) drawCards(g, p, 5);
  g.stack.push({ t: 'enterPhase', phase: 'draw' });
  advance(g);
  return g;
}

function newPlayer(id: PlayerId, opts: CreateGameOptions): PlayerState {
  return {
    id,
    name: opts.names[id],
    lp: opts.startLp ?? 8000,
    deck: [],
    hand: [],
    gy: [],
    banished: [],
    extra: [],
    mzone: [null, null, null, null, null],
    szone: [null, null, null, null, null],
    fzone: null,
    normalSummonUsed: false,
  };
}

export function cloneGame(g: GameState): GameState {
  return structuredClone(g);
}

export type ActionResult = { ok: true } | { ok: false; error: string };

const fail = (error: string): ActionResult => ({ ok: false, error });

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function applyAction(g: GameState, player: PlayerId, action: Action): ActionResult {
  if (g.winner !== null) return fail('game over');
  if (action.type === 'surrender') {
    setWinner(g, opp(player), 'surrender');
    return { ok: true };
  }
  const pend = g.pending;
  if (pend.kind === 'none') return fail('not waiting for input');
  if (pend.player !== player) return fail('not your decision');

  if (pend.kind === 'prompt') {
    if (action.type !== 'answer') return fail('answer expected');
    const err = validateAnswer(g, action.choice);
    if (err) return fail(err);
    g.prompt = null;
    g.pending = { kind: 'none' };
    g.taskAnswer = action.choice;
    advance(g);
    return { ok: true };
  }

  if (action.type === 'pass') {
    if (pend.kind !== 'response') return fail('cannot pass now');
    const top = g.stack[g.stack.length - 1];
    if (top?.t === 'chainWindow') {
      g.stack.pop();
      g.stack.push({ t: 'resolveChain' });
    } else if (top?.t === 'response') {
      g.stack.pop();
    }
    g.pending = { kind: 'none' };
    advance(g);
    return { ok: true };
  }

  const options = getOptions(g, player);
  const opt = findMatchingOption(options, action);
  if (!opt) return fail('illegal action');
  // validate requirement selections
  for (const req of opt.requirements) {
    const picked =
      req.kind === 'tributes'
        ? 'tributes' in action
          ? action.tributes
          : undefined
        : req.kind === 'targets'
          ? 'targets' in action
            ? action.targets
            : undefined
          : 'costs' in action
            ? action.costs
            : undefined;
    const list = picked ?? [];
    if (new Set(list).size !== list.length) return fail('duplicate selection');
    if (!list.every((u) => req.options.includes(u))) return fail('invalid selection');
    if (req.kind === 'targets') {
      if (list.length < req.min || list.length > req.max) return fail('wrong number of targets');
    } else if (list.length !== req.count) return fail('wrong number of cards selected');
  }

  g.pending = { kind: 'none' };
  switch (action.type) {
    case 'normalSummon':
    case 'setMonster':
      doNormalSummon(g, player, action.uid, action.tributes ?? [], action.type === 'setMonster');
      break;
    case 'flipSummon':
      doFlipSummon(g, player, action.uid);
      break;
    case 'changePosition': {
      const c = card(g, action.uid);
      c.position = c.position === 'atk' ? 'def' : 'atk';
      c.positionChangedTurn = g.turn;
      emit(g, { type: 'position', uid: c.uid, player, text: c.position });
      log(g, 'log.position', { card: c.defId }, player);
      break;
    }
    case 'specialProc':
      doSpecialProc(g, player, action.uid, action.effectIdx, action.costs ?? []);
      break;
    case 'setSpellTrap':
      moveCard(g, action.uid, 'szone', { faceUp: false, controller: player, silent: true });
      emit(g, { type: 'set', uid: action.uid, player, hidden: true });
      log(g, 'log.setSpell', {}, player);
      break;
    case 'activate':
      doActivate(g, player, action.uid, action.effectIdx, action.targets ?? [], action.costs ?? []);
      break;
    case 'attack':
      doAttack(g, player, action.uid, action.target);
      break;
    case 'phase':
      doPhase(g, player, action.to);
      break;
    default:
      return fail('unsupported action');
  }
  advance(g);
  return { ok: true };
}

function validateAnswer(g: GameState, choice: unknown): string | null {
  const p = g.prompt;
  if (!p) return 'no prompt';
  switch (p.kind) {
    case 'selectCards': {
      if (!Array.isArray(choice)) return 'card list expected';
      const set = new Set(choice);
      if (set.size !== choice.length) return 'duplicate';
      if (!choice.every((u) => p.options?.includes(u))) return 'invalid card';
      if (choice.length < (p.min ?? 0) || choice.length > (p.max ?? 99)) return 'wrong count';
      return null;
    }
    case 'yesNo':
      return typeof choice === 'boolean' ? null : 'boolean expected';
    case 'position':
      return choice === 'atk' || choice === 'def' ? null : 'position expected';
    case 'option':
      return typeof choice === 'number' && choice >= 0 && choice < (p.labels?.length ?? 0) ? null : 'option expected';
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function doNormalSummon(g: GameState, player: PlayerId, uid: string, tributes: string[], set: boolean): void {
  for (const t of tributes) {
    emit(g, { type: 'tribute', uid: t, player, defId: g.cards[t].defId });
    moveCard(g, t, 'gy', { reason: 'tribute' });
  }
  g.players[player].normalSummonUsed = true;
  if (set) {
    summonMonster(g, uid, player, 'set', 'def', false);
    g.stack.push({ t: 'triggers' });
    return;
  }
  const method = tributes.length ? 'tribute' : 'normal';
  summonMonster(g, uid, player, method, 'atk');
  g.window = { type: 'summoned', player, cards: [uid], method };
  g.stack.push({ t: 'triggers', windowFor: opp(player) });
}

function doFlipSummon(g: GameState, player: PlayerId, uid: string): void {
  const c = card(g, uid);
  c.positionChangedTurn = g.turn;
  flipFaceUp(g, uid, 'atk');
  emit(g, { type: 'summon', uid, player, defId: c.defId, text: 'flip' });
  log(g, 'log.summon', { card: c.defId, method: 'flip' }, player);
  queueSelfTriggers(g, uid, 'summoned');
  queueFieldTriggers(g, opp(player), 'oppSummon', [uid]);
  g.window = { type: 'summoned', player, cards: [uid], method: 'flip' };
  g.stack.push({ t: 'triggers', windowFor: opp(player) });
}

function doSpecialProc(g: GameState, player: PlayerId, uid: string, idx: number, costs: string[]): void {
  const d = getDef(card(g, uid).defId);
  const e = d.effects![idx];
  payCost(g, player, e.cost, uid, costs);
  if (e.oncePerTurn) card(g, uid).opt[idx] = g.turn;
  const pos: Position = e.position === 'def' ? 'def' : 'atk';
  summonMonster(g, uid, player, 'special', pos);
  g.window = { type: 'summoned', player, cards: [uid], method: 'special' };
  g.stack.push({ t: 'triggers', windowFor: opp(player) });
}

function doActivate(g: GameState, player: PlayerId, uid: string, idx: number, targets: string[], costs: string[]): void {
  const c = card(g, uid);
  const d = getDef(c.defId);
  const e = d.effects![idx];
  const eventCards = windowEventCards(g);
  if (e.kind === 'activate') {
    if (c.zone === 'hand') {
      if (d.spellType === 'field') moveCard(g, uid, 'fzone', { faceUp: true, controller: player, silent: true });
      else moveCard(g, uid, 'szone', { faceUp: true, controller: player, silent: true });
    } else {
      c.faceUp = true;
    }
  }
  payCost(g, player, e.cost, uid, costs);
  if (e.oncePerTurn) c.opt[idx] = g.turn;
  const link: ChainLink = {
    id: ++g.chainCounter,
    player,
    source: uid,
    effectIdx: idx,
    targets,
    eventCards,
    negated: false,
    speed: effectSpeed(d, e),
    isCardActivation: e.kind === 'activate',
  };
  g.chain.push(link);
  emit(g, { type: 'activate', uid, player, defId: c.defId, uids: targets, amount: g.chain.length });
  log(g, 'log.activate', { card: c.defId }, player);
  const top = g.stack[g.stack.length - 1];
  if (top?.t === 'response') g.stack.pop();
  if (g.stack[g.stack.length - 1]?.t !== 'chainWindow') g.stack.push({ t: 'chainWindow' });
}

function doAttack(g: GameState, player: PlayerId, uid: string, target: string | null): void {
  const c = card(g, uid);
  c.attacks++;
  c.attackedTurn = g.turn;
  g.battle = { attacker: uid, target, negated: false, attackerPlayer: player };
  emit(g, { type: 'attack', uid, target, player, defId: c.defId });
  log(g, target ? 'log.attack' : 'log.directAttack', { card: c.defId, target: target ? g.cards[target].faceUp ? g.cards[target].defId : '?' : '' }, player);
  g.window = { type: 'attackDeclared', player, attacker: uid, target };
  g.stack.push({ t: 'damageStep' });
  g.stack.push({ t: 'triggers', windowFor: opp(player) });
}

function doPhase(g: GameState, player: PlayerId, to: 'battle' | 'main2' | 'end'): void {
  if (to === 'battle') {
    setPhase(g, 'battle');
    g.window = { type: 'phaseBattle', player };
    g.stack.push({ t: 'response', player: opp(player), window: g.window });
  } else if (to === 'main2') {
    setPhase(g, 'main2');
  } else {
    g.stack.push({ t: 'enterPhase', phase: 'end' });
  }
}

function setPhase(g: GameState, phase: GameState['phase']): void {
  g.phase = phase;
  emit(g, { type: 'phase', phase, player: g.turnPlayer });
}

// ---------------------------------------------------------------------------
// Task loop
// ---------------------------------------------------------------------------

export function advance(g: GameState): void {
  for (let guard = 0; guard < 20000; guard++) {
    if (g.winner !== null) {
      g.pending = { kind: 'none' };
      return;
    }
    if (g.pending.kind !== 'none') return;
    const task = g.stack[g.stack.length - 1];
    if (!task) {
      // Open game state for the turn player.
      if (g.phase === 'battle' && g.endBattle) {
        g.endBattle = false;
        setPhase(g, 'main2');
      }
      g.endBattle = false;
      g.window = { type: 'open', player: g.turnPlayer };
      g.pending = { kind: 'action', player: g.turnPlayer };
      return;
    }
    runTask(g, task);
  }
  throw new Error('Engine loop did not settle');
}

function runTask(g: GameState, task: Task): void {
  switch (task.t) {
    case 'chainWindow': {
      if (g.chain.length === 0) {
        g.stack.pop();
        return;
      }
      const top = g.chain[g.chain.length - 1];
      const p = opp(top.player);
      if (canRespond(g, p)) {
        g.pending = { kind: 'response', player: p, window: { type: 'chain', player: top.player, cards: [top.source] } };
        return;
      }
      g.stack.pop();
      g.stack.push({ t: 'resolveChain' });
      return;
    }
    case 'resolveChain':
      resolveChainStep(g);
      return;
    case 'triggers':
      processTriggers(g, task);
      return;
    case 'response': {
      if (canRespond(g, task.player)) {
        g.window = task.window;
        g.pending = { kind: 'response', player: task.player, window: task.window };
        return;
      }
      g.stack.pop();
      return;
    }
    case 'damageStep':
      g.stack.pop();
      damageStep(g);
      g.stack.push({ t: 'triggers' });
      return;
    case 'startTurn': {
      g.stack.pop();
      g.turn++;
      g.turnPlayer = opp(g.turnPlayer);
      g.players[g.turnPlayer].normalSummonUsed = false;
      for (const c of Object.values(g.cards)) c.attacks = 0;
      emit(g, { type: 'turn', player: g.turnPlayer, amount: g.turn });
      log(g, 'log.turn', { turn: g.turn }, g.turnPlayer);
      g.stack.push({ t: 'enterPhase', phase: 'draw' });
      return;
    }
    case 'enterPhase':
      g.stack.pop();
      enterPhase(g, task.phase);
      return;
    case 'endPhaseCleanup': {
      g.stack.pop();
      for (const c of Object.values(g.cards)) {
        if (c.modifiers.length) c.modifiers = c.modifiers.filter((m) => m.untilTurn === undefined || m.untilTurn > g.turn);
      }
      g.stack.push({ t: 'startTurn' });
      g.stack.push({ t: 'handLimit' });
      return;
    }
    case 'handLimit': {
      const p = g.turnPlayer;
      const hand = g.players[p].hand;
      const excess = hand.length - g.rules.handSize;
      if (excess <= 0) {
        g.stack.pop();
        return;
      }
      const ans = takeAnswer(g);
      if (Array.isArray(ans)) {
        for (const u of ans) {
          emit(g, { type: 'discard', uid: u, player: p, defId: g.cards[u].defId });
          moveCard(g, u, 'gy', { reason: 'discard' });
        }
        g.stack.pop();
        return;
      }
      ask(g, {
        player: p,
        kind: 'selectCards',
        title: T(`Hand limit: discard ${excess} card(s)`, `Handlimit: wirf ${excess} Karte(n) ab`),
        options: [...hand],
        min: excess,
        max: excess,
      });
      return;
    }
  }
}

function enterPhase(g: GameState, phase: GameState['phase']): void {
  setPhase(g, phase);
  const p = g.turnPlayer;
  switch (phase) {
    case 'draw':
      if (!(g.turn === 1)) drawCards(g, p, 1);
      g.stack.push({ t: 'enterPhase', phase: 'standby' });
      return;
    case 'standby':
      queueFieldTriggers(g, p, 'ownStandby');
      g.stack.push({ t: 'enterPhase', phase: 'main1' });
      g.stack.push({ t: 'triggers' });
      return;
    case 'main1':
      return;
    case 'end':
      queueFieldTriggers(g, p, 'ownEndPhase');
      g.window = { type: 'phaseEnd', player: p };
      g.stack.push({ t: 'endPhaseCleanup' });
      g.stack.push({ t: 'response', player: opp(p), window: g.window });
      g.stack.push({ t: 'triggers' });
      return;
    default:
      return;
  }
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

function processTriggers(g: GameState, task: Extract<Task, { t: 'triggers' }>): void {
  while (g.pendingTriggers.length) {
    let idx = g.pendingTriggers.findIndex((t) => t.player === g.turnPlayer);
    if (idx < 0) idx = 0;
    const tr = g.pendingTriggers[idx];
    const c = g.cards[tr.uid];
    const d = c ? getDef(c.defId) : undefined;
    const e = d?.effects?.[tr.effectIdx];
    const drop = () => {
      g.pendingTriggers.splice(idx, 1);
      task.stage = undefined;
    };
    if (!c || !e || c.zone === 'void') {
      drop();
      continue;
    }
    if (e.oncePerTurn && c.opt[tr.effectIdx] === g.turn) {
      drop();
      continue;
    }
    // Field-watching triggers need the card to still be face-up on the field.
    if ((e.event === 'ownStandby' || e.event === 'ownEndPhase' || e.event === 'oppSummon') && !(isOnField(c) && c.faceUp)) {
      drop();
      continue;
    }
    const ctx: EffectContext = { ...makeCtx(g, tr.player, tr.uid, tr.effectIdx), eventCards: tr.eventCards };
    if (e.condition && !e.condition(g, ctx)) {
      drop();
      continue;
    }
    if (e.cost?.lp && g.players[tr.player].lp <= e.cost.lp) {
      drop();
      continue;
    }
    const cands = e.target ? targetCandidates(g, ctx, e.target) : [];
    if (e.target && cands.length < e.target.min) {
      drop();
      continue;
    }
    let targets: string[] = [];
    if (e.optional && task.stage === undefined) {
      task.stage = 'confirm';
      ask(g, {
        player: tr.player,
        kind: 'yesNo',
        title: T(`Activate the effect of this card?`, `Den Effekt dieser Karte aktivieren?`),
        source: tr.uid,
      });
      return;
    }
    if (task.stage === 'confirm') {
      const yes = takeAnswer(g);
      task.stage = undefined;
      if (!yes) {
        drop();
        continue;
      }
      if (e.target) {
        task.stage = 'target';
        askTargets(g, tr.player, tr.uid, cands, e.target.min, e.target.max);
        return;
      }
    } else if (task.stage === 'target') {
      targets = (takeAnswer(g) as string[]) ?? [];
      task.stage = undefined;
    } else if (e.target) {
      task.stage = 'target';
      askTargets(g, tr.player, tr.uid, cands, e.target.min, e.target.max);
      return;
    }
    // Optional trigger confirmed without targets falls through with stage undefined.
    if (e.cost?.lp) changeLp(g, tr.player, -e.cost.lp, 'cost');
    if (e.oncePerTurn) c.opt[tr.effectIdx] = g.turn;
    const link: ChainLink = {
      id: ++g.chainCounter,
      player: tr.player,
      source: tr.uid,
      effectIdx: tr.effectIdx,
      targets,
      eventCards: tr.eventCards,
      negated: false,
      speed: e.speed ?? 1,
      isCardActivation: false,
    };
    g.chain.push(link);
    g.pendingTriggers.splice(idx, 1);
    task.stage = undefined;
    emit(g, { type: 'activate', uid: tr.uid, player: tr.player, defId: c.defId, uids: targets, amount: g.chain.length, text: 'trigger' });
    log(g, 'log.trigger', { card: c.defId }, tr.player);
  }
  g.stack.pop();
  if (g.chain.length) {
    g.window = g.window ?? { type: 'trigger' };
    g.stack.push({ t: 'chainWindow' });
  } else if (task.windowFor !== undefined && g.window) {
    g.stack.push({ t: 'response', player: task.windowFor, window: g.window });
  }
}

function askTargets(g: GameState, player: PlayerId, source: string, options: string[], min: number, max: number): void {
  ask(g, {
    player,
    kind: 'selectCards',
    title: T('Select target(s)', 'Wähle Ziel(e)'),
    options,
    min: Math.min(min, options.length),
    max: Math.min(max, options.length),
    source,
  });
}

// ---------------------------------------------------------------------------
// Chain resolution
// ---------------------------------------------------------------------------

function linkTargetsStillValid(g: GameState, link: ChainLink): string[] {
  const d = getDef(g.cards[link.source].defId);
  const e = d.effects?.[link.effectIdx];
  if (!e?.target) return link.targets;
  const ctx = makeCtx(g, link.player, link.source, link.effectIdx);
  const valid = new Set(targetCandidates(g, ctx, e.target));
  return link.targets.filter((u) => valid.has(u));
}

function resolveChainStep(g: GameState): void {
  if (!g.resolving) {
    if (g.chain.length === 0) {
      g.stack.pop();
      g.stack.push({ t: 'triggers' });
      return;
    }
    const link = g.chain[g.chain.length - 1];
    const src = g.cards[link.source];
    const d = getDef(src.defId);
    let skip = link.negated;
    if (link.isCardActivation && isPersistent(d) && !isOnField(src)) skip = true;
    g.resolving = {
      linkId: link.id,
      opIndex: skip ? Number.MAX_SAFE_INTEGER : 0,
      chosen: [],
      validTargets: skip ? [] : linkTargetsStillValid(g, link),
      step: 0,
      scratch: {},
    };
    emit(g, { type: 'resolve', uid: link.source, player: link.player, defId: src.defId, amount: g.chain.length, text: skip ? 'negated' : undefined });
  }
  const r = g.resolving;
  const link = g.chain.find((l) => l.id === r.linkId)!;
  const d = getDef(g.cards[link.source].defId);
  const ops = d.effects?.[link.effectIdx]?.ops ?? [];
  const ctx: EffectContext = {
    player: link.player,
    source: link.source,
    effectIdx: link.effectIdx,
    targets: r.validTargets,
    eventCards: link.eventCards,
    chosen: r.chosen,
    link,
  };
  while (r.opIndex < ops.length) {
    if (g.winner !== null) return;
    const op = ops[r.opIndex];
    if (r.step === 0 && op.when && !op.when(g, ctx)) {
      r.opIndex++;
      continue;
    }
    const res = execOp(g, ctx, op, r);
    if (res === 'pause') return;
    r.opIndex++;
    r.step = 0;
    r.scratch = {};
  }
  finishLink(g, link);
  g.resolving = null;
  cleanupEquips(g);
  checkLp(g);
}

function finishLink(g: GameState, link: ChainLink): void {
  const c = g.cards[link.source];
  const d = getDef(c.defId);
  if (link.isCardActivation && d.kind !== 'monster' && isOnField(c) && c.faceUp) {
    const stays = isPersistent(d) && !link.negated && (d.spellType !== 'equip' || !!c.equippedTo);
    if (!stays) moveCard(g, link.source, 'gy', { reason: 'resolve' });
  }
  const i = g.chain.findIndex((l) => l.id === link.id);
  if (i >= 0) g.chain.splice(i, 1);
}

// ---------------------------------------------------------------------------
// Battle
// ---------------------------------------------------------------------------

function damageStep(g: GameState): void {
  const b = g.battle;
  g.window = null;
  if (!b) return;
  const finish = () => {
    g.battle = null;
  };
  if (b.negated) return finish();
  const a = g.cards[b.attacker];
  if (!a || a.zone !== 'mzone' || !a.faceUp || a.position !== 'atk' || a.controller !== b.attackerPlayer) return finish();
  const defender = opp(b.attackerPlayer);
  if (b.target) {
    const t = g.cards[b.target];
    if (!t || t.zone !== 'mzone' || t.controller !== defender) {
      // Replay: the attack is cancelled and may be declared again.
      a.attacks = Math.max(0, a.attacks - 1);
      emit(g, { type: 'attackCancelled', uid: a.uid, player: b.attackerPlayer });
      return finish();
    }
  } else if (fieldMonsters(g, defender).length > 0 && !hasAbility(g, a.uid, 'directAttack')) {
    a.attacks = Math.max(0, a.attacks - 1);
    emit(g, { type: 'attackCancelled', uid: a.uid, player: b.attackerPlayer });
    return finish();
  }

  const atkA = getAtk(g, a.uid);
  if (!b.target) {
    emit(g, { type: 'battle', uid: a.uid, target: null, player: b.attackerPlayer, amount: atkA });
    if (atkA > 0) {
      changeLp(g, defender, -atkA, 'battle');
      queueSelfTriggers(g, a.uid, 'inflictsBattleDamage');
    }
    return finish();
  }
  const t = g.cards[b.target];
  if (!t.faceUp) flipFaceUp(g, t.uid);
  emit(g, { type: 'battle', uid: a.uid, target: t.uid, player: b.attackerPlayer, amount: atkA });
  if (t.position === 'atk') {
    const atkT = getAtk(g, t.uid);
    if (atkA > atkT) {
      const destroyed = destroyCards(g, [t.uid], 'battle');
      changeLp(g, defender, -(atkA - atkT), 'battle');
      queueSelfTriggers(g, a.uid, 'inflictsBattleDamage');
      if (destroyed.length) queueSelfTriggers(g, a.uid, 'destroysByBattle', destroyed);
    } else if (atkA < atkT) {
      const destroyed = destroyCards(g, [a.uid], 'battle');
      changeLp(g, b.attackerPlayer, -(atkT - atkA), 'battle');
      queueSelfTriggers(g, t.uid, 'inflictsBattleDamage');
      if (destroyed.length) queueSelfTriggers(g, t.uid, 'destroysByBattle', destroyed);
    } else if (atkA > 0) {
      const destroyed = destroyCards(g, [a.uid, t.uid], 'battle');
      if (destroyed.includes(t.uid)) queueSelfTriggers(g, a.uid, 'destroysByBattle', [t.uid]);
      if (destroyed.includes(a.uid)) queueSelfTriggers(g, t.uid, 'destroysByBattle', [a.uid]);
    }
  } else {
    const defT = getDefense(g, t.uid);
    if (atkA > defT) {
      const destroyed = destroyCards(g, [t.uid], 'battle');
      if (hasAbility(g, a.uid, 'piercing')) {
        changeLp(g, defender, -(atkA - defT), 'battle');
        queueSelfTriggers(g, a.uid, 'inflictsBattleDamage');
      }
      if (destroyed.length) queueSelfTriggers(g, a.uid, 'destroysByBattle', destroyed);
    } else if (atkA < defT) {
      changeLp(g, b.attackerPlayer, -(defT - atkA), 'battle');
    }
  }
  finish();
}

// ---------------------------------------------------------------------------
// Helpers for UIs and bots
// ---------------------------------------------------------------------------

export function isMyDecision(g: GameState, player: PlayerId): boolean {
  return g.pending.kind !== 'none' && g.pending.player === player;
}

export { getOptions, checkActivation, checkSpecialProc, freeMonsterZones };

export type { WindowCtx };
