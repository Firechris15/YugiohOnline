import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STARTER_DECKS, STARTER_BY_ID, detectArchetype, type DeckList } from '../../engine';

export interface UserDeck {
  id: string;
  name: string;
  main: string[];
  extra: string[];
  createdAt: number;
  updatedAt: number;
}

interface DeckState {
  decks: UserDeck[];
  lastUsed: string | null;
  create: (name: string, list?: DeckList) => UserDeck;
  update: (id: string, patch: Partial<Pick<UserDeck, 'name' | 'main' | 'extra'>>) => void;
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
      create: (name, list) => {
        const now = Date.now();
        const deck: UserDeck = { id: uid(), name, main: [...(list?.main ?? [])], extra: [...(list?.extra ?? [])], createdAt: now, updatedAt: now };
        set((s) => ({ decks: [deck, ...s.decks] }));
        return deck;
      },
      update: (id, patch) => set((s) => ({ decks: s.decks.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d)) })),
      remove: (id) => set((s) => ({ decks: s.decks.filter((d) => d.id !== id), lastUsed: s.lastUsed === id ? null : s.lastUsed })),
      duplicate: (id, name) => {
        const d = get().decks.find((x) => x.id === id);
        if (!d) return null;
        return get().create(name, d);
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
}

export function deckChoices(decks: UserDeck[], lang: 'de' | 'en'): DeckChoice[] {
  return [
    ...decks.map((d) => ({ id: d.id, name: d.name, list: { main: d.main, extra: d.extra }, archetype: detectArchetype(d), starter: false })),
    ...STARTER_DECKS.map((s) => ({ id: s.id, name: s.name[lang], list: s.deck, archetype: s.archetype, starter: true })),
  ];
}

export function findDeckChoice(id: string | null, decks: UserDeck[], lang: 'de' | 'en'): DeckChoice | undefined {
  if (!id) return undefined;
  if (STARTER_BY_ID[id]) return deckChoices([], lang).find((c) => c.id === id);
  return deckChoices(decks, lang).find((c) => c.id === id);
}
