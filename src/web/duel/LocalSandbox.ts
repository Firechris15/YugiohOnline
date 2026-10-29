// Solo free duel ("goldfishing"): the sandbox runs in the browser. The test
// dummy on the other side simply passes its turns.
import { createSandbox, applySandbox, sandboxView, type SbAction, type SbState, type SbView } from '../../engine/sandbox';
import { randomSeed, type DeckList } from '../../engine';

export class LocalSandbox {
  s: SbState;
  private listeners = new Set<(v: SbView) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(deck: DeckList, names: [string, string]) {
    this.s = createSandbox({ decks: [deck, deck], names, seed: randomSeed(), firstPlayer: 0 });
  }

  subscribe(cb: (v: SbView) => void): () => void {
    this.listeners.add(cb);
    cb(this.view());
    return () => this.listeners.delete(cb);
  }

  view(): SbView {
    return sandboxView(this.s, 0, 0);
  }

  act(a: SbAction): string | null {
    const r = applySandbox(this.s, 0, a);
    if (!r.ok) return r.error;
    this.emit();
    if (this.s.winner === null && this.s.turnPlayer === 1 && !this.timer) {
      // the dummy ends its turn right away
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.s.winner === null && this.s.turnPlayer === 1) {
          applySandbox(this.s, 1, { type: 'endTurn' });
          this.emit();
        }
      }, 900);
    }
    return null;
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.listeners.clear();
  }

  private emit(): void {
    const v = this.view();
    for (const l of this.listeners) l(v);
  }
}
