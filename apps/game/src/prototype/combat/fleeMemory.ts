import type { CombatState } from "./engine.ts";

/**
 * Fleeing is safe, but the monster keeps its damage for a while
 * (`balance.fleeMemorySeconds`). Coming back in time resumes the fight with
 * full Focus and Energy, against the damaged monster.
 */
export class FleeMemory {
  private readonly saved = new Map<string, { state: CombatState; at: number }>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  remember(state: CombatState): void {
    this.saved.set(state.monster.id, { state, at: this.now() });
  }

  /** The monster's wounds, if the player fled less than the allowed time ago. Forgets them either way. */
  resume(fresh: CombatState): CombatState {
    const entry = this.saved.get(fresh.monster.id);
    this.saved.delete(fresh.monster.id);
    if (entry === undefined || this.now() - entry.at > fresh.balance.fleeMemorySeconds * 1000) return fresh;
    const old = entry.state;
    return {
      ...fresh,
      cells: structuredClone(old.cells),
      summoned: [...old.summoned],
      organIgnored: { ...old.organIgnored },
      phase: old.phase,
      twistResolved: old.twistResolved,
      inputCursor: old.inputCursor,
      log: [...fresh.log, { tone: "info", text: "The monster still carries the wounds from your last fight." }],
    };
  }
}
