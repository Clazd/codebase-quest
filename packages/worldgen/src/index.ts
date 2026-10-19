import { type CodeGraph, CodeGraphSchema, type WorldModel, WorldModelSchema } from "@codebase-quest/shared";
import { buildRegion } from "./buildings.ts";
import { buildInterior } from "./interiors.ts";
import { buildOverworld } from "./overworld.ts";
import { placeMarkers } from "./placements.ts";
import { compare, hash, seededRng } from "./random.ts";
import { chooseRegions } from "./regions.ts";
import { placeholderTheme } from "./tiles.ts";
import { worldProblems } from "./validate.ts";

export { renderSvg, serializeWorld, tiledMap, writeWorld } from "./output.ts";
export { worldProblems } from "./validate.ts";

export function generate(input: CodeGraph, options: { seed?: string } = {}): WorldModel {
  const graph = CodeGraphSchema.parse(input);
  for (const key of [
    "files",
    "symbols",
    "edges",
    "modules",
    "smells",
    "entryPoints",
    "testFacts",
    "diagnostics",
  ] as const)
    graph[key].sort((a, b) => compare(a.id, b.id));
  const seed = options.seed ? hash(options.seed) : hash(graph.repo.commit ?? hash(JSON.stringify(graph)));
  const rng = seededRng(seed);
  const dates = graph.files.flatMap((f) => (f.git ? [Date.parse(f.git.lastCommitAt)] : [])).filter(Number.isFinite);
  const world: WorldModel = {
    schemaVersion: 1,
    seed,
    sourceCommit: graph.repo.commit,
    referenceDate: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
    kingdom: { name: graph.repo.name, overworldMap: "overworld", gate: { mapId: "overworld", x: 1, y: 1 } },
    theme: placeholderTheme(),
    regions: [],
    districts: [],
    buildings: [],
    interiors: [],
    npcs: [],
    monsters: [],
    bosses: [],
    dungeons: [],
    portals: [],
    roads: [],
    foreignLands: [],
    landmarks: [],
    transitions: [],
    maps: [],
    aggregation: [],
  };
  const choices = chooseRegions(graph);
  buildOverworld(world, graph, choices, rng);
  for (const choice of choices) {
    const region = world.regions.find((r) => r.id === choice.id);
    if (!region) throw new Error("Missing region");
    buildRegion(world, graph, choice, region);
  }
  const byFile = new Map<string, typeof graph.symbols>();
  for (const symbol of graph.symbols) {
    const group = byFile.get(symbol.fileId) ?? [];
    group.push(symbol);
    byFile.set(symbol.fileId, group);
  }
  for (const building of world.buildings)
    buildInterior(
      world,
      graph,
      building,
      building.fileIds.flatMap((id) => byFile.get(id) ?? []),
    );
  placeMarkers(world, graph, rng);
  for (const key of [
    "regions",
    "districts",
    "buildings",
    "interiors",
    "npcs",
    "monsters",
    "bosses",
    "dungeons",
    "portals",
    "roads",
    "foreignLands",
    "landmarks",
    "transitions",
    "maps",
  ] as const)
    world[key].sort((a, b) => compare(a.id, b.id));
  world.aggregation.sort((a, b) => compare(a.buildingId, b.buildingId));
  const checked = WorldModelSchema.parse(world);
  const problems = worldProblems(checked, graph);
  if (problems.length) throw new Error(`World invariants failed: ${problems.slice(0, 10).join("; ")}`);
  return checked;
}
