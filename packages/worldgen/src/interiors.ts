import type { Building, CodeGraph, Interior, SymbolNode, WorldModel, WorldPosition } from "@codebase-quest/shared";
import { compare, worldId } from "./random.ts";
import { border, makeMap, paint, rectangle, walkable } from "./tiles.ts";

export function buildInterior(world: WorldModel, graph: CodeGraph, building: Building, symbols: SymbolNode[]): void {
  const classes = symbols.filter((s) => s.kind === "class");
  const base = { hut: 1, house: 2, manor: 4, castle: 6 }[building.size];
  const count = Math.max(base, classes.length);
  const columns = Math.min(3, count),
    rows = Math.ceil(count / columns);
  const width = Math.max(20, columns * 8 + 4),
    height = rows * 8 + 10;
  const mapId = worldId("map:interior", building.id);
  const map = makeMap(
    mapId,
    `maps/interior-${building.interiorId}.json`,
    "interior",
    width,
    height,
    "wildlands",
    "floor",
  );
  border(map);
  const entrance = { mapId, x: 2, y: 2 };
  const rooms: Interior["rooms"] = [];
  for (let i = 0; i < count; i++) {
    const room = { x: 3 + (i % columns) * 8, y: 8 + Math.floor(i / columns) * 8, w: 6, h: 6 };
    rectangle(map, room, "wall", 1);
    rectangle(map, { x: room.x + 1, y: room.y + 1, w: room.w - 2, h: room.h - 2 }, "floor");
    paint(map, room.x + Math.floor(room.w / 2), room.y, "door");
    rooms.push({ id: worldId("room", `${building.id}:${i}`), classSymbolId: classes[i]?.id ?? null, bounds: room });
  }
  world.maps.push(map);
  world.interiors.push({
    id: building.interiorId,
    buildingId: building.id,
    mapId,
    template: `${building.size}-${count}-rooms`,
    entrance,
    rooms,
  });
  world.transitions.push({
    id: worldId("transition:interior", building.id),
    kind: "interior",
    from: building.door,
    to: entrance,
    label: building.label,
  });
  const occupied = new Set<string>();
  const byId = new Map(graph.symbols.map((s) => [s.id, s]));
  const regionMap = world.maps.find((m) => m.id === building.door.mapId);
  for (const symbol of [...symbols].sort((a, b) => Number(b.exported) - Number(a.exported) || compare(a.id, b.id))) {
    let owner: SymbolNode | undefined = symbol;
    while (owner && owner.kind !== "class") owner = owner.parentId ? byId.get(owner.parentId) : undefined;
    const room = rooms.find((r) => r.classSymbolId === owner?.id);
    const pool: WorldPosition[] = [];
    if (room)
      for (let y = room.bounds.y + 1; y < room.bounds.y + room.bounds.h - 1; y++)
        for (let x = room.bounds.x + 1; x < room.bounds.x + room.bounds.w - 1; x++) pool.push({ mapId, x, y });
    else for (let y = 2; y <= 6; y++) for (let x = 3; x < width - 2; x++) pool.push({ mapId, x, y });
    const key = room?.id ?? "hall";
    const crowdSpot = pool.pop() ?? entrance;
    if (!symbol.exported && !room) pool.reverse();
    const free = pool.find((p) => !occupied.has(`${p.x}:${p.y}`));
    const position = free ?? crowdSpot;
    if (free) occupied.add(`${free.x}:${free.y}`);
    const crowdId = free ? null : worldId("crowd", `${building.id}:${key}`);
    let outdoor: WorldPosition | null = null;
    if (symbol.exported && regionMap) {
      outdoor = { ...building.door, x: building.door.x + 1 };
      if (!walkable(regionMap, outdoor.x, outdoor.y)) outdoor = { ...building.door };
    }
    world.npcs.push({
      id: worldId("npc", symbol.id),
      symbolId: symbol.id,
      buildingId: building.id,
      position,
      outdoor,
      crowdId,
    });
  }
}
