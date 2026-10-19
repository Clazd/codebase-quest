# 0006. Deterministic world layout and portable map exports

- Status: Accepted
- Date: 2026-10-19
- Phase: 03

## Context

Phase 02 now provides validated, deterministic facts. Phase 03 must produce maps
outside the game engine, with measurable reachability and placement guarantees.
User explicitly queued this phase after the analyzer; branches/commits remain
separate and no remote changes are authorized.

## Decision

Use the shared WorldModel v1 contract and documented generator in
`packages/worldgen/README.md`: source-folder regions, square-root-weighted
squarified treemaps, seeded terrain erosion, maximum-spanning-tree roads with
A* bridges, district treemaps/lot streets, per-building interior instances,
semantic markers and abstract tile → Kenney placeholder theme mappings.
Generation validates every modeled transition and placement before returning.
SVGs provide an engine-independent review surface. A headless Phaser test
checks emitted Tiled data without adding rendering/movement gameplay.

## Explicit interpretations and small deviations

- Metadata/root files attach to the entry region rather than forming empty
  non-source regions. Treemap weights use source LOC, excluding docs/assets;
  every retained graph file still receives a building. Empty graphs get an
  empty safe Outskirts map, Gate and civic markers.
- Zero-weight MST links are physical connectivity infrastructure; their
  `reason` distinguishes them from import/call evidence. Guess-only roads
  retain uncertainty metadata and a separate flickering layer.
- Interior template topology is reused, but map files are keyed by **building
  instance** instead of sharing one map file per template. This prevents two
  buildings' residents/transitions from sharing an ambiguous address.
- All symbols have reserved spots, including interfaces/types, satisfying the
  coverage invariant. They do not acquire dialogue or gameplay in this phase.
  Overflow NPCs use a reserved shared crowd spot; exported outdoor positions
  are mirrors of the primary NPC identity, not extra NPCs.
- Dungeon markers retain one stable acyclic exact four-symbol chain per start
  symbol; they do not enumerate exponentially many alternate paths. Dungeon
  floor/content generation remains Phase 09.
- Age and the “recent” flag use the latest commit date present in the graph as
  a fixed snapshot reference. Using today's clock would violate the same-graph
  determinism requirement. Missing history stays explicit (null/false).
- The per-biome theme deliberately reuses a small CC0 placeholder sheet;
  semantic water/forest/etc. are clear in SVG, while final tiles await Phase 12.
  Abstract vocabulary, GIDs and collision data stay separate.

## Consequences

Phase 04 receives WorldModel, Tiled maps, transitions and a theme with copied
CC0 art/license. No code from analyzed repositories runs. Seeded generation,
goldens, BFS/overlap/coverage checks, synthetic fuzzing, byte determinism and
stress gates provide reproducible evidence. The owner should review the SVG
previews and their own project's recognizable structure before sign-off.
