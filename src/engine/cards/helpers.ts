// Builders and shared building blocks for card definitions.
import type {
  Attribute,
  CardDef,
  CardFilter,
  EffectContext,
  EffectDef,
  FusionMaterial,
  GameState,
  Race,
  Rarity,
  SpellType,
  TargetSpec,
  TrapType,
} from '../types';
import { runQuery } from '../filters';
import { getDef } from '../db';
import { freeMonsterZones } from '../core';

type Txt = [en: string, de: string];
const L = ([en, de]: Txt) => ({ en, de });

interface Extra {
  rarity?: Rarity;
  archetype?: string;
  limit?: 0 | 1 | 2 | 3;
  motif?: string;
}

export function normalMonster(
  id: string,
  name: Txt,
  attribute: Attribute,
  race: Race,
  level: number,
  atk: number,
  def: number,
  flavor: Txt,
  x: Extra = {},
): CardDef {
  return {
    id,
    name: L(name),
    kind: 'monster',
    frame: 'normal',
    attribute,
    race,
    level,
    atk,
    def,
    rarity: x.rarity ?? 'common',
    archetype: x.archetype,
    text: L(flavor),
    flavor: L(flavor),
    limit: x.limit,
    art: { motif: x.motif },
  };
}

export function effectMonster(
  id: string,
  name: Txt,
  attribute: Attribute,
  race: Race,
  level: number,
  atk: number,
  def: number,
  text: Txt,
  effects: EffectDef[],
  x: Extra = {},
): CardDef {
  return {
    id,
    name: L(name),
    kind: 'monster',
    frame: 'effect',
    attribute,
    race,
    level,
    atk,
    def,
    rarity: x.rarity ?? 'common',
    archetype: x.archetype,
    text: L(text),
    effects,
    limit: x.limit,
    art: { motif: x.motif },
  };
}

export function fusionMonster(
  id: string,
  name: Txt,
  attribute: Attribute,
  race: Race,
  level: number,
  atk: number,
  def: number,
  materials: FusionMaterial[],
  text: Txt,
  effects: EffectDef[],
  x: Extra = {},
): CardDef {
  return {
    id,
    name: L(name),
    kind: 'monster',
    frame: 'fusion',
    attribute,
    race,
    level,
    atk,
    def,
    materials,
    rarity: x.rarity ?? 'super',
    archetype: x.archetype,
    text: L(text),
    effects,
    limit: x.limit,
    art: { motif: x.motif },
  };
}

export function tokenMonster(id: string, name: Txt, attribute: Attribute, race: Race, level: number, atk: number, def: number): CardDef {
  return {
    id,
    name: L(name),
    kind: 'monster',
    frame: 'token',
    attribute,
    race,
    level,
    atk,
    def,
    rarity: 'common',
    text: L(['A token created by a card effect.', 'Eine durch einen Karteneffekt erzeugte Spielmarke.']),
    token: true,
  };
}

export function spell(id: string, name: Txt, spellType: SpellType, text: Txt, effects: EffectDef[], x: Extra = {}): CardDef {
  return {
    id,
    name: L(name),
    kind: 'spell',
    spellType,
    rarity: x.rarity ?? 'common',
    archetype: x.archetype,
    text: L(text),
    effects,
    limit: x.limit,
    art: { motif: x.motif },
  };
}

export function trap(id: string, name: Txt, trapType: TrapType, text: Txt, effects: EffectDef[], x: Extra = {}): CardDef {
  return {
    id,
    name: L(name),
    kind: 'trap',
    trapType,
    rarity: x.rarity ?? 'common',
    archetype: x.archetype,
    text: L(text),
    effects,
    limit: x.limit,
    art: { motif: x.motif },
  };
}

// ---------------------------------------------------------------------------
// Target specs
// ---------------------------------------------------------------------------

