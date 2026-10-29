import { create } from 'zustand';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

interface ConfirmRequest {
  text: string;
  resolve: (ok: boolean) => void;
}

interface UiState {
  confirm: ConfirmRequest | null;
  toasts: Toast[];
  toast: (text: string, kind?: Toast['kind']) => void;
  dismiss: (id: number) => void;
}

let counter = 0;

export const useUi = create<UiState>()((set, get) => ({
  confirm: null,
  toasts: [],
  toast: (text, kind = 'info') => {
    const id = ++counter;
    set({ toasts: [...get().toasts.slice(-3), { id, text, kind }] });
    setTimeout(() => get().dismiss(id), 2800);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (text: string, kind?: Toast['kind']) => useUi.getState().toast(text, kind);

/** In-page replacement for window.confirm (which is blocked in embedded viewers). */
export function askConfirm(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    useUi.getState().confirm?.resolve(false);
    useUi.setState({ confirm: { text, resolve } });
  });
}

export function answerConfirm(ok: boolean): void {
  const c = useUi.getState().confirm;
  useUi.setState({ confirm: null });
  c?.resolve(ok);
}
