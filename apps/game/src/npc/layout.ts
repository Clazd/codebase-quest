import type { WorldMap, WorldModel, WorldPosition } from "@codebase-quest/shared";
import { walkable } from "../explore/navigation.ts";
import { npcSpots } from "./guide.ts";

export type NpcSpot = { npcId: string; symbolId: string; outdoor: boolean; x: number; y: number };
/**
 * Where each character stands on one map. Several characters can share a
 * WorldModel spot (all exported functions of a file greet outside its door), so
 * later ones step to the nearest free walkable tile within three tiles, never
 * onto a gate or door. Deterministic: sorted by NPC ID.
 */
export function layoutNpcs(world: WorldModel, map: WorldMap): NpcSpot[] {
  const blocked = new Set<string>();
  for (const t of world.transitions)
    for (const p of [t.from, t.to]) if (p.mapId === map.id) blocked.add(`${p.x},${p.y}`);
  const occupied = new Set<string>();
  const out: NpcSpot[] = [];
  const npcs = [...world.npcs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const npc of npcs)
    for (const spot of npcSpots(npc)) {
      if (spot.mapId !== map.id) continue;
      const place = free(map, spot, occupied, blocked);
      occupied.add(`${place.x},${place.y}`);
      out.push({ npcId: npc.id, symbolId: npc.symbolId, outdoor: spot === npc.outdoor, x: place.x, y: place.y });
    }
  return out;
}
function free(map: WorldMap, p: WorldPosition, occupied: Set<string>, blocked: Set<string>) {
  if (!occupied.has(`${p.x},${p.y}`)) return { x: p.x, y: p.y };
  for (let r = 1; r <= 3; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = p.x + dx,
          y = p.y + dy,
          key = `${x},${y}`;
        if (walkable(map, x, y) && !occupied.has(key) && !blocked.has(key)) return { x, y };
      }
  return { x: p.x, y: p.y };
}
