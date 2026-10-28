// Starter decks, deck validation, deck codes and archetype detection.
import './cards';
import { getDef, hasDef, isExtraDeckCard } from './db';
import type { DeckList } from './types';

type Counts = Record<string, number>;

const expand = (c: Counts): string[] => Object.entries(c).flatMap(([id, n]) => Array<string>(n).fill(id));

export interface StarterDeck {
  id: string;
  archetype: string;
  name: { en: string; de: string };
  deck: DeckList;
}

const starter = (id: string, archetype: string, en: string, de: string, main: Counts, extra: Counts): StarterDeck => ({
  id,
  archetype,
  name: { en, de },
  deck: { main: expand(main), extra: expand(extra) },
});

export const STARTER_DECKS: StarterDeck[] = [
  starter(
    'starter-emberwing',
    'emberwing',
    'Emberwing Inferno',
    'Glutschwingen-Inferno',
    {
      'EMB-001': 3, 'EMB-002': 3, 'EMB-003': 3, 'EMB-004': 3, 'EMB-005': 2, 'EMB-006': 2,
      'GEN-006': 2, 'GEN-008': 1, 'GEN-002': 2,
      'EMB-007': 3, 'EMB-008': 2, 'GEN-S01': 2, 'GEN-S02': 1, 'GEN-S03': 1, 'GEN-S05': 1, 'GEN-S09': 2, 'GEN-S12': 1,
      'EMB-009': 3, 'GEN-T01': 1, 'GEN-T03': 1, 'GEN-T04': 1,
    },
    { 'EMB-F01': 2 },
  ),
  starter(
    'starter-tidecaller',
    'tidecaller',
    'Tidecaller Currents',
    'Gezeitenrufer-Strömung',
    {
      'TID-001': 3, 'TID-002': 3, 'TID-003': 3, 'TID-004': 2, 'TID-005': 2, 'TID-006': 2,
      'GEN-004': 3, 'GEN-009': 1,
      'TID-007': 3, 'TID-008': 2, 'GEN-S01': 2, 'GEN-S02': 1, 'GEN-S03': 1, 'GEN-S04': 2, 'GEN-S05': 1, 'GEN-S10': 1,
      'TID-009': 3, 'GEN-T01': 1, 'GEN-T03': 1, 'GEN-T06': 1, 'GEN-T02': 2,
    },
    { 'TID-F01': 2 },
  ),
  starter(
    'starter-ironclad',
    'ironclad',
    'Ironclad Fortress',
    'Eisenpanzer-Festung',
    {
      'IRN-001': 3, 'IRN-002': 2, 'IRN-003': 3, 'IRN-004': 3, 'IRN-005': 2, 'IRN-006': 2,
      'GEN-003': 3, 'GEN-010': 1, 'GEN-001': 2,
      'IRN-007': 2, 'IRN-008': 2, 'GEN-S01': 2, 'GEN-S02': 1, 'GEN-S03': 1, 'GEN-S05': 1, 'GEN-S06': 2, 'GEN-S10': 1,
      'IRN-009': 2, 'GEN-T01': 1, 'GEN-T03': 1, 'GEN-T04': 1, 'GEN-T05': 2,
    },
    { 'IRN-F01': 3 },
  ),
  starter(
    'starter-gloomveil',
    'gloomveil',
    'Gloomveil Crypt',
    'Düsterschleier-Gruft',
    {
      'GLM-001': 3, 'GLM-002': 3, 'GLM-003': 3, 'GLM-004': 3, 'GLM-005': 2, 'GLM-006': 2,
      'GEN-002': 2, 'GEN-009': 2,
      'GLM-007': 3, 'GLM-008': 2, 'GEN-S01': 2, 'GEN-S02': 1, 'GEN-S03': 1, 'GEN-S05': 1, 'GEN-S13': 2,
      'GLM-009': 3, 'GEN-T01': 1, 'GEN-T03': 1, 'GEN-T05': 2, 'GEN-T04': 1,
    },
    { 'GLM-F01': 2 },
  ),
  starter(
    'starter-lumina',
    'lumina',
    'Lumina Radiance',
    'Lumina-Glanz',
    {
      'LUM-001': 3, 'LUM-002': 3, 'LUM-003': 3, 'LUM-004': 3, 'LUM-005': 2, 'LUM-006': 2,
      'GEN-007': 3,
      'LUM-007': 3, 'LUM-008': 2, 'GEN-S07': 2, 'GEN-S01': 2, 'GEN-S02': 1, 'GEN-S03': 1, 'GEN-S05': 1, 'GEN-S11': 1,
      'LUM-009': 3, 'GEN-T07': 2, 'GEN-T01': 1, 'GEN-T03': 1, 'GEN-T06': 1,
    },
    { 'LUM-F01': 2 },
  ),
  starter(
    'starter-galeblade',
    'galeblade',
    'Galeblade Tempest',
    'Sturmklingen-Orkan',
    {
      'GAL-001': 3, 'GAL-002': 3, 'GAL-003': 3, 'GAL-004': 3, 'GAL-005': 2, 'GAL-006': 3,
      'GEN-005': 2, 'GEN-007': 2,
      'GAL-007': 2, 'GAL-008': 2, 'GEN-S01': 2, 'GEN-S02': 1, 'GEN-S03': 1, 'GEN-S05': 1, 'GEN-S12': 2, 'GEN-S04': 1,
      'GAL-009': 3, 'GEN-T01': 1, 'GEN-T03': 1, 'GEN-T04': 2,
    },
    { 'GAL-F01': 2 },
  ),
  starter(
    'starter-thornwild',
    'thornwild',
    'Thornwild Overgrowth',
    'Dornwild-Dickicht',
    {
      'THN-001': 3, 'THN-002': 3, 'THN-003': 3, 'THN-004': 3, 'THN-005': 2, 'THN-006': 3,
      'GEN-001': 2, 'GEN-002': 1,
      'THN-007': 3, 'THN-008': 2, 'GEN-S01': 2, 'GEN-S02': 1, 'GEN-S03': 1, 'GEN-S05': 1, 'GEN-S06': 2,
      'THN-009': 3, 'GEN-T01': 1, 'GEN-T03': 1, 'GEN-T02': 2, 'GEN-T05': 1,
    },
    { 'THN-F01': 3 },
  ),
  starter(
    'starter-astral',
    'astral',
    'Astral Grimoire',
    'Astrales Grimoire',
    {
      'AST-001': 3, 'AST-002': 3, 'AST-003': 3, 'AST-004': 3, 'AST-005': 2, 'AST-006': 2,
      'GEN-009': 2,
      'AST-007': 3, 'AST-008': 2, 'GEN-S01': 2, 'GEN-S02': 1, 'GEN-S03': 1, 'GEN-S05': 1, 'GEN-S13': 2, 'GEN-S10': 1, 'GEN-S04': 1,
      'AST-009': 3, 'GEN-T01': 1, 'GEN-T03': 1, 'GEN-T06': 1, 'GEN-T04': 2,
    },
    { 'AST-F01': 2, 'AST-F02': 2 },
  ),
];

