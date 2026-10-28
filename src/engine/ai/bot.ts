// DuelForge bots. Decisions are made by simulating candidate actions on a
// sanitized copy of the game (opponent's hidden cards are replaced by
// placeholders, so bots never peek at hidden information) and scoring the
// resulting position with a heuristic evaluation.
import '../cards';
import { getDef } from '../db';
import type { Action, ActionOption, GameState, PlayerId, Prompt } from '../types';
import { applyAction } from '../engine';
import { getOptions } from '../options';
import { getAtk, getDefense, getAbilities } from '../stats';
import { canFuse } from '../ops';
import { opp, fieldMonsters } from '../core';
import { mulberry, type Rand } from '../testkit';

export type BotLevel = 'easy' | 'normal' | 'hard';

export interface BotConfig {
  level: BotLevel;
  seed?: number;
}

const LEVEL = {
  easy: { noise: 900, skipResponse: 0.45, simulate: true, threat: 0.2 },
  normal: { noise: 160, skipResponse: 0.05, simulate: true, threat: 0.45 },
  hard: { noise: 0, skipResponse: 0, simulate: true, threat: 0.6 },
} as const;

// ---------------------------------------------------------------- evaluation

function monsterValue(g: GameState, uid: string): number {
  const c = g.cards[uid];
  const d = getDef(c.defId);
  const atk = getAtk(g, uid);
  const def = getDefense(g, uid);
  let v = 300 + atk * 0.55 + def * 0.25;
  if (d.effects?.length) v += 120;
  const ab = getAbilities(g, uid);
  if (ab.has('indestructibleBattle')) v += 250;
  if (ab.has('indestructibleEffect')) v += 150;
  if (ab.has('doubleAttack')) v += atk * 0.25;
  if (ab.has('piercing')) v += 80;
  if (ab.has('directAttack')) v += 200;
  if (d.token) v -= 150;
  return v;
}

export function cardValue(g: GameState, uid: string): number {
  const d = getDef(g.cards[uid].defId);
  const rarityBonus = { common: 0, rare: 60, super: 120, ultra: 200, secret: 260 }[d.rarity];
  if (d.kind === 'monster') return (d.atk ?? 0) * 0.45 + (d.def ?? 0) * 0.15 + (d.effects?.length ? 250 : 0) + rarityBonus - ((d.level ?? 0) >= 7 ? 150 : 0);
  return 550 + rarityBonus;
}

export function evaluate(g: GameState, me: PlayerId, threatWeight = 0.45): number {
  const o = opp(me);
  if (g.winner === me) return 1e7;
  if (g.winner === o) return -1e7;
  if (g.winner === 'draw') return -5e5;
  const lpScore = (lp: number) => lp + (lp < 2500 ? -(2500 - lp) * 0.6 : 0);
  let s = lpScore(g.players[me].lp) - lpScore(g.players[o].lp);
  const side = (p: PlayerId) => {
    const ps = g.players[p];
    let v = 0;
    for (const uid of fieldMonsters(g, p)) {
      const c = g.cards[uid];
      const known = c.faceUp || p === me;
      v += known ? monsterValue(g, uid) : 1050;
    }
    for (const uid of [...ps.szone, ps.fzone]) {
      if (!uid) continue;
      const c = g.cards[uid];
      v += c.faceUp ? 420 : 520;
    }
    v += ps.hand.length * 430;
    v += Math.min(ps.gy.length, 12) * 15;
    if (ps.deck.length < 6) v -= (6 - ps.deck.length) * 250;
    return v;
  };
  s += side(me) - side(o);
  // Threat model: monsters left in attack position below the opponent's best attacker are exposed.
  const exposure = (p: PlayerId) => {
    const enemy = opp(p);
    const enemyAtks = fieldMonsters(g, enemy)
      .filter((u) => g.cards[u].faceUp && g.cards[u].position === 'atk')
      .map((u) => getAtk(g, u));
    const best = enemyAtks.length ? Math.max(...enemyAtks) : 0;
    const mine = fieldMonsters(g, p);
    let risk = 0;
    if (mine.length === 0) risk += enemyAtks.reduce((a, b) => a + b, 0) * 0.5;
    for (const u of mine) {
      const c = g.cards[u];
      if (!c.faceUp && p !== me) continue;
      if (c.position === 'atk') {
        const a = getAtk(g, u);
        if (a < best) risk += (best - a) * 0.6 + monsterValue(g, u) * 0.4;
      } else {
        const d = getDefense(g, u);
        if (d < best) risk += monsterValue(g, u) * 0.3;
      }
    }
    return risk;
  };
  // The player who just moved is about to face the other's turn.
  const nextToMove = g.turnPlayer;
  s -= exposure(me) * threatWeight * (nextToMove === me ? 0.5 : 1);
  s += exposure(o) * threatWeight * (nextToMove === me ? 1 : 0.5) * 0.6;
  return s;
}

