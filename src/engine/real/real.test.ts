import { describe, expect, it, beforeAll } from 'vitest';
import '../cards';
import { compactCards, parseYdk, toYdk } from '../../shared/ygo';
import { fixtureCards } from './fixture';
import { registerRealCards, realCardByName, realId, missingCuratedNames, parseNamedMaterials } from './index';
import { REAL_STARTERS, resolveRealStarter } from './decks';
import { getDef } from '../db';
import { applyAction, createGame } from '../engine';
import { validateDeck } from '../decks';
import { moveCard, newInstance } from '../core';
import { mulberry, randomDecision } from '../testkit';
import { Bot } from '../ai/bot';
import type { Action, DeckList, GameState, PlayerId, Zone } from '../types';

const id = (name: string) => realId(realCardByName(name)!.id);

beforeAll(() => {
  const en = fixtureCards();
  const de = en.map((c) => (c.name === 'Dark Magician' ? { ...c, name: 'Dunkler Magier', desc: 'Platzhalter' } : c));
  registerRealCards(compactCards(en, de), 'fixture');
});

describe('real card data', () => {
  it('merges German names and marks automatic cards', () => {
    expect(getDef(id('Dark Magician')).name.de).toBe('Dunkler Magier');
    expect(getDef(id('Dark Magician')).auto).toBe(true); // normal monster
    expect(getDef(id('Pot of Greed')).auto).toBe(true); // curated
    expect(getDef(id('Time Wizard')).auto).toBeFalsy(); // effect not implemented
    const ultimate = getDef(id('Blue-Eyes Ultimate Dragon'));
    expect(ultimate.auto).toBe(true);
    expect(ultimate.materials).toHaveLength(3);
    expect(parseNamedMaterials('"A" + "B"\nmore text')).toEqual(['A', 'B']);
    expect(parseNamedMaterials('1 Dragon monster + 1 Warrior monster')).toBeNull();
  });

  it('resolves every starter deck into a legal automatic deck', () => {
    for (const s of REAL_STARTERS) {
      const deck = resolveRealStarter(s);
      expect(deck, s.id).not.toBeNull();
      expect(validateDeck(deck!, 'auto'), s.id).toEqual([]);
    }
  });

  it('applies banlists per format and YDK round-trips', () => {
    const NORMALS = ['Celtic Guardian', 'Battle Ox', 'Feral Imp', 'Beaver Warrior', 'Mystical Elf', 'Luster Dragon', 'Axe Raider', 'Dark Blade', 'Gemini Elf', 'Vorse Raider', 'Mad Dog of Darkness', 'Ancient Elf', 'Giant Soldier of Stone'];
    const rest = (k: number) => Array.from({ length: k }, (_, i) => id(NORMALS[i % NORMALS.length]));
    const deck: DeckList = { main: [...Array(3).fill(id('Pot of Greed')), ...rest(37)], extra: [] };
    expect(validateDeck(deck, 'auto').some((i) => i.key === 'deck.tooManyCopies')).toBe(true);
    expect(validateDeck(deck, 'tcg').some((i) => i.key === 'deck.banned')).toBe(true);
    const timeWizard: DeckList = { main: [...Array(3).fill(id('Time Wizard')), ...rest(37)], extra: [] };
    expect(validateDeck(timeWizard, 'auto').some((i) => i.key === 'deck.notAuto')).toBe(true);
    expect(validateDeck(timeWizard, 'tcg')).toEqual([]);
    const ydk = parseYdk(toYdk([1, 2, 2], [5], [9]));
    expect(ydk).toEqual({ main: [1, 2, 2], extra: [5], side: [9] });
  });

  it('only reports curated names that are missing from the fixture', () => {
    // The fixture contains just the cards the starters use; this guards typos in the starter lists.
    const used = new Set(REAL_STARTERS.flatMap((s) => [...s.main, ...s.extra].map(([n]) => n)));
    const missingUsed = missingCuratedNames().filter((n) => used.has(n));
    expect(missingUsed).toEqual([]);
  });
});

// ------------------------------------------------------------- mechanics

const filler = (): DeckList => ({ main: Array(40).fill(0).map((_, i) => id(['Celtic Guardian', 'Battle Ox', 'Feral Imp'][i % 3])), extra: [] });
let n = 0;
function give(g: GameState, p: PlayerId, name: string, zone: Zone = 'hand', opts: { faceUp?: boolean; position?: 'atk' | 'def' } = {}): string {
  const uid = `r${++n}`;
  g.cards[uid] = newInstance(uid, id(name), p);
  g.cards[uid].zone = 'void';
  moveCard(g, uid, zone, { controller: p, faceUp: opts.faceUp, position: opts.position, silent: true });
  g.cards[uid].turnPlaced = 0;
  g.cards[uid].summonedTurn = 0;
  return uid;
}
const act = (g: GameState, p: PlayerId, a: Action) => {
  const r = applyAction(g, p, a);
  if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
};
const passAll = (g: GameState) => {
  for (let i = 0; i < 20 && g.pending.kind === 'response'; i++) act(g, g.pending.player, { type: 'pass' });
};

