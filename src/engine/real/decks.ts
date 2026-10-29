// Starter decks for automatic duels with real cards. Decks are stored as card
// names and resolved against the loaded card database at runtime.
import type { DeckList } from '../types';
import { getDef, hasDef } from '../db';
import { realCardByName, realId } from './index';
import { cardLimit, DECK_RULES, setRealArchetypeDetector, type DeckFormat } from '../decks';

export interface RealStarter {
  id: string;
  name: { en: string; de: string };
  description: { en: string; de: string };
  color: string;
  cover: string; // card name used as cover art
  main: [string, number][];
  extra: [string, number][];
}

export const REAL_STARTERS: RealStarter[] = [
  {
    id: 'real-dark-magician',
    name: { en: 'Master of Magicians', de: 'Meister der Magier' },
    description: { en: 'Spellcasters led by Dark Magician, backed by classic traps.', de: 'Hexer rund um den Dunklen Magier, unterstützt von klassischen Fallen.' },
    color: '#a96bff',
    cover: 'Dark Magician',
    main: [
      ['Dark Magician', 3], ['Dark Magician Girl', 2], ['Magician of Black Chaos', 1], ['Magician of Faith', 2], ['Mystical Elf', 2], ['Gemini Elf', 3],
      ['Neo the Magic Swordsman', 2], ['Ancient Elf', 2], ['Old Vindictive Magician', 2], ['Celtic Guardian', 2],
      ['Pot of Greed', 1], ['Graceful Charity', 1], ['Monster Reborn', 1], ['Dark Hole', 1], ['Book of Secret Arts', 2], ['Yami', 1], ['Black Magic Ritual', 1],
      ['Mystical Space Typhoon', 2], ['Swords of Revealing Light', 1], ['Change of Heart', 1],
      ['Mirror Force', 1], ['Magic Cylinder', 2], ['Trap Hole', 2], ['Negate Attack', 2],
    ],
    extra: [],
  },
  {
    id: 'real-blue-eyes',
    name: { en: 'White Dragon Legion', de: 'Legion des weißen Drachen' },
    description: { en: 'Big dragons, Kaibaman and Polymerization into the ultimate fusion.', de: 'Große Drachen, Kaibaman und Polymerisation bis zur ultimativen Fusion.' },
    color: '#4fb6ff',
    cover: 'Blue-Eyes White Dragon',
    main: [
      ['Blue-Eyes White Dragon', 3], ['Kaibaman', 2], ['Luster Dragon', 3], ['Alexandrite Dragon', 2], ['Vorse Raider', 2], ['Battle Ox', 2], ['Mystic Horseman', 2],
      ['La Jinn the Mystical Genie of the Lamp', 2], ['Sangan', 1], ['Cyber Dragon', 2],
      ['Polymerization', 2], ['Pot of Greed', 1], ['Graceful Charity', 1], ['Monster Reborn', 1], ['Raigeki', 1], ['Heavy Storm', 1], ['Dragon Treasure', 2], ['Mountain', 1], ['Shrink', 1],
      ['Mirror Force', 1], ['Trap Hole', 2], ['Bottomless Trap Hole', 1], ['Torrential Tribute', 1], ['Sakuretsu Armor', 2], ['Dust Tornado', 1],
    ],
    extra: [['Blue-Eyes Ultimate Dragon', 2], ['Rabid Horseman', 1]],
  },
  {
    id: 'real-red-eyes',
    name: { en: 'Fire of Red Eyes', de: 'Feuer der roten Augen' },
    description: { en: 'Aggressive beatdown with Red-Eyes, warriors and fusions.', de: 'Aggressiver Angriff mit Rotäugigem Drachen, Kriegern und Fusionen.' },
    color: '#ff6b3d',
    cover: 'Red-Eyes Black Dragon',
    main: [
      ['Red-Eyes Black Dragon', 3], ['Summoned Skull', 2], ['Axe Raider', 3], ['Dark Blade', 2], ['Flame Manipulator', 2], ['Masaki the Legendary Swordsman', 2],
      ['Hayabusa Knight', 2], ['Gyaku-Gire Panda', 1], ['Mad Dog of Darkness', 2],
      ['Polymerization', 3], ['Pot of Greed', 1], ['Monster Reborn', 1], ['Fissure', 2], ['Axe of Despair', 2], ['Rush Recklessly', 2], ['Ookazi', 1],
      ['Magic Cylinder', 2], ['Sakuretsu Armor', 2], ['Reinforcements', 2], ['Mirror Force', 1], ['Widespread Ruin', 2],
    ],
    extra: [['Black Skull Dragon', 2], ['Flame Swordsman', 2]],
  },
  {
    id: 'real-warriors',
    name: { en: 'Knights of the Realm', de: 'Ritter des Reiches' },
    description: { en: 'Warrior toolbox with Command Knight, Marauding Captain and Exiled Force.', de: 'Krieger-Werkzeugkasten mit Befehlsritter, Plünderkapitän und Exil-Truppe.' },
    color: '#e0b36a',
    cover: 'Gaia The Fierce Knight',
    main: [
      ['Command Knight', 3], ['Marauding Captain', 3], ['Exiled Force', 2], ['Blade Knight', 2], ['Celtic Guardian', 2], ['Gaia The Fierce Knight', 2], ['Curse of Dragon', 2],
      ['Axe Raider', 2], ['Dark Blade', 2],
      ['Reinforcement of the Army', 2], ['Sogen', 1], ['Legendary Sword', 2], ['Pot of Greed', 1], ['Monster Reborn', 1], ['Nobleman of Crossout', 2], ['Heavy Storm', 1], ['Polymerization', 2],
      ['Mirror Force', 1], ['Bottomless Trap Hole', 2], ['Dimensional Prison', 2], ['Compulsory Evacuation Device', 2], ['Reinforcements', 1],
    ],
    extra: [['Gaia the Dragon Champion', 2]],
  },
  {
    id: 'real-monarchs',
    name: { en: 'Monarch Control', de: 'Monarchen-Kontrolle' },
    description: { en: 'Tribute Monarchs fuelled by floaters and flip monsters.', de: 'Monarchen als Tributbeschwörung, angetrieben von Floatern und Flipp-Monstern.' },
    color: '#4ee6a6',
    cover: 'Zaborg the Thunder Monarch',
    main: [
      ['Zaborg the Thunder Monarch', 3], ['Mobius the Frost Monarch', 2], ['Raiza the Storm Monarch', 2], ['Granmarg the Rock Monarch', 1], ['Sangan', 1],
      ['Witch of the Black Forest', 1], ['Mystic Tomato', 3], ['Giant Rat', 2], ['Man-Eater Bug', 2], ['Hane-Hane', 2], ['Morphing Jar', 1],
      ['Pot of Greed', 1], ['Graceful Charity', 1], ['Monster Reborn', 1], ['Brain Control', 1], ['Change of Heart', 1], ['Scapegoat', 2], ['Smashing Ground', 2],
      ['Mystical Space Typhoon', 2], ['Upstart Goblin', 2],
      ['Torrential Tribute', 1], ['Mirror Force', 1], ['Sakuretsu Armor', 2], ['Dust Tornado', 1], ['Seven Tools of the Bandit', 1], ['Magic Jammer', 1],
    ],
    extra: [],
  },
  {
    id: 'real-exodia',
    name: { en: 'The Forbidden One', de: 'Der Verbotene' },
    description: { en: 'Stall the duel and draw all five pieces of Exodia.', de: 'Halte den Gegner auf und ziehe alle fünf Teile von Exodia.' },
    color: '#ffd166',
    cover: 'Exodia the Forbidden One',
    main: [
      ['Exodia the Forbidden One', 1], ['Right Arm of the Forbidden One', 1], ['Left Arm of the Forbidden One', 1], ['Right Leg of the Forbidden One', 1],
      ['Left Leg of the Forbidden One', 1], ['Giant Soldier of Stone', 3], ['Mystical Elf', 3], ['Magician of Faith', 2], ['Morphing Jar', 1], ['Sangan', 1],
      ['Witch of the Black Forest', 1], ['Dekoichi the Battlechanted Locomotive', 2], ['Penguin Soldier', 2],
      ['Pot of Greed', 1], ['Graceful Charity', 1], ['Upstart Goblin', 3], ['Card Destruction', 1], ['Swords of Revealing Light', 1], ['Scapegoat', 2],
      ['Dian Keto the Cure Master', 2], ['Red Medicine', 2],
      ['Negate Attack', 2], ['Magic Cylinder', 2], ['Castle Walls', 2], ['Mirror Force', 1],
    ],
    extra: [],
  },
];

