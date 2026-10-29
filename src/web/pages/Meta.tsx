import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ARCHETYPE_BY_ID, STARTER_DECKS, getDef, hasDef, sortDeckIds } from '../../engine';
import type { MetaStats } from '../../engine/meta';
import metaSim from '../../data/meta-sim.json';
import { useT } from '../i18n';
import { apiUrl } from '../lib/net';
import { IS_STATIC } from '../config';
import { Card } from '../components/Card';
import { CardModal } from '../components/CardDetail';
import { ColumnChart, DivergingBars, Meter, StatTile, divergingColor } from '../components/Charts';
import { Modal, Tabs } from '../components/Layout';
import { Icon } from '../components/Icons';
import { useDecks } from '../store/decks';
import { toast } from '../store/ui';
import '../styles/meta.css';

const SIM = metaSim as MetaStats;
const BOSS: Record<string, string> = {
  emberwing: 'EMB-005',
  tidecaller: 'TID-F01',
  ironclad: 'IRN-005',
  gloomveil: 'GLM-005',
  lumina: 'LUM-005',
  galeblade: 'GAL-005',
  thornwild: 'THN-005',
  astral: 'AST-005',
};

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;

function ArchDot({ id }: { id: string }) {
  return <i className="arch-dot" style={{ background: ARCHETYPE_BY_ID[id]?.color ?? '#888' }} />;
}

