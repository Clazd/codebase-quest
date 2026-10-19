# 0007. Walkable client and local play

- Status: Accepted
- Date: 2026-10-19
- Phase: 04

## Context

Phase 03 supplies logical maps and finite Tiled exports. Phase 04 must make them
walkable without executing analyzed code, adding combat, or persisting player
progress. The plan's commit-only cache would return stale worlds after edits
without a commit. Generated cache files must also stay out of analysis.

## Decision

- Keep the existing no-query Phase 00 scene for its regression tests. A `world`
  query starts Preload → Title → Overworld/Region/Interior, alongside a persistent
  HUD scene and a native HTML HUD. Native buttons, a modal dialog with browser
  focus management, live status and canvas descriptions provide keyboard access;
  Phaser owns map rendering and player input. No dialogue or combat is added.
- Validate the WorldModel, references, theme and fetched Tiled layers. Fetch a
  map when entering it and retain at most four parsed Tiled exports. Maps over
  200 tiles on either axis materialize 64×64 Phaser tilemap chunks around the
  camera and destroy distant chunks; tile layers also use Phaser culling. The
  current WorldModel still contains all logical arrays, and each entered map's
  finite Tiled JSON is fetched whole. Network/data streaming remains Phase 16.
- Use continuous normalized eight-direction movement with swept small collision
  steps, gamepad deadzone, and cardinal A* for clicks. A six-pixel player footprint
  prevents diagonal corner cutting. Centralize bindings in `navigation.ts`.
  Enter a nearby transition with the interact key or HTML button; mouse users
  can also click again after arriving. Portals and other entities remain markers.
- Fog and fully-seen file IDs live only in the session. `seen` does not imply
  `read`, `understood` or `mastered`. Minimap terrain and gates respect fog;
  the full map also labels the known region names and locates the current region.
- Store play output at `.codequest/cache/<commit>/<content-fingerprint>/`.
  Fingerprint the safe discovery output, repository path, commit and cache
  contract version. This intentionally extends commit-only reuse so dirty edits
  invalidate it. Discovery skips `.codequest` entirely to prevent cache recursion
  and avoid treating authored future game content as source code. Repositories
  that deny writes fall back to a temp cache. No repository scripts are executed.
- Play titles use a safely parsed root package name when available (Taskly),
  otherwise the repository name, prefixed with `Kingdom of`. This is a display
  change on the play artifact; Phase 03 generator goldens remain unchanged.
- Bind the static server to loopback, check Host/Origin, permit GET/HEAD only,
  and constrain real file paths and extensions to the built game or world output.
  Build the trusted game client if missing or stale. Browser launch passes a
  generated URL as an argument to the platform opener without a shell.
- Fixture routes and `window.__CQ__` remain dev/test-only. F3's local performance
  overlay also works in production. Screenshot baselines use Git LFS and a shared
  path with a 1.5% pixel tolerance; CI checks out LFS for browser tests. The rough
  stress guard is 40 ms average per frame, with actual values recorded separately
  from the 60 fps product target. A synthetic pad checks input plumbing, not
  physical controller comfort.

## Consequences

The Phase 05 hand-off has static symbol markers, safe map loading, session fog,
location breadcrumbs and an interact entry point. Large map rendering is bounded,
but initial WorldModel transfer and one-map parsing still grow with world size.
Human movement feel, physical controller testing and five-minute playtest notes
remain separate from automated success. The CLI does not save player progress,
contact AI, execute analyzed code, or publish anything.
