// Aggregation of finished games into meta statistics (used by the
// simulation script, the server and the client).
import { getDef, hasDef } from './db';
import type { GameState, PlayerId } from './types';

export interface GameRecord {
  archetypes: [string, string];
  decks: [Record<string, number>, Record<string, number>];
  first: PlayerId;
  winner: PlayerId | 'draw' | null;
  turns: number;
  reason: string;
  played: [Record<string, number>, Record<string, number>];
  mode: 'sim' | 'online' | 'bot';
  at: number;
}

export interface ArchetypeStat {
  id: string;
  games: number;
  wins: number;
  winRate: number;
  firstGames: number;
  firstWins: number;
  share: number;
  avgTurns: number;
  tier: 'S' | 'A' | 'B' | 'C';
}

export interface CardStat {
  id: string;
  inclusion: number; // share of decks running the card
  avgCopies: number;
  played: number; // times summoned/activated per game where included
  winRate: number; // win rate of decks running it
  games: number;
}

export interface MetaStats {
  generatedAt: number;
  source: 'sim' | 'online';
  games: number;
  firstPlayerWinRate: number;
  avgTurns: number;
  archetypes: ArchetypeStat[];
  matchups: Record<string, Record<string, { games: number; wins: number }>>;
  cards: CardStat[];
  turnHistogram: { label: string; count: number }[];
  winReasons: Record<string, number>;
}

export function countIds(ids: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ids) out[id] = (out[id] ?? 0) + 1;
  return out;
}

/** Count summons and activations per player from a finished game's event log. */
export function playedCards(g: GameState): [Record<string, number>, Record<string, number>] {
  const out: [Record<string, number>, Record<string, number>] = [{}, {}];
  for (const e of g.events) {
    if ((e.type === 'summon' || e.type === 'activate') && e.defId && e.player !== undefined && hasDef(e.defId)) {
      if (getDef(e.defId).token) continue;
      out[e.player][e.defId] = (out[e.player][e.defId] ?? 0) + 1;
    }
  }
  return out;
}

function tierFor(winRate: number, games: number): ArchetypeStat['tier'] {
  if (games < 10) return 'C';
  if (winRate >= 0.56) return 'S';
  if (winRate >= 0.51) return 'A';
  if (winRate >= 0.45) return 'B';
  return 'C';
}

export function aggregate(records: GameRecord[], source: MetaStats['source']): MetaStats {
  const arch: Record<string, ArchetypeStat & { turnSum: number }> = {};
  const matchups: MetaStats['matchups'] = {};
  const cardAgg: Record<string, { decks: number; copies: number; played: number; wins: number }> = {};
  const winReasons: Record<string, number> = {};
  let firstWins = 0;
  let decided = 0;
  let turnSum = 0;
  const hist = [
    { label: '1–4', min: 1, max: 4, count: 0 },
    { label: '5–8', min: 5, max: 8, count: 0 },
    { label: '9–12', min: 9, max: 12, count: 0 },
    { label: '13–16', min: 13, max: 16, count: 0 },
    { label: '17–20', min: 17, max: 20, count: 0 },
    { label: '21+', min: 21, max: 1e9, count: 0 },
  ];
  for (const r of records) {
    turnSum += r.turns;
    hist.find((h) => r.turns >= h.min && r.turns <= h.max)!.count++;
    winReasons[r.reason] = (winReasons[r.reason] ?? 0) + 1;
    if (r.winner === 0 || r.winner === 1) {
      decided++;
      if (r.winner === r.first) firstWins++;
    }
    for (const p of [0, 1] as PlayerId[]) {
      const a = r.archetypes[p];
      const o = r.archetypes[p === 0 ? 1 : 0];
      const won = r.winner === p;
      const st = (arch[a] ??= { id: a, games: 0, wins: 0, winRate: 0, firstGames: 0, firstWins: 0, share: 0, avgTurns: 0, tier: 'C', turnSum: 0 });
      st.games++;
      st.turnSum += r.turns;
      if (won) st.wins++;
      if (r.first === p) {
        st.firstGames++;
        if (won) st.firstWins++;
      }
      if (a !== o) {
        const m = ((matchups[a] ??= {})[o] ??= { games: 0, wins: 0 });
        m.games++;
        if (won) m.wins++;
      }
      for (const [id, n] of Object.entries(r.decks[p])) {
        const c = (cardAgg[id] ??= { decks: 0, copies: 0, played: 0, wins: 0 });
        c.decks++;
        c.copies += n;
        c.played += r.played[p][id] ?? 0;
        if (won) c.wins++;
      }
    }
  }
  const totalDecks = records.length * 2;
  const archetypes = Object.values(arch)
    .map(({ turnSum: ts, ...s }) => {
      const winRate = s.games ? s.wins / s.games : 0;
      return { ...s, winRate, share: totalDecks ? s.games / totalDecks : 0, avgTurns: s.games ? ts / s.games : 0, tier: tierFor(winRate, s.games) };
    })
    .sort((a, b) => b.winRate - a.winRate);
  const cards: CardStat[] = Object.entries(cardAgg)
    .filter(([id]) => hasDef(id))
    .map(([id, c]) => ({
      id,
      inclusion: totalDecks ? c.decks / totalDecks : 0,
      avgCopies: c.decks ? c.copies / c.decks : 0,
      played: c.decks ? c.played / c.decks : 0,
      winRate: c.decks ? c.wins / c.decks : 0,
      games: c.decks,
    }))
    .sort((a, b) => b.inclusion - a.inclusion || b.played - a.played);
  return {
    generatedAt: Date.now(),
    source,
    games: records.length,
    firstPlayerWinRate: decided ? firstWins / decided : 0.5,
    avgTurns: records.length ? turnSum / records.length : 0,
    archetypes,
    matchups,
    cards,
    turnHistogram: hist.map(({ label, count }) => ({ label, count })),
    winReasons,
  };
}
