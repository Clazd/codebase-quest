import { OUTPUT_SCHEMAS, type SearchIndex } from "@codebase-quest/content";
import {
  type FactBook,
  FactBookSchema,
  type FactSheet,
  type NpcPlacement,
  type WorldModel,
} from "@codebase-quest/shared";
import { z } from "zod";

/** Editor URLs must use an editor scheme (vscode://, idea://…), never web or script URLs. */
export const safeEditorTemplate = (template: string) =>
  /^[a-z][a-z0-9+.-]*:/i.test(template) && !/^(?:javascript|data|vbscript|blob|file|https?):/i.test(template);
export const SourceSliceSchema = z.object({
  fileId: z.string(),
  path: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  totalLines: z.number().int().nonnegative(),
  lines: z.array(z.string()),
  masked: z.array(z.number().int().positive()),
  stale: z.boolean(),
});
export type SourceSlice = z.infer<typeof SourceSliceSchema>;

/** Fact sheets indexed for the client, plus the URLs built from them. */
export class FactIndex {
  readonly book: FactBook;
  readonly world: WorldModel;
  readonly worldUrl: string;
  private readonly sheets: Map<string, FactSheet>;
  private readonly npcs: Map<string, NpcPlacement>;
  private readonly sources = new Map<string, Promise<SourceSlice>>();
  /** BM25 index shipped with the world (Gitling's search level); null when missing. */
  search: SearchIndex | null = null;
  /** Validated agent/AI content by item ID (`npc-dialogue:<symbolId>` …). */
  content: Record<string, { source: string; output: unknown }> = {};
  private readonly request: typeof fetch;
  constructor(book: FactBook, world: WorldModel, worldUrl: string, request: typeof fetch = fetch) {
    this.book = book;
    this.world = world;
    this.worldUrl = worldUrl;
    this.request = (...args) => request(...args);
    this.sheets = new Map(book.symbols.map((s) => [s.symbolId, s]));
    this.npcs = new Map(world.npcs.map((n) => [n.symbolId, n]));
  }
  static async load(world: WorldModel, worldUrl: string, request: typeof fetch = fetch): Promise<FactIndex> {
    const response = await request(new URL("facts.json", worldUrl).href);
    if (!response.ok) throw new Error(`Fact sheets request failed (${response.status})`);
    const parsed = FactBookSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error(`Invalid fact sheets: ${parsed.error.issues[0]?.message}`);
    const index = new FactIndex(parsed.data, world, worldUrl, request);
    // Both are optional: an older world or a dev fixture may not have them.
    const optional = async (name: string) => {
      try {
        const r = await request(new URL(name, worldUrl).href);
        return r.ok ? await r.json() : null;
      } catch {
        return null;
      }
    };
    const [search, content] = await Promise.all([optional("search.json"), optional("content.json")]);
    if (search?.version === 1 && search.postings && Array.isArray(search.docs)) index.search = search as SearchIndex;
    if (content && typeof content === "object") index.content = content;
    return index;
  }
  /** Agent-written dialogue lines for a character, if validated content exists. */
  agentLines(symbolId: string): { lines: string[]; source: string } | null {
    const entry = this.content[`npc-dialogue:${symbolId}`];
    const lines = (entry?.output as { lines?: unknown } | undefined)?.lines;
    return entry && Array.isArray(lines) && lines.every((l) => typeof l === "string" && l.length <= 160)
      ? { lines: lines as string[], source: entry.source }
      : null;
  }
  sheet(symbolId: string): FactSheet | undefined {
    return this.sheets.get(symbolId);
  }
  /** Optional prebuilt afterword, shown only once the fight ends. */
  combatExplanation(symbolId: string): string | null {
    const parsed = OUTPUT_SCHEMAS["combat-explanation"].safeParse(
      this.content[`combat-explanation:${symbolId}`]?.output,
    );
    return parsed.success ? parsed.data.text : null;
  }
  npc(symbolId: string): NpcPlacement | undefined {
    return this.npcs.get(symbolId);
  }
  /** Characters the player can meet: every symbol with an NPC placement. */
  get characters(): FactSheet[] {
    return this.book.symbols.filter((s) => this.npcs.has(s.symbolId));
  }
  /** Only the symbol's line range is fetched, then cached in memory. */
  source(sheet: FactSheet): Promise<SourceSlice> {
    const { fileId, range } = sheet;
    const key = `${fileId}:${range.startLine}:${range.endLine}`;
    let pending = this.sources.get(key);
    if (!pending) {
      pending = (async () => {
        const url = new URL(`source/${fileId}?start=${range.startLine}&end=${range.endLine}`, this.worldUrl);
        const response = await this.request(url.href);
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: unknown };
          throw new Error(typeof body.error === "string" ? body.error : `Source request failed (${response.status})`);
        }
        return SourceSliceSchema.parse(await response.json());
      })();
      this.sources.set(key, pending);
      pending.catch(() => this.sources.delete(key));
    }
    return pending;
  }
  editorUrl(sheet: FactSheet): string | null {
    const links = this.book.links;
    if (!links?.root || !safeEditorTemplate(links.editor)) return null;
    const path = encodeURI(`${links.root.replace(/\/$/, "")}/${sheet.path}`);
    return links.editor
      .replaceAll("{path}", path)
      .replaceAll("{line}", String(sheet.range.startLine))
      .replaceAll("{column}", "1");
  }
  githubUrl(sheet: FactSheet): string | null {
    const links = this.book.links,
      commit = this.book.repo.commit;
    if (!links?.github || !commit || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(links.github)) return null;
    return `${links.github}/blob/${encodeURIComponent(commit)}/${sheet.path.split("/").map(encodeURIComponent).join("/")}#L${sheet.range.startLine}-L${sheet.range.endLine}`;
  }
}
