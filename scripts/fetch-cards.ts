// Downloads the real card database into data/cards.json (YGOPRODeck, or the
// open EDOPro databases on GitHub as a fallback). The server does this on its
// own at start-up; the script is handy for the meta simulation and the static build.
//
// Usage: npm run cards
import { resolve } from 'node:path';
import { CardService } from '../server/cards';

const svc = new CardService(resolve(process.env.DUELFORGE_DATA_DIR ?? 'data'));
await svc.refresh();
if (!svc.ready) {
  console.error('Could not load the card database:', svc.lastError);
  process.exit(1);
}
console.log(`${svc.count} cards (${svc.version}, source: ${svc.source}) → data/cards.json`);
