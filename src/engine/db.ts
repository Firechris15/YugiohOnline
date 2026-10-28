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

export function isExtraDeckCard(d: CardDef): boolean {
  return d.kind === 'monster' && d.frame === 'fusion';
}
