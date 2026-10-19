import { z } from "zod";
import { CodexDataSchema } from "./codexSchema.ts";
import { migrateLegacy } from "./migrations/legacy.ts";
import { type Atlas, hash, QuestProgressSchema, StateSchema } from "./model.ts";
import { levelFor, SKILLS } from "./progression.ts";

const Count = z.number().int().min(0).max(1_000_000_000);
const Text = z.string().max(20_000);
export const SaveSchema = z
  .object({
    saveVersion: z.literal(1),
    repoId: z.string().max(200),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    lastCommit: z.string().nullable(),
    player: z.object({
      level: z.number().int().min(1).max(30),
      xp: Count,
      gold: Count,
      position: z.object({ mapId: z.string(), x: Count, y: Count }),
      skills: z.array(z.string()).max(25),
    }),
    inventory: z.record(z.string(), Count),
    equipment: z.array(z.string()),
    keys: z.array(z.string()),
    comprehension: z.record(z.string(), StateSchema),
    quests: z.record(z.string(), QuestProgressSchema),
    questHashes: z.record(z.string(), z.string()).default({}),
    bestiary: z.record(z.string(), z.object({ tamedAt: z.string(), notes: Text.optional() })),
    codexNotes: z.record(z.string(), Text),
    achievements: z.record(z.string(), z.string()),
    settings: z.object({
      difficulty: z.enum(["story", "normal", "expert"]),
      readableFont: z.boolean(),
      reducedMotion: z.boolean(),
    }),
    hashes: z.record(
      z.string(),
      z.object({ hash: z.string(), name: z.string(), qualifiedName: z.string(), fileId: z.string() }),
    ),
    fileHashes: z.record(z.string(), z.string()),
    archive: z.array(z.object({ id: z.string(), name: z.string(), state: StateSchema, note: Text })),
    evidence: z.record(z.string(), z.array(z.string())),
    visited: z.array(z.string()),
    fog: z.record(z.string(), z.array(Count)).default({}),
    regions: z.array(z.string()),
    docs: z.array(z.string()),
    dailyDays: z.array(z.string()),
    rewarded: z.array(z.string()),
    tracked: z.string().nullable(),
    codex: z.record(z.string(), z.unknown()),
  })
  .superRefine((s, ctx) => {
    if (Object.keys(s.codex).length && !CodexDataSchema.safeParse(s.codex).success)
      ctx.addIssue({ code: "custom", message: "Damaged Codex contents" });
    const valid = new Set(SKILLS.map((s) => s.id));
    if (
      s.player.level !== levelFor(s.player.xp) ||
      new Set(s.player.skills).size !== s.player.skills.length ||
      s.player.skills.length > s.player.level - 1 ||
      s.player.skills.some((id) => !valid.has(id))
    )
      ctx.addIssue({ code: "custom", message: "Invalid level or skill allocation" });
    for (const id of s.player.skills) {
      const prereq = SKILLS.find((s) => s.id === id)?.prerequisite;
      if (prereq && !s.player.skills.includes(prereq))
        ctx.addIssue({ code: "custom", message: "Missing skill prerequisite" });
    }
  });
