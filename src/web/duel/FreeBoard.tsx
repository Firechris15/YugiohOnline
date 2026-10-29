// Free duel board ("manual mode", like a real table or Dueling Book): every
// real card can be played – players move cards between zones and resolve
// effects themselves. The sandbox engine keeps zones, hidden information,
// Life Points and turns consistent.
import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { getDef, hasDef, isExtraDeckCard, type Phase, type PlayerId, type Position } from '../../engine';
import type { SbAction, SbCardView, SbEvent, SbPlayerView, SbView, SbZone } from '../../engine/sandbox';
import { Card, CardBack } from '../components/Card';
import { CardModal } from '../components/CardDetail';
import { Icon } from '../components/Icons';
import { Modal } from '../components/Layout';
import { useT } from '../i18n';
import { cardName } from '../lib/cards';
import { sfx } from '../lib/sound';
import { askConfirm } from '../store/ui';
import { ActionMenu, ActivationSpotlight, Banner, GameOverOverlay, PreviewPanel, type MenuEntry } from './overlays';
import { AnimatedNumber } from './board';

export interface FreeSource {
  mode: 'solo' | 'online';
  act: (a: SbAction) => void;
  leave: () => void;
  rematch: () => void;
  rematchState?: 'none' | 'waiting' | 'offered';
  connected?: [boolean, boolean];
  chat?: ReactNode;
}

type PileKind = 'gy' | 'banished' | 'extra' | 'deck';
const PHASES: Phase[] = ['draw', 'standby', 'main1', 'battle', 'main2', 'end'];
const FIELD: SbZone[] = ['mzone', 'szone', 'fzone', 'emz'];
const onField = (z: SbZone) => FIELD.includes(z);

interface Fx {
  id: number;
  kind: 'coin' | 'dice' | 'lp';
  player: PlayerId;
  text: string;
  good?: boolean;
}

// ------------------------------------------------------------------- pieces

function TokenFace({ c }: { c: SbCardView }) {
  return (
    <div className="card card-sm token-card">
      <div className="token-inner">
        <span className="token-label">TOKEN</span>
        <span className="token-stats">
          {c.token?.atk ?? 0} / {c.token?.def ?? 0}
        </span>
      </div>
    </div>
  );
}

function FreeCard({
  c,
  me,
  highlight,
  onClick,
  onHover,
  onDragStart,
}: {
  c: SbCardView;
  me: PlayerId;
  highlight?: 'attacker' | 'target' | 'pick';
  onClick: (c: SbCardView, e: MouseEvent) => void;
  onHover: (c: SbCardView | null) => void;
  onDragStart?: (c: SbCardView, e: DragEvent) => void;
}) {
  const monsterZone = c.zone === 'mzone' || c.zone === 'emz';
  const def = monsterZone && c.position === 'def';
  const ownSet = !c.faceUp && c.controller === me && !!c.defId && onField(c.zone);
  const showFace = !!c.token || (!!c.defId && hasDef(c.defId) && (c.faceUp || ownSet));
  const mine = (onField(c.zone) ? c.controller : c.owner) === me;
  return (
    <motion.div
      layoutId={c.uid}
      className={`board-card ${def ? 'pos-def' : ''} ${highlight === 'attacker' ? 'is-attacking' : highlight === 'target' ? 'is-target' : highlight === 'pick' ? 'is-selectable' : ''}`}
      data-uid={c.uid}
      initial={false}
      animate={{ rotate: def ? (c.controller === me ? -90 : 90) : 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      onClick={(e) => onClick(c, e)}
      onContextMenu={(e) => {
        e.preventDefault();
        onClick(c, e);
      }}
      onMouseEnter={() => onHover(c)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="board-card-inner" draggable={mine && !!onDragStart} onDragStart={(e) => onDragStart?.(c, e)}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={showFace ? 'f' : 'b'} initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} exit={{ rotateY: -90 }} transition={{ duration: 0.16 }} className={ownSet ? 'own-set' : ''}>
            {c.token ? <TokenFace c={c} /> : showFace ? <Card defId={c.defId} size="sm" atk={monsterZone && c.faceUp ? getDef(c.defId!).atk : undefined} /> : <CardBack size="sm" />}
          </motion.div>
        </AnimatePresence>
      </div>
      {ownSet && <span className="set-badge">SET</span>}
      {c.counters > 0 && <span className="counter-badge">{c.counters}</span>}
    </motion.div>
  );
}

function DropSlot({ kind, onDrop, children, active }: { kind: 'm' | 's' | 'f' | 'e'; onDrop: (e: DragEvent) => void; children?: ReactNode; active: boolean }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`slot slot-${kind === 'e' ? 'm slot-emz' : kind} ${over ? 'drop-over' : ''} ${active ? 'drop-ready' : ''}`}
      onDragOver={(e) => {
        if (!active) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (active) onDrop(e);
      }}
    >
      {children}
    </div>
  );
}

