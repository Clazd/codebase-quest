import type { WorldMap } from "@codebase-quest/shared";
import { required } from "./required.ts";
export const BINDINGS = {
  up: ["ArrowUp", "w", "W"],
  down: ["ArrowDown", "s", "S"],
  left: ["ArrowLeft", "a", "A"],
  right: ["ArrowRight", "d", "D"],
  run: ["Shift"],
  interact: ["e", "E", " ", "Enter"],
  map: ["m", "M"],
  debug: ["F3"],
  pause: ["Escape"],
} as const;
export type Point = { x: number; y: number };
export const walkable = (map: WorldMap, x: number, y: number) =>
  x >= 0 && y >= 0 && x < map.width && y < map.height && map.collision[y * map.width + x] === 0;
export function direction(x: number, y: number): Point {
  const length = Math.hypot(x, y);
  return length > 1 ? { x: x / length, y: y / length } : { x, y };
}
/** Cardinal A* on collision data. Diagonals are deliberately excluded to avoid corner cutting. */
export function findPath(map: WorldMap, start: Point, goal: Point): Point[] {
  if (!walkable(map, goal.x, goal.y) || !walkable(map, start.x, start.y)) return [];
  const index = (p: Point) => p.y * map.width + p.x;
  const first = index(start),
    last = index(goal);
  const cost = new Map([[first, 0]]),
    previous = new Map<number, number>();
  const heap: { id: number; score: number }[] = [];
  function push(id: number, score: number) {
    const item = { id, score };
    let i = heap.length;
    heap.push(item);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (required(heap[p]).score <= score) break;
      heap[i] = required(heap[p]);
      i = p;
    }
    heap[i] = item;
  }
  function pop() {
    const top = required(heap[0]);
    const tail = required(heap.pop());
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let c = i * 2 + 1;
        if (heap[c + 1] && required(heap[c + 1]).score < required(heap[c]).score) c++;
        if (required(heap[c]).score >= tail.score) break;
        heap[i] = required(heap[c]);
        i = c;
      }
      heap[i] = tail;
    }
    return top;
  }
  const closed = new Set<number>();
  push(first, 0);
  while (heap.length) {
    const { id } = pop();
    if (closed.has(id)) continue;
    if (id === last) {
      const path: Point[] = [];
      for (let n = last; n !== first; n = required(previous.get(n)))
        path.push({ x: n % map.width, y: Math.floor(n / map.width) });
      return path.reverse();
    }
    closed.add(id);
    const x = id % map.width,
      y = Math.floor(id / map.width);
    for (const [nx, ny] of [
      [x + 1, y],
      [x, y + 1],
      [x - 1, y],
      [x, y - 1],
    ] as [number, number][]) {
      if (!walkable(map, nx, ny)) continue;
      const next = ny * map.width + nx,
        distance = required(cost.get(id)) + 1;
      if (distance >= (cost.get(next) ?? Infinity)) continue;
      cost.set(next, distance);
      previous.set(next, id);
      push(next, distance + Math.abs(nx - goal.x) + Math.abs(ny - goal.y));
    }
  }
  return [];
}
/** Small substeps plus axis separation prevent tunneling and allow sliding along walls. */
export function move(map: WorldMap, at: Point, velocity: Point, seconds: number): Point {
  const out = { ...at },
    steps = Math.max(1, Math.ceil((Math.max(Math.abs(velocity.x), Math.abs(velocity.y)) * seconds) / 3));
  const fits = (x: number, y: number) =>
    [-3, 3].every((dx) => [-3, 3].every((dy) => walkable(map, Math.floor((x + dx) / 16), Math.floor((y + dy) / 16))));
  for (let i = 0; i < steps; i++) {
    const x = out.x + (velocity.x * seconds) / steps,
      y = out.y + (velocity.y * seconds) / steps;
    if (fits(x, out.y)) out.x = x;
    if (fits(out.x, y)) out.y = y;
  }
  return out;
}
export function visibleChunks(
  width: number,
  height: number,
  view: { x: number; y: number; width: number; height: number },
  size = 64,
): string[] {
  const result: string[] = [];
  const left = Math.max(0, Math.floor(view.x / 16 / size) - 1),
    top = Math.max(0, Math.floor(view.y / 16 / size) - 1);
  for (
    let y = top;
    y <= Math.min(Math.ceil(height / size) - 1, Math.floor((view.y + view.height) / 16 / size) + 1);
    y++
  )
    for (
      let x = left;
      x <= Math.min(Math.ceil(width / size) - 1, Math.floor((view.x + view.width) / 16 / size) + 1);
      x++
    )
      result.push(`${x},${y}`);
  return result;
}
