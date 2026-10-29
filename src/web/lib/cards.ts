// Card presentation helpers.
import { getDef, hasDef, type CardDef } from '../../engine';
import { translate, type Lang } from '../i18n';

export const ATTR_COLORS: Record<string, string> = {
  FIRE: '#ff6b3d',
  WATER: '#3fa7ff',
  EARTH: '#c9a15a',
  WIND: '#4ee6a6',
  LIGHT: '#ffe27a',
  DARK: '#a96bff',
};

export const KIND_COLORS = { spell: '#2fd6b0', trap: '#ff5c93' };

export function frameColor(d: CardDef): string {
  if (d.kind === 'spell') return KIND_COLORS.spell;
  if (d.kind === 'trap') return KIND_COLORS.trap;
  if (d.frame === 'token') return '#9aa3b5';
  return ATTR_COLORS[d.attribute ?? 'LIGHT'];
}

export function cardName(defId: string | null | undefined, lang: Lang): string {
  if (!defId || !hasDef(defId)) return translate(lang, 'duel.hidden');
  return getDef(defId).name[lang];
}

export function typeLine(d: CardDef, lang: Lang): string {
  if (d.kind === 'spell') return translate(lang, `spellType.${d.spellType ?? 'normal'}`);
  if (d.kind === 'trap') return translate(lang, `trapType.${d.trapType ?? 'normal'}`);
  const parts = [translate(lang, `race.${d.race}`)];
  if (d.frame === 'fusion') parts.push(translate(lang, 'frame.fusion'));
  if (d.frame === 'token') parts.push(translate(lang, 'frame.token'));
  parts.push(translate(lang, d.frame === 'normal' ? 'frame.normal' : 'frame.effect'));
  if (d.frame === 'fusion' || d.frame === 'token') parts.pop();
  if (d.frame === 'fusion' && d.effects?.length) parts.push(translate(lang, 'frame.effect'));
  return parts.join(' / ');
}

export const RARITY_ORDER = ['common', 'rare', 'super', 'ultra', 'secret'] as const;