export default function MetaPage() {
  const t = useT();
  const nav = useNavigate();
  const create = useDecks((s) => s.create);
  const [source, setSource] = useState<'sim' | 'online'>('sim');
  const [online, setOnline] = useState<MetaStats | null>(null);
  const [serverDown, setServerDown] = useState(false);
  const [sim, setSim] = useState<MetaStats>(SIM);
  const [arch, setArch] = useState<string | null>(null);
  const [card, setCard] = useState<string | null>(null);
  const [cardSort, setCardSort] = useState<'inclusion' | 'winRate' | 'played'>('inclusion');
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    if (IS_STATIC) return;
    fetch(apiUrl('/api/meta'))
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { sim: MetaStats; online: MetaStats }) => {
        setSim(j.sim);
        setOnline(j.online);
      })
      .catch(() => setServerDown(true));
  }, []);

  const data = source === 'online' && online && online.games > 0 ? online : source === 'sim' ? sim : null;
  const name = (id: string) => ARCHETYPE_BY_ID[id]?.name[t.lang] ?? (id === 'mixed' ? 'Mixed' : id);
  const archetypes = data?.archetypes ?? [];
  const order = archetypes.map((a) => a.id);
  const cards = useMemo(() => {
    if (!data) return [];
    return [...data.cards].filter((c) => hasDef(c.id) && c.games >= 5).sort((a, b) => b[cardSort] - a[cardSort]).slice(0, 20);
  }, [data, cardSort]);
  const top = archetypes[0];
  const date = data ? new Date(data.generatedAt).toLocaleDateString(t.lang === 'de' ? 'de-DE' : 'en-GB') : '';

  const tiers = (['S', 'A', 'B', 'C'] as const).map((tier) => ({ tier, items: archetypes.filter((a) => a.tier === tier) }));
  const detail = arch ? archetypes.find((a) => a.id === arch) : undefined;
  const starter = arch ? STARTER_DECKS.find((s) => s.archetype === arch) : undefined;
  const matchupsOf = (id: string) =>
    Object.entries(data?.matchups[id] ?? {})
      .filter(([, m]) => m.games >= 4)
      .map(([o, m]) => ({ o, wr: m.wins / m.games, games: m.games }))
      .sort((a, b) => b.wr - a.wr);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <span className="eyebrow">{data ? t('meta.updated', { date }) : ''}</span>
          <h1>{t('meta.title')}</h1>
          <p>{t('meta.lead')}</p>
        </div>
        {!IS_STATIC && (
          <Tabs
            id="meta-src"
            value={source}
            onChange={setSource}
            items={[
              { value: 'sim', label: t('meta.sim') },
              { value: 'online', label: `${t('meta.online')}${online ? ` (${online.games})` : ''}` },
            ]}
          />
        )}
      </div>

      {serverDown && source === 'online' && <div className="panel panel-pad muted" style={{ marginBottom: 20 }}>{t('meta.serverOffline')}</div>}
      {!data ? (
        <div className="panel empty">{t('meta.noOnline')}</div>
      ) : (
        <motion.div key={source} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="meta">
          <div className="grid-4 meta-kpis">
            <StatTile label={t('meta.games')} value={data.games.toLocaleString()} />
            <StatTile label={t('meta.avgTurns')} value={data.avgTurns.toFixed(1)} />
            <StatTile label={t('meta.firstWin')} value={pct(data.firstPlayerWinRate)} sub={`${pct(1 - data.firstPlayerWinRate)} ${t('meta.goingSecond')}`} />
            <StatTile
              label={t('meta.topDeck')}
              value={
                top ? (
                  <span className="row" style={{ gap: 8 }}>
                    <ArchDot id={top.id} />
                    {name(top.id)}
                  </span>
                ) : (
                  '—'
                )
              }
              sub={top ? pct(top.winRate) : undefined}
            />
          </div>

          <section className="panel panel-pad meta-section">
            <h2>{t('meta.tierList')}</h2>
            <div className="tier-list">
              {tiers.map(({ tier, items }) => (
                <div key={tier} className={`tier-row tier-${tier}`}>
                  <div className="tier-label">
                    <span>{tier}</span>
                    <small>{t(`meta.tier.${tier}`)}</small>
                  </div>
                  <div className="tier-items">
                    {items.length === 0 && <span className="faint small">—</span>}
                    {items.map((a, i) => (
                      <motion.button
                        key={a.id}
                        className="tier-item"
                        style={{ ['--c' as string]: ARCHETYPE_BY_ID[a.id]?.color ?? '#888' }}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        whileHover={{ y: -4 }}
                        onClick={() => setArch(a.id)}
                      >
                        {BOSS[a.id] && <Card defId={BOSS[a.id]} size="xs" />}
                        <span>
                          <b>{name(a.id)}</b>
                          <small>{pct(a.winRate)}</small>
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="meta-two">
            <section className="panel panel-pad meta-section">
              <div className="row">
                <h2 style={{ margin: 0 }}>{t('meta.winRates')}</h2>
                <span className="spacer" />
                <button className="btn btn-ghost btn-sm" onClick={() => setShowTable((s) => !s)}>
                  <Icon.Log size={15} /> {showTable ? 'Chart' : 'Table'}
                </button>
              </div>
              {showTable ? (
                <table className="meta-table" style={{ marginTop: 14 }}>
                  <thead>
                    <tr>
                      <th>{t('card.archetype')}</th>
                      <th className="num">{t('home.winrate')}</th>
                      <th className="num">{t('meta.firstWin')}</th>
                      <th className="num">{t('meta.share')}</th>
                      <th className="num">{t('meta.games')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archetypes.map((a) => (
                      <tr key={a.id} onClick={() => setArch(a.id)}>
                        <td>
                          <span className="row" style={{ gap: 8 }}>
                            <ArchDot id={a.id} />
                            {name(a.id)}
                          </span>
                        </td>
                        <td className="num">{pct(a.winRate)}</td>
                        <td className="num">{a.firstGames ? pct(a.firstWins / a.firstGames) : '—'}</td>
                        <td className="num">{pct(a.share)}</td>
                        <td className="num">{a.games}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ marginTop: 16 }}>
                  <DivergingBars
                    ariaLabel={t('meta.winRates')}
                    rows={archetypes.map((a) => ({
                      key: a.id,
                      label: (
                        <>
                          <ArchDot id={a.id} />
                          {name(a.id)}
                        </>
                      ),
                      value: a.winRate,
                      hint: `${name(a.id)} · ${t('meta.gamesN', { n: a.games })}`,
                    }))}
                  />
                </div>
              )}
            </section>

            <section className="panel panel-pad meta-section">
              <h2>{t('meta.share')}</h2>
              <div className="share-list">
                {archetypes.map((a) => (
                  <button key={a.id} className="share-row" onClick={() => setArch(a.id)}>
                    <span className="row" style={{ gap: 8 }}>
                      <ArchDot id={a.id} />
                      {name(a.id)}
                    </span>
                    <Meter value={a.share / Math.max(...archetypes.map((x) => x.share), 0.0001)} label={pct(a.share)} />
                    <span className="mono">{pct(a.share)}</span>
                  </button>
                ))}
              </div>
              <h2 style={{ marginTop: 26 }}>{t('meta.length')}</h2>
              <ColumnChart ariaLabel={t('meta.length')} data={data.turnHistogram.map((h) => ({ label: h.label, value: h.count, hint: t('meta.gamesN', { n: h.count }) }))} height={110} />
            </section>
          </div>

          <section className="panel panel-pad meta-section">
            <h2>{t('meta.matchups')}</h2>
            <p className="muted small" style={{ marginTop: -6 }}>
              {t('meta.matchups.d')}
            </p>
            <div className="matrix-wrap">
              <table className="matrix">
                <thead>
                  <tr>
                    <th />
                    {order.map((c) => (
                      <th key={c} title={name(c)}>
                        <span className="matrix-col">
                          <ArchDot id={c} />
                          {name(c).slice(0, 5)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {order.map((r) => (
                    <tr key={r}>
                      <th>
                        <span className="row" style={{ gap: 6 }}>
                          <ArchDot id={r} />
                          {name(r)}
                        </span>
                      </th>
                      {order.map((c) => {
                        if (r === c) return <td key={c} className="matrix-self">—</td>;
                        const m = data.matchups[r]?.[c];
                        if (!m || m.games === 0) return <td key={c} className="matrix-empty">·</td>;
                        const wr = m.wins / m.games;
                        const col = divergingColor(wr);
                        return (
                          <td key={c} style={{ background: col.bg, color: col.fg }} title={`${name(r)} vs ${name(c)}: ${pct(wr)} (${t('meta.gamesN', { n: m.games })})`}>
                            {Math.round(wr * 100)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="matrix-legend small muted">
              <span>{t('meta.worstVs')}</span>
              <i style={{ background: 'linear-gradient(90deg, #e66767, #383835, #3987e5)' }} />
              <span>{t('meta.bestVs')}</span>
            </div>
          </section>

          <section className="panel panel-pad meta-section">
            <div className="row row-wrap">
              <h2 style={{ margin: 0 }}>{t('meta.topCards')}</h2>
              <span className="spacer" />
              <Tabs
                id="card-sort"
                value={cardSort}
                onChange={setCardSort}
                items={[
                  { value: 'inclusion', label: t('meta.inclusion') },
                  { value: 'played', label: t('meta.playedPerGame') },
                  { value: 'winRate', label: t('home.winrate') },
                ]}
              />
            </div>
            <table className="meta-table cards-table" style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('kind.monster')} / {t('kind.spell')} / {t('kind.trap')}</th>
                  <th className="num">{t('meta.inclusion')}</th>
                  <th className="num hidden-mobile">{t('meta.copies')}</th>
                  <th className="num hidden-mobile">{t('meta.playedPerGame')}</th>
                  <th className="num">{t('home.winrate')}</th>
                </tr>
              </thead>
              <tbody>
                {cards.map((c, i) => (
                  <tr key={c.id} onClick={() => setCard(c.id)}>
                    <td className="faint mono">{i + 1}</td>
                    <td>
                      <span className="row" style={{ gap: 10 }}>
                        <Card defId={c.id} size="xs" />
                        <span>
                          <b>{getDef(c.id).name[t.lang]}</b>
                          <br />
                          <small className="faint">{getDef(c.id).archetype ? name(getDef(c.id).archetype!) : t('lib.generic')}</small>
                        </span>
                      </span>
                    </td>
                    <td className="num">
                      <div className="incl">
                        <Meter value={c.inclusion} label={pct(c.inclusion, 0)} />
                        <span>{pct(c.inclusion, 0)}</span>
                      </div>
                    </td>
                    <td className="num hidden-mobile">{c.avgCopies.toFixed(1)}</td>
                    <td className="num hidden-mobile">{c.played.toFixed(2)}</td>
                    <td className="num">{pct(c.winRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </motion.div>
      )}

      <Modal open={!!detail} onClose={() => setArch(null)} wide>
        {detail && (
          <div className="arch-detail" style={{ ['--c' as string]: ARCHETYPE_BY_ID[detail.id]?.color }}>
            <div className="arch-detail-head">
              {BOSS[detail.id] && <Card defId={BOSS[detail.id]} size="md" holo />}
              <div>
                <span className="eyebrow" style={{ color: 'var(--c)' }}>
                  Tier {detail.tier}
                </span>
                <h2 style={{ margin: '4px 0 6px' }}>{name(detail.id)}</h2>
                <p className="muted" style={{ margin: 0 }}>
                  {ARCHETYPE_BY_ID[detail.id]?.description[t.lang]}
                </p>
                <div className="row row-wrap" style={{ marginTop: 12, gap: 18 }}>
                  <span>
                    {t('home.winrate')} <b>{pct(detail.winRate)}</b>
                  </span>
                  <span>
                    {t('meta.games')} <b>{detail.games}</b>
                  </span>
                  <span>
                    {t('meta.avgTurns')} <b>{detail.avgTurns.toFixed(1)}</b>
                  </span>
                </div>
              </div>
            </div>
            <div className="grid-2" style={{ marginTop: 18 }}>
              <div>
                <h4 className="muted">{t('meta.bestVs')}</h4>
                {matchupsOf(detail.id)
                  .slice(0, 3)
                  .map((m) => (
                    <div key={m.o} className="mu-row">
                      <span className="row" style={{ gap: 8 }}>
                        <ArchDot id={m.o} />
                        {name(m.o)}
                      </span>
                      <b className="mono">{pct(m.wr, 0)}</b>
                    </div>
                  ))}
              </div>
              <div>
                <h4 className="muted">{t('meta.worstVs')}</h4>
                {matchupsOf(detail.id)
                  .slice(-3)
                  .reverse()
                  .map((m) => (
                    <div key={m.o} className="mu-row">
                      <span className="row" style={{ gap: 8 }}>
                        <ArchDot id={m.o} />
                        {name(m.o)}
                      </span>
                      <b className="mono">{pct(m.wr, 0)}</b>
                    </div>
                  ))}
              </div>
            </div>
            {starter && (
              <>
                <div className="row" style={{ marginTop: 20 }}>
                  <h4 style={{ margin: 0 }}>
                    {t('meta.decklist')} – {starter.name[t.lang]}
                  </h4>
                  <span className="spacer" />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      const d = create(starter.name[t.lang], starter.deck);
                      toast(t('decks.importOk'), 'success');
                      nav(`/decks/${d.id}`);
                    }}
                  >
                    <Icon.Copy /> {t('meta.copyDeck')}
                  </button>
                </div>
                <div className="arch-decklist">
                  {sortDeckIds([...new Set([...starter.deck.main, ...starter.deck.extra])]).map((x) => (
                    <button key={x} className="decklist-item" onClick={() => setCard(x)}>
                      <Card defId={x} size="xs" count={[...starter.deck.main, ...starter.deck.extra].filter((y) => y === x).length} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
      <CardModal defId={card} onClose={() => setCard(null)} onSelect={setCard} />
    </div>
  );
}