// --------------------------------------------------------------- simulation

const HIDDEN_MON = 'SYS-FDM';
const HIDDEN_ST = 'SYS-FDS';
const HIDDEN_HAND = 'SYS-HND';

/** Deep copy of the game with the opponent's hidden information replaced by placeholders. */
export function sanitizedClone(g: GameState, me: PlayerId): GameState {
  const { events: _e, log: _l, ...rest } = g;
  const c = structuredClone(rest) as GameState;
  c.events = [];
  c.log = [];
  const o = opp(me);
  const ps = c.players[o];
  for (const u of [...ps.hand, ...ps.deck]) c.cards[u].defId = HIDDEN_HAND;
  for (const u of ps.mzone) if (u && !c.cards[u].faceUp) c.cards[u].defId = HIDDEN_MON;
  for (const u of ps.szone) if (u && !c.cards[u].faceUp) c.cards[u].defId = HIDDEN_ST;
  return c;
}

function fastAnswer(g: GameState, prompt: Prompt): Action {
  const me = prompt.player;
  switch (prompt.kind) {
    case 'yesNo':
      return { type: 'answer', choice: true };
    case 'position': {
      const uid = prompt.uid;
      if (!uid) return { type: 'answer', choice: 'atk' };
      const d = getDef(g.cards[uid].defId);
      const oppBest = Math.max(0, ...fieldMonsters(g, opp(me)).map((u) => (g.cards[u].faceUp ? getAtk(g, u) : 1200)));
      return { type: 'answer', choice: (d.atk ?? 0) >= oppBest || (d.atk ?? 0) >= (d.def ?? 0) + 300 ? 'atk' : 'def' };
    }
    case 'option':
      return { type: 'answer', choice: 0 };
    case 'selectCards':
      return { type: 'answer', choice: heuristicSelection(g, prompt) };
  }
}

function heuristicSelection(g: GameState, p: Prompt): string[] {
  const options = p.options ?? [];
  const min = p.min ?? 0;
  const max = Math.min(p.max ?? 1, options.length);
  const me = p.player;
  const src = p.source ? g.cards[p.source] : undefined;
  // Fusion materials: pick the cheapest valid combination.
  if (src && getDef(src.defId).frame === 'fusion' && src.zone === 'extra' && getDef(src.defId).materials) {
    const mats = getDef(src.defId).materials!;
    const sorted = [...options].sort((a, b) => cardValue(g, a) - cardValue(g, b));
    const combo = cheapestCombo(g, mats, sorted);
    if (combo) return combo;
  }
  const allMineInHand = options.every((u) => g.cards[u].zone === 'hand' && g.cards[u].owner === me);
  if (allMineInHand && !p.reveal) {
    // discarding: throw away the least valuable cards
    return [...options].sort((a, b) => cardValue(g, a) - cardValue(g, b)).slice(0, Math.max(min, Math.min(max, min || 1)));
  }
  const ranked = [...options].sort((a, b) => valueAsTarget(g, b, me) - valueAsTarget(g, a, me));
  return ranked.slice(0, Math.max(min, max));
}

