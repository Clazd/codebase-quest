# Phase 03: World Generator

> **Milestone:** B · The Map · **Depends on:** 02 · **Effort:** 1.5–2 weeks ·
> **Status:** Not started
> **Read first:** MASTER-PLAN §5, §16.4, §16.5

## Goal
`cq generate <graph.json>` turns a CodeGraph into a **WorldModel** (overworld,
regions, districts, buildings, roads, interiors and placements for NPCs,
monsters, bosses, dungeons and portals), exported as **Tiled JSON maps**, plus
**SVG previews** you can look at without running the game. The same graph always
produces the same world.

## Why now
The game client (Phase 04) needs maps to load. Generating and testing worlds
*outside* the game engine is much faster and more reliable.

## Scope

### In
- Region selection and biome assignment.
- Overworld layout, borders and roads.
- Region maps: districts, lots, buildings, streets, landmarks.
- Building interiors (templates) with rooms for classes and spots for NPCs.
- Placement markers: NPCs, monsters, boss lairs (reserved arenas), dungeon
  entrances, portals and Foreign Lands.
- Tiled JSON export using an **abstract tile vocabulary** plus a theme mapping.
- SVG previews.
- Big-repo aggregation rules.

### Out (later phases)
- Rendering, movement and gameplay (Phase 04 onward).
- Final art (Phase 12). This phase uses placeholder tiles.
- Boss fight content (Phase 09). This phase only reserves arenas.
- Dungeon floor layouts (Phase 09). This phase only places entrances.

## Design

### Abstract tile vocabulary
Generators never use tileset indices directly. They write **abstract tiles**:
`grass, path, road, road-wide, water, bridge, wall, floor, door, tree, rock,
sand, plaza, dock, ruin, fog-edge, arena-floor…` A **theme file** maps each
abstract tile + biome to tileset indices. This means art can change in Phase 12
without touching the generators.

### Step 1: Choose regions
1. Candidate regions = top-level folders containing source files. Repos whose code
   lives under one `src/` folder: treat `src/*` as the top level.
2. Merge folders smaller than 2% of total lines of code into one **Outskirts**
   region.
3. Cap at **12 regions** on the overworld (the rest merge into Outskirts).
4. Monorepos (`packages/*`, `apps/*`): each package is a region (continents come
   in Phase 16).
5. Biome by role (Master Plan §5.2), detected from the folder name **and** content
   (e.g. most files are tests → Training Grounds; most symbols are route handlers
   → Port).

### Step 2: Overworld layout
1. **Squarified treemap** of regions weighted by `sqrt(loc)`, so huge regions
   don't dwarf small ones too much.
2. Convert rectangles into organic areas: seeded noise erodes edges, and
   **natural borders** fill the gaps: rivers between regions with many
   cross-connections (crossed by bridges), mountains or forest between regions
   with none.
3. The **Gate** (spawn point) goes next to the region that contains the main
   entry point (or the README).
4. **Foreign Lands:** a sea along one edge, with up to 8 islands for the
   most-imported external dependencies (labels only, fogged).

### Step 3: Overworld roads
1. Weight between regions A and B = number of `imports`/`calls` edges (exact +
   likely) between their files.
2. Build a **maximum spanning tree** (so everything connects through the
   strongest links), then add the top-K extra edges (K = number of regions ÷ 2)
   so important shortcuts exist without spaghetti.
3. Path each road with **A\*** on the overworld grid (cost: grass 1, forest 3,
   river 10 → bridge, mountain → impassable).
4. Road width by weight (1–3 tiles). Edges that are only `guess` become
   **flickering paths** (a separate layer).
5. A **whirlpool** landmark marks any Ouroboros (cycle) that spans regions.

### Step 4: Region maps
1. **Districts:** a treemap of sub-folders inside the region area, separated by
   streets.
2. **Lots and buildings:** each file gets a building on a lot. Size class by
   lines of code: hut (< 50), house (< 200), manor (< 500), castle (≥ 500).
   Building **type** by file role (Master Plan §5.3).
3. **Streets:** grid streets inside districts; every door faces a street (lots
   rotate as needed).
4. **Landmarks:** index files become a central plaza; README becomes a library
   (in the Gate region or Docs region); manifest becomes the Town Hall; CI becomes
   a watchtower; Dockerfiles become a harbor; config becomes a clocktower.
5. **Aggregation for big folders:** if a district has more than 40 files, files
   under 30 lines are grouped into **row houses** (one building, multiple
   residents). Record the aggregation in the model so the game can list the files.
6. **Visual traits per building:** `age` (from git first commit), `churn`
   (scaffolding), `recentlyChanged` (flag), `crackLevel` (smell count), `tested`
   (lit windows: has `tests` edges). These are **data only** here; Phase 12 draws
   them.

### Step 5: Interiors
- Interior **templates** by size class (hut 1 room … castle 6+ rooms).
- Each class gets a **room**; top-level functions stand in the main hall.
- NPC spots: each symbol gets a stable spot. Exported symbols get spots **near
  the outside door** (also mirrored as an outdoor spot), private ones deeper inside.
- More symbols than spots: overflow NPCs share a "crowd" spot, listed in a
  roster.

