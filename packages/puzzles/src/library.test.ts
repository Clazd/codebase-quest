/** biome-ignore-all lint/style/noNonNullAssertion: Missing required fixture facts must fail these tests immediately. */
import { buildBody, moduleConstants, parse } from "@codebase-quest/combat/node";
import { expect, it } from "vitest";
import { fixture } from "../../combat/src/test-fixtures.ts";
import { maze, traceNext, typeSense, whoCalls } from "./generators.ts";

it("independently audits library Trace, Type Sense and Who Calls even when an action uses another fallback", async () => {
  const data = await fixture("tiny-ts");
  let types = 0,
    traces = 0,
    callers = 0;
  for (const b of data.bodies.values()) {
    const ctx = {
      built: b,
      graph: data.graph,
      constants: moduleConstants(b.definition.tree.rootNode),
      seed: data.world.seed,
    };
    for (const organ of b.body.cells.filter((c) => c.kind === "organ")) {
      const q = typeSense(ctx, organ.id);
      if (!q) continue;
      types++;
      const target = data.graph.symbols.find((s) => s.id === organ.calleeId)!;
      const valid = q.choices.map((c) => c === target.returnType);
      expect(valid.filter(Boolean)).toHaveLength(1);
      expect(valid[q.answer!]).toBe(true);
      expect(q).toEqual(typeSense(ctx, organ.id));
    }
    const q = traceNext(ctx);
    if (q) {
      traces++;
      const edge = data.graph.edges
        .filter((e) => e.kind === "calls" && e.from === b.body.symbolId && e.confidence === "exact")
        .sort((a, b) => a.line - b.line)[0]!;
      const expected = data.graph.symbols.find((s) => s.id === edge.to)!.name;
      expect(q.choices.filter((c) => c === expected)).toHaveLength(1);
      expect(q.choices[q.answer!]).toBe(expected);
    }
    const w = whoCalls(ctx);
    if (w) {
      callers++;
      const ids = new Set(
        data.graph.edges.filter((e) => e.kind === "calls" && e.to === b.body.symbolId).map((e) => e.from),
      );
      const names = new Set(data.graph.symbols.filter((s) => ids.has(s.id)).map((s) => s.name));
      const valid = w.choices.map((c) => (names.size ? names.has(c) : c === "Nobody"));
      expect(valid.filter(Boolean)).toHaveLength(1);
      expect(valid[w.answer!]).toBe(true);
    }
  }
  expect(types).toBeGreaterThan(0);
  expect(traces).toBeGreaterThan(0);
  expect(callers).toBeGreaterThan(0);
});
it("negates every enclosing else condition in a maze, including outer decisions", async () => {
  const source =
    "function nested(a,b) {\nif(a) { return 0; } else {\nif(b) {\nreturn 1;\n}\nreturn 2;\n}\nreturn 3;\n}";
  const root = await parse(source, "typescript");
  const built = buildBody({
    definition: root.namedChildren[0]!,
    symbolId: "nested",
    name: "nested",
    path: "nested.ts",
    language: "typescript",
    fileLines: source.split("\n"),
    edges: [],
  });
  const q = maze({
    built,
    constants: new Map(),
    graph: { symbols: [], files: [], edges: [], testFacts: [] },
    seed: "outer-else",
  })!;
  const expected = "not (if(a)) ∧ if(b)";
  expect(q.choices.filter((c) => c === expected)).toHaveLength(1);
  expect(q.choices[q.answer!]).toBe(expected);
});