export const tgt = {
  oppCard: (max = 1): TargetSpec => ({ min: 1, max, zones: ['mzone', 'szone', 'fzone'], controller: 'opp' }),
  oppMonster: (max = 1, filter?: CardFilter): TargetSpec => ({ min: 1, max, zones: ['mzone'], controller: 'opp', filter }),
  oppFaceUpMonster: (): TargetSpec => ({ min: 1, max: 1, zones: ['mzone'], controller: 'opp', filter: { faceUp: true } }),
  oppST: (max = 1): TargetSpec => ({ min: 1, max, zones: ['szone', 'fzone'], controller: 'opp' }),
  anyST: (): TargetSpec => ({ min: 1, max: 1, zones: ['szone', 'fzone'], controller: 'any' }),
  ownFaceUpMonster: (filter: CardFilter = {}): TargetSpec => ({ min: 1, max: 1, zones: ['mzone'], controller: 'self', filter: { faceUp: true, ...filter } }),
  anyFaceUpMonster: (filter: CardFilter = {}): TargetSpec => ({ min: 1, max: 1, zones: ['mzone'], controller: 'any', filter: { faceUp: true, ...filter } }),
  ownGY: (filter: CardFilter = {}): TargetSpec => ({ min: 1, max: 1, zones: ['gy'], controller: 'self', filter }),
  anyGY: (filter: CardFilter = {}): TargetSpec => ({ min: 1, max: 1, zones: ['gy'], controller: 'any', filter }),
};

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

type Cond = (g: GameState, ctx: EffectContext) => boolean;

export const cond = {
  oppAttack: ((g, ctx) => g.window?.type === 'attackDeclared' && g.window.player !== ctx.player) as Cond,
  oppSummoned:
    (filter?: CardFilter, methods?: string[]): Cond =>
    (g, ctx) => {
      const w = g.window;
      if (w?.type !== 'summoned' || w.player === ctx.player) return false;
      if (methods && (!w.method || !methods.includes(w.method))) return false;
      const cards = (w.cards ?? []).filter((u) => g.cards[u]?.zone === 'mzone' && g.cards[u].faceUp);
      if (!filter) return cards.length > 0;
      const ok = new Set(runQuery(g, { zones: ['mzone'], controller: 'opp', filter }, ctx));
      return cards.some((u) => ok.has(u));
    },
  controls:
    (filter: CardFilter): Cond =>
    (g, ctx) =>
      runQuery(g, { zones: ['mzone'], controller: 'self', filter: { faceUp: true, ...filter } }, ctx).length > 0,
  inDeck:
    (filter: CardFilter): Cond =>
    (g, ctx) =>
      runQuery(g, { zones: ['deck'], controller: 'self', filter }, ctx).length > 0,
  inHand:
    (filter: CardFilter): Cond =>
    (g, ctx) =>
      runQuery(g, { zones: ['hand'], controller: 'self', filter }, ctx).filter((u) => u !== ctx.source).length > 0,
  freeZone: ((g, ctx) => freeMonsterZones(g, ctx.player) > 0) as Cond,
  selfInGY: ((g, ctx) => g.cards[ctx.source]?.zone === 'gy') as Cond,
  deckAtLeast:
    (n: number): Cond =>
    (g, ctx) =>
      g.players[ctx.player].deck.length >= n,
  oppActivated:
    (kinds: ('spell' | 'trap' | 'monster')[]): Cond =>
    (g, ctx) => {
      const top = g.chain[g.chain.length - 1];
      if (!top || top.player === ctx.player) return false;
      const d = getDef(g.cards[top.source].defId);
      if (d.kind === 'monster') return kinds.includes('monster');
      return top.isCardActivation && kinds.includes(d.kind);
    },
  all:
    (...cs: Cond[]): Cond =>
    (g, ctx) =>
      cs.every((c) => c(g, ctx)),
};

export const countInGY = (g: GameState, player: number, filter: CardFilter): number =>
  g.players[player].gy.filter((u) => {
    const d = getDef(g.cards[u].defId);
    if (filter.kind && d.kind !== filter.kind) return false;
    if (filter.race && d.race !== filter.race) return false;
    return true;
  }).length;

export const controller = (g: GameState, uid: string) => g.cards[uid].controller;
