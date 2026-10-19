import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type CodeGraph, CodeGraphSchema } from "@codebase-quest/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { analyze, serializeGraph } from "./index.ts";

const names = ["tiny-ts", "tiny-py", "smelly-ts", "poisoned-ts", "weird-repo", "empty-repo"];
const fixtures = new URL("../../../fixtures/repos/", import.meta.url);
const graphs = new Map<string, CodeGraph>();
beforeAll(async () => {
  for (const name of names) graphs.set(name, await analyze(fileURLToPath(new URL(name, fixtures)), { workers: 2 }));
}, 120_000);
const graph = (name: string) => {
  const value = graphs.get(name);
  if (!value) throw new Error(name);
  return value;
};
describe("fixture CodeGraphs", () => {
  for (const name of names)
    it(`${name}: schema, referential/range invariants and determinism`, async () => {
      const first = graph(name);
      expect(CodeGraphSchema.safeParse(first).success).toBe(true);
      const second = await analyze(fileURLToPath(new URL(name, fixtures)), { workers: 1 });
      expect(serializeGraph(first)).toBe(serializeGraph(second));
      for (const collection of [
        first.files,
        first.symbols,
        first.edges,
        first.smells,
        first.entryPoints,
        first.testFacts,
        first.diagnostics,
      ])
        expect(collection.map((x) => x.id)).toEqual(collection.map((x) => x.id).sort());
    });
  for (const name of ["tiny-ts", "tiny-py", "smelly-ts"])
    it(`${name}: reviewable graph golden`, () => {
      const path = new URL(`../goldens/${name}.graph.json`, import.meta.url);
      if (process.env.CQ_UPDATE_GOLDENS === "1") writeFileSync(path, serializeGraph(graph(name), true));
      expect(serializeGraph(graph(name), true)).toBe(readFileSync(path, "utf8"));
    });
  it("extracts Taskly's exact chain, complexity, Mimic, cycle and literal tests", () => {
    const g = graph("tiny-ts");
    const symbol = (name: string) => g.symbols.find((s) => s.name === name);
    for (const [from, to] of [
      ["shareTask", "checkPermissions"],
      ["checkPermissions", "loadTeam"],
      ["loadTeam", "query"],
    ])
      expect(g.edges).toContainEqual(
        expect.objectContaining({
          from: symbol(from ?? "")?.id,
          to: symbol(to ?? "")?.id,
          kind: "calls",
          confidence: "exact",
        }),
      );
    const status = symbol("computeTaskStatus");
    expect(status?.metrics.cyclomatic).toBe(5);
    expect(Math.max(...g.symbols.map((s) => s.metrics.cyclomatic))).toBe(5);
    expect(g.smells.filter((s) => s.kind === "duplicate-code")).toHaveLength(1);
    expect(g.smells.filter((s) => s.kind === "circular-dependency")).toHaveLength(1);
    expect(g.testFacts.filter((f) => f.calleeSymbolId === symbol("slugify")?.id)).toHaveLength(4);
    expect(
      g.testFacts
        .filter((f) => f.calleeSymbolId === status?.id)
        .map((f) => f.expected)
        .sort(),
    ).toEqual(["done", "late", "open", "overdue"]);
    expect(g.files.find((f) => f.path.endsWith("taskService.ts"))?.git).toMatchObject({ commits: 4, authors: 3 });
  });
  it("agrees with the smelly fixture answer key without manufacturing a static Mutant", () => {
    const g = graph("smelly-ts");
    const key = readFileSync(new URL("smelly-ts/SMELLS.md", fixtures), "utf8");
    const rows = key.split("\n").filter((line) => /^\| \d+ \|/.test(line));
    const actual = g.smells.map((smell) => ({
      kind: smell.kind,
      files: smell.fileIds.map((id) => g.files.find((f) => f.id === id)?.path).sort(),
      names: smell.symbolIds.map((id) => g.symbols.find((s) => s.id === id)?.name).sort(),
      start: smell.range.startLine,
      end: smell.range.endLine,
    }));
    expect(rows).toHaveLength(15);
    expect(actual).toHaveLength(14);
    for (const row of rows) {
      const columns = row.split("|").map((x) => x.trim());
      const kind = columns[3];
      if (kind === "injected-mutation") {
        expect(actual.some((s) => s.kind === kind)).toBe(false);
        continue;
      }
      const files = [...new Set([...(columns[4] ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1]))].sort();
      const symbolNames = [...(columns[5] ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1]).sort();
      const range = /^(\d+)–(\d+)/.exec(columns[6] ?? "");
      const found = actual.filter((s) => s.kind === kind);
      expect(found).toHaveLength(1);
      expect(found[0]?.files).toEqual(files);
      if (symbolNames.length) expect(found[0]?.names).toEqual(symbolNames);
      if (range) {
        expect(found[0]?.start).toBe(Number(range[1]));
        if (kind !== "duplicate-code") expect(found[0]?.end).toBe(Number(range[2]));
      }
    }
  });
  it("reports every weird-repo oddity and never emits the secret value", () => {
    const g = graph("weird-repo");
    const codes = new Set(g.diagnostics.map((d) => d.code));
    for (const code of [
      "secret-skipped",
      "binary-skipped",
      "symlink-skipped",
      "large-file-skipped",
      "encoding-skipped",
      "empty-file",
      "crlf-normalized",
      "deep-path",
      "parse-error",
    ])
      expect(codes.has(code)).toBe(true);
    const json = serializeGraph(g);
    expect(json).not.toContain("not-a-real-secret-cq-fixture-0000");
    expect(json).not.toContain("also-fake-0000");
    expect(g.files.some((f) => f.path.startsWith(".env"))).toBe(false);
  });
  it("makes empty-repo a valid empty graph", () => {
    const g = graph("empty-repo");
    expect([g.files.length, g.symbols.length, g.edges.length, g.smells.length]).toEqual([0, 0, 0, 0]);
  });
});
