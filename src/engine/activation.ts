// Activation legality: timing, spell speed, location, costs and targets.
import { getDef } from './db';
import type { CardDef, Cost, EffectContext, EffectDef, GameState, PlayerId, TargetSpec, WindowType } from './types';
import { freeMonsterZones, freeSpellZones, isOnField, moveCard, changeLp, emit, fieldMonsters } from './core';
import { matchFilter, runQuery } from './filters';
import { hasAbility } from './stats';

export type ActivationMode = 'open' | 'response';

export interface CostRequirement {
  what: 'discard' | 'tribute' | 'banish';
  count: number;
  options: string[];
}

export interface ActivationInfo {
  speed: number;
  targetSpec?: TargetSpec;
  targets: string[];
  cost?: CostRequirement;
}

export function effectSpeed(d: CardDef, e: EffectDef): number {
  if (e.speed) return e.speed;
  if (e.kind === 'activate') {
    if (d.kind === 'spell') return d.spellType === 'quickplay' ? 2 : 1;
    if (d.kind === 'trap') return d.trapType === 'counter' ? 3 : 2;
  }
  if (e.kind === 'quick') return 2;
  return 1;
}

export function isPersistent(d: CardDef): boolean {
  return !!d.remainsOnField || d.spellType === 'continuous' || d.spellType === 'field' || d.spellType === 'equip' || d.trapType === 'continuous';
}

export function windowMatches(g: GameState, windows: WindowType[]): boolean {
  return windows.some((w) => (w === 'chain' ? g.chain.length > 0 : g.window?.type === w));
}

export function windowEventCards(g: GameState): string[] {
  const w = g.window;
  if (!w) return [];
  if (w.type === 'attackDeclared' && w.attacker) return [w.attacker];
  if (w.cards) return [...w.cards];
  return [];
}

export function makeCtx(g: GameState, player: PlayerId, source: string, effectIdx: number, targets: string[] = []): EffectContext {
  return { player, source, effectIdx, targets, eventCards: windowEventCards(g), chosen: [] };
}

export function targetCandidates(g: GameState, ctx: EffectContext, spec: TargetSpec): string[] {
  return runQuery(g, { zones: spec.zones, controller: spec.controller, filter: spec.filter }, ctx).filter((uid) => {
    const c = g.cards[uid];
    // A Spell/Trap (or a card in the GY) never targets itself; monsters on the field may.
    if (uid === ctx.source && c.zone !== 'mzone') return false;
    if (c.zone === 'mzone' && c.faceUp && c.controller !== ctx.player && hasAbility(g, uid, 'untargetable')) return false;
    return true;
  });
}

export function costRequirement(g: GameState, player: PlayerId, cost: Cost | undefined, source: string): CostRequirement | null | false {
  if (!cost) return null;
  const ps = g.players[player];
  const src = g.cards[source];
  const ctx = makeCtx(g, player, source, -1);
  if (cost.lp !== undefined && ps.lp <= cost.lp) return false;
  if (cost.banishSelfFromGY && src.zone !== 'gy') return false;
  if (cost.sendSelfToGY && !isOnField(src)) return false;
  if (cost.discard) {
    const options = ps.hand.filter((u) => u !== source && (!cost.discard!.filter || matchFilter(g, u, cost.discard!.filter, ctx)));
    if (options.length < cost.discard.count) return false;
    return { what: 'discard', count: cost.discard.count, options };
  }
  if (cost.tribute) {
    const options = fieldMonsters(g, player).filter((u) => !cost.tribute!.filter || matchFilter(g, u, cost.tribute!.filter, ctx));
    if (options.length < cost.tribute.count) return false;
    return { what: 'tribute', count: cost.tribute.count, options };
  }
  if (cost.banishFromGY) {
    const options = ps.gy.filter((u) => u !== source && (!cost.banishFromGY!.filter || matchFilter(g, u, cost.banishFromGY!.filter, ctx)));
    if (options.length < cost.banishFromGY.count) return false;
    return { what: 'banish', count: cost.banishFromGY.count, options };
  }
  return null;
}

