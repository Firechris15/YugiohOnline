import { create } from 'zustand';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

interface UiState {
  toasts: Toast[];
  toast: (text: string, kind?: Toast['kind']) => void;
  dismiss: (id: number) => void;
}

let counter = 0;

export const useUi = create<UiState>()((set, get) => ({
  toasts: [],
  toast: (text, kind = 'info') => {
    const id = ++counter;
    set({ toasts: [...get().toasts.slice(-3), { id, text, kind }] });
    setTimeout(() => get().dismiss(id), 2800);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (text: string, kind?: Toast['kind']) => useUi.getState().toast(text, kind);
