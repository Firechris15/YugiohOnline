import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface MatchEntry {
  id: string;
  at: number;
  mode: 'bot' | 'online';
  opponent: string;
  myDeck: string;
  myArchetype: string;
  oppArchetype?: string;
  result: 'win' | 'loss' | 'draw';
  turns: number;
  lp: number;
  level?: string;
}

interface HistoryState {
  matches: MatchEntry[];
  add: (m: Omit<MatchEntry, 'id' | 'at'>) => void;
  clear: () => void;
}

export const useHistory = create<HistoryState>()(
  persist(
    (set) => ({
      matches: [],
      add: (m) => set((s) => ({ matches: [{ ...m, id: Math.random().toString(36).slice(2), at: Date.now() }, ...s.matches].slice(0, 200) })),
      clear: () => set({ matches: [] }),
    }),
    { name: 'duelforge.history' },
  ),
);
