export type Direction = "up" | "down" | "left" | "right";

/** Key names accepted by the debug API (`KeyboardEvent.key` style). */
const KEY_DIRECTIONS: Readonly<Record<string, Direction>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
  W: "up",
  S: "down",
  A: "left",
  D: "right",
};

export function keyToDirection(key: string): Direction | undefined {
  return KEY_DIRECTIONS[key];
}

/**
 * Four-direction movement: the player never moves diagonally. Horizontal input
 * wins over vertical input; opposite keys cancel out.
 */
export function velocityFor(held: ReadonlySet<Direction>, speed: number): { x: number; y: number } {
  const dx = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
  const dy = (held.has("down") ? 1 : 0) - (held.has("up") ? 1 : 0);
  if (dx !== 0) return { x: dx * speed, y: 0 };
  return { x: 0, y: dy * speed };
}

/**
 * Input that doesn't come from the keyboard, such as the debug API's
 * `pressKey`. The scene merges it with the real keyboard every frame.
 */
export class VirtualKeys {
  private readonly counts = new Map<Direction, number>();

  /** Holds `key` for `ms` milliseconds, then releases it. */
  async press(key: string, ms: number): Promise<void> {
    const direction = keyToDirection(key);
    if (direction === undefined) throw new Error(`Unsupported key "${key}"`);
    if (!Number.isFinite(ms) || ms < 0) throw new Error(`Invalid duration ${ms}`);
    this.counts.set(direction, (this.counts.get(direction) ?? 0) + 1);
    try {
      await new Promise((resolve) => setTimeout(resolve, ms));
    } finally {
      const left = (this.counts.get(direction) ?? 1) - 1;
      if (left > 0) this.counts.set(direction, left);
      else this.counts.delete(direction);
    }
  }

  held(): ReadonlySet<Direction> {
    return new Set(this.counts.keys());
  }
}
