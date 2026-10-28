import { describe, expect, it } from 'vitest';
import './cards';
import { applyAction, createGame } from './engine';
import { getOptions } from './options';
import { getView } from './view';
import { moveCard, newInstance } from './core';
import { getAtk } from './stats';
import { STARTER_DECKS, decodeDeck, encodeDeck, validateDeck } from './decks';
import { mulberry, randomDecision } from './testkit';
import type { Action, GameState, PlayerId, Zone } from './types';

const filler = { main: Array(40).fill('GEN-001'), extra: [] as string[] };

function newGame(): GameState {
  return createGame({ decks: [filler, filler], names: ['A', 'B'], seed: 42, firstPlayer: 0 });
}

let n = 0;
function give(g: GameState, p: PlayerId, defId: string, zone: Zone = 'hand', opts: { faceUp?: boolean; position?: 'atk' | 'def' } = {}): string {
  const uid = `x${++n}`;
  g.cards[uid] = newInstance(uid, defId, p);
  g.cards[uid].zone = 'void';
  g.cards[uid].turnPlaced = -1;
  moveCard(g, uid, zone, { controller: p, faceUp: opts.faceUp, position: opts.position, silent: true });
  g.cards[uid].turnPlaced = 0;
  g.cards[uid].summonedTurn = 0;
  return uid;
}

function act(g: GameState, p: PlayerId, a: Action) {
  const r = applyAction(g, p, a);
  if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
}

/** End the current turn, letting any opponent windows pass. */
function endTurn(g: GameState) {
  act(g, g.turnPlayer, { type: 'phase', to: 'end' });
  passAll(g);
}

function passAll(g: GameState) {
  for (let i = 0; i < 20 && g.pending.kind === 'response'; i++) act(g, g.pending.player, { type: 'pass' });
}

describe('game setup', () => {
  it('deals opening hands and starts in main phase 1 without a draw for the first player', () => {
    const g = newGame();
    expect(g.players[0].hand).toHaveLength(5);
    expect(g.players[1].hand).toHaveLength(5);
    expect(g.phase).toBe('main1');
    expect(g.pending).toEqual({ kind: 'action', player: 0 });
    expect(g.players[0].deck).toHaveLength(35);
  });

  it('forbids battle on the very first turn and draws for the next player', () => {
    const g = newGame();
    expect(getOptions(g, 0).some((o) => o.action.type === 'phase' && o.action.to === 'battle')).toBe(false);
    endTurn(g);
    expect(g.turn).toBe(2);
    expect(g.turnPlayer).toBe(1);
    expect(g.players[1].hand).toHaveLength(6);
  });

  it('starter decks are legal and deck codes round-trip', () => {
    for (const s of STARTER_DECKS) {
      expect(validateDeck(s.deck), s.id).toEqual([]);
      expect(s.deck.main).toHaveLength(40);
      const back = decodeDeck(encodeDeck(s.deck));
      expect(back?.main.sort()).toEqual([...s.deck.main].sort());
      expect(back?.extra.sort()).toEqual([...s.deck.extra].sort());
    }
  });
});

describe('summoning', () => {
  it('allows one normal summon per turn', () => {
    const g = newGame();
    const a = give(g, 0, 'GEN-002');
    const b = give(g, 0, 'GEN-007');
    act(g, 0, { type: 'normalSummon', uid: a });
    expect(g.cards[a].zone).toBe('mzone');
    expect(applyAction(g, 0, { type: 'normalSummon', uid: b }).ok).toBe(false);
  });

  it('requires tributes for high level monsters', () => {
    const g = newGame();
    const big = give(g, 0, 'GEN-010');
    const t1 = give(g, 0, 'GEN-001', 'mzone');
    const t2 = give(g, 0, 'GEN-002', 'mzone');
    expect(applyAction(g, 0, { type: 'normalSummon', uid: big, tributes: [t1] }).ok).toBe(false);
    act(g, 0, { type: 'normalSummon', uid: big, tributes: [t1, t2] });
    expect(g.cards[big].zone).toBe('mzone');
    expect(g.players[0].gy).toEqual(expect.arrayContaining([t1, t2]));
  });

  it('special summons via a summoning procedure', () => {
    const g = newGame();
    give(g, 0, 'GAL-002', 'mzone');
    const sky = give(g, 0, 'GAL-006');
    act(g, 0, { type: 'specialProc', uid: sky, effectIdx: 0 });
    expect(g.cards[sky].zone).toBe('mzone');
    expect(g.players[0].normalSummonUsed).toBe(false);
  });
});

