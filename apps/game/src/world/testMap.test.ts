import { describe, expect, it } from "vitest";
import {
  buildTestMap,
  isFloorVariant,
  SPAWN_TILE,
  TEST_MAP_HEIGHT,
  TEST_MAP_WIDTH,
  Tile,
  tileCenter,
} from "./testMap.ts";

describe("test map", () => {
  const map = buildTestMap();

  it("is 30×20 tiles", () => {
    expect([TEST_MAP_WIDTH, TEST_MAP_HEIGHT]).toEqual([30, 20]);
    expect(map).toHaveLength(TEST_MAP_HEIGHT);
    for (const row of map) expect(row).toHaveLength(TEST_MAP_WIDTH);
  });

  it("is closed by walls on every border", () => {
    for (let x = 0; x < TEST_MAP_WIDTH; x++) {
      expect(map[0]?.[x]).toBe(Tile.Wall);
      expect(map[TEST_MAP_HEIGHT - 1]?.[x]).toBe(Tile.Wall);
    }
    for (const row of map) {
      expect(row[0]).toBe(Tile.Wall);
      expect(row[TEST_MAP_WIDTH - 1]).toBe(Tile.Wall);
    }
  });

  it("spawns the player on floor, with open floor east and a wall at column 15", () => {
    const row = map[SPAWN_TILE.y] ?? [];
    expect(row[SPAWN_TILE.x]).toBe(Tile.Floor);
    expect(row[SPAWN_TILE.x + 1]).toBe(Tile.Floor);
    expect(row.indexOf(Tile.Wall, SPAWN_TILE.x)).toBe(15);
  });

  it("is deterministic", () => {
    expect(buildTestMap()).toEqual(map);
    expect(isFloorVariant(0, 0)).toBe(true);
    expect(isFloorVariant(1, 0)).toBe(false);
  });

  it("converts tiles to pixel centers", () => {
    expect(tileCenter(4, 10)).toEqual({ x: 72, y: 168 });
  });
});
