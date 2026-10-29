import { motion } from 'framer-motion';
import { archetypeInfo } from '../lib/cards';
import { useT } from '../i18n';
import { useSettings, type AnimSpeed } from '../store/settings';
import { useHistory } from '../store/history';
import { StatTile } from '../components/Charts';
import { sfx } from '../lib/sound';
import { askConfirm } from '../store/ui';
import '../styles/profile.css';

export default function ProfilePage() {
  const t = useT();
  const s = useSettings();
  const matches = useHistory((h) => h.matches);
  const clear = useHistory((h) => h.clear);
  const wins = matches.filter((m) => m.result === 'win').length;
  const losses = matches.filter((m) => m.result === 'loss').length;
  const rate = matches.length ? wins / matches.length : 0;

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <h1>{t('profile.title')}</h1>
      </div>

      <section className="panel panel-pad settings">
        <label className="field">
          {t('profile.name')}
          <input className="input" value={s.name} maxLength={20} placeholder={t.lang === 'de' ? 'Duellant' : 'Duelist'} onChange={(e) => s.set({ name: e.target.value })} />
        </label>
        <div className="setting-row">
          <span>{t('profile.language')}</span>
          <div className="seg" style={{ width: 200 }}>
            {(['de', 'en'] as const).map((l) => (
              <button key={l} className={`seg-btn ${s.lang === l ? 'active' : ''}`} onClick={() => s.set({ lang: l })}>
                {l === 'de' ? 'Deutsch' : 'English'}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <span>{t('profile.sound')}</span>
          <button
            className={`toggle ${s.sound ? 'on' : ''}`}
            aria-pressed={s.sound}
            aria-label={t('profile.sound')}
            onClick={() => {
              s.set({ sound: !s.sound });
              setTimeout(() => sfx.click(), 30);
            }}
          />
        </div>
        <div className="setting-row">
          <span>{t('profile.volume')}</span>
          <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => s.set({ volume: Number(e.target.value) })} onMouseUp={() => sfx.summon()} style={{ accentColor: 'var(--accent)', width: 200 }} />
        </div>
        <div className="setting-row">
          <span>{t('profile.speed')}</span>
          <div className="seg" style={{ width: 280 }}>
            {(['slow', 'normal', 'fast'] as AnimSpeed[]).map((sp) => (
              <button key={sp} className={`seg-btn ${s.speed === sp ? 'active' : ''}`} onClick={() => s.set({ speed: sp })}>
                {t(`profile.speed.${sp}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <span>
            {t('profile.autoPass')}
            <small className="faint" style={{ display: 'block' }}>
              {t('profile.autoPass.d')}
            </small>
          </span>
          <button className={`toggle ${s.smartPass ? 'on' : ''}`} aria-pressed={s.smartPass} aria-label={t('profile.autoPass')} onClick={() => s.set({ smartPass: !s.smartPass })} />
        </div>
      </section>

      <h2 style={{ marginTop: 32 }}>{t('profile.history')}</h2>
      <div className="grid-3" style={{ marginBottom: 16 }}>
        <StatTile label={t('profile.duels')} value={matches.length} />
        <StatTile label={t('profile.record')} value={`${wins} – ${losses}`} />
        <StatTile label={t('profile.winRate')} value={`${Math.round(rate * 100)}%`} />
      </div>
      {matches.length === 0 ? (
        <div className="panel empty">{t('profile.noHistory')}</div>
      ) : (
        <div className="panel history">
          {matches.map((m, i) => (
            <motion.div key={m.id} className={`history-row ${m.result}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 15) * 0.02 }}>
              <span className={`result-pill ${m.result}`}>{m.result === 'win' ? t('profile.win') : m.result === 'loss' ? t('profile.loss') : t('duel.draw')}</span>
              <span className="history-vs">
                {t('profile.vsBot', { name: m.opponent })}
                <small className="faint">
                  {m.mode === 'online' ? t('profile.online') : t('profile.botMode')} · {m.myDeck}
                  {m.myArchetype && m.myArchetype !== 'mixed' ? ` (${archetypeInfo(m.myArchetype, t.lang).name})` : ''}
                </small>
              </span>
              <span className="faint small mono">{t('duel.stats', { turns: m.turns, lp: m.lp })}</span>
              <span className="faint small">{new Date(m.at).toLocaleString(t.lang === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </motion.div>
          ))}
          <div className="center" style={{ padding: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => void askConfirm(`${t('profile.clearHistory')}?`).then((ok) => ok && clear())}>
              {t('profile.clearHistory')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
