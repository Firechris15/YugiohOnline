import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ARCHETYPES, ARCHETYPE_BY_ID, isDeckLegal } from '../../engine';
import { useT } from '../i18n';
import { useDecks, deckChoices } from '../store/decks';
import { useSettings } from '../store/settings';
import { useNet, probeServer, apiUrl } from '../lib/net';
import { toast } from '../store/ui';
import { Card } from '../components/Card';
import { Icon } from '../components/Icons';
import { coverCard } from './Decks';
import type { PublicRoom } from '../../shared/protocol';
import '../styles/play.css';

type Level = 'easy' | 'normal' | 'hard';

export default function PlayPage() {
  const t = useT();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const decks = useDecks((s) => s.decks);
  const lastUsed = useDecks((s) => s.lastUsed);
  const setLastUsed = useDecks((s) => s.setLastUsed);
  const name = useSettings((s) => s.name);
  const setSettings = useSettings((s) => s.set);
  const choices = useMemo(() => deckChoices(decks, t.lang), [decks, t.lang]);
  const initial = params.get('deck') ?? lastUsed ?? choices.find((c) => isDeckLegal(c.list))?.id ?? choices[0]?.id;
  const [deckId, setDeckId] = useState<string>(initial ?? '');
  const deck = choices.find((c) => c.id === deckId) ?? choices[0];
  const legal = deck ? isDeckLegal(deck.list) : false;
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
    const load = () =>
      fetch(apiUrl('/api/rooms'))
        .then((r) => (r.ok ? r.json() : { rooms: [] }))
        .then((j) => setRooms(j.rooms ?? []))
        .catch(() => {});
    void load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);

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

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{t('play.title')}</h1>
          <p>{t('play.lead')}</p>
        </div>
      </div>

      {params.get('join') && (
        <motion.div className="panel panel-pad invite-banner" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Icon.Users /> {t('play.invited', { code: params.get('join')!.toUpperCase() })}
        </motion.div>
      )}

      <div className="play-setup panel panel-pad">
        <div className="play-setup-row">
          <label className="field" style={{ flex: '0 1 260px' }}>
            {t('play.yourName')}
            <input className="input" value={name} maxLength={20} placeholder={t.lang === 'de' ? 'Duellant' : 'Duelist'} onChange={(e) => setSettings({ name: e.target.value })} />
          </label>
          <div className="field" style={{ flex: 1 }}>
            <span>{t('play.yourDeck')}</span>
            <div className="deck-picker">
              {choices.map((c) => {
                const cover = coverCard(c.list);
                const ok = isDeckLegal(c.list);
                const arch = ARCHETYPE_BY_ID[c.archetype];
                return (
                  <button key={c.id} className={`deck-pick ${deckId === c.id ? 'active' : ''} ${ok ? '' : 'illegal'}`} style={{ ['--c' as string]: arch?.color ?? '#8aa0ff' }} onClick={() => pickDeck(c.id)} title={c.name}>
                    {cover && <Card defId={cover} size="xs" />}
                    <span className="deck-pick-name">{c.name}</span>
                    {c.starter && <span className="badge">Starter</span>}
                    {!ok && <span className="badge badge-bad">{t('decks.illegal')}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid-3 play-modes">
        <motion.div className="mode-card panel" style={{ ['--c' as string]: '#4de1ff' }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
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
              {ARCHETYPES.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name[t.lang]}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary btn-lg mode-cta" onClick={startBot}>
            <Icon.Play size={16} /> {t('play.start')}
          </button>
        </motion.div>

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
          <button className="btn btn-primary" disabled={!serverOk || pendingNav} onClick={() => online(() => net.createRoom(deck.list, deck.name, isPublic))}>
            <Icon.Plus /> {t('play.create')}
          </button>
          <div className="divider" style={{ margin: '6px 0' }} />
          <label className="field">
            {t('play.joinCode')}
            <div className="row">
              <input className="input code-input" value={joinCode} maxLength={5} placeholder="ABCDE" onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
              <button className="btn" disabled={!serverOk || joinCode.length !== 5 || pendingNav} onClick={() => online(() => net.joinRoom(joinCode, deck.list, deck.name))}>
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
              <motion.button key="b" className="btn btn-gold btn-lg mode-cta" disabled={!serverOk} onClick={() => online(() => net.quickMatch(deck.list, deck.name))} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Icon.Bolt size={16} /> {t('play.findMatch')}
              </motion.button>
            )}
          </AnimatePresence>
          <span className="small faint">
            {serverOk ? t('nav.online', { n: server?.online ?? 0 }) : t('nav.offline')}
          </span>
        </motion.div>
      </div>

      {!serverOk && server && <div className="panel panel-pad muted small" style={{ marginTop: 18 }}>{t('play.serverOffline')}</div>}

      {serverOk && (
        <section className="panel panel-pad" style={{ marginTop: 20 }}>
          <h3 style={{ marginTop: 0 }}>{t('play.openRooms')}</h3>
          {rooms.length === 0 ? (
            <p className="faint small" style={{ margin: 0 }}>
              {t('play.noRooms')}
            </p>
          ) : (
            <div className="rooms">
              {rooms.map((r) => (
                <div key={r.code} className="room-row">
                  <span className="mono room-code">{r.code}</span>
                  <span>{r.host}</span>
                  <span className="faint small">{r.deckName}</span>
                  <span className="spacer" />
                  <button className="btn btn-sm btn-primary" onClick={() => online(() => net.joinRoom(r.code, deck.list, deck.name))}>
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
