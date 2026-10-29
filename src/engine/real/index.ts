// Turns real card records (YGOPRODeck data) into engine card definitions.
// Every real card is playable in free duels; cards whose rules are
// implemented (Normal Monsters, simple Fusions/Rituals and the curated list
// in effects.ts) are also playable in automatic duels against bots.
import type { YgoCard } from '../../shared/ygo';
import type { CardDef, FusionMaterial, MonsterFrame, SpellType, TrapType } from '../types';
import { registerCards, unregisterWhere, hasDef } from '../db';
import { EXODIA_PIECES, REAL_EFFECTS, setTokenLookup } from './effects';

const FRAME: Record<string, MonsterFrame> = {
  normal: 'normal',
  effect: 'effect',
  ritual: 'ritual',
  fusion: 'fusion',
  synchro: 'synchro',
  xyz: 'xyz',
  link: 'link',
  token: 'token',
  normal_pendulum: 'normal',
  effect_pendulum: 'effect',
  ritual_pendulum: 'ritual',
  fusion_pendulum: 'fusion',
  synchro_pendulum: 'synchro',
  xyz_pendulum: 'xyz',
};

const SPELL: Record<string, SpellType> = {
  Normal: 'normal',
  'Quick-Play': 'quickplay',
  Continuous: 'continuous',
  Equip: 'equip',
  Field: 'field',
  Ritual: 'ritual',
};

const TRAP: Record<string, TrapType> = { Normal: 'normal', Continuous: 'continuous', Counter: 'counter' };

export const realId = (passcode: number) => String(passcode);

/** German words for the type line ("Spellcaster / Effect" → "Hexer / Effekt"). */
const TYPE_DE: Record<string, string> = {
  Warrior: 'Krieger',
  Spellcaster: 'Hexer',
  Fairy: 'Fee',
  Fiend: 'Unterweltler',
  Zombie: 'Zombie',
  Machine: 'Maschine',
  Aqua: 'Aqua',
  Pyro: 'Pyro',
  Rock: 'Fels',
  'Winged Beast': 'Geflügeltes Ungeheuer',
  Plant: 'Pflanze',
  Insect: 'Insekt',
  Thunder: 'Donner',
  Dragon: 'Drache',
  Beast: 'Ungeheuer',
  'Beast-Warrior': 'Ungeheuer-Krieger',
  Dinosaur: 'Dinosaurier',
  Fish: 'Fisch',
  'Sea Serpent': 'Seeschlange',
  Reptile: 'Reptil',
  Psychic: 'Psi',
  'Divine-Beast': 'Göttliches Ungeheuer',
  'Creator-God': 'Schöpfergott',
  'Creator God': 'Schöpfergott',
  Wyrm: 'Wyrm',
  Cyberse: 'Cyberse',
  Illusion: 'Illusion',
  Effect: 'Effekt',
  Normal: 'Normal',
  Fusion: 'Fusion',
  Ritual: 'Ritual',
  Synchro: 'Synchro',
  Xyz: 'Xyz',
  XYZ: 'Xyz',
  Link: 'Link',
  Pendulum: 'Pendel',
  Flip: 'Flipp',
  Spirit: 'Spirit',
  Union: 'Union',
  Gemini: 'Zwilling',
  Toon: 'Toon',
  Tuner: 'Empfänger',
};

let byName = new Map<string, YgoCard>();
let byId = new Map<number, YgoCard>();

export function realCardByName(name: string): YgoCard | undefined {
  return byName.get(name.toLowerCase());
}

export function realCardById(id: number): YgoCard | undefined {
  return byId.get(id);
}

/** "Name A" + "Name B" (+ "Name C") on the first text line → material names. */
export function parseNamedMaterials(desc: string): string[] | null {
  const first = desc.split(/\r?\n/)[0].trim();
  const parts = first.split(/\s*\+\s*/);
  if (parts.length < 2) return null;
  const names: string[] = [];
  for (const p of parts) {
    const m = /^"(.+)"$/.exec(p.trim());
    if (!m) return null;
    names.push(m[1]);
  }
  return names;
}

function hasEffectLine(c: YgoCard): boolean {
  return !!c.tl?.includes('Effect') || /Effect/.test(c.t);
}

