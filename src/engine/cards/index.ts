import { registerCards, hasDef } from '../db';
import { GENERIC_CARDS } from './generic';
import { ARCHETYPE_CARDS } from './archetypes';

let registered = false;

/** Registers the full DuelForge card pool (idempotent). */
export function ensureCardsRegistered(): void {
  if (registered || hasDef('GEN-001')) {
    registered = true;
    return;
  }
  registerCards([...GENERIC_CARDS, ...ARCHETYPE_CARDS]);
  registered = true;
}

ensureCardsRegistered();

export interface ArchetypeInfo {
  id: string;
  name: { en: string; de: string };
  color: string;
  attribute: string;
  description: { en: string; de: string };
}

export const ARCHETYPES: ArchetypeInfo[] = [
  {
    id: 'emberwing',
    name: { en: 'Emberwing', de: 'Glutschwinge' },
    color: '#ff6b35',
    attribute: 'FIRE',
    description: {
      en: "Aggressive FIRE dragons that burn your opponent's Life Points with every hit.",
      de: 'Aggressive FEUER-Drachen, die mit jedem Treffer die Lebenspunkte des Gegners verbrennen.',
    },
  },
  {
    id: 'tidecaller',
    name: { en: 'Tidecaller', de: 'Gezeitenrufer' },
    color: '#3fa7ff',
    attribute: 'WATER',
    description: {
      en: 'WATER control: bounce threats back to the hand and out-draw your rival.',
      de: 'WASSER-Kontrolle: Schicke Bedrohungen auf die Hand zurück und ziehe mehr Karten als dein Rivale.',
    },
  },
  {
    id: 'ironclad',
    name: { en: 'Ironclad', de: 'Eisenpanzer' },
    color: '#9aa5b1',
    attribute: 'EARTH',
    description: {
      en: 'EARTH machines with towering stats, piercing lances and an iron defense.',
      de: 'ERDE-Maschinen mit gewaltigen Werten, durchschlagenden Lanzen und eiserner Verteidigung.',
    },
  },
  {
    id: 'gloomveil',
    name: { en: 'Gloomveil', de: 'Düsterschleier' },
    color: '#9b5de5',
    attribute: 'DARK',
    description: {
      en: 'DARK undead that rise from the graveyard again and again.',
      de: 'FINSTERNIS-Untote, die sich immer wieder aus dem Friedhof erheben.',
    },
  },
  {
    id: 'lumina',
    name: { en: 'Lumina', de: 'Lumina' },
    color: '#ffd166',
    attribute: 'LIGHT',
    description: {
      en: 'LIGHT fairies that heal, protect, and outlast any assault.',
      de: 'LICHT-Feen, die heilen, schützen und jedem Angriff standhalten.',
    },
  },
  {
    id: 'galeblade',
    name: { en: 'Galeblade', de: 'Sturmklinge' },
    color: '#4ee6a6',
    attribute: 'WIND',
    description: {
      en: 'WIND warriors that swarm the field and strike from every direction.',
      de: 'WIND-Krieger, die das Feld fluten und aus jeder Richtung zuschlagen.',
    },
  },
  {
    id: 'thornwild',
    name: { en: 'Thornwild', de: 'Dornwild' },
    color: '#74c365',
    attribute: 'EARTH',
    description: {
      en: 'EARTH beasts and plants that grow an army of seedlings.',
      de: 'ERDE-Bestien und -Pflanzen, die eine Armee von Setzlingen heranwachsen lassen.',
    },
  },
  {
    id: 'astral',
    name: { en: 'Astral', de: 'Astral' },
    color: '#c77dff',
    attribute: 'LIGHT',
    description: {
      en: 'Spellcasters that fuel their fusions with an ever-growing library of spells.',
      de: 'Hexer, die ihre Fusionen mit einer stetig wachsenden Bibliothek an Zaubern befeuern.',
    },
  },
];

export const ARCHETYPE_BY_ID: Record<string, ArchetypeInfo> = Object.fromEntries(ARCHETYPES.map((a) => [a.id, a]));
