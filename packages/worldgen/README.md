# Deterministic world generator

Phase 03 turns a validated CodeGraph into a WorldModel, finite orthogonal Tiled
maps, an abstract tile theme and standalone SVG previews. It does not implement
movement, rendering in the game client, fights or dungeon floors.

```sh
pnpm cq -- analyze fixtures/repos/tiny-ts --out out/tiny.json
pnpm cq -- generate out/tiny.json --out out/world-tiny/
pnpm cq -- world preview out/world-tiny/world.json
```

Open `out/world-tiny/preview/overworld.svg` in a browser, then a
`preview/region-<id>.svg`. Repeat with your own project path. Generated output:

```text
world.json                  validated model, layers and placements
theme.json                  abstract tile + biome → tile GID mapping
assets/tiny-dungeon.png      copied Kenney CC0 placeholder sheet
assets/KENNEY-LICENSE.txt    original license
maps/overworld.json
maps/region-<id>.json
maps/interior-<instanceId>.json
preview/overworld.svg
preview/region-<id>.svg
```

## Layout and rules

- Top-level source folders become regions; `src/*` is unwrapped and
  `packages/*`/`apps/*` packages remain distinct. Root files and metadata go to
  the entry-point region (first region if unknown). Folders below 2% of source
  LOC merge into Outskirts; cap 12 includes Outskirts. Assets/docs do not inflate
  code weights. Empty graphs receive a safe empty Outskirts region.
- Folder rules choose the Master Plan's biomes; test/doc majorities and route
  density contribute content evidence. Unknown roles remain Wildlands.
- A squarified treemap weighted by square-root LOC sets the overworld envelopes.
  Seeded edge erosion and terrain form forest/rock borders and water boundaries
  around connected regions. Up to eight imported dependencies get fogged islands.
- Count exact/likely cross-region imports and calls. A maximum spanning tree
  joins every region, with up to floor(region-count/2) strongest extra links.
  A* costs grass 1, forest 3 and water 10; rocks/walls are impassable. Water
  crossings become bridges; weights control widths 1–3. Guess-only links have
  a separate flickering layer. Zero-weight connectivity links are labelled
  `reason: connectivity`, not presented as code relationships.
- Each district is a subfolder treemap rectangle. Its lot grid reserves street
  margins and a corridor to the regional entry. Every file maps to one building:
  hut <50 lines, house <200, manor <500, castle otherwise. Index/README/manifest/
  config/CI/Dockerfile/migration/generated roles supply building/landmark types.
- Districts over 40 files group files below 30 lines into row houses of up to
  eight files. `aggregation` preserves every member ID and the reason.
- Age/churn/cracks/tested/recentlyChanged are model data. The reference date is
  the latest file commit in the input snapshot, not the current wall clock.
  This preserves repeatability. No-history age is null and recentlyChanged false.
- Interiors reuse size/room-count templates but receive **instance maps per
  building**, so residents have unambiguous addresses. Every class owns a room;
  methods go to their class room, other symbols to the hall. Exported symbols
  prefer positions near the entry and get an outdoor mirror. Private symbols
  prefer deeper hall positions. Overflow shares an explicit crowd spot/ID.
  All graph symbols, including type/interface declarations, retain a reserved
  spot for downstream clients; they are markers, not implemented NPC behavior.
- Every smell gets a nearby walkable spawn, severity-based level and patrol
  radius 3–6. Each callable region hotspot (complexity × churn × fan-in, with
  floors of one) receives an adjacent 12×10 walkable reserved arena.
- Each start symbol with an acyclic exact call path of four nodes gets one
  canonical dungeon entrance. This bounds enumeration while preserving real
  call evidence. Entry points become labelled portals. The Gate region gets
  the Quest Board, Chronicle Stone and Hall of Heroes; Bazaar gets the shop.

## Contracts and safety

`WorldModelSchema` lives in shared. `worldProblems` checks references, file/NPC/
smell coverage, all building doors reachable from the Gate through transitions,
building bounds/overlap, NPC reachability, walkable spawns and arenas, and exact
dungeon paths. Generation fails with evidence if an invariant breaks.

Abstract tiles stay independent of art indices. Theme GIDs are one-based for
Tiled; zero is transparent. The initial per-biome mappings intentionally reuse
Kenney placeholders. Replace theme mappings later without editing generators.
Maps contain ground, decor, hidden collision and object layers, plus flickering
where needed. Object properties retain stable IDs, file/symbol/smell references,
portal labels and transition destinations. The schema tests the emitted subset
of [Tiled's JSON format](https://doc.mapeditor.org/en/stable/reference/json-map-format/).

SVG labels and titles are XML-escaped. Repository text never becomes executable
SVG. Output paths are confined to the chosen output directory. Model generation
uses a single explicitly passed mulberry32 RNG, seeded by SHA-1 of commit or
graph content. ID collections use code-point sorting. `pnpm check` includes an
AST lint rule rejecting direct/computed `Math.random` references throughout
worldgen source, including alias capture; comments and strings are ignored.

## Tests and review

`pnpm test` runs all six fixture invariants, 50 synthetic seeds, model/Tiled/SVG
determinism, directory-byte comparison, schema checks, a 5,000-file/40-folder
stress gate (<10 seconds), monorepo identity and escaped-label checks. Golden
world/SVG files for tiny-ts/tiny-py live in `goldens/` and are excluded from
formatting so exact serializer bytes survive. To deliberately update them in
PowerShell: set `$env:CQ_UPDATE_WORLD_GOLDENS='1'`, run the worldgen tests, then
`Remove-Item Env:CQ_UPDATE_WORLD_GOLDENS`.

`pnpm e2e` loads a generated Tiled golden into headless Phaser through a dev/test
compatibility page; production builds omit that page. This verifies the parser
boundary without adding Phase 04 gameplay.

Review Taskly's five regions: Port of api, Capital of services, Mines of db,
Bazaar of utils and Training Grounds of tests. In the Port SVG, hover the pink
marker beside handlers.ts to find the Gremlin. Gold rectangles are reserved
arenas. Compare a few file labels and smell IDs with the graph, then inspect a
world made from your own project. Manual aesthetic/recognizability approval
remains the owner's check. Design interpretations are recorded in ADR 0006.
