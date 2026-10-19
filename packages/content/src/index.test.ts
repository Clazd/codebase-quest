import { readFileSync, writeFileSync } from "node:fs";
import { type CodeGraph, CodeGraphSchema, type FactSheet, WorldModelSchema } from "@codebase-quest/shared";
import { describe, expect, it } from "vitest";
import en from "../locales/en.json" with { type: "json" };
import { buildFactBook, cleanDoc, firstSentence } from "./facts.ts";
import { dialogueFor, fill, packageInfo, RULES, variantIndex, winningRule } from "./index.ts";

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const graph: CodeGraph = CodeGraphSchema.parse(read("../../analyzer/goldens/tiny-ts.graph.json"));
const world = WorldModelSchema.parse(read("../../worldgen/goldens/tiny-ts.world.json"));
const book = buildFactBook(graph, world);
const sheet = (name: string) => {
  const found = book.symbols.find((s) => s.name === name);
  if (!found) throw new Error(name);
  return found;
};
/** A neutral fact sheet: only the overridden facts can trigger rules. */
function facts(overrides: Partial<FactSheet> = {}): FactSheet {
  return {
    symbolId: "s1",
    npcId: "n1",
    name: "doThing",
    qualifiedName: "doThing",
    displayName: "doThing()",
    kind: "function",
    language: "typescript",
    fileId: "f1",
    path: "src/thing.ts",
    regionId: null,
    buildingId: null,
    group: { kind: "module", key: "m", label: "src" },
    range: { startLine: 1, endLine: 3 },
    signature: "function doThing()",
    doc: null,
    docSummary: null,
    exported: true,
    async: false,
    traits: ["exported"],
    metrics: { loc: 3, cyclomatic: 1, maxNesting: 0, params: 0, fanIn: 1, fanOut: 0, dynamicCalls: 0 },
    callers: [],
    callees: [],
    testedBy: [{ symbolId: "t", name: "it@3", path: "tests/thing.test.ts", line: 3, confidence: "exact" }],
    tests: [],
    ioVia: [],
    ...overrides,
  };
}
const ref = (l: FactSheet["callers"][number]) => l.symbolId ?? graph.files.find((f) => f.path === l.path)?.id;
const metrics = (m: Partial<FactSheet["metrics"]>) => ({ ...facts().metrics, ...m });

