import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ARCHETYPES, REAL_STARTERS, STARTER_DECKS, allCards, realCardByName, realId, realStarterCover } from '../../engine';
import { useT } from '../i18n';
import { Card } from '../components/Card';
import { Particles } from '../components/Particles';
import { Icon } from '../components/Icons';
import { CardModal } from '../components/CardDetail';
import { probeServer } from '../lib/net';
import metaSim from '../../data/meta-sim.json';
import metaReal from '../../data/meta-real.json';
import type { MetaStats } from '../../engine/meta';
import { inPool, useCardPool, useCardDb } from '../lib/carddb';
import { IS_STATIC, SITE_NAME } from '../config';
import '../styles/home.css';

const META = metaSim as MetaStats;
const META_REAL = metaReal as MetaStats;
const HERO_CARDS = ['GLM-F01', 'TID-005', 'EMB-F01', 'LUM-F01', 'AST-F01'];
const REAL_HERO = ['Dark Magician Girl', 'Blue-Eyes White Dragon', 'Dark Magician', 'Red-Eyes Black Dragon', 'Exodia the Forbidden One'];

function heroCards(pool: 'real' | 'demo'): string[] {
  if (pool === 'demo') return HERO_CARDS;
  const ids = REAL_HERO.map((n) => realCardByName(n)).filter((c) => !!c).map((c) => realId(c!.id));
  return ids.length === REAL_HERO.length ? ids : HERO_CARDS;
}
const BOSS_BY_ARCH: Record<string, string> = {
  emberwing: 'EMB-005',
  tidecaller: 'TID-F01',
  ironclad: 'IRN-005',
  gloomveil: 'GLM-005',
  lumina: 'LUM-005',
  galeblade: 'GAL-005',
  thornwild: 'THN-005',
  astral: 'AST-005',
};

function useCountUp(target: number, duration = 1400) {
  const [v, setV] = useState(0);
  const started = useRef(false);
  const goal = useRef(target);
  const ref = useRef<HTMLSpanElement>(null);
  goal.current = target;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || started.current) return;
      started.current = true;
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / duration);
        // read the latest target: it can change while counting (real cards loading)
        setV(Math.round(goal.current * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [duration]);
  useEffect(() => {
    if (started.current) setV(target);
  }, [target]);
  return { v, ref };
}

function Stat({ value, label }: { value: number; label: string }) {
  const { v, ref } = useCountUp(value);
  return (
    <div className="home-stat">
      <span ref={ref} className="home-stat-value mono">
        {v.toLocaleString()}
      </span>
      <span className="home-stat-label">{label}</span>
    </div>
  );
}

