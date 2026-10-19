import { type DialogueLine, dialogueFor } from "@codebase-quest/content";
import type { CodexFilters, CodexStore } from "../npc/codex.ts";
import type { FactIndex } from "../npc/facts.ts";
import type { EventBus, OverlayEvents } from "./bus.ts";

export interface OverlayState {
  panel: { symbolId: string; lines: DialogueLine[] } | null;
  codex: { open: boolean; entry: string | null } & CodexFilters;
  /** A caller/callee waiting for "Walk there" or "Teleport". */
  choose: string | null;
  compact: boolean;
  /** Focus the notes field when the next Codex entry renders. */
  focusNotes: boolean;
}
const EMPTY_FILTERS: CodexFilters = { query: "", regionId: "", kind: "", trait: "" };

/** Overlay state shared by Phaser (via the bus and debug API) and the Preact components. */
export class OverlayStore {
  state: OverlayState = {
    panel: null,
    codex: { open: false, entry: null, ...EMPTY_FILTERS },
    choose: null,
    compact: false,
    focusNotes: false,
  };
  readonly facts: FactIndex;
  readonly codex: CodexStore;
  readonly bus: EventBus<OverlayEvents>;
  readonly seen: Set<string>;
  private readonly listeners = new Set<() => void>();
  private returnFocus: HTMLElement | null = null;
  constructor(facts: FactIndex, codex: CodexStore, bus: EventBus<OverlayEvents>, seen: Set<string>) {
    this.facts = facts;
    this.codex = codex;
    this.bus = bus;
    this.seen = seen;
  }
  get open(): boolean {
    return Boolean(this.state.panel) || this.state.codex.open;
  }
  get kind(): "code" | "codex" | null {
    return this.state.codex.open ? "codex" : this.state.panel ? "code" : null;
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private set(next: Partial<OverlayState>) {
    const wasOpen = this.open;
    if (!wasOpen && document.activeElement instanceof HTMLElement) this.returnFocus = document.activeElement;
    this.state = { ...this.state, ...next };
    for (const listener of [...this.listeners]) listener();
    const symbolId = this.state.codex.open ? (this.state.codex.entry ?? undefined) : this.state.panel?.symbolId;
    this.bus.emit("overlay:changed", { open: this.open, kind: this.kind, symbolId });
    if (wasOpen && !this.open) {
      const back = this.returnFocus;
      const usable = back?.isConnected && back !== document.body && !(back as HTMLButtonElement).disabled;
      (usable ? back : document.querySelector<HTMLElement>("#codex-toggle"))?.focus();
    }
  }
  /** Talking reads a character: dialogue + Code Panel, and a Codex entry the first time. */
  talk(symbolId: string): boolean {
    const sheet = this.facts.sheet(symbolId);
    if (!sheet) return false;
    this.codex.markRead(symbolId);
    this.seen.add(symbolId);
    this.set({
      panel: { symbolId, lines: dialogueFor(sheet, this.facts.world.seed) },
      choose: null,
      codex: { ...this.state.codex, open: false },
    });
    return true;
  }
  closePanel() {
    this.set({ panel: null, choose: null });
  }
  openCodex(entry: string | null = null, focusNotes = false) {
    this.set({ codex: { ...this.state.codex, open: true, entry }, choose: null, focusNotes });
  }
  closeCodex() {
    this.set({ codex: { ...this.state.codex, open: false, entry: null }, choose: null });
  }
  filter(next: Partial<CodexFilters>) {
    this.set({ codex: { ...this.state.codex, ...next } });
  }
  showEntry(entry: string | null) {
    this.set({ codex: { ...this.state.codex, entry }, choose: null, focusNotes: false });
  }
  choose(symbolId: string | null) {
    this.set({ choose: symbolId });
  }
  toggleCompact() {
    this.set({ compact: !this.state.compact });
  }
  notesFocused() {
    this.state.focusNotes = false;
  }
  /** "Walk there" or "Teleport": overlays close so the world takes over again. */
  navigate(symbolId: string, mode: "walk" | "teleport") {
    this.set({ panel: null, choose: null, codex: { ...this.state.codex, open: false, entry: null } });
    this.bus.emit("panel:navigate", { symbolId, mode });
  }
  /** Esc closes the innermost layer: chooser → Codex entry → Codex → Code Panel. */
  escape() {
    if (this.state.choose) this.choose(null);
    else if (this.state.codex.open && this.state.codex.entry) this.showEntry(null);
    else if (this.state.codex.open) this.closeCodex();
    else if (this.state.panel) this.closePanel();
  }
  /** Re-render after Codex notes change (no state change needed). */
  refresh() {
    for (const listener of [...this.listeners]) listener();
  }
}