export const STARTER_BY_ID: Record<string, StarterDeck> = Object.fromEntries(STARTER_DECKS.map((d) => [d.id, d]));

export const DECK_RULES = { mainMin: 40, mainMax: 60, extraMax: 15, copies: 3 };

export interface DeckIssue {
  key: string;
  params?: Record<string, string | number>;
}

export function validateDeck(deck: DeckList): DeckIssue[] {
  const issues: DeckIssue[] = [];
  if (deck.main.length < DECK_RULES.mainMin) issues.push({ key: 'deck.tooSmall', params: { n: deck.main.length, min: DECK_RULES.mainMin } });
  if (deck.main.length > DECK_RULES.mainMax) issues.push({ key: 'deck.tooLarge', params: { n: deck.main.length, max: DECK_RULES.mainMax } });
  if (deck.extra.length > DECK_RULES.extraMax) issues.push({ key: 'deck.extraTooLarge', params: { n: deck.extra.length, max: DECK_RULES.extraMax } });
  const counts: Record<string, number> = {};
  for (const id of [...deck.main, ...deck.extra]) {
    if (!hasDef(id)) {
      issues.push({ key: 'deck.unknownCard', params: { id } });
      continue;
    }
    counts[id] = (counts[id] ?? 0) + 1;
  }
  for (const id of deck.main) {
    if (hasDef(id) && (isExtraDeckCard(getDef(id)) || getDef(id).token)) {
      issues.push({ key: 'deck.wrongZone', params: { id } });
      break;
    }
  }
  for (const id of deck.extra) {
    if (hasDef(id) && !isExtraDeckCard(getDef(id))) {
      issues.push({ key: 'deck.wrongZone', params: { id } });
      break;
    }
  }
  for (const [id, n] of Object.entries(counts)) {
    const limit = getDef(id).limit ?? DECK_RULES.copies;
    if (n > limit) issues.push({ key: 'deck.tooManyCopies', params: { id, n, limit } });
  }
  return issues;
}

export function isDeckLegal(deck: DeckList): boolean {
  return validateDeck(deck).length === 0;
}

// ----------------------------------------------------------------- deck codes

const toCounts = (ids: string[]) => {
  const out: Counts = {};
  for (const id of ids) out[id] = (out[id] ?? 0) + 1;
  return out;
};

const b64encode = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const b64decode = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

export function encodeDeck(deck: DeckList): string {
  const part = (ids: string[]) =>
    Object.entries(toCounts(ids))
      .map(([id, n]) => (n > 1 ? `${id}*${n}` : id))
      .join(',');
  return `DF1.${b64encode(`${part(deck.main)}|${part(deck.extra)}`)}`;
}

export function decodeDeck(code: string): DeckList | null {
  try {
    const trimmed = code.trim();
    if (!trimmed.startsWith('DF1.')) return null;
    const [main, extra = ''] = b64decode(trimmed.slice(4)).split('|');
    const parse = (s: string) =>
      s
        .split(',')
        .filter(Boolean)
        .flatMap((tok) => {
          const [id, n] = tok.split('*');
          const count = Math.min(Number(n ?? 1) || 1, 60);
          return hasDef(id) ? Array<string>(count).fill(id) : [];
        });
    return { main: parse(main), extra: parse(extra) };
  } catch {
    return null;
  }
}

// ----------------------------------------------------------- archetype detect

export function detectArchetype(deck: DeckList): string {
  const counts: Record<string, number> = {};
  for (const id of [...deck.main, ...deck.extra]) {
    if (!hasDef(id)) continue;
    const a = getDef(id).archetype;
    if (a) counts[a] = (counts[a] ?? 0) + 1;
  }
  let best = 'mixed';
  let bestN = 7;
  for (const [a, n] of Object.entries(counts)) {
    if (n > bestN) {
      best = a;
      bestN = n;
    }
  }
  return best;
}

export function sortDeckIds(ids: string[]): string[] {
  const order = (id: string) => {
    const d = getDef(id);
    const k = d.kind === 'monster' ? 0 : d.kind === 'spell' ? 1 : 2;
    return [k, -(d.level ?? 0), d.name.en] as const;
  };
  return [...ids].sort((a, b) => {
    const [ka, la, na] = order(a);
    const [kb, lb, nb] = order(b);
    return ka - kb || la - lb || na.localeCompare(nb);
  });
}