function valueAsTarget(g: GameState, uid: string, me: PlayerId): number {
  const c = g.cards[uid];
  if (c.zone === 'mzone') return c.faceUp || c.controller === me ? monsterValue(g, uid) : 1050;
  return cardValue(g, uid);
}

function cheapestCombo(g: GameState, mats: NonNullable<ReturnType<typeof getDef>['materials']>, sorted: string[]): string[] | null {
  const n = mats.length;
  const idx: number[] = [];
  let found: string[] | null = null;
  const rec = (start: number) => {
    if (found) return;
    if (idx.length === n) {
      const pick = idx.map((i) => sorted[i]);
      if (canFuse(g, mats, pick)) found = pick;
      return;
    }
    for (let i = start; i < sorted.length && !found; i++) {
      idx.push(i);
      rec(i + 1);
      idx.pop();
    }
  };
  rec(0);
  return found;
}

/** Advance a simulated game with a cheap default policy until the turn player is back in control. */
function rollout(g: GameState, maxSteps = 80): void {
  for (let i = 0; i < maxSteps; i++) {
    if (g.winner !== null) return;
    const pend = g.pending;
    if (pend.kind === 'action' || pend.kind === 'none') return;
    const res =
      pend.kind === 'response' ? applyAction(g, pend.player, { type: 'pass' }) : applyAction(g, pend.player, fastAnswer(g, pend.prompt));
    if (!res.ok) return;
  }
}

function simulate(g: GameState, me: PlayerId, player: PlayerId, action: Action, threat: number): number {
  const c = sanitizedClone(g, me);
  try {
    const r = applyAction(c, player, action);
    if (!r.ok) return -Infinity;
    rollout(c);
    return evaluate(c, me, threat);
  } catch {
    return -Infinity;
  }
}

// ----------------------------------------------------------- action choices

function expandOption(g: GameState, opt: ActionOption, me: PlayerId, rand: Rand): Action[] {
  const base = opt.action as Action & { tributes?: string[]; targets?: string[]; costs?: string[] };
  let variants: Action[] = [{ ...base }];
  for (const r of opt.requirements) {
    const next: Action[] = [];
    for (const v of variants) {
      const vv = v as typeof base;
      if (r.kind === 'tributes') {
        const cheapest = [...r.options].sort((a, b) => monsterValue(g, a) - monsterValue(g, b)).slice(0, r.count);
        next.push({ ...vv, tributes: cheapest });
      } else if (r.kind === 'costs') {
        const sorted = [...r.options].sort((a, b) => (r.what === 'tribute' ? monsterValue(g, a) - monsterValue(g, b) : cardValue(g, a) - cardValue(g, b)));
        next.push({ ...vv, costs: sorted.slice(0, r.count) });
        if (r.options.length > r.count) next.push({ ...vv, costs: sorted.slice(1, r.count + 1) });
      } else {
        const ranked = [...r.options].sort((a, b) => valueAsTarget(g, b, me) - valueAsTarget(g, a, me));
        if (r.max === 1 || ranked.length <= 1) {
          for (const t of ranked.slice(0, 8)) next.push({ ...vv, targets: [t] });
        } else {
          next.push({ ...vv, targets: ranked.slice(0, Math.min(r.max, ranked.length)) });
          for (const t of ranked.slice(0, 5)) next.push({ ...vv, targets: [t] });
        }
      }
    }
    variants = next.length ? next : variants;
  }
  if (variants.length > 12) variants = variants.slice(0, 12);
  void rand;
  return variants;
}

export class Bot {
  readonly level: BotLevel;
  private rand: Rand;
  private actionsThisTurn = 0;
  private lastTurn = -1;

  constructor(cfg: BotConfig) {
    this.level = cfg.level;
    this.rand = mulberry(cfg.seed ?? Math.floor(Math.random() * 1e9));
  }

