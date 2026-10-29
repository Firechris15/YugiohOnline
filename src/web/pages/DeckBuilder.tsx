import { useMemo, useState, type DragEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { cardLimit, getDef, hasDef, isExtraDeckCard, sortDeckIds, validateDeck, encodeDeck, DECK_RULES, type DeckFormat } from '../../engine';
import { toYdk } from '../../shared/ygo';
import { useT } from '../i18n';
import { useDecks, deckFormat, deckPoolOf } from '../store/decks';
import { useCardDb } from '../lib/carddb';
import { CardDbNotice } from '../components/PoolSwitch';
import { VirtualGrid } from '../components/VirtualGrid';
import { YdkImport } from './Decks';
import { askConfirm, toast } from '../store/ui';
import { Card } from '../components/Card';
import { CardText, CardModal } from '../components/CardDetail';
import { CardFilterBar, DEFAULT_FILTERS, useFilteredCards, type FilterState } from '../components/CardFilters';
import { BarList, ColumnChart, StackedBar } from '../components/Charts';
import { AttributeGlyph, Icon } from '../components/Icons';
import { Modal } from '../components/Layout';
import { ATTR_COLORS, REAL_ATTR_COLORS } from '../lib/cards';
import { copyText } from './Decks';
import { sfx } from '../lib/sound';
import '../styles/decks.css';

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

export function openingOdds(deckSize: number, copies: number, hand = 5): number {
  if (deckSize < hand) return copies > 0 ? 1 : 0;
  return 1 - choose(deckSize - copies, hand) / choose(deckSize, hand);
}

const REAL_FORMATS: DeckFormat[] = ['auto', 'tcg', 'ocg', 'none'];

export default function DeckBuilderPage() {
  const t = useT();
  const { id } = useParams();
  const deck = useDecks((s) => s.decks.find((d) => d.id === id));
  const dbStatus = useCardDb((s) => s.status);
  if (deck && deckPoolOf(deck) === 'real' && dbStatus !== 'ready') {
    return (
      <div className="page page-narrow" style={{ paddingTop: 40 }}>
        <CardDbNotice />
        {dbStatus === 'error' && (
          <Link to="/decks" className="btn">
            {t('builder.back')}
          </Link>
        )}
      </div>
    );
  }
  return <DeckBuilder key={id} />;
}

function DeckBuilder() {
  const t = useT();
  const { id } = useParams();
  const nav = useNavigate();
  const deck = useDecks((s) => s.decks.find((d) => d.id === id));
  const update = useDecks((s) => s.update);
  const cardPool = deck ? deckPoolOf(deck) : 'demo';
  const format = deck ? deckFormat(deck) : 'demo';
  const [filters, setFilters] = useState<FilterState>({ ...DEFAULT_FILTERS, autoOnly: format === 'auto' });
  const pool = useFilteredCards(filters, t.lang, cardPool);
  const [ydkOpen, setYdkOpen] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<'main' | 'extra' | null>(null);
  const [hand, setHand] = useState<string[] | null>(null);
  const [handSeed, setHandSeed] = useState(0);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    if (deck) for (const x of [...deck.main, ...deck.extra]) c[x] = (c[x] ?? 0) + 1;
    return c;
  }, [deck]);

  if (!deck) {
    return (
      <div className="page page-narrow center">
        <h1>{t('builder.notFound')}</h1>
        <Link to="/decks" className="btn">
          {t('builder.back')}
        </Link>
      </div>
    );
  }

  const add = (defId: string) => {
    const d = getDef(defId);
    const n = counts[defId] ?? 0;
    const limit = cardLimit(d, format);
    if (n >= limit) {
      toast(t(limit === 0 ? 'deck.banned' : 'deck.tooManyCopies', { card: d.name[t.lang], n: n + 1, limit }), 'error');
      return;
    }
    if (isExtraDeckCard(d)) {
      if (deck.extra.length >= DECK_RULES.extraMax) return toast(t('deck.extraTooLarge', { n: deck.extra.length + 1, max: DECK_RULES.extraMax }), 'error');
      update(deck.id, { extra: [...deck.extra, defId] });
    } else {
      if (deck.main.length >= DECK_RULES.mainMax) return toast(t('deck.tooLarge', { n: deck.main.length + 1, max: DECK_RULES.mainMax }), 'error');
      update(deck.id, { main: [...deck.main, defId] });
    }
    sfx.click();
  };

  const removeAt = (zone: 'main' | 'extra', index: number) => {
    const list = [...deck[zone]];
    list.splice(index, 1);
    update(deck.id, { [zone]: list });
    sfx.set();
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const defId = e.dataTransfer.getData('text/plain');
    if (defId) add(defId);
  };

  const issues = validateDeck(deck, format);
  const attrColors = cardPool === 'real' ? REAL_ATTR_COLORS : ATTR_COLORS;
  const mainSorted = sortDeckIds(deck.main);
  const extraSorted = sortDeckIds(deck.extra);
  const monsters = deck.main.filter((x) => getDef(x).kind === 'monster');
  const spells = deck.main.filter((x) => getDef(x).kind === 'spell').length;
  const traps = deck.main.filter((x) => getDef(x).kind === 'trap').length;
  const levels = [1, 2, 3, 4, 5, 6, 7, 8].map((lv) => ({
    label: lv === 8 ? '8+' : String(lv),
    value: monsters.filter((x) => (lv === 8 ? (getDef(x).level ?? 0) >= 8 : getDef(x).level === lv)).length,
    hint: `${t('card.level')} ${lv === 8 ? '8+' : lv}`,
  }));
  const attrs = Object.keys(attrColors).map((a) => ({
    key: t(`attr.${a}`),
    label: (
      <>
        <span style={{ color: attrColors[a], display: 'inline-flex' }}>
          <AttributeGlyph attr={a} size={13} />
        </span>
        {t(`attr.${a}`)}
      </>
    ),
    value: monsters.filter((x) => getDef(x).attribute === a).length,
  }));
  const avgAtk = monsters.length ? Math.round(monsters.reduce((s, x) => s + (getDef(x).atk ?? 0), 0) / monsters.length) : 0;

  const drawHand = () => {
    const pool = [...deck.main];
    const out: string[] = [];
    for (let i = 0; i < 5 && pool.length; i++) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    setHand(out);
    setHandSeed((s) => s + 1);
    sfx.draw();
  };

  const uniqueMain = Object.entries(counts)
    .filter(([x]) => !isExtraDeckCard(getDef(x)))
    .sort((a, b) => b[1] - a[1] || getDef(a[0]).name[t.lang].localeCompare(getDef(b[0]).name[t.lang]));

  const issueText = (i: (typeof issues)[number]) => {
    const p = { ...i.params } as Record<string, string | number>;
    if (p.id && typeof p.id === 'string') {
      p.card = hasDef(p.id) ? getDef(p.id).name[t.lang] : p.id;
    }
    return t(i.key, p);
  };

  return (
    <div className="page" style={{ maxWidth: 1480 }}>
      <div className="row" style={{ marginBottom: 14 }}>
        <Link to="/decks" className="btn btn-ghost btn-sm">
          ← {t('builder.back')}
        </Link>
        <span className="spacer" />
        <span className="faint small">{t('builder.saved')}</span>
      </div>
      <div className="builder">
        <aside className="builder-pool panel">
          <CardFilterBar value={filters} onChange={setFilters} compact pool={cardPool} />
          <div className="builder-preview">
            {hover ? <CardText defId={hover} compact /> : <p className="faint small" style={{ margin: 0 }}>{t('builder.hint')}</p>}
          </div>
          <VirtualGrid
            className="builder-pool-grid"
            scroller="self"
            items={pool}
            getKey={(c) => c.id}
            minItemWidth={84}
            gap={10}
            rowHeight={() => Math.ceil((84 * 86) / 59) + 2}
            renderItem={(c) => {
              const n = counts[c.id] ?? 0;
              const limit = cardLimit(c, format);
              const maxed = n >= limit;
              return (
                <button
                  className={`pool-card ${maxed ? 'maxed' : ''}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', c.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => add(c.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setDetail(c.id);
                  }}
                  onMouseEnter={() => setHover(c.id)}
                  title={c.name[t.lang]}
                >
                  <Card defId={c.id} size="sm" limit={c.real && limit < 3 ? limit : undefined} />
                  {n > 0 && (
                    <span className="pool-card-count">
                      {n}/{limit}
                    </span>
                  )}
                </button>
              );
            }}
          />
        </aside>

        <section className="builder-main">
          <div className="builder-head panel">
            <input className="builder-name" value={deck.name} onChange={(e) => update(deck.id, { name: e.target.value.slice(0, 40) })} aria-label={t('builder.name')} />
            {cardPool === 'real' && (
              <div className="builder-format">
                <span className="small muted">{t('format.label')}</span>
                <div className="seg">
                  {REAL_FORMATS.map((f) => (
                    <button
                      key={f}
                      className={`seg-btn ${format === f ? 'active' : ''}`}
                      onClick={() => {
                        update(deck.id, { format: f });
                        setFilters((cur) => ({ ...cur, autoOnly: f === 'auto' }));
                      }}
                    >
                      {t(`format.${f}`)}
                    </button>
                  ))}
                </div>
                <span className="faint tiny">{t(format === 'auto' ? 'format.auto.d' : 'format.free.d')}</span>
              </div>
            )}
            <div className="row row-wrap">
              <button className="btn btn-sm" onClick={drawHand} disabled={deck.main.length < 5}>
                <Icon.Cards size={16} /> {t('builder.testHand')}
              </button>
              <button className="btn btn-sm" onClick={() => update(deck.id, { main: sortDeckIds(deck.main), extra: sortDeckIds(deck.extra) })}>
                {t('builder.sort')}
              </button>
              <button
                className="btn btn-sm"
                onClick={async () => {
                  if (await copyText(encodeDeck(deck))) toast(t('decks.copied'), 'success');
                }}
              >
                <Icon.Copy /> {t('decks.export')}
              </button>
              {cardPool === 'real' && (
                <>
                  <button className="btn btn-sm" onClick={() => setYdkOpen(true)}>
                    {t('builder.importYdk')}
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      const ids = (xs: string[]) => xs.map((x) => getDef(x).passcode ?? Number(x));
                      const blob = new Blob([toYdk(ids(deck.main), ids(deck.extra))], { type: 'text/plain' });
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(blob);
                      a.download = `${deck.name.replace(/[^\w\- ]+/g, '').trim() || 'deck'}.ydk`;
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
                    }}
                  >
                    {t('builder.exportYdk')}
                  </button>
                </>
              )}
              <button
                className="btn btn-sm btn-danger"
                onClick={() => {
                  void askConfirm(`${t('builder.clear')}?`).then((ok) => ok && update(deck.id, { main: [], extra: [] }));
                }}
              >
                {t('builder.clear')}
              </button>
              <button className="btn btn-sm btn-primary" disabled={issues.length > 0} onClick={() => nav(`/play?deck=${deck.id}`)}>
                <Icon.Play size={12} /> {t('builder.playThis')}
              </button>
            </div>
          </div>

          {issues.length > 0 && (
            <div className="panel panel-pad deck-issues">
              {issues.map((i, k) => (
                <span key={k}>⚠ {issueText(i)}</span>
              ))}
            </div>
          )}

          <div
            className={`deck-zone panel ${dragOver === 'main' ? 'drag-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver('main');
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={onDrop}
          >
            <div className="deck-zone-head">
              <h3>{t('builder.main')}</h3>
              <span className={`deck-count ${deck.main.length >= DECK_RULES.mainMin ? 'ok' : 'bad'}`}>
                {deck.main.length}/{DECK_RULES.mainMin}–{DECK_RULES.mainMax}
              </span>
              <span className="faint small">
                {t('builder.monsters')} {monsters.length} · {t('builder.spells')} {spells} · {t('builder.traps')} {traps}
              </span>
            </div>
            {deck.main.length === 0 ? (
              <p className="faint small">{t('builder.hint')}</p>
            ) : (
              <div className="deck-cards">
                <AnimatePresence initial={false}>
                  {mainSorted.map((x, i) => (
                    <motion.button
                      layout
                      key={`${x}-${mainSorted.slice(0, i).filter((y) => y === x).length}`}
                      className="deck-card"
                      initial={{ opacity: 0, scale: 0.6, y: -20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                      onClick={() => removeAt('main', deck.main.indexOf(x))}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        removeAt('main', deck.main.indexOf(x));
                      }}
                      onMouseEnter={() => setHover(x)}
                      title={getDef(x).name[t.lang]}
                    >
                      <Card defId={x} size="sm" />
                      <span className="deck-card-minus">−</span>
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          <div
            className={`deck-zone panel ${dragOver === 'extra' ? 'drag-over' : ''}`}
            style={{ minHeight: 120 }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver('extra');
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={onDrop}
          >
            <div className="deck-zone-head">
              <h3>{t('builder.extra')}</h3>
              <span className="deck-count ok">
                {deck.extra.length}/{DECK_RULES.extraMax}
              </span>
            </div>
            <div className="deck-cards">
              <AnimatePresence initial={false}>
                {extraSorted.map((x, i) => (
                  <motion.button
                    layout
                    key={`${x}-${extraSorted.slice(0, i).filter((y) => y === x).length}`}
                    className="deck-card"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    onClick={() => removeAt('extra', deck.extra.indexOf(x))}
                    onMouseEnter={() => setHover(x)}
                    title={getDef(x).name[t.lang]}
                  >
                    <Card defId={x} size="sm" />
                    <span className="deck-card-minus">−</span>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          </div>

          <div className="builder-stats">
            <div className="stat-card panel">
              <h4>{t('builder.curve')}</h4>
              <ColumnChart data={levels} ariaLabel={t('builder.curve')} height={120} />
              <p className="faint small" style={{ margin: '10px 0 0' }}>
                {t('builder.avgAtk')}: <b className="mono" style={{ color: 'var(--text)' }}>{avgAtk}</b>
              </p>
            </div>
            <div className="stat-card panel">
              <h4>{t('builder.composition')}</h4>
              <StackedBar
                ariaLabel={t('builder.composition')}
                parts={[
                  { label: t('builder.monsters'), value: monsters.length },
                  { label: t('builder.spells'), value: spells },
                  { label: t('builder.traps'), value: traps },
                ]}
              />
              <h4 style={{ marginTop: 20 }}>{t('builder.attributes')}</h4>
              <BarList rows={attrs} ariaLabel={t('builder.attributes')} />
            </div>
            <div className="stat-card panel">
              <h4>{t('builder.odds')}</h4>
              <div className="odds-list">
                {uniqueMain.slice(0, 9).map(([x, n]) => {
                  const p = openingOdds(deck.main.length, n);
                  return (
                    <div key={x} className="odds-row" onMouseEnter={() => setHover(x)}>
                      <span className="odds-name">
                        {n}× {getDef(x).name[t.lang]}
                      </span>
                      <span className="mono odds-val">{Math.round(p * 100)}%</span>
                    </div>
                  );
                })}
                {uniqueMain.length === 0 && <p className="faint small">—</p>}
              </div>
            </div>
          </div>
        </section>
      </div>

      <Modal open={!!hand} onClose={() => setHand(null)}>
        <h2 style={{ marginTop: 0 }}>{t('builder.testHand')}</h2>
        <div className="sample-hand" key={handSeed}>
          {hand?.map((x, i) => (
            <motion.div key={i} initial={{ rotateY: 180, y: 40, opacity: 0 }} animate={{ rotateY: 0, y: 0, opacity: 1 }} transition={{ delay: i * 0.12, type: 'spring', stiffness: 160, damping: 16 }}>
              <Card defId={x} size="md" holo onClick={() => setDetail(x)} />
            </motion.div>
          ))}
        </div>
        <div className="center" style={{ marginTop: 18 }}>
          <button className="btn btn-primary" onClick={drawHand}>
            <Icon.Shuffle /> {t('builder.redraw')}
          </button>
        </div>
      </Modal>
      <CardModal defId={detail} onClose={() => setDetail(null)} onSelect={setDetail} />
      <YdkImport
        open={ydkOpen}
        onClose={() => setYdkOpen(false)}
        onImport={(list, skipped) => {
          setYdkOpen(false);
          update(deck.id, { main: list.main, extra: list.extra });
          toast(t('builder.ydkImported', { n: list.main.length + list.extra.length }), 'success');
          if (skipped) toast(t('builder.ydkSkipped', { n: skipped }), 'info');
        }}
      />
    </div>
  );
}
