// Computed card statistics: ATK/DEF/level after modifiers and continuous auras.
import { getDef } from './db';
import type { Ability, Aura, CardInstance, GameState, PlayerId } from './types';
import { matchFilter } from './filters';

let auraDepth = 0;

interface AuraSource {
  uid: string;
  aura: Aura;
}

function activeAuras(g: GameState): AuraSource[] {
  const out: AuraSource[] = [];
  for (const p of [0, 1] as PlayerId[]) {
    const ps = g.players[p];
    const ids = [...ps.mzone, ...ps.szone, ps.fzone];
    for (const uid of ids) {
      if (!uid) continue;
      const c = g.cards[uid];
      if (!c.faceUp) continue;
      const d = getDef(c.defId);
      if (!d.effects) continue;
      for (const e of d.effects) {
        if (e.kind !== 'continuous' || !e.aura) continue;
        out.push({ uid, aura: e.aura });
      }
    }
  }
  return out;
}

function auraApplies(g: GameState, src: AuraSource, target: CardInstance): boolean {
  const s = g.cards[src.uid];
  const a = src.aura;
  if (a.target.selfOnly && src.uid !== target.uid) return false;
  if (a.target.equipped && s.equippedTo !== target.uid) return false;
  if (!a.target.selfOnly && !a.target.equipped) {
    if (a.target.controller === 'self' && target.controller !== s.controller) return false;
    if (a.target.controller === 'opp' && target.controller === s.controller) return false;
  }
  if (target.zone !== 'mzone' || !target.faceUp) return false;
  if (a.target.filter && !matchFilter(g, target.uid, a.target.filter, { player: s.controller, source: s.uid, effectIdx: -1, targets: [], eventCards: [], chosen: [] })) return false;
  if (a.when && !a.when(g, src.uid)) return false;
  return true;
}

function withAuras<T>(g: GameState, fn: (auras: AuraSource[]) => T, fallback: T): T {
  if (auraDepth > 2) return fallback;
  auraDepth++;
  try {
    return fn(activeAuras(g));
  } finally {
    auraDepth--;
  }
}

function stat(g: GameState, uid: string, which: 'atk' | 'def'): number {
  const c = g.cards[uid];
  const d = getDef(c.defId);
  const base = (which === 'atk' ? d.atk : d.def) ?? 0;
  if (c.zone !== 'mzone') return base;
  let v = base;
  for (const m of c.modifiers) v += m[which] ?? 0;
  v += withAuras(
    g,
    (auras) => {
      let sum = 0;
      for (const src of auras) {
        const amount = src.aura[which];
        if (amount === undefined) continue;
        if (!auraApplies(g, src, c)) continue;
        sum += typeof amount === 'function' ? amount(g, src.uid, uid) : amount;
      }
      return sum;
    },
    0,
  );
  return Math.max(0, v);
}

export function getAtk(g: GameState, uid: string): number {
  return stat(g, uid, 'atk');
}

export function getDefense(g: GameState, uid: string): number {
  return stat(g, uid, 'def');
}

export function getLevel(g: GameState, uid: string): number {
  return getDef(g.cards[uid].defId).level ?? 0;
}

export function getAbilities(g: GameState, uid: string): Set<Ability> {
  const c = g.cards[uid];
  const set = new Set<Ability>();
  if (c.zone !== 'mzone') return set;
  for (const m of c.modifiers) if (m.ability) set.add(m.ability);
  withAuras(
    g,
    (auras) => {
      for (const src of auras) {
        if (!src.aura.abilities) continue;
        if (!auraApplies(g, src, c)) continue;
        for (const a of src.aura.abilities) set.add(a);
      }
      return null;
    },
    null,
  );
  return set;
}

export function hasAbility(g: GameState, uid: string, a: Ability): boolean {
  return getAbilities(g, uid).has(a);
}

export function maxAttacks(g: GameState, uid: string): number {
  return hasAbility(g, uid, 'doubleAttack') ? 2 : 1;
}
