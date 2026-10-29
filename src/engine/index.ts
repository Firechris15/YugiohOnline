// Public API of the DuelForge engine.
import './cards';
export * from './types';
export { getDef, allCards, hasDef, isExtraDeckCard } from './db';
export { createGame, applyAction, cloneGame, advance, isMyDecision } from './engine';
export type { ActionResult, CreateGameOptions } from './engine';
export { getOptions, canRespond } from './options';
export { getView, cardName } from './view';
export type { GameView, CardView, PlayerView, ChainLinkView } from './view';
export { getAtk, getDefense, getAbilities } from './stats';
export { matchDef } from './filters';
export { ARCHETYPES, ARCHETYPE_BY_ID } from './cards';
export type { ArchetypeInfo } from './cards';
export * from './decks';
export { REAL_STARTERS, REAL_STARTER_BY_ID, resolveRealStarter, realStarterCover, detectRealArchetype } from './real/decks';
export type { RealStarter } from './real/decks';
export { registerRealCards, realCardById, realCardByName, realId, realCardsRegistered } from './real';
export { randomSeed } from './rng';
