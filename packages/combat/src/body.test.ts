/** biome-ignore-all lint/style/noNonNullAssertion: Missing required fixture facts must fail these tests immediately. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "./ast.ts";
import { buildBody } from "./body.ts";
import { CodeBodySchema } from "./schema.ts";
import { fixture } from "./test-fixtures.ts";

for (const name of ["tiny-ts", "smelly-ts", "tiny-py", "poisoned-ts", "weird-repo", "empty-repo"]) {
  describe(`${name} bodies`, () => {
    it("has deterministic bodies with real source ranges, exact organs and complete limbs", async () => {
      const a = await fixture(name),
        b = await fixture(name);
      const bodies = [...a.bodies.values()].map((x) => x.body);
      expect(JSON.stringify(bodies)).toBe(JSON.stringify([...b.bodies.values()].map((x) => x.body)));
      if (["tiny-ts", "smelly-ts"].includes(name)) expect(bodies).toMatchSnapshot();
      for (const built of a.bodies.values()) {
        const body = CodeBodySchema.parse(built.body);
        expect(body.cells.length).toBeLessThanOrEqual(40);
        expect(body.cells.map((c) => c.lines[0])).toEqual(body.cells.map((c) => c.lines[0]).toSorted((x, y) => x - y));
        for (const c of body.cells) {
          expect(c.lines[0]).toBeGreaterThanOrEqual(body.code.startLine);
          expect(c.lines[1]).toBeLessThan(body.code.startLine + body.code.lines.length);
          if (c.kind === "organ")
            expect(
              a.graph.edges.some(
                (e) =>
                  e.kind === "calls" &&
                  e.from === body.symbolId &&
                  e.to === c.calleeId &&
                  e.confidence === "exact" &&
                  e.line === c.lines[0],
              ),
            ).toBe(true);
        }
        // Independently inspect raw syntax: every return belongs to a heart.
        const visit = (n: import("web-tree-sitter").Node) => {
          if (n !== built.definition && /function|method_definition|class/.test(n.type)) return;
          if (n.type === "return_statement")
            expect(body.cells.some((c) => c.kind === "heart" && c.lines[0] === n.startPosition.row + 1)).toBe(true);
          for (const child of n.namedChildren) if (child) visit(child);
        };
        visit(built.definition);
        for (const l of body.limbs) {
          const joint = built.stmtOf.get(l.jointId)!;
          const owned = body.cells
            .filter((c) => {
              if (c.id === l.jointId) return false;
              let node = built.stmtOf.get(c.id)?.node;
              while (node) {
                if (node.id === joint.node.id) return true;
                node = node.parent ?? undefined;
              }
              return false;
            })
            .map((c) => c.id);
          expect(l.cellIds).toEqual(owned);
        }
      }
    });
  });
}
it("matches the Phase 01 computeTaskStatus cells, limbs and hearts", async () => {
  const { bodies } = await fixture("tiny-ts");
  const body = [...bodies.values()].find((b) => b.body.name === "computeTaskStatus")!.body;
  const proto = JSON.parse(
    readFileSync(new URL("../../../apps/game/src/prototype/bodies/computeTaskStatus.json", import.meta.url), "utf8"),
  ).bodies[0];
  // ADR 0010: Date.now is external and has no exact repository edge, so
  // prototype c7 is an ordinary cell. All positions/limbs/hearts still match.
  expect(body.cells.map((c) => [c.id, c.row, c.col, c.kind])).toEqual(
    proto.cells.map((c: (typeof body.cells)[number]) => [c.id, c.row, c.col, c.id === "c7" ? "body" : c.kind]),
  );
  expect(body.limbs).toEqual(proto.limbs);
});
it("groups long ordinary runs without merging special cells over many sizes", async () => {
  for (const size of [41, 60, 100, 220]) {
    const text = `function sample(x) {\n${Array.from({ length: size }, (_, i) => `const v${i} = ${i};`).join("\n")}\nif (x) return 1;\nreturn 0;\n}`;
    const root = await parse(text, "typescript");
    const input = {
      definition: root.namedChildren[0]!,
      symbolId: "test",
      name: "sample",
      path: "sample.ts",
      language: "typescript",
      fileLines: text.split("\n"),
      edges: [],
    };
    const b = buildBody(input).body;
    expect(b).toEqual(buildBody(input).body);
    expect(b.cells.length).toBeLessThanOrEqual(40);
    expect(b.cells.filter((c) => c.grouped).every((c) => c.kind === "body")).toBe(true);
    expect(b.cells.filter((c) => c.kind === "heart")).toHaveLength(2);
    expect(b.cells.reduce((n, c) => n + (c.grouped ?? 1), 0)).toBe(size + 3);
  }
});
