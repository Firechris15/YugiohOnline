import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { STARTER_DECKS, ARCHETYPE_BY_ID, REAL_STARTERS, decodeDeck, detectArchetype, encodeDeck, isDeckLegal, getDef, hasDef, isExtraDeckCard, realId, resolveRealStarter, type DeckList } from '../../engine';
import { parseYdk } from '../../shared/ygo';
import { useT } from '../i18n';
import { useDecks, deckFormat, deckPoolOf, type UserDeck } from '../store/decks';
import { askConfirm, toast } from '../store/ui';
import { Card } from '../components/Card';
import { Icon } from '../components/Icons';
import { Modal } from '../components/Layout';
import { CardDbNotice, PoolSwitch } from '../components/PoolSwitch';
import { useCardPool } from '../lib/carddb';
import { archetypeInfo } from '../lib/cards';
import '../styles/decks.css';

export function coverCard(list: DeckList): string | null {
  const ids = [...list.extra, ...list.main];
  let best: string | null = null;
  let score = -1;
  for (const id of ids) {
    if (!hasDef(id)) continue;
    const d = getDef(id);
    const s = (d.kind === 'monster' ? (d.atk ?? 0) : 0) + (d.frame === 'fusion' ? 500 : 0) + ({ common: 0, rare: 100, super: 200, ultra: 400, secret: 600 }[d.rarity] ?? 0);
    if (s > score) {
      score = s;
      best = id;
    }
  }
  return best;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/** Convert a .ydk file into a deck of registered real cards. */
export function ydkToDeck(text: string): { list: DeckList; skipped: number } {
  const ydk = parseYdk(text);
  let skipped = 0;
  const pick = (ids: number[]) =>
    ids.flatMap((n) => {
      const id = realId(n);
      if (hasDef(id)) return [id];
      skipped++;
      return [];
    });
  const all = [...pick(ydk.main), ...pick(ydk.extra)];
  const list = { main: all.filter((id) => !isExtraDeckCard(getDef(id))), extra: all.filter((id) => isExtraDeckCard(getDef(id))) };
  return { list, skipped };
}

export function YdkImport({ open, onClose, onImport }: { open: boolean; onClose: () => void; onImport: (list: DeckList, skipped: number) => void }) {
  const t = useT();
  const [text, setText] = useState('');
  const run = (src: string) => {
    const { list, skipped } = ydkToDeck(src);
    if (list.main.length + list.extra.length === 0) {
      toast(t('decks.importBad'), 'error');
      return;
    }
    onImport(list, skipped);
    setText('');
  };
  return (
    <Modal open={open} onClose={onClose}>
      <h2 style={{ marginTop: 0 }}>{t('decks.ydkTitle')}</h2>
      <p className="muted small">{t('decks.ydkLead')}</p>
      <textarea className="input ydk-text" rows={9} value={text} placeholder={'#main\n46986414\n…\n#extra\n…'} onChange={(e) => setText(e.target.value)} />
      <div className="row row-wrap" style={{ marginTop: 12 }}>
        <label className="btn btn-sm">
          {t('decks.ydkFile')}
          <input
            type="file"
            accept=".ydk,text/plain"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void f.text().then(run);
              e.target.value = '';
            }}
          />
        </label>
        <span className="spacer" />
        <button className="btn btn-primary btn-sm" disabled={!text.trim()} onClick={() => run(text)}>
          {t('decks.import')}
        </button>
      </div>
    </Modal>
  );
}

