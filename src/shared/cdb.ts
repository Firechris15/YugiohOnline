// Alternative real card source: the open EDOPro / YGOPro card databases
// (ProjectIgnis/BabelCDB, mycard/ygopro-database for German texts,
// ProjectIgnis/LFLists for banlists). Rows from their SQLite "cards.cdb"
// files are converted into the same compact records as YGOPRODeck data.
import type { BanStatus, YgoCard } from './ygo';

const RAW = 'https://raw.githubusercontent.com';
export const CDB_SOURCES = {
  cards: `${RAW}/ProjectIgnis/BabelCDB/master/cards.cdb`,
  german: `${RAW}/mycard/ygopro-database/master/locales/de-DE/cards.cdb`,
  strings: `${RAW}/ProjectIgnis/Distribution/master/config/strings.conf`,
  tcg: `${RAW}/ProjectIgnis/LFLists/master/0TCG.lflist.conf`,
  ocg: `${RAW}/ProjectIgnis/LFLists/master/OCG.lflist.conf`,
  goat: `${RAW}/ProjectIgnis/LFLists/master/GOAT.lflist.conf`,
};

export interface CdbRow {
  id: number;
  ot: number;
  alias: number;
  setcode: number | bigint | string;
  type: number;
  atk: number;
  def: number;
  level: number;
  race: number;
  attribute: number;
  name: string;
  desc: string;
}

const T = {
  MONSTER: 0x1,
  SPELL: 0x2,
  TRAP: 0x4,
  NORMAL: 0x10,
  EFFECT: 0x20,
  FUSION: 0x40,
  RITUAL: 0x80,
  SPIRIT: 0x200,
  UNION: 0x400,
  GEMINI: 0x800,
  TUNER: 0x1000,
  SYNCHRO: 0x2000,
  TOKEN: 0x4000,
  QUICKPLAY: 0x10000,
  CONTINUOUS: 0x20000,
  EQUIP: 0x40000,
  FIELD: 0x80000,
  COUNTER: 0x100000,
  FLIP: 0x200000,
  TOON: 0x400000,
  XYZ: 0x800000,
  PENDULUM: 0x1000000,
  LINK: 0x4000000,
  SKILL: 0x8000000,
  ACTION: 0x10000000,
};

const RACES: [number, string][] = [
  [0x1, 'Warrior'],
  [0x2, 'Spellcaster'],
  [0x4, 'Fairy'],
  [0x8, 'Fiend'],
  [0x10, 'Zombie'],
  [0x20, 'Machine'],
  [0x40, 'Aqua'],
  [0x80, 'Pyro'],
  [0x100, 'Rock'],
  [0x200, 'Winged Beast'],
  [0x400, 'Plant'],
  [0x800, 'Insect'],
  [0x1000, 'Thunder'],
  [0x2000, 'Dragon'],
  [0x4000, 'Beast'],
  [0x8000, 'Beast-Warrior'],
  [0x10000, 'Dinosaur'],
  [0x20000, 'Fish'],
  [0x40000, 'Sea Serpent'],
  [0x80000, 'Reptile'],
  [0x100000, 'Psychic'],
  [0x200000, 'Divine-Beast'],
  [0x400000, 'Creator-God'],
  [0x800000, 'Wyrm'],
  [0x1000000, 'Cyberse'],
  [0x2000000, 'Illusion'],
];

const ATTRIBUTES: [number, string][] = [
  [0x1, 'EARTH'],
  [0x2, 'WATER'],
  [0x4, 'FIRE'],
  [0x8, 'WIND'],
  [0x10, 'LIGHT'],
  [0x20, 'DARK'],
  [0x40, 'DIVINE'],
];

const MARKERS: [number, string][] = [
  [0x40, 'Top-Left'],
  [0x80, 'Top'],
  [0x100, 'Top-Right'],
  [0x8, 'Left'],
  [0x20, 'Right'],
  [0x1, 'Bottom-Left'],
  [0x2, 'Bottom'],
  [0x4, 'Bottom-Right'],
];

/** ot flags: 0x1 OCG, 0x2 TCG; everything else is anime, Rush, custom, ... */
const OFFICIAL = 0x3;
const UNOFFICIAL = 0x4 | 0x8 | 0x10 | 0x20 | 0x40 | 0x80 | 0x200 | 0x400;

const pick = (table: [number, string][], v: number) => table.find(([bit]) => v & bit)?.[1];

function frameOf(type: number): string {
  if (type & T.SPELL) return 'spell';
  if (type & T.TRAP) return 'trap';
  if (type & T.TOKEN) return 'token';
  const base =
    type & T.LINK ? 'link' : type & T.XYZ ? 'xyz' : type & T.SYNCHRO ? 'synchro' : type & T.FUSION ? 'fusion' : type & T.RITUAL ? 'ritual' : type & T.EFFECT ? 'effect' : 'normal';
  return type & T.PENDULUM ? `${base}_pendulum` : base;
}

function typeLineOf(type: number, race: string): string[] {
  const tl = [race];
  if (type & T.FUSION) tl.push('Fusion');
  if (type & T.RITUAL) tl.push('Ritual');
  if (type & T.SYNCHRO) tl.push('Synchro');
  if (type & T.XYZ) tl.push('Xyz');
  if (type & T.LINK) tl.push('Link');
  if (type & T.PENDULUM) tl.push('Pendulum');
  if (type & T.FLIP) tl.push('Flip');
  if (type & T.SPIRIT) tl.push('Spirit');
  if (type & T.UNION) tl.push('Union');
  if (type & T.GEMINI) tl.push('Gemini');
  if (type & T.TOON) tl.push('Toon');
  if (type & T.TUNER) tl.push('Tuner');
  if (type & T.NORMAL) tl.push('Normal');
  if (type & T.EFFECT) tl.push('Effect');
  return tl;
}

