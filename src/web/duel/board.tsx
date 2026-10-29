// Board building blocks: zones, piles, hands, life panels, phase bar.
import { memo, useEffect, type MouseEvent } from 'react';
import { motion, useSpring, useTransform, AnimatePresence } from 'framer-motion';
import type { CardView, GameView, PlayerId, PlayerView } from '../../engine';
import { Card, CardBack } from '../components/Card';
import { useT } from '../i18n';

export interface CardUiState {
  selectable?: boolean;
  selected?: boolean;
  actionable?: boolean;
  target?: boolean;
  attacking?: boolean;
}

export interface BoardHandlers {
  onCard: (c: CardView, e: MouseEvent) => void;
  onHover: (c: CardView | null) => void;
  ui: (uid: string) => CardUiState;
  onPile: (player: PlayerId, pile: 'gy' | 'banished' | 'extra') => void;
}

const cls = (s: CardUiState) =>
  [s.selectable && 'is-selectable', s.selected && 'is-selected', s.actionable && 'is-actionable', s.target && 'is-target', s.attacking && 'is-attacking'].filter(Boolean).join(' ');

/** A card on the field / in a pile. Uses layoutId so it glides between zones. */
export const BoardCard = memo(function BoardCard({ c, me, h, size = 'sm', noLayout }: { c: CardView; me: PlayerId; h: BoardHandlers; size?: 'sm' | 'xs'; noLayout?: boolean }) {
  const state = h.ui(c.uid);
  const def = c.position === 'def' && c.zone === 'mzone';
  const ownSet = !c.faceUp && c.controller === me && c.defId && (c.zone === 'mzone' || c.zone === 'szone');
  const showFace = c.defId && (c.faceUp || ownSet) && c.zone !== 'deck';
  return (
    <motion.div
      layoutId={noLayout ? undefined : c.uid}
      className={`board-card ${cls(state)} ${def ? 'pos-def' : ''}`}
      data-uid={c.uid}
      initial={false}
      animate={{ rotate: def ? (c.controller === me ? -90 : 90) : 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      onClick={(e) => h.onCard(c, e)}
      onMouseEnter={() => h.onHover(c)}
      onMouseLeave={() => h.onHover(null)}
    >
      <div className="board-card-inner">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={showFace ? 'f' : 'b'}
            initial={{ rotateY: 90 }}
            animate={{ rotateY: 0 }}
            exit={{ rotateY: -90 }}
            transition={{ duration: 0.16 }}
            className={ownSet ? 'own-set' : ''}
          >
            {showFace ? <Card defId={c.defId} size={size} atk={c.zone === 'mzone' ? c.atk : undefined} def={c.zone === 'mzone' ? c.def : undefined} /> : <CardBack size={size} />}
          </motion.div>
        </AnimatePresence>
      </div>
      {ownSet && <span className="set-badge">SET</span>}
    </motion.div>
  );
});

function Slot({ kind, children }: { kind: 'm' | 's' | 'f'; children?: React.ReactNode }) {
  return <div className={`slot slot-${kind}`}>{children}</div>;
}

function Pile({ label, count, top, back, onClick, me, h, kind }: { label: string; count: number; top?: CardView; back?: boolean; onClick?: () => void; me: PlayerId; h: BoardHandlers; kind: string }) {
  return (
    <button className={`pile pile-${kind}`} onClick={onClick} disabled={!onClick} title={`${label}: ${count}`}>
      <div className="pile-stack" style={{ ['--depth' as string]: Math.min(6, Math.ceil(count / 6)) }}>
        {count > 0 ? top && !back ? <BoardCard c={top} me={me} h={{ ...h, onCard: () => onClick?.() }} /> : <CardBack size="sm" /> : <div className="pile-empty" />}
      </div>
      <span className="pile-count">{count}</span>
      <span className="pile-label">{label}</span>
    </button>
  );
}

export function FieldSide({ p, view, h, flipped }: { p: PlayerView; view: GameView; h: BoardHandlers; flipped: boolean }) {
  const t = useT();
  const me = view.you;
  const gyTop = p.gy[p.gy.length - 1];
  const banTop = p.banished[p.banished.length - 1];
  const mRow = (
    <div className="field-row">
      <Slot kind="f">{p.fzone && <BoardCard c={p.fzone} me={me} h={h} />}</Slot>
      {p.mzone.map((c, i) => (
        <Slot key={i} kind="m">
          {c && <BoardCard c={c} me={me} h={h} />}
        </Slot>
      ))}
      <div className="pile-col">
        <Pile kind="gy" label={t('duel.gy')} count={p.gy.length} top={gyTop} me={me} h={h} onClick={() => h.onPile(p.id, 'gy')} />
        {p.banished.length > 0 && <Pile kind="ban" label={t('duel.banished')} count={p.banished.length} top={banTop} me={me} h={h} onClick={() => h.onPile(p.id, 'banished')} />}
      </div>
    </div>
  );
  const sRow = (
    <div className="field-row">
      <Pile kind="extra" label={t('duel.extra')} count={p.extraCount} back me={me} h={h} onClick={p.id === me ? () => h.onPile(p.id, 'extra') : undefined} />
      {p.szone.map((c, i) => (
        <Slot key={i} kind="s">
          {c && <BoardCard c={c} me={me} h={h} />}
        </Slot>
      ))}
      <Pile kind="deck" label={t('duel.deck')} count={p.deckCount} back me={me} h={h} />
    </div>
  );
  return (
    <div className={`field-side ${flipped ? 'opp' : 'mine'} ${view.turnPlayer === p.id ? 'active-side' : ''}`}>
      {flipped ? (
        <>
          <div className="flip-row">{sRow}</div>
          <div className="flip-row">{mRow}</div>
        </>
      ) : (
        <>
          {mRow}
          {sRow}
        </>
      )}
    </div>
  );
}

export function Hand({ cards, me, h, opponent }: { cards: CardView[]; me: PlayerId; h: BoardHandlers; opponent?: boolean }) {
  const n = cards.length;
  const spread = Math.min(7, 44 / Math.max(1, n));
  return (
    <div className={`hand ${opponent ? 'hand-opp' : 'hand-mine'}`}>
      {cards.map((c, i) => {
        const off = i - (n - 1) / 2;
        const state = h.ui(c.uid);
        return (
          <motion.div
            key={c.uid}
            layoutId={c.uid}
            className={`hand-card ${cls(state)}`}
            data-uid={c.uid}
            initial={{ opacity: 0, y: opponent ? -80 : 80, x: opponent ? -160 : 160, rotate: opponent ? -20 : 20 }}
            animate={{ opacity: 1, x: 0, y: Math.abs(off) * (opponent ? -3 : 3), rotate: off * spread * (opponent ? -0.6 : 0.6) }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            whileHover={opponent ? undefined : { y: -28, scale: 1.12, zIndex: 50, transition: { type: 'spring', stiffness: 400, damping: 24 } }}
            style={{ zIndex: i + 1 }}
            onClick={(e) => h.onCard(c, e)}
            onMouseEnter={() => h.onHover(c)}
            onMouseLeave={() => h.onHover(null)}
          >
            {c.defId && !opponent ? <Card defId={c.defId} size="sm" /> : <CardBack size="sm" />}
          </motion.div>
        );
      })}
    </div>
  );
}

export function AnimatedNumber({ value }: { value: number }) {
  const spring = useSpring(value, { stiffness: 70, damping: 18 });
  const text = useTransform(spring, (v) => Math.round(v).toString());
  useEffect(() => {
    spring.set(value);
  }, [value, spring]);
  return <motion.span>{text}</motion.span>;
}

export function LifePanel({ p, view, isMe, connected, deadline }: { p: PlayerView; view: GameView; isMe: boolean; connected?: boolean; deadline?: number | null }) {
  const t = useT();
  const startLp = 8000;
  const ratio = Math.max(0, Math.min(1, p.lp / startLp));
  const acting = view.pending.player === p.id && view.winner === null;
  return (
    <div className={`life ${isMe ? 'life-me' : 'life-opp'} ${acting ? 'acting' : ''}`} data-lp={p.id}>
      <div className="life-head">
        <span className="avatar" aria-hidden="true">
          {p.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="life-name">
          {p.name}
          {isMe && <small> ({t('duel.you')})</small>}
        </span>
        {connected === false && <span className="badge badge-bad">offline</span>}
      </div>
      <div className="life-lp">
        <span className="lp-label">LP</span>
        <span className={`lp-value ${p.lp <= 2000 ? 'low' : ''}`}>
          <AnimatedNumber value={p.lp} />
        </span>
      </div>
      <div className="lp-bar">
        <motion.i animate={{ width: `${ratio * 100}%` }} transition={{ type: 'spring', stiffness: 80, damping: 20 }} className={p.lp <= 2000 ? 'low' : ''} />
      </div>
      <div className="life-meta">
        <span title={t('duel.deck')}>🂠 {p.deckCount}</span>
        <span title="Hand">✋ {p.hand.length}</span>
        <span title={t('duel.gy')}>⚰ {p.gy.length}</span>
      </div>
      {acting && deadline ? <Countdown deadline={deadline} /> : null}
    </div>
  );
}

function Countdown({ deadline }: { deadline: number }) {
  const total = 120_000;
  const left = Math.max(0, deadline - Date.now());
  return (
    <div className="countdown" key={deadline}>
      <motion.i initial={{ width: `${(left / total) * 100}%` }} animate={{ width: '0%' }} transition={{ duration: left / 1000, ease: 'linear' }} />
    </div>
  );
}

const PHASES = ['draw', 'standby', 'main1', 'battle', 'main2', 'end'] as const;

export function PhaseBar({ view }: { view: GameView }) {
  const t = useT();
  const mine = view.turnPlayer === view.you;
  return (
    <div className={`phase-bar ${mine ? 'mine' : 'theirs'}`}>
      <span className="turn-chip">{t('duel.turn', { n: view.turn })}</span>
      <div className="phases">
        {PHASES.map((ph) => (
          <span key={ph} className={`phase ${view.phase === ph ? 'active' : ''}`}>
            {view.phase === ph && <motion.span layoutId="phase-pill" className="phase-pill" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
            {t(`duel.phase.${ph}`)}
          </span>
        ))}
      </div>
      <span className="turn-owner">{mine ? t('duel.yourTurn') : t('duel.oppTurn')}</span>
    </div>
  );
}

export function ChainStack({ view, onHover }: { view: GameView; onHover: (c: CardView | null) => void }) {
  const t = useT();
  return (
    <AnimatePresence>
      {view.chain.length > 0 && (
        <motion.div className="chain-stack" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }}>
          <span className="chain-title">{t('duel.chain')}</span>
          {view.chain.map((l, i) => (
            <motion.div
              key={l.id}
              className={`chain-link ${l.player === view.you ? 'mine' : 'theirs'} ${l.negated ? 'negated' : ''}`}
              initial={{ opacity: 0, scale: 0.6, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.6 }}
              onMouseEnter={() => onHover(l.card)}
              onMouseLeave={() => onHover(null)}
            >
              <span className="chain-num">{i + 1}</span>
              <Card defId={l.card.defId} size="xs" />
            </motion.div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
