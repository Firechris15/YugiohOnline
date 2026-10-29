import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ARCHETYPES, REAL_STARTERS, duelFormat, isDeckLegal, validateDeck, type FreeBanlist } from '../../engine';
import { useT } from '../i18n';
import { useDecks, deckChoices } from '../store/decks';
import { useSettings } from '../store/settings';
import { useNet, probeServer, apiUrl } from '../lib/net';
import { useCardPool } from '../lib/carddb';
import { archetypeInfo } from '../lib/cards';
import { toast } from '../store/ui';
import { Card } from '../components/Card';
import { Icon } from '../components/Icons';
import { CardDbNotice, PoolSwitch } from '../components/PoolSwitch';
import { coverCard } from './Decks';
import type { DuelMode, PublicRoom } from '../../shared/protocol';
import { IS_STATIC } from '../config';
import '../styles/play.css';

type Level = 'easy' | 'normal' | 'hard';
const BANLISTS: FreeBanlist[] = ['tcg', 'ocg', 'none'];

export default function PlayPage() {
  const t = useT();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { pool } = useCardPool();
  const decks = useDecks((s) => s.decks);
  const lastUsed = useDecks((s) => s.lastUsed);
  const setLastUsed = useDecks((s) => s.setLastUsed);
  const name = useSettings((s) => s.name);
  const setSettings = useSettings((s) => s.set);
  const mode: DuelMode = params.get('mode') === 'free' ? 'free' : 'auto';
  const setMode = (m: DuelMode) => {
    const next = new URLSearchParams(params);
    next.set('mode', m);
    setParams(next, { replace: true });
  };
  const choices = useMemo(() => deckChoices(decks, t.lang, pool), [decks, t.lang, pool]);
  const [banlist, setBanlist] = useState<FreeBanlist>('tcg');
  const formatFor = (m: DuelMode) => duelFormat(m, pool, banlist);
  const legalFor = (list: { main: string[]; extra: string[] }, m: DuelMode = mode) => isDeckLegal(list, formatFor(m));
  const wantedDeck = params.get('deck') ?? lastUsed;
  const [deckId, setDeckId] = useState<string>(wantedDeck ?? '');
  const deck = choices.find((c) => c.id === deckId) ?? choices.find((c) => legalFor(c.list)) ?? choices[0];
  const legal = deck ? legalFor(deck.list) : false;
  const issues = deck && !legal ? validateDeck(deck.list, formatFor(mode)) : [];
  const [level, setLevel] = useState<Level>((params.get('level') as Level) ?? 'normal');
  const [botDeck, setBotDeck] = useState<string>('random');
  const [joinCode, setJoinCode] = useState(params.get('join') ?? '');
  const [isPublic, setIsPublic] = useState(false);
  const [server, setServer] = useState<{ ok: boolean; online: number } | null>(null);
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const net = useNet();
  const [pendingNav, setPendingNav] = useState(false);

  useEffect(() => {
    void probeServer().then(setServer);
    if (IS_STATIC) return;
    const load = () =>
      fetch(apiUrl('/api/rooms'))
        .then((r) => (r.ok ? r.json() : { rooms: [] }))
        .then((j) => setRooms(j.rooms ?? []))
        .catch(() => {});
    void load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);

  // Free duels: follow the banlist the deck was built for.
  useEffect(() => {
    if (deck && (deck.format === 'tcg' || deck.format === 'ocg' || deck.format === 'none')) setBanlist(deck.format);
    else if (deck?.format === 'auto') setBanlist('none');
  }, [deck?.id, deck?.format]);

  // Navigate to the duel as soon as the server confirms the room.
  useEffect(() => {
    if (pendingNav && net.room) {
      setPendingNav(false);
      nav(`/duel/online/${net.room.code}`);
    }
  }, [pendingNav, net.room, nav]);

  useEffect(() => {
    if (net.lastError && Date.now() - net.lastError.at < 3000) {
      toast(t('common.error', { msg: net.lastError.message }), 'error');
      setPendingNav(false);
    }
  }, [net.lastError, t]);

  const pickDeck = (id: string) => {
    setDeckId(id);
    setLastUsed(id);
  };

  const ensureLegal = () => {
    if (!deck || !legal) {
      toast(t('play.deckIllegal'), 'error');
      return false;
    }
    return true;
  };

  const startBot = () => {
    if (!ensureLegal()) return;
    const q = new URLSearchParams({ deck: deck.id, level, bot: botDeck });
    nav(`/duel/bot?${q}`);
  };

  const startSolo = () => {
    if (!ensureLegal()) return;
    nav(`/duel/solo?${new URLSearchParams({ deck: deck.id })}`);
  };

  const online = async (fn: () => Promise<void>) => {
    if (!ensureLegal()) return;
    try {
      setPendingNav(true);
      await fn();
    } catch {
      setPendingNav(false);
      toast(t('play.serverOffline'), 'error');
    }
  };

  const serverOk = server?.ok ?? false;
  const freeBanlist = mode === 'free' && pool === 'real' ? banlist : undefined;
  const botDecks = pool === 'real' ? REAL_STARTERS.map((s) => ({ id: s.id, name: s.name[t.lang] })) : ARCHETYPES.map((a) => ({ id: a.id, name: a.name[t.lang] }));
  const visibleRooms = rooms.filter((r) => (r.pool ?? 'demo') === pool);

  const issueText = (i: (typeof issues)[number]) => {
    const p = { ...i.params } as Record<string, string | number>;
    if (typeof p.id === 'string') p.card = p.id;
    return t(i.key, p);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{t('play.title')}</h1>
          <p>{t('play.lead')}</p>
        </div>
        <PoolSwitch />
      </div>

      {params.get('join') && (
        <motion.div className="panel panel-pad invite-banner" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Icon.Users /> {t('play.invited', { code: params.get('join')!.toUpperCase() })}
        </motion.div>
      )}

      <CardDbNotice />

      <div className="play-modes-switch" role="tablist" aria-label={t('play.mode')}>
        {(['auto', 'free'] as DuelMode[]).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={`play-mode-tab panel ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>
            <span className="play-mode-icon">{m === 'auto' ? <Icon.Robot size={22} /> : <Icon.Cards size={22} />}</span>
            <span>
              <b>{t(`play.mode.${m}`)}</b>
              <span className="small muted">{t(`play.mode.${m}.d`)}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="play-setup panel panel-pad">
        <div className="play-setup-row">
          <label className="field" style={{ flex: '0 1 260px' }}>
            {t('play.yourName')}
            <input className="input" value={name} maxLength={20} placeholder={t.lang === 'de' ? 'Duellant' : 'Duelist'} onChange={(e) => setSettings({ name: e.target.value })} />
          </label>
          {mode === 'free' && pool === 'real' && (
            <label className="field" style={{ flex: '0 1 220px' }}>
              {t('play.banlist')}
              <div className="seg">
                {BANLISTS.map((b) => (
                  <button key={b} className={`seg-btn ${banlist === b ? 'active' : ''}`} onClick={() => setBanlist(b)}>
                    {t(`banlist.${b}`)}
                  </button>
                ))}
              </div>
            </label>
          )}
          <div className="field" style={{ flex: 1, minWidth: 0 }}>
            <span>{t('play.yourDeck')}</span>
            {choices.length === 0 ? (
              <p className="faint small">{t('play.noDecks')}</p>
            ) : (
              <div className="deck-picker">
                {choices.map((c) => {
                  const cover = coverCard(c.list);
                  const ok = legalFor(c.list);
                  const arch = archetypeInfo(c.archetype, t.lang);
                  return (
                    <button key={c.id} className={`deck-pick ${deck?.id === c.id ? 'active' : ''} ${ok ? '' : 'illegal'}`} style={{ ['--c' as string]: arch.color }} onClick={() => pickDeck(c.id)} title={c.name}>
                      {cover && <Card defId={cover} size="xs" />}
                      <span className="deck-pick-name">{c.name}</span>
                      {c.starter && <span className="badge">Starter</span>}
                      {!ok && <span className="badge badge-bad">{t('decks.illegal')}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {issues.length > 0 && <p className="small deck-issue-line">⚠ {issueText(issues[0])}</p>}
          </div>
        </div>
      </div>

      <div className="grid-3 play-modes">
        {mode === 'auto' ? (
          <motion.div key="bot" className="mode-card panel" style={{ ['--c' as string]: '#4de1ff' }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mode-icon">
              <Icon.Robot size={28} />
            </div>
            <h2>{t('play.bot')}</h2>
            <p className="muted">{t('play.bot.d')}</p>
            <label className="field">
              {t('play.difficulty')}
              <div className="seg">
                {(['easy', 'normal', 'hard'] as Level[]).map((l) => (
                  <button key={l} className={`seg-btn ${level === l ? 'active' : ''}`} onClick={() => setLevel(l)}>
                    {t(`play.${l}`)}
                  </button>
                ))}
              </div>
            </label>
            <label className="field">
              {t('play.botDeck')}
              <select className="select" value={botDeck} onChange={(e) => setBotDeck(e.target.value)}>
                <option value="random">{t('play.random')}</option>
                {botDecks.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-primary btn-lg mode-cta" onClick={startBot}>
              <Icon.Play size={16} /> {t('play.start')}
            </button>
          </motion.div>
        ) : (
          <motion.div key="solo" className="mode-card panel" style={{ ['--c' as string]: '#36d38d' }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mode-icon">
              <Icon.Cards size={28} />
            </div>
            <h2>{t('play.solo')}</h2>
            <p className="muted">{t('play.solo.d')}</p>
            <p className="faint small">{t('free.hint')}</p>
            <button className="btn btn-primary btn-lg mode-cta" onClick={startSolo}>
              <Icon.Play size={16} /> {t('play.start')}
            </button>
          </motion.div>
        )}

        <motion.div className="mode-card panel" style={{ ['--c' as string]: '#b14dff' }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <div className="mode-icon">
            <Icon.Users size={28} />
          </div>
          <h2>{t('play.friend')}</h2>
          <p className="muted">{t('play.friend.d')}</p>
          <div className="row" style={{ gap: 10 }}>
            <button className={`toggle ${isPublic ? 'on' : ''}`} onClick={() => setIsPublic((v) => !v)} aria-pressed={isPublic} aria-label={t('play.publicRoom')} />
            <span className="small muted">{t('play.publicRoom')}</span>
          </div>
          <button className="btn btn-primary" disabled={!serverOk || pendingNav || !deck} onClick={() => online(() => net.createRoom(deck.list, deck.name, isPublic, mode, freeBanlist))}>
            <Icon.Plus /> {t('play.create')}
          </button>
          <div className="divider" style={{ margin: '6px 0' }} />
          <label className="field">
            {t('play.joinCode')}
            <div className="row">
              <input className="input code-input" value={joinCode} maxLength={5} placeholder="ABCDE" onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
              <button className="btn" disabled={!serverOk || joinCode.length !== 5 || pendingNav || !deck} onClick={() => online(() => net.joinRoom(joinCode, deck.list, deck.name))}>
                {t('play.join')}
              </button>
            </div>
          </label>
        </motion.div>

        <motion.div className="mode-card panel" style={{ ['--c' as string]: '#ffcc4d' }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
          <div className="mode-icon">
            <Icon.Bolt size={28} />
          </div>
          <h2>{t('play.quick')}</h2>
          <p className="muted">{t('play.quick.d')}</p>
          <AnimatePresence mode="wait">
            {net.queued ? (
              <motion.div key="q" className="queue" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="queue-radar">
                  <i />
                  <i />
                  <i />
                </div>
                <span>{t('play.searching')}</span>
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    net.cancelQueue();
                    setPendingNav(false);
                  }}
                >
                  {t('play.cancel')}
                </button>
              </motion.div>
            ) : (
              <motion.button key="b" className="btn btn-gold btn-lg mode-cta" disabled={!serverOk || !deck} onClick={() => online(() => net.quickMatch(deck.list, deck.name, mode, freeBanlist))} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Icon.Bolt size={16} /> {t('play.findMatch')}
              </motion.button>
            )}
          </AnimatePresence>
          <span className="small faint">{serverOk ? t('nav.online', { n: server?.online ?? 0 }) : t('nav.offline')}</span>
        </motion.div>
      </div>

      {!serverOk && server && <div className="panel panel-pad muted small" style={{ marginTop: 18 }}>{t(IS_STATIC ? 'play.staticOnly' : 'play.serverOffline')}</div>}

      {serverOk && (
        <section className="panel panel-pad" style={{ marginTop: 20 }}>
          <h3 style={{ marginTop: 0 }}>{t('play.openRooms')}</h3>
          {visibleRooms.length === 0 ? (
            <p className="faint small" style={{ margin: 0 }}>
              {t('play.noRooms')}
            </p>
          ) : (
            <div className="rooms">
              {visibleRooms.map((r) => (
                <div key={r.code} className="room-row">
                  <span className="mono room-code">{r.code}</span>
                  <span>{r.host}</span>
                  <span className="badge">{t(`play.mode.${r.mode ?? 'auto'}`)}</span>
                  {r.format && r.format !== 'demo' && r.format !== 'auto' && <span className="badge">{t(`banlist.${r.format}`)}</span>}
                  <span className="faint small">{r.deckName}</span>
                  <span className="spacer" />
                  <button className="btn btn-sm btn-primary" disabled={!deck} onClick={() => online(() => net.joinRoom(r.code, deck.list, deck.name))}>
                    {t('play.join')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
