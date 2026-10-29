// Effect operation executors. Every executor is re-entrant: when it needs a
// player decision it raises a prompt, stores its progress in `r.step` /
// `r.scratch` and returns 'pause'. When the answer arrives the same op is
// executed again and picks up the answer via takeAnswer().
import { getDef, isExtraDeckCard } from './db';
import type { CardFilter, EffectContext, FusionMaterial, GameState, Op, PlayerId, Position, ResolvingState, Selector } from './types';
import {
  ask,
  card,
  changeLp,
  createToken,
  destroyCards,
  drawCards,
  emit,
  flipFaceUp,
  freeMonsterZones,
  isOnField,
  log,
  moveCard,
  opp,
  shuffleDeck,
  summonMonster,
  T,
  takeAnswer,
  zoneList,
} from './core';
import { matchFilter, runQuery } from './filters';
import { randomInt } from './rng';

export type OpResult = 'done' | 'pause';

function players(ctx: EffectContext, who: 'self' | 'opp' | 'both'): PlayerId[] {
  if (who === 'self') return [ctx.player];
  if (who === 'opp') return [opp(ctx.player)];
  return [ctx.player, opp(ctx.player)];
}

export function resolveSelector(g: GameState, ctx: EffectContext, sel: Selector): string[] {
  if (typeof sel === 'object') return runQuery(g, sel.query, ctx);
  switch (sel) {
    case 'targets':
      return ctx.targets;
    case 'self':
      return [ctx.source];
    case 'equipTarget': {
      const e = g.cards[ctx.source]?.equippedTo;
      return e ? [e] : [];
    }
    case 'attacker':
      return g.battle ? [g.battle.attacker] : ctx.eventCards.slice(0, 1);
    case 'battleTarget':
      return g.battle?.target ? [g.battle.target] : [];
    case 'eventCards':
      return ctx.eventCards;
    case 'chosen':
      return ctx.chosen;
  }
}

const num = (g: GameState, ctx: EffectContext, n: number | ((g: GameState, ctx: EffectContext) => number)) =>
  typeof n === 'function' ? n(g, ctx) : n;

function onFieldMonsters(g: GameState, uids: string[]): string[] {
  return uids.filter((u) => g.cards[u]?.zone === 'mzone');
}

export function canFuse(g: GameState, materials: FusionMaterial[], uids: string[]): boolean {
  if (uids.length !== materials.length) return false;
  const used = new Array(uids.length).fill(false);
  const fits = (m: FusionMaterial, uid: string) => {
    const d = getDef(g.cards[uid].defId);
    if (d.kind !== 'monster' || d.token) return false;
    if (m.name && d.id !== m.name) return false;
    if (m.filter && !matchFilter(g, uid, m.filter)) return false;
    return true;
  };
  const go = (i: number): boolean => {
    if (i === materials.length) return true;
    for (let j = 0; j < uids.length; j++) {
      if (used[j] || !fits(materials[i], uids[j])) continue;
      used[j] = true;
      if (go(i + 1)) return true;
      used[j] = false;
    }
    return false;
  };
  return go(0);
}

/** Can any subset of `pool` satisfy the fusion's materials? */
export function fusionPossible(g: GameState, materials: FusionMaterial[], pool: string[]): boolean {
  const n = materials.length;
  const idx: number[] = [];
  const rec = (start: number): boolean => {
    if (idx.length === n) return canFuse(g, materials, idx.map((i) => pool[i]));
    for (let i = start; i < pool.length; i++) {
      idx.push(i);
      if (rec(i + 1)) return true;
      idx.pop();
    }
    return false;
  };
  return rec(0);
}

export function fusionPool(g: GameState, player: PlayerId, from: ('hand' | 'mzone' | 'gy')[]): string[] {
  const out: string[] = [];
  for (const z of from) {
    for (const uid of zoneList(g, player, z)) {
      const d = getDef(g.cards[uid].defId);
      if (d.kind === 'monster' && !d.token) out.push(uid);
    }
  }
  return out;
}

export function fusionCandidates(g: GameState, player: PlayerId, from: ('hand' | 'mzone' | 'gy')[], filter?: CardFilter): string[] {
  const pool = fusionPool(g, player, from);
  return g.players[player].extra.filter((uid) => {
    const d = getDef(g.cards[uid].defId);
    if (!d.materials) return false;
    if (filter && !matchFilter(g, uid, filter)) return false;
    // a monster zone must be available after materials leave the field
    return fusionPossible(g, d.materials, pool);
  });
}

