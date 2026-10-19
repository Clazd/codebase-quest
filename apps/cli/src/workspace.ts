import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  AnswerGuard,
  type ContentItem,
  type SearchIndex,
  templateOutput,
  type ValidationContext,
  worldItems,
} from "@codebase-quest/content";
import { ContentStore } from "@codebase-quest/content/node";
import { AtlasSchema } from "@codebase-quest/quests";
import type { FactBook, FactSheet, WorldModel } from "@codebase-quest/shared";
import { locateWorld, prepareWorld } from "./play.ts";
import { createSourceReader } from "./source.ts";

type Prepared = NonNullable<Awaited<ReturnType<typeof locateWorld>>>;
/**
 * One repository's world as the MCP server and `cq play` see it: world, fact
 * sheets, search index, content store and the safe line reader.
 */
export class Workspace {
  readonly root: string;
  readonly world: WorldModel;
  readonly book: FactBook;
  readonly index: SearchIndex;
  readonly store: ContentStore;
  readonly commit: string;
  readonly directory: string;
  readonly guard: AnswerGuard;
  readonly read: ReturnType<typeof createSourceReader>;
  private cachedItems: ContentItem[] | undefined;
  constructor(prepared: Prepared, guard = new AnswerGuard()) {
    this.root = prepared.root;
    this.world = prepared.world;
    this.book = prepared.facts;
    this.commit = prepared.commit;
    this.directory = prepared.directory;
    this.guard = guard;
    this.index = JSON.parse(readFileSync(join(prepared.directory, "search.json"), "utf8")) as SearchIndex;
    // `<cache base>/<commit>/<digest>` → `<cache base>/content`: `.codequest/cache/content/` (or the temp fallback).
    this.store = new ContentStore(join(dirname(dirname(prepared.directory)), "content"), this.book.repo.name);
    this.read = createSourceReader(prepared.root, prepared.facts.files);
  }
  static async open(repo: string, options: { build?: boolean; cacheRoot?: string; guard?: AnswerGuard } = {}) {
    const prepared =
      options.build === false
        ? await locateWorld(repo, options.cacheRoot)
        : await prepareWorld(repo, options.cacheRoot);
    return prepared ? new Workspace(prepared, options.guard) : null;
  }
  /** The symbol's current lines with secrets masked, or null when unreadable. */
  codeOf(sheet: FactSheet): string[] | null {
    const result = this.read(sheet.fileId, sheet.range.startLine, sheet.range.endLine);
    return result.status === 200 ? result.body.lines : null;
  }
  get items(): ContentItem[] {
    this.cachedItems ??= worldItems(
      this.world,
      this.book,
      (s) => this.codeOf(s),
      AtlasSchema.parse(JSON.parse(readFileSync(join(this.directory, "quests.json"), "utf8"))).quests,
    );
    return this.cachedItems;
  }
  item(id: string): ContentItem | undefined {
    return this.items.find((i) => i.id === id);
  }
  get context(): ValidationContext {
    return { book: this.book, guard: this.guard };
  }
  template(item: ContentItem): unknown {
    return templateOutput(item, this.world.seed, { index: this.index, book: this.book });
  }
  /** Validated content for the game: `{ "<type>:<entity>": { source, output } }`. */
  contentForGame(): Record<string, { source: string; output: unknown }> {
    const out: Record<string, { source: string; output: unknown }> = {};
    for (const item of this.items) {
      const entry = this.store.get(item, this.commit);
      if (entry) out[item.id] = { source: entry.source, output: entry.output };
    }
    return out;
  }
  coverage() {
    return this.store.coverage(this.items, this.commit);
  }
  /** Resolves "symbolId", "name" or "path:line" to fact sheets. */
  resolve(ref: string): FactSheet[] {
    const byId = this.book.symbols.find((s) => s.symbolId === ref);
    if (byId) return [byId];
    const at = /^(.+):(\d+)$/.exec(ref);
    if (at)
      return this.book.symbols.filter(
        (s) => s.path === at[1] && s.range.startLine <= Number(at[2]) && Number(at[2]) <= s.range.endLine,
      );
    return this.book.symbols.filter((s) => s.name === ref || s.qualifiedName === ref || s.displayName === ref);
  }
}
