import {
  type Atlas,
  AtlasSchema,
  type GameEvent,
  newSave,
  type Objective,
  QuestEngine,
  reconcile,
  SaveSchema,
  SaveStorage,
  type SaveV1,
  SKILLS,
} from "@codebase-quest/quests";
import type { WorldPosition } from "@codebase-quest/shared";
import type { Explorer } from "../explore/game.ts";
import { CodexDataSchema, CodexStore, codexKey } from "../npc/codex.ts";
import { nextWaypoint } from "../npc/guide.ts";
import { mountProgression } from "./panels.tsx";

export class Progression {
  currentSymbol: string | null = null;
  engine: QuestEngine;
  readonly storage: SaveStorage;
  readonly atlas: Atlas;
  readonly codex: CodexStore;
  readonly dialog = document.createElement("dialog");
  readonly tracker = document.createElement("button");
  readonly notice = document.createElement("output");
  readonly app: Explorer;
  tab = "Quests";
  message = "";
  changes = "";
  private readonly listeners = new Set<() => void>();
  private readonly autosave: ReturnType<typeof setInterval>;
  private readonly unload = () => this.persist();
  constructor(app: Explorer, atlas: Atlas, storage: Storage | null) {
    this.app = app;
    this.atlas = AtlasSchema.parse(atlas);
    this.storage = new SaveStorage(storage, atlas.repoId);
    const loaded = this.storage.load();
    if (this.storage.error) this.message = this.storage.error;
    const mapped = loaded ? reconcile(loaded, atlas) : null;
    const save = mapped?.save ?? newSave(atlas, app.session.world.kingdom.gate, new Date().toISOString());
    if (mapped && (loaded?.lastCommit !== atlas.commit || Object.values(mapped.summary).some((n) => n > 0))) {
      const c = mapped.summary;
      this.changes = `The kingdom changed since your last visit: ${c.renovated} buildings renovated, ${c.added} new residents, ${c.renamed} moved residents, ${c.removed} archived. ${c.edited} residents need another read.`;
    }
    this.engine = new QuestEngine(atlas, save);
    this.restoreExploration();
    this.codex = new CodexStore(null, codexKey(app.facts.book.repo.name, app.facts.book.repo.commit));
    this.codex.externalPersistence = true;
    const data = CodexDataSchema.safeParse(save.codex);
    if (data.success) this.codex.data = data.data;
    else if (!loaded) this.codex.data = new CodexStore(storage, this.codex.key).data;
    for (const [id, entry] of Object.entries(this.codex.data.entries)) {
      this.engine.comprehend(id, this.codex.isUnderstood(id) ? "understood" : "read");
      save.codexNotes[id] = entry.note;
    }
    this.codex.onChange = () => {
      this.syncCodex();
      this.changed();
      this.persist();
    };
    if (save.quests.prologue?.state === "available") this.engine.accept("prologue");
    this.dialog.id = "progression-dialog";
    this.dialog.setAttribute("aria-label", "Quests and progression");
    this.dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      this.close();
    });
    this.dialog.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        this.close();
      }
    });
    document.querySelector("main")?.append(this.dialog);
    mountProgression(this, this.dialog);
    this.tracker.id = "quest-tracker";
    this.tracker.type = "button";
    this.tracker.onclick = () => this.open();
    this.notice.id = "progression-notice";
    this.notice.setAttribute("aria-live", "polite");
    document.querySelector(".world-tools")?.append(this.tracker);
    app.hud.root.append(this.notice);
    this.autosave = setInterval(() => this.persist(), 30_000);
    window.addEventListener("pagehide", this.unload);
    this.changed();
  }
  subscribe(l: () => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  get panelOpen() {
    return this.dialog.open;
  }
  open(tab = "Quests") {
    if (this.app.overlay.open || this.app.hud.title || this.app.hud.mapOpen || this.app.hud.paused) return;
    this.tab = tab;
    this.app.held.clear();
    this.app.active?.stopPath();
    this.app.hud.overlayOpen = true;
    this.changed();
    if (!this.dialog.open) this.dialog.showModal();
  }
  close() {
    this.dialog.close();
    this.app.hud.overlayOpen = this.app.overlay.open;
    this.persist();
    this.tracker.focus();
  }
  changed() {
    const e = this.engine;
    this.app.session.kingdomLight = e.illumination;
    this.app.session.questMarkers = this.markers();
    this.updateTracker();
    const notices = e.notices.splice(0);
    if (notices.length) this.message = notices.join(" · ");
    this.notice.textContent = this.storage.error ?? (this.message || this.changes);
    for (const l of this.listeners) l();
  }
  updateTracker() {
    const e = this.engine,
      q = e.definitions.find((q) => q.id === e.save.tracked);
    const objective = q ? q.objectives[e.next(q)] : null;
    const point = objective ? this.target(objective) : null;
    const step = point ? nextWaypoint(this.app.graph, this.app.session.position, point) : null;
    const dist = step
      ? Math.round(
          Math.hypot(step.position.x - this.app.session.position.x, step.position.y - this.app.session.position.y),
        )
      : null;
    const angle = step
      ? Math.atan2(step.position.y - this.app.session.position.y, step.position.x - this.app.session.position.x)
      : 0;
    const arrow = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"][(Math.round(angle / (Math.PI / 4)) + 8) % 8];
    this.tracker.textContent =
      q && objective
        ? `Q · ${q.title} · ${this.describe(objective)}${dist === null ? "" : ` · ${dist} tiles ${arrow}`}`
        : "Quests · Q";
  }
  event(event: GameEvent) {
    if (event.kind === "talk") this.currentSymbol = event.symbolId;
    this.engine.dispatch(event);
    this.changed();
  }
  syncCodex() {
    const s = this.engine.save;
    s.codex = structuredClone(this.codex.data);
    for (const [id, entry] of Object.entries(this.codex.data.entries)) {
      s.codexNotes[id] = entry.note;
      this.engine.comprehend(id, "read");
    }
    for (const [id, entry] of Object.entries(this.codex.data.bestiary)) {
      s.bestiary[id] = { tamedAt: entry.at, notes: entry.note };
    }
  }
  persist() {
    this.engine.refresh();
    this.syncCodex();
    const s = this.engine.save;
    if (!this.app.hud.title) s.player.position = { ...this.app.session.position };
    s.fog = Object.fromEntries(
      [...this.app.session.seen].map(([map, tiles]) => [
        map,
        Array.from(tiles.entries())
          .filter(([, seen]) => seen)
          .map(([index]) => index),
      ]),
    );
    s.updatedAt = new Date().toISOString();
    s.settings.difficulty = this.app.combat.difficulty;
    s.settings.readableFont = document.documentElement.dataset.mapFont === "system";
    this.storage.write(s);
    this.codex.persistent = !this.storage.error;
  }
  export(): string {
    this.persist();
    return JSON.stringify(this.engine.save, null, 2);
  }
  async load(input: SaveV1) {
    if (this.app.combat.active) throw new Error("Finish the fight before importing a save");
    const mapped = reconcile(SaveSchema.parse(input), this.atlas);
    const codex = Object.keys(mapped.save.codex).length
      ? CodexDataSchema.parse(mapped.save.codex)
      : new CodexStore(null, "").data;
    this.persist();
    this.storage.checkpoint(this.engine.save);
    this.engine = new QuestEngine(this.atlas, mapped.save);
    this.restoreExploration();
    this.codex.data = codex;
    for (const [id, note] of Object.entries(mapped.save.codexNotes))
      if (this.codex.data.entries[id]) this.codex.data.entries[id].note = note;
    this.app.tamed.clear();
    for (const id of Object.keys(mapped.save.bestiary)) this.app.tamed.add(id);
    this.app.combat.setDifficulty(mapped.save.settings.difficulty);
    this.app.animate =
      !mapped.save.settings.reducedMotion && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.documentElement.dataset.mapFont = mapped.save.settings.readableFont ? "system" : "pixel";
    const p = mapped.save.player.position,
      map = this.app.session.maps.get(p.mapId);
    const valid = map && p.x < map.width && p.y < map.height && !map.collision[p.y * map.width + p.x];
    await this.app.go(valid ? p : this.app.session.world.kingdom.gate, true);
    this.message = "Save restored.";
    this.changed();
    this.persist();
  }
  async import(raw: string) {
    await this.load(this.storage.import(raw));
  }
  async restart() {
    this.persist();
    const save = newSave(this.atlas, this.app.session.world.kingdom.gate, new Date().toISOString());
    await this.load(save);
    this.engine.accept("prologue");
    this.event({ kind: "welcome", step: "gate" });
  }
  async restorePrevious() {
    const save = this.storage.previous();
    if (!save) throw new Error("No previous game backup is available.");
    await this.load(save);
  }
  target(o: Objective): WorldPosition | null {
    const w = this.app.session.world;
    if (o.kind === "talk" || o.kind === "answer") return this.app.facts.npc(o.symbolId)?.position ?? null;
    if (o.kind === "find") return w.kingdom.gate;
    if (o.kind === "visit") return w.interiors.find((i) => i.buildingId === o.buildingId)?.entrance ?? null;
    if (o.kind === "defeat")
      return this.app.encounters.find((e) => e.id === o.smellId || e.smellId === o.smellId)?.position ?? null;
    if (o.kind === "deliver") {
      const q = this.engine.definitions.find((q) => q.id === this.engine.save.tracked),
        p = q ? this.engine.save.quests[q.id] : null;
      return this.app.facts.npc(o.path[p?.counts[q ? this.engine.next(q) : 0] ?? 0] ?? "")?.position ?? null;
    }
    if (o.kind === "collect")
      return (
        this.app.facts.npc(
          o.codexIds.find(
            (id) => !["read", "understood", "mastered"].includes(this.engine.save.comprehension[id] ?? ""),
          ) ?? "",
        )?.position ?? null
      );
    return w.kingdom.gate;
  }
  describe(o: Objective) {
    const name = (id: string) => this.atlas.symbols.find((s) => s.id === id)?.name ?? id;
    switch (o.kind) {
      case "welcome":
        return { gate: "Enter the Gate", readme: "Read the welcome scroll", gitling: "Meet Gitling" }[o.step];
      case "talk":
        return `Talk to ${name(o.symbolId)}`;
      case "answer":
        return `Inspect ${name(o.symbolId)} and trace its calls or signature`;
      case "visit":
        return `Visit ${this.app.session.world.buildings.find((b) => b.id === o.buildingId)?.label ?? o.buildingId}`;
      case "defeat":
        return `Tame ${this.app.encounters.find((e) => e.id === o.smellId)?.name ?? "the monster"}`;
      case "find":
        return `Find a resident matching “${o.query}”`;
      case "collect":
        return `Read ${o.codexIds.length} Codex entries`;
      case "deliver":
        return `Follow ${o.path.map(name).join(" → ")} in order`;
    }
  }
  markers(): { position: WorldPosition; label: "!" | "?"; title: string }[] {
    return this.engine.definitions.flatMap<{ position: WorldPosition; label: "!" | "?"; title: string }>((q) => {
      const state = this.engine.save.quests[q.id]?.state;
      if (state === "available")
        return [
          {
            position:
              this.app.session.world.regions.find((r) => r.id === q.regionId)?.spawn ??
              this.app.session.world.kingdom.gate,
            label: "!" as const,
            title: q.title,
          },
        ];
      if (state !== "active") return [];
      const objective = q.objectives[this.engine.next(q)],
        position = objective ? this.target(objective) : null;
      return position ? [{ position, label: "?" as const, title: q.title }] : [];
    });
  }
  get waypoint() {
    const q = this.engine.definitions.find((q) => q.id === this.engine.save.tracked);
    const o = q?.objectives[this.engine.next(q)],
      target = o ? this.target(o) : null;
    return target ? nextWaypoint(this.app.graph, this.app.session.position, target) : null;
  }
  equipmentView(symbolId: string) {
    const s = this.atlas.symbols.find((s) => s.id === symbolId),
      f = this.atlas.files.find((f) => f.id === s?.fileId);
    if (!s) return null;
    return {
      callers: s.callers,
      signature: s.signature,
      testedBy: s.testedBy,
      steps: s.steps,
      imports: f?.imports ?? [],
      importers: f?.importers ?? [],
      firstCommitAt: f?.firstCommitAt ?? null,
      lastCommitAt: f?.lastCommitAt ?? null,
      coverage: f?.coverage ?? null,
      dependencies: this.atlas.dependencies,
    };
  }
  has(effect: string) {
    return this.engine.save.player.skills.some((id) => SKILLS.find((s) => s.id === id)?.effect === effect);
  }
  private restoreExploration() {
    const session = this.app.session,
      s = this.engine.save;
    session.seen.clear();
    session.seenFiles.clear();
    session.seenNpcs.clear();
    for (const [mapId, indices] of Object.entries(s.fog)) {
      const map = session.maps.get(mapId);
      if (!map) continue;
      const fog = session.fog(mapId);
      for (const index of indices) if (index < fog.length) fog[index] = 1;
    }
    for (const id of s.visited)
      for (const file of session.world.buildings.find((b) => b.id === id)?.fileIds ?? []) session.seenFiles.add(file);
    for (const [id, state] of Object.entries(s.comprehension)) if (state !== "unseen") session.seenNpcs.add(id);
  }
  skillNotes(effect: string, id: string): string[] {
    const sym = this.atlas.symbols.find((s) => s.id === id),
      file = this.atlas.files.find((f) => f.id === sym?.fileId);
    if (!sym) return [];
    switch (effect) {
      case "Signatures":
        return [sym.signature];
      case "Documentation":
        return [sym.doc ?? "No documentation comment."];
      case "First step":
        return [sym.steps[0]?.text ?? "No syntax statement."];
      case "Call threads":
        return sym.callOrder.map((id) => this.atlas.symbols.find((s) => s.id === id)?.name ?? id);
      case "Flow ledger":
        return this.atlas.deliveries
          .filter((d) => [d.owner, d.from, d.to].includes(id))
          .map(
            (d) =>
              `${this.atlas.symbols.find((s) => s.id === d.from)?.name} → ${this.atlas.symbols.find((s) => s.id === d.to)?.name} via ${d.via}, line ${d.line}`,
          );
      case "Module names":
        return [this.app.session.world.regions.find((r) => r.id === sym.regionId)?.path ?? "Unknown module"];
      case "Dependency counts":
        return this.atlas.dependencies
          .filter((d) => d.from === sym.regionId)
          .map((d) => `${this.app.session.world.regions.find((r) => r.id === d.to)?.name}: ${d.weight} exact imports`);
      case "Import ledger":
        return [
          ...(file?.imports ?? []).map((id) => `Imports ${this.atlas.files.find((f) => f.id === id)?.path}`),
          ...(file?.importers ?? []).map((id) => `Imported by ${this.atlas.files.find((f) => f.id === id)?.path}`),
        ];
      case "Key ledger":
        return this.atlas.gates.map(
          (g) =>
            `${this.app.session.world.regions.find((r) => r.id === g.regionId)?.name}: ${this.engine.save.keys.includes(g.key) ? "open" : "needs"} ${g.key}`,
        );
      case "Test references":
        return sym.testedBy.map((id) => this.atlas.symbols.find((s) => s.id === id)?.name ?? id);
      case "Assertion ledger":
        return this.atlas.assertions.filter((a) => a.symbolId === id).map((a) => `${a.path}:${a.line}`);
      case "Coverage ledger":
        return this.atlas.files.map(
          (f) => `${f.path}: ${f.coverage === null ? "not measured" : `${Math.round(f.coverage * 100)}%`}`,
        );
      case "Error paths":
        return sym.steps
          .filter((s) => s.text.startsWith("throw") || s.text.startsWith("try") || s.text.startsWith("catch"))
          .map((s) => `L${s.line}: ${s.text}`);
      case "Armor discount":
        return ["Break Armor costs 2 Energy."];
      case "Patient mutants":
        return ["Visual corruption spreads every second turn."];
      case "Free read":
        return ["The first Read in each fight costs 0 Energy."];
      case "Evidence hints":
        return ["Each fight starts with a source-grounded evidence pointer."];
      case "Gentle shadows":
        return ["A Shadow's smell attack loses 2 Focus damage."];
      default:
        return ["Equipment view unlocked above."];
    }
  }
  dispose() {
    clearInterval(this.autosave);
    window.removeEventListener("pagehide", this.unload);
    this.dialog.remove();
    this.tracker.remove();
    this.notice.remove();
  }
}
