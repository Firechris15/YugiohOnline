import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Footer, Navbar, PageTransition, Toasts } from './components/Layout';
import { useSettings } from './store/settings';
import { HomePage } from './pages/Home';

const LibraryPage = lazy(() => import('./pages/Library'));
const DecksPage = lazy(() => import('./pages/Decks'));
const DeckBuilderPage = lazy(() => import('./pages/DeckBuilder'));
const MetaPage = lazy(() => import('./pages/Meta'));
const PlayPage = lazy(() => import('./pages/Play'));
const DuelPage = lazy(() => import('./duel/DuelPage'));
const ProfilePage = lazy(() => import('./pages/Profile'));
const RulesPage = lazy(() => import('./pages/Rules'));
const NotFoundPage = lazy(() => import('./pages/NotFound'));

function Loading() {
  return (
    <div className="page center" style={{ paddingTop: 160 }}>
      <div className="spinner" style={{ margin: '0 auto' }} />
    </div>
  );
}

export function App() {
  const loc = useLocation();
  const lang = useSettings((s) => s.lang);
  const inDuel = loc.pathname.startsWith('/duel');

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (!loc.hash) window.scrollTo({ top: 0 });
  }, [loc.pathname, loc.hash]);

  return (
    <>
      {!inDuel && <Navbar />}
      <Suspense fallback={<Loading />}>
        <AnimatePresence mode="wait">
          <Routes location={loc} key={loc.pathname.split('/')[1] || 'home'}>
            <Route path="/" element={<PageTransition><HomePage /></PageTransition>} />
            <Route path="/library" element={<PageTransition><LibraryPage /></PageTransition>} />
            <Route path="/decks" element={<PageTransition><DecksPage /></PageTransition>} />
            <Route path="/decks/:id" element={<PageTransition><DeckBuilderPage /></PageTransition>} />
            <Route path="/meta" element={<PageTransition><MetaPage /></PageTransition>} />
            <Route path="/play" element={<PageTransition><PlayPage /></PageTransition>} />
            <Route path="/duel/:mode" element={<DuelPage />} />
            <Route path="/duel/:mode/:code" element={<DuelPage />} />
            <Route path="/profile" element={<PageTransition><ProfilePage /></PageTransition>} />
            <Route path="/rules" element={<PageTransition><RulesPage /></PageTransition>} />
            <Route path="*" element={<PageTransition><NotFoundPage /></PageTransition>} />
          </Routes>
        </AnimatePresence>
      </Suspense>
      {!inDuel && <Footer />}
      <Toasts />
    </>
  );
}
