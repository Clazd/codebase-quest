import type { CodeGraph } from "@codebase-quest/shared";
import { worldId } from "./random.ts";
export function syntheticGraph(count: number, folders: number, loc = 20): CodeGraph {
  const graph: CodeGraph = {
    schemaVersion: 1,
    repo: {
      name: "Synthetic Kingdom",
      commit: null,
      languages: [{ language: "typescript", files: count, loc: count * loc }],
    },
    modules: [],
    files: [],
    symbols: [],
    edges: [],
    smells: [],
    entryPoints: [],
    testFacts: [],
    diagnostics: [],
  };
  for (let i = 0; i < folders; i++)
    graph.modules.push({
      id: worldId("module", `${i}`),
      path: `src/area-${i}`,
      name: `area-${i}`,
      kind: "directory",
      declared: true,
    });
  for (let i = 0; i < count; i++) {
    const fileId = worldId("file", `${i}`),
      symbolId = worldId("symbol", `${i}`),
      moduleId = graph.modules[i % folders]?.id ?? "";
    graph.files.push({
      id: fileId,
      path: `src/area-${i % folders}/file-${i}.ts`,
      moduleId,
      language: "typescript",
      role: "source",
      loc,
      symbolCount: 1,
      smellCount: i % 9 === 0 ? 1 : 0,
      hash: worldId("content", `${i}`),
      git: null,
      docs: null,
    });
    graph.symbols.push({
      id: symbolId,
      fileId,
      parentId: null,
      kind: "function",
      name: `function${i}`,
      qualifiedName: `function${i}`,
      range: { startLine: 1, endLine: Math.min(loc, 5), startColumn: 0, endColumn: 1 },
      exported: i % 2 === 0,
      async: false,
      generator: false,
      parameters: [],
      returnType: "number",
      doc: null,
      decorators: [],
      traits: [],
      metrics: {
        loc: Math.min(loc, 5),
        cyclomatic: 1 + (i % 7),
        maxNesting: i % 3,
        params: 0,
        fanIn: i ? 1 : 0,
        fanOut: i < count - 1 ? 1 : 0,
        dynamicCalls: 0,
      },
    });
    if (i < count - 1)
      graph.edges.push({
        id: worldId("edge", `${i}`),
        from: symbolId,
        to: worldId("symbol", `${i + 1}`),
        kind: "calls",
        confidence: i % 11 === 0 ? "guess" : "exact",
        line: 2,
        label: `function${i + 1}`,
      });
    if (i % 9 === 0)
      graph.smells.push({
        id: worldId("smell", `${i}`),
        kind: "todo-comment",
        fileIds: [fileId],
        symbolIds: [symbolId],
        range: { startLine: 1, endLine: 1, startColumn: 0, endColumn: 1 },
        severity: 1,
        evidence: { message: "Synthetic TODO", measured: null, threshold: null },
      });
  }
  if (count)
    graph.entryPoints.push({
      id: worldId("entry", "main"),
      fileId: worldId("file", "0"),
      symbolId: worldId("symbol", "0"),
      kind: "main",
      label: "main",
      range: { startLine: 1, endLine: 1, startColumn: 0, endColumn: 1 },
    });
  return graph;
}
