// Switch between the real Yu-Gi-Oh! card pool and the DuelForge demo set,
// plus the loading / error notice for the real card database.
import { useT } from '../i18n';
import { useSettings } from '../store/settings';
import { loadCardDb, useCardDb, useCardPool } from '../lib/carddb';

export function PoolSwitch() {
  const t = useT();
  const set = useSettings((s) => s.set);
  const { wanted } = useCardPool();
  return (
    <div className="seg pool-switch" role="group" aria-label={t('pool.switch')}>
      {(['real', 'demo'] as const).map((p) => (
        <button key={p} className={`seg-btn ${wanted === p ? 'active' : ''}`} onClick={() => set({ pool: p })} aria-pressed={wanted === p}>
          {t(`pool.${p}`)}
        </button>
      ))}
    </div>
  );
}

export function CardDbNotice() {
  const t = useT();
  const { wanted, status } = useCardPool();
  const error = useCardDb((s) => s.error);
  if (wanted !== 'real' || status === 'ready') return null;
  if (status === 'error')
    return (
      <div className="panel panel-pad carddb-notice bad">
        <span>⚠ {t('carddb.error')}</span>
        {error && <span className="faint tiny">({error})</span>}
        <button className="btn btn-sm" onClick={() => location.reload()}>
          {t('carddb.retry')}
        </button>
      </div>
    );
  return (
    <div className="panel panel-pad carddb-notice">
      <div className="spinner spinner-sm" />
      <span>{t('carddb.loading')}</span>
    </div>
  );
}

export { loadCardDb };
