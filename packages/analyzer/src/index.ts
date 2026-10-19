import { basename, posix, resolve } from "node:path";
import { type CodeGraph, CodeGraphSchema, type FileNode } from "@codebase-quest/shared";
import { type AnalyzerConfig, AnalyzerConfigSchema } from "./config.ts";
import { discover } from "./discover.ts";
import { gitStats } from "./git.ts";
import { extractAll } from "./pool.ts";
import { link } from "./resolve.ts";
import { detectSmells } from "./smells.ts";
import { compare, diagnostic, hash, id, mask } from "./util.ts";

export type { AnalyzerConfig } from "./config.ts";
export { AnalyzerConfigSchema } from "./config.ts";

export function serializeGraph(graph: CodeGraph, pretty = false): string {
  return `${JSON.stringify(CodeGraphSchema.parse(graph), null, pretty ? 2 : undefined)}\n`;
}
export async function analyze(path: string, options: Partial<AnalyzerConfig> = {}): Promise<CodeGraph> {
  const root = resolve(path);
  const discovery = discover(root);
  const settings = discovery.files.find((f) => f.path === "codequest.config.json");
  const fromFile = settings ? (JSON.parse(settings.text) as Record<string, unknown>) : {};
  const config = AnalyzerConfigSchema.parse({ ...fromFile, ...options });
  const git = gitStats(root);
  const graph: CodeGraph = {
    schemaVersion: 1,
    repo: { name: basename(root), commit: git.commit, languages: [] },
    modules: [],
    files: [],
    symbols: [],
    edges: [],
    smells: [],
    entryPoints: [],
    testFacts: [],
    diagnostics: [...discovery.diagnostics],
  };
  if (!discovery.git)
    graph.diagnostics.push(diagnostic(null, "no-git", null, "No git repository: history metrics are unavailable."));
  for (const source of discovery.files) {
    const dir = posix.dirname(source.path);
    const moduleId = id(dir, "module", dir);
    if (!graph.modules.some((m) => m.id === moduleId))
      graph.modules.push({ id: moduleId, path: dir, name: posix.basename(dir), kind: "directory", declared: true });
    const file: FileNode = {
      id: id(source.path, "file", source.path),
      path: source.path,
      moduleId,
      language: source.language,
      role: source.role,
      loc: source.loc,
      symbolCount: 0,
      smellCount: 0,
      hash: hash(source.text),
      git: git.files.get(source.path) ?? null,
      docs: source.role === "docs" ? mask(source.text.slice(0, 20_000)) : null,
    };
    if (source.role === "docs" && source.text.length > 20_000)
      graph.diagnostics.push(
        diagnostic(source.path, "docs-truncated", null, "Documentation extraction limited to 20,000 characters."),
      );
    graph.files.push(file);
  }
  const parseable = discovery.files.filter((f) => f.language !== null && f.role !== "generated");
  for (const file of discovery.files.filter((f) => f.language && f.role === "generated"))
    graph.diagnostics.push(
      diagnostic(file.path, "generated-skipped", null, "Generated source retained as a file, not parsed."),
    );
  const extracted = await extractAll(parseable, config.workers);
  const parsed = new Map(
    parseable.map((f, i) => {
      const result = extracted[i];
      if (!result) throw new Error("Missing worker result");
      return [f.path, result] as const;
    }),
  );
  for (const [path, data] of parsed) {
    graph.symbols.push(...data.symbols);
    graph.diagnostics.push(...data.diagnostics);
    const file = graph.files.find((f) => f.path === path);
    if (file) file.symbolCount = data.symbols.length;
  }
  link(graph, discovery.files, parsed, config);
  detectSmells(graph, discovery.files, parsed, config);
  for (const source of discovery.files.filter((f) => f.language)) {
    if (!source.language) continue;
    let stat = graph.repo.languages.find((l) => l.language === source.language);
    if (!stat) {
      stat = { language: source.language, files: 0, loc: 0 };
      graph.repo.languages.push(stat);
    }
    stat.files++;
    stat.loc += source.loc;
  }
  graph.repo.languages.sort((a, b) => compare(a.language, b.language));
  for (const symbol of graph.symbols) {
    symbol.traits = [...new Set(symbol.traits)].sort(compare);
    symbol.decorators.sort(compare);
  }
  for (const key of [
    "modules",
    "files",
    "symbols",
    "edges",
    "smells",
    "entryPoints",
    "testFacts",
    "diagnostics",
  ] as const) {
    const values = graph[key];
    const unique = [...new Map(values.map((v) => [v.id, v])).values()].sort((a, b) => compare(a.id, b.id));
    // Each keyed collection retains its schema-specific type after deduplication.
    Object.assign(graph, { [key]: unique });
  }
  return CodeGraphSchema.parse(graph);
}
export function graphStats(graph: CodeGraph): string {
  const counts = (values: string[]) =>
    Object.fromEntries([...new Set(values)].sort(compare).map((key) => [key, values.filter((v) => v === key).length]));
  return `${JSON.stringify({ repo: graph.repo.name, files: graph.files.length, symbols: graph.symbols.length, edges: counts(graph.edges.map((e) => `${e.kind}:${e.confidence}`)), smells: counts(graph.smells.map((s) => s.kind)), entryPoints: graph.entryPoints.length, testFacts: graph.testFacts.length, diagnostics: counts(graph.diagnostics.map((d) => d.code)) }, null, 2)}\n`;
}