function HeroFan({ onPick, cards: HERO_CARDS }: { onPick: (id: string) => void; cards: string[] }) {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 14 });
  const sy = useSpring(my, { stiffness: 60, damping: 14 });
  const rotY = useTransform(sx, [-1, 1], [-10, 10]);
  const rotX = useTransform(sy, [-1, 1], [8, -8]);
  useEffect(() => {
    const on = (e: MouseEvent) => {
      mx.set((e.clientX / window.innerWidth) * 2 - 1);
      my.set((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('mousemove', on);
    return () => window.removeEventListener('mousemove', on);
  }, [mx, my]);
  return (
    <motion.div className="hero-fan" style={{ rotateY: rotY, rotateX: rotX }}>
      {HERO_CARDS.map((id, i) => {
        const offset = i - (HERO_CARDS.length - 1) / 2;
        return (
          <motion.div
            key={id}
            className="hero-fan-card"
            initial={{ opacity: 0, y: 120, rotate: 0 }}
            animate={{ opacity: 1, y: Math.abs(offset) * 22, rotate: offset * 11, x: offset * 92 }}
            transition={{ delay: 0.25 + i * 0.09, type: 'spring', stiffness: 90, damping: 14 }}
            whileHover={{ y: Math.abs(offset) * 22 - 34, scale: 1.08, zIndex: 10, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
            style={{ zIndex: 5 - Math.abs(offset) }}
            onClick={() => onPick(id)}
          >
            <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 4 + i * 0.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 }}>
              <Card defId={id} size="lg" holo />
            </motion.div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

export function HomePage() {
  const t = useT();
  const [picked, setPicked] = useState<string | null>(null);
  const [online, setOnline] = useState(0);
  useEffect(() => {
    void probeServer().then((r) => setOnline(r.online));
  }, []);
  const { pool } = useCardPool();
  useCardDb((s) => s.version);
  const meta = pool === 'real' ? META_REAL : META;
  const winRate = Object.fromEntries(meta.archetypes.map((a) => [a.id, a.winRate]));
  const poolCards = allCards().filter((d) => inPool(d, pool));
  const archetypeCount = pool === 'real' ? new Set(poolCards.map((d) => d.archetype).filter(Boolean)).size : ARCHETYPES.length;
  const tiles =
    pool === 'real'
      ? REAL_STARTERS.map((s) => ({ id: s.id, name: s.name[t.lang], description: s.description[t.lang], color: s.color, boss: realStarterCover(s) })).filter((x): x is typeof x & { boss: string } => !!x.boss)
      : ARCHETYPES.map((a) => ({ id: a.id, name: a.name[t.lang], description: a.description[t.lang], color: a.color, boss: BOSS_BY_ARCH[a.id] }));

  const features = [
    { to: '/library', icon: <Icon.Book size={26} />, title: t('home.f.library'), text: t('home.f.library.d'), color: '#4de1ff' },
    { to: '/decks', icon: <Icon.Hammer size={26} />, title: t('home.f.decks'), text: t('home.f.decks.d'), color: '#ffcc4d' },
    { to: '/meta', icon: <Icon.Chart size={26} />, title: t('home.f.meta'), text: t('home.f.meta.d'), color: '#3ddc97' },
    { to: '/play', icon: <Icon.Swords size={26} />, title: t('home.f.play'), text: t('home.f.play.d'), color: '#ff5c93' },
  ];

  return (
    <div className="home">
      <section className="hero">
        <Particles density={90} />
        <div className="hero-glow" />
        <div className="hero-inner">
          <motion.div className="hero-copy" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.08 } } }}>
            <motion.span className="eyebrow" variants={fadeUp}>
              {t('home.eyebrow')}
            </motion.span>
            <motion.h1 variants={fadeUp} className="hero-title">
              <span>{t('home.title1')}</span>
              <span className="gradient-text">{t('home.title2')}</span>
            </motion.h1>
            <motion.p variants={fadeUp} className="hero-lead">
              {t(pool === 'real' ? 'home.leadReal' : 'home.lead')}
            </motion.p>
            <motion.div variants={fadeUp} className="row row-wrap hero-ctas">
              <Link to="/play" className="btn btn-primary btn-lg">
                <Icon.Play size={16} /> {t('home.ctaPlay')}
              </Link>
              <Link to="/decks" className="btn btn-lg">
                <Icon.Hammer size={18} /> {t('home.ctaBuild')}
              </Link>
            </motion.div>
          </motion.div>
          <div className="hero-visual">
            <HeroFan key={pool} onPick={setPicked} cards={heroCards(pool)} />
          </div>
        </div>
      </section>

      <section className="home-stats page" style={{ paddingTop: 0, paddingBottom: 0 }}>
        <div className="home-stats-inner panel">
          <Stat value={poolCards.length} label={t('home.stat.cards')} />
          <Stat value={archetypeCount} label={t('home.stat.archetypes')} />
          <Stat value={meta.games} label={t('home.stat.duels')} />
          {IS_STATIC ? <Stat value={pool === 'real' ? REAL_STARTERS.length : STARTER_DECKS.length} label={t('home.stat.starters')} /> : <Stat value={online} label={t('home.stat.online')} />}
        </div>
      </section>

      <section className="page" style={{ paddingTop: 64, paddingBottom: 24 }}>
        <motion.h2 className="section-title" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          {t('home.features')}
        </motion.h2>
        <div className="grid-4">
          {features.map((f, i) => (
            <motion.div key={f.to} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ delay: i * 0.08 }}>
              <Link to={f.to} className="feature panel" style={{ ['--c' as string]: f.color }}>
                <span className="feature-icon">{f.icon}</span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
                <span className="feature-arrow">→</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="page" style={{ paddingTop: 48, paddingBottom: 24 }}>
        <div className="page-header">
          <div>
            <h2 className="section-title" style={{ margin: 0 }}>
              {t('home.archetypes')}
            </h2>
            <p>{t('home.archetypes.d')}</p>
          </div>
          <Link to="/meta" className="btn btn-sm">
            <Icon.Chart size={16} /> {t('nav.meta')}
          </Link>
        </div>
        <div className="arch-grid">
          {tiles.map((a, i) => (
            <motion.button
              key={a.id}
              className="arch-tile"
              style={{ ['--c' as string]: a.color }}
              initial={{ opacity: 0, scale: 0.92 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              onClick={() => setPicked(a.boss)}
            >
              <div className="arch-tile-card">
                <Card defId={a.boss} size="md" />
              </div>
              <div className="arch-tile-info">
                <h3>{a.name}</h3>
                <p>{a.description}</p>
                {winRate[a.id] !== undefined && (
                  <div className="arch-wr">
                    <span>{t('home.winrate')}</span>
                    <div className="arch-wr-bar">
                      <motion.i initial={{ width: 0 }} whileInView={{ width: `${winRate[a.id] * 100}%` }} viewport={{ once: true }} transition={{ duration: 1, delay: 0.2 }} />
                    </div>
                    <b className="mono">{Math.round(winRate[a.id] * 100)}%</b>
                  </div>
                )}
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      <section className="page" style={{ paddingTop: 48 }}>
        <h2 className="section-title center">{t('home.steps')}</h2>
        <div className="grid-3 steps">
          {[t('home.step1'), t('home.step2'), t('home.step3')].map((s, i) => (
            <motion.div key={i} className="step panel" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.12 }}>
              <span className="step-num">{i + 1}</span>
              <p>{s}</p>
            </motion.div>
          ))}
        </div>
        <div className="center" style={{ marginTop: 36 }}>
          <Link to="/play" className="btn btn-gold btn-lg">
            <Icon.Swords size={18} /> {t('home.ctaPlay')} – {SITE_NAME}
          </Link>
        </div>
      </section>
      <CardModal defId={picked} onClose={() => setPicked(null)} onSelect={setPicked} />
    </div>
  );
}

const fadeUp = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 120, damping: 18 } } };