describe("@codebase-quest/content", () => {
  it("reports the Phase 06 content engine", () => {
    expect(packageInfo).toEqual({ name: "@codebase-quest/content", phase: 6, status: "engine" });
  });
});
describe("template rule selection", () => {
  const cases: [string, Partial<FactSheet>][] = [
    ["doc", { docSummary: "Adds two numbers.", metrics: metrics({ fanIn: 9 }) }],
    ["recursive", { traits: ["recursive"], metrics: metrics({ fanIn: 9 }) }],
    ["busy", { metrics: metrics({ fanIn: 5, cyclomatic: 12 }) }],
    ["lonely", { exported: false, metrics: metrics({ fanIn: 0 }) }],
    ["complex", { metrics: metrics({ cyclomatic: 10 }), async: true }],
    ["async", { async: true, traits: ["async", "does-io"] }],
    ["io", { ioVia: ["insert"] }],
    ["ioDirect", { traits: ["does-io"] }],
    ["tested", {}],
    ["untested", { testedBy: [] }],
    [
      "trainer",
      { traits: ["test"], tests: [{ symbolId: "x", name: "slugify", path: "a", line: 1, confidence: "exact" }] },
    ],
    ["classHead", { kind: "class", testedBy: [] }],
    ["greeting", { kind: "method", traits: ["test"], testedBy: [] }],
  ];
  for (const [expected, overrides] of cases)
    it(`given its facts, the "${expected}" rule wins`, () => {
      expect(winningRule(facts(overrides))).toBe(expected);
    });
  it("uses the greeting only when nothing else matches", () => {
    expect(dialogueFor(facts({ kind: "interface", testedBy: [], traits: [] }), "s").map((l) => l.ruleId)).toEqual([
      "typeShape",
    ]);
    const lines = dialogueFor(facts({ kind: "method", traits: ["test"], testedBy: [] }), "s");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.text).toMatch(/doThing\(\).*src\/thing\.ts/);
  });
  it("fills every placeholder and returns at most three lines in priority order", () => {
    const f = facts({
      docSummary: "Adds two numbers.",
      metrics: metrics({ fanIn: 7, cyclomatic: 11 }),
      traits: ["does-io"],
      ioVia: ["insert", "update"],
    });
    const lines = dialogueFor(f, "seed-a");
    expect(lines.map((l) => l.ruleId)).toEqual(["doc", "busy", "complex"]);
    for (const line of lines) expect(line.text).not.toMatch(/\{\w+\}/);
    expect(lines[0]?.text).toContain("“Adds two numbers.”");
    expect(lines[1]?.text).toContain("7");
    expect(lines[2]?.text).toContain("11");
    const io = dialogueFor(facts({ traits: ["does-io"], ioVia: ["insert", "update"] }), "s");
    expect(io[0]?.text).toContain("insert and update");
    expect(dialogueFor(facts(), "s").find((l) => l.ruleId === "tested")?.text).toContain("tests/thing.test.ts");
  });
  it("has localized strings for every rule and only known placeholders", () => {
    for (const rule of RULES) {
      const variants = (en.dialogue as Record<string, string[]>)[rule.id];
      expect(variants?.length, rule.id).toBeGreaterThan(0);
      for (const v of variants ?? [])
        expect(() =>
          fill(v, {
            name: "n",
            short: "s",
            file: "f",
            doc: "d",
            fanIn: 1,
            cyclomatic: 1,
            ioKinds: "i",
            testFile: "t",
            targets: "x",
            owner: "o",
          }),
        ).not.toThrow();
    }
    expect(() => fill("Hi {missing}", {})).toThrow(/missing/);
  });
  it("chooses variants deterministically per seed", () => {
    const f = facts({ metrics: metrics({ fanIn: 6 }) });
    expect(dialogueFor(f, "seed-1")).toEqual(dialogueFor(f, "seed-1"));
    const picks = new Set(Array.from({ length: 40 }, (_, i) => Math.floor(variantIndex(`seed-${i}`, "s1", "busy", 3))));
    expect(picks.size).toBeGreaterThan(1);
    for (const p of picks) expect(p).toBeGreaterThanOrEqual(0);
    for (const p of picks) expect(p).toBeLessThan(3);
  });
  it("speaks true facts for Taskly characters", () => {
    expect(dialogueFor(sheet("slugify"), world.seed)[0]?.text).toContain(
      'Turns a title into a URL-friendly slug: "Hello World" becomes "hello-world".',
    );
    expect(winningRule(sheet("saveTask"))).toBe("ioDirect");
    expect(winningRule(sheet("createTask"))).toBe("io");
    expect(dialogueFor(sheet("createTask"), world.seed)[0]?.text).toContain("saveTask");
  });
});
describe("fact sheets", () => {
  it("are deterministic, schema-valid and match the golden", () => {
    const path = new URL("../goldens/tiny-ts.facts.json", import.meta.url);
    const text = `${JSON.stringify(book, null, 1)}\n`;
    if (process.env.CQ_UPDATE_FACT_GOLDENS === "1") writeFileSync(path, text);
    expect(`${JSON.stringify(buildFactBook(graph, world), null, 1)}\n`).toBe(text);
    expect(text).toBe(readFileSync(path, "utf8"));
  });
  it("independently re-derive callers, callees and tests from graph edges", () => {
    for (const s of book.symbols) {
      const callers = new Set(graph.edges.filter((e) => e.kind === "calls" && e.to === s.symbolId).map((e) => e.from));
      expect(new Set(s.callers.map(ref))).toEqual(callers);
      const callees = new Set(graph.edges.filter((e) => e.kind === "calls" && e.from === s.symbolId).map((e) => e.to));
      expect(new Set(s.callees.map((c) => c.symbolId))).toEqual(callees);
      const testers = new Set(graph.edges.filter((e) => e.kind === "tests" && e.to === s.symbolId).map((e) => e.from));
      const symbolTesters = [...testers].filter((id) => graph.symbols.some((x) => x.id === id));
      expect(new Set(s.testedBy.filter((t) => t.symbolId).map(ref))).toEqual(new Set(symbolTesters));
      for (const t of s.testedBy.filter((t) => !t.symbolId)) expect(testers.has(ref(t) ?? "")).toBe(true);
      expect(s.npcId).toBe(world.npcs.find((n) => n.symbolId === s.symbolId)?.id ?? null);
    }
    const slugify = sheet("slugify");
    expect(slugify.displayName).toBe("slugify()");
    expect(slugify.signature).toBe("function slugify(text: string): string");
    expect(slugify.range).toEqual({ startLine: 2, endLine: 8 });
    expect(slugify.testedBy.map((t) => t.path)).toEqual(Array(3).fill("tests/slugify.test.ts"));
  });
  it("clean doc markers, keep the first sentence verbatim and mask secrets", () => {
    expect(cleanDoc("/**\n * Loads a team.\n * Throws otherwise.\n */")).toBe("Loads a team.\nThrows otherwise.");
    expect(cleanDoc('"""Return the slug. Second."""')).toBe("Return the slug. Second.");
    expect(firstSentence("Return the slug. Second.")).toBe("Return the slug.");
    expect(firstSentence("Uses v1.2 rules\n@param x the input")).toBe("Uses v1.2 rules");
    expect(cleanDoc("/** api_key = abc123secret */")).toBe("api_key = [REDACTED]");
  });
});