function FreePile({
  kind,
  label,
  count,
  top,
  onClick,
  onDrop,
  dragActive,
}: {
  kind: PileKind;
  label: string;
  count: number;
  top?: SbCardView;
  onClick?: (e: MouseEvent) => void;
  onDrop?: (e: DragEvent) => void;
  dragActive: boolean;
}) {
  const [over, setOver] = useState(false);
  const face = top && top.defId && hasDef(top.defId) && (kind === 'gy' || kind === 'banished' || (kind === 'extra' && top.faceUp));
  return (
    <button
      className={`pile pile-${kind === 'banished' ? 'ban' : kind} ${over ? 'drop-over' : ''} ${dragActive && onDrop ? 'drop-ready' : ''}`}
      onClick={onClick}
      disabled={!onClick}
      title={`${label}: ${count}`}
      onDragOver={(e) => {
        if (!onDrop || !dragActive) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        onDrop?.(e);
      }}
    >
      <div className="pile-stack" style={{ ['--depth' as string]: Math.min(6, Math.ceil(count / 6)) }}>
        {count > 0 ? face ? <motion.div layoutId={top!.uid}><Card defId={top!.defId} size="sm" /></motion.div> : <CardBack size="sm" /> : <div className="pile-empty" />}
      </div>
      <span className="pile-count">{count}</span>
      <span className="pile-label">{label}</span>
    </button>
  );
}

function FreeLife({ p, isMe, active, connected, onLp, fx }: { p: SbPlayerView; isMe: boolean; active: boolean; connected?: boolean; onLp: () => void; fx: Fx[] }) {
  const t = useT();
  const ratio = Math.max(0, Math.min(1, p.lp / 8000));
  return (
    <div className={`life ${isMe ? 'life-me' : 'life-opp'} ${active ? 'acting' : ''}`} data-lp={p.id}>
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
      <button className="life-lp lp-button" onClick={onLp} title={t('free.lpTitle')}>
        <span className="lp-label">LP</span>
        <span className={`lp-value ${p.lp <= 2000 ? 'low' : ''}`}>
          <AnimatedNumber value={p.lp} />
        </span>
        <Icon.Edit size={13} />
        <AnimatePresence>
          {fx.map((f) => (
            <motion.span key={f.id} className={`lp-float ${f.good ? 'heal' : 'damage'}`} initial={{ opacity: 0, y: 6, scale: 0.6 }} animate={{ opacity: [0, 1, 1, 0], y: -34, scale: 1.1 }} transition={{ duration: 1.6, times: [0, 0.15, 0.7, 1] }}>
              {f.text}
            </motion.span>
          ))}
        </AnimatePresence>
      </button>
      <div className="lp-bar">
        <motion.i animate={{ width: `${ratio * 100}%` }} transition={{ type: 'spring', stiffness: 80, damping: 20 }} className={p.lp <= 2000 ? 'low' : ''} />
      </div>
      <div className="life-meta">
        <span title={t('free.deck')}>🂠 {p.deckCount}</span>
        <span title={t('free.hand')}>✋ {p.hand.length}</span>
        <span title={t('free.gy')}>⚰ {p.gy.length}</span>
        <span title={t('free.extra')}>✦ {p.extraCount}</span>
      </div>
    </div>
  );
}

