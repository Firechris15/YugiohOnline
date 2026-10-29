// Enumerates the legal actions of a player (used by the UI and by bots).
import { getDef, isSummonRestricted } from './db';
import type { Action, ActionOption, GameState, PlayerId, Requirement } from './types';
import { fieldMonsters, freeMonsterZones, freeSpellZones } from './core';
import { checkActivation, checkSpecialProc, type ActivationInfo, type ActivationMode } from './activation';
import { hasAbility, maxAttacks } from './stats';

function activationRequirements(info: ActivationInfo): Requirement[] {
  const reqs: Requirement[] = [];
  if (info.cost) reqs.push({ kind: 'costs', count: info.cost.count, options: info.cost.options, what: info.cost.what });
  if (info.targetSpec) reqs.push({ kind: 'targets', min: info.targetSpec.min, max: info.targetSpec.max, options: info.targets });
  return reqs;
}

function activationOptions(g: GameState, player: PlayerId, mode: ActivationMode): ActionOption[] {
  const out: ActionOption[] = [];
  const ps = g.players[player];
  const candidates = [
    ...ps.hand,
    ...ps.mzone.filter((x): x is string => !!x),
    ...ps.szone.filter((x): x is string => !!x),
    ...(ps.fzone ? [ps.fzone] : []),
    ...ps.gy,
  ];
  for (const uid of candidates) {
    const d = getDef(g.cards[uid].defId);
    if (!d.effects) continue;
    d.effects.forEach((e, idx) => {
      if (e.kind !== 'activate' && e.kind !== 'ignition' && e.kind !== 'quick') return;
      const info = checkActivation(g, player, uid, idx, mode);
      if (!info) return;
      out.push({
        action: { type: 'activate', uid, effectIdx: idx },
        label: e.kind === 'activate' ? 'action.activate' : 'action.effect',
        uid,
        requirements: activationRequirements(info),
      });
    });
  }
  return out;
}

export function canRespond(g: GameState, player: PlayerId): boolean {
  return activationOptions(g, player, 'response').length > 0;
}

export function getOptions(g: GameState, player: PlayerId): ActionOption[] {
  const pend = g.pending;
  if (g.winner !== null || pend.kind === 'none' || pend.player !== player) return [];
  if (pend.kind === 'prompt') return [];
  if (pend.kind === 'response') {
    return [...activationOptions(g, player, 'response'), { action: { type: 'pass' }, label: 'action.pass', requirements: [] }];
  }
  // Open game state – turn player
  const out: ActionOption[] = [];
  const ps = g.players[player];
  const main = g.phase === 'main1' || g.phase === 'main2';
  if (main) {
    const monsters = fieldMonsters(g, player);
    for (const uid of ps.hand) {
      const c = g.cards[uid];
      const d = getDef(c.defId);
      if (d.kind === 'monster') {
        if (!isSummonRestricted(d) && !ps.normalSummonUsed) {
          const lvl = d.level ?? 0;
          const need = lvl >= 7 ? 2 : lvl >= 5 ? 1 : 0;
          const canPlace = need > 0 ? monsters.length >= need : freeMonsterZones(g, player) > 0;
          if (canPlace) {
            const reqs: Requirement[] = need > 0 ? [{ kind: 'tributes', count: need, options: monsters }] : [];
            out.push({ action: { type: 'normalSummon', uid }, label: 'action.summon', uid, requirements: reqs });
            out.push({ action: { type: 'setMonster', uid }, label: 'action.set', uid, requirements: reqs });
          }
        }
        d.effects?.forEach((e, idx) => {
          if (e.kind !== 'specialProc') return;
          const info = checkSpecialProc(g, player, uid, idx);
          if (!info) return;
          out.push({
            action: { type: 'specialProc', uid, effectIdx: idx },
            label: 'action.specialSummon',
            uid,
            requirements: activationRequirements(info),
          });
        });
      } else if (d.spellType !== 'field' && freeSpellZones(g, player) > 0) {
        out.push({ action: { type: 'setSpellTrap', uid }, label: 'action.set', uid, requirements: [] });
      }
    }
    for (const uid of monsters) {
      const c = g.cards[uid];
      if (!c.faceUp && c.position === 'def' && c.turnPlaced < g.turn && c.positionChangedTurn !== g.turn) {
        out.push({ action: { type: 'flipSummon', uid }, label: 'action.flipSummon', uid, requirements: [] });
      } else if (c.faceUp && c.summonedTurn < g.turn && c.positionChangedTurn !== g.turn && c.attackedTurn !== g.turn) {
        out.push({ action: { type: 'changePosition', uid }, label: 'action.changePosition', uid, requirements: [] });
      }
    }
  }
  out.push(...activationOptions(g, player, 'open'));
  if (g.phase === 'battle' && g.turn > 1) {
    const oppMonsters = fieldMonsters(g, player === 0 ? 1 : 0);
    for (const uid of fieldMonsters(g, player)) {
      const c = g.cards[uid];
      if (!c.faceUp || c.position !== 'atk') continue;
      if (c.attacks >= maxAttacks(g, uid)) continue;
      if (hasAbility(g, uid, 'cannotAttack')) continue;
      for (const t of oppMonsters) {
        if (g.cards[t].faceUp && hasAbility(g, t, 'unattackable')) continue;
        out.push({ action: { type: 'attack', uid, target: t }, label: 'action.attack', uid, requirements: [] });
      }
      if (oppMonsters.length === 0 || hasAbility(g, uid, 'directAttack')) {
        out.push({ action: { type: 'attack', uid, target: null }, label: 'action.directAttack', uid, requirements: [] });
      }
    }
  }
  if (g.phase === 'main1' && g.turn > 1) out.push({ action: { type: 'phase', to: 'battle' }, label: 'action.toBattle', requirements: [] });
  if (g.phase === 'battle') out.push({ action: { type: 'phase', to: 'main2' }, label: 'action.toMain2', requirements: [] });
  if (main || g.phase === 'battle') out.push({ action: { type: 'phase', to: 'end' }, label: 'action.endTurn', requirements: [] });
  return out;
}

export function findMatchingOption(options: ActionOption[], a: Action): ActionOption | undefined {
  return options.find((o) => {
    const b = o.action;
    if (b.type !== a.type) return false;
    switch (a.type) {
      case 'normalSummon':
      case 'setMonster':
      case 'flipSummon':
      case 'changePosition':
      case 'setSpellTrap':
        return 'uid' in b && b.uid === a.uid;
      case 'specialProc':
      case 'activate':
        return 'uid' in b && b.uid === a.uid && 'effectIdx' in b && b.effectIdx === a.effectIdx;
      case 'attack':
        return b.type === 'attack' && b.uid === a.uid && b.target === a.target;
      case 'phase':
        return b.type === 'phase' && b.to === a.to;
      case 'pass':
        return true;
      default:
        return false;
    }
  });
}
