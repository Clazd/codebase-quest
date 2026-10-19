import type { FactSheet, Region } from "@codebase-quest/shared";
import { z } from "zod";

export const CODEX_VERSION = 1;
const Id = z.string().regex(/^[a-f0-9]{12}$/);
/** A defeated body as a one-glance map: [row, col, kind] per cell. */
export const BodyMapSchema = z.object({
  name: z.string().max(200),
  path: z.string().max(400),
  cells: z
    .array(
      z.tuple([z.number().int().min(0), z.number().int().min(0), z.enum(["joint", "body", "organ", "armor", "heart"])]),
    )
    .max(40),
  at: z.string().max(40),
});
export const BestiaryEntrySchema = z.object({
  name: z.string().max(200),
  species: z.string().max(80),
  smellKind: z.string().max(60),
  title: z.string().max(400),
  path: z.string().max(400),
  lines: z.tuple([z.number().int(), z.number().int()]),
  message: z.string().max(400),
  measured: z.number().nullable(),
  threshold: z.number().nullable(),
  fix: z.string().max(1000),
  outcome: z.enum(["victory", "tamed"]),
  note: z.string().max(2000),
  at: z.string().max(40),
});
const CodexDataSchema = z.object({
  version: z.literal(CODEX_VERSION),
  entries: z.record(Id, z.object({ readAt: z.string().max(40), note: z.string().max(20_000) })),
  /** Phase 07 (additive): body maps by symbol, Bestiary by encounter, `understood` symbols. */
  bodyMaps: z.record(Id, BodyMapSchema).default({}),
  bestiary: z.record(z.string().max(80), BestiaryEntrySchema).default({}),
  understood: z.array(Id).default([]),
});
export type CodexData = z.infer<typeof CodexDataSchema>;
type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

/** `localStorage["cq:codex:<repoId>:<commit>"]`; Phase 08 moves this into the save system. */
export function codexKey(repoId: string, commit: string | null): string {
  return `cq:codex:${repoId}:${commit ?? "unversioned"}`;
}
/**
 * The only persistent state in Phase 05: which characters were read (talked to)
 * and personal notes. Unreadable or future-version data is ignored, not trusted.
 */
