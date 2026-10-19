import type { CodeGraph, WorldModel, WorldPosition } from "@codebase-quest/shared";
import { inside, overlaps, reachable } from "./geometry.ts";
import { walkable } from "./tiles.ts";

export function worldProblems(world: WorldModel, graph?: CodeGraph): string[] {
  const problems: string[] = [];
  const maps = new Map(world.maps.map((m) => [m.id, m]));
  const buildings = new Map(world.buildings.map((b) => [b.id, b]));
  const districts = new Map(world.districts.map((d) => [d.id, d]));
  const primary = [
    ...world.regions,
    ...world.districts,
    ...world.buildings,
    ...world.interiors,
    ...world.npcs,
    ...world.monsters,
    ...world.bosses,
    ...world.dungeons,
    ...world.portals,
    ...world.roads,
    ...world.foreignLands,
    ...world.landmarks,
    ...world.transitions,
    ...world.maps,
  ];
  if (new Set(primary.map((x) => x.id)).size !== primary.length) problems.push("Duplicate world IDs");
  const validPosition = (p: WorldPosition) => {
    const map = maps.get(p.mapId);
    return map && walkable(map, p.x, p.y);
  };
  const reached = new Map<string, Uint8Array>();
  const pending: WorldPosition[] = [world.kingdom.gate];
  while (pending.length) {
    const start = pending.shift();
    if (!start || reached.has(start.mapId)) continue;
    const map = maps.get(start.mapId);
    if (!map) {
      problems.push("Transition references missing map");
      continue;
    }
    const cells = reachable(map, start);
    reached.set(map.id, cells);
    for (const t of world.transitions)
      for (const [from, to] of [
        [t.from, t.to],
        [t.to, t.from],
      ])
        if (from?.mapId === map.id && cells[from.y * map.width + from.x] && to) pending.push(to);
  }
  const isReached = (p: WorldPosition) => {
    const map = maps.get(p.mapId);
    return map && reached.get(p.mapId)?.[p.y * map.width + p.x] === 1;
  };
  for (const region of world.regions)
    if (!isReached(region.spawn) || !isReached(region.entrance)) problems.push(`Region ${region.id} disconnected`);
  for (const building of world.buildings) {
    const district = districts.get(building.districtId);
    if (!district || !inside(building.bounds, district.bounds))
      problems.push(`Building ${building.id} outside district`);
    if (!isReached(building.door)) problems.push(`Building ${building.id} unreachable`);
    if (!world.interiors.some((i) => i.id === building.interiorId && i.buildingId === building.id))
      problems.push(`Building ${building.id} missing interior`);
  }
  const byDistrict = new Map<string, typeof world.buildings>();
  for (const b of world.buildings) {
    const group = byDistrict.get(b.districtId) ?? [];
    group.push(b);
    byDistrict.set(b.districtId, group);
  }
  for (const group of byDistrict.values())
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i],
          b = group[j];
        if (a && b && overlaps(a.bounds, b.bounds)) problems.push(`Buildings ${a.id}, ${b.id} overlap`);
      }
  for (const npc of world.npcs)
    if (!buildings.has(npc.buildingId) || !isReached(npc.position) || (npc.outdoor && !validPosition(npc.outdoor)))
      problems.push(`NPC ${npc.id} has invalid placement`);
  for (const monster of world.monsters)
    if (!buildings.has(monster.buildingId) || !validPosition(monster.position))
      problems.push(`Monster ${monster.id} not on a walkable tile`);
  for (const boss of world.bosses) {
    const map = maps.get(boss.arena.mapId);
    if (!map) {
      problems.push("Missing arena map");
      continue;
    }
    const rect = boss.arena.bounds;
    if (rect.w !== 12 || rect.h !== 10) problems.push("Arena must be 12 by 10");
    for (let y = rect.y; y < rect.y + rect.h; y++)
      for (let x = rect.x; x < rect.x + rect.w; x++)
        if (!walkable(map, x, y)) problems.push(`Arena ${boss.id} blocked`);
    for (const building of world.buildings.filter((b) => b.door.mapId === map.id))
      if (overlaps(rect, building.bounds)) problems.push(`Arena ${boss.id} overlaps building`);
  }
  for (const transition of world.transitions)
    if (!validPosition(transition.from) || !validPosition(transition.to))
      problems.push(`Transition ${transition.id} blocked`);
  if (world.regions.length > 12) problems.push("Region cap exceeded");
  if (graph) {
    const fileCounts = new Map<string, number>();
    for (const b of world.buildings) for (const id of b.fileIds) fileCounts.set(id, (fileCounts.get(id) ?? 0) + 1);
    for (const file of graph.files)
      if (fileCounts.get(file.id) !== 1) problems.push(`File ${file.id} must map to exactly one building`);
    const npcCounts = new Map<string, number>();
    for (const n of world.npcs) npcCounts.set(n.symbolId, (npcCounts.get(n.symbolId) ?? 0) + 1);
    for (const symbol of graph.symbols)
      if (npcCounts.get(symbol.id) !== 1) problems.push(`Symbol ${symbol.id} must have one NPC spot`);
    const monsterCounts = new Map<string, number>();
    for (const m of world.monsters) monsterCounts.set(m.smellId, (monsterCounts.get(m.smellId) ?? 0) + 1);
    for (const smell of graph.smells)
      if (monsterCounts.get(smell.id) !== 1) problems.push(`Smell ${smell.id} must have one monster`);
    const exact = new Set(
      graph.edges.filter((e) => e.kind === "calls" && e.confidence === "exact").map((e) => `${e.from}:${e.to}`),
    );
    for (const dungeon of world.dungeons)
      for (let i = 1; i < dungeon.chainSymbolIds.length; i++)
        if (!exact.has(`${dungeon.chainSymbolIds[i - 1]}:${dungeon.chainSymbolIds[i]}`))
          problems.push(`Dungeon ${dungeon.id} lacks exact chain`);
  }
  return problems;
}
