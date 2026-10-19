import type { CodeGraph, Smell, SourceRange } from "@codebase-quest/shared";
import type { AnalyzerConfig } from "./config.ts";
import type { SourceFile } from "./discover.ts";
import type { Extracted } from "./extract.ts";
import { id } from "./util.ts";

/** Linear-time strongly connected components for the file import graph. */
export function stronglyConnected(nodes: string[], edges: readonly { from: string; to: string }[]): string[][] {
  const adjacency = new Map(nodes.map((n) => [n, [] as string[]]));
  for (const edge of edges) if (adjacency.has(edge.to)) adjacency.get(edge.from)?.push(edge.to);
  let counter = 0;
  const numbers = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const active = new Set<string>();
  const groups: string[][] = [];
  function visit(node: string) {
    numbers.set(node, counter);
    low.set(node, counter++);
    stack.push(node);
    active.add(node);
    for (const next of adjacency.get(node) ?? []) {
      if (!numbers.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node) ?? 0, low.get(next) ?? 0));
      } else if (active.has(next)) low.set(node, Math.min(low.get(node) ?? 0, numbers.get(next) ?? 0));
    }
    if (low.get(node) === numbers.get(node)) {
      const group: string[] = [];
      let last: string | undefined;
      do {
        last = stack.pop();
        if (last) {
          active.delete(last);
          group.push(last);
        }
      } while (last !== node);
      if (group.length > 1 || (adjacency.get(node) ?? []).includes(node)) groups.push(group.sort());
    }
  }
  for (const node of nodes) if (!numbers.has(node)) visit(node);
  return groups;
}
export function detectSmells(
  graph: CodeGraph,
  sources: SourceFile[],
  parsed: Map<string, Extracted>,
  config: AnalyzerConfig,
): void {
  const threshold = config.thresholds;
  const files = new Map(graph.files.map((f) => [f.id, f]));
  const tested = new Set(graph.edges.filter((e) => e.kind === "tests" && e.confidence === "exact").map((e) => e.to));
  const entrySymbols = new Set(graph.entryPoints.map((e) => e.symbolId));
  const dead = new Set<string>();
  function add(
    kind: Smell["kind"],
    fileIds: string[],
    symbolIds: string[],
    range: SourceRange,
    message: string,
    measured: number | null = null,
    limit: number | null = null,
  ) {
    graph.smells.push({
      id: id(fileIds.join(":"), `smell:${kind}`, `${symbolIds.join(":")}:${range.startLine}:${message}`),
      kind,
      fileIds: [...new Set(fileIds)].sort(),
      symbolIds: [...new Set(symbolIds)].sort(),
      range,
      severity: measured !== null && limit ? Math.max(1, measured / limit) : 1,
      evidence: { message, measured, threshold: limit },
    });
  }
  const lineRange = (line: number): SourceRange => ({ startLine: line, endLine: line, startColumn: 0, endColumn: 0 });
  for (const symbol of graph.symbols) {
    const file = files.get(symbol.fileId);
    if (!file) continue;
    const data = parsed.get(file.path);
    const detail = data?.details[symbol.id];
    if (!detail) continue;
    const fn = ["function", "method"].includes(symbol.kind);
    if (fn && symbol.metrics.cyclomatic > threshold.complexity)
      add(
        "complex-function",
        [file.id],
        [symbol.id],
        symbol.range,
        "Cyclomatic branch threshold exceeded.",
        symbol.metrics.cyclomatic,
        threshold.complexity,
      );
    else if (fn && symbol.metrics.loc > threshold.functionLoc)
      add(
        "complex-function",
        [file.id],
        [symbol.id],
        symbol.range,
        "Function line-count threshold exceeded.",
        symbol.metrics.loc,
        threshold.functionLoc,
      );
    if (fn && symbol.metrics.maxNesting > threshold.nesting)
      add(
        "deep-nesting",
        [file.id],
        [symbol.id],
        symbol.range,
        "Nesting threshold exceeded.",
        symbol.metrics.maxNesting,
        threshold.nesting,
      );
    for (const line of [...new Set(detail.emptyCatchLines)])
      add("swallowed-error", [file.id], [symbol.id], lineRange(line), "Empty catch/except body swallows errors.");
    if (file.role === "test") continue;
    if (detail.missingTypeLines.length)
      add(
        "missing-types",
        [file.id],
        [symbol.id],
        lineRange(symbol.range.startLine),
        "One or more parameters are unannotated or explicitly any.",
        detail.missingTypeLines.length,
        0,
      );
    if (fn && symbol.metrics.params > threshold.parameters)
      add(
        "long-parameter-list",
        [file.id],
        [symbol.id],
        symbol.range,
        "Parameter threshold exceeded.",
        symbol.metrics.params,
        threshold.parameters,
      );
    for (const line of [...new Set(detail.magicLines)])
      add("magic-number", [file.id], [symbol.id], lineRange(line), "Unnamed numeric literal outside a named constant.");
    if (symbol.kind === "class" && detail.methodCount > threshold.methods)
      add(
        "god-class",
        [file.id],
        [symbol.id],
        symbol.range,
        "Class method threshold exceeded.",
        detail.methodCount,
        threshold.methods,
      );
    if (symbol.kind === "function" && !symbol.exported && symbol.metrics.fanIn === 0 && !entrySymbols.has(symbol.id)) {
      const uncertain =
        data?.calls.some((c) => c.dynamic || c.shadowed) ||
        false ||
        [...parsed.values()].some((p) => p.strings.includes(symbol.name));
      add(
        uncertain ? "possibly-dead-code" : "dead-code",
        [file.id],
        [symbol.id],
        symbol.range,
        uncertain
          ? "No known caller; dynamic calls or string references may reach this function."
          : "No known caller or export/entry point.",
      );
      dead.add(symbol.id);
    }
  }
  for (const symbol of graph.symbols) {
    const file = files.get(symbol.fileId);
    if (
      file?.role !== "source" ||
      dead.has(symbol.id) ||
      symbol.kind === "interface" ||
      symbol.kind === "type" ||
      symbol.kind === "method"
    )
      continue;
    if (!tested.has(symbol.id) && !entrySymbols.has(symbol.id))
      add(
        "untested-code",
        [file.id],
        [symbol.id],
        symbol.range,
        "No exact test import or call references this symbol.",
      );
  }
  const duplicates = new Map<string, string[]>();
  for (const symbol of graph.symbols) {
    const file = files.get(symbol.fileId);
    const detail = file ? parsed.get(file.path)?.details[symbol.id] : undefined;
    if (
      file?.role === "test" ||
      !detail ||
      detail.statements < threshold.duplicateStatements ||
      !["function", "method"].includes(symbol.kind)
    )
      continue;
    const group = duplicates.get(detail.normalized) ?? [];
    group.push(symbol.id);
    duplicates.set(detail.normalized, group);
  }
  for (const ids of duplicates.values())
    if (ids.length > 1) {
      ids.sort();
      const first = graph.symbols.find((s) => s.id === ids[0]);
      if (first)
        add(
          "duplicate-code",
          ids.map((s) => graph.symbols.find((x) => x.id === s)?.fileId ?? ""),
          ids,
          first.range,
          "Equal normalized syntax subtrees (identifier spelling ignored).",
          ids.length,
          1,
        );
    }
  for (const source of sources) {
    const file = graph.files.find((f) => f.path === source.path);
    if (!file) continue;
    // TODO markers must be comments, never strings. Parser node text is not retained;
    // use source-line comment prefixes and inline comment syntax, excluding literals.
    for (const line of parsed.get(source.path)?.todoLines ?? []) {
      const owner = graph.symbols
        .filter((s) => s.fileId === file.id && s.range.startLine <= line && s.range.endLine >= line)
        .sort((a, b) => a.metrics.loc - b.metrics.loc)[0];
      add("todo-comment", [file.id], owner ? [owner.id] : [], lineRange(line), "TODO/FIXME/HACK comment marker.");
    }
    if (file.loc > threshold.fileLoc)
      add(
        "huge-file",
        [file.id],
        [],
        { startLine: 1, endLine: file.loc, startColumn: 0, endColumn: 0 },
        "File line-count threshold exceeded.",
        file.loc,
        threshold.fileLoc,
      );
  }
  for (const group of stronglyConnected(
    graph.files.map((f) => f.id),
    graph.edges.filter((e) => e.kind === "imports"),
  ))
    add("circular-dependency", group, [], lineRange(1), "Strongly connected file-import component.", group.length, 1);
  for (const file of graph.files) file.smellCount = graph.smells.filter((s) => s.fileIds.includes(file.id)).length;
}
