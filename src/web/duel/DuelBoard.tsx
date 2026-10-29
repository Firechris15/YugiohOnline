// The duel screen: presents engine views with sequenced animations and
// turns clicks into engine actions.
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { getDef, type Action, type ActionOption, type CardView, type GameEvent, type GameView, type PlayerId, type Position, type Requirement } from '../../engine';
import { useT } from '../i18n';
import { SPEED_FACTOR, useSettings } from '../store/settings';
import { sfx } from '../lib/sound';
import { cardName } from '../lib/cards';
import { FieldSide, Hand, LifePanel, PhaseBar, ChainStack, type BoardHandlers, type CardUiState } from './board';
import { ActionMenu, ActivationSpotlight, Banner, DuelIntro, EffectsLayer, GameOverOverlay, LogPanel, PilesModal, PreviewPanel, PromptOverlay, findCard, type FxItem, type MenuEntry } from './overlays';
import { Icon } from '../components/Icons';
import { askConfirm } from '../store/ui';
import '../styles/duel.css';

export interface DuelSource {
  mode: 'bot' | 'online';
  act: (a: Action) => void;
  surrender: () => void;
  rematch: () => void;
  leave: () => void;
  setBusy?: (busy: boolean) => void;
  rematchState?: 'none' | 'waiting' | 'offered';
  connected?: [boolean, boolean];
  deadline?: number | null;
  chat?: React.ReactNode;
  emotes?: { from: PlayerId; id: string; at: number }[];
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Mode =
  | { kind: 'idle' }
  | { kind: 'select'; option: ActionOption; step: number; picks: string[][] }
  | { kind: 'attack'; uid: string; options: ActionOption[] };

let fxCounter = 0;

function centerOf(uid: string): { x: number; y: number } | null {
  const el = document.querySelector(`[data-uid="${CSS.escape(uid)}"]`) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function lpPos(p: PlayerId): { x: number; y: number } | null {
  const el = document.querySelector(`[data-lp="${p}"] .lp-value`) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top };
}

const ATTR_FX: Record<string, string> = { FIRE: '#ff7a3d', WATER: '#4fb6ff', EARTH: '#e0b36a', WIND: '#5ef0b4', LIGHT: '#ffe98a', DARK: '#b47dff' };

export function DuelBoard({ incoming, source }: { incoming: GameView[]; source: DuelSource }) {
  const t = useT();
  const speed = useSettings((s) => s.speed);
  const smartPass = useSettings((s) => s.smartPass);
  const f = SPEED_FACTOR[speed];
  const [view, setView] = useState<GameView | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [menu, setMenu] = useState<{ x: number; y: number; entries: MenuEntry[] } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [fx, setFx] = useState<FxItem[]>([]);
  const [banner, setBanner] = useState<{ id: number; text: string; kind: 'turn-me' | 'turn-opp' | 'phase' } | null>(null);
  const [spot, setSpot] = useState<{ id: number; defId: string; link: number; mine: boolean } | null>(null);
  const [intro, setIntro] = useState(false);
  const [pile, setPile] = useState<{ player: PlayerId; kind: 'gy' | 'banished' | 'extra' } | null>(null);
  const [side, setSide] = useState<'log' | 'chat'>('log');
  const queue = useRef<GameView[]>([]);
  const consumed = useRef(0);
  const pumping = useRef(false);
  const viewRef = useRef<GameView | null>(null);
  const recorded = useRef(false);
  const introDone = useRef<(() => void) | null>(null);

  const addFx = useCallback((item: Omit<FxItem, 'id'>, ttl = 1600) => {
    const id = ++fxCounter;
    setFx((cur) => [...cur.slice(-24), { ...item, id }]);
    setTimeout(() => setFx((cur) => cur.filter((x) => x.id !== id)), ttl);
  }, []);

  // ----------------------------------------------------------- presenter
  const present = useCallback(
    async (v: GameView, backlog: number) => {
      const quick = backlog > 2;
      const events = v.events;
      const me = v.you;
      // Capture positions of cards that are about to be destroyed (they will move to the GY).
      const before = new Map<string, { x: number; y: number }>();
      for (const e of events) if ((e.type === 'destroy' || e.type === 'banish' || e.type === 'material' || e.type === 'tribute') && e.uid) {
        const c = centerOf(e.uid);
        if (c) before.set(e.uid, c);
      }
      if (!quick) {
        // Activation spotlights (max 2 per batch)
        const acts = events.filter((e) => e.type === 'activate' && e.defId).slice(0, 2);
        for (const a of acts) {
          sfx.activate();
          setSpot({ id: a.seq, defId: a.defId!, link: a.amount ?? 0, mine: a.player === me });
          await wait(820 * f);
          setSpot(null);
          await wait(120 * f);
        }
        // Attack lunge
        const atk = events.find((e) => e.type === 'attack');
        if (atk?.uid) {
          sfx.attack();
          const el = document.querySelector(`[data-uid="${CSS.escape(atk.uid)}"] .board-card-inner`) as HTMLElement | null;
          const from = centerOf(atk.uid);
          const to = atk.target ? centerOf(atk.target) : lpPos(atk.player === 0 ? 1 : 0);
          if (el && from && to) {
            const dx = (to.x - from.x) * 0.7;
            const dy = (to.y - from.y) * 0.7;
            el.animate(
              [
                { transform: 'translate(0,0) scale(1)' },
                { transform: `translate(${-dx * 0.08}px, ${-dy * 0.08}px) scale(1.08)`, offset: 0.25 },
                { transform: `translate(${dx}px, ${dy}px) scale(1.14)`, offset: 0.62 },
                { transform: 'translate(0,0) scale(1)' },
              ],
              { duration: 620 * f, easing: 'cubic-bezier(.3,.7,.2,1)' },
            );
            await wait(380 * f);
            addFx({ kind: 'impact', x: to.x, y: to.y }, 600);
            sfx.hit();
            await wait(260 * f);
          }
        }
      }
      setView(v);
      viewRef.current = v;
      if (events.some((e) => e.type === 'start')) {
        // Duel intro (VS screen + coin toss) – blocks the queue until done or clicked.
        sfx.coin();
        setIntro(true);
        await new Promise<void>((resolve) => {
          introDone.current = resolve;
          setTimeout(resolve, 2700);
        });
        introDone.current = null;
        setIntro(false);
      }
      // Post effects
      let delay = 0;
      for (const e of events) handlePost(e, v, before, quick);
      if (events.some((e) => e.type === 'destroy' || e.type === 'summon' || e.type === 'lp')) delay = 380;
      if (events.some((e) => e.type === 'turn')) delay = Math.max(delay, 700);
      if (!quick && delay) await wait(delay * f);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f],
  );

  const handlePost = (e: GameEvent, v: GameView, before: Map<string, { x: number; y: number }>, quick: boolean) => {
    const me = v.you;
    switch (e.type) {
      case 'lp': {
        const pos = lpPos(e.player!);
        if (pos && e.amount) addFx({ kind: e.amount < 0 ? 'damage' : 'heal', x: pos.x, y: pos.y, text: `${e.amount > 0 ? '+' : ''}${e.amount}` });
        if (e.amount && e.amount > 0) sfx.heal();
        else if (e.text !== 'battle') sfx.hit();
        break;
      }
      case 'destroy': {
        const p = (e.uid && before.get(e.uid)) || (e.uid && centerOf(e.uid));
        const attr = e.defId ? safeAttr(e.defId) : undefined;
        if (p) addFx({ kind: 'burst', x: p.x, y: p.y, color: attr ? ATTR_FX[attr] : '#ff7a5c' }, 1000);
        sfx.destroy();
        break;
      }
      case 'banish': {
        const p = e.uid && before.get(e.uid);
        if (p) addFx({ kind: 'shock', x: p.x, y: p.y, color: '#c6b3ff' }, 900);
        break;
      }
      case 'summon': {
        sfx.summon();
        requestAnimationFrame(() =>
          setTimeout(() => {
            const p = e.uid ? centerOf(e.uid) : null;
            const attr = e.defId ? safeAttr(e.defId) : undefined;
            if (p) addFx({ kind: 'shock', x: p.x, y: p.y, color: attr ? ATTR_FX[attr] : '#8ad8ff' }, 900);
          }, 260),
        );
        break;
      }
      case 'set':
        sfx.set();
        break;
      case 'draw':
        if (!quick) sfx.draw();
        break;
      case 'negate':
      case 'negateAttack': {
        const p = e.uid ? (centerOf(e.uid) ?? before.get(e.uid)) : null;
        if (p) addFx({ kind: 'negate', x: p.x, y: p.y, text: t.lang === 'de' ? 'ANNULLIERT' : 'NEGATED' }, 1400);
        sfx.negate();
        break;
      }
      case 'turn': {
        const mine = e.player === me;
        setBanner({ id: e.seq, text: mine ? t('duel.yourTurn') : t('duel.oppTurn'), kind: mine ? 'turn-me' : 'turn-opp' });
        sfx.turn();
        setTimeout(() => setBanner((b) => (b?.id === e.seq ? null : b)), 1300 * f);
        break;
      }
      case 'phase':
        if (e.phase === 'battle' || e.phase === 'end') {
          setBanner({ id: e.seq, text: t(`duel.phaseName.${e.phase}`), kind: 'phase' });
          setTimeout(() => setBanner((b) => (b?.id === e.seq ? null : b)), 900 * f);
          sfx.phase();
        }
        break;
      case 'gameOver':
        setTimeout(() => (e.player === me ? sfx.victory() : sfx.defeat()), 400);
        break;
    }
  };

  // Feed incoming views into the queue
  useEffect(() => {
    if (incoming.length < consumed.current) consumed.current = 0; // source restarted (rematch)
    const fresh = incoming.slice(consumed.current);
    consumed.current = incoming.length;
    if (!fresh.length) return;
    queue.current.push(...fresh);
    if (pumping.current) return;
    pumping.current = true;
    setBusy(true);
    source.setBusy?.(true);
    void (async () => {
      while (queue.current.length) {
        const v = queue.current.shift()!;
        try {
          await present(v, queue.current.length);
        } catch (err) {
          console.error(err);
          setView(v);
        }
      }
      pumping.current = false;
      setBusy(false);
      source.setBusy?.(false);
    })();
  }, [incoming, present, source]);

  // Reset UI mode whenever a new decision arrives
  useEffect(() => {
    setMode({ kind: 'idle' });
    setMenu(null);
  }, [view?.eventSeq, view?.pending.kind, view?.prompt?.id]);

  // Emotes
  useEffect(() => {
    const last = source.emotes?.[source.emotes.length - 1];
    if (!last || Date.now() - last.at > 1500 || !viewRef.current) return;
    const pos = lpPos(last.from);
    const map: Record<string, string> = { gg: '🤝 GG', hello: '👋', wow: '😮', think: '🤔', oops: '😅', fire: '🔥' };
    if (pos) addFx({ kind: 'emote', x: pos.x, y: pos.y - 30, text: map[last.id] ?? last.id }, 2300);
  }, [source.emotes, addFx]);

  const me = view?.you ?? 0;
  const myDecision = !!view && !busy && view.winner === null && view.pending.player === me && view.pending.kind !== 'none';
  const options = useMemo(() => (myDecision && view ? view.options : []), [myDecision, view]);
  const byUid = useMemo(() => {
    const m = new Map<string, ActionOption[]>();
    for (const o of options) if (o.uid) m.set(o.uid, [...(m.get(o.uid) ?? []), o]);
    return m;
  }, [options]);

  // Smart pass: skip pure phase-change response windows automatically
  useEffect(() => {
    if (!view || !myDecision || view.pending.kind !== 'response' || !smartPass) return;
    if (view.pending.window === 'phaseBattle' || view.pending.window === 'phaseEnd') {
      const id = setTimeout(() => source.act({ type: 'pass' }), 250);
      return () => clearTimeout(id);
    }
  }, [view, myDecision, smartPass, source]);

  const send = useCallback(
    (a: Action) => {
      setMode({ kind: 'idle' });
      setMenu(null);
      sfx.click();
      source.act(a);
    },
    [source],
  );

  const currentReq: Requirement | undefined = mode.kind === 'select' ? mode.option.requirements[mode.step] : undefined;

  const finishSelect = (m: Extract<Mode, { kind: 'select' }>, picks: string[][]) => {
    const a = { ...m.option.action } as Action & { tributes?: string[]; targets?: string[]; costs?: string[] };
    m.option.requirements.forEach((r, i) => {
      if (r.kind === 'tributes') a.tributes = picks[i];
      else if (r.kind === 'targets') a.targets = picks[i];
      else a.costs = picks[i];
    });
    send(a);
  };

  const startOption = (o: ActionOption) => {
    if (o.requirements.length === 0) return send(o.action);
    setMode({ kind: 'select', option: o, step: 0, picks: o.requirements.map(() => []) });
  };

  const togglePick = (uid: string) => {
    if (mode.kind !== 'select' || !currentReq) return;
    if (!currentReq.options.includes(uid)) return;
    const picks = mode.picks.map((p) => [...p]);
    const cur = picks[mode.step];
    const max = currentReq.kind === 'targets' ? currentReq.max : currentReq.count;
    const min = currentReq.kind === 'targets' ? currentReq.min : currentReq.count;
    if (cur.includes(uid)) picks[mode.step] = cur.filter((x) => x !== uid);
    else if (cur.length < max) picks[mode.step] = [...cur, uid];
    else if (max === 1) picks[mode.step] = [uid];
    const next = { ...mode, picks };
    if (picks[mode.step].length === max && min === max) advanceSelect(next);
    else setMode(next);
  };

  const advanceSelect = (m: Extract<Mode, { kind: 'select' }>) => {
    if (m.step + 1 >= m.option.requirements.length) finishSelect(m, m.picks);
    else setMode({ ...m, step: m.step + 1 });
  };

  const onCard = (c: CardView, e: MouseEvent) => {
    e.stopPropagation();
    if (!view) return;
    if (c.defId) setHover(c.defId);
    if (mode.kind === 'select') {
      togglePick(c.uid);
      return;
    }
    if (mode.kind === 'attack') {
      const o = mode.options.find((x) => x.action.type === 'attack' && x.action.target === c.uid);
      if (o) send(o.action);
      else setMode({ kind: 'idle' });
      return;
    }
    const opts = byUid.get(c.uid);
    if (!opts?.length) return;
    const entries: MenuEntry[] = [];
    const attacks = opts.filter((o) => o.action.type === 'attack');
    if (attacks.length) {
      const targets = attacks.filter((o) => o.action.type === 'attack' && o.action.target !== null);
      const direct = attacks.find((o) => o.action.type === 'attack' && o.action.target === null);
      if (targets.length) entries.push({ label: `⚔ ${t('action.attack')}`, primary: true, run: () => setMode({ kind: 'attack', uid: c.uid, options: attacks }) });
      if (direct) entries.push({ label: `➶ ${t('action.directAttack')}`, primary: !targets.length, run: () => send(direct.action) });
    }
    for (const o of opts) {
      if (o.action.type === 'attack') continue;
      entries.push({ label: t(o.label), primary: o.action.type === 'normalSummon' || o.action.type === 'activate', run: () => startOption(o) });
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ x: r.left + r.width / 2, y: r.top, entries });
  };

