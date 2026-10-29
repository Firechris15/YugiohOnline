// Card presentation helpers.
import { ARCHETYPE_BY_ID, REAL_STARTER_BY_ID, getDef, hasDef, type CardDef } from '../../engine';
import { hasKey, translate, type Lang } from '../i18n';

export const ATTR_COLORS: Record<string, string> = {
  FIRE: '#ff6b3d',
  WATER: '#3fa7ff',
  EARTH: '#c9a15a',
  WIND: '#4ee6a6',
  LIGHT: '#ffe27a',
  DARK: '#a96bff',
};

/** Real cards also know the DIVINE attribute (Egyptian God Cards). */
export const REAL_ATTR_COLORS: Record<string, string> = { ...ATTR_COLORS, DIVINE: '#f0b43c' };

export const KIND_COLORS = { spell: '#2fd6b0', trap: '#ff5c93' };

export function frameColor(d: CardDef): string {
  if (d.kind === 'spell') return KIND_COLORS.spell;
  if (d.kind === 'trap') return KIND_COLORS.trap;
  if (d.frame === 'token') return '#9aa3b5';
  return REAL_ATTR_COLORS[d.attribute ?? 'LIGHT'] ?? ATTR_COLORS.LIGHT;
}

export function cardName(defId: string | null | undefined, lang: Lang): string {
  if (!defId || !hasDef(defId)) return translate(lang, 'duel.hidden');
  return getDef(defId).name[lang];
}

export function typeLine(d: CardDef, lang: Lang): string {
  if (d.typeLine && d.kind === 'monster') return d.typeLine[lang];
  if (d.kind === 'spell') return translate(lang, `spellType.${d.spellType ?? 'normal'}`);
  if (d.kind === 'trap') return translate(lang, `trapType.${d.trapType ?? 'normal'}`);
  const parts = [raceName(d.race ?? '', lang)];
  if (d.frame === 'fusion') parts.push(translate(lang, 'frame.fusion'));
  if (d.frame === 'token') parts.push(translate(lang, 'frame.token'));
  parts.push(translate(lang, d.frame === 'normal' ? 'frame.normal' : 'frame.effect'));
  if (d.frame === 'fusion' || d.frame === 'token') parts.pop();
  if (d.frame === 'fusion' && d.effects?.length) parts.push(translate(lang, 'frame.effect'));
  return parts.join(' / ');
}

export const RARITY_ORDER = ['common', 'rare', 'super', 'ultra', 'secret'] as const;

/** Monster type in the UI language (unknown types are shown as they are). */
export function raceName(race: string, lang: Lang): string {
  return hasKey(`race.${race}`) ? translate(lang, `race.${race}`) : race;
}

/** Display name and color of an archetype id (demo archetype, real starter deck or real archetype name). */
export function archetypeInfo(id: string, lang: Lang): { name: string; color: string } {
  const demo = ARCHETYPE_BY_ID[id];
  if (demo) return { name: demo.name[lang], color: demo.color };
  const starter = REAL_STARTER_BY_ID[id];
  if (starter) return { name: starter.name[lang], color: starter.color };
  if (id === 'mixed') return { name: translate(lang, 'meta.mixed'), color: '#8aa0ff' };
  return { name: id, color: '#8aa0ff' };
}
