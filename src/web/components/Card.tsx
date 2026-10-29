// Card face / card back rendering: real cards show their official artwork
// image, DuelForge demo cards (and real cards whose image cannot be loaded)
// use the original procedural frame design.
import { memo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { getDef, hasDef } from '../../engine';
import { cardArtUrl } from '../art/generate';
import { useT } from '../i18n';
import { frameColor } from '../lib/cards';
import { realImage } from '../lib/carddb';
import { AttributeGlyph, Icon, SubtypeGlyph } from './Icons';
import '../styles/card.css';

export type CardSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface CardProps {
  defId: string | null;
  size?: CardSize;
  faceDown?: boolean;
  atk?: number;
  def?: number;
  holo?: boolean; // enable tilt + foil interaction
  className?: string;
  style?: CSSProperties;
  onClick?: (e: MouseEvent) => void;
  onContextMenu?: (e: MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  title?: string;
  count?: number;
  dim?: boolean;
  /** banlist limit to show as a badge (0 = forbidden) */
  limit?: number;
}

export const CardBack = memo(function CardBack({ size = 'md', className = '', style }: { size?: CardSize; className?: string; style?: CSSProperties }) {
  return (
    <div className={`card card-${size} card-back ${className}`} style={style}>
      <div className="card-back-inner">
        <svg viewBox="0 0 100 146" preserveAspectRatio="none" className="card-back-art" aria-hidden="true">
          <defs>
            <linearGradient id="cbg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#1a1f4d" />
              <stop offset="0.5" stopColor="#0b0e26" />
              <stop offset="1" stopColor="#2a1450" />
            </linearGradient>
            <linearGradient id="cbs" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#4de1ff" />
              <stop offset="1" stopColor="#b14dff" />
            </linearGradient>
          </defs>
          <rect width="100" height="146" fill="url(#cbg)" />
          <g stroke="url(#cbs)" fill="none" opacity="0.5" strokeWidth="0.6">
            {Array.from({ length: 9 }, (_, i) => (
              <circle key={i} cx="50" cy="73" r={8 + i * 7} opacity={1 - i * 0.09} />
            ))}
          </g>
          <g transform="translate(50 73)">
            <polygon points="0,-26 22.5,-13 22.5,13 0,26 -22.5,13 -22.5,-13" fill="#0b0e26" stroke="url(#cbs)" strokeWidth="2" />
            <rect x="-11" y="-14" width="13" height="19" rx="2" fill="none" stroke="#4de1ff" strokeWidth="1.6" transform="rotate(-14)" />
            <rect x="-3" y="-14" width="13" height="19" rx="2" fill="#0b0e26" stroke="#b14dff" strokeWidth="1.6" transform="rotate(12)" />
            <path d="M3 -6 L6 0 L3 6 L0 0 Z" fill="#ffcc4d" transform="rotate(12)" />
          </g>
          <text x="50" y="132" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="7.5" fill="#9fb0ff" letterSpacing="2">
            DUELFORGE
          </text>
        </svg>
      </div>
    </div>
  );
});

const fmtStat = (n: number) => (n < 0 ? '?' : String(n));

function CardFaceImpl({ defId, size = 'md', faceDown, atk, def, holo, className = '', style, onClick, onContextMenu, onMouseEnter, onMouseLeave, title, count, dim, limit }: CardProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState<string | null>(null);
  if (!defId || faceDown || !hasDef(defId)) return <CardBack size={size} className={className} style={style} />;
  const d = getDef(defId);
  const img = failed === defId ? null : realImage(defId, size === 'lg' || size === 'xl' ? 'full' : 'small');
  const shownLimit = limit ?? d.limit;
  const color = frameColor(d);
  const isMonster = d.kind === 'monster';
  const foil = d.rarity === 'super' || d.rarity === 'ultra' || d.rarity === 'secret';
  const shownAtk = atk ?? d.atk ?? 0;
  const shownDef = def ?? d.def ?? 0;
  const atkDelta = atk !== undefined ? atk - (d.atk ?? 0) : 0;
  const defDelta = def !== undefined ? def - (d.def ?? 0) : 0;

  const onMove = (e: MouseEvent) => {
    if (!holo || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    ref.current.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    ref.current.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
    ref.current.style.setProperty('--rx', `${((0.5 - y) * 18).toFixed(2)}deg`);
    ref.current.style.setProperty('--ry', `${((x - 0.5) * 22).toFixed(2)}deg`);
    ref.current.style.setProperty('--pos', `${(x * 100).toFixed(0)}% ${(y * 100).toFixed(0)}%`);
  };
  const onLeave = () => {
    if (holo && ref.current) {
      ref.current.style.setProperty('--rx', '0deg');
      ref.current.style.setProperty('--ry', '0deg');
    }
    onMouseLeave?.();
  };

  if (img) {
    const showStats = d.kind === 'monster' && (atk !== undefined || def !== undefined);
    return (
      <div
        ref={ref}
        className={`card card-${size} card-real kind-${d.kind} ${holo ? 'card-holo' : ''} ${dim ? 'card-dim' : ''} ${className}`}
        style={{ ...style, ['--fc' as string]: color }}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onMouseMove={onMove}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onLeave}
        title={title ?? d.name[t.lang]}
        data-def={defId}
      >
        <div className="card-tilt">
          <div className="card-frame">
            <img className="card-img" src={img} alt={d.name[t.lang]} draggable={false} loading="lazy" decoding="async" onError={() => setFailed(defId)} />
            {showStats && (
              <div className="card-real-stats">
                <span className={`card-stat atk ${atkDelta > 0 ? 'up' : atkDelta < 0 ? 'down' : ''}`}>{fmtStat(shownAtk)}</span>
                {!d.linkVal && <span className={`card-stat def ${defDelta > 0 ? 'up' : defDelta < 0 ? 'down' : ''}`}>{fmtStat(shownDef)}</span>}
              </div>
            )}
            {holo && <div className="card-glare" />}
          </div>
        </div>
        {count !== undefined && count > 1 ? <span className="card-count">×{count}</span> : null}
        {shownLimit !== undefined && shownLimit < 3 ? <span className={`card-limit ${shownLimit === 0 ? 'banned' : ''}`}>{shownLimit}</span> : null}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`card card-${size} kind-${d.kind} frame-${d.frame ?? d.kind} rarity-${d.rarity} ${holo ? 'card-holo' : ''} ${dim ? 'card-dim' : ''} ${className}`}
      style={{ ...style, ['--fc' as string]: color }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseMove={onMove}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onLeave}
      title={title}
      data-def={defId}
    >
      <div className="card-tilt">
        <div className="card-frame">
          <img className="card-art" src={cardArtUrl(d)} alt="" draggable={false} loading="lazy" decoding="async" />
          <div className="card-shade" />
          <div className="card-top">
            <span className="card-name">{d.name[t.lang]}</span>
            <span className="card-attr" style={{ color }}>
              <AttributeGlyph attr={isMonster ? (d.attribute ?? 'LIGHT') : d.kind === 'spell' ? 'SPELL' : 'TRAP'} size={12} />
            </span>
          </div>
          {isMonster && d.level ? (
            <div className="card-level" aria-label={`${t('card.level')} ${d.level}`}>
              {Array.from({ length: Math.min(d.level, 12) }, (_, i) => (
                <i key={i} />
              ))}
            </div>
          ) : null}
          {!isMonster && (d.spellType !== 'normal' || d.trapType !== 'normal') && (d.spellType || d.trapType) ? (
            <div className="card-subtype">
              <SubtypeGlyph type={d.spellType ?? d.trapType} size={10} />
            </div>
          ) : null}
          <div className="card-bottom">
            {isMonster ? (
              <>
                <span className={`card-stat atk ${atkDelta > 0 ? 'up' : atkDelta < 0 ? 'down' : ''}`}>
                  <Icon.Sword size={9} />
                  {fmtStat(shownAtk)}
                </span>
                <span className="card-type-mini">{d.frame && d.frame !== 'normal' && d.frame !== 'effect' ? '✦' : ''}</span>
                <span className={`card-stat def ${defDelta > 0 ? 'up' : defDelta < 0 ? 'down' : ''}`}>
                  <Icon.Shield size={9} />
                  {d.linkVal ? `L${d.linkVal}` : fmtStat(shownDef)}
                </span>
              </>
            ) : (
              <span className="card-kind-label">{t(d.kind === 'spell' ? 'kind.spell' : 'kind.trap')}</span>
            )}
          </div>
          {foil && <div className="card-foil" />}
          {holo && <div className="card-glare" />}
        </div>
      </div>
      {count !== undefined && count > 1 ? <span className="card-count">×{count}</span> : null}
      {shownLimit !== undefined && shownLimit < 3 ? <span className={`card-limit ${shownLimit === 0 ? 'banned' : ''}`}>{shownLimit}</span> : null}
    </div>
  );
}

export const Card = memo(CardFaceImpl);
