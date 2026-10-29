// Duel overlays: action menu, prompts, banners, effects, intro and game over.
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ActionOption, CardView, GameView, LogEntry, PlayerId, Position } from '../../engine';
import { getDef, hasDef } from '../../engine';
import { Card, CardBack } from '../components/Card';
import { CardText } from '../components/CardDetail';
import { useT } from '../i18n';
import { cardName } from '../lib/cards';

// ------------------------------------------------------------- action menu

export interface MenuEntry {
  label: string;
  run: () => void;
  primary?: boolean;
}

export function ActionMenu({ x, y, entries, onClose }: { x: number; y: number; entries: MenuEntry[]; onClose: () => void }) {
  useEffect(() => {
    const close = () => onClose();
    const id = setTimeout(() => window.addEventListener('click', close), 0);
    window.addEventListener('keydown', close);
    return () => {
      clearTimeout(id);
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', close);
    };
  }, [onClose]);
  const left = Math.min(Math.max(8, x - 80), window.innerWidth - 180);
  const top = Math.max(8, Math.min(y - 12 - entries.length * 42, window.innerHeight - entries.length * 42 - 20));
  return (
    <motion.div className="action-menu" style={{ left, top }} initial={{ opacity: 0, scale: 0.85, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} onClick={(e) => e.stopPropagation()}>
      {entries.map((e, i) => (
        <button
          key={i}
          className={`action-item ${e.primary ? 'primary' : ''}`}
          onClick={() => {
            e.run();
            onClose();
          }}
        >
          {e.label}
        </button>
      ))}
    </motion.div>
  );
}

// ---------------------------------------------------------------- prompts

export function PromptOverlay({ view, onAnswer }: { view: GameView; onAnswer: (choice: string[] | boolean | number | Position) => void }) {
  const t = useT();
  const p = view.prompt!;
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => setPicked([]), [p.id]);
  const cards = useMemo(() => {
    const byUid = new Map(view.promptCards.map((c) => [c.uid, c]));
    return (p.options ?? []).map((u) => byUid.get(u)).filter((c): c is CardView => !!c);
  }, [view.promptCards, p.options]);
  const min = p.min ?? 0;
  const max = p.max ?? 1;
  const source = p.source ? (view.promptCards.find((c) => c.uid === p.source) ?? findCard(view, p.source)) : undefined;

  const toggle = (uid: string) => {
    setPicked((cur) => {
      if (cur.includes(uid)) return cur.filter((x) => x !== uid);
      if (max === 1) return [uid];
      if (cur.length >= max) return cur;
      return [...cur, uid];
    });
  };

  return (
    <motion.div className="prompt-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="prompt" initial={{ y: 30, scale: 0.95 }} animate={{ y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 28 }}>
        <h3>{p.title[t.lang]}</h3>
        {p.kind === 'selectCards' && (
          <>
            <p className="muted small">{min === max ? t('duel.select', { n: min }) : t('duel.selectRange', { min, max })}</p>
            <div className="prompt-cards">
              {cards.map((c, i) => (
                <motion.button
                  key={c.uid}
                  className={`prompt-card ${picked.includes(c.uid) ? 'picked' : ''}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 12) * 0.03 }}
                  onClick={() => toggle(c.uid)}
                >
                  {c.defId ? <Card defId={c.defId} size="md" atk={c.atk} def={c.def} /> : <CardBack size="md" />}
                  <span className="prompt-card-zone">{zoneLabel(c, view.you, t)}</span>
                  {picked.includes(c.uid) && <span className="prompt-check">{picked.indexOf(c.uid) + 1}</span>}
                </motion.button>
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
              <button className="btn btn-primary" disabled={picked.length < Math.min(min, cards.length) || picked.length > max} onClick={() => onAnswer(picked)}>
                {t('duel.confirm')} ({picked.length})
              </button>
            </div>
          </>
        )}
        {p.kind === 'yesNo' && (
          <>
            {source?.defId && (
              <div className="prompt-source">
                <Card defId={source.defId} size="md" />
                <CardText defId={source.defId} compact />
              </div>
            )}
            <div className="row" style={{ justifyContent: 'center', marginTop: 16, gap: 12 }}>
              <button className="btn btn-primary btn-lg" onClick={() => onAnswer(true)}>
                {t('duel.yes')}
              </button>
              <button className="btn btn-lg" onClick={() => onAnswer(false)}>
                {t('duel.no')}
              </button>
            </div>
          </>
        )}
        {p.kind === 'position' && (
          <div className="position-pick">
            {(['atk', 'def'] as const).map((pos) => {
              const c = view.promptCards.find((x) => x.uid === p.uid);
              return (
                <button key={pos} className="position-opt" onClick={() => onAnswer(pos)}>
                  <div style={{ transform: pos === 'def' ? 'rotate(-90deg)' : undefined, transition: 'transform .3s' }}>{c?.defId ? <Card defId={c.defId} size="md" /> : <CardBack size="md" />}</div>
                  <span>{t(pos === 'atk' ? 'duel.atkPos' : 'duel.defPos')}</span>
                </button>
              );
            })}
          </div>
        )}
        {p.kind === 'option' && (
          <div className="row row-wrap" style={{ justifyContent: 'center', gap: 10 }}>
            {(p.labels ?? []).map((l, i) => (
              <button key={i} className="btn" onClick={() => onAnswer(i)}>
                {l[t.lang]}
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function zoneLabel(c: CardView, me: PlayerId, t: ReturnType<typeof useT>): string {
  const owner = c.controller === me ? t('duel.you') : '⚔';
  const z = { hand: '✋', deck: t('duel.deck'), gy: t('duel.gy'), banished: t('duel.banished'), extra: t('duel.extra'), mzone: 'M', szone: 'S/T', fzone: 'F', void: '' }[c.zone];
  return `${owner} · ${z}`;
}

export function findCard(view: GameView, uid: string): CardView | undefined {
  for (const p of view.players) {
    for (const c of [...p.hand, ...p.gy, ...p.banished, ...p.extra, ...p.mzone, ...p.szone, p.fzone]) if (c && c.uid === uid) return c;
  }
  for (const l of view.chain) if (l.card.uid === uid) return l.card;
  return undefined;
}

// --------------------------------------------------------------- banners

export function Banner({ text, kind }: { text: string; kind: 'turn-me' | 'turn-opp' | 'phase' }) {
  return (
    <motion.div className={`banner banner-${kind}`} initial={{ opacity: 0, scaleX: 0.3 }} animate={{ opacity: 1, scaleX: 1 }} exit={{ opacity: 0, scaleX: 1.2 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}>
      <span>{text}</span>
    </motion.div>
  );
}

export function ActivationSpotlight({ defId, link, mine }: { defId: string; link: number; mine: boolean }) {
  const t = useT();
  return (
    <motion.div className="spotlight" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className={`spotlight-card ${mine ? 'mine' : 'theirs'}`} initial={{ scale: 0.4, rotateY: 180, y: mine ? 120 : -120 }} animate={{ scale: 1, rotateY: 0, y: 0 }} exit={{ scale: 1.15, opacity: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 20 }}>
        <Card defId={defId} size="lg" />
        <span className="spotlight-ring" />
        {link > 0 && <span className="spotlight-link">{t('duel.chain')} {link}</span>}
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------- effects

export interface FxItem {
  id: number;
  kind: 'damage' | 'heal' | 'burst' | 'shock' | 'negate' | 'impact' | 'emote';
  x: number;
  y: number;
  text?: string;
  color?: string;
}

export function EffectsLayer({ items }: { items: FxItem[] }) {
  return (
    <div className="fx-layer" aria-hidden="true">
      <AnimatePresence>
        {items.map((f) => {
          switch (f.kind) {
            case 'damage':
            case 'heal':
              return (
                <motion.div key={f.id} className={`fx-number ${f.kind}`} style={{ left: f.x, top: f.y }} initial={{ opacity: 0, y: 0, scale: 0.5 }} animate={{ opacity: [0, 1, 1, 0], y: -70, scale: [0.5, 1.3, 1, 1] }} transition={{ duration: 1.5, times: [0, 0.15, 0.7, 1] }}>
                  {f.text}
                </motion.div>
              );
            case 'burst':
              return (
                <motion.div key={f.id} className="fx-burst" style={{ left: f.x, top: f.y }} initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.9 }}>
                  {Array.from({ length: 14 }, (_, i) => {
                    const a = (i / 14) * Math.PI * 2;
                    return <motion.i key={i} initial={{ x: 0, y: 0, scale: 1 }} animate={{ x: Math.cos(a) * 70, y: Math.sin(a) * 70, scale: 0 }} transition={{ duration: 0.8, ease: 'easeOut' }} style={{ background: f.color ?? '#ff7a5c' }} />;
                  })}
                  <motion.b initial={{ scale: 0.2, opacity: 0.9 }} animate={{ scale: 2.2, opacity: 0 }} transition={{ duration: 0.6 }} />
                </motion.div>
              );
            case 'shock':
              return <motion.div key={f.id} className="fx-shock" style={{ left: f.x, top: f.y, borderColor: f.color }} initial={{ scale: 0.2, opacity: 0.9 }} animate={{ scale: 2.6, opacity: 0 }} transition={{ duration: 0.75, ease: 'easeOut' }} />;
            case 'impact':
              return <motion.div key={f.id} className="fx-impact" style={{ left: f.x, top: f.y }} initial={{ scale: 0.3, opacity: 1 }} animate={{ scale: 1.8, opacity: 0 }} transition={{ duration: 0.5 }} />;
            case 'negate':
              return (
                <motion.div key={f.id} className="fx-negate" style={{ left: f.x, top: f.y }} initial={{ scale: 2.4, opacity: 0, rotate: -18 }} animate={{ scale: 1, opacity: [0, 1, 1, 0], rotate: -12 }} transition={{ duration: 1.3, times: [0, 0.2, 0.75, 1] }}>
                  {f.text}
                </motion.div>
              );
            case 'emote':
              return (
                <motion.div key={f.id} className="fx-emote" style={{ left: f.x, top: f.y }} initial={{ opacity: 0, y: 10, scale: 0.6 }} animate={{ opacity: [0, 1, 1, 0], y: -30, scale: 1 }} transition={{ duration: 2.2, times: [0, 0.1, 0.8, 1] }}>
                  {f.text}
                </motion.div>
              );
          }
        })}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------- intro

export function DuelIntro({ view, onDone }: { view: GameView; onDone: () => void }) {
  const t = useT();
  const me = view.players[view.you];
  const opp = view.players[view.you === 0 ? 1 : 0];
  const first = view.players[view.firstPlayer];
  return (
    <motion.div className="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.5 } }} onClick={onDone}>
      <motion.div className="intro-side left" initial={{ x: '-100%' }} animate={{ x: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 18 }}>
        <span className="avatar big">{me.name.slice(0, 1).toUpperCase()}</span>
        <h2>{me.name}</h2>
      </motion.div>
      <motion.div className="intro-vs" initial={{ scale: 4, opacity: 0, rotate: -20 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ delay: 0.35, type: 'spring', stiffness: 200, damping: 14 }}>
        {t('duel.vs')}
      </motion.div>
      <motion.div className="intro-side right" initial={{ x: '100%' }} animate={{ x: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 18 }}>
        <span className="avatar big opp">{opp.name.slice(0, 1).toUpperCase()}</span>
        <h2>{opp.name}</h2>
      </motion.div>
      <motion.div className="intro-coin" initial={{ rotateY: 0, opacity: 0 }} animate={{ rotateY: 1440 + (view.firstPlayer === view.you ? 0 : 180), opacity: 1 }} transition={{ delay: 0.7, duration: 1.2, ease: 'easeOut' }}>
        <span className="coin-face front">★</span>
        <span className="coin-face back">☾</span>
      </motion.div>
      <motion.p className="intro-first" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.9 }}>
        {t('duel.goesFirst', { name: first.name })}
      </motion.p>
    </motion.div>
  );
}

// ------------------------------------------------------------- game over

export function GameOverOverlay({ view, onRematch, onLeave, rematchState }: { view: GameView; onRematch: () => void; onLeave: () => void; rematchState?: 'none' | 'waiting' | 'offered' }) {
  const t = useT();
  const won = view.winner === view.you;
  const draw = view.winner === 'draw';
  const me = view.players[view.you];
  return (
    <motion.div className={`gameover ${won ? 'won' : draw ? 'draw' : 'lost'}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="gameover-rays" />
      <motion.h1 initial={{ scale: 0.3, opacity: 0, y: 40 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 180, damping: 14, delay: 0.2 }}>
        {draw ? t('duel.draw') : won ? t('duel.victory') : t('duel.defeat')}
      </motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="muted">
        {t(`duel.reason.${view.winReason ?? 'lp'}`)} · {t('duel.stats', { turns: view.turn, lp: me.lp })}
      </motion.p>
      <motion.div className="row" style={{ gap: 12, justifyContent: 'center' }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
        <button className="btn btn-primary btn-lg" onClick={onRematch} disabled={rematchState === 'waiting'}>
          {rematchState === 'waiting' ? t('duel.rematchWaiting') : t('duel.rematch')}
        </button>
        <button className="btn btn-lg" onClick={onLeave}>
          {t('duel.backToLobby')}
        </button>
      </motion.div>
      {rematchState === 'offered' && (
        <motion.p className="gameover-offer" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {t('duel.rematchOffered')}
        </motion.p>
      )}
    </motion.div>
  );
}

// ------------------------------------------------------------------ log

export function LogPanel({ log, view }: { log: LogEntry[]; view: GameView }) {
  const t = useT();
  const pname = (p?: PlayerId) => (p === undefined ? '' : view.players[p].name);
  const render = (e: LogEntry) => {
    const params: Record<string, string | number> = { ...(e.params ?? {}) };
    if (typeof params.card === 'string') params.card = cardName(params.card, t.lang);
    if (typeof params.target === 'string') params.target = params.target === '?' ? t('duel.hidden') : cardName(params.target, t.lang);
    params.player = pname(e.player);
    return t(e.key, params);
  };
  return (
    <div className="log">
      {[...log].reverse().slice(0, 60).map((e, i) => (
        <div key={log.length - i} className={`log-line ${e.key === 'log.turn' ? 'log-turn' : ''} ${e.player === view.you ? 'mine' : e.player === undefined ? '' : 'theirs'}`}>
          {render(e)}
        </div>
      ))}
    </div>
  );
}

export function PilesModal({ cards, title, onClose, onHover }: { cards: CardView[]; title: string; onClose: () => void; onHover: (c: CardView | null) => void }) {
  const t = useT();
  return (
    <motion.div className="prompt-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="prompt" initial={{ y: 30 }} animate={{ y: 0 }} onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h3 style={{ margin: 0 }}>
            {title} ({cards.length})
          </h3>
          <span className="spacer" />
          <button className="btn btn-sm" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
        {cards.length === 0 ? (
          <p className="faint">{t('duel.noCards')}</p>
        ) : (
          <div className="prompt-cards" style={{ marginTop: 14 }}>
            {[...cards].reverse().map((c) => (
              <div key={c.uid} onMouseEnter={() => onHover(c)} onMouseLeave={() => onHover(null)}>
                {c.defId && hasDef(c.defId) ? <Card defId={c.defId} size="md" /> : <CardBack size="md" />}
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export function PreviewPanel({ defId }: { defId: string | null }) {
  const t = useT();
  return (
    <div className="preview">
      <AnimatePresence mode="wait">
        {defId && hasDef(defId) ? (
          <motion.div key={defId} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <div className="preview-card">
              <Card defId={defId} size="lg" holo />
            </div>
            <CardText defId={defId} compact />
          </motion.div>
        ) : (
          <motion.p key="none" className="faint small preview-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {t('duel.hoverHint')}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export function optionLabel(o: ActionOption, t: ReturnType<typeof useT>): string {
  if (o.action.type === 'activate') {
    const d = o.uid ? undefined : undefined;
    void d;
  }
  return t(o.label);
}

export function describeCard(defId: string | null | undefined, lang: 'de' | 'en'): string {
  return defId && hasDef(defId) ? getDef(defId).name[lang] : '?';
}
