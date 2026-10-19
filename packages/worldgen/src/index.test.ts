import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { type CodeGraph, CodeGraphSchema, WorldModelSchema } from "@codebase-quest/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { analyze } from "../../analyzer/src/index.ts";
import { generate, renderSvg, serializeWorld, tiledMap, worldProblems, writeWorld } from "./index.ts";
import { syntheticGraph } from "./synthetic.ts";
import { TiledMapSchema } from "./tiledSchema.ts";

const names = ["tiny-ts", "tiny-py", "smelly-ts", "poisoned-ts", "weird-repo", "empty-repo"];
const graphs = new Map<string, CodeGraph>();
beforeAll(async () => {
  for (const name of names)
    graphs.set(
      name,
      await analyze(fileURLToPath(new URL(`../../../fixtures/repos/${name}`, import.meta.url)), { workers: 1 }),
    );
}, 120_000);
const graph = (name: string) => {
  const g = graphs.get(name);
  if (!g) throw new Error(name);
  return g;
};
describe("world generation", () => {
  it("marks uncertain roads separately and preserves biome/monorepo identity", () => {
    const g = syntheticGraph(4, 4);
    const world = generate(g);
    expect(world.roads.some((r) => r.confidence === "guess" && r.reason === "uncertain")).toBe(true);
    const over = world.maps.find((m) => m.id === "overworld");
    expect(over?.flickering.some(Boolean)).toBe(true);
    const monorepo = syntheticGraph(3, 3);
    monorepo.files.forEach((f, i) => {
      f.path = `packages/pkg-${i}/src/index.ts`;
    });
    expect(
      generate(monorepo)
        .regions.map((r) => r.path)
        .sort(),
    ).toEqual(["packages/pkg-0", "packages/pkg-1", "packages/pkg-2"]);
  });
  for (const name of names)
    it(`${name}: invariants and deterministic outputs`, () => {
      const g = graph(name),
        a = generate(g),
        b = generate(g);
      expect(WorldModelSchema.safeParse(a).success).toBe(true);
      expect(worldProblems(a, g)).toEqual([]);
      expect(serializeWorld(a)).toBe(serializeWorld(b));
      for (let i = 0; i < a.maps.length; i++) {
        const first = a.maps[i],
          second = b.maps[i];
        if (first && second) {
          expect(TiledMapSchema.safeParse(tiledMap(a, first)).success).toBe(true);
          expect(JSON.stringify(tiledMap(a, first))).toBe(JSON.stringify(tiledMap(b, second)));
          expect(renderSvg(a, first)).toBe(renderSvg(b, second));
        }
      }
    });
  for (const name of ["tiny-ts", "tiny-py"])
    it(`${name}: world and SVG goldens`, () => {
      const w = generate(graph(name));
      const path = new URL(`../goldens/${name}.world.json`, import.meta.url);
      const svgPath = new URL(`../goldens/${name}.overworld.svg`, import.meta.url);
      const map = w.maps.find((m) => m.id === "overworld");
      if (!map) throw new Error("Missing overworld");
      if (process.env.CQ_UPDATE_WORLD_GOLDENS === "1") {
        writeFileSync(path, serializeWorld(w));
        writeFileSync(svgPath, renderSvg(w, map));
        if (name === "tiny-ts")
          writeFileSync(
            new URL("../goldens/tiny-ts.overworld.tiled.json", import.meta.url),
            `${JSON.stringify(tiledMap(w, map))}\n`,
          );
      }
      expect(serializeWorld(w)).toBe(readFileSync(path, "utf8"));
      expect(renderSvg(w, map)).toBe(readFileSync(svgPath, "utf8"));
    });
  for (let seed = 0; seed < 50; seed++)
    it(`synthetic seed ${seed}: all invariants`, () => {
      const g = syntheticGraph(16 + (seed % 17), 3 + (seed % 4), 20 + (seed % 200));
      expect(worldProblems(generate(g, { seed: `fuzz-${seed}` }), g)).toEqual([]);
    });
  it("scales to 5,000 files in 40 folders under ten seconds", { timeout: 30_000 }, () => {
    const g = syntheticGraph(5000, 40);
    const start = performance.now();
    const w = generate(g);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(10_000);
    expect(w.regions.length).toBeLessThanOrEqual(12);
    expect(w.aggregation.length).toBeGreaterThan(0);
    expect(worldProblems(w, g)).toEqual([]);
    console.log(
      `worldgen stress: ${elapsed.toFixed(0)} ms; ${w.regions.length} regions, ${w.buildings.length} buildings, ${w.maps.length} maps`,
    );
  });
  it("writes byte-identical complete output directories", () => {
    const a = mkdtempSync(join(tmpdir(), "cq-world-a-")),
      b = mkdtempSync(join(tmpdir(), "cq-world-b-"));
    const w = generate(graph("tiny-ts"));
    writeWorld(w, a);
    writeWorld(w, b);
    const files = (root: string) =>
      readdirSync(root, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => relative(root, join(e.parentPath, e.name)))
        .sort();
    expect(files(a)).toEqual(files(b));
    for (const path of files(a)) expect(readFileSync(join(a, path))).toEqual(readFileSync(join(b, path)));
  });
  it("escapes repository labels in SVG and emits exact chain dungeon markers", () => {
    const g = CodeGraphSchema.parse(graph("tiny-ts"));
    g.repo.name = '<script>alert("x")</script>';
    const w = generate(g);
    const map = w.maps.find((m) => m.id === "overworld");
    if (!map) throw new Error("missing map");
    expect(renderSvg(w, map)).not.toContain("<script>");
    expect(renderSvg(w, map)).toContain("&lt;script&gt;");
    const names = new Map(g.symbols.map((s) => [s.id, s.name]));
    expect(
      w.dungeons.some((d) => names.get(d.chainSymbolIds[0] ?? "") === "shareTask" && d.chainSymbolIds.length >= 4),
    ).toBe(true);
  });
});
