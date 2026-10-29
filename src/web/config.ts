// Site-wide configuration. Change the name here to rebrand the site.
export const SITE_NAME = 'DuelForge';

// Static build (no game server, e.g. a preview link): online features are hidden
// and the app uses in-memory routing. Set via VITE_STATIC=1 (npm run build:static).
export const IS_STATIC = import.meta.env.VITE_STATIC === '1';
