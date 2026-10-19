import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { analyze, serializeGraph } from "../packages/analyzer/src/index.ts";
import type { CodeGraph } from "../packages/shared/src/index.ts";
import { PINNED_DIR, readPinned } from "./fixtures/pinned.ts";

const update = process.argv.includes("--update-baseline");
const baselinePath = fileURLToPath(new URL("../packages/analyzer/benchmark-baseline.json", import.meta.url));
const reports = [];
const failures: string[] = [];
const known = JSON.parse(
  readFileSync(new URL("../packages/analyzer/known-grammar-recoveries.json", import.meta.url), "utf8"),
) as Record<string, { commit: string; paths: string[] }>;
for (const repo of readPinned()) {
  const path = join(PINNED_DIR, repo.name);
  if (!existsSync(path)) throw new Error(`Missing ${repo.name}; run pnpm fixtures:pinned first.`);
  let peak = process.memoryUsage.rss();
  const timer = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage.rss());
  }, 10);
  const start = performance.now();
  let graph: CodeGraph;
  try {
    graph = await analyze(path);
  } finally {
    clearInterval(timer);
  }
  const elapsedMs = Math.round(performance.now() - start);
  peak = Math.max(peak, process.memoryUsage.rss());
  if (graph.repo.commit !== repo.commit) throw new Error(`${repo.name}: commit mismatch`);
  const internals = graph.edges.filter((e) => e.kind === "imports" && graph.files.some((f) => f.id === e.to)).length;
  const unresolved = graph.diagnostics.filter((d) => d.code === "unresolved-import").length;
  const resolvedFraction = internals / (internals + unresolved || 1);
  const codeFiles = graph.files.filter((f) => f.language).length;
  const errorFiles = new Set(graph.diagnostics.filter((d) => d.code === "parse-error").map((d) => d.path)).size;
  const parseErrorFraction = errorFiles / (codeFiles || 1);
  const allowance = known[repo.name];
  const knownPaths = allowance?.commit === repo.commit ? allowance.paths : [];
  const newErrors = new Set(
    graph.diagnostics.filter((d) => d.code === "parse-error" && !knownPaths.includes(d.path ?? "")).map((d) => d.path),
  ).size;
  const report = {
    name: repo.name,
    commit: repo.commit,
    files: graph.files.length,
    symbols: graph.symbols.length,
    internalImportResolution: resolvedFraction,
    parseErrorFraction,
    knownGrammarRecoveryFiles: errorFiles - newErrors,
    newParseErrorFraction: newErrors / (codeFiles || 1),
    elapsedMs,
    peakRssMiB: Math.ceil(peak / 1024 / 1024),
  };
  reports.push(report);
  console.log(JSON.stringify(report));
  if (!graph.symbols.length || resolvedFraction <= 0.5 || newErrors / (codeFiles || 1) >= 0.05)
    failures.push(`${repo.name}: smoke sanity threshold failed`);
  mkdirSync("out/analyzer-smoke", { recursive: true });
  writeFileSync(`out/analyzer-smoke/${repo.name}.graph.json`, serializeGraph(graph));
}
const largest = readPinned().sort((a, b) => b.sourceLines - a.sourceLines)[0];
const benchmark = reports.find((r) => r.name === largest?.name);
if (failures.length) throw new Error(failures.join("; "));
if (!benchmark) throw new Error("No benchmark repository");
if (update)
  writeFileSync(
    baselinePath,
    `${JSON.stringify({ date: "2026-10-19", platform: process.platform, node: process.version, ...benchmark }, null, 2)}\n`,
  );
else {
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as { elapsedMs: number; peakRssMiB: number };
  if (benchmark.elapsedMs > baseline.elapsedMs * 2 || benchmark.peakRssMiB > baseline.peakRssMiB * 2)
    throw new Error("Analyzer exceeded 2× the recorded time or RSS baseline.");
}
writeFileSync("out/analyzer-smoke/report.json", `${JSON.stringify(reports, null, 2)}\n`);
