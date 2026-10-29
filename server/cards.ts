// Real card database: downloads the YGOPRODeck card list (English + German),
// caches it on disk, registers it with the engine and serves a compact copy
// plus a local image cache (YGOPRODeck asks sites not to hotlink images).
// When YGOPRODeck is unreachable the open EDOPro databases on GitHub are used.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, createReadStream, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { YGO_API, compactCards, remoteImageUrl, type ApiCard, type CardDb, type ImageSize } from '../src/shared/ygo';
import { registerRealCards } from '../src/engine/real';
import { loadCdbCards } from './cdbsource';

const REFRESH_MS = 24 * 60 * 60 * 1000;

export class CardService {
  private db: CardDb | null = null;
  private gz: Buffer | null = null;
  private json: Buffer | null = null;
  private loading: Promise<void> | null = null;
  private imgInflight = new Map<string, Promise<boolean>>();
  lastError: string | null = null;
  source: 'ygoprodeck' | 'github' | null = null;

  constructor(
    private dataDir: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  get ready(): boolean {
    return !!this.db && this.db.cards.length > 0;
  }

  get version(): string | null {
    return this.db?.version ?? null;
  }

  get count(): number {
    return this.db?.cards.length ?? 0;
  }

  private get file(): string {
    return join(this.dataDir, 'cards.json');
  }

  /** Load from disk, then refresh from the API if the cache is old or missing. */
  async init(): Promise<void> {
    if (existsSync(this.file)) {
      try {
        this.use(JSON.parse(readFileSync(this.file, 'utf8')) as CardDb);
        console.log(`Card database loaded from cache: ${this.count} cards (${this.version})`);
      } catch (e) {
        console.warn('Card cache unreadable:', (e as Error).message);
      }
    }
    const stale = !this.db || Date.now() - this.db.updated > REFRESH_MS;
    if (stale) await this.refresh();
    setInterval(() => void this.refresh(), REFRESH_MS).unref();
  }

  refresh(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        await this.refreshFromYgoprodeck();
      } catch (e) {
        console.warn('YGOPRODeck unavailable:', (e as Error).message);
        try {
          // Keep a recent cache instead of downgrading to the fallback source.
          if (this.db && Date.now() - this.db.updated < REFRESH_MS * 7) throw e;
          const { version, cards } = await loadCdbCards(this.fetchImpl);
          this.save({ version, updated: Date.now(), cards, source: 'github' });
          console.log(`Card database loaded from GitHub (EDOPro data): ${this.count} cards (${version})`);
        } catch (e2) {
          this.lastError = (e2 as Error).message;
          console.warn('Card database refresh failed:', this.lastError);
        }
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  private save(db: CardDb): void {
    mkdirSync(this.dataDir, { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(db));
    renameSync(`${this.file}.tmp`, this.file);
    this.use(db);
    this.lastError = null;
  }

  private async refreshFromYgoprodeck(): Promise<void> {
    const getJson = async (url: string) => {
      const res = await this.fetchImpl(url, { headers: { 'user-agent': 'DuelForge/1.0' } });
      if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
      return res.json();
    };
    let version = String(Date.now());
    try {
      const v = (await getJson(`${YGO_API}/checkDBVer.php`)) as { database_version?: string }[];
      if (v?.[0]?.database_version) version = String(v[0].database_version);
    } catch {
      /* version endpoint is optional */
    }
    if (this.db && this.db.source !== 'github' && this.db.version === version && Date.now() - this.db.updated < REFRESH_MS * 7) {
      this.db.updated = Date.now();
      return;
    }
    const en = ((await getJson(`${YGO_API}/cardinfo.php`)) as { data: ApiCard[] }).data;
    let de: ApiCard[] = [];
    try {
      de = ((await getJson(`${YGO_API}/cardinfo.php?language=de`)) as { data: ApiCard[] }).data;
    } catch (e) {
      console.warn('German card texts unavailable:', (e as Error).message);
    }
    this.save({ version, updated: Date.now(), cards: compactCards(en, de), source: 'ygoprodeck' });
    console.log(`Card database updated from YGOPRODeck: ${this.count} cards (${version})`);
  }

  private use(db: CardDb): void {
    this.db = db;
    this.source = db.source ?? 'ygoprodeck';
    this.json = Buffer.from(JSON.stringify(db));
    this.gz = gzipSync(this.json);
    registerRealCards(db.cards, db.version);
  }

  /** GET /api/cards */
  serveCards(req: IncomingMessage, res: ServerResponse): void {
    if (!this.db || !this.json || !this.gz) {
      res.writeHead(503, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'card database not available', detail: this.lastError }));
      return;
    }
    const etag = `"${this.db.version}-${this.db.cards.length}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304).end();
      return;
    }
    const gzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      etag,
      ...(gzip ? { 'content-encoding': 'gzip' } : {}),
    });
    res.end(gzip ? this.gz : this.json);
  }

  /** GET /img/:size/:id.jpg – cached copy of the card image. */
  async serveImage(size: ImageSize, id: number, res: ServerResponse): Promise<void> {
    const file = join(this.dataDir, 'img', size, `${id}.jpg`);
    const send = () => {
      res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=2592000, immutable' });
      createReadStream(file).pipe(res);
    };
    if (existsSync(file) && statSync(file).size > 0) return send();
    const key = `${size}/${id}`;
    let job = this.imgInflight.get(key);
    if (!job) {
      job = (async () => {
        try {
          const r = await this.fetchImpl(remoteImageUrl(id, size));
          if (!r.ok) return false;
          const buf = Buffer.from(await r.arrayBuffer());
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(`${file}.tmp`, buf);
          renameSync(`${file}.tmp`, file);
          return true;
        } catch {
          return false;
        } finally {
          this.imgInflight.delete(key);
        }
      })();
      this.imgInflight.set(key, job);
    }
    if (await job) return send();
    // Fall back to the original image so the page still shows something.
    res.writeHead(302, { location: remoteImageUrl(id, size) }).end();
  }
}