describe('real card rules', () => {
  it('Change of Heart returns control at the end of the turn', () => {
    const g = createGame({ decks: [filler(), filler()], names: ['A', 'B'], seed: 3, firstPlayer: 0 });
    const target = give(g, 1, 'Summoned Skull', 'mzone');
    const coh = give(g, 0, 'Change of Heart');
    act(g, 0, { type: 'activate', uid: coh, effectIdx: 0, targets: [target] });
    passAll(g);
    expect(g.cards[target].controller).toBe(0);
    act(g, 0, { type: 'phase', to: 'end' });
    passAll(g);
    expect(g.cards[target].controller).toBe(1);
    expect(g.cards[target].zone).toBe('mzone');
  });

  it('Mirror Force destroys every attacking-position monster', () => {
    const g = createGame({ decks: [filler(), filler()], names: ['A', 'B'], seed: 4, firstPlayer: 0 });
    const mf = give(g, 0, 'Mirror Force', 'szone', { faceUp: false });
    act(g, 0, { type: 'phase', to: 'end' });
    passAll(g);
    const a1 = give(g, 1, 'Dark Blade', 'mzone');
    const a2 = give(g, 1, 'Axe Raider', 'mzone');
    act(g, 1, { type: 'phase', to: 'battle' });
    passAll(g);
    act(g, 1, { type: 'attack', uid: a1, target: null });
    act(g, 0, { type: 'activate', uid: mf, effectIdx: 0 });
    passAll(g);
    expect(g.cards[a1].zone).toBe('gy');
    expect(g.cards[a2].zone).toBe('gy');
    expect(g.players[0].lp).toBe(8000);
  });

  it('ritual summons Magician of Black Chaos', () => {
    const g = createGame({ decks: [filler(), filler()], names: ['A', 'B'], seed: 5, firstPlayer: 0 });
    const ritual = give(g, 0, 'Black Magic Ritual');
    const mobc = give(g, 0, 'Magician of Black Chaos');
    const t1 = give(g, 0, 'Dark Magician', 'mzone');
    const t2 = give(g, 0, 'Celtic Guardian', 'mzone');
    act(g, 0, { type: 'activate', uid: ritual, effectIdx: 0 });
    passAll(g);
    act(g, 0, { type: 'answer', choice: [mobc] });
    act(g, 0, { type: 'answer', choice: [t1] }); // level 7 < 8 → asked again
    expect(g.pending.kind).toBe('prompt');
    act(g, 0, { type: 'answer', choice: [t1, t2] });
    passAll(g);
    expect(g.cards[mobc].zone).toBe('mzone');
    expect(g.cards[t1].zone).toBe('gy');
  });

  it('wins with all five Forbidden One pieces in hand', () => {
    const g = createGame({ decks: [filler(), filler()], names: ['A', 'B'], seed: 6, firstPlayer: 0 });
    for (const p of ['Right Arm of the Forbidden One', 'Left Arm of the Forbidden One', 'Right Leg of the Forbidden One', 'Left Leg of the Forbidden One']) give(g, 0, p);
    expect(g.winner).toBeNull();
    give(g, 0, 'Exodia the Forbidden One');
    expect(g.winner).toBe(0);
    expect(g.winReason).toBe('exodia');
  });

  it('plays random and bot duels between all real starter decks without errors', () => {
    const decks = REAL_STARTERS.map((s) => resolveRealStarter(s)!);
    let finished = 0;
    for (let i = 0; i < 60; i++) {
      const g = createGame({ decks: [decks[i % decks.length], decks[(i * 5 + 1) % decks.length]], names: ['A', 'B'], seed: 900 + i });
      const rand = mulberry(i);
      const bots = [new Bot({ level: 'normal', seed: i }), new Bot({ level: 'easy', seed: i + 1 })];
      const useBots = i % 3 === 0;
      for (let step = 0; step < 3000 && g.winner === null; step++) {
        const p = (g.pending as { player: PlayerId }).player;
        const action = useBots ? bots[p].decide(g, p) : randomDecision(g, rand)!.action;
        const r = applyAction(g, p, action);
        if (!r.ok) throw new Error(`illegal ${JSON.stringify(action)}: ${r.error}`);
      }
      if (g.winner !== null) finished++;
    }
    expect(finished).toBeGreaterThan(40);
  }, 120_000);
});
