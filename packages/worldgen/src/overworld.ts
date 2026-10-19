import type { CodeGraph, RoadSchema, WorldModel } from "@codebase-quest/shared";
import type { z } from "zod";
import { astar, treemap } from "./geometry.ts";
import { compare, type Rng, worldId } from "./random.ts";
import type { RegionChoice } from "./regions.ts";
import { border, makeMap, paint, rectangle } from "./tiles.ts";

type Pair = { from: string; to: string; weight: number; likely: boolean; guess: number };
export function buildOverworld(world: WorldModel, graph: CodeGraph, choices: RegionChoice[], rng: Rng): void {
  const map = makeMap("overworld", "maps/overworld.json", "overworld", 112, 80);
  border(map);
  world.maps.push(map);
  rectangle(map, { x: 100, y: 1, w: 11, h: 78 }, "water", 1);
  const fileRegions = new Map(choices.flatMap((c) => c.files.map((f) => [f.id, c.id] as const)));
  const symbols = new Map(graph.symbols.map((s) => [s.id, s.fileId]));
  const pairs = new Map<string, Pair>();
  for (let i = 0; i < choices.length; i++)
    for (let j = i + 1; j < choices.length; j++) {
      const from = choices[i]?.id ?? "",
        to = choices[j]?.id ?? "";
      pairs.set([from, to].sort().join(":"), { from, to, weight: 0, likely: false, guess: 0 });
    }
  for (const edge of graph.edges.filter((e) => e.kind === "calls" || e.kind === "imports")) {
    const from = fileRegions.get(symbols.get(edge.from) ?? edge.from),
      to = fileRegions.get(symbols.get(edge.to) ?? edge.to);
    if (!from || !to || from === to) continue;
    const pair = pairs.get([from, to].sort().join(":"));
    if (!pair) continue;
    if (edge.confidence === "guess") pair.guess++;
    else {
      pair.weight++;
      if (edge.confidence === "likely") pair.likely = true;
    }
  }
  const bounds = treemap(
    choices.map((c) => Math.sqrt(Math.max(1, c.loc))),
    { x: 4, y: 4, w: 90, h: 72 },
  );
  choices.forEach((choice, i) => {
    const rect = bounds[i];
    if (!rect) throw new Error("Missing region rectangle");
    const entrance = { mapId: map.id, x: Math.floor(rect.x + rect.w / 2), y: Math.floor(rect.y + rect.h / 2) };
    world.regions.push({
      id: choice.id,
      name: choice.name,
      path: choice.path,
      biome: choice.biome,
      loc: choice.loc,
      fileIds: choice.files.map((f) => f.id),
      districtIds: [],
      bounds: rect,
      mapId: worldId("map:region", choice.id),
      entrance,
      spawn: { mapId: worldId("map:region", choice.id), x: 2, y: 2 },
    });
    const connected = [...pairs.values()]
      .filter((p) => p.from === choice.id || p.to === choice.id)
      .reduce((n, p) => n + p.weight, 0);
    for (let y = rect.y; y < rect.y + rect.h; y++)
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        if (x < 1 || y < 1 || x >= 100 || y >= 79) continue;
        const edge = x === rect.x || y === rect.y || x === rect.x + rect.w - 1 || y === rect.y + rect.h - 1;
        if (edge) {
          if (connected >= 3) paint(map, x, y, "water", 1);
          else paint(map, x, y, rng() < 0.2 ? "rock" : "tree", 0);
        } else if (
          (x === rect.x + 1 || y === rect.y + 1 || x === rect.x + rect.w - 2 || y === rect.y + rect.h - 2) &&
          rng() < 0.22
        )
          paint(map, x, y, connected >= 3 ? "water" : "tree", connected >= 3 ? 1 : 0);
        else if (choice.biome === "mines" && rng() < 0.02) paint(map, x, y, "rock", 1);
        else if (choice.biome === "port" && rng() < 0.025) paint(map, x, y, "sand");
      }
    paint(map, entrance.x, entrance.y, "plaza");
  });
  const ranked = [...pairs.values()].sort(
    (a, b) => b.weight - a.weight || compare(`${a.from}:${a.to}`, `${b.from}:${b.to}`),
  );
  const parents = new Map(choices.map((c) => [c.id, c.id]));
  const root = (id: string): string => {
    const p = parents.get(id);
    if (!p || p === id) return id;
    const r = root(p);
    parents.set(id, r);
    return r;
  };
  const selected: Pair[] = [];
  for (const pair of ranked)
    if (root(pair.from) !== root(pair.to)) {
      parents.set(root(pair.from), root(pair.to));
      selected.push(pair);
    }
  selected.push(
    ...ranked.filter((p) => p.weight > 0 && !selected.includes(p)).slice(0, Math.floor(choices.length / 2)),
  );
  function road(pair: Pair, uncertain = false) {
    const from = world.regions.find((r) => r.id === pair.from),
      to = world.regions.find((r) => r.id === pair.to);
    if (!from || !to) return;
    const path = astar(map, from.entrance, to.entrance);
    const width = uncertain ? 1 : pair.weight >= 8 ? 3 : pair.weight >= 3 ? 2 : 1;
    for (const p of path) {
      if (uncertain) {
        map.flickering[p.y * map.width + p.x] = 1;
        if (map.collision[p.y * map.width + p.x] === 1)
          paint(map, p.x, p.y, map.ground[p.y * map.width + p.x] === "water" ? "bridge" : "path");
        continue;
      }
      for (let dy = -Math.floor((width - 1) / 2); dy <= Math.ceil((width - 1) / 2); dy++)
        for (let dx = -Math.floor((width - 1) / 2); dx <= Math.ceil((width - 1) / 2); dx++) {
          const x = p.x + dx,
            y = p.y + dy;
          const water = map.ground[y * map.width + x] === "water";
          paint(map, x, y, water ? "bridge" : width > 1 ? "road-wide" : "road");
        }
    }
    const item: z.infer<typeof RoadSchema> = {
      id: worldId("road", `${pair.from}:${pair.to}:${uncertain}`),
      from: pair.from,
      to: pair.to,
      weight: uncertain ? pair.guess : pair.weight,
      width,
      confidence: uncertain ? "guess" : pair.likely ? "likely" : "exact",
      reason: uncertain ? "uncertain" : pair.weight ? "code-edges" : "connectivity",
      tiles: path,
    };
    world.roads.push(item);
  }
  for (const pair of selected) road(pair);
  for (const pair of ranked.filter((p) => p.guess > 0 && p.weight === 0)) road(pair, true);
  const main = graph.entryPoints.find((e) => e.kind === "main") ?? graph.entryPoints[0];
  const gateRegion = world.regions.find((r) => r.fileIds.includes(main?.fileId ?? "")) ?? world.regions[0];
  if (!gateRegion) throw new Error("World has no region");
  world.kingdom.gate = { ...gateRegion.entrance, x: Math.max(1, gateRegion.entrance.x - 1) };
  paint(map, world.kingdom.gate.x, world.kingdom.gate.y, "plaza");
  world.landmarks.push({
    id: worldId("landmark", "gate"),
    type: "gate",
    label: "The Gate",
    position: world.kingdom.gate,
  });
  const external = graph.modules
    .filter((m) => m.kind === "external")
    .map((m) => ({ module: m, count: graph.edges.filter((e) => e.kind === "imports" && e.to === m.id).length }))
    .sort((a, b) => b.count - a.count || compare(a.module.id, b.module.id))
    .slice(0, 8);
  external.forEach(({ module }, i) => {
    const position = { mapId: map.id, x: 105, y: 8 + i * 8 };
    rectangle(map, { x: 104, y: position.y - 1, w: 3, h: 3 }, "sand");
    world.foreignLands.push({
      id: worldId("foreign", module.id),
      dependencyId: module.id,
      label: module.name,
      position,
      fogged: true,
    });
  });
  for (const smell of graph.smells.filter((s) => s.kind === "circular-dependency")) {
    const affected = world.regions.filter((r) => smell.fileIds.some((id) => r.fileIds.includes(id)));
    if (affected.length > 1) {
      const p = affected[0]?.entrance;
      if (p)
        world.landmarks.push({
          id: worldId("whirlpool", smell.id),
          type: "whirlpool",
          label: "Circular imports",
          position: { ...p, x: p.x + 1 },
        });
    }
  }
}
