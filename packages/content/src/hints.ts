import type { AnswerGuard } from "./guard.ts";

/** Gitling's hint ladder: nudge → pointer → explanation (the last costs a potion). */
export const HINT_LEVELS = ["nudge", "pointer", "explanation"] as const;
export type HintLevel = (typeof HINT_LEVELS)[number];
/** Hints are built from evidence (lines, cells, facts), never from answer keys. */
export interface HintEvidence {
  nudge: string;
  /** What to highlight: source lines and/or body cells. */
  pointer: { text: string; lines?: [number, number][]; cellIds?: string[] };
  explanation: string;
}
export interface Hint {
  level: HintLevel;
  text: string;
  lines?: [number, number][];
  cellIds?: string[];
  cost: number;
}
export class HintLadder {
  private used = 0;
  private readonly evidence: HintEvidence;
  private readonly guard: AnswerGuard | undefined;
  readonly explanationCost: number;
  constructor(evidence: HintEvidence, options: { guard?: AnswerGuard; explanationCost?: number } = {}) {
    this.evidence = evidence;
    this.guard = options.guard;
    this.explanationCost = options.explanationCost ?? 1;
  }
  /** The level the next hint would be, or null when the ladder is exhausted. */
  get nextLevel(): HintLevel | null {
    return HINT_LEVELS[this.used] ?? null;
  }
  /** Climb one rung. The explanation needs a potion; blocked text never reaches the player. */
  next(potions: number): { hint: Hint } | { blocked: "exhausted" | "needs-potion" | "answer-leak" } {
    const level = this.nextLevel;
    if (!level) return { blocked: "exhausted" };
    const cost = level === "explanation" ? this.explanationCost : 0;
    if (potions < cost) return { blocked: "needs-potion" };
    const e = this.evidence;
    const hint: Hint =
      level === "nudge"
        ? { level, text: e.nudge, cost }
        : level === "pointer"
          ? { level, text: e.pointer.text, lines: e.pointer.lines, cellIds: e.pointer.cellIds, cost }
          : { level, text: e.explanation, cost };
    if (this.guard?.leak(hint.text)) return { blocked: "answer-leak" };
    this.used++;
    return { hint };
  }
}
