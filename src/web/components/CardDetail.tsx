// Detailed card information: text box, stats, materials and meta stats.
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { getDef, hasDef, allCards, ARCHETYPE_BY_ID } from '../../engine';
import { useT } from '../i18n';
import { typeLine, frameColor } from '../lib/cards';
import { Card } from './Card';
import { Modal } from './Layout';
import { AttributeGlyph, Icon } from './Icons';
import metaSim from '../../data/meta-sim.json';
import metaReal from '../../data/meta-real.json';
import type { MetaStats } from '../../engine/meta';
import '../styles/detail.css';

const META = metaSim as MetaStats;
const META_REAL = metaReal as MetaStats;
const fmt = (n: number | undefined) => (n === undefined ? '–' : n < 0 ? '?' : String(n));

export function CardText({ defId, compact }: { defId: string; compact?: boolean }) {
  const t = useT();
  if (!hasDef(defId)) return null;
  const d = getDef(defId);
  const color = frameColor(d);
  const isMonster = d.kind === 'monster';
  const text = d.text[t.lang];
  const lines = text.split(/\r?\n/);
  const hasMaterials = d.frame === 'fusion' || d.frame === 'synchro' || d.frame === 'xyz' || d.frame === 'link';
  const materialsLine = hasMaterials && lines.length > 1 ? lines[0] : null;
  const body = materialsLine ? lines.slice(1).join('\n') : lines.join('\n');
  const levelTag = d.linkVal ? `${t('card.link')}-${d.linkVal}` : d.frame === 'xyz' ? `☆ ${t('card.rank')} ${d.level}` : `★ ${t('card.level')} ${d.level}`;
  const bans = d.real && d.bans ? (['tcg', 'ocg', 'goat'] as const).filter((b) => d.bans![b] !== undefined && d.bans![b]! < 3) : [];
  return (
    <div className={`card-text ${compact ? 'compact' : ''}`} style={{ ['--fc' as string]: color }}>
      <div className="card-text-head">
        <h3>{d.name[t.lang]}</h3>
        <div className="card-text-tags">
          <span className="tag" style={{ color }}>
            <AttributeGlyph attr={isMonster ? (d.attribute ?? 'LIGHT') : d.kind === 'spell' ? 'SPELL' : 'TRAP'} size={13} />
            {isMonster ? t(`attr.${d.attribute}`) : t(`kind.${d.kind}`)}
          </span>
          <span className="tag">{typeLine(d, t.lang)}</span>
          {isMonster && (d.level || d.linkVal) ? <span className="tag">{levelTag}</span> : null}
          {d.pendulum && d.scale !== undefined ? <span className="tag">◆ {t('card.scale')} {d.scale}</span> : null}
          {!d.real && <span className={`tag rarity-tag r-${d.rarity}`}>{t(`rarity.${d.rarity}`)}</span>}
          {d.limit !== undefined && d.limit < 3 ? <span className="tag tag-bad">{t('card.limit', { n: d.limit })}</span> : null}
          {bans.map((b) => (
            <span key={b} className="tag tag-bad">
              {t(`banlist.${b}`)}: {t(`ban.${d.bans![b]}`)}
            </span>
          ))}
          {d.real && !d.token ? (
            <span className={`tag ${d.auto ? 'tag-good' : ''}`} title={t(d.auto ? 'card.auto.d' : 'card.manual.d')}>
              {t(d.auto ? 'card.auto' : 'card.manual')}
            </span>
          ) : null}
        </div>
      </div>
      {materialsLine && (
        <p className="card-text-materials">
          <span className="faint tiny">{t('card.materials')}: </span>
          {materialsLine}
        </p>
      )}
      <p className={`card-text-body ${d.frame === 'normal' ? 'flavor' : ''}`}>{body}</p>
      {isMonster && (
        <div className="card-text-stats">
          <span>
            <Icon.Sword size={14} /> ATK <b>{fmt(d.atk)}</b>
          </span>
          {d.linkVal ? (
            <span>
              LINK <b>{d.linkVal}</b>
              {d.linkMarkers?.length ? <span className="faint small"> ({d.linkMarkers.join(', ')})</span> : null}
            </span>
          ) : (
            <span>
              <Icon.Shield size={14} /> DEF <b>{fmt(d.def)}</b>
            </span>
          )}
        </div>
      )}
      {d.archetype && !compact && (
        <div className="faint small" style={{ marginTop: 8 }}>
          {t('card.archetype')}: <span style={{ color: ARCHETYPE_BY_ID[d.archetype]?.color }}>{ARCHETYPE_BY_ID[d.archetype]?.name[t.lang] ?? d.archetype}</span>
        </div>
      )}
      {d.real && d.passcode && !compact && (
        <div className="faint tiny" style={{ marginTop: 6 }}>
          {t('card.passcode')}: <span className="mono">{d.passcode}</span>
        </div>
      )}
    </div>
  );
}

export function CardModal({ defId, onClose, onSelect, actions }: { defId: string | null; onClose: () => void; onSelect?: (id: string) => void; actions?: React.ReactNode }) {
  const t = useT();
  const d = defId && hasDef(defId) ? getDef(defId) : null;
  const related = useMemo(() => (d?.archetype ? allCards().filter((c) => c.archetype === d.archetype && c.id !== d.id && !!c.real === !!d.real).slice(0, 12) : []), [d]);
  const stat = useMemo(() => (d ? (d.real ? META_REAL : META).cards.find((c) => c.id === d.id) : undefined), [d]);
  return (
    <Modal open={!!d} onClose={onClose} wide>
      {d && (
        <div className="card-modal">
          <motion.div className="card-modal-art" key={d.id} initial={{ rotateY: -90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 20 }}>
            <Card defId={d.id} size="xl" holo />
          </motion.div>
          <div className="card-modal-info">
            <CardText defId={d.id} />
            {stat && (
              <div className="card-modal-meta">
                <Icon.Chart size={16} />
                {t('card.inDecks', { p: Math.round(stat.inclusion * 100), w: Math.round(stat.winRate * 100) })}
              </div>
            )}
            {actions}
            {related.length > 0 && (
              <>
                <h4 className="muted" style={{ marginTop: 22 }}>
                  {t('card.related')}
                </h4>
                <div className="card-modal-related">
                  {related.map((r) => (
                    <Card key={r.id} defId={r.id} size="xs" onClick={() => onSelect?.(r.id)} title={r.name[t.lang]} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
