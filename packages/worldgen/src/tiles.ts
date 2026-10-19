import type { AbstractTile, Biome, Rect, WorldMap, WorldModel } from "@codebase-quest/shared";
export const BIOMES: Biome[] = [
  "port",
  "mines",
  "artisan",
  "capital",
  "bazaar",
  "training",
  "clocktower",
  "forge",
  "library",
  "fortress",
  "ruins",
  "wildlands",
];
export const TILES: AbstractTile[] = [
  "empty",
  "grass",
  "path",
  "road",
  "road-wide",
  "water",
  "bridge",
  "wall",
  "floor",
  "door",
  "tree",
  "rock",
  "sand",
  "plaza",
  "dock",
  "ruin",
  "fog-edge",
  "arena-floor",
];
const colors: Record<AbstractTile, string> = {
  empty: "transparent",
  grass: "#426e4a",
  path: "#c5a576",
  road: "#d6b586",
  "road-wide": "#ecd09c",
  water: "#28556f",
  bridge: "#b99b68",
  wall: "#4e5566",
  floor: "#697a78",
  door: "#f1d49b",
  tree: "#234c3b",
  rock: "#636b78",
  sand: "#c5b17c",
  plaza: "#b5b8a5",
  dock: "#9b7858",
  ruin: "#645b78",
  "fog-edge": "#7a7b95",
  "arena-floor": "#ba8565",
};
export const tileColor = (tile: AbstractTile) => colors[tile];
export function placeholderTheme(): WorldModel["theme"] {
  const mapping: Record<AbstractTile, number> = {
    empty: 0,
    grass: 49,
    path: 50,
    road: 50,
    "road-wide": 50,
    water: 2,
    bridge: 51,
    wall: 41,
    floor: 49,
    door: 52,
    tree: 25,
    rock: 43,
    sand: 50,
    plaza: 49,
    dock: 51,
    ruin: 42,
    "fog-edge": 3,
    "arena-floor": 49,
  };
  return {
    name: "kenney-tiny-dungeon-cc0",
    tileSize: 16,
    image: "assets/tiny-dungeon.png",
    columns: 12,
    tileCount: 132,
    mapping: Object.fromEntries(BIOMES.map((b) => [b, { ...mapping }])) as Record<Biome, Record<AbstractTile, number>>,
  };
}
export function makeMap(
  id: string,
  path: string,
  kind: WorldMap["kind"],
  width: number,
  height: number,
  biome: Biome = "wildlands",
  fill: AbstractTile = "grass",
): WorldMap {
  return {
    id,
    path,
    kind,
    biome,
    width,
    height,
    ground: Array<AbstractTile>(width * height).fill(fill),
    decor: Array<AbstractTile>(width * height).fill("empty"),
    collision: Array<0 | 1>(width * height).fill(0),
    flickering: Array<0 | 1>(width * height).fill(0),
  };
}
export function paint(map: WorldMap, x: number, y: number, tile: AbstractTile, blocked: 0 | 1 = 0): void {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return;
  const i = y * map.width + x;
  map.ground[i] = tile;
  map.decor[i] = "empty";
  map.collision[i] = blocked;
}
export function rectangle(map: WorldMap, rect: Rect, tile: AbstractTile, blocked: 0 | 1 = 0): void {
  for (let y = rect.y; y < rect.y + rect.h; y++)
    for (let x = rect.x; x < rect.x + rect.w; x++) paint(map, x, y, tile, blocked);
}
export function border(map: WorldMap): void {
  for (let x = 0; x < map.width; x++) {
    paint(map, x, 0, "wall", 1);
    paint(map, x, map.height - 1, "wall", 1);
  }
  for (let y = 0; y < map.height; y++) {
    paint(map, 0, y, "wall", 1);
    paint(map, map.width - 1, y, "wall", 1);
  }
}
export function line(map: WorldMap, x1: number, y1: number, x2: number, y2: number, tile: AbstractTile = "path"): void {
  const dx = Math.sign(x2 - x1),
    dy = Math.sign(y2 - y1);
  for (let x = x1; ; x += dx) {
    paint(map, x, y1, tile);
    if (x === x2) break;
  }
  for (let y = y1; ; y += dy) {
    paint(map, x2, y, tile);
    if (y === y2) break;
  }
}
export const walkable = (map: WorldMap, x: number, y: number) =>
  x >= 0 && y >= 0 && x < map.width && y < map.height && map.collision[y * map.width + x] === 0;
