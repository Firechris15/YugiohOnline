// Helpers shared by engine tests, the simulator and bots: random legal play.
import type { Action, ActionOption, GameState, PlayerId } from './types';
import { getOptions } from './options';

export type Rand = () => number;

export function mulberry(seed: number): Rand {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickN<T>(rand: Rand, arr: T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

/** Fill in random choices for an option's requirements. */
export function completeOption(opt: ActionOption, rand: Rand): Action {
  const a = { ...opt.action } as Action & { tributes?: string[]; targets?: string[]; costs?: string[] };
  for (const r of opt.requirements) {
    if (r.kind === 'tributes') a.tributes = pickN(rand, r.options, r.count);
    else if (r.kind === 'costs') a.costs = pickN(rand, r.options, r.count);
    else {
      const n = r.min + Math.floor(rand() * (Math.min(r.max, r.options.length) - r.min + 1));
      a.targets = pickN(rand, r.options, n);
    }
  }
  return a;
}

export function randomDecision(g: GameState, rand: Rand): { player: PlayerId; action: Action } | null {
  const pend = g.pending;
  if (pend.kind === 'none' || g.winner !== null) return null;
  const player = pend.player;
  if (pend.kind === 'prompt') {
    const p = pend.prompt;
    switch (p.kind) {
      case 'selectCards': {
        const min = p.min ?? 0;
        const max = Math.min(p.max ?? 1, p.options?.length ?? 0);
        const n = min + Math.floor(rand() * (max - min + 1));
        return { player, action: { type: 'answer', choice: pickN(rand, p.options ?? [], n) } };
      }
      case 'yesNo':
        return { player, action: { type: 'answer', choice: rand() < 0.7 } };
      case 'position':
        return { player, action: { type: 'answer', choice: rand() < 0.5 ? 'atk' : 'def' } };
      case 'option':
        return { player, action: { type: 'answer', choice: Math.floor(rand() * (p.labels?.length ?? 1)) } };
    }
  }
  const opts = getOptions(g, player);
  // Prefer doing things over ending the turn so random games progress.
  const nonPhase = opts.filter((o) => o.action.type !== 'phase' && o.action.type !== 'pass');
  const pool = nonPhase.length && rand() < 0.75 ? nonPhase : opts;
  const opt = pool[Math.floor(rand() * pool.length)];
  return { player, action: completeOption(opt, rand) };
}
