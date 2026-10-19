import { TILE_SIZE } from "../config.ts";

/** Tile codes of the Phase 00 test map. */
export const Tile = { Floor: 0, Wall: 1 } as const;
export type TileCode = (typeof Tile)[keyof typeof Tile];

export const TEST_MAP_WIDTH = 30;
export const TEST_MAP_HEIGHT = 20;

/** Where the player starts, in tiles. */
export const SPAWN_TILE = { x: 4, y: 10 } as const;

/** Interior walls as inclusive tile rectangles. Hand-placed, so the map never changes. */
const INTERIOR_WALLS = [
  { x1: 15, y1: 3, x2: 15, y2: 12 }, // a long wall east of the spawn
  { x1: 5, y1: 15, x2: 12, y2: 15 }, // a wall in the south
  { x1: 21, y1: 5, x2: 23, y2: 7 }, // a pillar block
  { x1: 20, y1: 13, x2: 26, y2: 13 }, // a wall in the south-east
] as const;

/**
 * Builds the 30×20 test map: a walled border plus a few interior walls.
 * Deterministic: no randomness, same output every call.
 */
export function buildTestMap(): TileCode[][] {
  const rows: TileCode[][] = [];
  for (let y = 0; y < TEST_MAP_HEIGHT; y++) {
    const row: TileCode[] = [];
    for (let x = 0; x < TEST_MAP_WIDTH; x++) {
      const border = x === 0 || y === 0 || x === TEST_MAP_WIDTH - 1 || y === TEST_MAP_HEIGHT - 1;
      const interior = INTERIOR_WALLS.some((r) => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2);
      row.push(border || interior ? Tile.Wall : Tile.Floor);
    }
    rows.push(row);
  }
  return rows;
}

/** Floor tiles get an occasional variant, chosen by position (never by chance). */
export function isFloorVariant(x: number, y: number): boolean {
  return (x * 7 + y * 13) % 11 === 0;
}

/** Center of a tile in world pixels. */
export function tileCenter(tileX: number, tileY: number): { x: number; y: number } {
  return { x: tileX * TILE_SIZE + TILE_SIZE / 2, y: tileY * TILE_SIZE + TILE_SIZE / 2 };
}
