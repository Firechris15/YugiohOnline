// Per-player views of the game state. Hidden information (opponent hand,
// face-down cards, deck order) is stripped so views can be sent to clients.
import type { Ability, ActionOption, GameEvent, GameState, LogEntry, Phase, PlayerId, Position, Prompt, Zone } from './types';
import { getAbilities, getAtk, getDefense } from './stats';
import { getOptions } from './options';
import { getDef } from './db';

export interface CardView {
  uid: string;
  defId: string | null;
  owner: PlayerId;
  controller: PlayerId;
  zone: Zone;
  slot: number;
  faceUp: boolean;
  position: Position;
  atk?: number;
  def?: number;
  abilities?: Ability[];
  equippedTo?: string;
  summonedTurn?: number;
}

export interface PlayerView {
  id: PlayerId;
  name: string;
  lp: number;
  deckCount: number;
  extraCount: number;
  hand: CardView[];
  gy: CardView[];
  banished: CardView[];
  extra: CardView[];
  mzone: (CardView | null)[];
  szone: (CardView | null)[];
  fzone: CardView | null;
  normalSummonUsed: boolean;
}

export interface ChainLinkView {
  id: number;
  player: PlayerId;
  card: CardView;
  targets: string[];
  negated: boolean;
}

export interface GameView {
  you: PlayerId;
  turn: number;
  turnPlayer: PlayerId;
  firstPlayer: PlayerId;
  phase: Phase;
  players: [PlayerView, PlayerView];
  chain: ChainLinkView[];
  battle: { attacker: string; target: string | null } | null;
  pending: { kind: string; player?: PlayerId; window?: string };
  prompt: Prompt | null;
  promptCards: CardView[];
  options: ActionOption[];
  winner: PlayerId | 'draw' | null;
  winReason: string | null;
  events: GameEvent[];
  log: LogEntry[];
  eventSeq: number;
}

function cardView(g: GameState, uid: string, viewer: PlayerId | null, forceVisible = false): CardView {
  const c = g.cards[uid];
  let visible = forceVisible || viewer === null;
  if (!visible) {
    switch (c.zone) {
      case 'gy':
      case 'banished':
        visible = true;
        break;
      case 'hand':
      case 'extra':
      case 'deck':
        visible = c.owner === viewer || (viewer !== null && !!c.revealedTo?.includes(viewer));
        break;
      default:
        visible = c.faceUp || c.controller === viewer;
    }
  }
  const v: CardView = {
    uid,
    defId: visible ? c.defId : null,
    owner: c.owner,
    controller: c.controller,
    zone: c.zone,
    slot: c.slot,
    faceUp: c.faceUp,
    position: c.position,
  };
  if (visible && c.zone === 'mzone') {
    v.atk = getAtk(g, uid);
    v.def = getDefense(g, uid);
    const ab = getAbilities(g, uid);
    if (ab.size) v.abilities = [...ab];
    v.summonedTurn = c.summonedTurn;
  }
  if (c.equippedTo) v.equippedTo = c.equippedTo;
  return v;
}

function playerView(g: GameState, p: PlayerId, viewer: PlayerId | null): PlayerView {
  const ps = g.players[p];
  const cv = (u: string) => cardView(g, u, viewer);
  return {
    id: p,
    name: ps.name,
    lp: ps.lp,
    deckCount: ps.deck.length,
    extraCount: ps.extra.length,
    hand: ps.hand.map(cv),
    gy: ps.gy.map(cv),
    banished: ps.banished.map(cv),
    extra: viewer === p || viewer === null ? ps.extra.map(cv) : [],
    mzone: ps.mzone.map((u) => (u ? cv(u) : null)),
    szone: ps.szone.map((u) => (u ? cv(u) : null)),
    fzone: ps.fzone ? cv(ps.fzone) : null,
    normalSummonUsed: ps.normalSummonUsed,
  };
}

function filterEvent(g: GameState, ev: GameEvent, viewer: PlayerId): GameEvent {
  if (!ev.hidden) return ev;
  if (ev.player === viewer) return ev;
  // Hidden from the opponent: strip identity unless the card is now public.
  const c = ev.uid ? g.cards[ev.uid] : undefined;
  if (c && (c.zone === 'gy' || c.zone === 'banished' || ((c.zone === 'mzone' || c.zone === 'szone' || c.zone === 'fzone') && c.faceUp))) return ev;
  return { ...ev, defId: undefined };
}

export function getView(g: GameState, viewer: PlayerId, sinceSeq = 0): GameView {
  const prompt = g.prompt && g.prompt.player === viewer ? g.prompt : null;
  const promptCards: CardView[] = [];
  if (prompt) {
    for (const u of prompt.options ?? []) promptCards.push(cardView(g, u, viewer, prompt.reveal || g.cards[u].owner === viewer));
    if (prompt.uid && !prompt.options?.includes(prompt.uid)) promptCards.push(cardView(g, prompt.uid, viewer, true));
  }
  const pend = g.pending;
  return {
    you: viewer,
    turn: g.turn,
    turnPlayer: g.turnPlayer,
    firstPlayer: g.firstPlayer,
    phase: g.phase,
    players: [playerView(g, 0, viewer), playerView(g, 1, viewer)],
    chain: g.chain.map((l) => ({ id: l.id, player: l.player, card: cardView(g, l.source, viewer, true), targets: l.targets, negated: l.negated })),
    battle: g.battle ? { attacker: g.battle.attacker, target: g.battle.target } : null,
    pending: {
      kind: pend.kind,
      player: pend.kind === 'none' ? undefined : pend.player,
      window: pend.kind === 'response' ? pend.window.type : undefined,
    },
    prompt,
    promptCards,
    options: getOptions(g, viewer),
    winner: g.winner,
    winReason: g.winReason,
    events: g.events.filter((e) => e.seq > sinceSeq).map((e) => filterEvent(g, e, viewer)),
    log: g.log.slice(-80),
    eventSeq: g.eventSeq,
  };
}

/** Card name helper for logs (falls back to '?'). */
export function cardName(defId: string | undefined | null, lang: 'en' | 'de' = 'en'): string {
  if (!defId) return '?';
  try {
    return getDef(defId).name[lang];
  } catch {
    return defId;
  }
}
