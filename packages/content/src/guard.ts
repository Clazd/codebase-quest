/** Shorter keys ("7", "open", "number") appear in ordinary code and text; matching them would block everything. */
export const MIN_GUARDED_LENGTH = 8;
const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
/**
 * Answer keys never leave the game: no AI path or MCP tool reads puzzle data at
 * all. As defense in depth, while a fight is active any text that contains one
 * of its distinctive marked-correct choices is blocked, whatever produced it.
 * Phase 07 registers fights; MCP tool results and AI content are checked here.
 */
export class AnswerGuard {
  private readonly active = new Map<string, string[]>();
  /** Registers the forbidden strings of an active fight (choice texts, IDs, values). */
  begin(fightId: string, secrets: readonly string[]): void {
    this.active.set(
      fightId,
      secrets.map(normalize).filter((s) => s.length >= MIN_GUARDED_LENGTH),
    );
  }
  end(fightId: string): void {
    this.active.delete(fightId);
  }
  get fighting(): boolean {
    return this.active.size > 0;
  }
  /** The reason a text is blocked, or null. */
  leak(text: string): string | null {
    const lower = normalize(text);
    for (const [fight, secrets] of this.active)
      for (const secret of secrets) if (lower.includes(secret)) return `contains an answer of active fight ${fight}`;
    return null;
  }
  /** Throws when serialized output would leak an answer (for tool results and logs). */
  assertClean(value: unknown): void {
    const reason = this.leak(typeof value === "string" ? value : JSON.stringify(value));
    if (reason) throw new Error(`Blocked: output ${reason}`);
  }
}