function DeckTile({ deck, onEdit }: { deck: UserDeck; onEdit: () => void }) {
  const t = useT();
  const remove = useDecks((s) => s.remove);
  const duplicate = useDecks((s) => s.duplicate);
  const known = [...deck.main, ...deck.extra].every(hasDef);
  const arch = known ? archetypeInfo(detectArchetype(deck), t.lang) : null;
  const cover = coverCard(deck);
  const format = deckFormat(deck);
  const legal = known && isDeckLegal(deck, format);
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="deck-tile panel" style={{ ['--c' as string]: arch?.color ?? '#8aa0ff' }}>
      <button className="deck-tile-cover" onClick={onEdit} aria-label={t('decks.edit')}>
        {cover ? <Card defId={cover} size="md" /> : <div className="deck-tile-empty">+</div>}
      </button>
      <div className="deck-tile-body">
        <h3 title={deck.name}>{deck.name}</h3>
        <div className="row row-wrap small">
          {arch && <span style={{ color: arch.color, fontWeight: 700 }}>{arch.name}</span>}
          {format !== 'demo' && <span className="badge">{t(`format.${format}`)}</span>}
          <span className={`badge ${legal ? 'badge-ok' : 'badge-bad'}`}>{legal ? t('decks.legal') : t('decks.illegal')}</span>
        </div>
        <p className="faint small" style={{ margin: '6px 0 12px' }}>
          {t('decks.cards', { main: deck.main.length, extra: deck.extra.length })}
        </p>
        <div className="row row-wrap deck-tile-actions">
          <button className="btn btn-sm btn-primary" onClick={onEdit}>
            <Icon.Edit /> {t('decks.edit')}
          </button>
          <button
            className="btn btn-sm"
            onClick={async () => {
              if (await copyText(encodeDeck(deck))) toast(t('decks.copied'), 'success');
            }}
            title={t('decks.export')}
          >
            <Icon.Copy />
          </button>
          <button className="btn btn-sm" onClick={() => duplicate(deck.id, t('decks.copyOf', { name: deck.name }))} title={t('decks.duplicate')}>
            <Icon.Shuffle />
          </button>
          <button
            className="btn btn-sm btn-danger"
            onClick={() => {
              void askConfirm(t('decks.deleteConfirm', { name: deck.name })).then((ok) => ok && remove(deck.id));
            }}
            title={t('decks.delete')}
          >
            <Icon.Trash />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function DecksPage() {
  const t = useT();
  const nav = useNavigate();
  const { pool } = useCardPool();
  const decks = useDecks((s) => s.decks).filter((d) => deckPoolOf(d) === pool);
  const create = useDecks((s) => s.create);
  const [code, setCode] = useState('');
  const [ydkOpen, setYdkOpen] = useState(false);

  const importList = (list: DeckList, format?: UserDeck['format']) => {
    const arch = archetypeInfo(detectArchetype(list), t.lang);
    const d = create(`${arch.name} Import`, list, format);
    setCode('');
    toast(t('decks.importOk'), 'success');
    nav(`/decks/${d.id}`);
  };

  const importCode = () => {
    const list = decodeDeck(code);
    if (!list || list.main.length + list.extra.length === 0) {
      toast(t('decks.importBad'), 'error');
      return;
    }
    importList(list, deckPoolOf(list) === 'demo' ? 'demo' : 'tcg');
  };

  const realStarters = pool === 'real' ? REAL_STARTERS.map((s) => ({ s, list: resolveRealStarter(s) })).filter((x): x is { s: (typeof REAL_STARTERS)[number]; list: DeckList } => !!x.list) : [];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{t('decks.title')}</h1>
          <p>{t('decks.lead')}</p>
        </div>
        <div className="row row-wrap">
          <PoolSwitch />
          <div className="row deck-import">
            <input className="input" placeholder={t('decks.importPlaceholder')} value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && importCode()} aria-label={t('decks.import')} />
            <button className="btn" onClick={importCode} disabled={!code.trim()}>
              {t('decks.import')}
            </button>
          </div>
          {pool === 'real' && (
            <button className="btn" onClick={() => setYdkOpen(true)}>
              <Icon.Cards size={16} /> {t('decks.ydk')}
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={() => {
              const d = create(t('decks.untitled'), undefined, pool === 'demo' ? 'demo' : 'tcg');
              nav(`/decks/${d.id}`);
            }}
          >
            <Icon.Plus /> {t('decks.new')}
          </button>
        </div>
      </div>

      <CardDbNotice />
      <YdkImport
        open={ydkOpen}
        onClose={() => setYdkOpen(false)}
        onImport={(list, skipped) => {
          setYdkOpen(false);
          if (skipped) toast(t('builder.ydkSkipped', { n: skipped }), 'info');
          importList(list, 'tcg');
        }}
      />
      <h2 className="decks-h2">{t('decks.mine')}</h2>
      {decks.length === 0 ? (
        <div className="panel empty">{t('decks.empty')}</div>
      ) : (
        <motion.div layout className="deck-grid">
          <AnimatePresence>
            {decks.map((d) => (
              <DeckTile key={d.id} deck={d} onEdit={() => nav(`/decks/${d.id}`)} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <div className="divider" style={{ margin: '40px 0 28px' }} />
      <h2 className="decks-h2">{t('decks.starters')}</h2>
      <p className="muted" style={{ marginTop: -8 }}>
        {t(pool === 'real' ? 'decks.startersReal.d' : 'decks.starters.d')}
      </p>
      {pool === 'real' && (
        <div className="deck-grid">
          {realStarters.map(({ s, list }, i) => {
            const cover = coverCard(list);
            return (
              <motion.div key={s.id} className="deck-tile panel starter" style={{ ['--c' as string]: s.color }} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.04 }}>
                <div className="deck-tile-cover">{cover && <Card defId={cover} size="md" />}</div>
                <div className="deck-tile-body">
                  <h3>{s.name[t.lang]}</h3>
                  <span className="badge">{t('format.auto')}</span>
                  <p className="faint small" style={{ margin: '6px 0 12px' }}>
                    {s.description[t.lang]}
                  </p>
                  <div className="row row-wrap">
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => {
                        const d = create(s.name[t.lang], list, 'auto');
                        toast(t('decks.importOk'), 'success');
                        nav(`/decks/${d.id}`);
                      }}
                    >
                      <Icon.Copy /> {t('decks.copy')}
                    </button>
                    <Link className="btn btn-sm" to={`/play?deck=${s.id}`}>
                      <Icon.Play size={12} /> {t('nav.play')}
                    </Link>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
      <div className="deck-grid">
        {(pool === 'demo' ? STARTER_DECKS : []).map((s, i) => {
          const arch = ARCHETYPE_BY_ID[s.archetype];
          const cover = coverCard(s.deck);
          return (
            <motion.div key={s.id} className="deck-tile panel starter" style={{ ['--c' as string]: arch.color }} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.04 }}>
              <div className="deck-tile-cover">{cover && <Card defId={cover} size="md" />}</div>
              <div className="deck-tile-body">
                <h3>{s.name[t.lang]}</h3>
                <span className="small" style={{ color: arch.color, fontWeight: 700 }}>
                  {arch.name[t.lang]}
                </span>
                <p className="faint small" style={{ margin: '6px 0 12px' }}>
                  {arch.description[t.lang]}
                </p>
                <div className="row row-wrap">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => {
                      const d = create(s.name[t.lang], s.deck, 'demo');
                      toast(t('decks.importOk'), 'success');
                      nav(`/decks/${d.id}`);
                    }}
                  >
                    <Icon.Copy /> {t('decks.copy')}
                  </button>
                  <Link className="btn btn-sm" to={`/play?deck=${s.id}`}>
                    <Icon.Play size={12} /> {t('nav.play')}
                  </Link>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
