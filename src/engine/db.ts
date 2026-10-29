import type { CardDef } from './types';

// Central card registry. Card sets register themselves via registerCards().
const REGISTRY: Record<string, CardDef> = {};
const ORDER: string[] = [];

export function registerCards(defs: CardDef[]): void {
  for (const d of defs) {
    if (REGISTRY[d.id]) throw new Error(`Duplicate card id ${d.id}`);
    REGISTRY[d.id] = d;
    ORDER.push(d.id);
  }
}

export function getDef(id: string): CardDef {
  const d = REGISTRY[id];
  if (!d) throw new Error(`Unknown card ${id}`);
  return d;
}

export function hasDef(id: string): boolean {
  return id in REGISTRY;
}

export function allCards(includeTokens = false): CardDef[] {
  return ORDER.map((id) => REGISTRY[id]).filter((d) => !d.system && (includeTokens || !d.token));
}

const EXTRA_FRAMES = new Set(['fusion', 'synchro', 'xyz', 'link']);

export function isExtraDeckCard(d: CardDef): boolean {
  return d.kind === 'monster' && !!d.frame && EXTRA_FRAMES.has(d.frame);
}

/** Monsters that can never be Normal Summoned or Set (Extra Deck, Ritual, tokens). */
export function isSummonRestricted(d: CardDef): boolean {
  return isExtraDeckCard(d) || d.frame === 'ritual' || !!d.token;
}

/** Remove registered cards (used when real card data is reloaded). */
export function unregisterWhere(pred: (d: CardDef) => boolean): void {
  for (let i = ORDER.length - 1; i >= 0; i--) {
    const d = REGISTRY[ORDER[i]];
    if (pred(d)) {
      delete REGISTRY[ORDER[i]];
      ORDER.splice(i, 1);
    }
  }
}
