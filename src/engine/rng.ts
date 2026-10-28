import type { GameState } from './types';

// Mulberry32 – tiny, fast and fully serializable (state is a single uint32).
export function nextRandom(g: GameState): number {
  let t = (g.rng = (g.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(g: GameState, max: number): number {
  return Math.floor(nextRandom(g) * max);
}

export function shuffleInPlace<T>(g: GameState, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(g, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function randomSeed(): number {
  return (Math.random() * 4294967296) >>> 0;
}
