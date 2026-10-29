import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { STARTER_DECKS, ARCHETYPE_BY_ID, decodeDeck, detectArchetype, encodeDeck, isDeckLegal, getDef, type DeckList } from '../../engine';
import { useT } from '../i18n';
import { useDecks, type UserDeck } from '../store/decks';
import { toast } from '../store/ui';
import { Card } from '../components/Card';
import { Icon } from '../components/Icons';
import '../styles/decks.css';

export function coverCard(list: DeckList): string | null {
  const ids = [...list.extra, ...list.main];
  let best: string | null = null;
  let score = -1;
  for (const id of ids) {
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

function DeckTile({ deck, onEdit }: { deck: UserDeck; onEdit: () => void }) {
  const t = useT();
  const remove = useDecks((s) => s.remove);
  const duplicate = useDecks((s) => s.duplicate);
  const arch = ARCHETYPE_BY_ID[detectArchetype(deck)];
  const cover = coverCard(deck);
  const legal = isDeckLegal(deck);
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="deck-tile panel" style={{ ['--c' as string]: arch?.color ?? '#8aa0ff' }}>
      <button className="deck-tile-cover" onClick={onEdit} aria-label={t('decks.edit')}>
        {cover ? <Card defId={cover} size="md" /> : <div className="deck-tile-empty">+</div>}
      </button>
      <div className="deck-tile-body">
        <h3 title={deck.name}>{deck.name}</h3>
        <div className="row row-wrap small">
          {arch && <span style={{ color: arch.color, fontWeight: 700 }}>{arch.name[t.lang]}</span>}
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
              if (confirm(t('decks.deleteConfirm', { name: deck.name }))) remove(deck.id);
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
  const decks = useDecks((s) => s.decks);
  const create = useDecks((s) => s.create);
  const [code, setCode] = useState('');

  const importCode = () => {
    const list = decodeDeck(code);
    if (!list || list.main.length + list.extra.length === 0) {
      toast(t('decks.importBad'), 'error');
      return;
    }
    const arch = ARCHETYPE_BY_ID[detectArchetype(list)];
    const d = create(arch ? `${arch.name[t.lang]} Import` : 'Import', list);
    setCode('');
    toast(t('decks.importOk'), 'success');
    nav(`/decks/${d.id}`);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{t('decks.title')}</h1>
          <p>{t('decks.lead')}</p>
        </div>
        <div className="row row-wrap">
          <div className="row deck-import">
            <input className="input" placeholder={t('decks.importPlaceholder')} value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && importCode()} aria-label={t('decks.import')} />
            <button className="btn" onClick={importCode} disabled={!code.trim()}>
              {t('decks.import')}
            </button>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => {
              const d = create(t('decks.untitled'));
              nav(`/decks/${d.id}`);
            }}
          >
            <Icon.Plus /> {t('decks.new')}
          </button>
        </div>
      </div>

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
        {t('decks.starters.d')}
      </p>
      <div className="deck-grid">
        {STARTER_DECKS.map((s, i) => {
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
                      const d = create(s.name[t.lang], s.deck);
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