function typeTextOf(type: number): string {
  if (type & T.SPELL) return 'Spell Card';
  if (type & T.TRAP) return 'Trap Card';
  if (type & T.TOKEN) return 'Token';
  const words: string[] = [];
  if (type & T.PENDULUM) words.push('Pendulum');
  if (type & T.FLIP) words.push('Flip');
  if (type & T.SPIRIT) words.push('Spirit');
  if (type & T.UNION) words.push('Union');
  if (type & T.GEMINI) words.push('Gemini');
  if (type & T.TOON) words.push('Toon');
  if (type & T.TUNER) words.push('Tuner');
  if (type & T.NORMAL) words.push('Normal');
  if (type & T.EFFECT) words.push('Effect');
  if (type & T.RITUAL) words.push('Ritual');
  if (type & T.FUSION) words.push('Fusion');
  if (type & T.SYNCHRO) words.push('Synchro');
  if (type & T.XYZ) words.push('XYZ');
  if (type & T.LINK) words.push('Link');
  return `${words.join(' ') || 'Normal'} Monster`;
}

function subtypeOf(type: number): string {
  if (type & T.QUICKPLAY) return 'Quick-Play';
  if (type & T.CONTINUOUS) return 'Continuous';
  if (type & T.EQUIP) return 'Equip';
  if (type & T.FIELD) return 'Field';
  if (type & T.RITUAL) return 'Ritual';
  if (type & T.COUNTER) return 'Counter';
  return 'Normal';
}

/** Archetype names from strings.conf ("!setname 0x13a Dark Magician"). */
export function parseSetnames(text: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^!setname\s+0x([0-9a-f]+)\s+(.+?)\s*$/i.exec(line);
    if (m) out.set(parseInt(m[1], 16), m[2].split('\t')[0].trim());
  }
  return out;
}

export interface Lflist {
  name: string;
  whitelist: boolean;
  limits: Map<number, number>;
}

/** First list of an EDOPro .lflist.conf file. */
export function parseLflist(text: string): Lflist {
  const out: Lflist = { name: '', whitelist: false, limits: new Map() };
  let seen = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('!')) {
      if (seen) break;
      seen = true;
      out.name = line.slice(1).trim();
    } else if (line === '$whitelist') out.whitelist = true;
    else {
      const m = /^(\d+)\s+(-?\d+)/.exec(line);
      if (m) out.limits.set(Number(m[1]), Number(m[2]));
    }
  }
  return out;
}

const STATUS: Record<number, BanStatus> = { 0: 'Banned', 1: 'Limited', 2: 'Semi-Limited' };

export interface CdbExtras {
  german?: Map<number, { name: string; desc: string }>;
  setnames?: Map<number, string>;
  banlists?: { tcg?: Lflist; ocg?: Lflist; goat?: Lflist };
}

function archetypeOf(setcode: number | bigint | string, setnames?: Map<number, string>): string | undefined {
  if (!setnames) return undefined;
  let rest = BigInt(setcode);
  while (rest > 0n) {
    const code = Number(rest & 0xffffn);
    rest >>= 16n;
    const name = setnames.get(code) ?? setnames.get(code & 0xfff);
    if (name) return name;
  }
  return undefined;
}

/** Convert cards.cdb rows (datas joined with texts) into compact card records. */
export function cdbToCards(rows: CdbRow[], extras: CdbExtras = {}): YgoCard[] {
  const byId = new Map<number, CdbRow>();
  for (const r of rows) byId.set(r.id, r);
  const alternates = new Map<number, number[]>();
  const out: YgoCard[] = [];
  for (const r of rows) {
    if (!(r.ot & OFFICIAL) || r.ot & UNOFFICIAL) continue;
    if (r.type & (T.SKILL | T.ACTION)) continue;
    // Alternate artworks share the original's data: remember them as images.
    if (r.alias && byId.get(r.alias)?.name === r.name) {
      const list = alternates.get(r.alias) ?? [];
      list.push(r.id);
      alternates.set(r.alias, list);
      continue;
    }
    const f = frameOf(r.type);
    const monster = !(r.type & (T.SPELL | T.TRAP));
    const race = monster ? (pick(RACES, r.race) ?? 'Warrior') : subtypeOf(r.type);
    const c: YgoCard = { id: r.id, n: r.name, t: typeTextOf(r.type), f, d: r.desc ?? '', r: race };
    const de = extras.german?.get(r.id);
    if (de?.name && de.name !== r.name) c.nd = de.name;
    if (de?.desc && de.desc !== r.desc) c.dd = de.desc;
    if (monster) {
      c.at = pick(ATTRIBUTES, r.attribute) ?? 'LIGHT';
      c.a = r.atk;
      c.tl = typeLineOf(r.type, race);
      if (r.type & T.LINK) {
        c.lv = r.level & 0xff;
        c.lm = MARKERS.filter(([bit]) => r.def & bit).map(([, m]) => m);
      } else {
        c.df = r.def;
        c.l = r.level & 0xff;
      }
      if (r.type & T.PENDULUM) c.sc = (r.level >>> 24) & 0xff;
    }
    const ar = archetypeOf(r.setcode, extras.setnames);
    if (ar) c.ar = ar;
    const bans: NonNullable<YgoCard['b']> = {};
    for (const key of ['tcg', 'ocg', 'goat'] as const) {
      const n = extras.banlists?.[key]?.limits.get(r.id);
      if (n !== undefined && STATUS[n]) bans[key] = STATUS[n];
    }
    if (bans.tcg || bans.ocg || bans.goat) c.b = bans;
    out.push(c);
  }
  for (const c of out) {
    const alt = alternates.get(c.id);
    if (alt) c.im = alt;
  }
  return out;
}
