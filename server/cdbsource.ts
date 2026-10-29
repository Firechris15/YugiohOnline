// Loads the open EDOPro card databases from GitHub (fallback when the
// YGOPRODeck API is unreachable) and converts them into compact records.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CDB_SOURCES, cdbToCards, parseLflist, parseSetnames, type CdbRow, type Lflist } from '../src/shared/cdb';
import type { YgoCard } from '../src/shared/ygo';

type Sqlite = { DatabaseSync: new (path: string, opts?: { readOnly?: boolean }) => { prepare(sql: string): { all(): unknown[] }; close(): void } };

async function openSqlite(): Promise<Sqlite> {
  // node:sqlite is built into Node 22.13+; loaded lazily so older runtimes only lose this fallback.
  const name = 'node:sqlite';
  return (await import(/* @vite-ignore */ name)) as Sqlite;
}

function readRows(sqlite: Sqlite, bytes: Buffer, withData: boolean): CdbRow[] {
  const dir = mkdtempSync(join(tmpdir(), 'duelforge-cdb-'));
  const file = join(dir, 'cards.cdb');
  try {
    writeFileSync(file, bytes);
    const db = new sqlite.DatabaseSync(file, { readOnly: true });
    try {
      const sql = withData
        ? 'SELECT d.id, d.ot, d.alias, CAST(d.setcode AS TEXT) AS setcode, d.type, d.atk, d.def, d.level, d.race, d.attribute, t.name, t."desc" AS "desc" FROM datas d JOIN texts t ON t.id = d.id'
        : 'SELECT id, name, "desc" AS "desc" FROM texts';
      return db.prepare(sql).all() as CdbRow[];
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export interface CdbResult {
  version: string;
  cards: YgoCard[];
}

/** Download and convert; throws when the main database cannot be loaded. */
export async function loadCdbCards(fetchImpl: typeof fetch = fetch): Promise<CdbResult> {
  const get = async (url: string) => {
    const res = await fetchImpl(url, { headers: { 'user-agent': 'DuelForge/1.0' } });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  };
  const optional = async (url: string) => {
    try {
      return await get(url);
    } catch (e) {
      console.warn('Optional card data unavailable:', (e as Error).message);
      return null;
    }
  };
  const sqlite = await openSqlite();
  const [main, german, strings, tcg, ocg, goat] = await Promise.all([
    get(CDB_SOURCES.cards),
    optional(CDB_SOURCES.german),
    optional(CDB_SOURCES.strings),
    optional(CDB_SOURCES.tcg),
    optional(CDB_SOURCES.ocg),
    optional(CDB_SOURCES.goat),
  ]);
  const rows = readRows(sqlite, main, true);
  const de = german ? new Map(readRows(sqlite, german, false).map((r) => [r.id, { name: r.name, desc: r.desc }])) : undefined;
  const list = (b: Buffer | null): Lflist | undefined => (b ? parseLflist(b.toString('utf8')) : undefined);
  const banlists = { tcg: list(tcg), ocg: list(ocg), goat: list(goat) };
  const cards = cdbToCards(rows, { german: de, setnames: strings ? parseSetnames(strings.toString('utf8')) : undefined, banlists });
  const version = `cdb-${banlists.tcg?.name.replace(/\s+/g, '-') ?? 'unknown'}-${cards.length}`;
  return { version, cards };
}