export function buildRealDef(c: YgoCard): CardDef {
  const isSpell = c.f === 'spell';
  const isTrap = c.f === 'trap';
  const kind = isSpell ? 'spell' : isTrap ? 'trap' : 'monster';
  const pendulum = c.f.endsWith('_pendulum');
  const d: CardDef = {
    id: realId(c.id),
    real: true,
    passcode: c.id,
    name: { en: c.n, de: c.nd ?? c.n },
    text: { en: c.d, de: c.dd ?? c.d },
    kind,
    rarity: 'common',
    archetype: c.ar,
  };
  if (c.b) {
    const lim = (s?: string) => (s === 'Banned' ? 0 : s === 'Limited' ? 1 : s === 'Semi-Limited' ? 2 : undefined);
    d.bans = { tcg: lim(c.b.tcg), ocg: lim(c.b.ocg), goat: lim(c.b.goat) };
  }
  if (kind === 'monster') {
    d.frame = FRAME[c.f] ?? (hasEffectLine(c) ? 'effect' : 'normal');
    d.attribute = (c.at as CardDef['attribute']) ?? undefined;
    d.race = c.r;
    d.level = c.l ?? (c.lv ? undefined : 0);
    d.atk = c.a ?? 0;
    d.def = c.df ?? 0;
    if (c.f === 'token') d.token = true;
    if (pendulum) {
      d.pendulum = true;
      d.scale = c.sc;
    }
    if (c.lv) {
      d.linkVal = c.lv;
      d.linkMarkers = c.lm;
    }
    const tl = c.tl?.length ? c.tl : [c.r, ...(hasEffectLine(c) ? ['Effect'] : [])];
    d.typeLine = { en: tl.join(' / '), de: tl.map((w) => TYPE_DE[w] ?? w).join(' / ') };
    d.rarity = d.frame === 'normal' || d.frame === 'effect' ? 'common' : 'super';
  } else if (isSpell) d.spellType = SPELL[c.r] ?? 'normal';
  else d.trapType = TRAP[c.r] ?? 'normal';
  return d;
}

/** Decide whether automatic duels can play this card and attach its rules. */
function attachRules(d: CardDef, c: YgoCard): void {
  const curated = REAL_EFFECTS[c.n];
  if (curated) {
    d.effects = curated.effects;
    if (c.n === EXODIA_PIECES[0]) d.handWinSet = EXODIA_PIECES;
    if (curated.materials) d.materials = curated.materials.map((n) => materialFor(n)).filter((m): m is FusionMaterial => !!m);
    d.auto = true;
    return;
  }
  if (d.kind !== 'monster' || d.pendulum) return;
  if (d.token) {
    d.auto = true;
    return;
  }
  if (d.frame === 'normal') {
    d.auto = true;
    return;
  }
  if ((d.frame === 'fusion' || d.frame === 'ritual') && !hasEffectLine(c)) {
    if (d.frame === 'ritual') {
      d.auto = true;
      return;
    }
    const names = parseNamedMaterials(c.d);
    if (!names) return;
    const mats = names.map(materialFor);
    if (mats.every(Boolean)) {
      d.materials = mats as FusionMaterial[];
      d.auto = true;
    }
  }
}

function materialFor(name: string): FusionMaterial | null {
  const c = realCardByName(name);
  return c ? { name: realId(c.id) } : null;
}

let registeredVersion: string | null = null;

/** Register (or re-register) the full real card pool in the engine. */
export function registerRealCards(cards: YgoCard[], version = String(cards.length)): void {
  if (registeredVersion === version && cards.length && hasDef(realId(cards[0].id))) return;
  unregisterWhere((d) => !!d.real);
  byName = new Map(cards.map((c) => [c.n.toLowerCase(), c]));
  byId = new Map(cards.map((c) => [c.id, c]));
  const defs = cards.map((c) => {
    const d = buildRealDef(c);
    attachRules(d, c);
    return d;
  });
  // Generic token used when the database has no matching token card.
  if (!byName.has('sheep token')) {
    defs.push({
      id: 'TKN-SHEEP',
      real: true,
      name: { en: 'Sheep Token', de: 'Schafspielmarke' },
      text: { en: 'Token', de: 'Spielmarke' },
      kind: 'monster',
      frame: 'token',
      token: true,
      attribute: 'EARTH',
      race: 'Beast',
      level: 1,
      atk: 0,
      def: 0,
      rarity: 'common',
      auto: true,
    });
  }
  setTokenLookup((name) => {
    const t = byName.get(name.toLowerCase());
    return t ? realId(t.id) : 'TKN-SHEEP';
  });
  registerCards(defs);
  registeredVersion = version;
}

export function realCardsRegistered(): boolean {
  return registeredVersion !== null;
}

/** Names from the curated list that do not exist in the loaded card data (for diagnostics). */
export function missingCuratedNames(): string[] {
  return Object.keys(REAL_EFFECTS).filter((n) => !realCardByName(n));
}
