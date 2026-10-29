import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { Card } from '../components/Card';
import { CardModal } from '../components/CardDetail';
import { CardFilterBar, DEFAULT_FILTERS, useFilteredCards, usePoolCards, type FilterState } from '../components/CardFilters';
import { CardDbNotice, PoolSwitch } from '../components/PoolSwitch';
import { VirtualGrid } from '../components/VirtualGrid';
import { useDecks, deckFormat, deckPoolOf } from '../store/decks';
import { toast } from '../store/ui';
import { useCardPool } from '../lib/carddb';
import { cardLimit, getDef, isExtraDeckCard } from '../../engine';
import '../styles/library.css';

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.innerWidth <= 640);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth <= 640);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return narrow;
}

export default function LibraryPage() {
  const t = useT();
  const { pool } = useCardPool();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const cards = useFilteredCards(filters, t.lang, pool);
  const total = usePoolCards(pool, t.lang).length;
  const [picked, setPicked] = useState<string | null>(null);
  const decks = useDecks((s) => s.decks).filter((d) => deckPoolOf(d) === pool);
  const update = useDecks((s) => s.update);
  const [target, setTarget] = useState('');
  const narrow = useNarrow();
  const cardW = narrow ? 104 : 150;

  useEffect(() => setFilters(DEFAULT_FILTERS), [pool]);

  const addToDeck = () => {
    if (!picked) return;
    const deck = decks.find((d) => d.id === (target || decks[0]?.id));
    if (!deck) return;
    const d = getDef(picked);
    const copies = [...deck.main, ...deck.extra].filter((x) => x === picked).length;
    const limit = cardLimit(d, deckFormat(deck));
    if (copies >= limit) {
      toast(t(limit === 0 ? 'deck.banned' : 'deck.tooManyCopies', { card: d.name[t.lang], n: copies + 1, limit }), 'error');
      return;
    }
    if (isExtraDeckCard(d)) update(deck.id, { extra: [...deck.extra, picked] });
    else update(deck.id, { main: [...deck.main, picked] });
    toast(`${d.name[t.lang]} → ${deck.name}`, 'success');
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <span className="eyebrow">{cards.length === total ? t('lib.count', { n: total.toLocaleString(t.lang) }) : t('lib.showing', { n: cards.length.toLocaleString(t.lang), total: total.toLocaleString(t.lang) })}</span>
          <h1>{t('lib.title')}</h1>
          <p>{t(pool === 'real' ? 'lib.leadReal' : 'lib.lead')}</p>
        </div>
        <PoolSwitch />
      </div>
      <CardDbNotice />
      <div className="panel panel-pad lib-filters">
        <CardFilterBar value={filters} onChange={setFilters} pool={pool} />
      </div>
      {cards.length === 0 ? (
        <div className="empty">{t('lib.none')}</div>
      ) : (
        <VirtualGrid
          className="lib-vgrid"
          items={cards}
          getKey={(c) => c.id}
          minItemWidth={cardW + 8}
          gap={narrow ? 12 : 20}
          rowHeight={() => Math.ceil((cardW * 86) / 59) + 44}
          renderItem={(c) => (
            <button className="lib-item" onClick={() => setPicked(c.id)}>
              <Card defId={c.id} size="md" holo />
              <span className="lib-item-name">{c.name[t.lang]}</span>
            </button>
          )}
        />
      )}
      {pool === 'real' && <p className="faint tiny lib-credit">{t('carddb.credit')}</p>}
      <CardModal
        defId={picked}
        onClose={() => setPicked(null)}
        onSelect={setPicked}
        actions={
          decks.length > 0 ? (
            <div className="row row-wrap" style={{ marginTop: 16 }}>
              <select className="select" style={{ maxWidth: 260 }} value={target || decks[0].id} onChange={(e) => setTarget(e.target.value)}>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <button className="btn btn-primary btn-sm" onClick={addToDeck}>
                + {t('card.addToDeck')}
              </button>
            </div>
          ) : null
        }
      />
    </div>
  );
}
