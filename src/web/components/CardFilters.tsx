// Shared card filtering UI + logic (library and deck builder). Works for the
// DuelForge demo set and for the full real Yu-Gi-Oh! card pool.
import { useDeferredValue, useMemo } from 'react';
import { allCards, ARCHETYPES, type CardDef } from '../../engine';
import { useT } from '../i18n';
import { ATTR_COLORS, KIND_COLORS, RARITY_ORDER, REAL_ATTR_COLORS, raceName } from '../lib/cards';
import { inPool, useCardDb, type CardPool } from '../lib/carddb';
import { AttributeGlyph, Icon } from './Icons';

export interface FilterState {
  q: string;
  kind: '' | 'monster' | 'spell' | 'trap';
  attrs: string[];
  race: string;
  archetype: string;
  rarity: string;
  frame: string;
  sub: string;
  levelMin: number;
  levelMax: number;
  ban: '' | 'tcg' | 'ocg' | 'goat';
  autoOnly: boolean;
  sort: 'default' | 'name' | 'atk' | 'def' | 'level';
  extraOnly?: boolean;
}

export const DEFAULT_FILTERS: FilterState = { q: '', kind: '', attrs: [], race: '', archetype: '', rarity: '', frame: '', sub: '', levelMin: 0, levelMax: 13, ban: '', autoOnly: false, sort: 'default' };

const DEMO_RACES = ['Dragon', 'Spellcaster', 'Warrior', 'Beast', 'Beast-Warrior', 'Winged Beast', 'Machine', 'Fiend', 'Zombie', 'Fairy', 'Aqua', 'Sea Serpent', 'Plant', 'Rock'];
const FRAMES = ['normal', 'effect', 'ritual', 'fusion', 'synchro', 'xyz', 'link', 'pendulum', 'token'];
const SPELL_SUBS = ['normal', 'quickplay', 'continuous', 'equip', 'field', 'ritual'];
const TRAP_SUBS = ['normal', 'continuous', 'counter'];

const haystacks = new WeakMap<CardDef, string>();
const hay = (d: CardDef) => {
  let h = haystacks.get(d);
  if (!h) {
    h = `${d.name.en} ${d.name.de} ${d.text.en} ${d.text.de} ${d.race ?? ''} ${d.archetype ?? ''} ${d.passcode ?? d.id}`.toLowerCase();
    haystacks.set(d, h);
  }
  return h;
};

const levelOf = (d: CardDef) => d.level ?? d.linkVal ?? 0;
const frameMatches = (d: CardDef, frame: string) => (frame === 'pendulum' ? !!d.pendulum : frame === 'token' ? !!d.token : d.frame === frame);

