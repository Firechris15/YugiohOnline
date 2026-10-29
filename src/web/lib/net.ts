// WebSocket client for online duels (singleton zustand store).
import { create } from 'zustand';
import type { Action, DeckList, GameView } from '../../engine';
import type { ClientMsg, PublicRoom, RoomInfo, ServerMsg } from '../../shared/protocol';
import { useSettings, playerName } from '../store/settings';

export interface ChatLine {
  from: 0 | 1;
  name: string;
  text: string;
  at: number;
}

interface NetState {
  status: 'idle' | 'connecting' | 'open' | 'closed';
  online: number;
  room: RoomInfo | null;
  view: GameView | null;
  views: GameView[]; // queued views (consumed by the duel presenter)
  queued: boolean;
  chat: ChatLine[];
  emotes: { from: 0 | 1; id: string; at: number }[];
  publicRooms: PublicRoom[];
  lastError: { code: string; message: string; at: number } | null;
  closedReason: string | null;
  connect: () => Promise<void>;
  send: (msg: ClientMsg) => void;
  createRoom: (deck: DeckList, deckName: string, isPublic: boolean) => Promise<void>;
  joinRoom: (code: string, deck: DeckList, deckName: string) => Promise<void>;
  quickMatch: (deck: DeckList, deckName: string) => Promise<void>;
  cancelQueue: () => void;
  leaveRoom: () => void;
  act: (a: Action) => void;
  takeViews: () => GameView[];
  reset: () => void;
}

let ws: WebSocket | null = null;
let connecting: Promise<void> | null = null;
let retry = 0;
let pingTimer: ReturnType<typeof setInterval> | null = null;

function wsUrl(): string {
  const env = (import.meta as { env?: Record<string, string> }).env?.VITE_SERVER_URL;
  if (env) return env.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws';
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

export function apiUrl(path: string): string {
  const env = (import.meta as { env?: Record<string, string> }).env?.VITE_SERVER_URL;
  return (env ? env.replace(/\/$/, '') : '') + path;
}

export const useNet = create<NetState>()((set, get) => ({
  status: 'idle',
  online: 0,
  room: null,
  view: null,
  views: [],
  queued: false,
  chat: [],
  emotes: [],
  publicRooms: [],
  lastError: null,
  closedReason: null,

  connect: () => {
    if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve();
    if (connecting) return connecting;
    set({ status: 'connecting' });
    connecting = new Promise<void>((resolve, reject) => {
      let settled = false;
      try {
        ws = new WebSocket(wsUrl());
      } catch (e) {
        connecting = null;
        set({ status: 'closed' });
        reject(e);
        return;
      }
      const sock = ws;
      sock.onopen = () => {
        retry = 0;
        settled = true;
        connecting = null;
        set({ status: 'open' });
        sock.send(JSON.stringify({ t: 'hello', name: playerName(), clientId: useSettings.getState().clientId } satisfies ClientMsg));
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = setInterval(() => get().send({ t: 'ping' }), 20_000);
        resolve();
      };
      sock.onmessage = (ev) => {
        let msg: ServerMsg;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        handle(msg);
      };
      sock.onclose = () => {
        connecting = null;
        if (pingTimer) clearInterval(pingTimer);
        set({ status: 'closed' });
        if (!settled) {
          settled = true;
          reject(new Error('connection failed'));
          return;
        }
        // auto-reconnect while in a room
        if (get().room) {
          const delay = Math.min(8000, 500 * 2 ** retry++);
          setTimeout(() => void get().connect().catch(() => {}), delay);
        }
      };
      sock.onerror = () => {
        /* handled by onclose */
      };
    });
    return connecting;
  },

  send: (msg) => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  },

  createRoom: async (deck, deckName, isPublic) => {
    await get().connect();
    set({ chat: [], view: null, views: [], closedReason: null });
    get().send({ t: 'createRoom', deck, deckName, isPublic });
  },
  joinRoom: async (code, deck, deckName) => {
    await get().connect();
    set({ chat: [], view: null, views: [], closedReason: null });
    get().send({ t: 'joinRoom', code: code.trim().toUpperCase(), deck, deckName });
  },
  quickMatch: async (deck, deckName) => {
    await get().connect();
    set({ chat: [], view: null, views: [], closedReason: null, queued: true });
    get().send({ t: 'quickMatch', deck, deckName });
  },
  cancelQueue: () => {
    get().send({ t: 'cancelQueue' });
    set({ queued: false });
  },
  leaveRoom: () => {
    get().send({ t: 'leaveRoom' });
    set({ room: null, view: null, views: [], chat: [], queued: false });
  },
  act: (a) => get().send({ t: 'action', action: a }),
  takeViews: () => {
    const v = get().views;
    if (v.length) set({ views: [] });
    return v;
  },
  reset: () => set({ room: null, view: null, views: [], chat: [], queued: false, lastError: null, closedReason: null }),
}));

function handle(msg: ServerMsg) {
  const s = useNet.getState();
  switch (msg.t) {
    case 'welcome':
      useNet.setState({ online: msg.online });
      break;
    case 'pong':
      useNet.setState({ online: msg.online });
      break;
    case 'room':
      useNet.setState({ room: msg.room, queued: false });
      break;
    case 'roomClosed':
      useNet.setState({ closedReason: msg.reason, room: s.room ? { ...s.room, status: 'finished' } : null });
      break;
    case 'queued':
      useNet.setState({ queued: true });
      break;
    case 'state':
      useNet.setState({ view: msg.view, views: [...s.views, msg.view] });
      break;
    case 'chat':
      useNet.setState({ chat: [...s.chat.slice(-80), { from: msg.from, name: msg.name, text: msg.text, at: msg.at }] });
      break;
    case 'emote':
      useNet.setState({ emotes: [...s.emotes.slice(-10), { from: msg.from, id: msg.id, at: Date.now() }] });
      break;
    case 'rooms':
      useNet.setState({ publicRooms: msg.rooms });
      break;
    case 'error':
      useNet.setState({ lastError: { code: msg.code, message: msg.message, at: Date.now() } });
      break;
  }
}

/** Ping the HTTP API to see whether the server is reachable. */
export async function probeServer(): Promise<{ ok: boolean; online: number }> {
  try {
    const res = await fetch(apiUrl('/api/health'), { cache: 'no-store' });
    if (!res.ok) return { ok: false, online: 0 };
    const j = (await res.json()) as { ok: boolean; online: number };
    return { ok: !!j.ok, online: j.online ?? 0 };
  } catch {
    return { ok: false, online: 0 };
  }
}
