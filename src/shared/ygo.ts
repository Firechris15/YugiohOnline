// Real Yu-Gi-Oh! card data from the YGOPRODeck card database
// (https://db.ygoprodeck.com/api-guide/). Card names, texts and images are
// property of Konami; they are loaded at runtime and never stored in this repo.

export const YGO_API = 'https://db.ygoprodeck.com/api/v7';
export const YGO_IMAGES = 'https://images.ygoprodeck.com/images';

/** Card as returned by cardinfo.php (only the fields we use). */
export interface ApiCard {
  id: number;
  name: string;
  type: string;
  frameType: string;
  desc: string;
  atk?: number;
  def?: number;
  level?: number;
  race: string;
  attribute?: string;
  archetype?: string;
  scale?: number;
  linkval?: number;
  linkmarkers?: string[];
  typeline?: string[];
  banlist_info?: { ban_tcg?: string; ban_ocg?: string; ban_goat?: string };
  card_images?: { id: number }[];
}

/** Compact card record shared by server and client. */
export interface YgoCard {
  id: number;
  n: string; // English name
  nd?: string; // German name
  t: string; // type, e.g. "Effect Monster"
  f: string; // frameType, e.g. "effect", "xyz", "spell"
  d: string; // English text
  dd?: string; // German text
  a?: number; // ATK
  df?: number; // DEF
  l?: number; // Level / Rank
  r: string; // monster type ("race") or Spell/Trap subtype
  at?: string; // attribute
  ar?: string; // archetype
  sc?: number; // pendulum scale
  lv?: number; // link rating
  lm?: string[]; // link markers
  tl?: string[]; // type line, e.g. ["Spellcaster","Effect"]
  b?: { tcg?: BanStatus; ocg?: BanStatus; goat?: BanStatus };
  im?: number[]; // alternate artwork ids (first is the default)
}

export type BanStatus = 'Banned' | 'Limited' | 'Semi-Limited';
export type Banlist = 'tcg' | 'ocg' | 'goat' | 'none';

export interface CardDb {
  version: string;
  updated: number;
  cards: YgoCard[];
}

const banValue = (s?: string): BanStatus | undefined => (s === 'Banned' || s === 'Limited' || s === 'Semi-Limited' ? s : undefined);

/** Merge the English and (optional) German card lists into compact records. */
export function compactCards(en: ApiCard[], de?: ApiCard[]): YgoCard[] {
  const german = new Map<number, ApiCard>();
  for (const c of de ?? []) german.set(c.id, c);
  const out: YgoCard[] = [];
  for (const c of en) {
    if (c.frameType === 'skill' || c.type === 'Skill Card') continue;
    const g = german.get(c.id);
    const rec: YgoCard = { id: c.id, n: c.name, t: c.type, f: c.frameType, d: c.desc, r: c.race };
    if (g && g.name && g.name !== c.name) rec.nd = g.name;
    if (g && g.desc && g.desc !== c.desc) rec.dd = g.desc;
    if (typeof c.atk === 'number') rec.a = c.atk;
    if (typeof c.def === 'number') rec.df = c.def;
    if (typeof c.level === 'number') rec.l = c.level;
    if (c.attribute) rec.at = c.attribute;
    if (c.archetype) rec.ar = c.archetype;
    if (typeof c.scale === 'number') rec.sc = c.scale;
    if (typeof c.linkval === 'number') rec.lv = c.linkval;
    if (c.linkmarkers?.length) rec.lm = c.linkmarkers;
    if (c.typeline?.length) rec.tl = c.typeline;
    const b = c.banlist_info;
    if (b) {
      const ban = { tcg: banValue(b.ban_tcg), ocg: banValue(b.ban_ocg), goat: banValue(b.ban_goat) };
      if (ban.tcg || ban.ocg || ban.goat) rec.b = ban;
    }
    const imgs = (c.card_images ?? []).map((i) => i.id).filter((i) => i !== c.id);
    if (imgs.length) rec.im = imgs;
    out.push(rec);
  }
  return out;
}

export function banLimit(c: YgoCard, list: Banlist): 0 | 1 | 2 | 3 {
  if (list === 'none') return 3;
  const s = c.b?.[list];
  return s === 'Banned' ? 0 : s === 'Limited' ? 1 : s === 'Semi-Limited' ? 2 : 3;
}

export type ImageSize = 'full' | 'small' | 'cropped';

const folder: Record<ImageSize, string> = { full: 'cards', small: 'cards_small', cropped: 'cards_cropped' };

/** Image URL: through our server's cache when available, otherwise straight from YGOPRODeck. */
export function cardImageUrl(id: number, size: ImageSize, proxyBase: string | null): string {
  if (proxyBase !== null) return `${proxyBase}/img/${size}/${id}.jpg`;
  return `${YGO_IMAGES}/${folder[size]}/${id}.jpg`;
}

export function remoteImageUrl(id: number, size: ImageSize): string {
  return `${YGO_IMAGES}/${folder[size]}/${id}.jpg`;
}

const EXTRA_FRAMES = ['fusion', 'synchro', 'xyz', 'link', 'fusion_pendulum', 'synchro_pendulum', 'xyz_pendulum'];

export function isExtraFrame(frameType: string): boolean {
  return EXTRA_FRAMES.includes(frameType);
}

export function isMonsterFrame(frameType: string): boolean {
  return frameType !== 'spell' && frameType !== 'trap' && frameType !== 'skill';
}

// ------------------------------------------------------------------ YDK files

/** Parse a .ydk deck file (the format used by YGOPRODeck, EDOPro, ...). */
export function parseYdk(text: string): { main: number[]; extra: number[]; side: number[] } {
  const out = { main: [] as number[], extra: [] as number[], side: [] as number[] };
  let section: keyof typeof out = 'main';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#main')) section = 'main';
    else if (line.startsWith('#extra')) section = 'extra';
    else if (line.startsWith('!side')) section = 'side';
    else if (/^\d+$/.test(line)) out[section].push(Number(line));
  }
  return out;
}

export function toYdk(main: number[], extra: number[], side: number[] = []): string {
  return ['#created by DuelForge', '#main', ...main, '#extra', ...extra, '!side', ...side, ''].join('\n');
}