  const uiState = (uid: string): CardUiState => {
    if (mode.kind === 'select' && currentReq) {
      return { selectable: currentReq.options.includes(uid), selected: mode.picks[mode.step].includes(uid) || mode.picks.some((p, i) => i < mode.step && p.includes(uid)) };
    }
    if (mode.kind === 'attack') {
      return { target: mode.options.some((o) => o.action.type === 'attack' && o.action.target === uid), attacking: uid === mode.uid };
    }
    return { actionable: byUid.has(uid) };
  };

  const handlers: BoardHandlers = {
    onCard,
    onHover: (c) => c?.defId && setHover(c.defId),
    ui: uiState,
    onPile: (player, kind) => setPile({ player, kind }),
  };

  // Record history once per finished game (handled by parent through onFinish)
  useEffect(() => {
    if (!view || view.winner === null) recorded.current = false;
  }, [view]);

  if (!view) {
    return (
      <div className="duel-loading">
        <div className="spinner" />
      </div>
    );
  }

  const opp: PlayerId = me === 0 ? 1 : 0;
  const P = view.players;
  const phaseOpt = (to: 'battle' | 'main2' | 'end') => options.find((o) => o.action.type === 'phase' && o.action.to === to);
  const passOpt = options.find((o) => o.action.type === 'pass');
  const responding = myDecision && view.pending.kind === 'response';
  const myPrompt = myDecision && view.pending.kind === 'prompt' && view.prompt;
  const topLink = view.chain[view.chain.length - 1];
  const respondText =
    view.pending.window === 'chain' && topLink
      ? t('duel.respond.chain', { card: cardName(topLink.card.defId, t.lang) })
      : view.pending.window === 'attackDeclared'
        ? t('duel.respond.attack')
        : view.pending.window === 'summoned'
          ? t('duel.respond.summon')
          : t('duel.respond.generic');