// Simple Normal Monsters used to fill decks when a card is limited or missing.
const FILLERS = ['Giant Soldier of Stone', 'Celtic Guardian', 'Battle Ox', 'Feral Imp', 'Beaver Warrior', 'Mystical Elf', 'Luster Dragon', 'Axe Raider', 'Hitotsu-Me Giant'];

const FORMAT: DeckFormat = 'auto';

/** Resolve a starter against the loaded card data (respecting the automatic format's banlist). */
export function resolveRealStarter(s: RealStarter): DeckList | null {
  const main: string[] = [];
  const extra: string[] = [];
  const add = (list: string[], name: string, n: number) => {
    const c = realCardByName(name);
    if (!c) return;
    const id = realId(c.id);
    if (!hasDef(id) || !getDef(id).auto) return;
    const allowed = Math.min(n, cardLimit(getDef(id), FORMAT) - [...main, ...extra].filter((x) => x === id).length);
    for (let i = 0; i < allowed; i++) list.push(id);
  };
  for (const [name, n] of s.main) add(main, name, n);
  for (const [name, n] of s.extra) add(extra, name, n);
  for (const f of FILLERS) {
    if (main.length >= DECK_RULES.mainMin) break;
    add(main, f, Math.min(3, DECK_RULES.mainMin - main.length));
  }
  if (main.length < DECK_RULES.mainMin) return null;
  return { main, extra };
}

export function realStarterCover(s: RealStarter): string | null {
  const c = realCardByName(s.cover);
  return c ? realId(c.id) : null;
}

export const REAL_STARTER_BY_ID: Record<string, RealStarter> = Object.fromEntries(REAL_STARTERS.map((s) => [s.id, s]));

/**
 * Archetype label of a real deck: the starter deck it is built from (60 %+ of
 * its cards), otherwise the dominant card archetype, otherwise "mixed".
 */
export function detectRealArchetype(deck: DeckList): string {
  const ids = [...deck.main, ...deck.extra];
  if (!ids.length) return 'mixed';
  let best: string | null = null;
  let bestShare = 0;
  for (const s of REAL_STARTERS) {
    const list = resolveRealStarter(s);
    if (!list) continue;
    const pool = new Set([...list.main, ...list.extra]);
    const share = ids.filter((id) => pool.has(id)).length / ids.length;
    if (share > bestShare) {
      best = s.id;
      bestShare = share;
    }
  }
  if (best && bestShare >= 0.6) return best;
  const counts: Record<string, number> = {};
  for (const id of ids) {
    const a = hasDef(id) ? getDef(id).archetype : undefined;
    if (a) counts[a] = (counts[a] ?? 0) + 1;
  }
  const [top] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return top && top[1] >= 8 ? top[0] : 'mixed';
}

setRealArchetypeDetector(detectRealArchetype);
