import { describe, expect, it, beforeAll } from 'vitest';
import './cards';
import { compactCards } from '../shared/ygo';
import { fixtureCards } from './real/fixture';
import { registerRealCards } from './real';
import { REAL_STARTERS, resolveRealStarter } from './real/decks';
import { applySandbox, createSandbox, sandboxView, type SbAction, type SbState, type SbZone } from './sandbox';
import { mulberry } from './testkit';
import type { PlayerId } from './types';

let decks: ReturnType<typeof resolveRealStarter>[] = [];
beforeAll(() => {
  registerRealCards(compactCards(fixtureCards()), 'fixture-sb');
  decks = REAL_STARTERS.map(resolveRealStarter);
});

const newGame = () => createSandbox({ decks: [decks[0]!, decks[1]!], names: ['A', 'B'], seed: 11, firstPlayer: 0 });
const ok = (s: SbState, p: PlayerId, a: SbAction) => {
  const r = applySandbox(s, p, a);
  if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
};

describe('free duel sandbox', () => {
  it('deals hands and hides private information', () => {
    const s = newGame();
    expect(s.players[0].hand).toHaveLength(5);
    const v1 = sandboxView(s, 1);
    expect(v1.players[0].hand.every((c) => c.defId === null)).toBe(true);
    expect(v1.players[0].deck).toEqual([]);
    expect(sandboxView(s, 0).players[0].deck).toHaveLength(s.players[0].deck.length);
  });

  it('moves cards freely, sets face-down and reveals on flip', () => {
    const s = newGame();
    const c = s.players[0].hand[0];
    ok(s, 0, { type: 'move', uid: c, to: 'mzone', faceUp: false, position: 'def' });
    expect(sandboxView(s, 1).players[0].mzone.find((x) => x?.uid === c)?.defId).toBeNull();
    ok(s, 0, { type: 'flip', uid: c });
    expect(sandboxView(s, 1).players[0].mzone.find((x) => x?.uid === c)?.defId).not.toBeNull();
    expect(applySandbox(s, 1, { type: 'flip', uid: c }).ok).toBe(false); // not their card
    ok(s, 0, { type: 'move', uid: c, to: 'gy' });
    expect(s.players[0].gy).toContain(c);
  });

  it('handles turns, automatic draws, life points and control changes', () => {
    const s = newGame();
    expect(applySandbox(s, 1, { type: 'endTurn' }).ok).toBe(false);
    ok(s, 0, { type: 'endTurn' });
    expect(s.turnPlayer).toBe(1);
    expect(s.players[1].hand).toHaveLength(6);
    const m = s.players[0].hand[0];
    ok(s, 0, { type: 'move', uid: m, to: 'mzone' });
    ok(s, 1, { type: 'control', uid: m });
    expect(s.cards[m].controller).toBe(1);
    expect(s.players[1].mzone).toContain(m);
    ok(s, 1, { type: 'lp', player: 0, delta: -8000 });
    expect(s.winner).toBe(1);
  });

  it('keeps zones consistent under random play', () => {
    for (let game = 0; game < 30; game++) {
      const s = createSandbox({ decks: [decks[game % 6]!, decks[(game + 2) % 6]!], names: ['A', 'B'], seed: 500 + game });
      const rand = mulberry(game);
      const zones: SbZone[] = ['hand', 'mzone', 'szone', 'gy', 'banished', 'deck', 'extra', 'emz', 'fzone'];
      for (let step = 0; step < 600 && s.winner === null; step++) {
        const p = (rand() < 0.5 ? 0 : 1) as PlayerId;
        const own = Object.values(s.cards).filter((c) => c.zone !== 'void' && (['mzone', 'szone', 'fzone', 'emz'].includes(c.zone) ? c.controller : c.owner) === p);
        const c = own[Math.floor(rand() * own.length)];
        const pick = Math.floor(rand() * 9);
        const action: SbAction =
          pick === 0
            ? { type: 'draw' }
            : pick === 1 && c
              ? { type: 'flip', uid: c.uid }
              : pick === 2 && c
                ? { type: 'position', uid: c.uid }
                : pick === 3
                  ? { type: 'lp', player: p, delta: -100 }
                  : pick === 4
                    ? { type: 'endTurn' }
                    : pick === 5
                      ? { type: 'token', atk: 500, def: 500 }
                      : c
                        ? { type: 'move', uid: c.uid, to: zones[Math.floor(rand() * zones.length)], faceUp: rand() < 0.5 }
                        : { type: 'shuffle' };
        applySandbox(s, p, action);
        // invariants: every live card is listed exactly once in its zone
        const listed = new Map<string, number>();
        const count = (u: string | null) => u && listed.set(u, (listed.get(u) ?? 0) + 1);
        for (const ps of s.players) {
          [...ps.deck, ...ps.hand, ...ps.gy, ...ps.banished, ...ps.extra, ...ps.mzone, ...ps.szone, ps.fzone].forEach(count);
        }
        s.emz.forEach(count);
        for (const card of Object.values(s.cards)) {
          if (card.zone === 'void') expect(listed.has(card.uid)).toBe(false);
          else expect(listed.get(card.uid), `${card.uid} in ${card.zone}`).toBe(1);
        }
      }
    }
  }, 60_000);
});