  const selectHint = (() => {
    if (mode.kind === 'attack') return t('duel.selectAttackTarget');
    if (mode.kind !== 'select' || !currentReq) return '';
    if (currentReq.kind === 'tributes') return t('duel.selectTributes', { n: currentReq.count });
    if (currentReq.kind === 'targets') return t('duel.selectTargets', { min: currentReq.min, max: currentReq.max });
    return t(`duel.selectCost.${currentReq.what}`, { n: currentReq.count });
  })();
  const canConfirm =
    mode.kind === 'select' && currentReq && (currentReq.kind === 'targets' ? mode.picks[mode.step].length >= currentReq.min : mode.picks[mode.step].length === currentReq.count);

  const pileCards = pile ? (pile.kind === 'gy' ? P[pile.player].gy : pile.kind === 'banished' ? P[pile.player].banished : P[pile.player].extra) : [];

  return (
    <div className="duel" onClick={() => mode.kind !== 'idle' && setMode({ kind: 'idle' })}>
      <aside className="duel-left">
        <PreviewPanel defId={hover} />
        <div className="duel-tabs">
          <button className={`btn btn-sm ${side === 'log' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSide('log')}>
            <Icon.Log size={14} /> {t('duel.log')}
          </button>
          {source.chat && (
            <button className={`btn btn-sm ${side === 'chat' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSide('chat')}>
              <Icon.Chat size={14} /> {t('duel.chat')}
            </button>
          )}
        </div>
        {side === 'log' || !source.chat ? <LogPanel log={view.log} view={view} /> : source.chat}
      </aside>

      <main className="duel-main">
        <LayoutGroup>
          <Hand cards={P[opp].hand} me={me} h={handlers} opponent />
          <div className="field">
            <FieldSide p={P[opp]} view={view} h={handlers} flipped />
            <div className="mid">
              <PhaseBar view={view} />
              <ChainStack view={view} onHover={(c) => c?.defId && setHover(c.defId)} />
            </div>
            <FieldSide p={P[me]} view={view} h={handlers} flipped={false} />
          </div>
          <Hand cards={P[me].hand} me={me} h={handlers} />
        </LayoutGroup>

        <AnimatePresence>
          {(mode.kind === 'select' || mode.kind === 'attack') && (
            <motion.div className="select-bar" initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <span>{selectHint}</span>
              {mode.kind === 'select' && currentReq?.kind === 'targets' && currentReq.min !== currentReq.max && (
                <button className="btn btn-sm btn-primary" disabled={!canConfirm} onClick={() => mode.kind === 'select' && advanceSelect(mode)}>
                  {t('duel.confirm')}
                </button>
              )}
              <button className="btn btn-sm" onClick={() => setMode({ kind: 'idle' })}>
                {t('duel.cancel')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {responding && mode.kind === 'idle' && (
            <motion.div className="respond-bar" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <span className="respond-pulse" />
              <span>{respondText}</span>
              {passOpt && (
                <button className="btn btn-sm btn-gold" onClick={() => send(passOpt.action)}>
                  {t('duel.pass')}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <aside className="duel-right">
        <LifePanel p={P[opp]} view={view} isMe={false} connected={source.connected?.[opp]} deadline={source.deadline} />
        <div className="duel-controls">
          {!myDecision && view.winner === null && (
            <div className="waiting">
              <span className="dots">
                <i />
                <i />
                <i />
              </span>
              {t('duel.waiting')}
            </div>
          )}
          {myDecision && view.pending.kind === 'action' && (
            <>
              {phaseOpt('battle') && (
                <button className="btn btn-primary" onClick={() => send(phaseOpt('battle')!.action)}>
                  ⚔ {t('duel.toBattle')}
                </button>
              )}
              {phaseOpt('main2') && (
                <button className="btn" onClick={() => send(phaseOpt('main2')!.action)}>
                  {t('duel.toMain2')}
                </button>
              )}
              {phaseOpt('end') && (
                <button className="btn btn-gold" onClick={() => send(phaseOpt('end')!.action)}>
                  {t('duel.endTurn')} ⏭
                </button>
              )}
            </>
          )}
          <button
            className="btn btn-ghost btn-sm surrender"
            onClick={() => {
              if (view.winner !== null) return source.leave();
              void askConfirm(t('duel.surrenderConfirm')).then((ok) => ok && source.surrender());
            }}
          >
            <Icon.Flag size={14} /> {t('duel.surrender')}
          </button>
        </div>
        <LifePanel p={P[me]} view={view} isMe connected={source.connected?.[me]} deadline={source.deadline} />
      </aside>

      <EffectsLayer items={fx} />
      <AnimatePresence>{banner && <Banner key={banner.id} text={banner.text} kind={banner.kind} />}</AnimatePresence>
      <AnimatePresence>{spot && <ActivationSpotlight key={spot.id} defId={spot.defId} link={spot.link} mine={spot.mine} />}</AnimatePresence>
      <AnimatePresence>{myPrompt && !busy && <PromptOverlay key={view.prompt!.id} view={view} onAnswer={(choice: string[] | boolean | number | Position) => send({ type: 'answer', choice })} />}</AnimatePresence>
      <AnimatePresence>{menu && <ActionMenu x={menu.x} y={menu.y} entries={menu.entries} onClose={() => setMenu(null)} />}</AnimatePresence>
      <AnimatePresence>
        {pile && (
          <PilesModal
            cards={pileCards}
            title={`${P[pile.player].name} – ${t(pile.kind === 'gy' ? 'duel.gy' : pile.kind === 'banished' ? 'duel.banished' : 'duel.extra')}`}
            onClose={() => setPile(null)}
            onHover={(c) => c?.defId && setHover(c.defId)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>{intro && <DuelIntro view={view} onDone={() => introDone.current?.()} />}</AnimatePresence>
      <AnimatePresence>{view.winner !== null && !busy && <GameOverOverlay view={view} onRematch={source.rematch} onLeave={source.leave} rematchState={source.rematchState} />}</AnimatePresence>
    </div>
  );
}

function safeAttr(defId: string): string | undefined {
  try {
    return findAttr(defId);
  } catch {
    return undefined;
  }
}

function findAttr(defId: string) {
  return getDef(defId).attribute;
}

export { findCard };
