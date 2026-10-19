/** biome-ignore-all lint/style/noNonNullAssertion: Missing graph evidence must fail loudly. */
import { expect, it } from "vitest";
import { fixture } from "../../combat/src/test-fixtures.ts";
import { buildFactBook } from "../../content/src/facts.ts";
import { generateQuests } from "./generate.ts";

it("backs each equipment view with exact graph, syntax, imports, coverage and git facts", async () => {
  const f = await fixture("tiny-ts"),
    atlas = await generateQuests(
      f.world,
      f.graph,
      buildFactBook(f.graph, f.world),
      (path) => f.sources.get(path) ?? null,
      f.index,
    );
  for (const symbol of atlas.symbols) {
    const graph = f.graph.symbols.find((s) => s.id === symbol.id)!;
    const known = new Set(atlas.symbols.map((s) => s.id));
    expect(symbol.callers).toEqual(
      [
        ...new Set(
          f.graph.edges
            .filter((e) => e.kind === "calls" && e.confidence === "exact" && e.to === symbol.id && known.has(e.from))
            .map((e) => e.from),
        ),
      ].sort(),
    );
    expect(symbol.returnType).toBe(graph.returnType);
    const source = f.sources.get(f.graph.files.find((f) => f.id === symbol.fileId)!.path)!;
    for (const step of symbol.steps)
      expect(
        source.text
          .split("\n")
          .slice(step.line - 1, step.line + 3)
          .join("\n")
          .replace(/\s/g, ""),
      ).toContain((step.text.split("…")[0] ?? step.text).replace(/\s/g, ""));
  }
  for (const file of atlas.files) {
    const raw = f.graph.files.find((f) => f.id === file.id)!;
    expect(file.firstCommitAt).toBe(raw.git?.firstCommitAt ?? null);
    expect(file.lastCommitAt).toBe(raw.git?.lastCommitAt ?? null);
    expect(file.imports).toEqual(
      f.graph.edges
        .filter(
          (e) =>
            e.kind === "imports" &&
            e.confidence === "exact" &&
            e.from === file.id &&
            f.graph.files.some((f) => f.id === e.to),
        )
        .map((e) => e.to),
    );
    expect(file.importers).toEqual(
      f.graph.edges
        .filter(
          (e) =>
            e.kind === "imports" &&
            e.confidence === "exact" &&
            e.to === file.id &&
            f.graph.files.some((f) => f.id === e.from),
        )
        .map((e) => e.from),
    );
    expect(file.coverage).toBeNull();
  }
  expect(atlas.assertions).toHaveLength(f.graph.testFacts.length);
  const nested = atlas.symbols
    .find((s) => s.name === "computeTaskStatus")
    ?.steps.find((s) => /return ["']late["']/.test(s.text));
  expect(nested?.guards).toEqual(["then", "then"]);
});
