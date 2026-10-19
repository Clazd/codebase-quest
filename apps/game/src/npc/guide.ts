import type { NpcPlacement, WorldMap, WorldModel, WorldPosition } from "@codebase-quest/shared";
import { walkable } from "../explore/navigation.ts";

type Hop = { to: string; at: WorldPosition; label: string };
/** Map adjacency from transitions in both directions. */
export function mapGraph(world: WorldModel): Map<string, Hop[]> {
  const graph = new Map<string, Hop[]>();
  const add = (from: string, hop: Hop) => graph.set(from, [...(graph.get(from) ?? []), hop]);
  for (const t of world.transitions) {
    add(t.from.mapId, { to: t.to.mapId, at: t.from, label: t.label });
    add(t.to.mapId, { to: t.from.mapId, at: t.to, label: `Exit ${t.label}` });
  }
  return graph;
}
/** Breadth-first number of map transitions between two maps (Infinity if unreachable). */
export function hops(graph: Map<string, Hop[]>, from: string, to: string): number {
  if (from === to) return 0;
  const seen = new Set([from]);
  let frontier = [from];
  for (let depth = 1; frontier.length; depth++) {
    const next: string[] = [];
    for (const map of frontier)
      for (const hop of graph.get(map) ?? []) {
        if (hop.to === to) return depth;
        if (!seen.has(hop.to)) {
          seen.add(hop.to);
          next.push(hop.to);
        }
      }
    frontier = next;
  }
  return Number.POSITIVE_INFINITY;
}
/**
 * The next place to walk toward `target`: the target itself on the same map, or
 * the gate/door on this map that starts the shortest route of map transitions.
 */
export function nextWaypoint(
  graph: Map<string, Hop[]>,
  from: WorldPosition,
  target: WorldPosition,
): { position: WorldPosition; label: string | null } | null {
  if (from.mapId === target.mapId) return { position: target, label: null };
  const options = (graph.get(from.mapId) ?? [])
    .map((hop) => ({ hop, cost: hops(graph, hop.to, target.mapId) }))
    .filter((o) => Number.isFinite(o.cost))
    .sort(
      (a, b) =>
        a.cost - b.cost ||
        Math.hypot(a.hop.at.x - from.x, a.hop.at.y - from.y) - Math.hypot(b.hop.at.x - from.x, b.hop.at.y - from.y),
    );
  const best = options[0]?.hop;
  return best ? { position: best.at, label: best.label } : null;
}
/** Where an NPC can be met: outdoors (exported symbols) and at home inside its building. */
export function npcSpots(npc: NpcPlacement): WorldPosition[] {
  return npc.outdoor ? [npc.outdoor, npc.position] : [npc.position];
}
/** The NPC spot with the fewest map transitions from here (outdoor wins ties). */
export function nearestSpot(graph: Map<string, Hop[]>, npc: NpcPlacement, from: WorldPosition): WorldPosition {
  const spots = npcSpots(npc).map((p) => ({ p, cost: hops(graph, from.mapId, p.mapId) }));
  spots.sort((a, b) => a.cost - b.cost);
  return spots[0]?.p ?? npc.position;
}
/** A walkable tile next to `p`, so the player stands beside a character rather than on it. */
export function standBeside(map: WorldMap, p: WorldPosition): WorldPosition {
  for (const [dx, dy] of [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, 1],
  ] as const)
    if (walkable(map, p.x + dx, p.y + dy)) return { mapId: p.mapId, x: p.x + dx, y: p.y + dy };
  return p;
}