describe('battle', () => {
  it('resolves attack-position battles and direct attacks', () => {
    const g = newGame();
    const weak = give(g, 0, 'GEN-001', 'mzone'); // 1300 ATK
    endTurn(g);
    const strong = give(g, 1, 'GEN-002', 'mzone'); // 1800 ATK
    act(g, 1, { type: 'phase', to: 'battle' });
    passAll(g);
    act(g, 1, { type: 'attack', uid: strong, target: weak });
    passAll(g);
    expect(g.cards[weak].zone).toBe('gy');
    expect(g.players[0].lp).toBe(7500);
  });

  it('defense position deals damage to the attacker when DEF is higher', () => {
    const g = newGame();
    const wall = give(g, 0, 'GEN-001', 'mzone', { position: 'def' }); // 2000 DEF
    endTurn(g);
    const atk = give(g, 1, 'GEN-002', 'mzone');
    act(g, 1, { type: 'phase', to: 'battle' });
    passAll(g);
    act(g, 1, { type: 'attack', uid: atk, target: wall });
    passAll(g);
    expect(g.cards[wall].zone).toBe('mzone');
    expect(g.players[1].lp).toBe(7800);
  });

  it('lets the defender respond with a trap that negates and ends the battle phase', () => {
    const g = newGame();
    const trapUid = give(g, 0, 'GEN-T01', 'szone', { faceUp: false });
    endTurn(g);
    const atk = give(g, 1, 'GEN-002', 'mzone');
    act(g, 1, { type: 'phase', to: 'battle' });
    passAll(g);
    act(g, 1, { type: 'attack', uid: atk, target: null });
    expect(g.pending.kind).toBe('response');
    expect(g.pending.kind === 'response' && g.pending.player).toBe(0);
    act(g, 0, { type: 'activate', uid: trapUid, effectIdx: 0 });
    passAll(g);
    expect(g.players[0].lp).toBe(8000);
    expect(g.cards[trapUid].zone).toBe('gy');
    expect(g.phase).toBe('main2');
  });
});

describe('chains and effects', () => {
  it('counter traps negate spells', () => {
    const g = newGame();
    const seal = give(g, 1, 'GEN-T06', 'szone', { faceUp: false });
    const target = give(g, 1, 'GEN-002', 'mzone');
    endTurn(g);
    endTurn(g);
    const bolt = give(g, 0, 'GEN-S03');
    act(g, 0, { type: 'activate', uid: bolt, effectIdx: 0, targets: [target] });
    expect(g.pending.kind).toBe('response');
    act(g, 1, { type: 'activate', uid: seal, effectIdx: 0 });
    passAll(g);
    expect(g.cards[target].zone).toBe('mzone');
    expect(g.cards[bolt].zone).toBe('gy');
    expect(g.players[1].lp).toBe(6500);
  });

  it('optional triggers prompt and search the deck', () => {
    const g = newGame();
    const drake = give(g, 0, 'EMB-003', 'deck');
    const hatch = give(g, 0, 'EMB-001', 'mzone');
    const bolt = give(g, 0, 'GEN-S08');
    act(g, 0, { type: 'activate', uid: bolt, effectIdx: 0 });
    passAll(g);
    expect(g.cards[hatch].zone).toBe('gy');
    expect(g.pending.kind).toBe('prompt');
    act(g, 0, { type: 'answer', choice: true });
    expect(g.pending.kind === 'prompt' && g.pending.prompt.kind).toBe('selectCards');
    act(g, 0, { type: 'answer', choice: [drake] });
    passAll(g);
    expect(g.cards[drake].zone).toBe('hand');
  });

  it('fusion summons from hand', () => {
    const g = newGame();
    const fusion = give(g, 0, 'EMB-F01', 'extra');
    const drake = give(g, 0, 'EMB-003');
    const imp = give(g, 0, 'GEN-006');
    const spellUid = give(g, 0, 'GEN-S01');
    act(g, 0, { type: 'activate', uid: spellUid, effectIdx: 0 });
    passAll(g);
    act(g, 0, { type: 'answer', choice: [fusion] });
    act(g, 0, { type: 'answer', choice: [drake, imp] });
    passAll(g);
    expect(g.cards[fusion].zone).toBe('mzone');
    expect(g.cards[drake].zone).toBe('gy');
    expect(g.cards[imp].zone).toBe('gy');
  });

  it('equip spells boost ATK and are destroyed with their monster', () => {
    const g = newGame();
    const m = give(g, 0, 'GEN-002', 'mzone');
    const banner = give(g, 0, 'GEN-S06');
    act(g, 0, { type: 'activate', uid: banner, effectIdx: 0, targets: [m] });
    passAll(g);
    expect(getAtk(g, m)).toBe(2400);
    const quake = give(g, 0, 'GEN-S08');
    act(g, 0, { type: 'activate', uid: quake, effectIdx: 0 });
    passAll(g);
    expect(g.cards[m].zone).toBe('gy');
    expect(g.cards[banner].zone).toBe('gy');
  });

  it('field spells apply auras', () => {
    const g = newGame();
    const m = give(g, 0, 'GEN-006', 'mzone');
    const field = give(g, 0, 'EMB-008');
    act(g, 0, { type: 'activate', uid: field, effectIdx: 0 });
    passAll(g);
    expect(g.cards[field].zone).toBe('fzone');
    expect(getAtk(g, m)).toBe(1500);
  });
});

