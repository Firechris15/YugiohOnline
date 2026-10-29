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
import type { MetaStats } from '../../engine/meta';
import '../styles/detail.css';

const META = metaSim as MetaStats;

export function CardText({ defId, compact }: { defId: string; compact?: boolean }) {
  const t = useT();
  if (!hasDef(defId)) return null;
  const d = getDef(defId);
  const color = frameColor(d);
  const isMonster = d.kind === 'monster';
  const text = d.text[t.lang];
  const lines = text.split('\n');
  const materialsLine = d.frame === 'fusion' ? lines[0] : null;
  const body = d.frame === 'fusion' ? lines.slice(1).join('\n') : text;
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
          {isMonster && d.level ? <span className="tag">★ {t('card.level')} {d.level}</span> : null}
          <span className={`tag rarity-tag r-${d.rarity}`}>{t(`rarity.${d.rarity}`)}</span>
          {d.limit !== undefined && d.limit < 3 ? <span className="tag tag-bad">{t('card.limit', { n: d.limit })}</span> : null}
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
            <Icon.Sword size={14} /> ATK <b>{d.atk}</b>
          </span>
          <span>
            <Icon.Shield size={14} /> DEF <b>{d.def}</b>
          </span>
        </div>
      )}
      {d.archetype && !compact && (
        <div className="faint small" style={{ marginTop: 8 }}>
          {t('card.archetype')}: <span style={{ color: ARCHETYPE_BY_ID[d.archetype]?.color }}>{ARCHETYPE_BY_ID[d.archetype]?.name[t.lang]}</span>
        </div>
      )}
    </div>
  );
}

export function CardModal({ defId, onClose, onSelect, actions }: { defId: string | null; onClose: () => void; onSelect?: (id: string) => void; actions?: React.ReactNode }) {
  const t = useT();
  const d = defId && hasDef(defId) ? getDef(defId) : null;
  const related = useMemo(() => (d?.archetype ? allCards().filter((c) => c.archetype === d.archetype && c.id !== d.id).slice(0, 10) : []), [d]);
  const stat = useMemo(() => (d ? META.cards.find((c) => c.id === d.id) : undefined), [d]);
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
