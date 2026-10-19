import type { FactBook, FactSheet, WorldModel } from "@codebase-quest/shared";
import { z } from "zod";
import { dialogueFor } from "./dialogue.ts";
import { type SearchIndex, searchAnswer } from "./search.ts";
import {
  type ContentItem,
  type ContentOutput,
  type ContentType,
  type ItemFacts,
  OUTPUT_SCHEMAS,
  STYLE_GUIDES,
  untrusted,
} from "./types.ts";

/** FNV-1a 64-bit, hex: a browser-safe stable hash for cache keys. */
export function stableHash(text: string): string {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) h = BigInt.asUintN(64, (h ^ BigInt(text.charCodeAt(i))) * 0x100000001b3n);
  return h.toString(16).padStart(16, "0");
}
const schemaCache = new Map<ContentType, unknown>();
export function outputSchema(type: ContentType): unknown {
  let schema = schemaCache.get(type);
  if (!schema) {
    schema = z.toJSONSchema(OUTPUT_SCHEMAS[type]);
    schemaCache.set(type, schema);
  }
  return schema;
}
export function makeItem(contentType: ContentType, entityId: string, facts: ItemFacts): ContentItem {
  return {
    id: `${contentType}:${entityId}`,
    contentType,
    entityId,
    codeHash: stableHash(JSON.stringify(facts)),
    facts,
    outputSchema: outputSchema(contentType),
    styleGuide: STYLE_GUIDES[contentType],
  };
}
/**
 * The world's prebuildable content: dialogue for every character, lore for every
 * region and the kingdom, plus key-free combat afterwords. Quest narration and
 * issue mapping arrive with Phases 08 and 10.
 */
export function worldItems(
  world: WorldModel,
  book: FactBook,
  codeOf: (sheet: FactSheet) => string[] | null,
): ContentItem[] {
  const items: ContentItem[] = [];
  const npcSymbols = new Set(world.npcs.map((n) => n.symbolId));
  for (const sheet of book.symbols)
    if (npcSymbols.has(sheet.symbolId)) {
      const code = codeOf(sheet);
      items.push(
        makeItem("npc-dialogue", sheet.symbolId, { kind: "symbol", sheet, code: code ? untrusted(code) : null }),
        // No encounters, questions, choices or input routes enter the AI path.
        makeItem("combat-explanation", sheet.symbolId, { kind: "symbol", sheet, code: null }),
      );
    }
  for (const region of world.regions) {
    const symbols = book.symbols
      .filter((s) => s.regionId === region.id)
      .sort((a, b) => b.metrics.fanIn - a.metrics.fanIn || (a.name < b.name ? -1 : 1))
      .slice(0, 12)
      .map(({ symbolId, displayName, name, path, range, kind, metrics }) => ({
        symbolId,
        displayName,
        name,
        path,
        range,
        kind,
        metrics,
      }));
    const files = book.files.filter((f) => region.fileIds.includes(f.id)).map((f) => f.path);
    items.push(
      makeItem("region-lore", region.id, {
        kind: "region",
        region: { id: region.id, name: region.name, path: region.path, biome: region.biome },
        files,
        symbols,
      }),
    );
  }
  const languages = [...new Set(book.files.flatMap((f) => (f.language ? [f.language] : [])))].sort();
  items.push(
    makeItem("kingdom-lore", "kingdom", {
      kind: "kingdom",
      name: world.kingdom.name,
      regions: world.regions.map((r) => ({ name: r.name, path: r.path, files: r.fileIds.length })),
      languages,
    }),
  );
  return items;
}
const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);
const names = (list: string[]) =>
  list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;

/** Deterministic template output for any item: always available, the final fallback. */
export function templateOutput(
  item: Pick<ContentItem, "contentType" | "facts">,
  seed: string,
  context: { index?: SearchIndex; book?: Pick<FactBook, "symbols"> } = {},
): ContentOutput<ContentType> {
  const f = item.facts;
  if (item.contentType === "combat-explanation" && f.kind === "symbol")
    return {
      text: clip(
        `${f.sheet.name} lives in ${f.sheet.path}. Its body map follows the source statements and their nesting. Review the source and its callers before changing it.`,
        400,
      ),
      refs: [{ path: f.sheet.path, startLine: f.sheet.range.startLine, endLine: f.sheet.range.endLine }],
    };
  if (item.contentType === "npc-dialogue" && f.kind === "symbol")
    return { lines: dialogueFor(f.sheet, seed).map((l) => clip(l.text, 160)) };
  if (item.contentType === "region-lore" && f.kind === "region") {
    const top = f.symbols.slice(0, 3);
    return {
      title: clip(f.region.name, 80),
      text: clip(
        `${f.region.name} covers ${f.region.path} with ${f.files.length} file${f.files.length === 1 ? "" : "s"}.${
          top.length ? ` Its best-known residents are ${names(top.map((s) => s.displayName))}.` : ""
        }`,
        600,
      ),
      refs: top.map((s) => ({ path: s.path, startLine: s.range.startLine, endLine: s.range.endLine })),
    };
  }
  if (item.contentType === "kingdom-lore" && f.kind === "kingdom")
    return {
      title: clip(f.name, 80),
      text: clip(
        `${f.name} has ${f.regions.length} region${f.regions.length === 1 ? "" : "s"}: ${names(f.regions.map((r) => r.name))}.${
          f.languages.length ? ` Its people speak ${names(f.languages)}.` : ""
        }`,
        800,
      ),
    };
  if (item.contentType === "gitling-answer" && f.kind === "question" && context.index && context.book) {
    const found = searchAnswer(context.index, context.book, f.question.value);
    if (found.refs.length)
      return {
        answer: found.answer,
        refs: found.refs.map(({ path, startLine, endLine }) => ({ path, startLine, endLine })),
      };
  }
  throw new Error(`No template for ${item.contentType}`);
}
