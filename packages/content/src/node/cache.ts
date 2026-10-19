import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { type ContentItem, type ContentSource, ContentTypeSchema, PROMPT_VERSION, SOURCES } from "../types.ts";

const sha1 = (...parts: string[]) => createHash("sha1").update(parts.join("\0")).digest("hex");
export const CacheEntrySchema = z.object({
  version: z.literal(1),
  key: z.string(),
  repoId: z.string(),
  commit: z.string(),
  entityId: z.string(),
  contentType: ContentTypeSchema,
  promptVersion: z.string(),
  source: z.enum(SOURCES),
  codeHash: z.string(),
  createdAt: z.string(),
  output: z.unknown(),
});
export type CacheEntry = z.infer<typeof CacheEntrySchema>;
/**
 * `.codequest/cache/content/`: key = sha1(repoId, commit, entityId, contentType,
 * promptVersion, source). An alias by code hash lets unchanged symbols reuse
 * content across commits. Only validated output is ever written here.
 */
export class ContentStore {
  readonly dir: string;
  readonly repoId: string;
  constructor(dir: string, repoId: string) {
    this.dir = dir;
    this.repoId = repoId;
  }
  key(item: Pick<ContentItem, "entityId" | "contentType">, commit: string, source: ContentSource): string {
    return sha1(this.repoId, commit, item.entityId, item.contentType, PROMPT_VERSION, source);
  }
  private alias(item: Pick<ContentItem, "entityId" | "contentType" | "codeHash">): string {
    return sha1(this.repoId, item.entityId, item.contentType, PROMPT_VERSION, item.codeHash);
  }
  private read(path: string): CacheEntry | null {
    try {
      return existsSync(path) ? CacheEntrySchema.parse(JSON.parse(readFileSync(path, "utf8"))) : null;
    } catch {
      return null;
    }
  }
  private write(path: string, value: unknown) {
    const temp = `${path}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify(value)}\n`);
    renameSync(temp, path);
  }
  /** Content for this commit, or for an unchanged entity from an earlier commit. */
  get(item: ContentItem, commit: string): CacheEntry | null {
    const pointer = this.read(join(this.dir, "index", `${this.alias(item)}.json`));
    if (pointer && pointer.codeHash === item.codeHash) return pointer;
    for (const source of ["agent", "api", "sampling", "ollama"] as const) {
      const entry = this.read(join(this.dir, `${this.key(item, commit, source)}.json`));
      if (entry && entry.codeHash === item.codeHash) return entry;
    }
    return null;
  }
  put(item: ContentItem, commit: string, source: ContentSource, output: unknown, now = new Date()): CacheEntry {
    mkdirSync(join(this.dir, "index"), { recursive: true });
    const entry: CacheEntry = {
      version: 1,
      key: this.key(item, commit, source),
      repoId: this.repoId,
      commit,
      entityId: item.entityId,
      contentType: item.contentType,
      promptVersion: PROMPT_VERSION,
      source,
      codeHash: item.codeHash,
      createdAt: now.toISOString(),
      output,
    };
    this.write(join(this.dir, `${entry.key}.json`), entry);
    this.write(join(this.dir, "index", `${this.alias(item)}.json`), entry);
    return entry;
  }
  coverage(items: readonly ContentItem[], commit: string) {
    const byType: Record<string, { done: number; total: number }> = {};
    for (const item of items) {
      const t = byType[item.contentType] ?? { done: 0, total: 0 };
      byType[item.contentType] = t;
      t.total++;
      if (this.get(item, commit)) t.done++;
    }
    return byType;
  }
}
