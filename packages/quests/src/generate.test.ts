/** biome-ignore-all lint/style/noNonNullAssertion: Required evidence must fail loudly. */
import { describe, expect, it } from "vitest";
import type { Node } from "web-tree-sitter";
import { findDefinition, parse } from "../../combat/src/ast.ts";
import { fixture } from "../../combat/src/test-fixtures.ts";
import { buildFactBook } from "../../content/src/facts.ts";
import { templateOutput, worldItems } from "../../content/src/items.ts";
import { validateContent } from "../../content/src/validate.ts";
import { dataFlows, generateQuests, parseCoverage } from "./generate.ts";

const kids = (n: Node | null) => n?.namedChildren.filter((c): c is Node => Boolean(c)) ?? [];
describe.each(["tiny-ts", "smelly-ts", "tiny-py", "poisoned-ts", "weird-repo", "empty-repo"])(
  "quest atlas %s",
  (name) => {
    it("is deterministic, reachable, grounded and has independently verified signature keys", async () => {
      // Only fixture names in the repository are analyzed. No fixture code is executed.
      const f = await fixture(name),
        book = buildFactBook(f.graph, f.world);
      const read = (path: string) => f.sources.get(path) ?? null;
      const atlas = await generateQuests(f.world, f.graph, book, read, f.index);
      expect(await generateQuests(f.world, f.graph, book, read, f.index)).toEqual(atlas);
      const chapters = atlas.quests.filter((q) => q.type === "main" && (q.chapter ?? 0) > 0);
      if (atlas.symbols.length >= 3) expect(chapters.length).toBeGreaterThanOrEqual(3);
      expect(chapters.length).toBeLessThanOrEqual(7);
      expect(atlas.quests[0]?.id).toBe("prologue");
      for (const q of atlas.quests) {
        for (const o of q.objectives) {
          if (o.kind === "talk" || o.kind === "answer")
            expect(f.world.npcs.some((n) => n.symbolId === o.symbolId)).toBe(true);
          if (o.kind === "visit") expect(f.world.buildings.some((b) => b.id === o.buildingId)).toBe(true);
          if (o.kind === "defeat") expect(f.index.some((e) => e.id === o.smellId && e.fightable)).toBe(true);
          if (o.kind === "collect")
            for (const id of o.codexIds) expect(atlas.symbols.some((s) => s.id === id)).toBe(true);
          if (o.kind === "find")
            for (const id of o.answerSymbolIds) {
              const raw = f.graph.symbols.find((s) => s.id === id)!;
              expect(`${raw.name} ${raw.doc ?? ""}`.toLowerCase()).toContain(o.query);
            }
        }
        if (q.type === "main" && q.path.length > 1)
          for (let i = 1; i < q.path.length; i++)
            expect(
              f.graph.edges.some(
                (e) => e.kind === "calls" && e.confidence === "exact" && e.from === q.path[i - 1] && e.to === q.path[i],
              ),
            ).toBe(true);
      }
      // Independent oracle: inspect the raw formal parameter children, not atlas parameters or quest answer code.
      for (const s of atlas.symbols) {
        const raw = f.graph.symbols.find((n) => n.id === s.id)!,
          file = f.graph.files.find((f) => f.id === s.fileId)!,
          source = read(file.path);
        if (!source) continue;
        const root = await parse(source.text, source.language),
          node = findDefinition(root, raw.range.startLine, raw.range.startColumn, raw.range.endLine);
        const params = node?.childForFieldName("parameters") ?? null;
        const actual = kids(params).filter((n) => n.type !== "comment").length;
        // Single-argument arrows have no parentheses in the grammar.
        const count = actual || (node?.type === "arrow_function" && node.childForFieldName("parameter") ? 1 : 0);
        expect(s.parameters, `${file.path}:${s.name}`).toBe(count);
        if (["class", "interface", "type"].includes(s.kind)) {
          const declaration = source.text
            .split("\n")
            .slice(raw.range.startLine - 1, raw.range.endLine)
            .join("\n");
          expect(declaration, `${file.path}:${s.name}`).toMatch(new RegExp(`\\b${s.kind}\\b`));
        }
        // Separately order source offsets of exact graph calls, excluding nested owners.
        const candidates = f.graph.edges.filter(
          (e) =>
            e.from === s.id &&
            e.kind === "calls" &&
            e.confidence === "exact" &&
            atlas.symbols.some((s) => s.id === e.to),
        );
        const ordered = candidates
          .flatMap((e) => {
            const target = f.graph.symbols.find((s) => s.id === e.to)!;
            const line = source.text.split("\n")[e.line - 1] ?? "";
            const safe = target.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const offset = line.search(new RegExp(`\\b${safe}(?:\\s*<[^>]*>)?\\s*\\(`));
            return offset >= 0 ? [{ id: e.to, line: e.line, offset }] : [];
          })
          .sort((a, b) => a.line - b.line || a.offset - b.offset)
          .map((c) => c.id);
        if (s.callOrder.length) expect(s.callOrder[0]).toBe(ordered[0]);
      }
      for (const delivery of atlas.deliveries) {
        const owner = f.graph.symbols.find((s) => s.id === delivery.owner)!,
          file = f.graph.files.find((f) => f.id === owner.fileId)!,
          text = read(file.path)!.text;
        const lines = text.split("\n");
        expect(lines[delivery.line - 1]).toContain(delivery.via);
        const from = f.graph.symbols.find((s) => s.id === delivery.from)!,
          to = f.graph.symbols.find((s) => s.id === delivery.to)!;
        expect(text).toContain(from.name);
        expect(text).toContain(to.name);
        const block = lines.slice(delivery.line - 1, delivery.line + 3).join("\n");
        expect(block).toMatch(new RegExp(`${to.name}\\([^)]*\\b${delivery.via}\\b`));
      }
      if (["tiny-ts", "smelly-ts"].includes(name))
        expect({
          quests: atlas.quests,
          deliveries: atlas.deliveries,
          dependencies: atlas.dependencies,
          gates: atlas.gates,
          dailyCandidates: atlas.dailyCandidates,
        }).toMatchSnapshot();
      const narration = worldItems(f.world, book, () => null, atlas.quests).filter(
        (i) => i.contentType === "quest-narration",
      );
      for (const item of narration) {
        const raw = JSON.stringify(item.facts);
        expect(raw).not.toMatch(/answerSymbolIds|parameters|objectives|puzzleTypes|"answer"|correctChoice/);
        expect(validateContent(item, templateOutput(item, "seed"), { book }).ok).toBe(true);
      }
    }, 120000);
  },
);
it("proves adjacent direct assignment→argument flow and rejects mutation/branch guesses", async () => {
  const root = await parse("function run() { const task = parseTask(); return saveTask(task); }", "typescript");
  const resolve = (_line: number, name: string) =>
    ({ parseTask: "parse", saveTask: "save" })[name as "parseTask"] ?? null;
  expect(dataFlows(root, "run", resolve)).toEqual([{ from: "parse", to: "save", via: "task", line: 1, owner: "run" }]);
  for (const text of [
    "const task = parseTask(); task = other(); saveTask(task);",
    "const task = parseTask(); if (ready) saveTask(task);",
    "const task = parseTask(); saveTask(task.value);",
  ])
    expect(dataFlows(await parse(`function run() { ${text} }`, "typescript"), "run", resolve)).toEqual([]);
});
it("reads coverage reports without executing anything or resolving external entities", () => {
  expect(Object.fromEntries(parseCoverage("SF:C:/repo/src/a.ts\nDA:1,2\nDA:2,0\nend_of_record", ["src/a.ts"]))).toEqual(
    { "src/a.ts": 0.5 },
  );
  expect(
    Object.fromEntries(
      parseCoverage(
        '<class filename="src/a.ts"><lines><line number="1" hits="0"/><line number="2" hits="5"/></lines></class>',
        ["src/a.ts"],
      ),
    ),
  ).toEqual({ "src/a.ts": 0.5 });
  expect(parseCoverage("SF:.env\nDA:1,1", ["src/a.ts"]).size).toBe(0);
});
