import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Lang } from '../i18n';

export type AnimSpeed = 'slow' | 'normal' | 'fast';

interface SettingsState {
  lang: Lang;
  name: string;
  sound: boolean;
  volume: number;
  speed: AnimSpeed;
  smartPass: boolean;
  clientId: string;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

const browserLang = (): Lang => (typeof navigator !== 'undefined' && !navigator.language.toLowerCase().startsWith('de') ? 'en' : 'de');

const newClientId = () => {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return 'c' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      lang: browserLang(),
      name: '',
      sound: true,
      volume: 0.6,
      speed: 'normal',
      smartPass: true,
      clientId: newClientId(),
      set: (patch) => set(patch),
    }),
    { name: 'duelforge.settings' },
  ),
);

export const SPEED_FACTOR: Record<AnimSpeed, number> = { slow: 1.5, normal: 1, fast: 0.55 };

export function playerName(): string {
  const s = useSettings.getState();
  return s.name.trim() || (s.lang === 'de' ? 'Duellant' : 'Duelist');
}