export class CodexStore {
  data: CodexData = { version: CODEX_VERSION, entries: {}, bodyMaps: {}, bestiary: {}, understood: [] };
  /** False when storage is unavailable or full; the Codex still works for this session. */
  persistent = true;
  readonly key: string;
  private readonly storage: KeyValueStore | null;
  constructor(storage: KeyValueStore | null, key: string) {
    this.storage = storage;
    this.key = key;
    try {
      const raw = storage?.getItem(key);
      const parsed = raw ? CodexDataSchema.safeParse(JSON.parse(raw)) : null;
      if (parsed?.success) this.data = parsed.data;
    } catch {
      this.persistent = false;
    }
  }
  get count(): number {
    return Object.keys(this.data.entries).length;
  }
  has(symbolId: string): boolean {
    return symbolId in this.data.entries;
  }
  note(symbolId: string): string {
    return this.data.entries[symbolId]?.note ?? "";
  }
  /** Marks a character read; returns true the first time. */
  markRead(symbolId: string, now = new Date()): boolean {
    if (this.has(symbolId)) return false;
    this.data.entries[symbolId] = { readAt: now.toISOString(), note: "" };
    this.save();
    return true;
  }
  setNote(symbolId: string, note: string): void {
    const entry = this.data.entries[symbolId] ?? { readAt: new Date().toISOString(), note: "" };
    entry.note = note.slice(0, 20_000);
    this.data.entries[symbolId] = entry;
    this.save();
  }
  /** After a victory: the body map, the Bestiary record and the symbols now `understood`. */
  recordFight(
    encounterId: string,
    entry: z.infer<typeof BestiaryEntrySchema>,
    map: { symbolId: string; value: z.infer<typeof BodyMapSchema> } | null,
    understood: readonly string[],
  ): void {
    this.data.bestiary[encounterId] = BestiaryEntrySchema.parse(entry);
    if (map) this.data.bodyMaps[map.symbolId] = BodyMapSchema.parse(map.value);
    for (const id of understood)
      if (/^[a-f0-9]{12}$/.test(id) && !this.data.understood.includes(id)) this.data.understood.push(id);
    this.save();
  }
  setBestiaryNote(encounterId: string, note: string): void {
    const entry = this.data.bestiary[encounterId];
    if (!entry) return;
    entry.note = note.slice(0, 2000);
    this.save();
  }
  isUnderstood(symbolId: string): boolean {
    return this.data.understood.includes(symbolId);
  }
  private save(): void {
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.data));
      this.persistent = Boolean(this.storage);
    } catch {
      this.persistent = false;
    }
  }
}
export interface CodexFilters {
  query: string;
  regionId: string;
  kind: string;
  trait: string;
}
export function searchCodex(sheets: readonly FactSheet[], read: (id: string) => boolean, f: CodexFilters) {
  const query = f.query.trim().toLowerCase();
  return sheets
    .filter(
      (s) =>
        read(s.symbolId) &&
        (!query || s.name.toLowerCase().includes(query) || s.path.toLowerCase().includes(query)) &&
        (!f.regionId || s.regionId === f.regionId) &&
        (!f.kind || s.kind === f.kind) &&
        (!f.trait || s.traits.includes(f.trait) || (f.trait === "async" && s.async)),
    )
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.path < b.path ? -1 : 1));
}
export type Completion = { read: number; total: number; percent: number };
const pct = (read: number, total: number): Completion => ({
  read,
  total,
  percent: total ? Math.floor((read / total) * 100) : 0,
});
export function completion(sheets: readonly FactSheet[], read: (id: string) => boolean, regions: readonly Region[]) {
  return {
    overall: pct(sheets.filter((s) => read(s.symbolId)).length, sheets.length),
    regions: regions.map((r) => {
      const inRegion = sheets.filter((s) => s.regionId === r.id);
      return { id: r.id, name: r.name, ...pct(inRegion.filter((s) => read(s.symbolId)).length, inRegion.length) };
    }),
  };
}
/** All personal notes as one Markdown document: onboarding docs as a side effect. */
export function exportNotes(kingdom: string, store: CodexStore, sheets: readonly FactSheet[]): string {
  const noted = sheets
    .filter((s) => store.note(s.symbolId).trim())
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.range.startLine - b.range.startLine));
  const body = noted.map(
    (s) =>
      `## ${s.displayName}\n\n\`${s.path}:${s.range.startLine}-${s.range.endLine}\` · ${s.kind}\n\n${store.note(s.symbolId).trim()}\n`,
  );
  return `# ${kingdom}: Codex notes\n\n${noted.length ? body.join("\n") : "_No notes yet._\n"}`;
}

/** The Bestiary as a Markdown tech-debt report. */
export function exportBestiary(kingdom: string, store: CodexStore): string {
  const entries = Object.entries(store.data.bestiary).sort(([, a], [, b]) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : a.lines[0] - b.lines[0],
  );
  const body = entries.map(([, e]) => {
    const measured =
      e.measured !== null ? ` (measured ${e.measured}${e.threshold !== null ? `, threshold ${e.threshold}` : ""})` : "";
    return `## ${e.species}: \`${e.path}:${e.lines[0]}-${e.lines[1]}\`\n\n- Smell: ${e.smellKind}${measured}\n- Evidence: ${e.message}\n- How to fix it: ${e.fix}\n${e.note.trim() ? `- Notes: ${e.note.trim()}\n` : ""}`;
  });
  return `# ${kingdom}: Bestiary (tech-debt report)\n\n${entries.length ? body.join("\n") : "_No monsters tamed yet._\n"}`;
}
