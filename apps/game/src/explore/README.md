# Walking through a repository

From the workspace root:

```sh
pnpm cq -- play fixtures/repos/tiny-ts
pnpm cq -- play .
```

The command analyzes source data, generates maps, builds the trusted game client
if necessary, starts a loopback server and opens the browser. `--no-open` prints
the URL without opening it; `--port 4184` chooses a port. Ctrl+C stops that server.
The second launch logs `Cache hit` when the commit and safe source contents match.
Edits without a commit invalidate it. Cache output stays under `.codequest/cache`
or the OS temp directory when the repository denies writes.

Click **Enter the kingdom**. Start beside the blue gate; **E** or **Interact**
enters its region. Region gates return to the overworld, building doors lead
inside, and the interior entrance returns to the same door. Monsters,
bosses and portals are static markers; characters are covered below.

| Input | Action |
|---|---|
| Arrows / WASD | Walk, including normalized diagonals |
| Shift | Run |
| Click a reachable tile | Follow an A* route |
| Click again at arrival / Interact button | Enter a nearby door or gate |
| Gamepad left stick | Walk, with a deadzone |
| E / Space / Enter | Interact: a door underfoot, else the nearest character, else a nearby door |
| Click a character | Talk when beside it; otherwise walk beside it, then talk |
| C / Codex button | Open or close the Codex |
| G / Gitling button / click Gitling | Ask Gitling about the code (search, or your agent/model when configured) |
| M / Map button | Open or close the full overworld map |
| Esc / Pause button | Pause; settings stub and readable font option |
| Mouse wheel / − / + | Three camera zoom levels |
| F3 | FPS, coordinates, map ID, chunk count, entity IDs at cursor |

All keyboard bindings are in `navigation.ts`. HUD controls are reachable by Tab;
modal panels retain focus until closed. Menus and loading stop movement. Input
releases on window blur. No exploration state survives a reload yet.

The minimap shows explored terrain, known gates and your position. The full map
labels regions and marks your current region when inside it. Walk within eight
tiles to reveal fog. A file counts as `seen` only when its building footprint is
fully revealed; it is not marked understood. Proximity signs show file names;
hovering a sign displays its path in the status line. Breadcrumbs track the
kingdom, region, district and current file.

## Characters, Code Panel and Codex (Phase 05)

Every function, method, class and type is a character (`src/npc/`). Bodies come
from its kind, guild tint from its class or folder, 5×5 badges from traits
(wings async, hammer constructor, ear trumpet event handler, mirror recursive,
coin I/O, lotus pure candidate, ghost deprecated), and idle behavior from traits
(brisk errands, busy work, meditation, standing alone, wandering; visitors circle
characters with five or more callers). Idle motion stops for
`prefers-reduced-motion`. A name tag appears within three tiles and marks the
character `seen`.

Talking opens template dialogue and the Code Panel: signature, doc comment, the
real lines (fetched from `source/<fileId>?start&end` beside `world.json`, Shiki
highlighted, collapsible over 40 lines), metrics, callers, callees and tests with
confidence lines (solid exact, dashed likely, dotted guess). Arrow keys, Home and
End move through a list; Enter offers **Walk there** (arrow + minimap ring through
gates and doors) or **Teleport**. **Open in editor** uses `cq play --editor`
(default `vscode://file/{path}:{line}`); **Open on GitHub** appears for GitHub
remotes with a commit. Talking marks a character `read` in the Codex, which has
search, region/kind/trait filters, completion, Markdown notes and **Export notes**.
Only Codex entries and notes persist (`localStorage["cq:codex:<repo>:<commit>"]`).
Any overlay pauses the world; Esc closes the innermost layer.

Debug API additions (dev/test only): `interactWithNpc`, `getOpenPanel`,
`getCodexCount`, `gotoNpc`, `getGuide`, `getNpcs`, and for Phase 06 the mock
bridge (`bridgeReceive`, `bridgeSent`) and `askGitling`.

## Gitling and the bridge (Phase 06)

Gitling follows the player. Its chat answers at once from the BM25 index
(`search.json`) with citations that open the Code Panel, then shows any better
answer from your agent (sampling or the bridge loop), a local model or the API,
labeled "answered by". Agent-written NPC dialogue (`content.json`, validated by
`cq play`) replaces template lines and is tagged "written by your agent". With a
`#bridge=<token>` fragment from `cq play`, the game connects to
`ws://127.0.0.1:<port>/bridge` and accepts only `focus`, `playerState` and
`gitlingQuestion`. See `apps/mcp/README.md` and ADR 0009.

## Implementation boundaries

- `loader.ts`: runtime WorldModel/Tiled validation, local asset paths, lazy map fetch.
- `navigation.ts`: pure collision movement, A*, bindings and camera chunk selection.
- `session.ts`: indexed map/location references, fog and comprehension state.
- `game.ts`: Phaser Preload/Title/map/HUD scenes, camera and rendered chunks.
- `hud.ts`: persistent native HTML controls, minimap and accessible modal panels.
- `apps/cli/src/play.ts`: safe discovery fingerprint, cache, loopback server/opener, live links.
- `apps/cli/src/source.ts`: the safe line-range reader behind `source/<fileId>`.
- `src/npc/`: fact index, appearance, crowd layout, guide routing, Codex store, Phaser entity, lazy Shiki.
- `src/overlay/`: typed event bus, overlay store and Preact dialogue/Code Panel/Codex.
- `packages/content`: fact sheets (Node) and the template dialogue engine with `locales/en.json`.

Rendering uses the existing Kenney CC0 placeholder theme. Large maps instantiate
64×64 tilemap chunks around the camera, while their collision arrays remain
available for navigation. WorldModel JSON is still a complete logical model.
This phase does not implement final art, AI dialogue, combat or a save system.

## Verification

`pnpm test` includes loader validation, rejected references/assets, path collision,
diagonal normalization, fog/reverse transitions/chunk selection and HTTP/cache
integration tests. `pnpm e2e` builds test-only Taskly and 2,000-building worlds and
checks title/doors, a twenty-tile walk, pointer movement, synthetic gamepad input,
keyboard/axe, visual regression and average frame time (rough guard: 40 ms).

The fixture query `?world=fixtures/tiny-ts` and `window.__CQ__` are available only
in dev/test builds. F3 works in the built game. Debug helpers extend the earlier
API with world summary, location, region/building entry, fog ratio, camera and
frame/chunk statistics. Production bundles are tested to exclude the debug API.

For an intentional visual update, run:

```sh
pnpm e2e apps/game/e2e/explore.e2e.ts apps/game/e2e/npcs.e2e.ts --update-snapshots=all
```

Inspect the PNGs in `apps/game/e2e/*-snapshots/` before committing.
They use Git LFS. Remote CI and physical gamepad comfort require separate checks.
