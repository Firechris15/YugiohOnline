// Offline duel against a bot: the full engine runs in the browser.
import { applyAction, createGame, getView, randomSeed, type Action, type DeckList, type GameState, type GameView } from '../../engine';
import { Bot, type BotLevel } from '../../engine/ai/bot';
import { SPEED_FACTOR, useSettings } from '../store/settings';

export class LocalDuel {
  g: GameState;
  private bot: Bot;
  private lastSeq = 0;
  private listeners = new Set<(v: GameView) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private paused = false;
  readonly human = 0 as const;
  readonly botPlayer = 1 as const;

  constructor(
    readonly humanDeck: DeckList,
    readonly botDeck: DeckList,
    readonly level: BotLevel,
    readonly names: [string, string],
  ) {
    this.g = createGame({ decks: [humanDeck, botDeck], names, seed: randomSeed() });
    this.bot = new Bot({ level, seed: randomSeed() });
  }

  subscribe(cb: (v: GameView) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  start(): void {
    this.emit();
    this.schedule();
  }

  view(): GameView {
    return getView(this.g, this.human, 0);
  }

  act(a: Action): string | null {
    const r = applyAction(this.g, this.human, a);
    if (!r.ok) return r.error;
    this.emit();
    this.schedule();
    return null;
  }

  surrender(): void {
    applyAction(this.g, this.human, { type: 'surrender' });
    this.emit();
  }

  /** Pause bot moves while the UI is still animating (prevents a backlog). */
  setPaused(p: boolean): void {
    this.paused = p;
    if (!p) this.schedule();
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  private emit(): void {
    const v = getView(this.g, this.human, this.lastSeq);
    this.lastSeq = this.g.eventSeq;
    for (const l of this.listeners) l(v);
  }

  private schedule(): void {
    if (this.timer || this.paused) return;
    const pend = this.g.pending;
    if (this.g.winner !== null || pend.kind === 'none' || pend.player !== this.botPlayer) return;
    const f = SPEED_FACTOR[useSettings.getState().speed];
    const base = pend.kind === 'prompt' ? 380 : pend.kind === 'response' ? 520 : 760;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        if (this.paused) return;
        const p = this.g.pending;
        if (this.g.winner !== null || p.kind === 'none' || p.player !== this.botPlayer) return;
        let action: Action;
        try {
          action = this.bot.decide(this.g, this.botPlayer);
        } catch (e) {
          console.error('bot failed', e);
          action = p.kind === 'response' ? { type: 'pass' } : { type: 'phase', to: 'end' };
        }
        const r = applyAction(this.g, this.botPlayer, action);
        if (!r.ok) {
          console.warn('bot made illegal move', action, r.error);
          // last resort to keep the duel moving
          if (p.kind === 'response') applyAction(this.g, this.botPlayer, { type: 'pass' });
          else applyAction(this.g, this.botPlayer, { type: 'phase', to: 'end' });
        }
        this.emit();
        this.schedule();
      },
      base * f + Math.random() * 180 * f,
    );
  }
}
