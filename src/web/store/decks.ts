import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { REAL_STARTERS, STARTER_DECKS, STARTER_BY_ID, REAL_STARTER_BY_ID, deckPool, detectArchetype, resolveRealStarter, type DeckFormat, type DeckList } from '../../engine';

export interface UserDeck {
  id: string;
  name: string;
  main: string[];
  extra: string[];
  createdAt: number;
  updatedAt: number;
  /** format the deck is built for (real cards); demo decks always use "demo" */
  format?: DeckFormat;
}

/** Format a deck is checked against in the builder. */
export function deckFormat(d: { main: string[]; extra: string[]; format?: DeckFormat }): DeckFormat {
  if (!d.main.length && !d.extra.length) return d.format ?? 'tcg';
  if (deckPool(d) === 'demo') return 'demo';
  return d.format && d.format !== 'demo' ? d.format : 'tcg';
}

/** Card pool of a deck (empty decks remember it through their format). */
export function deckPoolOf(d: { main: string[]; extra: string[]; format?: DeckFormat }): 'real' | 'demo' {
  if (!d.main.length && !d.extra.length) return d.format === 'demo' ? 'demo' : 'real';
  return deckPool(d);
}

interface DeckState {
  decks: UserDeck[];
  lastUsed: string | null;
  create: (name: string, list?: DeckList, format?: DeckFormat) => UserDeck;
  update: (id: string, patch: Partial<Pick<UserDeck, 'name' | 'main' | 'extra' | 'format'>>) => void;
  remove: (id: string) => void;
  duplicate: (id: string, name: string) => UserDeck | null;
  setLastUsed: (id: string) => void;
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const useDecks = create<DeckState>()(
  persist(
    (set, get) => ({
      decks: [],
      lastUsed: null,
      create: (name, list, format) => {
        const now = Date.now();
        const deck: UserDeck = { id: uid(), name, main: [...(list?.main ?? [])], extra: [...(list?.extra ?? [])], createdAt: now, updatedAt: now, format };
        set((s) => ({ decks: [deck, ...s.decks] }));
        return deck;
      },
      update: (id, patch) => set((s) => ({ decks: s.decks.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d)) })),
      remove: (id) => set((s) => ({ decks: s.decks.filter((d) => d.id !== id), lastUsed: s.lastUsed === id ? null : s.lastUsed })),
      duplicate: (id, name) => {
        const d = get().decks.find((x) => x.id === id);
        if (!d) return null;
        return get().create(name, d, d.format);
      },
      setLastUsed: (id) => set({ lastUsed: id }),
    }),
    { name: 'duelforge.decks' },
  ),
);

/** A deck the player can pick for a duel: one of their own decks or a starter deck. */
export interface DeckChoice {
  id: string;
  name: string;
  list: DeckList;
  archetype: string;
  starter: boolean;
  pool: 'real' | 'demo';
  format: DeckFormat;
}

/** Real starter decks (only once the real card database is loaded). */
export function realStarterChoices(lang: 'de' | 'en'): DeckChoice[] {
  const out: DeckChoice[] = [];
  for (const s of REAL_STARTERS) {
    const list = resolveRealStarter(s);
    if (list) out.push({ id: s.id, name: s.name[lang], list, archetype: s.id, starter: true, pool: 'real', format: 'auto' });
  }
  return out;
}

export function deckChoices(decks: UserDeck[], lang: 'de' | 'en', pool?: 'real' | 'demo'): DeckChoice[] {
  const all: DeckChoice[] = [
    ...decks.map((d) => ({ id: d.id, name: d.name, list: { main: d.main, extra: d.extra }, archetype: detectArchetype(d), starter: false, pool: deckPoolOf(d), format: deckFormat(d) })),
    ...realStarterChoices(lang),
    ...STARTER_DECKS.map((s) => ({ id: s.id, name: s.name[lang], list: s.deck, archetype: s.archetype, starter: true, pool: 'demo' as const, format: 'demo' as const })),
  ];
  return pool ? all.filter((c) => c.pool === pool) : all;
}

export function findDeckChoice(id: string | null, decks: UserDeck[], lang: 'de' | 'en'): DeckChoice | undefined {
  if (!id) return undefined;
  if (STARTER_BY_ID[id] || REAL_STARTER_BY_ID[id]) return deckChoices([], lang).find((c) => c.id === id);
  return deckChoices(decks, lang).find((c) => c.id === id);
}