export function payCost(g: GameState, player: PlayerId, cost: Cost | undefined, source: string, chosen: string[]): void {
  if (!cost) return;
  if (cost.lp) changeLp(g, player, -cost.lp, 'cost');
  if (cost.discard) for (const u of chosen) moveCard(g, u, 'gy', { reason: 'discard' });
  if (cost.tribute) {
    for (const u of chosen) {
      emit(g, { type: 'tribute', uid: u, player, defId: g.cards[u].defId });
      moveCard(g, u, 'gy', { reason: 'tribute' });
    }
  }
  if (cost.banishFromGY) for (const u of chosen) moveCard(g, u, 'banished', { reason: 'cost' });
  if (cost.banishSelfFromGY) moveCard(g, source, 'banished', { reason: 'cost' });
  if (cost.sendSelfToGY) moveCard(g, source, 'gy', { reason: 'cost' });
}

const isMain = (g: GameState) => g.phase === 'main1' || g.phase === 'main2';

/**
 * Check whether `player` may activate effect `idx` of card `uid` right now.
 * Returns the information needed to build the action (targets, costs) or null.
 */
export function checkActivation(g: GameState, player: PlayerId, uid: string, idx: number, mode: ActivationMode): ActivationInfo | null {
  if (g.winner !== null) return null;
  const c = g.cards[uid];
  if (!c) return null;
  const d = getDef(c.defId);
  const e = d.effects?.[idx];
  if (!e) return null;
  if (e.kind !== 'activate' && e.kind !== 'ignition' && e.kind !== 'quick') return null;
  const isTP = g.turnPlayer === player;
  const speed = effectSpeed(d, e);
  const top = g.chain[g.chain.length - 1];
  if (top) {
    if (speed < 2) return null;
    if (top.speed === 3 && speed < 3) return null;
  }
  if (speed === 1 && (mode !== 'open' || !isTP || g.chain.length > 0 || !isMain(g))) return null;
  if (e.kind === 'ignition' && (mode !== 'open' || !isTP || g.chain.length > 0 || !isMain(g))) return null;
  if (e.window && !windowMatches(g, e.window)) return null;
  // No activations during the damage step (simplified ruleset).
  if (g.battle && g.window === null) return null;

  if (e.kind === 'activate') {
    if (d.kind === 'monster') return null;
    if (c.zone === 'hand') {
      if (c.owner !== player) return null;
      if (d.kind === 'trap') return null;
      if (d.spellType === 'quickplay' && !isTP) return null;
      if (d.spellType !== 'field' && freeSpellZones(g, player) === 0) return null;
    } else if (c.zone === 'szone' || c.zone === 'fzone') {
      if (c.controller !== player || c.faceUp) return null;
      if ((d.kind === 'trap' || d.spellType === 'quickplay') && c.turnPlaced >= g.turn) return null;
    } else return null;
  } else {
    const from = e.from ?? ['mzone', 'szone', 'fzone'];
    if (!from.includes(c.zone)) return null;
    if (isOnField(c)) {
      if (!c.faceUp || c.controller !== player) return null;
    } else if (c.owner !== player) return null;
  }
  if (e.oncePerTurn && c.opt[idx] === g.turn) return null;
  const ctx = makeCtx(g, player, uid, idx);
  if (e.condition && !e.condition(g, ctx)) return null;
  const cost = costRequirement(g, player, e.cost, uid);
  if (cost === false) return null;
  let targets: string[] = [];
  if (e.target) {
    targets = targetCandidates(g, ctx, e.target);
    if (targets.length < e.target.min) return null;
  }
  return { speed, targetSpec: e.target, targets, cost: cost ?? undefined };
}

export function checkSpecialProc(g: GameState, player: PlayerId, uid: string, idx: number): ActivationInfo | null {
  const c = g.cards[uid];
  const d = getDef(c.defId);
  const e = d.effects?.[idx];
  if (!e || e.kind !== 'specialProc') return null;
  if (g.pending.kind !== 'action' || g.pending.player !== player || g.turnPlayer !== player || !isMain(g)) return null;
  if (c.zone !== 'hand' || c.owner !== player) return null;
  if (e.oncePerTurn && c.opt[idx] === g.turn) return null;
  const ctx = makeCtx(g, player, uid, idx);
  if (e.condition && !e.condition(g, ctx)) return null;
  const cost = costRequirement(g, player, e.cost, uid);
  if (cost === false) return null;
  // Tribute costs free up zones.
  const freeAfter = freeMonsterZones(g, player) + (cost && cost.what === 'tribute' ? cost.count : 0);
  if (freeAfter <= 0) return null;
  return { speed: 1, targets: [], cost: cost ?? undefined };
}
