// Shared card filtering UI + logic (library and deck builder).
import { useMemo } from 'react';
import { allCards, ARCHETYPES, type CardDef } from '../../engine';
import { useT } from '../i18n';
import { ATTR_COLORS, KIND_COLORS, RARITY_ORDER } from '../lib/cards';
import { AttributeGlyph, Icon } from './Icons';

export interface FilterState {
  q: string;
  kind: '' | 'monster' | 'spell' | 'trap';
  attrs: string[];
  race: string;
  archetype: string;
  rarity: string;
  levelMin: number;
  levelMax: number;
  sort: 'default' | 'name' | 'atk' | 'def' | 'level';
  extraOnly?: boolean;
}

export const DEFAULT_FILTERS: FilterState = { q: '', kind: '', attrs: [], race: '', archetype: '', rarity: '', levelMin: 1, levelMax: 12, sort: 'default' };

const RACES = ['Dragon', 'Spellcaster', 'Warrior', 'Beast', 'Beast-Warrior', 'Winged Beast', 'Machine', 'Fiend', 'Zombie', 'Fairy', 'Aqua', 'Sea Serpent', 'Plant', 'Rock'];

export function useFilteredCards(f: FilterState, lang: 'de' | 'en'): CardDef[] {
  return useMemo(() => {
    const q = f.q.trim().toLowerCase();
    let list = allCards().filter((d) => {
      if (f.kind && d.kind !== f.kind) return false;
      if (f.attrs.length && (d.kind !== 'monster' || !f.attrs.includes(d.attribute ?? ''))) return false;
      if (f.race && d.race !== f.race) return false;
      if (f.archetype === '_generic' && d.archetype) return false;
      if (f.archetype && f.archetype !== '_generic' && d.archetype !== f.archetype) return false;
      if (f.rarity && d.rarity !== f.rarity) return false;
      if (d.kind === 'monster' && ((d.level ?? 0) < f.levelMin || (d.level ?? 0) > f.levelMax)) return false;
      if ((f.levelMin > 1 || f.levelMax < 12) && d.kind !== 'monster') return false;
      if (q) {
        const hay = `${d.name.en} ${d.name.de} ${d.text.en} ${d.text.de} ${d.race ?? ''} ${d.id}`.toLowerCase();
        if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    const by = (fn: (d: CardDef) => number | string, dir = -1) =>
      [...list].sort((a, b) => {
        const x = fn(a);
        const y = fn(b);
        return (typeof x === 'number' && typeof y === 'number' ? (x - y) * dir : String(x).localeCompare(String(y))) || a.name[lang].localeCompare(b.name[lang]);
      });
    switch (f.sort) {
      case 'name':
        list = by((d) => d.name[lang]);
        break;
      case 'atk':
        list = by((d) => (d.kind === 'monster' ? (d.atk ?? 0) : -1));
        break;
      case 'def':
        list = by((d) => (d.kind === 'monster' ? (d.def ?? 0) : -1));
        break;
      case 'level':
        list = by((d) => (d.kind === 'monster' ? (d.level ?? 0) : -1));
        break;
    }
    return list;
  }, [f, lang]);
}

export function CardFilterBar({ value, onChange, compact }: { value: FilterState; onChange: (f: FilterState) => void; compact?: boolean }) {
  const t = useT();
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });
  const toggleAttr = (a: string) => set({ attrs: value.attrs.includes(a) ? value.attrs.filter((x) => x !== a) : [...value.attrs, a] });
  const changed = JSON.stringify({ ...value, sort: 'default' }) !== JSON.stringify({ ...DEFAULT_FILTERS });
  return (
    <div className={`filters ${compact ? 'filters-compact' : ''}`}>
      <div className="filters-row">
        <div className="search-box">
          <Icon.Search size={16} />
          <input className="input" placeholder={t('lib.search')} value={value.q} onChange={(e) => set({ q: e.target.value })} />
        </div>
        {!compact && (
          <select className="select filters-sort" value={value.sort} onChange={(e) => set({ sort: e.target.value as FilterState['sort'] })} aria-label={t('lib.sort')}>
            {(['default', 'name', 'atk', 'def', 'level'] as const).map((s) => (
              <option key={s} value={s}>
                {t('lib.sort')}: {t(`lib.sort.${s}`)}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="filters-row filters-chips">
        {(['', 'monster', 'spell', 'trap'] as const).map((k) => (
          <button key={k || 'all'} className={`chip ${value.kind === k ? 'active' : ''}`} style={{ ['--c' as string]: k === 'spell' ? KIND_COLORS.spell : k === 'trap' ? KIND_COLORS.trap : undefined }} onClick={() => set({ kind: k })}>
            {k ? t(`kind.${k}`) : t('lib.all')}
          </button>
        ))}
        <span className="filters-sep" />
        {Object.keys(ATTR_COLORS).map((a) => (
          <button key={a} className={`chip chip-attr ${value.attrs.includes(a) ? 'active' : ''}`} style={{ ['--c' as string]: ATTR_COLORS[a] }} onClick={() => toggleAttr(a)} title={t(`attr.${a}`)}>
            <span style={{ color: ATTR_COLORS[a], display: 'inline-flex' }}>
              <AttributeGlyph attr={a} size={14} />
            </span>
            {!compact && t(`attr.${a}`)}
          </button>
        ))}
      </div>
      <div className="filters-row">
        <select className="select" value={value.archetype} onChange={(e) => set({ archetype: e.target.value })}>
          <option value="">{t('lib.allArchetypes')}</option>
          {ARCHETYPES.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name[t.lang]}
            </option>
          ))}
          <option value="_generic">{t('lib.generic')}</option>
        </select>
        <select className="select" value={value.race} onChange={(e) => set({ race: e.target.value })}>
          <option value="">{t('lib.allRaces')}</option>
          {RACES.map((r) => (
            <option key={r} value={r}>
              {t(`race.${r}`)}
            </option>
          ))}
        </select>
        {!compact && (
          <select className="select" value={value.rarity} onChange={(e) => set({ rarity: e.target.value })}>
            <option value="">{t('lib.allRarities')}</option>
            {RARITY_ORDER.map((r) => (
              <option key={r} value={r}>
                {t(`rarity.${r}`)}
              </option>
            ))}
          </select>
        )}
        {!compact && (
          <div className="level-range">
            <span className="small muted">{t('lib.levels', { a: value.levelMin, b: value.levelMax })}</span>
            <input type="range" min={1} max={12} value={value.levelMin} onChange={(e) => set({ levelMin: Math.min(Number(e.target.value), value.levelMax) })} aria-label="min level" />
            <input type="range" min={1} max={12} value={value.levelMax} onChange={(e) => set({ levelMax: Math.max(Number(e.target.value), value.levelMin) })} aria-label="max level" />
          </div>
        )}
        {changed && (
          <button className="btn btn-ghost btn-sm" onClick={() => onChange({ ...DEFAULT_FILTERS, sort: value.sort })}>
            {t('lib.reset')}
          </button>
        )}
      </div>
    </div>
  );
}
