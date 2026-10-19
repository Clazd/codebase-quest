import type { CodeGraph, WorldMap, WorldModel, WorldPosition } from "@codebase-quest/shared";
import { compare, type Rng, worldId } from "./random.ts";
import { paint, walkable } from "./tiles.ts";

const spot = (map: WorldMap, position: WorldPosition): WorldPosition => {
  for (const [dx = 0, dy = 0] of [
    [1, 1],
    [0, 1],
    [-1, 1],
    [0, 0],
    [2, 1],
  ])
    if (walkable(map, position.x + dx, position.y + dy)) return { ...position, x: position.x + dx, y: position.y + dy };
  return position;
};
export function placeMarkers(world: WorldModel, graph: CodeGraph, rng: Rng): void {
  const byFile = new Map(world.buildings.flatMap((b) => b.fileIds.map((id) => [id, b] as const)));
  const maps = new Map(world.maps.map((m) => [m.id, m]));
  for (const smell of graph.smells) {
    const building = byFile.get(smell.fileIds[0] ?? "");
    const map = building ? maps.get(building.door.mapId) : null;
    if (!building || !map) throw new Error("Smell has no world building");
    world.monsters.push({
      id: worldId("monster", smell.id),
      smellId: smell.id,
      kind: smell.kind,
      buildingId: building.id,
      regionId: building.regionId,
      position: spot(map, building.door),
      patrolRadius: 3 + Math.floor(rng() * 4),
      level: Math.max(1, Math.ceil(smell.severity * 2)),
    });
  }
  for (const entry of graph.entryPoints) {
    const building = byFile.get(entry.fileId),
      map = building ? maps.get(building.door.mapId) : null;
    if (!building || !map) continue;
    const position = spot(map, building.door);
    const region = world.regions.find((r) => r.id === building.regionId);
    if (region?.biome === "port") paint(map, position.x, position.y, "dock");
    world.portals.push({
      id: worldId("portal", entry.id),
      entryPointId: entry.id,
      label: entry.label,
      regionId: building.regionId,
      position,
    });
  }
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges.filter((e) => e.kind === "calls" && e.confidence === "exact")) {
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge.to);
    adjacency.set(edge.from, list);
  }
  const symbols = new Map(graph.symbols.map((s) => [s.id, s]));
  function chain(start: string, path: string[]): string[] | null {
    if (path.length === 4) return path;
    for (const next of [...(adjacency.get(start) ?? [])].sort(compare))
      if (symbols.has(next) && !path.includes(next)) {
        const found = chain(next, [...path, next]);
        if (found) return found;
      }
    return null;
  }
  for (const symbol of graph.symbols) {
    const found = chain(symbol.id, [symbol.id]);
    if (!found) continue;
    const building = byFile.get(symbol.fileId),
      map = building ? maps.get(building.door.mapId) : null;
    if (building && map)
      world.dungeons.push({
        id: worldId("dungeon", symbol.id),
        chainSymbolIds: found,
        regionId: building.regionId,
        position: spot(map, building.door),
      });
  }
  const gateRegion =
    world.regions.find((r) => r.entrance.x === world.kingdom.gate.x + 1 && r.entrance.y === world.kingdom.gate.y) ??
    world.regions[0];
  if (!gateRegion) return;
  const bazaar = world.regions.find((r) => r.biome === "bazaar") ?? gateRegion;
  for (const [type, label, region, offset] of [
    ["quest-board", "Quest Board", gateRegion, 2],
    ["chronicle-stone", "Chronicle Stone", gateRegion, 3],
    ["hall-of-heroes", "Hall of Heroes", gateRegion, 4],
    ["bazaar-shop", "Bazaar Shop", bazaar, 5],
  ] as const) {
    const position = { mapId: region.mapId, x: 2, y: 2 + offset };
    const map = maps.get(region.mapId);
    if (map) paint(map, position.x, position.y, "plaza");
    world.landmarks.push({ id: worldId("landmark", type), type, label, position });
  }
}
