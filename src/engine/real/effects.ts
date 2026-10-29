// Rules for real Yu-Gi-Oh! cards in automatic duels, keyed by the card's
// English name. Card names, texts and artwork come from the card database at
// runtime; this file only implements the game mechanics of each card.
//
// Normal Monsters, Fusion Monsters whose materials are named cards and
// non-effect Ritual Monsters need no entry here – they are playable
// automatically. Everything not listed is available in free duels only.
import type { CardFilter, EffectContext, EffectDef, GameState, Race } from '../types';
import { cond, tgt } from '../cards/helpers';
import { getDef } from '../db';
import { createToken, destroyCards, drawCards, emit, fieldMonsters, fieldSpellTraps, flipFaceUp, freeMonsterZones, moveCard, opp, summonMonster } from '../core';
import { getAtk, getDefense } from '../stats';
import { fusionCandidates } from '../ops';

export interface RealRules {
  effects: EffectDef[];
  materials?: string[]; // fusion materials by name (when the text cannot be parsed)
}

// ------------------------------------------------------------------ helpers

const nameOf = (g: GameState, uid: string) => getDef(g.cards[uid].defId).name.en;
const named = (...names: string[]): CardFilter => ({ custom: (g, uid) => names.includes(nameOf(g, uid)) });
const races = (...rs: Race[]): CardFilter => ({ race: rs });

const draw = (n: number): EffectDef => ({ kind: 'activate', condition: cond.deckAtLeast(n), ops: [{ op: 'draw', who: 'self', n }], ai: 'draw' });
const burn = (n: number): EffectDef => ({ kind: 'activate', ops: [{ op: 'damage', who: 'opp', n }], ai: 'burn' });
const heal = (n: number): EffectDef => ({ kind: 'activate', ops: [{ op: 'gainLp', who: 'self', n }], ai: 'heal' });

/** Equip Spell: target restriction + stat bonus. */
const equip = (atk: number, def = 0, filter: CardFilter = {}, extra: EffectDef[] = []): RealRules => ({
  effects: [
    { kind: 'activate', target: tgt.anyFaceUpMonster(filter), ops: [{ op: 'equip' }], ai: 'buff' },
    { kind: 'continuous', aura: { target: { controller: 'any', equipped: true }, atk, def } },
    ...extra,
  ],
});

/** Field Spell boosting some monster types and weakening others. */
const field = (up: Race[], down: Race[] = []): RealRules => ({
  effects: [
    { kind: 'activate', ops: [], ai: 'buff' },
    { kind: 'continuous', aura: { target: { controller: 'any', filter: races(...up) }, atk: 200, def: 200 } },
    ...(down.length ? [{ kind: 'continuous' as const, aura: { target: { controller: 'any' as const, filter: races(...down) }, atk: -200, def: -200 } }] : []),
  ],
});

/** Monster that floats into a same-attribute monster with 1500 or less ATK. */
const floater = (attribute: 'DARK' | 'EARTH' | 'LIGHT' | 'WATER' | 'FIRE' | 'WIND'): RealRules => ({
  effects: [
    {
      kind: 'trigger',
      event: 'destroyedByBattle',
      optional: true,
      condition: cond.all(cond.selfInGY, cond.freeZone, cond.inDeck({ kind: 'monster', attribute, atkMax: 1500 })),
      ops: [{ op: 'specialSummon', from: 'deck', filter: { attribute, atkMax: 1500 }, n: 1, position: 'atk' }],
      ai: 'summon',
    },
  ],
});

const oppAttackTrap = (ops: EffectDef['ops'], ai: EffectDef['ai'] = 'negate'): EffectDef => ({ kind: 'activate', window: ['attackDeclared'], condition: cond.oppAttack, ops, ai });

/** Destroy the opponent's face-up monster with the lowest/highest stat. */
const destroyExtreme = (pick: 'lowestAtk' | 'highestDef' | 'highestAtkAttack') => (g: GameState, ctx: EffectContext) => {
  const cands = fieldMonsters(g, opp(ctx.player)).filter((u) => g.cards[u].faceUp && (pick !== 'highestAtkAttack' || g.cards[u].position === 'atk'));
  if (!cands.length) return;
  const score = (u: string) => (pick === 'lowestAtk' ? -getAtk(g, u) : pick === 'highestDef' ? getDefense(g, u) : getAtk(g, u));
  const best = cands.reduce((a, b) => (score(b) > score(a) ? b : a));
  destroyCards(g, [best], 'effect');
};