describe('game end', () => {
  it('a player who cannot draw loses', () => {
    const g = newGame();
    g.players[1].deck = [];
    endTurn(g);
    expect(g.winner).toBe(0);
    expect(g.winReason).toBe('deckout');
  });

  it('enforces the hand size limit', () => {
    const g = newGame();
    give(g, 0, 'GEN-001');
    give(g, 0, 'GEN-001');
    expect(g.players[0].hand).toHaveLength(7);
    act(g, 0, { type: 'phase', to: 'end' });
    passAll(g);
    expect(g.pending.kind).toBe('prompt');
    act(g, 0, { type: 'answer', choice: [g.players[0].hand[0]] });
    expect(g.players[0].hand).toHaveLength(6);
    expect(g.turnPlayer).toBe(1);
  });
});

describe('views', () => {
  it('hides the opponent hand and face-down cards', () => {
    const g = newGame();
    const set = give(g, 0, 'GEN-T01', 'szone', { faceUp: false });
    const v = getView(g, 1);
    expect(v.players[0].hand.every((c) => c.defId === null)).toBe(true);
    expect(v.players[1].hand.every((c) => c.defId !== null)).toBe(true);
    expect(v.players[0].szone.find((c) => c?.uid === set)?.defId).toBeNull();
    expect(getView(g, 0).players[0].szone.find((c) => c?.uid === set)?.defId).toBe('GEN-T01');
    expect(JSON.stringify(v)).not.toContain('"deck"');
  });
});

describe('fuzz: random legal play', () => {
  it('plays hundreds of random games between starter decks without errors', () => {
    let finished = 0;
    for (let i = 0; i < 160; i++) {
      const a = STARTER_DECKS[i % STARTER_DECKS.length];
      const b = STARTER_DECKS[(i * 3 + 1) % STARTER_DECKS.length];
      const g = createGame({ decks: [a.deck, b.deck], names: ['A', 'B'], seed: 1000 + i });
      const rand = mulberry(i + 7);
      for (let step = 0; step < 3000 && g.winner === null; step++) {
        const d = randomDecision(g, rand);
        if (!d) throw new Error(`stuck at step ${step}: ${JSON.stringify(g.pending)}`);
        const r = applyAction(g, d.player, d.action);
        if (!r.ok) throw new Error(`illegal generated action ${JSON.stringify(d.action)}: ${r.error}`);
        // invariants
        for (const p of [0, 1] as const) {
          const ps = g.players[p];
          const all = [...ps.deck, ...ps.hand, ...ps.gy, ...ps.banished, ...ps.extra];
          for (const u of all) expect(g.cards[u].owner).toBe(p);
          for (const u of ps.mzone) if (u) expect(g.cards[u].zone).toBe('mzone');
        }
      }
      if (g.winner !== null) finished++;
      // structured clone must work at every point (bots rely on it)
      structuredClone(g);
    }
    expect(finished).toBeGreaterThan(100);
  }, 120_000);
});
