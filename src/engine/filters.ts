import { getDef } from './db';
import type { CardDef, CardFilter, Controller, EffectContext, GameState, PlayerId, Query } from './types';
import { getAtk, getLevel } from './stats';

const asArr = <T>(v: T | T[] | undefined): T[] | undefined => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);

/** Static (definition-only) filter check, used by deck search and the library. */
export function matchDef(d: CardDef, f: CardFilter): boolean {
  const kinds = asArr(f.kind);
  if (kinds && !kinds.includes(d.kind)) return false;
  const frames = asArr(f.frame);
  if (frames && (!d.frame || !frames.includes(d.frame))) return false;
  const attrs = asArr(f.attribute);
  if (attrs && (!d.attribute || !attrs.includes(d.attribute))) return false;
  const races = asArr(f.race);
  if (races && (!d.race || !races.includes(d.race))) return false;
  if (f.archetype && d.archetype !== f.archetype) return false;
  const names = asArr(f.name);
  if (names && !names.includes(d.id)) return false;
  if (f.levelMin !== undefined && (d.level ?? 0) < f.levelMin) return false;
  if (f.levelMax !== undefined && (d.kind !== 'monster' || (d.level ?? 0) > f.levelMax)) return false;
  const sts = asArr(f.spellType);
  if (sts && (!d.spellType || !sts.includes(d.spellType))) return false;
  const tts = asArr(f.trapType);
  if (tts && (!d.trapType || !tts.includes(d.trapType))) return false;
  if (f.notToken && d.token) return false;
  if (f.exclude && d.id === f.exclude) return false;
  return true;
}

export function matchFilter(g: GameState, uid: string, f: CardFilter, ctx?: EffectContext): boolean {
  const c = g.cards[uid];
  if (!c) return false;
  const d = getDef(c.defId);
  if (!matchDef(d, f)) return false;
  if (f.levelMin !== undefined && getLevel(g, uid) < f.levelMin) return false;
  if (f.levelMax !== undefined && getLevel(g, uid) > f.levelMax) return false;
  const onField = c.zone === 'mzone';
  if (f.atkMin !== undefined) {
    if (d.kind !== 'monster') return false;
    const atk = onField ? getAtk(g, uid) : (d.atk ?? 0);
    if (atk < f.atkMin) return false;
  }
  if (f.atkMax !== undefined) {
    if (d.kind !== 'monster') return false;
    const atk = onField ? getAtk(g, uid) : (d.atk ?? 0);
    if (atk > f.atkMax) return false;
  }
  if (f.faceUp && !c.faceUp) return false;
  if (f.faceDown && c.faceUp) return false;
  if (f.position && c.position !== f.position) return false;
  if (f.notSelf && ctx && ctx.source === uid) return false;
  if (f.custom && !f.custom(g, uid, ctx ?? emptyCtx(c.controller))) return false;
  return true;
}

export function emptyCtx(player: PlayerId): EffectContext {
  return { player, source: '', effectIdx: -1, targets: [], eventCards: [], chosen: [] };
}

export function playersFor(controller: Controller, self: PlayerId): PlayerId[] {
  if (controller === 'self') return [self];
  if (controller === 'opp') return [self === 0 ? 1 : 0];
  return [self, self === 0 ? 1 : 0];
}

export function runQuery(g: GameState, q: Query, ctx: EffectContext): string[] {
  const out: string[] = [];
  for (const p of playersFor(q.controller, ctx.player)) {
    const ps = g.players[p];
    for (const z of q.zones) {
      let list: (string | null)[];
      switch (z) {
        case 'mzone':
          list = ps.mzone;
          break;
        case 'szone':
          list = ps.szone;
          break;
        case 'fzone':
          list = [ps.fzone];
          break;
        case 'hand':
          list = ps.hand;
          break;
        case 'gy':
          list = ps.gy;
          break;
        case 'deck':
          list = ps.deck;
          break;
        case 'banished':
          list = ps.banished;
          break;
        case 'extra':
          list = ps.extra;
          break;
        default:
          list = [];
      }
      for (const uid of list) {
        if (!uid) continue;
        if (q.filter && !matchFilter(g, uid, q.filter, ctx)) continue;
        out.push(uid);
      }
    }
  }
  return out;
}
