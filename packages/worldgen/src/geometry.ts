import type { Rect, WorldMap } from "@codebase-quest/shared";
import { walkable } from "./tiles.ts";
export const inside = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;
export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Squarified treemap, following the worst-aspect-ratio row criterion. */
export function treemap(weights: number[], bounds: Rect): Rect[] {
  if (!weights.length) return [];
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const areas = weights.map((w) => (w / total) * bounds.w * bounds.h);
  const output: Rect[] = [];
  const box = { ...bounds };
  let row: number[] = [];
  let index = 0;
  const worst = (values: number[], side: number) => {
    if (!values.length) return Infinity;
    const sum = values.reduce((a, b) => a + b, 0);
    return Math.max(
      (side * side * Math.max(...values)) / (sum * sum),
      (sum * sum) / (side * side * Math.min(...values)),
    );
  };
  function finish(values: number[]) {
    const sum = values.reduce((a, b) => a + b, 0);
    const vertical = box.w >= box.h;
    const thickness = sum / (vertical ? box.h : box.w);
    let offset = vertical ? box.y : box.x;
    for (const area of values) {
      const length = area / thickness;
      const left = vertical ? box.x : offset;
      const top = vertical ? offset : box.y;
      const right = vertical ? box.x + thickness : offset + length;
      const bottom = vertical ? offset + length : box.y + thickness;
      output.push({
        x: Math.round(left),
        y: Math.round(top),
        w: Math.max(1, Math.round(right) - Math.round(left)),
        h: Math.max(1, Math.round(bottom) - Math.round(top)),
      });
      offset += length;
    }
    if (vertical) {
      box.x += thickness;
      box.w -= thickness;
    } else {
      box.y += thickness;
      box.h -= thickness;
    }
  }
  while (index < areas.length) {
    const next = areas[index] ?? 1;
    const side = Math.min(box.w, box.h);
    if (!row.length || worst([...row, next], side) <= worst(row, side)) {
      row.push(next);
      index++;
    } else {
      finish(row);
      row = [];
    }
  }
  if (row.length) finish(row);
  return output;
}

/** Binary heap A*: stable neighbor order and ordinal tie breaks. */
export function astar(
  map: WorldMap,
  start: { x: number; y: number },
  end: { x: number; y: number },
): { x: number; y: number }[] {
  const size = map.width * map.height;
  const distance = new Float64Array(size).fill(Infinity);
  const previous = new Int32Array(size).fill(-1);
  const first = start.y * map.width + start.x,
    last = end.y * map.width + end.x;
  let serial = 0;
  const heap: { index: number; score: number; order: number }[] = [];
  const less = (a: (typeof heap)[number], b: (typeof heap)[number]) =>
    a.score < b.score || (a.score === b.score && a.order < b.order);
  const push = (index: number, score: number) => {
    const item = { index, score, order: serial++ };
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      const parent = heap[p];
      if (!parent || !less(item, parent)) break;
      heap[i] = parent;
      i = p;
    }
    heap[i] = item;
  };
  const pop = () => {
    const root = heap[0];
    const tail = heap.pop();
    if (heap.length && tail) {
      let i = 0;
      while (true) {
        let child = i * 2 + 1;
        if (child >= heap.length) break;
        const a = heap[child],
          b = heap[child + 1];
        if (a && b && less(b, a)) child++;
        const next = heap[child];
        if (!next || !less(next, tail)) break;
        heap[i] = next;
        i = child;
      }
      heap[i] = tail;
    }
    return root;
  };
  distance[first] = 0;
  push(first, 0);
  const closed = new Uint8Array(size);
  while (heap.length) {
    const current = pop();
    if (!current) break;
    const at = current.index;
    if (closed[at]) continue;
    if (at === last) {
      const path: { x: number; y: number }[] = [];
      for (let i = at; i !== -1; i = previous[i] ?? -1) path.push({ x: i % map.width, y: Math.floor(i / map.width) });
      return path.reverse();
    }
    closed[at] = 1;
    const x = at % map.width,
      y = Math.floor(at / map.width);
    for (const [nx = -1, ny = -1] of [
      [x + 1, y],
      [x, y + 1],
      [x - 1, y],
      [x, y - 1],
    ]) {
      const next = ny * map.width + nx;
      const tile = map.ground[next];
      if (nx < 1 || ny < 1 || nx >= map.width - 1 || ny >= map.height - 1 || tile === "rock" || tile === "wall")
        continue;
      const cost = tile === "water" ? 10 : tile === "tree" ? 3 : 1;
      const candidate = (distance[at] ?? Infinity) + cost;
      if (candidate < (distance[next] ?? Infinity)) {
        distance[next] = candidate;
        previous[next] = at;
        push(next, candidate + Math.abs(nx - end.x) + Math.abs(ny - end.y));
      }
    }
  }
  throw new Error("No overworld road path exists");
}
export function reachable(map: WorldMap, start: { x: number; y: number }): Uint8Array {
  const seen = new Uint8Array(map.width * map.height);
  if (!walkable(map, start.x, start.y)) return seen;
  const queue = new Int32Array(seen.length);
  let head = 0,
    tail = 0;
  const first = start.y * map.width + start.x;
  queue[tail++] = first;
  seen[first] = 1;
  while (head < tail) {
    const at = queue[head++] ?? 0;
    const x = at % map.width,
      y = Math.floor(at / map.width);
    for (const [nx = -1, ny = -1] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]) {
      const i = ny * map.width + nx;
      if (walkable(map, nx, ny) && !seen[i]) {
        seen[i] = 1;
        queue[tail++] = i;
      }
    }
  }
  return seen;
}
