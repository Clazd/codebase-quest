import type { CodeGraph, Language, SymbolNode } from "@codebase-quest/shared";
import { findDefinition, parse } from "./ast.ts";
import { type BuiltBody, buildBody, type CallEdge } from "./body.ts";

/** Analyzed file text for body building (the analyzer's discovery output, secrets masked by the caller). */
export interface SourceText {
  path: string;
  language: Language;
  lines: string[];
  text: string;
}
export function exactEdges(graph: Pick<CodeGraph, "edges" | "symbols">, symbolId: string): CallEdge[] {
  const names = new Map(graph.symbols.map((s) => [s.id, s.name]));
  return graph.edges
    .filter((e) => e.kind === "calls" && e.confidence === "exact" && e.from === symbolId && names.has(e.to))
    .map((e) => ({ line: e.line, toId: e.to, toName: names.get(e.to) ?? e.label }))
    .sort((a, b) => a.line - b.line || (a.toId < b.toId ? -1 : 1));
}
/** Parses the symbol's file and builds its CodeBody; null when its definition cannot be found. */
export async function bodyForSymbol(
  graph: Pick<CodeGraph, "edges" | "symbols">,
  symbol: SymbolNode,
  source: SourceText,
): Promise<BuiltBody | null> {
  const root = await parse(source.text, source.language);
  const definition = findDefinition(root, symbol.range.startLine, symbol.range.startColumn, symbol.range.endLine);
  if (!definition) return null;
  return buildBody({
    definition,
    symbolId: symbol.id,
    name: symbol.name,
    path: source.path,
    language: source.language,
    fileLines: source.lines,
    edges: exactEdges(graph, symbol.id),
  });
}