  /** Decide the next action for `me`; the game must be waiting on `me`. */
  decide(g: GameState, me: PlayerId): Action {
    const pend = g.pending;
    if (pend.kind === 'none' || pend.player !== me) throw new Error('not my decision');
    const cfg = LEVEL[this.level];
    if (g.turn !== this.lastTurn) {
      this.lastTurn = g.turn;
      this.actionsThisTurn = 0;
    }
    if (pend.kind === 'prompt') return this.answerPrompt(g, me, pend.prompt);
    const options = getOptions(g, me);
    const noise = () => (cfg.noise ? (this.rand() - 0.5) * 2 * cfg.noise : 0);

    if (pend.kind === 'response') {
      const acts = options.filter((o) => o.action.type !== 'pass');
      if (!acts.length || this.rand() < cfg.skipResponse) return { type: 'pass' };
      const passScore = simulate(g, me, me, { type: 'pass' }, cfg.threat);
      let best: { a: Action; s: number } = { a: { type: 'pass' }, s: passScore + 60 };
      for (const o of acts) {
        for (const a of expandOption(g, o, me, this.rand)) {
          const s = simulate(g, me, me, a, cfg.threat) + noise();
          if (s > best.s) best = { a, s };
        }
      }
      return best.a;
    }

    // Open game state
    this.actionsThisTurn++;
    const current = evaluate(sanitizedClone(g, me), me, cfg.threat);
    const phaseOpts = options.filter((o) => o.action.type === 'phase');
    const playable = options.filter((o) => o.action.type !== 'phase');
    if (this.actionsThisTurn < 45) {
      let best: { a: Action; s: number } | null = null;
      for (const o of playable) {
        if (o.action.type === 'attack' && g.phase !== 'battle') continue;
        for (const a of expandOption(g, o, me, this.rand)) {
          const s = simulate(g, me, me, a, cfg.threat) + noise();
          if (!best || s > best.s) best = { a, s };
        }
      }
      const margin = g.phase === 'battle' ? 1 : 40;
      if (best && best.s > current + margin) return best.a;
    }
    // Nothing worth doing: move on.
    const to = (p: 'battle' | 'main2' | 'end') => phaseOpts.find((o) => o.action.type === 'phase' && o.action.to === p)?.action;
    if (g.phase === 'main1') {
      const canAttack = fieldMonsters(g, me).some((u) => g.cards[u].faceUp && g.cards[u].position === 'atk');
      const battle = to('battle');
      if (battle && canAttack) return battle;
    }
    if (g.phase === 'battle') {
      const main2 = to('main2');
      if (main2 && g.players[me].hand.length > 0) return main2;
    }
    return to('end') ?? phaseOpts[0]?.action ?? { type: 'pass' };
  }

  private answerPrompt(g: GameState, me: PlayerId, p: Prompt): Action {
    const cfg = LEVEL[this.level];
    if (p.kind !== 'selectCards' || this.level === 'easy') return fastAnswer(g, p);
    const options = p.options ?? [];
    const min = p.min ?? 0;
    const max = Math.min(p.max ?? 1, options.length);
    const candidates: string[][] = [heuristicSelection(g, p)];
    if (max === 1) {
      for (const u of options.slice(0, 10)) candidates.push([u]);
      if (min === 0) candidates.push([]);
    }
    if (candidates.length === 1) return { type: 'answer', choice: candidates[0] };
    let best = { c: candidates[0], s: -Infinity };
    for (const c of candidates) {
      const s = simulate(g, me, me, { type: 'answer', choice: c }, cfg.threat);
      if (s > best.s) best = { c, s };
    }
    return { type: 'answer', choice: best.c };
  }
}

export function botName(level: BotLevel, lang: 'en' | 'de' = 'en'): string {
  const names = {
    en: { easy: 'Apprentice Bot', normal: 'Duelist Bot', hard: 'Champion Bot' },
    de: { easy: 'Lehrlings-Bot', normal: 'Duellanten-Bot', hard: 'Champion-Bot' },
  };
  return names[lang][level];
}