/** All cards of a pool, sorted by name (recomputed when the real database changes). */
export function usePoolCards(pool: CardPool, lang: 'de' | 'en'): CardDef[] {
  const version = useCardDb((s) => s.version);
  return useMemo(() => {
    const list = allCards().filter((d) => inPool(d, pool));
    if (pool === 'real') {
      const coll = new Intl.Collator(lang, { ignorePunctuation: true, sensitivity: 'base' });
      list.sort((a, b) => coll.compare(a.name[lang], b.name[lang]));
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, lang, version]);
}

export function useFilteredCards(f: FilterState, lang: 'de' | 'en', pool: CardPool = 'demo'): CardDef[] {
  const base = usePoolCards(pool, lang);
  const q = useDeferredValue(f.q.trim().toLowerCase());
  return useMemo(() => {
    const words = q ? q.split(/\s+/) : [];
    const arch = f.archetype.trim().toLowerCase();
    const levelFilter = f.levelMin > 0 || f.levelMax < 13;
    let list = base.filter((d) => {
      if (f.kind && d.kind !== f.kind) return false;
      if (f.attrs.length && (d.kind !== 'monster' || !f.attrs.includes(d.attribute ?? ''))) return false;
      if (f.race && d.race !== f.race) return false;
      if (arch === '_generic' && d.archetype) return false;
      if (arch && arch !== '_generic' && (d.archetype ?? '').toLowerCase() !== arch) return false;
      if (f.rarity && d.rarity !== f.rarity) return false;
      if (f.frame && (d.kind !== 'monster' || !frameMatches(d, f.frame))) return false;
      if (f.sub && (d.kind === 'monster' || (d.spellType ?? d.trapType) !== f.sub)) return false;
      if (levelFilter && (d.kind !== 'monster' || levelOf(d) < f.levelMin || levelOf(d) > f.levelMax)) return false;
      if (f.ban && (d.bans?.[f.ban] === undefined || d.bans[f.ban]! >= 3)) return false;
      if (f.autoOnly && !d.auto) return false;
      if (words.length) {
        const h = hay(d);
        if (!words.every((w) => h.includes(w))) return false;
      }
      return true;
    });
    const coll = new Intl.Collator(lang, { ignorePunctuation: true, sensitivity: 'base' });
    const by = (fn: (d: CardDef) => number) => [...list].sort((a, b) => fn(b) - fn(a) || coll.compare(a.name[lang], b.name[lang]));
    switch (f.sort) {
      case 'name':
        list = pool === 'real' ? list : [...list].sort((a, b) => coll.compare(a.name[lang], b.name[lang]));
        break;
      case 'atk':
        list = by((d) => (d.kind === 'monster' ? (d.atk ?? 0) : -10));
        break;
      case 'def':
        list = by((d) => (d.kind === 'monster' && !d.linkVal ? (d.def ?? 0) : -10));
        break;
      case 'level':
        list = by((d) => (d.kind === 'monster' ? levelOf(d) : -1));
        break;
    }
    return list;
  }, [base, q, f.kind, f.attrs, f.race, f.archetype, f.rarity, f.frame, f.sub, f.levelMin, f.levelMax, f.ban, f.autoOnly, f.sort, lang, pool]);
}

export function CardFilterBar({ value, onChange, compact, pool = 'demo' }: { value: FilterState; onChange: (f: FilterState) => void; compact?: boolean; pool?: CardPool }) {
  const t = useT();
  const base = usePoolCards(pool, t.lang);
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });
  const toggleAttr = (a: string) => set({ attrs: value.attrs.includes(a) ? value.attrs.filter((x) => x !== a) : [...value.attrs, a] });
  const changed = JSON.stringify({ ...value, sort: 'default' }) !== JSON.stringify({ ...DEFAULT_FILTERS });
  const real = pool === 'real';
  const attrColors = real ? REAL_ATTR_COLORS : ATTR_COLORS;
  const races = useMemo(() => (real ? [...new Set(base.filter((d) => d.kind === 'monster').map((d) => d.race).filter((r): r is string => !!r))].sort() : DEMO_RACES), [base, real]);
  const archetypes = useMemo(() => (real ? [...new Set(base.map((d) => d.archetype).filter((a): a is string => !!a))].sort((a, b) => a.localeCompare(b)) : []), [base, real]);
  const subs = value.kind === 'trap' ? TRAP_SUBS : value.kind === 'spell' ? SPELL_SUBS : [];
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
          <button
            key={k || 'all'}
            className={`chip ${value.kind === k ? 'active' : ''}`}
            style={{ ['--c' as string]: k === 'spell' ? KIND_COLORS.spell : k === 'trap' ? KIND_COLORS.trap : undefined }}
            onClick={() => set({ kind: k, sub: '', frame: k === 'monster' || k === '' ? value.frame : '' })}
          >
            {k ? t(`kind.${k}`) : t('lib.all')}
          </button>
        ))}
        <span className="filters-sep" />
        {Object.keys(attrColors).map((a) => (
          <button key={a} className={`chip chip-attr ${value.attrs.includes(a) ? 'active' : ''}`} style={{ ['--c' as string]: attrColors[a] }} onClick={() => toggleAttr(a)} title={t(`attr.${a}`)}>
            <span style={{ color: attrColors[a], display: 'inline-flex' }}>
              <AttributeGlyph attr={a} size={14} />
            </span>
            {!compact && t(`attr.${a}`)}
          </button>
        ))}
      </div>
      <div className="filters-row">
        {real ? (
          <>
            <input className="input filters-arch" list="df-archetypes" placeholder={t('lib.archetypePh')} value={value.archetype} onChange={(e) => set({ archetype: e.target.value })} aria-label={t('card.archetype')} />
            <datalist id="df-archetypes">
              {archetypes.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </>
        ) : (
          <select className="select" value={value.archetype} onChange={(e) => set({ archetype: e.target.value })}>
            <option value="">{t('lib.allArchetypes')}</option>
            {ARCHETYPES.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name[t.lang]}
              </option>
            ))}
            <option value="_generic">{t('lib.generic')}</option>
          </select>
        )}
        {value.kind === 'spell' || value.kind === 'trap' ? (
          <select className="select" value={value.sub} onChange={(e) => set({ sub: e.target.value })}>
            <option value="">{t('lib.allSubtypes')}</option>
            {subs.map((s) => (
              <option key={s} value={s}>
                {t(`${value.kind}Type.${s}`)}
              </option>
            ))}
          </select>
        ) : (
          <select className="select" value={value.race} onChange={(e) => set({ race: e.target.value })}>
            <option value="">{t('lib.allRaces')}</option>
            {races.map((r) => (
              <option key={r} value={r}>
                {raceName(r, t.lang)}
              </option>
            ))}
          </select>
        )}
        {real && value.kind !== 'spell' && value.kind !== 'trap' && (
          <select className="select" value={value.frame} onChange={(e) => set({ frame: e.target.value })}>
            <option value="">{t('lib.allFrames')}</option>
            {FRAMES.map((f) => (
              <option key={f} value={f}>
                {t(`frame.${f}`)}
              </option>
            ))}
          </select>
        )}
        {real && !compact && (
          <select className="select" value={value.ban} onChange={(e) => set({ ban: e.target.value as FilterState['ban'] })}>
            <option value="">{t('lib.anyBan')}</option>
            {(['tcg', 'ocg', 'goat'] as const).map((b) => (
              <option key={b} value={b}>
                {t('ban.any')}: {t(`banlist.${b}`)}
              </option>
            ))}
          </select>
        )}
        {!real && !compact && (
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
            <input type="range" min={0} max={13} value={value.levelMin} onChange={(e) => set({ levelMin: Math.min(Number(e.target.value), value.levelMax) })} aria-label="min level" />
            <input type="range" min={0} max={13} value={value.levelMax} onChange={(e) => set({ levelMax: Math.max(Number(e.target.value), value.levelMin) })} aria-label="max level" />
          </div>
        )}
        {real && (
          <label className="row small" style={{ gap: 8, cursor: 'pointer' }}>
            <button type="button" className={`toggle ${value.autoOnly ? 'on' : ''}`} onClick={() => set({ autoOnly: !value.autoOnly })} aria-pressed={value.autoOnly} aria-label={t('lib.autoOnly')} />
            <span className="muted">{t('lib.autoOnly')}</span>
          </label>
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