### Step 6: Placements
| Marker | Rule |
|---|---|
| NPC | One per function/method/class (classes as the room's "head of house") |
| Monster | One per smell, near its building's door; patrol radius 3–6 tiles; level from severity |
| Boss lair | Region hotspot (top complexity × churn × fan-in); reserve an **arena** (12×10 walkable tiles) next to its building |
| Dungeon entrance | Call chains of depth ≥ 4 using exact edges; entrance near the chain's first function |
| Portal (Gate) | Each entry point; route labels like `POST /tasks` on piers (Port biome) |
| Quest Board | In the Gate region plaza |
| Chronicle Stone, Hall of Heroes, Bazaar Shop | Fixed landmarks (Gate region / Bazaar region) |

### Step 7: Output
- `world.json`: the WorldModel (zod-validated).
- `maps/overworld.json`, `maps/region-<id>.json` and `maps/interior-<templateId>.json`
  in **Tiled JSON** with layers `ground`, `decor`, `collision`, `objects` (markers
  as Tiled objects with properties).
- `preview/overworld.svg` and `preview/region-<id>.svg`: color-coded tiles,
  labels, roads, markers.

### Determinism
Seed = `sha1(commit ?? graph content hash)`. A single seeded RNG
(e.g. a `mulberry32` implementation) is passed explicitly; **no `Math.random`**
(enforced by a lint rule in this package).

### CLI
```
cq generate <graph.json> --out out/world/     # world.json + maps + previews
cq world preview <world.json>                 # regenerate SVGs only
cq play <repo-path>                           # (wired up in Phase 04)
```

## Tasks
- [ ] WorldModel v1 zod schema in `packages/shared`.
- [ ] Abstract tile vocabulary + placeholder theme (Kenney CC0 mapping).
- [ ] Seeded RNG utility + lint rule against `Math.random` in `worldgen`.
- [ ] Region selection + biome classifier.
- [ ] Overworld treemap + organic edges + borders + Gate + Foreign Lands.
- [ ] Overworld roads (spanning tree + extras + A\* + bridges + flickering paths + whirlpools).
- [ ] Region maps (districts, lots, buildings, streets, landmarks, aggregation, visual traits).
- [ ] Interior templates + NPC spot assignment.
- [ ] Placements (NPCs, monsters, boss arenas, dungeon entrances, portals, landmarks).
- [ ] Tiled JSON exporter.
- [ ] SVG preview renderer.
- [ ] CLI commands.

## Automated tests
- **Invariants (every fixture + 50 random seeds on synthetic graphs):**
  - Every building door is **reachable** from the Gate (BFS on the collision layer
    through overworld → region transitions).
  - No overlapping buildings; every building is fully inside its district.
  - Every source file maps to exactly one building (or a row house).
  - Every symbol has exactly one NPC spot; every smell has one monster spawn on a
    walkable tile.
  - Every region has a road connection to the overworld network.
  - Each boss arena is fully walkable and doesn't overlap buildings.
- **Golden snapshots:** `tiny-ts` and `tiny-py` → `world.json` (+ SVG snapshots).
- **Determinism:** generate twice → identical bytes for all outputs.
- **Stress:** a synthetic graph with 5,000 files and 40 folders → finishes in
  under 10 seconds, invariants still hold, region count capped.
- **Tiled compatibility:** exported maps validate against the Tiled JSON format
  (schema test) and load in a headless Phaser test (smoke).

## Manual test script
1. `pnpm cq -- analyze fixtures/repos/tiny-ts --out out/tiny.json`
2. `pnpm cq -- generate out/tiny.json --out out/world-tiny/`
3. Open `out/world-tiny/preview/overworld.svg` in a browser. Do the regions make sense for Taskly (Port of API, Capital of services, Mines of db, Bazaar of utils, Training Grounds)?
4. Open a region SVG. Is each building labelled with its file? Are monsters near the right files (the Gremlin near the TODO file)?
5. Optionally open `maps/overworld.json` in the **Tiled** editor and look around.
6. Do the same for **your own project**. Does the world feel like *your* code?

## Definition of done
- [ ] All invariants hold for fixtures and synthetic graphs.
- [ ] Golden and determinism tests green.
- [ ] SVG previews of `tiny-ts` look sensible (reviewed by you).
- [ ] Your own project produces a recognizable world.

## Risks
| Risk | Mitigation |
|---|---|
| Layouts look messy or random | Treemap gives structure; spanning-tree roads avoid spaghetti; review SVGs early and often |
| Huge folders produce giant maps | Row houses, caps, Phase 16 streaming |
| Hard to debug generation | SVG previews + `--debug` overlays (lot grid, A\* costs) |

## Hand-off to the next phase
Phase 04 receives `world.json` + Tiled maps + an abstract tile theme, ready to
load in Phaser.

## Start prompt for Claude
```
Read AGENTS.md, docs/plans/README.md, the MASTER-PLAN sections listed in the
phase header, and docs/plans/phases/P03-world-generator.md.
Implement Phase 03 on branch phase/03-world-generator. Run the automated tests,
walk me through the manual test script, and fill in the Results section.
```

## Results (fill in after testing)
- Date:
- Automated tests:
- SVG review notes:
- Decisions / ADRs:
