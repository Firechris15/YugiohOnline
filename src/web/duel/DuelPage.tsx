// Route component for /duel/bot and /duel/online/:code.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { REAL_STARTERS, STARTER_DECKS, deckPool, detectArchetype, resolveRealStarter, type GameView, type PlayerId } from '../../engine';
import type { SbView } from '../../engine/sandbox';
import { botName, type BotLevel } from '../../engine/ai/bot';
import { useT } from '../i18n';
import { useDecks, findDeckChoice } from '../store/decks';
import { playerName } from '../store/settings';
import { useHistory } from '../store/history';
import { useNet } from '../lib/net';
import { toast } from '../store/ui';
import { LocalDuel } from './LocalDuel';
import { LocalSandbox } from './LocalSandbox';
import { DuelBoard, type DuelSource } from './DuelBoard';
import { FreeBoard, type FreeSource } from './FreeBoard';
import { useCardDb } from '../lib/carddb';
import { Icon } from '../components/Icons';
import { copyText } from '../pages/Decks';
import { EMOTES } from '../../shared/protocol';
import { Logo } from '../components/Layout';

type ResultView = Pick<GameView, 'winner' | 'turn' | 'eventSeq' | 'you'> & { players: { lp: number }[] };

function useRecordResult(view: ResultView | null, info: { mode: 'bot' | 'online'; opponent: string; myDeck: string; level?: string; myArchetype: string }) {
  const add = useHistory((s) => s.add);
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!view || view.winner === null) return;
    const key = `${view.turn}-${view.eventSeq}-${view.players[0].lp}-${view.players[1].lp}`;
    if (done.current === key) return;
    done.current = key;
    add({
      mode: info.mode,
      opponent: info.opponent,
      myDeck: info.myDeck,
      myArchetype: info.myArchetype,
      result: view.winner === 'draw' ? 'draw' : view.winner === view.you ? 'win' : 'loss',
      turns: view.turn,
      lp: view.players[view.you].lp,
      level: info.level,
    });
  }, [view, info, add]);
}

function BotDuel() {
  const t = useT();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const decks = useDecks((s) => s.decks);
  const level = (params.get('level') as BotLevel) || 'normal';
  const mine = findDeckChoice(params.get('deck'), decks, t.lang) ?? findDeckChoice(STARTER_DECKS[0].id, [], t.lang)!;
  const botArch = params.get('bot') ?? 'random';
  const [round, setRound] = useState(0);
  const [views, setViews] = useState<GameView[]>([]);
  const duelRef = useRef<LocalDuel | null>(null);

  const duel = useMemo(() => {
    let botList = STARTER_DECKS[0].deck;
    if (deckPool(mine.list) === 'real') {
      const real = REAL_STARTERS.map((s) => ({ id: s.id, list: resolveRealStarter(s) })).filter((x) => x.list);
      const pool = botArch === 'random' ? real : real.filter((s) => s.id === botArch);
      const pick = pool[Math.floor(Math.random() * pool.length)] ?? real[0];
      if (pick?.list) botList = pick.list;
    } else {
      const pool = botArch === 'random' ? STARTER_DECKS : STARTER_DECKS.filter((s) => s.archetype === botArch);
      botList = (pool[Math.floor(Math.random() * pool.length)] ?? STARTER_DECKS[0]).deck;
    }
    return new LocalDuel(mine.list, botList, level, [playerName(), `${botName(level, t.lang)}`]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  useEffect(() => {
    duelRef.current = duel;
    setViews([]);
    const off = duel.subscribe((v) => setViews((cur) => [...cur, v]));
    duel.start();
    return () => {
      off();
      duel.dispose();
    };
  }, [duel]);

  const last = views[views.length - 1] ?? null;
  const info = useMemo(() => ({ mode: 'bot' as const, opponent: botName(level, t.lang), myDeck: mine.name, level, myArchetype: mine.archetype }), [level, mine, t.lang]);
  useRecordResult(last, info);

  const source: DuelSource = useMemo(
    () => ({
      mode: 'bot',
      act: (a) => {
        const err = duelRef.current?.act(a);
        if (err) toast(t('common.error', { msg: err }), 'error');
      },
      surrender: () => duelRef.current?.surrender(),
      rematch: () => setRound((r) => r + 1),
      leave: () => nav('/play'),
      setBusy: (b) => duelRef.current?.setPaused(b),
    }),
    [nav, t],
  );
  return <DuelBoard key={round} incoming={views} source={source} />;
}

function SoloDuel() {
  const t = useT();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const decks = useDecks((s) => s.decks);
  const mine = findDeckChoice(params.get('deck'), decks, t.lang);
  const [round, setRound] = useState(0);
  const [view, setView] = useState<SbView | null>(null);
  const ref = useRef<LocalSandbox | null>(null);

  useEffect(() => {
    if (!mine) return;
    const sb = new LocalSandbox(mine.list, [playerName(), t('free.soloOpp')]);
    ref.current = sb;
    const off = sb.subscribe(setView);
    return () => {
      off();
      sb.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  const source: FreeSource = useMemo(
    () => ({
      mode: 'solo',
      act: (a) => {
        const err = ref.current?.act(a);
        if (err) toast(t('common.error', { msg: err }), 'error');
      },
      leave: () => nav('/play?mode=free'),
      rematch: () => setRound((r) => r + 1),
    }),
    [nav, t],
  );
  if (!mine) {
    return (
      <div className="waiting-room">
        <div className="panel waiting-card">
          <h2>{t('play.deckIllegal')}</h2>
          <button className="btn" onClick={() => nav('/play?mode=free')}>
            {t('duel.backToLobby')}
          </button>
        </div>
      </div>
    );
  }
  if (!view) return <div className="duel-loading"><div className="spinner" /></div>;
  return <FreeBoard key={round} view={view} source={source} />;
}

function WaitingRoom({ code, onLeave }: { code: string; onLeave: () => void }) {
  const t = useT();
  const link = `${location.origin}${location.pathname.replace(/\/duel\/.*$/, '')}/play?join=${code}`;
  return (
    <div className="waiting-room">
      <motion.div className="panel waiting-card" initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
        <Logo size={46} />
        <h2>{t('play.waiting')}</h2>
        <p className="muted">{t('play.share')}</p>
        <div className="room-code-big">
          {code.split('').map((ch, i) => (
            <motion.span key={i} initial={{ rotateX: 90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} transition={{ delay: 0.2 + i * 0.08 }}>
              {ch}
            </motion.span>
          ))}
        </div>
        <div className="row row-wrap" style={{ justifyContent: 'center' }}>
          <button
            className="btn"
            onClick={async () => {
              if (await copyText(code)) toast(t('decks.copied'), 'success');
            }}
          >
            <Icon.Copy /> {code}
          </button>
          <button
            className="btn btn-primary"
            onClick={async () => {
              if (await copyText(link)) toast(t('decks.copied'), 'success');
            }}
          >
            <Icon.Link /> {t('play.copyLink')}
          </button>
        </div>
        <div className="queue-radar" style={{ margin: '22px auto 8px', ['--c' as string]: 'var(--accent-2)' }}>
          <i />
          <i />
          <i />
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onLeave}>
          {t('play.leave')}
        </button>
      </motion.div>
    </div>
  );
}

function ChatBox() {
  const t = useT();
  const chat = useNet((s) => s.chat);
  const send = useNet((s) => s.send);
  const room = useNet((s) => s.room);
  const [text, setText] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [chat.length]);
  const emo: Record<string, string> = { gg: '🤝', hello: '👋', wow: '😮', think: '🤔', oops: '😅', fire: '🔥' };
  return (
    <div className="chat">
      <div className="chat-lines" ref={ref}>
        {chat.map((c, i) => (
          <div key={i} className={`chat-line ${c.from === room?.you ? 'mine' : ''}`}>
            <b>{c.name}:</b> {c.text}
          </div>
        ))}
      </div>
      <div className="chat-emotes">
        {EMOTES.map((e) => (
          <button key={e} className="btn btn-ghost btn-sm" onClick={() => send({ t: 'emote', id: e })} aria-label={e}>
            {emo[e]}
          </button>
        ))}
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          send({ t: 'chat', text });
          setText('');
        }}
      >
        <input className="input" value={text} maxLength={200} placeholder={t('duel.chatPlaceholder')} onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-sm btn-primary" type="submit">
          ↵
        </button>
      </form>
    </div>
  );
}

function OnlineDuel({ code }: { code: string }) {
  const t = useT();
  useCardDb((s) => s.status); // re-render once real cards are loaded
  const nav = useNavigate();
  const net = useNet();
  const views = useNet((s) => s.views);
  const [log, setLog] = useState<GameView[]>([]);
  const roomCode = net.room?.code;

  useEffect(() => {
    // connect (or reconnect to a running room after a reload)
    void net.connect().catch(() => toast(t('play.serverOffline'), 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (views.length) {
      const taken = useNet.getState().takeViews();
      if (taken.length) setLog((cur) => [...cur, ...taken]);
    }
  }, [views]);

  // a rematch starts a new game: the first view of the new game has turn 1 and fresh seq
  const lastSeq = useRef(0);
  useEffect(() => {
    const last = log[log.length - 1];
    if (last && last.eventSeq < lastSeq.current) {
      setLog([last]);
    }
    if (last) lastSeq.current = last.eventSeq;
  }, [log]);

  useEffect(() => {
    if (net.closedReason === 'opponent_left') toast(t('duel.opponentLeft'), 'error');
  }, [net.closedReason, t]);

  const room = net.room;
  const last = log[log.length - 1] ?? null;
  const me: PlayerId = room?.you ?? 0;
  const oppInfo = room?.players[me === 0 ? 1 : 0];
  const myInfo = room?.players[me];
  const decks = useDecks((s) => s.decks);
  const info = useMemo(
    () => ({ mode: 'online' as const, opponent: oppInfo?.name ?? '?', myDeck: myInfo?.deckName ?? '', myArchetype: detectArchetype(findDeckChoice(useDecks.getState().lastUsed, decks, t.lang)?.list ?? { main: [], extra: [] }) }),
    [oppInfo?.name, myInfo?.deckName, decks, t.lang],
  );
  useRecordResult(last, info);

  const source: DuelSource = useMemo(
    () => ({
      mode: 'online',
      act: (a) => useNet.getState().act(a),
      surrender: () => useNet.getState().act({ type: 'surrender' }),
      rematch: () => useNet.getState().send({ t: 'rematch' }),
      leave: () => {
        useNet.getState().leaveRoom();
        nav('/play');
      },
      rematchState: myInfo?.rematch ? 'waiting' : oppInfo?.rematch ? 'offered' : 'none',
      connected: room ? [!!room.players[0]?.connected, !!room.players[1]?.connected] : undefined,
      deadline: room?.deadline,
      chat: <ChatBox />,
      emotes: net.emotes,
    }),
    [nav, myInfo?.rematch, oppInfo?.rematch, room, net.emotes],
  );

  if (!room || roomCode !== code) {
    if (net.status === 'closed') {
      return (
        <div className="waiting-room">
          <div className="panel waiting-card">
            <h2>{t('play.serverOffline')}</h2>
            <button className="btn" onClick={() => nav('/play')}>
              {t('duel.backToLobby')}
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="waiting-room">
        <div className="panel waiting-card">
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          <p className="muted">{t('duel.connecting')}</p>
          <button className="btn btn-ghost btn-sm" onClick={() => nav(`/play?join=${code}`)}>
            {t('play.join')} {code}
          </button>
        </div>
      </div>
    );
  }
  if (room.status === 'waiting') return <WaitingRoom code={room.code} onLeave={source.leave} />;
  if (room.pool === 'real' && useCardDb.getState().status !== 'ready') return <div className="duel-loading"><div className="spinner" /></div>;
  if (room.mode === 'free') return <OnlineFree source={source} />;
  return (
    <>
      {oppInfo && !oppInfo.connected && room.status === 'playing' && <div className="disconnect-note">{t('duel.disconnected')}</div>}
      <DuelBoard incoming={log} source={source} />
    </>
  );
}

function OnlineFree({ source }: { source: DuelSource }) {
  const t = useT();
  const view = useNet((s) => s.sbView);
  const room = useNet((s) => s.room);
  const decks = useDecks((s) => s.decks);
  const me: PlayerId = room?.you ?? 0;
  const oppInfo = room?.players[me === 0 ? 1 : 0];
  const info = useMemo(
    () => ({ mode: 'online' as const, opponent: oppInfo?.name ?? '?', myDeck: room?.players[me]?.deckName ?? '', myArchetype: detectArchetype(findDeckChoice(useDecks.getState().lastUsed, decks, t.lang)?.list ?? { main: [], extra: [] }) }),
    [oppInfo?.name, room, me, decks, t.lang],
  );
  useRecordResult(view, info);
  const free: FreeSource = useMemo(
    () => ({
      mode: 'online',
      act: (a) => useNet.getState().act(a),
      leave: source.leave,
      rematch: source.rematch,
      rematchState: source.rematchState,
      connected: source.connected as [boolean, boolean] | undefined,
      chat: source.chat,
    }),
    [source],
  );
  if (!view) return <div className="duel-loading"><div className="spinner" /></div>;
  return (
    <>
      {oppInfo && !oppInfo.connected && room?.status === 'playing' && <div className="disconnect-note">{t('duel.disconnected')}</div>}
      <FreeBoard view={view} source={free} />
    </>
  );
}

export default function DuelPage() {
  const { mode, code } = useParams();
  const [params] = useSearchParams();
  const dbStatus = useCardDb((s) => s.status);
  const deckParam = params.get('deck') ?? '';
  // Real-card duels need the card database (bot / solo duels start from a deck id).
  const needsDb = mode !== 'online' && (/^real-/.test(deckParam) || useDecks.getState().decks.some((d) => d.id === deckParam && d.format !== 'demo' && d.main.some((id) => /^\d+$/.test(id))));
  if (needsDb && dbStatus !== 'ready') {
    return (
      <div className="duel-loading">
        <div className="spinner" />
      </div>
    );
  }
  if (mode === 'online' && code) return <OnlineDuel code={code.toUpperCase()} />;
  if (mode === 'solo') return <SoloDuel />;
  return <BotDuel />;
}
