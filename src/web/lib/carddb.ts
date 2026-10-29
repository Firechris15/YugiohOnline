// Loads the real Yu-Gi-Oh! card database in the browser: from our server
// (/api/cards), or – in the static build – from a bundled cards.json or
// straight from YGOPRODeck. The data is cached in IndexedDB so later visits
// start instantly; the DuelForge demo cards remain available as a fallback.
import { create } from 'zustand';
import { getDef, hasDef, registerRealCards, type CardDef } from '../../engine';
import { YGO_API, cardImageUrl, compactCards, type ApiCard, type CardDb, type ImageSize } from '../../shared/ygo';
import { IS_STATIC } from '../config';
import { apiUrl } from './net';
import { useSettings } from '../store/settings';

export interface CardDbState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  version: string | null;
  count: number;
  source: string | null;
  error: string | null;
}

export const useCardDb = create<CardDbState>(() => ({ status: 'idle', version: null, count: 0, source: null, error: null }));

// ------------------------------------------------------------------ IndexedDB

const IDB_NAME = 'duelforge';
const IDB_STORE = 'kv';

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// -------------------------------------------------------------------- loading

const DAY = 24 * 60 * 60 * 1000;

function apply(db: CardDb): void {
  registerRealCards(db.cards, db.version);
  useCardDb.setState({ status: 'ready', version: db.version, count: db.cards.length, source: db.source ?? 'ygoprodeck', error: null });
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Newer data than the cache, or null when the cache is current. */
async function fetchFresh(cached?: CardDb): Promise<CardDb | null> {
  if (!IS_STATIC) {
    const st = await fetchJson<{ ready: boolean; version: string; count: number; error?: string }>(apiUrl('/api/cards/status'));
    if (!st.ready) throw new Error(st.error ?? 'card database not ready');
    if (cached && cached.version === st.version && cached.cards.length === st.count) return null;
    return fetchJson<CardDb>(apiUrl('/api/cards'));
  }
  if (cached && Date.now() - cached.updated < DAY) return null;
  try {
    const bundled = await fetchJson<CardDb>('./cards.json');
    if (bundled?.cards?.length) return cached?.version === bundled.version ? null : bundled;
  } catch {
    /* no bundled copy: ask YGOPRODeck directly */
  }
  const [en, de] = await Promise.all([
    fetchJson<{ data: ApiCard[] }>(`${YGO_API}/cardinfo.php`),
    fetchJson<{ data: ApiCard[] }>(`${YGO_API}/cardinfo.php?language=de`).catch(() => ({ data: [] as ApiCard[] })),
  ]);
  return { version: `ygoprodeck-${new Date().toISOString().slice(0, 10)}`, updated: Date.now(), cards: compactCards(en.data, de.data), source: 'ygoprodeck' };
}

let started: Promise<void> | null = null;

/** Load (once) and register the real card database. Never rejects. */
export function loadCardDb(): Promise<void> {
  if (started) return started;
  started = (async () => {
    useCardDb.setState({ status: 'loading' });
    let cached: CardDb | undefined;
    try {
      cached = await idbGet<CardDb>('cards');
      if (cached?.cards?.length) apply(cached);
    } catch {
      cached = undefined;
    }
    try {
      const fresh = await fetchFresh(cached);
      if (fresh?.cards?.length) {
        apply(fresh);
        idbSet('cards', fresh).catch(() => {});
      } else if (!cached?.cards?.length) throw new Error('empty card database');
    } catch (e) {
      if (!cached?.cards?.length) useCardDb.setState({ status: 'error', error: (e as Error).message });
    }
  })();
  return started;
}

// ------------------------------------------------------------------- helpers

export type CardPool = 'real' | 'demo';

/** The card pool the site currently shows: real cards once loaded, else the demo set. */
export function useCardPool(): { pool: CardPool; wanted: CardPool; status: CardDbState['status'] } {
  const wanted = useSettings((s) => s.pool);
  const status = useCardDb((s) => s.status);
  return { pool: wanted === 'real' && status === 'ready' ? 'real' : 'demo', wanted, status };
}

export function inPool(d: CardDef, pool: CardPool): boolean {
  return pool === 'real' ? !!d.real : !d.real;
}

/** Image of a real card (through the server's cache when there is a server). */
export function realImage(defId: string, size: ImageSize): string | null {
  if (!hasDef(defId)) return null;
  const d = getDef(defId);
  if (!d.real || !d.passcode) return null;
  return cardImageUrl(d.passcode, size, IS_STATIC ? null : apiUrl(''));
}

// ------------------------------------------------------------ image health

/** Whether real card images load here (some embeds block images from other sites). */
export const useImageHealth = create<{ blocked: boolean }>(() => ({ blocked: false }));
let imagesOk = 0;
let imagesFailed = 0;

export function reportImage(ok: boolean): void {
  if (ok) imagesOk++;
  else imagesFailed++;
  const blocked = imagesOk === 0 && imagesFailed >= 4;
  if (blocked !== useImageHealth.getState().blocked) useImageHealth.setState({ blocked });
}