function FreeLog({ view }: { view: SbView }) {
  const t = useT();
  const card = (v: string | number | undefined) => (v === '?' || v === undefined ? t('duel.hidden') : cardName(String(v), t.lang));
  return (
    <div className="log">
      {[...view.log].reverse().slice(0, 80).map((e, i) => {
        const p = { ...(e.params ?? {}) } as Record<string, string | number>;
        if ('card' in p) p.card = card(p.card);
        if ('target' in p && e.key.endsWith('attack')) p.target = card(p.target);
        if (typeof p.from === 'string' && e.key === 'free.log.move') p.from = t(`free.zone.${p.from}`);
        if (typeof p.to === 'string') p.to = t(`free.zone.${p.to}`);
        if (typeof p.phase === 'string') p.phase = t(`duel.phaseName.${p.phase}`);
        p.player = view.players[e.player]?.name ?? '';
        return (
          <div key={view.log.length - i} className={`log-line ${e.key === 'free.log.turn' ? 'log-turn' : ''} ${e.player === view.you ? 'mine' : 'theirs'}`}>
            {t(e.key, p)}
          </div>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------------- board

export function FreeBoard({ view, source }: { view: SbView; source: FreeSource }) {
  const t = useT();
  const me = view.you;
  const opp: PlayerId = me === 0 ? 1 : 0;
  const P = view.players;
  const myTurn = view.turnPlayer === me;
  const over = view.winner !== null;
  const [hover, setHover] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; entries: MenuEntry[] } | null>(null);
  const [pile, setPile] = useState<{ player: PlayerId; kind: PileKind } | null>(null);
  const [attackFrom, setAttackFrom] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [lpFor, setLpFor] = useState<PlayerId | null>(null);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [side, setSide] = useState<'log' | 'chat'>('log');
  const [fx, setFx] = useState<Fx[]>([]);
  const [banner, setBanner] = useState<{ id: number; text: string; kind: 'turn-me' | 'turn-opp' | 'phase' } | null>(null);
  const [spot, setSpot] = useState<{ id: number; defId: string; mine: boolean } | null>(null);
  const [flash, setFlash] = useState<{ attacker: string; target: string | null } | null>(null);
  const seen = useRef<number | null>(null);
  const fxId = useRef(1);

  // ------------------------------------------------------------ all cards
  const cards = useMemo(() => {
    const m = new Map<string, SbCardView>();
    for (const p of P) {
      for (const c of [...p.hand, ...p.gy, ...p.banished, ...p.extra, ...p.deck]) m.set(c.uid, c);
      for (const c of [...p.mzone, ...p.szone, p.fzone]) if (c) m.set(c.uid, c);
    }
    for (const c of view.emz) if (c) m.set(c.uid, c);
    return m;
  }, [view, P]);

  const isMine = (c: SbCardView) => (onField(c.zone) ? c.controller : c.owner) === me;

  // --------------------------------------------------- event animations
  useEffect(() => {
    if (seen.current === null) {
      seen.current = view.eventSeq;
      return;
    }
    const fresh = view.events.filter((e) => e.seq > (seen.current ?? 0));
    seen.current = Math.max(seen.current, view.eventSeq);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const pushFx = (f: Omit<Fx, 'id'>, ms = 1700) => {
      const id = fxId.current++;
      setFx((cur) => [...cur.slice(-6), { ...f, id }]);
      timers.push(setTimeout(() => setFx((cur) => cur.filter((x) => x.id !== id)), ms));
    };
    for (const e of fresh as SbEvent[]) {
      switch (e.type) {
        case 'draw':
          sfx.draw();
          break;
        case 'play':
          if (e.hidden || !e.defId || !hasDef(e.defId)) sfx.set();
          else if (getDef(e.defId).kind === 'monster') sfx.summon();
          else {
            sfx.activate();
            setSpot({ id: e.seq, defId: e.defId, mine: e.player === me });
            timers.push(setTimeout(() => setSpot((s) => (s?.id === e.seq ? null : s)), 1300));
          }
          break;
        case 'reveal':
          if (e.defId && hasDef(e.defId)) {
            setSpot({ id: e.seq, defId: e.defId, mine: e.player === me });
            timers.push(setTimeout(() => setSpot((s) => (s?.id === e.seq ? null : s)), 1800));
          }
          break;
        case 'flip':
        case 'control':
          sfx.activate();
          break;
        case 'set':
          sfx.set();
          break;
        case 'attack':
          sfx.attack();
          if (e.uid) {
            setFlash({ attacker: e.uid, target: e.target ?? null });
            timers.push(setTimeout(() => setFlash(null), 1400));
          }
          break;
        case 'lp':
          if ((e.amount ?? 0) < 0) sfx.hit();
          else sfx.heal();
          pushFx({ kind: 'lp', player: e.player, text: `${(e.amount ?? 0) > 0 ? '+' : ''}${e.amount}`, good: (e.amount ?? 0) > 0 });
          break;
        case 'coin':
          sfx.click();
          pushFx({ kind: 'coin', player: e.player, text: e.text === 'heads' ? t('free.log.heads', { player: P[e.player].name }) : t('free.log.tails', { player: P[e.player].name }), good: e.text === 'heads' }, 2400);
          break;
        case 'dice':
          sfx.click();
          pushFx({ kind: 'dice', player: e.player, text: String(e.amount ?? 1) }, 2400);
          break;
        case 'turn':
          sfx.turn();
          setBanner({ id: e.seq, text: e.player === me ? t('free.yourTurn') : t('free.oppTurn'), kind: e.player === me ? 'turn-me' : 'turn-opp' });
          timers.push(setTimeout(() => setBanner((b) => (b?.id === e.seq ? null : b)), 1300));
          break;
        case 'phase':
          sfx.phase();
          break;
        case 'move':
          if (e.to === 'gy' && e.from && onField(e.from)) sfx.destroy();
          break;
        case 'shuffle':
          sfx.draw();
          break;
      }
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.eventSeq]);

  // ------------------------------------------------------------- actions
  const act = (a: SbAction) => {
    if (over) return;
    source.act(a);
  };
  const move = (c: SbCardView, to: SbZone, extra: Partial<Extract<SbAction, { type: 'move' }>> = {}) => act({ type: 'move', uid: c.uid, to, ...extra });

  const isExtraCard = (c: SbCardView) => !!c.defId && hasDef(c.defId) && isExtraDeckCard(getDef(c.defId));
  const isPendulum = (c: SbCardView) => !!c.defId && hasDef(c.defId) && !!getDef(c.defId).pendulum;

  /** Entries to put a card onto a field zone (summon / set / activate). */
  const placeEntries = (c: SbCardView, zone?: SbZone, slot?: number): MenuEntry[] => {
    const d = c.defId && hasDef(c.defId) ? getDef(c.defId) : null;
    if (!d) return [];
    const out: MenuEntry[] = [];
    const monster = d.kind === 'monster';
    if (monster && (!zone || zone === 'mzone' || zone === 'emz')) {
      const to = zone ?? 'mzone';
      out.push({ label: `✦ ${t('free.summonAtk')}`, primary: true, run: () => move(c, to, { slot, faceUp: true, position: 'atk' }) });
      out.push({ label: `🛡 ${t('free.summonDef')}`, run: () => move(c, to, { slot, faceUp: true, position: 'def' }) });
      if (c.zone === 'hand' || c.zone === 'deck') out.push({ label: `▣ ${t('free.set')}`, run: () => move(c, to, { slot, faceUp: false, position: 'def' }) });
      if (!zone && isExtraCard(c)) out.push({ label: `⬡ ${t('free.toEmz')}`, run: () => move(c, 'emz', { faceUp: true, position: 'atk' }) });
    }
    if (monster && isPendulum(c) && (!zone || zone === 'szone') && c.zone !== 'extra') {
      out.push({ label: `◆ ${t('free.activate')} (${t('frame.pendulum')})`, run: () => move(c, 'szone', { slot: slot ?? (P[me].szone[0] === null ? 0 : 4), faceUp: true }) });
    }
    if (!monster) {
      const field = d.spellType === 'field';
      const to: SbZone = zone && zone !== 'mzone' && zone !== 'emz' ? zone : field ? 'fzone' : 'szone';
      out.push({ label: `✧ ${t('free.activate')}`, primary: true, run: () => move(c, to, { slot, faceUp: true }) });
      out.push({ label: `▣ ${t('free.set')}`, run: () => move(c, to, { slot, faceUp: false }) });
    }
    if (zone === 'szone' && monster && !isPendulum(c)) out.push({ label: `✧ ${t('free.toField')}`, run: () => move(c, 'szone', { slot, faceUp: true }) });
    return out;
  };

  const leaveEntries = (c: SbCardView): MenuEntry[] => {
    const out: MenuEntry[] = [];
    const extra = isExtraCard(c);
    if (c.zone !== 'hand' && !extra && !c.token) out.push({ label: `✋ ${t('free.toHand')}`, run: () => move(c, 'hand') });
    if (c.zone !== 'gy' && !c.token) out.push({ label: `⚰ ${t('free.toGy')}`, run: () => move(c, 'gy') });
    if (c.zone !== 'banished' && !c.token) out.push({ label: `✕ ${t('free.banish')}`, run: () => move(c, 'banished') });
    if (c.token && onField(c.zone)) out.push({ label: `✕ ${t('free.toGy')}`, run: () => move(c, 'gy') });
    if (!extra && !c.token && c.zone !== 'deck') {
      out.push({ label: `⤒ ${t('free.toDeckTop')}`, run: () => move(c, 'deck') });
      out.push({ label: `⤓ ${t('free.toDeckBottom')}`, run: () => move(c, 'deck', { bottom: true }) });
    }
    if (c.zone !== 'extra' && (extra || isPendulum(c))) out.push({ label: `⬡ ${t('free.toExtra')}`, run: () => move(c, 'extra', { faceUp: isPendulum(c) && !extra ? true : undefined }) });
    return out;
  };

  const openMenu = (e: MouseEvent | DragEvent, entries: MenuEntry[]) => {
    if (!entries.length) return;
    const r = (e.currentTarget as HTMLElement | null)?.getBoundingClientRect?.();
    const x = 'clientX' in e && e.clientX ? e.clientX : r ? r.left + r.width / 2 : window.innerWidth / 2;
    const y = r ? r.top : 'clientY' in e ? e.clientY : window.innerHeight / 2;
    setMenu({ x, y, entries });
  };

  const details = (c: SbCardView): MenuEntry[] => (c.defId && hasDef(c.defId) ? [{ label: `🔍 ${t('free.details')}`, run: () => setDetail(c.defId) }] : []);

  const onCard = (c: SbCardView, e: MouseEvent) => {
    e.stopPropagation();
    if (c.defId && hasDef(c.defId)) setHover(c.defId);
    if (over) return;
    // choosing an attack target
    if (attackFrom) {
      const attacker = cards.get(attackFrom);
      if (attacker && !isMine(c) && (c.zone === 'mzone' || c.zone === 'emz')) act({ type: 'attack', uid: attacker.uid, target: c.uid });
      setAttackFrom(null);
      return;
    }
    const entries: MenuEntry[] = [];
    if (!isMine(c)) {
      if (c.zone === 'mzone' || c.zone === 'szone') entries.push({ label: `⇄ ${t('free.takeControl')}`, run: () => act({ type: 'control', uid: c.uid }) });
      if (onField(c.zone)) {
        entries.push({ label: `＋ ${t('free.counterAdd')}`, run: () => act({ type: 'counter', uid: c.uid, delta: 1 }) });
        if (c.counters > 0) entries.push({ label: `－ ${t('free.counterRemove')}`, run: () => act({ type: 'counter', uid: c.uid, delta: -1 }) });
      }
      entries.push(...details(c));
      return openMenu(e, entries);
    }
    switch (c.zone) {
      case 'hand':
        entries.push(...placeEntries(c));
        entries.push({ label: `👁 ${t('free.reveal')}`, run: () => act({ type: 'reveal', uid: c.uid }) });
        entries.push(...leaveEntries(c));
        break;
      case 'mzone':
      case 'emz':
        if (c.faceUp && myTurn) entries.push({ label: `⚔ ${t('free.attack')}`, primary: true, run: () => setAttackFrom(c.uid) });
        if (c.faceUp) entries.push({ label: `⟲ ${t('free.changePos')}`, run: () => act({ type: 'position', uid: c.uid }) });
        if (!c.token) entries.push({ label: `↻ ${t('free.flip')}`, run: () => act({ type: 'flip', uid: c.uid }) });
        entries.push({ label: `＋ ${t('free.counterAdd')}`, run: () => act({ type: 'counter', uid: c.uid, delta: 1 }) });
        if (c.counters > 0) entries.push({ label: `－ ${t('free.counterRemove')}`, run: () => act({ type: 'counter', uid: c.uid, delta: -1 }) });
        entries.push(...leaveEntries(c));
        break;
      case 'szone':
      case 'fzone':
        entries.push({ label: c.faceUp ? `↻ ${t('free.flip')}` : `✧ ${t('free.activate')}`, primary: !c.faceUp, run: () => act({ type: 'flip', uid: c.uid }) });
        if (c.faceUp && c.defId && hasDef(c.defId) && getDef(c.defId).kind === 'monster') entries.push(...placeEntries(c, 'mzone'));
        entries.push({ label: `＋ ${t('free.counterAdd')}`, run: () => act({ type: 'counter', uid: c.uid, delta: 1 }) });
        if (c.counters > 0) entries.push({ label: `－ ${t('free.counterRemove')}`, run: () => act({ type: 'counter', uid: c.uid, delta: -1 }) });
        entries.push(...leaveEntries(c));
        break;
      default:
        // gy, banished, extra, deck (from the pile viewer)
        entries.push(...placeEntries(c));
        entries.push(...leaveEntries(c));
        if (c.zone === 'banished' && c.faceUp) entries.push({ label: `✕ ${t('free.banishFd')}`, run: () => move(c, 'banished', { faceUp: false }) });
    }
    entries.push(...details(c));
    openMenu(e, entries);
  };

  // -------------------------------------------------------- drag & drop
  const onDragStart = (c: SbCardView, e: DragEvent) => {
    e.dataTransfer.setData('text/plain', c.uid);
    e.dataTransfer.effectAllowed = 'move';
    setDragging(c.uid);
    setMenu(null);
  };
  useEffect(() => {
    const end = () => setDragging(null);
    window.addEventListener('dragend', end);
    window.addEventListener('drop', end);
    return () => {
      window.removeEventListener('dragend', end);
      window.removeEventListener('drop', end);
    };
  }, []);

  const dropTo = (zone: SbZone, slot: number | undefined, e: DragEvent) => {
    e.preventDefault();
    const uid = e.dataTransfer.getData('text/plain') || dragging;
    setDragging(null);
    const c = uid ? cards.get(uid) : undefined;
    if (!c || !isMine(c)) return;
    if (onField(zone) && !onField(c.zone)) {
      // from hand / piles: ask how to place it
      const entries = placeEntries(c, zone, slot);
      if (entries.length === 1) entries[0].run();
      else openMenu(e, entries);
      return;
    }
    if (onField(zone)) return move(c, zone, { slot, faceUp: c.faceUp, position: zone === 'mzone' || zone === 'emz' ? c.position : undefined });
    move(c, zone);
  };

  // -------------------------------------------------------------- layout
  const side0 = (p: SbPlayerView, flipped: boolean) => {
    const mine = p.id === me;
    const drop = (zone: SbZone, slot?: number) => (mine ? (e: DragEvent) => dropTo(zone, slot, e) : undefined);
    const highlight = (c: SbCardView) =>
      flash?.attacker === c.uid || attackFrom === c.uid ? 'attacker' : flash?.target === c.uid ? 'target' : attackFrom && !mine && (c.zone === 'mzone' || c.zone === 'emz') ? 'pick' : undefined;
    const cardEl = (c: SbCardView) => <FreeCard c={c} me={me} onClick={onCard} onHover={(x) => x?.defId && hasDef(x.defId) && setHover(x.defId)} onDragStart={mine ? onDragStart : undefined} highlight={highlight(c)} />;
    const mRow = (
      <div className="field-row">
        <DropSlot kind="f" active={mine && !!dragging} onDrop={(e) => drop('fzone')?.(e)}>
          {p.fzone && cardEl(p.fzone)}
        </DropSlot>
        {p.mzone.map((c, i) => (
          <DropSlot key={i} kind="m" active={mine && !!dragging} onDrop={(e) => drop('mzone', i)?.(e)}>
            {c && cardEl(c)}
          </DropSlot>
        ))}
        <div className="pile-col">
          <FreePile kind="gy" label={t('free.gy')} count={p.gy.length} top={p.gy[p.gy.length - 1]} onClick={() => setPile({ player: p.id, kind: 'gy' })} onDrop={drop('gy')} dragActive={!!dragging} />
          {(p.banished.length > 0 || (mine && dragging)) && (
            <FreePile kind="banished" label={t('free.banished')} count={p.banished.length} top={p.banished[p.banished.length - 1]} onClick={() => setPile({ player: p.id, kind: 'banished' })} onDrop={drop('banished')} dragActive={!!dragging} />
          )}
        </div>
      </div>
    );
    const sRow = (
      <div className="field-row">
        <FreePile kind="extra" label={t('free.extra')} count={p.extraCount} top={p.extra.find((c) => c.faceUp)} onClick={() => setPile({ player: p.id, kind: 'extra' })} onDrop={drop('extra')} dragActive={!!dragging} />
        {p.szone.map((c, i) => (
          <DropSlot key={i} kind="s" active={mine && !!dragging} onDrop={(e) => drop('szone', i)?.(e)}>
            {c && cardEl(c)}
          </DropSlot>
        ))}
        <FreePile
          kind="deck"
          label={t('free.deck')}
          count={p.deckCount}
          dragActive={!!dragging}
          onDrop={drop('deck')}
          onClick={
            mine && !over
              ? (e) =>
                  openMenu(e, [
                    { label: `⇣ ${t('free.draw')}`, primary: true, run: () => act({ type: 'draw' }) },
                    { label: `🔀 ${t('free.shuffle')}`, run: () => act({ type: 'shuffle' }) },
                    {
                      label: `👁 ${t('free.viewDeck')}`,
                      run: () => {
                        act({ type: 'viewDeck' });
                        setPile({ player: me, kind: 'deck' });
                      },
                    },
                    { label: `⚰ ${t('free.mill')}`, run: () => act({ type: 'mill', n: 1 }) },
                  ])
              : undefined
          }
        />
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
  };

  const emzOrder = me === 0 ? [0, 1] : [1, 0];
  const emzSlot = (i: number) => {
    const c = view.emz[i];
    return (
      <DropSlot key={i} kind="e" active={!!dragging} onDrop={(e) => dropTo('emz', i, e)}>
        {c && (
          <FreeCard
            c={c}
            me={me}
            onClick={onCard}
            onHover={(x) => x?.defId && hasDef(x.defId) && setHover(x.defId)}
            onDragStart={c.controller === me ? onDragStart : undefined}
            highlight={flash?.attacker === c.uid || attackFrom === c.uid ? 'attacker' : flash?.target === c.uid ? 'target' : attackFrom && c.controller !== me ? 'pick' : undefined}
          />
        )}
      </DropSlot>
    );
  };

  const pileCards = pile ? (pile.kind === 'deck' ? P[pile.player].deck : P[pile.player][pile.kind]) : [];
  const pileTitle = pile ? `${P[pile.player].name} – ${t(`free.${pile.kind === 'banished' ? 'banished' : pile.kind}`)}` : '';
  const coin = fx.filter((f) => f.kind === 'coin' || f.kind === 'dice').slice(-1)[0];

  return (
    <div
      className="duel free-duel"
      onClick={() => {
        if (attackFrom) setAttackFrom(null);
      }}
    >
      <aside className="duel-left">
        <PreviewPanel defId={hover} />
        <div className="duel-tabs">
          <button className={`btn btn-sm ${side === 'log' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSide('log')}>
            <Icon.Log size={14} /> {t('free.log')}
          </button>
          {source.chat && (
            <button className={`btn btn-sm ${side === 'chat' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSide('chat')}>
              <Icon.Chat size={14} /> {t('duel.chat')}
            </button>
          )}
        </div>
        {side === 'log' || !source.chat ? <FreeLog view={view} /> : source.chat}
      </aside>

      <main className="duel-main">
        <LayoutGroup>
          <div className="hand hand-opp">
            {P[opp].hand.map((c, i) => (
              <motion.div key={c.uid} layoutId={c.uid} className="hand-card" initial={{ opacity: 0, y: -60 }} animate={{ opacity: 1, y: 0, rotate: (i - (P[opp].hand.length - 1) / 2) * -3 }}>
                <CardBack size="sm" />
              </motion.div>
            ))}
          </div>
          <div className="field">
            {side0(P[opp], true)}
            <div className="mid free-mid">
              {emzSlot(emzOrder[0])}
              <div className="phase-bar free-phase-bar">
                <span className="turn-chip">{t('duel.turn', { n: view.turn })}</span>
                <div className="phases">
                  {PHASES.map((ph) => (
                    <button key={ph} className={`phase ${view.phase === ph ? 'active' : ''}`} disabled={!myTurn || over} onClick={() => act({ type: 'phase', to: ph })}>
                      {view.phase === ph && <motion.span layoutId="free-phase-pill" className="phase-pill" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
                      {t(`duel.phase.${ph}`)}
                    </button>
                  ))}
                </div>
                <span className="turn-owner">{myTurn ? t('free.yourTurn') : t('free.oppTurn')}</span>
              </div>
              {emzSlot(emzOrder[1])}
            </div>
            {side0(P[me], false)}
          </div>
          <div className="hand hand-mine">
            {P[me].hand.map((c, i) => {
              const off = i - (P[me].hand.length - 1) / 2;
              return (
                <motion.div
                  key={c.uid}
                  layoutId={c.uid}
                  className="hand-card"
                  data-uid={c.uid}
                  initial={{ opacity: 0, y: 80, x: 160, rotate: 20 }}
                  animate={{ opacity: 1, x: 0, y: Math.abs(off) * 3, rotate: off * Math.min(4, 26 / Math.max(1, P[me].hand.length)) }}
                  whileHover={{ y: -28, scale: 1.12, zIndex: 50, transition: { type: 'spring', stiffness: 400, damping: 24 } }}
                  transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                  style={{ zIndex: i + 1 }}
                  onClick={(e) => onCard(c, e)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onCard(c, e);
                  }}
                  onMouseEnter={() => c.defId && hasDef(c.defId) && setHover(c.defId)}
                >
                  <div draggable={!over} onDragStart={(e) => onDragStart(c, e)}>
                    {c.defId && hasDef(c.defId) ? <Card defId={c.defId} size="sm" /> : <CardBack size="sm" />}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </LayoutGroup>

        <AnimatePresence>
          {attackFrom && (
            <motion.div className="select-bar" initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <span>{t('free.pickTarget')}</span>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => {
                  act({ type: 'attack', uid: attackFrom, target: null });
                  setAttackFrom(null);
                }}
              >
                {t('free.attackDirect')}
              </button>
              <button className="btn btn-sm" onClick={() => setAttackFrom(null)}>
                {t('duel.cancel')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <aside className="duel-right">
        <FreeLife p={P[opp]} isMe={false} active={view.turnPlayer === opp} connected={source.connected?.[opp]} onLp={() => !over && setLpFor(opp)} fx={fx.filter((f) => f.kind === 'lp' && f.player === opp)} />
        <div className="duel-controls">
          <button className="btn" disabled={over || P[me].deckCount === 0} onClick={() => act({ type: 'draw' })}>
            ⇣ {t('free.draw')}
          </button>
          <button className="btn btn-gold" disabled={!myTurn || over} onClick={() => act({ type: 'endTurn' })}>
            {t('free.endTurn')} ⏭
          </button>
          <div className="free-tools">
            <button className="btn btn-sm" disabled={over} onClick={() => act({ type: 'coin' })} title={t('free.coin')}>
              🪙 <span>{t('free.coin')}</span>
            </button>
            <button className="btn btn-sm" disabled={over} onClick={() => act({ type: 'dice' })} title={t('free.dice')}>
              🎲 <span>{t('free.dice')}</span>
            </button>
            <button className="btn btn-sm" disabled={over} onClick={() => setTokenOpen(true)} title={t('free.token')}>
              ◇ <span>{t('free.token')}</span>
            </button>
          </div>
          <button
            className="btn btn-ghost btn-sm surrender"
            onClick={() => {
              if (over) return source.leave();
              void askConfirm(t('duel.surrenderConfirm')).then((ok) => ok && act({ type: 'surrender' }));
            }}
          >
            <Icon.Flag size={14} /> {t('free.surrender')}
          </button>
        </div>
        <FreeLife p={P[me]} isMe active={myTurn} connected={source.connected?.[me]} onLp={() => !over && setLpFor(me)} fx={fx.filter((f) => f.kind === 'lp' && f.player === me)} />
      </aside>

      <AnimatePresence>{banner && <Banner key={banner.id} text={banner.text} kind={banner.kind} />}</AnimatePresence>
      <AnimatePresence>{spot && <ActivationSpotlight key={spot.id} defId={spot.defId} link={0} mine={spot.mine} />}</AnimatePresence>
      <AnimatePresence>
        {coin && (
          <motion.div key={coin.id} className="free-roll" initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.2 }} transition={{ type: 'spring', stiffness: 240, damping: 18 }}>
            {coin.kind === 'coin' ? (
              <>
                <motion.div className={`free-coin ${coin.good ? 'heads' : 'tails'}`} initial={{ rotateY: 0 }} animate={{ rotateY: 1440 + (coin.good ? 0 : 180) }} transition={{ duration: 1.1, ease: 'easeOut' }}>
                  <span className="coin-face front">★</span>
                  <span className="coin-face back">☾</span>
                </motion.div>
                <span className="free-roll-text">{coin.text}</span>
              </>
            ) : (
              <>
                <motion.div className="free-die" initial={{ rotate: -540, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} transition={{ duration: 0.9, ease: 'easeOut' }}>
                  {coin.text}
                </motion.div>
                <span className="free-roll-text">{t('free.log.dice', { player: P[coin.player].name, n: coin.text })}</span>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{menu && <ActionMenu x={menu.x} y={menu.y} entries={menu.entries} onClose={() => setMenu(null)} />}</AnimatePresence>

      <AnimatePresence>
        {pile && (
          <motion.div className="prompt-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPile(null)}>
            <motion.div className="prompt free-pile" initial={{ y: 30 }} animate={{ y: 0 }} onClick={(e) => e.stopPropagation()}>
              <div className="row">
                <h3 style={{ margin: 0 }}>
                  {pileTitle} ({pile.kind === 'extra' && pile.player !== me ? P[pile.player].extraCount : pileCards.length})
                </h3>
                <span className="spacer" />
                {pile.kind === 'deck' && (
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      act({ type: 'shuffle' });
                      setPile(null);
                    }}
                  >
                    <Icon.Shuffle /> {t('free.shuffle')}
                  </button>
                )}
                <button className="btn btn-sm" onClick={() => setPile(null)}>
                  {t('common.close')}
                </button>
              </div>
              {pileCards.length === 0 ? (
                <p className="faint">{t('free.empty')}</p>
              ) : (
                <div className="prompt-cards" style={{ marginTop: 14 }}>
                  {(pile.kind === 'deck' ? pileCards : [...pileCards].reverse()).map((c) => (
                    <button
                      key={c.uid}
                      className="free-pile-card"
                      onMouseEnter={() => c.defId && hasDef(c.defId) && setHover(c.defId)}
                      onClick={(e) => {
                        if (pile.player !== me) {
                          if (c.defId && hasDef(c.defId)) setDetail(c.defId);
                          return;
                        }
                        onCard(c, e);
                      }}
                    >
                      {c.defId && hasDef(c.defId) ? <Card defId={c.defId} size="md" /> : <CardBack size="md" />}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <LpDialog
        open={lpFor !== null}
        name={lpFor !== null ? P[lpFor].name : ''}
        lp={lpFor !== null ? P[lpFor].lp : 0}
        onClose={() => setLpFor(null)}
        onApply={(delta) => {
          if (lpFor !== null && delta) act({ type: 'lp', player: lpFor, delta });
          setLpFor(null);
        }}
      />
      <TokenDialog
        open={tokenOpen}
        onClose={() => setTokenOpen(false)}
        onCreate={(atk, def, position) => {
          act({ type: 'token', atk, def, position });
          setTokenOpen(false);
        }}
      />
      <CardModal defId={detail} onClose={() => setDetail(null)} onSelect={setDetail} />
      <AnimatePresence>
        {over && (
          <GameOverOverlay
            view={view as unknown as Parameters<typeof GameOverOverlay>[0]['view']}
            onRematch={source.rematch}
            onLeave={source.leave}
            rematchState={source.rematchState}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------------ dialogs

function LpDialog({ open, name, lp, onClose, onApply }: { open: boolean; name: string; lp: number; onClose: () => void; onApply: (delta: number) => void }) {
  const t = useT();
  const [amount, setAmount] = useState(1000);
  useEffect(() => {
    if (open) setAmount(1000);
  }, [open]);
  return (
    <Modal open={open} onClose={onClose}>
      <h2 style={{ marginTop: 0 }}>
        {t('free.lpTitle')} – {name}
      </h2>
      <p className="muted">
        LP <b className="mono">{lp}</b>
      </p>
      <div className="row row-wrap" style={{ gap: 8 }}>
        {[100, 300, 500, 800, 1000, 1500, 2000].map((n) => (
          <button key={n} className={`chip ${amount === n ? 'active' : ''}`} onClick={() => setAmount(n)}>
            {n}
          </button>
        ))}
        <button className="chip" onClick={() => setAmount(Math.ceil(lp / 2))}>
          ½ LP
        </button>
      </div>
      <input className="input" type="number" min={0} step={100} value={amount} onChange={(e) => setAmount(Math.max(0, Math.round(Number(e.target.value) || 0)))} style={{ marginTop: 12, maxWidth: 200 }} aria-label={t('free.lp')} />
      <div className="row" style={{ marginTop: 16, gap: 10 }}>
        <button className="btn btn-danger" disabled={!amount} onClick={() => onApply(-amount)}>
          − {t('free.damage')}
        </button>
        <button className="btn btn-primary" disabled={!amount} onClick={() => onApply(amount)}>
          + {t('free.gain')}
        </button>
      </div>
    </Modal>
  );
}

function TokenDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (atk: number, def: number, position: Position) => void }) {
  const t = useT();
  const [atk, setAtk] = useState(0);
  const [def, setDef] = useState(0);
  const [position, setPosition] = useState<Position>('def');
  return (
    <Modal open={open} onClose={onClose}>
      <h2 style={{ marginTop: 0 }}>{t('free.tokenTitle')}</h2>
      <div className="row row-wrap" style={{ gap: 12 }}>
        <label className="field" style={{ maxWidth: 140 }}>
          ATK
          <input className="input" type="number" min={0} step={100} value={atk} onChange={(e) => setAtk(Math.max(0, Math.round(Number(e.target.value) || 0)))} />
        </label>
        <label className="field" style={{ maxWidth: 140 }}>
          DEF
          <input className="input" type="number" min={0} step={100} value={def} onChange={(e) => setDef(Math.max(0, Math.round(Number(e.target.value) || 0)))} />
        </label>
        <div className="field">
          <span>{t('free.changePos')}</span>
          <div className="seg">
            {(['atk', 'def'] as Position[]).map((p) => (
              <button key={p} className={`seg-btn ${position === p ? 'active' : ''}`} onClick={() => setPosition(p)}>
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => onCreate(atk, def, position)}>
        ◇ {t('free.token')}
      </button>
    </Modal>
  );
}