const oppFaceUp = (g: GameState, ctx: EffectContext) => fieldMonsters(g, opp(ctx.player)).some((u) => g.cards[u].faceUp);

/** Discard the whole hand, then draw the same number (both players). */
function refillHands(g: GameState, ctx: EffectContext, fixed?: number) {
  const counts: [number, number] = [0, 0];
  for (const p of [ctx.player, opp(ctx.player)]) {
    const hand = [...g.players[p].hand];
    counts[p] = hand.length;
    for (const u of hand) {
      emit(g, { type: 'discard', uid: u, player: p, defId: g.cards[u].defId });
      moveCard(g, u, 'gy', { reason: 'discard' });
    }
  }
  for (const p of [ctx.player, opp(ctx.player)]) drawCards(g, p, fixed ?? counts[p]);
}

// --------------------------------------------------------------- the rules

export const REAL_EFFECTS: Record<string, RealRules> = {
  // ------------------------------------------------------------- spells
  'Pot of Greed': { effects: [draw(2)] },
  'Graceful Charity': { effects: [{ kind: 'activate', condition: cond.deckAtLeast(3), ops: [{ op: 'draw', who: 'self', n: 3 }, { op: 'discard', who: 'self', n: 2 }], ai: 'draw' }] },
  'Upstart Goblin': { effects: [{ kind: 'activate', condition: cond.deckAtLeast(1), ops: [{ op: 'draw', who: 'self', n: 1 }, { op: 'gainLp', who: 'opp', n: 1000 }], ai: 'draw' }] },
  'Card Destruction': { effects: [{ kind: 'activate', ops: [{ op: 'custom', run: (g, ctx) => refillHands(g, ctx) }], ai: 'draw' }] },
  'Dark Hole': {
    effects: [{ kind: 'activate', condition: (g) => fieldMonsters(g, 0).length + fieldMonsters(g, 1).length > 0, ops: [{ op: 'destroy', sel: { query: { zones: ['mzone'], controller: 'any' } } }], ai: 'removal' }],
  },
  Raigeki: {
    effects: [{ kind: 'activate', condition: (g, ctx) => fieldMonsters(g, opp(ctx.player)).length > 0, ops: [{ op: 'destroy', sel: { query: { zones: ['mzone'], controller: 'opp' } } }], ai: 'removal' }],
  },
  "Harpie's Feather Duster": {
    effects: [{ kind: 'activate', condition: (g, ctx) => fieldSpellTraps(g, opp(ctx.player)).length > 0, ops: [{ op: 'destroy', sel: { query: { zones: ['szone', 'fzone'], controller: 'opp' } } }], ai: 'removal' }],
  },
  'Heavy Storm': { effects: [{ kind: 'activate', ops: [{ op: 'destroy', sel: { query: { zones: ['szone', 'fzone'], controller: 'any', filter: { notSelf: true } } } }], ai: 'removal' }] },
  'Mystical Space Typhoon': { effects: [{ kind: 'activate', target: tgt.anyST(), ops: [{ op: 'destroy', sel: 'targets' }], ai: 'removal' }] },
  'Monster Reborn': { effects: [{ kind: 'activate', condition: cond.freeZone, target: tgt.anyGY({ kind: 'monster' }), ops: [{ op: 'specialSummon', from: 'targets', position: 'choose' }], ai: 'summon' }] },
  'Change of Heart': { effects: [{ kind: 'activate', condition: cond.freeZone, target: tgt.oppMonster(), ops: [{ op: 'takeControl', sel: 'targets', untilEndOfTurn: true }], ai: 'removal' }] },
  'Brain Control': {
    effects: [{ kind: 'activate', condition: cond.freeZone, cost: { lp: 800 }, target: tgt.oppFaceUpMonster(), ops: [{ op: 'takeControl', sel: 'targets', untilEndOfTurn: true }], ai: 'removal' }],
  },
  Polymerization: {
    effects: [{ kind: 'activate', condition: (g, ctx) => fusionCandidates(g, ctx.player, ['hand', 'mzone']).length > 0, ops: [{ op: 'fusionSummon', from: ['hand', 'mzone'] }], ai: 'summon' }],
  },
  Fissure: { effects: [{ kind: 'activate', condition: oppFaceUp, ops: [{ op: 'custom', run: destroyExtreme('lowestAtk') }], ai: 'removal' }] },
  'Smashing Ground': { effects: [{ kind: 'activate', condition: oppFaceUp, ops: [{ op: 'custom', run: destroyExtreme('highestDef') }], ai: 'removal' }] },
  'Lightning Vortex': {
    effects: [{ kind: 'activate', condition: oppFaceUp, cost: { discard: { count: 1 } }, ops: [{ op: 'destroy', sel: { query: { zones: ['mzone'], controller: 'opp', filter: { faceUp: true } } } }], ai: 'removal' }],
  },
  'Nobleman of Crossout': {
    effects: [{ kind: 'activate', target: { min: 1, max: 1, zones: ['mzone'], controller: 'any', filter: { faceDown: true } }, ops: [{ op: 'destroy', sel: 'targets' }, { op: 'banish', sel: 'targets' }], ai: 'removal' }],
  },
  'Giant Trunade': { effects: [{ kind: 'activate', ops: [{ op: 'bounce', sel: { query: { zones: ['szone', 'fzone'], controller: 'any', filter: { notSelf: true } } } }], ai: 'removal' }] },
  Hinotama: { effects: [burn(500)] },
  Ookazi: { effects: [burn(800)] },
  'Tremendous Fire': { effects: [{ kind: 'activate', ops: [{ op: 'damage', who: 'opp', n: 1000 }, { op: 'damage', who: 'self', n: 500 }], ai: 'burn' }] },
  'Dian Keto the Cure Master': { effects: [heal(1000)] },
  'Red Medicine': { effects: [heal(500)] },
  'Reinforcement of the Army': {
    effects: [{ kind: 'activate', condition: cond.inDeck({ kind: 'monster', race: 'Warrior', levelMax: 4 }), ops: [{ op: 'search', from: 'deck', filter: { kind: 'monster', race: 'Warrior', levelMax: 4 }, n: 1 }], ai: 'search' }],
  },
  Scapegoat: {
    effects: [
      {
        kind: 'activate',
        condition: (g, ctx) => freeMonsterZones(g, ctx.player) >= 4,
        ops: [
          {
            op: 'custom',
            run: (g, ctx) => {
              const sheep = findTokenDef('Sheep Token');
              for (let i = 0; i < 4 && freeMonsterZones(g, ctx.player) > 0; i++) summonMonster(g, createToken(g, sheep, ctx.player), ctx.player, 'special', 'def');
            },
          },
        ],
        ai: 'protect',
      },
    ],
  },
  Shrink: {
    effects: [
      {
        kind: 'activate',
        target: tgt.anyFaceUpMonster(),
        ops: [{ op: 'custom', run: (g, ctx) => ctx.targets.forEach((u) => g.cards[u].modifiers.push({ atk: -Math.floor((getDef(g.cards[u].defId).atk ?? 0) / 2), untilTurn: g.turn, source: ctx.source })) }],
        ai: 'removal',
      },
    ],
  },
  'Rush Recklessly': { effects: [{ kind: 'activate', target: tgt.anyFaceUpMonster(), ops: [{ op: 'modify', sel: 'targets', atk: 700, untilEndOfTurn: true }], ai: 'buff' }] },
  'Swords of Revealing Light': {
    effects: [
      {
        kind: 'activate',
        ops: [{ op: 'custom', run: (g, ctx) => fieldMonsters(g, opp(ctx.player)).forEach((u) => flipFaceUp(g, u)) }],
        ai: 'protect',
      },
      { kind: 'continuous', aura: { target: { controller: 'opp' }, abilities: ['cannotAttack'] } },
      {
        kind: 'trigger',
        event: 'oppEndPhase',
        ops: [
          {
            op: 'custom',
            run: (g, ctx) => {
              const c = g.cards[ctx.source];
              c.opt[-1] = (c.opt[-1] ?? 0) + 1;
              if (c.opt[-1] >= 3) destroyCards(g, [ctx.source], 'effect');
            },
          },
        ],
      },
    ],
  },
  'Black Luster Ritual': { effects: [{ kind: 'activate', condition: cond.inHand(named('Black Luster Soldier')), ops: [{ op: 'ritualSummon', filter: named('Black Luster Soldier') }], ai: 'summon' }] },
  'Black Magic Ritual': { effects: [{ kind: 'activate', condition: cond.inHand(named('Magician of Black Chaos')), ops: [{ op: 'ritualSummon', filter: named('Magician of Black Chaos') }], ai: 'summon' }] },

  // Equip Spells
  'Axe of Despair': equip(1000),
  'Malevolent Nuzzler': equip(700),
  'Sword of Deep-Seated': equip(500, 500),
  'Black Pendant': equip(500, 0, {}, [{ kind: 'trigger', event: 'sentToGYFromField', ops: [{ op: 'damage', who: 'opp', n: 500 }], ai: 'burn' }]),
  'Legendary Sword': equip(300, 300, races('Warrior')),
  'Book of Secret Arts': equip(300, 300, races('Spellcaster')),
  'Dragon Treasure': equip(300, 300, races('Dragon')),
  'Beast Fangs': equip(300, 300, races('Beast')),
  'Vile Germs': equip(300, 300, races('Plant')),
  'Power of Kaishin': equip(300, 300, races('Aqua')),
  'Electro-Whip': equip(300, 300, races('Thunder')),
  'Laser Cannon Armor': equip(300, 300, races('Insect')),
  'Raise Body Heat': equip(300, 300, races('Dinosaur')),
  'Silver Bow and Arrow': equip(300, 300, races('Fairy')),
  'Dark Energy': equip(300, 300, races('Fiend')),
  'Machine Conversion Factory': equip(300, 300, races('Machine')),
  'Follow Wind': equip(300, 300, races('Winged Beast')),
  'United We Stand': {
    effects: [
      { kind: 'activate', target: tgt.anyFaceUpMonster(), ops: [{ op: 'equip' }], ai: 'buff' },
      {
        kind: 'continuous',
        aura: {
          target: { controller: 'any', equipped: true },
          atk: (g, src) => 800 * fieldMonsters(g, g.cards[src].controller).filter((u) => g.cards[u].faceUp).length,
          def: (g, src) => 800 * fieldMonsters(g, g.cards[src].controller).filter((u) => g.cards[u].faceUp).length,
        },
      },
    ],
  },
  'Mage Power': {
    effects: [
      { kind: 'activate', target: tgt.anyFaceUpMonster(), ops: [{ op: 'equip' }], ai: 'buff' },
      {
        kind: 'continuous',
        aura: {
          target: { controller: 'any', equipped: true },
          atk: (g, src) => 500 * fieldSpellTraps(g, g.cards[src].controller, false).length,
          def: (g, src) => 500 * fieldSpellTraps(g, g.cards[src].controller, false).length,
        },
      },
    ],
  },

  // Field Spells
  Yami: field(['Fiend', 'Spellcaster'], ['Fairy']),
  Sogen: field(['Warrior', 'Beast-Warrior']),
  Umi: field(['Fish', 'Sea Serpent', 'Thunder', 'Aqua'], ['Machine', 'Pyro']),
  Mountain: field(['Dragon', 'Winged Beast', 'Thunder']),
  Forest: field(['Insect', 'Beast', 'Plant', 'Beast-Warrior']),
  Wasteland: field(['Dinosaur', 'Zombie', 'Rock']),

  // -------------------------------------------------------------- traps
  'Mirror Force': {
    effects: [oppAttackTrap([{ op: 'destroy', sel: { query: { zones: ['mzone'], controller: 'opp', filter: { faceUp: true, position: 'atk' } } } }], 'removal')],
  },
  'Magic Cylinder': {
    effects: [
      oppAttackTrap([
        { op: 'damage', who: 'opp', n: (g, ctx) => (ctx.eventCards[0] && g.cards[ctx.eventCards[0]].zone === 'mzone' ? getAtk(g, ctx.eventCards[0]) : 0) },
        { op: 'negateAttack' },
      ]),
    ],
  },
  'Negate Attack': { effects: [oppAttackTrap([{ op: 'negateAttack', endBattle: true }])] },
  'Sakuretsu Armor': { effects: [oppAttackTrap([{ op: 'destroy', sel: 'eventCards' }], 'removal')] },
  'Dimensional Prison': { effects: [oppAttackTrap([{ op: 'banish', sel: 'eventCards' }], 'removal')] },
  'Widespread Ruin': { effects: [oppAttackTrap([{ op: 'custom', run: destroyExtreme('highestAtkAttack') }], 'removal')] },
  'Trap Hole': {
    effects: [{ kind: 'activate', window: ['summoned'], condition: cond.oppSummoned({ atkMin: 1000 }, ['normal', 'tribute', 'flip']), ops: [{ op: 'destroy', sel: 'eventCards' }], ai: 'removal' }],
  },
  'Bottomless Trap Hole': {
    effects: [
      {
        kind: 'activate',
        window: ['summoned'],
        condition: cond.oppSummoned({ atkMin: 1500 }, ['normal', 'tribute', 'flip', 'special', 'fusion']),
        ops: [{ op: 'destroy', sel: 'eventCards' }, { op: 'banish', sel: 'eventCards' }],
        ai: 'removal',
      },
    ],
  },
  'Torrential Tribute': {
    effects: [
      {
        kind: 'activate',
        window: ['summoned'],
        condition: (g) => g.window?.type === 'summoned' && (g.window.cards ?? []).some((u) => g.cards[u]?.zone === 'mzone'),
        ops: [{ op: 'destroy', sel: { query: { zones: ['mzone'], controller: 'any' } } }],
        ai: 'removal',
      },
    ],
  },
  'Dust Tornado': { effects: [{ kind: 'activate', target: tgt.oppST(), ops: [{ op: 'destroy', sel: 'targets' }], ai: 'removal' }] },
  'Compulsory Evacuation Device': { effects: [{ kind: 'activate', target: { min: 1, max: 1, zones: ['mzone'], controller: 'any' }, ops: [{ op: 'bounce', sel: 'targets' }], ai: 'removal' }] },
  Reinforcements: { effects: [{ kind: 'activate', target: tgt.anyFaceUpMonster(), ops: [{ op: 'modify', sel: 'targets', atk: 500, untilEndOfTurn: true }], ai: 'buff' }] },
  'Castle Walls': { effects: [{ kind: 'activate', target: tgt.anyFaceUpMonster(), ops: [{ op: 'modify', sel: 'targets', def: 500, untilEndOfTurn: true }], ai: 'buff' }] },
  'Just Desserts': { effects: [{ kind: 'activate', condition: (g, ctx) => fieldMonsters(g, opp(ctx.player)).length > 0, ops: [{ op: 'damage', who: 'opp', n: (g, ctx) => 500 * fieldMonsters(g, opp(ctx.player)).length }], ai: 'burn' }] },
  'Seven Tools of the Bandit': { effects: [{ kind: 'activate', window: ['chain'], condition: cond.oppActivated(['trap']), cost: { lp: 1000 }, ops: [{ op: 'negateActivation', destroy: true }], ai: 'negate' }] },
  'Magic Jammer': { effects: [{ kind: 'activate', window: ['chain'], condition: cond.oppActivated(['spell']), cost: { discard: { count: 1 } }, ops: [{ op: 'negateActivation', destroy: true }], ai: 'negate' }] },

  // ------------------------------------------------------------ monsters
  Sangan: {
    effects: [{ kind: 'trigger', event: 'sentToGYFromField', condition: cond.inDeck({ kind: 'monster', atkMax: 1500 }), ops: [{ op: 'search', from: 'deck', filter: { kind: 'monster', atkMax: 1500 }, n: 1 }], ai: 'search' }],
  },
  'Witch of the Black Forest': {
    effects: [{ kind: 'trigger', event: 'sentToGYFromField', condition: cond.inDeck({ kind: 'monster', defMax: 1500 }), ops: [{ op: 'search', from: 'deck', filter: { kind: 'monster', defMax: 1500 }, n: 1 }], ai: 'search' }],
  },
  'Mystic Tomato': floater('DARK'),
  'Giant Rat': floater('EARTH'),
  'Shining Angel': floater('LIGHT'),
  'Mother Grizzly': floater('WATER'),
  'UFO Turtle': floater('FIRE'),
  'Flying Kamakiri #1': floater('WIND'),
  'Man-Eater Bug': { effects: [{ kind: 'trigger', event: 'flipped', target: { min: 1, max: 1, zones: ['mzone'], controller: 'any' }, ops: [{ op: 'destroy', sel: 'targets' }], ai: 'removal' }] },
  'Hane-Hane': { effects: [{ kind: 'trigger', event: 'flipped', target: { min: 1, max: 1, zones: ['mzone'], controller: 'any' }, ops: [{ op: 'bounce', sel: 'targets' }], ai: 'removal' }] },
  'Magician of Faith': { effects: [{ kind: 'trigger', event: 'flipped', target: tgt.ownGY({ kind: 'spell' }), ops: [{ op: 'addToHand', sel: 'targets' }], ai: 'search' }] },
  'Old Vindictive Magician': { effects: [{ kind: 'trigger', event: 'flipped', target: tgt.oppMonster(), ops: [{ op: 'destroy', sel: 'targets' }], ai: 'removal' }] },
  'Penguin Soldier': {
    effects: [{ kind: 'trigger', event: 'flipped', optional: true, target: { min: 1, max: 2, zones: ['mzone'], controller: 'any' }, ops: [{ op: 'bounce', sel: 'targets' }], ai: 'removal' }],
  },
  'Morphing Jar': { effects: [{ kind: 'trigger', event: 'flipped', ops: [{ op: 'custom', run: (g, ctx) => refillHands(g, ctx, 5) }], ai: 'draw' }] },
  'Dekoichi the Battlechanted Locomotive': { effects: [{ kind: 'trigger', event: 'flipped', condition: cond.deckAtLeast(1), ops: [{ op: 'draw', who: 'self', n: 1 }], ai: 'draw' }] },
  "Gravekeeper's Spy": {
    effects: [
      {
        kind: 'trigger',
        event: 'flipped',
        condition: cond.all(cond.freeZone, cond.inDeck({ kind: 'monster', atkMax: 1500, custom: (g, u) => nameOf(g, u).startsWith("Gravekeeper's") })),
        ops: [{ op: 'specialSummon', from: 'deck', filter: { atkMax: 1500, custom: (g, u) => nameOf(g, u).startsWith("Gravekeeper's") }, n: 1, position: 'choose' }],
        ai: 'summon',
      },
    ],
  },
  'Exiled Force': {
    effects: [{ kind: 'ignition', cost: { sendSelfToGY: true }, target: { min: 1, max: 1, zones: ['mzone'], controller: 'any' }, ops: [{ op: 'destroy', sel: 'targets' }], ai: 'removal' }],
  },
  'Cyber Dragon': {
    effects: [{ kind: 'specialProc', condition: (g, ctx) => fieldMonsters(g, ctx.player).length === 0 && fieldMonsters(g, opp(ctx.player)).length > 0 }],
  },
  'Airknight Parshath': {
    effects: [
      { kind: 'continuous', aura: { target: { controller: 'self', selfOnly: true }, abilities: ['piercing'] } },
      { kind: 'trigger', event: 'inflictsBattleDamage', condition: cond.deckAtLeast(1), ops: [{ op: 'draw', who: 'self', n: 1 }], ai: 'draw' },
    ],
  },
  'Masked Sorcerer': { effects: [{ kind: 'trigger', event: 'inflictsBattleDamage', condition: cond.deckAtLeast(1), ops: [{ op: 'draw', who: 'self', n: 1 }], ai: 'draw' }] },
  'Hayabusa Knight': { effects: [{ kind: 'continuous', aura: { target: { controller: 'self', selfOnly: true }, abilities: ['doubleAttack'] } }] },
  'Zaborg the Thunder Monarch': { effects: [{ kind: 'trigger', event: 'tributeSummoned', target: { min: 1, max: 1, zones: ['mzone'], controller: 'any' }, ops: [{ op: 'destroy', sel: 'targets' }], ai: 'removal' }] },
  'Mobius the Frost Monarch': {
    effects: [{ kind: 'trigger', event: 'tributeSummoned', optional: true, target: { min: 1, max: 2, zones: ['szone', 'fzone'], controller: 'any' }, ops: [{ op: 'destroy', sel: 'targets' }], ai: 'removal' }],
  },
  'Raiza the Storm Monarch': {
    effects: [{ kind: 'trigger', event: 'tributeSummoned', target: { min: 1, max: 1, zones: ['mzone', 'szone', 'fzone'], controller: 'any' }, ops: [{ op: 'toDeck', sel: 'targets', top: true }], ai: 'removal' }],
  },
  'Granmarg the Rock Monarch': {
    effects: [{ kind: 'trigger', event: 'tributeSummoned', target: { min: 1, max: 1, zones: ['mzone', 'szone'], controller: 'any', filter: { faceDown: true } }, ops: [{ op: 'destroy', sel: 'targets' }], ai: 'removal' }],
  },
  Kaibaman: {
    effects: [
      {
        kind: 'ignition',
        condition: cond.inHand(named('Blue-Eyes White Dragon')),
        cost: { sendSelfToGY: true },
        ops: [{ op: 'specialSummon', from: 'hand', filter: named('Blue-Eyes White Dragon'), n: 1, position: 'choose' }],
        ai: 'summon',
      },
    ],
  },
  'Dark Magician Girl': {
    effects: [
      {
        kind: 'continuous',
        aura: {
          target: { controller: 'self', selfOnly: true },
          atk: (g) => 300 * [...g.players[0].gy, ...g.players[1].gy].filter((u) => ['Dark Magician', 'Magician of Black Chaos'].includes(nameOf(g, u))).length,
        },
      },
    ],
  },
  'Command Knight': {
    effects: [
      { kind: 'continuous', aura: { target: { controller: 'self', filter: { race: 'Warrior' } }, atk: 400 } },
      { kind: 'continuous', aura: { target: { controller: 'self', selfOnly: true }, abilities: ['unattackable'], when: (g, src) => fieldMonsters(g, g.cards[src].controller).length > 1 } },
    ],
  },
  'Marauding Captain': {
    effects: [
      {
        kind: 'trigger',
        event: 'normalSummoned',
        optional: true,
        condition: cond.all(cond.freeZone, cond.inHand({ kind: 'monster', levelMax: 4 })),
        ops: [{ op: 'specialSummon', from: 'hand', filter: { kind: 'monster', levelMax: 4 }, n: 1 }],
        ai: 'summon',
      },
      { kind: 'continuous', aura: { target: { controller: 'self', filter: { race: 'Warrior', notSelf: true } }, abilities: ['unattackable'] } },
    ],
  },
  'Gyaku-Gire Panda': {
    effects: [
      {
        kind: 'continuous',
        aura: { target: { controller: 'self', selfOnly: true }, abilities: ['piercing'], atk: (g, src) => 500 * fieldMonsters(g, opp(g.cards[src].controller)).length },
      },
    ],
  },
  'Blade Knight': {
    effects: [{ kind: 'continuous', aura: { target: { controller: 'self', selfOnly: true }, atk: 400, when: (g, src) => g.players[g.cards[src].controller].hand.length <= 1 } }],
  },
  'Abyss Soldier': {
    effects: [
      {
        kind: 'ignition',
        oncePerTurn: true,
        cost: { discard: { count: 1, filter: { kind: 'monster', attribute: 'WATER' } } },
        target: { min: 1, max: 1, zones: ['mzone', 'szone', 'fzone'], controller: 'any' },
        ops: [{ op: 'bounce', sel: 'targets' }],
        ai: 'removal',
      },
    ],
  },
  'Exodia the Forbidden One': { effects: [] },
};

// Cards that win the duel when all pieces are in hand.
export const EXODIA_PIECES = ['Exodia the Forbidden One', 'Right Arm of the Forbidden One', 'Left Arm of the Forbidden One', 'Right Leg of the Forbidden One', 'Left Leg of the Forbidden One'];

/** Token definitions by name (registered from the card data). */
let tokenLookup: (name: string) => string = () => '';
export function setTokenLookup(fn: (name: string) => string): void {
  tokenLookup = fn;
}
function findTokenDef(name: string): string {
  return tokenLookup(name);
}