export function execOp(g: GameState, ctx: EffectContext, op: Op, r: ResolvingState): OpResult {
  switch (op.op) {
    case 'draw':
      for (const p of players(ctx, op.who)) drawCards(g, p, num(g, ctx, op.n));
      return 'done';
    case 'damage':
      for (const p of players(ctx, op.who)) changeLp(g, p, -num(g, ctx, op.n), 'damage');
      return 'done';
    case 'gainLp':
      for (const p of players(ctx, op.who)) changeLp(g, p, num(g, ctx, op.n), 'gain');
      return 'done';
    case 'destroy':
      destroyCards(g, resolveSelector(g, ctx, op.sel), 'effect');
      return 'done';
    case 'banish':
      for (const u of resolveSelector(g, ctx, op.sel)) {
        const c = g.cards[u];
        if (!c || c.zone === 'banished' || c.zone === 'void') continue;
        emit(g, { type: 'banish', uid: u, player: c.controller, defId: c.defId });
        moveCard(g, u, 'banished', { reason: 'effect' });
      }
      return 'done';
    case 'bounce':
      for (const u of resolveSelector(g, ctx, op.sel)) {
        const c = g.cards[u];
        if (!c || !isOnField(c)) continue;
        emit(g, { type: 'bounce', uid: u, player: c.controller, defId: c.defId });
        moveCard(g, u, 'hand', { reason: 'effect' });
      }
      return 'done';
    case 'addToHand':
      for (const u of resolveSelector(g, ctx, op.sel)) {
        const c = g.cards[u];
        if (!c || (c.zone !== 'gy' && c.zone !== 'banished' && c.zone !== 'deck')) continue;
        moveCard(g, u, 'hand', { reason: 'effect' });
        emit(g, { type: 'reveal', uid: u, player: c.owner, defId: c.defId });
        log(g, 'log.search', { card: c.defId }, c.owner);
      }
      return 'done';
    case 'toGY':
      for (const u of resolveSelector(g, ctx, op.sel)) {
        const c = g.cards[u];
        if (!c || c.zone === 'gy' || c.zone === 'void') continue;
        moveCard(g, u, 'gy', { reason: 'effect' });
      }
      return 'done';
    case 'search': {
      const p = ctx.player;
      if (r.step === 0) {
        const cands = zoneList(g, p, op.from).filter((u) => matchFilter(g, u, op.filter, ctx));
        if (cands.length === 0) {
          if (op.from === 'deck') shuffleDeck(g, p);
          return 'done';
        }
        const max = Math.min(op.n, cands.length);
        r.step = 1;
        ask(g, {
          player: p,
          kind: 'selectCards',
          title: op.from === 'deck' ? T('Add a card from your Deck to your hand', 'Füge eine Karte aus deinem Deck deiner Hand hinzu') : T('Add a card from your Graveyard to your hand', 'Füge eine Karte aus deinem Friedhof deiner Hand hinzu'),
          options: cands,
          min: op.optional ? 0 : max,
          max,
          source: ctx.source,
          reveal: true,
        });
        return 'pause';
      }
      const ans = (takeAnswer(g) as string[]) ?? [];
      for (const u of ans) {
        moveCard(g, u, 'hand', { reason: 'effect' });
        emit(g, { type: 'reveal', uid: u, player: p, defId: g.cards[u].defId });
        log(g, 'log.search', { card: g.cards[u].defId }, p);
      }
      r.chosen = [...ans];
      ctx.chosen = r.chosen;
      if (op.from === 'deck') shuffleDeck(g, p);
      return 'done';
    }
    case 'specialSummon': {
      const p = ctx.player;
      const free = freeMonsterZones(g, p);
      if (free === 0) return 'done';
      const direct = op.from === 'targets' || op.from === 'self' || op.from === 'eventCards';
      if (r.step === 0) {
        let cands: string[];
        if (direct) {
          const base = op.from === 'targets' ? ctx.targets : op.from === 'self' ? [ctx.source] : ctx.eventCards;
          cands = base.filter((u) => {
            const c = g.cards[u];
            return c && c.zone !== 'mzone' && c.zone !== 'void' && c.zone !== 'szone' && c.zone !== 'fzone' && (!op.filter || matchFilter(g, u, op.filter, ctx));
          });
          cands = cands.slice(0, free);
          if (cands.length === 0) return 'done';
          r.scratch.list = cands;
        } else {
          const zones = op.anyGY && op.from === 'gy' ? [...zoneList(g, p, 'gy'), ...zoneList(g, opp(p), 'gy')] : zoneList(g, p, op.from as 'hand');
          cands = zones.filter((u) => {
            const d = getDef(g.cards[u].defId);
            if (d.kind !== 'monster' || d.token) return false;
            if (isExtraDeckCard(d) && op.from === 'deck') return false;
            if ((d.frame === 'ritual' || isExtraDeckCard(d)) && op.from === 'hand') return false;
            return !op.filter || matchFilter(g, u, op.filter, ctx);
          });
          if (cands.length === 0) {
            if (op.from === 'deck') shuffleDeck(g, p);
            return 'done';
          }
          const max = Math.min(op.n ?? 1, free, cands.length);
          r.step = 1;
          ask(g, {
            player: p,
            kind: 'selectCards',
            title: T('Select monster(s) to Special Summon', 'Wähle Monster für die Spezialbeschwörung'),
            options: cands,
            min: op.optional ? 0 : 1,
            max,
            source: ctx.source,
            reveal: true,
          });
          return 'pause';
        }
      }
      if (r.step === 1) {
        const ans = (takeAnswer(g) as string[]) ?? [];
        r.scratch.list = ans;
        if (ans.length === 0) {
          if (op.from === 'deck') shuffleDeck(g, p);
          return 'done';
        }
      }
      const list = (r.scratch.list as string[]) ?? [];
      let position: Position = op.position === 'def' ? 'def' : 'atk';
      if (op.position === 'choose') {
        if (r.step !== 2) {
          r.step = 2;
          ask(g, {
            player: p,
            kind: 'position',
            title: T('Choose the battle position', 'Wähle die Kampfposition'),
            uid: list[0],
            source: ctx.source,
          });
          return 'pause';
        }
        position = (takeAnswer(g) as Position) === 'def' ? 'def' : 'atk';
      }
      const summoned: string[] = [];
      for (const u of list) {
        if (freeMonsterZones(g, p) === 0) break;
        summonMonster(g, u, p, 'special', position);
        summoned.push(u);
      }
      if (op.from === 'deck') shuffleDeck(g, p);
      r.chosen = summoned;
      ctx.chosen = summoned;
      if (summoned.length) g.window = { type: 'summoned', player: p, cards: summoned, method: 'special' };
      return 'done';
    }
    case 'token': {
      const p = ctx.player;
      const n = Math.min(op.n, freeMonsterZones(g, p));
      const made: string[] = [];
      for (let i = 0; i < n; i++) {
        const uid = createToken(g, op.tokenId, p);
        summonMonster(g, uid, p, 'special', op.position ?? 'def');
        made.push(uid);
      }
      r.chosen = made;
      ctx.chosen = made;
      return 'done';
    }
    case 'modify':
      for (const u of onFieldMonsters(g, resolveSelector(g, ctx, op.sel))) {
        const c = card(g, u);
        if (!c.faceUp) continue;
        c.modifiers.push({ atk: op.atk, def: op.def, untilTurn: op.untilEndOfTurn ? g.turn : undefined, source: ctx.source });
        emit(g, { type: 'modify', uid: u, player: c.controller, amount: op.atk ?? op.def ?? 0 });
      }
      return 'done';
    case 'grant':
      for (const u of onFieldMonsters(g, resolveSelector(g, ctx, op.sel))) {
        const c = card(g, u);
        c.modifiers.push({ ability: op.ability, untilTurn: op.untilEndOfTurn ? g.turn : undefined, source: ctx.source });
        emit(g, { type: 'grant', uid: u, player: c.controller, text: op.ability });
      }
      return 'done';
    case 'negateAttack':
      if (g.battle) {
        g.battle.negated = true;
        emit(g, { type: 'negateAttack', uid: g.battle.attacker, player: g.battle.attackerPlayer });
        log(g, 'log.negateAttack', {}, ctx.player);
      }
      if (op.endBattle) g.endBattle = true;
      return 'done';
    case 'negateActivation': {
      const link = ctx.link;
      if (!link) return 'done';
      const i = g.chain.findIndex((l) => l.id === link.id);
      const below = i > 0 ? g.chain[i - 1] : undefined;
      if (!below) return 'done';
      below.negated = true;
      const src = g.cards[below.source];
      emit(g, { type: 'negate', uid: below.source, player: below.player, defId: src.defId });
      log(g, 'log.negate', { card: src.defId }, ctx.player);
      if (op.destroy && isOnField(src)) destroyCards(g, [below.source], 'effect');
      return 'done';
    }
    case 'changePosition':
      for (const u of onFieldMonsters(g, resolveSelector(g, ctx, op.sel))) {
        const c = card(g, u);
        const to: Position = op.to ?? (c.position === 'atk' ? 'def' : 'atk');
        if (c.position === to && c.faceUp) continue;
        if (!c.faceUp && to === 'atk') flipFaceUp(g, u, 'atk');
        else c.position = to;
        emit(g, { type: 'position', uid: u, player: c.controller, text: to });
      }
      return 'done';
    case 'discard': {
      if (r.step === 0) {
        r.scratch.queue = players(ctx, op.who).map(String);
        r.step = 1;
      }
      // process players one by one
      const queue = r.scratch.queue as string[];
      while (queue.length) {
        const p = Number(queue[0]) as PlayerId;
        const hand = g.players[p].hand;
        if (hand.length === 0) {
          queue.shift();
          continue;
        }
        if (op.random || hand.length <= op.n) {
          const picks: string[] = [];
          const pool = [...hand];
          for (let i = 0; i < op.n && pool.length; i++) picks.push(pool.splice(randomInt(g, pool.length), 1)[0]);
          for (const u of picks) {
            emit(g, { type: 'discard', uid: u, player: p, defId: g.cards[u].defId });
            moveCard(g, u, 'gy', { reason: 'discard' });
          }
          queue.shift();
          continue;
        }
        if (r.step === 1) {
          r.step = 2;
          ask(g, {
            player: p,
            kind: 'selectCards',
            title: T(`Discard ${op.n} card(s)`, `Wirf ${op.n} Karte(n) ab`),
            options: [...hand],
            min: op.n,
            max: op.n,
            source: ctx.source,
          });
          return 'pause';
        }
        const ans = (takeAnswer(g) as string[]) ?? [];
        for (const u of ans) {
          emit(g, { type: 'discard', uid: u, player: p, defId: g.cards[u].defId });
          moveCard(g, u, 'gy', { reason: 'discard' });
        }
        r.step = 1;
        queue.shift();
      }
      return 'done';
    }
    case 'mill':
      for (const p of players(ctx, op.who)) {
        for (let i = 0; i < op.n; i++) {
          const top = g.players[p].deck[g.players[p].deck.length - 1];
          if (!top) break;
          moveCard(g, top, 'gy', { reason: 'effect' });
        }
      }
      return 'done';
    case 'fusionSummon': {
      const p = ctx.player;
      if (r.step === 0) {
        const cands = fusionCandidates(g, p, op.from, op.filter);
        if (cands.length === 0) return 'done';
        r.step = 1;
        ask(g, {
          player: p,
          kind: 'selectCards',
          title: T('Choose a Fusion Monster to summon', 'Wähle ein Fusionsmonster'),
          options: cands,
          min: 1,
          max: 1,
          source: ctx.source,
          reveal: true,
        });
        return 'pause';
      }
      if (r.step === 1) {
        const ans = (takeAnswer(g) as string[]) ?? [];
        const fusion = ans[0];
        r.scratch.fusion = fusion;
        const mats = getDef(g.cards[fusion].defId).materials ?? [];
        const pool = fusionPool(g, p, op.from).filter((u) => mats.some((m) => canFuse(g, [m], [u])));
        r.step = 2;
        ask(g, {
          player: p,
          kind: 'selectCards',
          title: T('Select the Fusion Materials', 'Wähle die Fusionsmaterialien'),
          options: pool,
          min: mats.length,
          max: mats.length,
          source: fusion,
          reveal: true,
        });
        return 'pause';
      }
      const fusion = r.scratch.fusion as string;
      const mats = getDef(g.cards[fusion].defId).materials ?? [];
      const ans = (takeAnswer(g) as string[]) ?? [];
      if (!canFuse(g, mats, ans)) {
        // invalid combination – ask again
        r.step = 1;
        g.taskAnswer = [fusion];
        return execOp(g, ctx, op, r);
      }
      for (const u of ans) {
        const z = g.cards[u].zone;
        emit(g, { type: 'material', uid: u, player: p, defId: g.cards[u].defId });
        if (z === 'gy') moveCard(g, u, 'banished', { reason: 'material' });
        else moveCard(g, u, 'gy', { reason: 'material' });
      }
      if (freeMonsterZones(g, p) > 0) {
        summonMonster(g, fusion, p, 'fusion', 'atk');
        g.window = { type: 'summoned', player: p, cards: [fusion], method: 'fusion' };
        r.chosen = [fusion];
        ctx.chosen = r.chosen;
      }
      return 'done';
    }
    case 'equip': {
      const src = g.cards[ctx.source];
      const target = ctx.targets[0];
      const t = target ? g.cards[target] : undefined;
      if (src && isOnField(src) && t && t.zone === 'mzone' && t.faceUp) {
        src.equippedTo = target;
        emit(g, { type: 'equip', uid: ctx.source, target, player: ctx.player, defId: src.defId });
      }
      return 'done';
    }
    case 'takeControl': {
      for (const u of onFieldMonsters(g, resolveSelector(g, ctx, op.sel))) {
        const c = card(g, u);
        if (c.controller === ctx.player || freeMonsterZones(g, ctx.player) === 0) continue;
        moveCard(g, u, 'mzone', { controller: ctx.player, position: c.position, faceUp: c.faceUp, silent: true });
        c.controlReturnTurn = op.untilEndOfTurn ? g.turn : undefined;
        emit(g, { type: 'control', uid: u, player: ctx.player, defId: c.defId });
        log(g, 'log.control', { card: c.defId }, ctx.player);
      }
      return 'done';
    }
    case 'toDeck': {
      const owners = new Set<PlayerId>();
      for (const u of resolveSelector(g, ctx, op.sel)) {
        const c = g.cards[u];
        if (!c || c.zone === 'deck' || c.zone === 'void') continue;
        emit(g, { type: 'bounce', uid: u, player: c.controller, defId: c.defId });
        moveCard(g, u, 'deck', { reason: 'effect' });
        if (!op.top) owners.add(c.owner);
      }
      for (const p of owners) shuffleDeck(g, p);
      return 'done';
    }
    case 'ritualSummon': {
      const p = ctx.player;
      const lvl = (u: string) => getDef(g.cards[u].defId).level ?? 0;
      const pool = (exclude: string) => [...zoneList(g, p, 'hand'), ...zoneList(g, p, 'mzone')].filter((u) => u !== exclude && getDef(g.cards[u].defId).kind === 'monster');
      if (r.step === 0) {
        const cands = zoneList(g, p, 'hand').filter((u) => {
          const d = getDef(g.cards[u].defId);
          if (d.frame !== 'ritual' || (op.filter && !matchFilter(g, u, op.filter, ctx))) return false;
          return pool(u).reduce((s, x) => s + lvl(x), 0) >= (d.level ?? 0);
        });
        if (cands.length === 0) return 'done';
        r.step = 1;
        ask(g, { player: p, kind: 'selectCards', title: T('Choose a Ritual Monster', 'Wähle ein Ritualmonster'), options: cands, min: 1, max: 1, source: ctx.source, reveal: true });
        return 'pause';
      }
      if (r.step === 1) {
        const ritual = ((takeAnswer(g) as string[]) ?? [])[0];
        r.scratch.ritual = ritual;
        r.step = 2;
        const options = pool(ritual);
        ask(g, {
          player: p,
          kind: 'selectCards',
          title: T(`Tribute monsters with total Level ${lvl(ritual)} or more`, `Biete Monster mit insgesamt Stufe ${lvl(ritual)} oder mehr als Tribut an`),
          options,
          min: 1,
          max: options.length,
          source: ritual,
        });
        return 'pause';
      }
      const ritual = r.scratch.ritual as string;
      const picked = (takeAnswer(g) as string[]) ?? [];
      if (picked.reduce((s, x) => s + lvl(x), 0) < lvl(ritual)) {
        r.step = 1;
        g.taskAnswer = [ritual];
        return execOp(g, ctx, op, r);
      }
      for (const u of picked) {
        emit(g, { type: 'tribute', uid: u, player: p, defId: g.cards[u].defId });
        moveCard(g, u, 'gy', { reason: 'material' });
      }
      if (freeMonsterZones(g, p) > 0) {
        summonMonster(g, ritual, p, 'special', 'atk');
        g.window = { type: 'summoned', player: p, cards: [ritual], method: 'special' };
        r.chosen = [ritual];
        ctx.chosen = r.chosen;
      }
      return 'done';
    }
    case 'custom':
      op.run(g, ctx);
      return 'done';
  }
}
