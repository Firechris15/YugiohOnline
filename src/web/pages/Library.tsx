import { useState } from 'react';
import { motion } from 'framer-motion';
import { useT } from '../i18n';
import { Card } from '../components/Card';
import { CardModal } from '../components/CardDetail';
import { CardFilterBar, DEFAULT_FILTERS, useFilteredCards, type FilterState } from '../components/CardFilters';
import { useDecks } from '../store/decks';
import { toast } from '../store/ui';
import { getDef, isExtraDeckCard } from '../../engine';
import '../styles/library.css';

export default function LibraryPage() {
  const t = useT();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const cards = useFilteredCards(filters, t.lang);
  const [picked, setPicked] = useState<string | null>(null);
  const decks = useDecks((s) => s.decks);
  const update = useDecks((s) => s.update);
  const [target, setTarget] = useState('');

  const addToDeck = () => {
    if (!picked) return;
    const deck = decks.find((d) => d.id === (target || decks[0]?.id));
    if (!deck) return;
    const d = getDef(picked);
    const copies = [...deck.main, ...deck.extra].filter((x) => x === picked).length;
    if (copies >= (d.limit ?? 3)) {
      toast(t('deck.tooManyCopies', { card: d.name[t.lang], n: copies + 1, limit: d.limit ?? 3 }), 'error');
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
          <span className="eyebrow">{t('lib.count', { n: cards.length })}</span>
          <h1>{t('lib.title')}</h1>
          <p>{t('lib.lead')}</p>
        </div>
      </div>
      <div className="panel panel-pad lib-filters">
        <CardFilterBar value={filters} onChange={setFilters} />
      </div>
      {cards.length === 0 ? (
        <div className="empty">{t('lib.none')}</div>
      ) : (
        <motion.div className="lib-grid" initial="hidden" animate="show" key={JSON.stringify(filters)} variants={{ show: { transition: { staggerChildren: 0.012 } } }}>
          {cards.map((c) => (
            <motion.button
              key={c.id}
              className="lib-item"
              variants={{ hidden: { opacity: 0, y: 16, scale: 0.96 }, show: { opacity: 1, y: 0, scale: 1 } }}
              whileHover={{ y: -8, transition: { type: 'spring', stiffness: 400, damping: 22 } }}
              onClick={() => setPicked(c.id)}
            >
              <Card defId={c.id} size="md" holo />
              <span className="lib-item-name">{c.name[t.lang]}</span>
            </motion.button>
          ))}
        </motion.div>
      )}
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
