# 0008. NPCs, Code Panel, source endpoint and Codex

- Status: Accepted
- Date: 2026-10-19
- Phase: 05

## Context

Phase 05 makes symbols into characters that talk (template text, no AI) and
shows their real code, callers, callees and tests. The WorldModel only stores
NPC placements, not symbol facts. The plan names a `/source/<fileId>` endpoint,
but play output and fixture worlds are both served relative to a `world.json`.
Several of a file's exported functions share one outdoor WorldModel spot.

## Decision

- **Fact sheets.** `buildFactBook(graph, world)` (`packages/content/src/facts.ts`,
  Node-only) derives one deterministic `FactSheet` per symbol from the CodeGraph:
  signature, cleaned/masked doc comment and its verbatim first sentence, traits,
  metrics, callers/callees/tests with confidence, one-hop `ioVia` and the NPC,
  building and region it belongs to. The schema lives in `packages/shared`.
  `cq play` caches `facts.json` beside `world.json` (cache version `npcs-v1`).
  A golden (`packages/content/goldens/tiny-ts.facts.json`) and an independent
  edge re-derivation test guard it. Phase 06 reuses fact sheets as AI grounding.
- **Local links are live, not cached.** The server adds `links` (absolute repo
  root, GitHub base from `origin` with credentials stripped, editor template) to
  `facts.json` when serving. `--editor` accepts editor schemes only (default
  `vscode://file/{path}:{line}`); web, `file:`, `data:` and script URLs are refused,
  and the client re-checks. GitHub links need a commit and a `github.com` remote.
  The plan says "public repos"; publicity cannot be checked offline, so the
  button appears for any GitHub remote.
- **Source endpoint path.** Code is served at `source/<fileId>?start&end`
  relative to the world URL (`/world/source/…` in `cq play`,
  `/fixtures/tiny-ts/source/…` in dev/test builds) instead of a root `/source/`.
  One reader (`apps/cli/src/source.ts`) serves both. It only serves file IDs from
  the analyzed file list, re-checks every path (no `..`, absolute, backslash,
  skip directory or secret pattern), refuses symlinks and paths whose real path
  leaves the repository, caps files at 1 MiB and ranges at 2,000 lines, and masks
  secrets line by line so line numbers still match. A hash mismatch is reported
  as `stale` rather than hidden.
- **Dialogue.** Rules with priorities and localized variants
  (`packages/content/locales/en.json`) produce up to three lines; the greeting is
  used only when nothing else matches. Variants come from a seeded hash of world
  seed, symbol and rule. The `io` rule names direct callees that do I/O (a true
  one-hop fact); `ioDirect` covers symbols that do I/O without such callees,
  because the CodeGraph does not record I/O kinds.
- **Characters.** Kenney placeholder bodies by kind (trainer for tests, ghost for
  deprecated), guild tint by class or folder, 5×5 generated trait badges, a name
  tag within three tiles and idle behaviors by trait. Characters sharing a spot
  step to the nearest free walkable tile within three tiles (never a gate or door),
  deterministically. Idle motion stops under `prefers-reduced-motion`, which also
  keeps screenshot tests deterministic. E acts on a door underfoot first, then the
  nearest character (by fog, not sprite visibility), then a nearby door.
- **Overlay.** Preact renders the dialogue box, Code Panel (non-modal dialog)
  and Codex (modal dialog with Tab trap) over the canvas; a typed event bus
  connects them to Phaser. Any open overlay pauses game input; Esc closes the
  innermost layer. Shiki 4.5.0 loads lazily with its JavaScript regex engine (no
  WASM) and the `github-dark-high-contrast` theme for WCAG contrast; tokens are
  rendered as text nodes, never HTML, and dropped if they do not reproduce the line.
- **Navigation.** "Teleport" goes beside the character at home and opens its
  panel. "Walk there" shows an arrow and a minimap ring toward the character, or
  the next gate/door on the shortest route of map transitions.
- **Codex.** `seen` (in memory) and `read` (talked to) are separate. Only read
  entries and notes persist, at `cq:codex:<repo name>:<commit>` (version 1,
  validated on load; storage failures keep a session-only Codex and say so).
  Using the repository name as `<repoId>` means two repositories with the same
  name and commit would share notes; Phase 08 replaces this key.
- **Tests and CI.** Playwright's global setup builds the fixture repositories,
  and the CI e2e job runs `pnpm fixtures`, because Code Panel tests compare the
  displayed text with `fixtures/repos/tiny-ts`.

## Consequences

The game stays useful without AI and without network access. Fact sheets are a
stable grounding contract for Phase 06. Code shown always comes from the real
file at request time; edits after analysis are flagged as stale until the next
`cq play`. The Shiki grammars add about 1 MB of lazily loaded chunks to the
build. Template usefulness still needs the owner's rating on a real project.
