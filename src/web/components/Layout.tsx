import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useT } from '../i18n';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { probeServer } from '../lib/net';
import { Icon } from './Icons';
import { SITE_NAME } from '../config';
import '../styles/layout.css';

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4de1ff" />
          <stop offset="1" stopColor="#b14dff" />
        </linearGradient>
      </defs>
      <polygon points="32,3 57,17.5 57,46.5 32,61 7,46.5 7,17.5" fill="#0b0e1f" stroke="url(#lg)" strokeWidth="3.5" />
      <rect x="18" y="16" width="16" height="24" rx="3" fill="none" stroke="#4de1ff" strokeWidth="3" transform="rotate(-14 26 28)" />
      <rect x="29" y="17" width="16" height="24" rx="3" fill="#0b0e1f" stroke="#b14dff" strokeWidth="3" transform="rotate(12 37 29)" />
      <path d="M37 22 L41 29 L37 36 L33 29 Z" fill="#ffcc4d" transform="rotate(12 37 29)" />
    </svg>
  );
}

const NAV = [
  { to: '/', key: 'nav.home', end: true },
  { to: '/library', key: 'nav.library' },
  { to: '/decks', key: 'nav.decks' },
  { to: '/meta', key: 'nav.meta' },
  { to: '/rules', key: 'nav.rules' },
];

export function Navbar() {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const set = useSettings((s) => s.set);
  const [online, setOnline] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      const r = await probeServer();
      if (alive) setOnline(r.ok ? r.online : null);
    };
    void poll();
    const id = setInterval(poll, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  useEffect(() => setOpen(false), [loc.pathname]);

  return (
    <header className={`nav ${scrolled ? 'nav-scrolled' : ''}`}>
      <div className="nav-inner">
        <Link to="/" className="nav-brand">
          <Logo />
          <span className="nav-brand-text">{SITE_NAME}</span>
        </Link>
        <nav className={`nav-links ${open ? 'open' : ''}`}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              {({ isActive }) => (
                <>
                  {t(n.key)}
                  {isActive && <motion.span layoutId="nav-underline" className="nav-underline" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                </>
              )}
            </NavLink>
          ))}
          <NavLink to="/profile" className={({ isActive }) => `nav-link nav-link-mobile ${isActive ? 'active' : ''}`}>
            {t('nav.profile')}
          </NavLink>
        </nav>
        <div className="nav-right">
          <span className={`nav-online ${online === null ? 'off' : ''}`} title={online === null ? t('nav.offline') : t('nav.online', { n: online })}>
            <i />
            <span className="hidden-mobile">{online === null ? t('nav.offline') : t('nav.online', { n: online })}</span>
          </span>
          <button className="btn btn-ghost btn-sm nav-lang" onClick={() => set({ lang: lang === 'de' ? 'en' : 'de' })} aria-label="Language">
            <Icon.Globe size={16} /> {lang.toUpperCase()}
          </button>
          <Link to="/profile" className="btn btn-ghost btn-icon hidden-mobile" aria-label={t('nav.profile')}>
            <Icon.Settings size={18} />
          </Link>
          <Link to="/play" className="btn btn-primary btn-sm">
            <Icon.Play size={14} /> {t('nav.play')}
          </Link>
          <button className="btn btn-ghost btn-icon nav-burger" onClick={() => setOpen((o) => !o)} aria-label="Menu">
            <Icon.Menu />
          </button>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  const t = useT();
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="row">
          <Logo size={24} />
          <strong>{SITE_NAME}</strong>
          <span className="faint small">© {new Date().getFullYear()}</span>
        </div>
        <p className="faint small footer-disclaimer">{t('footer.disclaimer')}</p>
        <div className="row small">
          <Link to="/library">{t('nav.library')}</Link>
          <Link to="/decks">{t('nav.decks')}</Link>
          <Link to="/meta">{t('nav.meta')}</Link>
          <Link to="/rules">{t('nav.rules')}</Link>
        </div>
      </div>
    </footer>
  );
}

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="toast-wrap">
      <AnimatePresence>
        {toasts.map((x) => (
          <motion.div
            key={x.id}
            className={`toast ${x.kind}`}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
          >
            {x.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function Modal({ open, onClose, children, wide }: { open: boolean; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.div
            className="modal"
            style={wide ? { width: 'min(1100px, 100%)' } : undefined}
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button className="btn btn-ghost btn-icon modal-close" onClick={onClose} aria-label="Close">
              <Icon.Close />
            </button>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Tabs<T extends string>({ value, onChange, items, id }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[]; id: string }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((it) => (
        <button key={it.value} role="tab" aria-selected={value === it.value} className={`tab ${value === it.value ? 'active' : ''}`} onClick={() => onChange(it.value)}>
          {value === it.value && <motion.span layoutId={`tab-${id}`} className="tab-pill" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}
