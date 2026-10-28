// WebSocket protocol shared by the browser client and the Node server.
import type { Action, DeckList, PlayerId } from '../engine/types';
import type { GameView } from '../engine/view';

export interface RoomPlayerInfo {
  name: string;
  deckName: string;
  connected: boolean;
  rematch: boolean;
}

export interface RoomInfo {
  code: string;
  status: 'waiting' | 'playing' | 'finished';
  you: PlayerId;
  players: (RoomPlayerInfo | null)[];
  deadline: number | null; // epoch ms when the current decision times out
  isPublic: boolean;
}

export interface PublicRoom {
  code: string;
  host: string;
  deckName: string;
  createdAt: number;
}

export type ClientMsg =
  | { t: 'hello'; name: string; clientId: string }
  | { t: 'createRoom'; deck: DeckList; deckName: string; isPublic?: boolean }
  | { t: 'joinRoom'; code: string; deck: DeckList; deckName: string }
  | { t: 'quickMatch'; deck: DeckList; deckName: string }
  | { t: 'cancelQueue' }
  | { t: 'leaveRoom' }
  | { t: 'action'; action: Action }
  | { t: 'chat'; text: string }
  | { t: 'emote'; id: string }
  | { t: 'rematch' }
  | { t: 'listRooms' }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'welcome'; clientId: string; online: number }
  | { t: 'error'; code: string; message: string }
  | { t: 'room'; room: RoomInfo }
  | { t: 'roomClosed'; reason: string }
  | { t: 'queued'; position: number }
  | { t: 'state'; view: GameView }
  | { t: 'chat'; from: PlayerId; name: string; text: string; at: number }
  | { t: 'emote'; from: PlayerId; id: string }
  | { t: 'rooms'; rooms: PublicRoom[] }
  | { t: 'pong'; online: number };

export const EMOTES = ['gg', 'hello', 'wow', 'think', 'oops', 'fire'] as const;
