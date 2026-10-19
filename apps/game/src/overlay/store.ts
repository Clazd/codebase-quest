import { type DialogueLine, dialogueFor, searchAnswer } from "@codebase-quest/content";
import type { LiveLevel } from "../gitling/bridge.ts";
import type { CodexFilters, CodexStore } from "../npc/codex.ts";
import type { FactIndex } from "../npc/facts.ts";
import type { EventBus, OverlayEvents } from "./bus.ts";

export type AnswerLevel = "search" | LiveLevel;
export interface GitlingRef {
  path: string;
  startLine: number;
  endLine: number;
  symbolId: string | null;
  name: string;
}
export interface GitlingEntry {
  id: string;
  question: string;
  answers: { level: AnswerLevel; text: string; refs: GitlingRef[] }[];
  pending: boolean;
  note: string | null;
}
export interface AiStatus {
  mode: "off" | "agent" | "ollama" | "api";
  levels: Record<string, boolean>;
  consentRequired: boolean;
  budget: { limitUsd: number; spentUsd: number; model: string } | null;
  refusalFallback: boolean | null;
}
export interface OverlayState {
  panel: { symbolId: string; lines: DialogueLine[]; source: string } | null;
  gitling: {
    open: boolean;
    entries: GitlingEntry[];
    consent: { entryId: string; sends: string } | null;
    ai: AiStatus | null;
  };
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
    gitling: { open: false, entries: [], consent: null, ai: null },
  };
  /** Sends a question over the bridge; returns false when no bridge is connected. */
  onAsk: (id: string, question: string, consent: boolean) => boolean = () => false;
  private asked = 0;
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
    return Boolean(this.state.panel) || this.state.codex.open || this.state.gitling.open;
  }
  get kind(): "code" | "codex" | "gitling" | null {
    return this.state.codex.open ? "codex" : this.state.panel ? "code" : this.state.gitling.open ? "gitling" : null;
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
    // Validated agent-written lines win; templates are the always-available fallback.
    const agent = this.facts.agentLines(symbolId);
    this.set({
      panel: agent
        ? {
            symbolId,
            lines: agent.lines.map((text, i) => ({ ruleId: `${agent.source}-${i}`, text })),
            source: agent.source,
          }
        : { symbolId, lines: dialogueFor(sheet, this.facts.world.seed), source: "template" },
      choose: null,
      codex: { ...this.state.codex, open: false },
      gitling: { ...this.state.gitling, open: false },
    });
    return true;
  }
  openGitling() {
    this.set({ gitling: { ...this.state.gitling, open: true }, choose: null });
  }
  closeGitling() {
    this.set({ gitling: { ...this.state.gitling, open: false, consent: null } });
  }
  setAi(ai: AiStatus | null) {
    this.set({ gitling: { ...this.state.gitling, ai } });
  }
  private updateEntry(
    id: string,
    change: (e: GitlingEntry) => GitlingEntry,
    extra: Partial<OverlayState["gitling"]> = {},
  ) {
    this.set({
      gitling: {
        ...this.state.gitling,
        ...extra,
        entries: this.state.gitling.entries.map((e) => (e.id === id ? change(e) : e)),
      },
    });
  }
  /** Level 1 (search) answers at once, offline; the bridge may add a better answer later. */
  ask(question: string, consent = false): string {
    const id = `g${++this.asked}`;
    const index = this.facts.search;
    const found = index ? searchAnswer(index, this.facts.book, question) : null;
    const refs: GitlingRef[] = (found?.refs ?? []).map((r) => ({ ...r }));
    const entry: GitlingEntry = {
      id,
      question,
      answers: [{ level: "search", text: found ? found.answer : "Search is not available for this world.", refs }],
      pending: false,
      note: null,
    };
    this.set({ gitling: { ...this.state.gitling, open: true, entries: [...this.state.gitling.entries, entry] } });
    if (this.onAsk(id, question, consent)) this.updateEntry(id, (e) => ({ ...e, pending: true }));
    return id;
  }
  /** A live answer (already validated by `cq play`) or a status for a pending question. */
  receiveAnswer(
    id: string,
    status: string | undefined,
    reply?: { answer: string; refs: { path: string; startLine: number; endLine: number }[]; level: LiveLevel },
    sends?: string,
  ) {
    const symbolFor = (r: { path: string; startLine: number; endLine: number }) =>
      this.facts.book.symbols.find(
        (s) => s.path === r.path && s.range.startLine <= r.endLine && r.startLine <= s.range.endLine,
      );
    if (status === "answered" && reply)
      this.updateEntry(id, (e) => ({
        ...e,
        pending: false,
        answers: [
          ...e.answers,
          {
            level: reply.level,
            text: reply.answer,
            refs: reply.refs.map((r) => {
              const s = symbolFor(r);
              return { ...r, symbolId: s?.symbolId ?? null, name: s?.displayName ?? r.path };
            }),
          },
        ],
      }));
    else if (status === "consent-required")
      this.updateEntry(id, (e) => ({ ...e, pending: false }), { consent: { entryId: id, sends: sends ?? "" } });
    else
      this.updateEntry(id, (e) => ({
        ...e,
        pending: false,
        note: "No live answer this time; search results are shown.",
      }));
  }
  /** The player allowed API mode for this repository: ask again with consent. */
  consentAndRetry(allow: boolean) {
    const consent = this.state.gitling.consent;
    if (!consent) return;
    this.set({ gitling: { ...this.state.gitling, consent: null } });
    const entry = this.state.gitling.entries.find((e) => e.id === consent.entryId);
    if (allow && entry && this.onAsk(entry.id, entry.question, true))
      this.updateEntry(entry.id, (e) => ({ ...e, pending: true }));
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
  /** Esc closes the innermost layer: chooser → consent → Codex entry → Codex → Code Panel → Gitling. */
  escape() {
    if (this.state.choose) this.choose(null);
    else if (this.state.gitling.consent) this.consentAndRetry(false);
    else if (this.state.codex.open && this.state.codex.entry) this.showEntry(null);
    else if (this.state.codex.open) this.closeCodex();
    else if (this.state.panel) this.closePanel();
    else if (this.state.gitling.open) this.closeGitling();
  }
  /** Re-render after Codex notes change (no state change needed). */
  refresh() {
    for (const listener of [...this.listeners]) listener();
  }
}