export type SaveV1 = z.infer<typeof SaveSchema>;
export function newSave(atlas: Atlas, position: SaveV1["player"]["position"], now: string): SaveV1 {
  return {
    saveVersion: 1,
    repoId: atlas.repoId,
    createdAt: now,
    updatedAt: now,
    lastCommit: atlas.commit,
    player: { level: 1, xp: 0, gold: 0, position, skills: [] },
    inventory: { hint: 2, tonic: 1, recall: 1, smoke: 1 },
    equipment: [],
    keys: [],
    comprehension: {},
    quests: {},
    questHashes: Object.fromEntries(atlas.quests.map((q) => [q.id, hash(JSON.stringify(q))])),
    bestiary: {},
    codexNotes: {},
    achievements: {},
    settings: { difficulty: "normal", readableFont: false, reducedMotion: false },
    hashes: Object.fromEntries(
      atlas.symbols.map((s) => [
        s.id,
        { hash: s.hash, name: s.name, qualifiedName: s.qualifiedName, fileId: s.fileId },
      ]),
    ),
    fileHashes: Object.fromEntries(atlas.files.map((f) => [f.id, f.hash])),
    archive: [],
    evidence: {},
    visited: [],
    fog: {},
    regions: [],
    docs: [],
    dailyDays: [],
    rewarded: [],
    tracked: null,
    codex: {},
  };
}
export function parseSave(raw: string): SaveV1 {
  if (raw.length > 10_000_000) throw new Error("Save is too large (maximum 10 MB)");
  try {
    return SaveSchema.parse(migrateLegacy(JSON.parse(raw)));
  } catch {
    throw new Error(
      "This save is damaged or uses an unsupported version. Your previous save and a backup have been kept.",
    );
  }
}
export function reconcile(input: SaveV1, atlas: Atlas) {
  if (input.repoId !== atlas.repoId) throw new Error("This save belongs to a different repository");
  const save = structuredClone(input),
    current = new Map(atlas.symbols.map((s) => [s.id, s]));
  let edited = 0,
    removed = 0,
    renamed = 0;
  const mapped = new Set<string>();
  for (const [id, old] of Object.entries(save.hashes)) {
    let next = current.get(id);
    if (!next) {
      const candidates = atlas.symbols.filter(
        (s) => s.hash === old.hash && s.qualifiedName === old.qualifiedName && !save.hashes[s.id],
      );
      if (candidates.length === 1 && candidates[0]) {
        next = candidates[0];
        renamed++;
        if (save.comprehension[id]) save.comprehension[next.id] = save.comprehension[id];
        if (save.codexNotes[id]) save.codexNotes[next.id] = save.codexNotes[id];
        if (save.evidence[id]) save.evidence[next.id] = save.evidence[id];
        delete save.comprehension[id];
        delete save.codexNotes[id];
        delete save.evidence[id];
        const codex = save.codex as {
          entries?: Record<string, unknown>;
          bodyMaps?: Record<string, unknown>;
          understood?: string[];
        };
        if (codex.entries?.[id]) {
          codex.entries[next.id] = codex.entries[id];
          delete codex.entries[id];
        }
        if (codex.bodyMaps?.[id]) {
          codex.bodyMaps[next.id] = codex.bodyMaps[id];
          delete codex.bodyMaps[id];
        }
        if (codex.understood) codex.understood = codex.understood.map((v) => (v === id ? (next?.id ?? v) : v));
      }
    }
    if (!next) {
      removed++;
      if (!save.archive.some((a) => a.id === id))
        save.archive.push({
          id,
          name: old.name,
          state: save.comprehension[id] ?? "unseen",
          note: save.codexNotes[id] ?? "",
        });
      delete save.comprehension[id];
      delete save.evidence[id];
      delete save.codexNotes[id];
      const codex = save.codex as {
        entries?: Record<string, unknown>;
        bodyMaps?: Record<string, unknown>;
        understood?: string[];
      };
      if (codex.entries) delete codex.entries[id];
      if (codex.bodyMaps) delete codex.bodyMaps[id];
      if (codex.understood) codex.understood = codex.understood.filter((v) => v !== id);
    } else {
      mapped.add(next.id);
      if (next.hash !== old.hash) {
        edited++;
        if (["understood", "mastered"].includes(save.comprehension[next.id] ?? ""))
          save.comprehension[next.id] = "read";
        delete save.evidence[next.id];
        const codex = save.codex as { bodyMaps?: Record<string, unknown>; understood?: string[] };
        if (codex.bodyMaps) delete codex.bodyMaps[next.id];
        if (codex.understood) codex.understood = codex.understood.filter((v) => v !== next?.id);
      }
    }
  }
  const renovated = atlas.files.filter((f) => input.fileHashes[f.id] && input.fileHashes[f.id] !== f.hash).length;
  save.hashes = Object.fromEntries(
    atlas.symbols.map((s) => [s.id, { hash: s.hash, name: s.name, qualifiedName: s.qualifiedName, fileId: s.fileId }]),
  );
  save.fileHashes = Object.fromEntries(atlas.files.map((f) => [f.id, f.hash]));
  save.lastCommit = atlas.commit;
  for (const q of atlas.quests) {
    const fingerprint = hash(JSON.stringify(q)),
      previous = save.questHashes[q.id],
      progress = save.quests[q.id];
    if (previous && previous !== fingerprint && progress) {
      progress.state = "locked";
      progress.counts = [];
    }
    save.questHashes[q.id] = fingerprint;
  }
  if (edited || removed || renamed || atlas.symbols.length !== mapped.size)
    for (const p of Object.values(save.quests))
      if (p.state !== "completed") {
        p.state = "locked";
        p.counts = [];
      }
  return { save, summary: { edited, removed, renamed, added: atlas.symbols.length - mapped.size, renovated } };
}
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export class SaveStorage {
  checkpointRaw: string | null = null;
  readonly key: string;
  error: string | null = null;
  backup: string | null = null;
  private readonly storage: StorageLike | null;
  constructor(storage: StorageLike | null, repoId: string) {
    this.storage = storage;
    this.key = `cq:save:${repoId}`;
  }
  load(): SaveV1 | null {
    try {
      const raw = this.storage?.getItem(this.key);
      return raw ? this.import(raw) : null;
    } catch (error) {
      this.error = String(error);
      return null;
    }
  }
  import(raw: string): SaveV1 {
    try {
      return parseSave(raw);
    } catch (error) {
      this.backup = raw;
      this.error = (error as Error).message;
      try {
        this.storage?.setItem(`${this.key}:damaged`, raw);
      } catch {}
      throw error;
    }
  }
  checkpoint(save: SaveV1) {
    this.checkpointRaw = JSON.stringify(SaveSchema.parse(save));
    try {
      this.storage?.setItem(`${this.key}:checkpoint`, this.checkpointRaw);
    } catch {}
  }
  previous(): SaveV1 | null {
    const raw = this.checkpointRaw ?? this.storage?.getItem(`${this.key}:checkpoint`);
    return raw ? this.import(raw) : null;
  }
  write(save: SaveV1) {
    try {
      const text = JSON.stringify(SaveSchema.parse(save));
      const previous = this.storage?.getItem(this.key);
      if (previous) this.storage?.setItem(`${this.key}:backup`, previous);
      this.storage?.setItem(this.key, text);
      this.error = this.storage ? null : "Storage unavailable: export your save before leaving.";
    } catch {
      this.error = "Autosave could not write. Export your save before leaving.";
    }
  }
}
