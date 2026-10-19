/** Events between Phaser (the world) and Preact (the overlays). */
export type OverlayEvents = {
  /** The player talked to a character. */
  "npc:interact": { symbolId: string };
  /** The player asked to go to a character from the Code Panel or Codex. */
  "panel:navigate": { symbolId: string; mode: "walk" | "teleport" };
  "codex:open": { symbolId?: string };
  /** Any overlay opened or closed; while one is open, game input is paused. */
  "overlay:changed": { open: boolean; kind: "code" | "codex" | "gitling" | null; symbolId?: string };
};
type Handler<T> = (payload: T) => void;

/** A small typed event bus. Handlers run synchronously in subscription order. */
export class EventBus<E extends Record<string, unknown>> {
  private readonly handlers = new Map<keyof E, Set<Handler<never>>>();
  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    const set = this.handlers.get(type) ?? new Set();
    set.add(handler as Handler<never>);
    this.handlers.set(type, set);
    return () => set.delete(handler as Handler<never>);
  }
  emit<K extends keyof E>(type: K, payload: E[K]): void {
    for (const handler of [...(this.handlers.get(type) ?? [])]) (handler as Handler<E[K]>)(payload);
  }
}
