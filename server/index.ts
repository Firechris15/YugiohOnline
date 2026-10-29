// DuelForge server: serves the built web app, the meta-stats API and the
// WebSocket endpoint for online duels.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { RoomManager, type Conn } from './rooms';
import { RecordStore } from './store';
import { CardService } from './cards';
import { aggregate, type MetaStats } from '../src/engine/meta';
import metaSim from '../src/data/meta-sim.json';
import metaRealSim from '../src/data/meta-real.json';
import type { ImageSize } from '../src/shared/ygo';
import type { ClientMsg, ServerMsg } from '../src/shared/protocol';

const PORT = Number(process.env.PORT ?? process.env.SERVER_PORT ?? 8787);
const ROOT = resolve(process.env.DUELFORGE_ROOT ?? process.cwd());
const DIST = join(ROOT, 'dist');
const DATA_FILE = process.env.DUELFORGE_DATA ?? join(ROOT, 'data', 'records.json');
const DATA_DIR = resolve(DATA_FILE, '..');

const store = new RecordStore(DATA_FILE);
const cards = new CardService(DATA_DIR);
void cards.init();
let onlineCache: { at: number; stats: { demo: MetaStats; real: MetaStats } } | null = null;

const rooms = new RoomManager({
  onRecord: (r) => {
    store.add(r);
    onlineCache = null;
  },
});

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function onlineStats(): { demo: MetaStats; real: MetaStats } {
  if (!onlineCache || Date.now() - onlineCache.at > 30_000) {
    const all = store.all();
    onlineCache = {
      at: Date.now(),
      stats: { demo: aggregate(all.filter((r) => (r.pool ?? 'demo') === 'demo'), 'online'), real: aggregate(all.filter((r) => r.pool === 'real'), 'online') },
    };
  }
  return onlineCache.stats;
}

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://x');
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, path);
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    path = '/index.html';
    file = join(DIST, 'index.html');
  }
  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Build the web app first: npm run build');
    return;
  }
  const immutable = path.startsWith('/assets/');
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}

const server = createServer((req, res) => {
  const url = req.url ?? '/';
  if (url.startsWith('/api/')) {
    if (url.startsWith('/api/health')) return json(res, 200, { ok: true, online: rooms.onlineCount });
    if (url.startsWith('/api/meta')) {
      const online = onlineStats();
      return json(res, 200, { sim: metaSim, online: online.demo, real: { sim: metaRealSim, online: online.real } });
    }
    if (url.startsWith('/api/rooms')) return json(res, 200, { rooms: rooms.publicRooms() });
    if (url.startsWith('/api/cards/status')) {
      return json(res, 200, { ready: cards.ready, version: cards.version, count: cards.count, source: cards.source, error: cards.lastError });
    }
    if (url.startsWith('/api/cards')) return cards.serveCards(req, res);
    return json(res, 404, { error: 'not found' });
  }
  const img = /^\/img\/(full|small|cropped)\/(\d{1,10})\.jpg$/.exec(url.split('?')[0]);
  if (img && req.method === 'GET') {
    void cards.serveImage(img[1] as ImageSize, Number(img[2]), res).catch(() => {
      if (!res.headersSent) res.writeHead(502).end();
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  serveStatic(req, res);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

wss.on('connection', (ws: WebSocket) => {
  const send = (msg: ServerMsg) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };
  const conn: Conn = { id: randomUUID(), clientId: '', name: 'Duelist', send };
  rooms.connect(conn);
  let tokens = 40;
  const refill = setInterval(() => (tokens = Math.min(40, tokens + 20)), 1000);
  let alive = true;
  ws.on('pong', () => (alive = true));
  const heartbeat = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, 25_000);

  ws.on('message', (data) => {
    if (--tokens < 0) return send({ t: 'error', code: 'rate_limited', message: 'Slow down.' });
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return send({ t: 'error', code: 'bad_json', message: 'Invalid message.' });
    }
    try {
      rooms.handle(conn, msg);
    } catch (e) {
      console.error('handler error', e);
      send({ t: 'error', code: 'server_error', message: 'Server error.' });
    }
  });
  ws.on('close', () => {
    clearInterval(refill);
    clearInterval(heartbeat);
    rooms.disconnect(conn);
  });
});

setInterval(() => rooms.tick(), 1000);

const shutdown = () => {
  store.flush();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, () => {
  console.log(`DuelForge server listening on http://localhost:${PORT}`);
});
