/**
 * @codebase-quest/assets: built sprites, tilesets and audio.
 * Every file in this package must have an entry in ../LICENSES.md.
 */

/** Kenney "Tiny Dungeon" (CC0): 16×16 tiles, 12 columns × 11 rows, no spacing. */
export const tinyDungeon = {
  /** Path inside this package, for bundlers: `@codebase-quest/assets/kenney/tiny-dungeon/tilemap_packed.png`. */
  sheet: "kenney/tiny-dungeon/tilemap_packed.png",
  tileSize: 16,
  columns: 12,
  rows: 11,
  /** Frame indices used by the Phase 00 test scene. */
  frames: {
    floor: 48,
    floorAlt: 49,
    wall: 40,
    hero: 85,
  },
} as const;
