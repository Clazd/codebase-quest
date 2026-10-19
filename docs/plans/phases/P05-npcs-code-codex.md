# Phase 05: NPCs, Code Panel and Codex

> **Milestone:** C · The People · **Depends on:** 04 · **Effort:** 1–1.5 weeks ·
> **Status:** Implemented and tested; owner template rating pending
> **Read first:** MASTER-PLAN §5.5, §12, §16.8

## Goal
Functions and classes become **characters** you can talk to. Talking opens a
dialogue box (template text, no AI yet) and a **Code Panel** showing the real
code, its signature, docs, metrics, callers and callees. Clicking a caller takes
you to that character. Everything you meet is collected in the **Codex**.

## Why now
This is the heart of the idea: *code you can talk to*. It must work well
**without AI** first, so the game is useful, fast, free and private by default.

## Scope

### In
- NPC rendering from traits (placeholder sprites with tints and trait badges).
- Idle behaviors by trait (stand, wander in a small radius, pace).
- Interaction: dialogue box + Code Panel (Preact overlay).
- Template dialogue system (rule-based, localizable).
- Callers/callees navigation (teleport or walk-guided arrow).
- "Open in editor" (local mode) and "Open on GitHub" (public repos).
- Codex v1: discovered entries, search, filters, personal notes.
- Comprehension states `seen → read` (in-memory + localStorage for the Codex only).
- Accessibility basics for overlays (keyboard navigation, focus, ARIA).

### Out (later phases)
- AI dialogue and Gitling chat (Phase 06).
- Code-Body Combat (Phase 07).
- Full save system (Phase 08). Only the Codex uses a simple localStorage key here.

## Design

### NPC appearance (placeholder level)
- Base sprite by **symbol kind** (function, method, class head).
- **Tint** by class (methods of one class share a color) or by module.
- **Trait badges** above the head (tiny icons): wings (async), hammer
  (constructor), ear trumpet (event handler), mirror (recursive), coin (does I/O),
  lotus (pure candidate), ghost (deprecated).
- **Name tag** on approach: `createTask()`. Classes show as `class TaskService`.

### Idle behaviors
| Trait | Behavior |
|---|---|
| async | Walks briskly between 2 points |
| does-io | Busy "working" animation near a counter |
| pure-candidate | Stands calmly, meditating |
| high fan-in | Small crowd of "visitor" particles |
| no callers | Stands alone in a corner |

### Interaction flow
1. Approach → the name tag appears → press **E**.
2. **Dialogue box** (bottom) shows 1–3 template lines.
3. The **Code Panel** slides in from the right:
   - Header: name, kind, file path + line range, badges.
   - Signature and doc comment.
   - **Code** (Shiki-highlighted; long functions collapsible; the line numbers
     match the real file).
   - Metrics: lines, complexity, callers, callees, tests.
   - **Callers / Callees** lists, each clickable, with confidence icons (solid =
     exact, dashed = likely, dotted = guess).
   - **Tested by:** test functions that reference it.
   - Buttons: *Open in editor* · *Open on GitHub* · *Add to notes*.
4. Clicking a caller offers **"Walk there"** (a guide arrow on screen + minimap)
   or **"Teleport"** (instant; an accessibility and speed option).

### Template dialogue system
Rules pick lines based on facts. Each rule has conditions, a priority and
several variants (picked with a seeded RNG for variety).

| Condition | Example line |
|---|---|
| fanIn ≥ 5 | "Everyone visits me. {fanIn} others depend on my work!" |
| fanIn = 0 & not exported | "Nobody has called on me in a long time… am I still needed?" |
| async | "I'm always running errands. Don't wait for me — I'll get back to you!" |
| does-io | "I talk to the outside world: {ioKinds}." |
| cyclomatic ≥ 10 | "My job has a lot of twists and turns. {cyclomatic}, to be exact." |
| has tests | "The trainers check my work in {testFile}." |
| no tests | "No one has ever tested me. I'm a little nervous." |
| recursive | "To understand me, you must first understand me." |
| docComment present | Paraphrase-free: quote the first sentence of the doc comment |

Strings live in `locales/en.json` with placeholders, so translation is possible
later.

### Codex v1
- Opens with **C**. Entries are added when an NPC is first **read** (talked to).
- List with search (name, file), filters (region, kind, trait) and a completion %
  per region and overall.
- Entry page = the same content as the Code Panel + **personal notes** (markdown
  text area).
- Storage: `localStorage["cq:codex:<repoId>:<commit>"]`, versioned. Phase 08 moves
  this into the save system.
- **Export notes** button → a markdown file of all your notes (the seed of
  "onboarding docs as a side effect").

### Overlay architecture
- Preact app mounted over the Phaser canvas.
- A small typed **event bus** between Phaser and Preact (`npc:interact`,
  `panel:navigate`, `codex:open`…).
- While an overlay has focus, game input is paused; Esc closes it.
- Keyboard: Tab order, arrow navigation in lists, Enter to activate.

### Debug API additions
```ts
interactWithNpc(symbolId: string): Promise<void>;
getOpenPanel(): { kind: "code" | "codex" | null; symbolId?: string };
getCodexCount(): number;
```

## Tasks
- [ ] NPC entity class: sprite, tint, badges, name tag, idle behaviors.
- [ ] Interaction system (proximity + interact key + click).
- [ ] Event bus + Preact overlay root.
- [ ] Dialogue box component.
- [ ] Code Panel component (Shiki, collapsible, line numbers, callers/callees, tests).
- [ ] Code source loading: the CLI server exposes `/source/<fileId>?start&end`, reading files from the repo (respecting the analyzer's skip and secret rules).
- [ ] Navigation: walk-guide arrow + teleport.
- [ ] Template dialogue engine + `en.json` + rules above.
- [ ] Open in editor (`vscode://file/<abs>:<line>`; configurable editor URL) + Open on GitHub (from the git remote URL, if it's a GitHub repo).
- [ ] Codex v1 (list, search, filters, entry page, notes, export).
- [ ] Accessibility basics on overlays.
- [ ] Debug API additions.

## Automated tests
- **Unit:** template rule selection (given facts → the expected rule wins); placeholders filled; deterministic variant choice per seed.
- **Source endpoint:** returns exact file lines; refuses paths outside the repo (path traversal test); refuses secret-skipped files.
- **E2E (`tiny-ts`):**
  - `interactWithNpc(<slugify>)` → the Code Panel shows `slugify`, and the code text equals lines X–Y of `src/utils/slugify.ts` (compared with the real file).
  - Click a callee → navigation to that NPC; `getLocation()` changed accordingly.
  - The Codex count increments after talking; search finds the entry; a note persists after reload.
  - Esc closes the panel and game input works again.
- **Accessibility:** axe-core scan of the Code Panel and the Codex shows no serious violations; a keyboard-only test opens the panel, navigates callers and closes it.
- **Visual regression:** Code Panel open on a known NPC.

## Manual test script
1. `cq play fixtures/repos/tiny-ts`. Walk to the Capital and talk to `createTask` (or the equivalent).
2. Read the dialogue. Does it fit what you know about the function?
3. In the Code Panel, click a callee, then "Walk there". Follow the arrow.
4. Click *Open in editor*. VS Code opens at the right line.
5. Open the Codex (C), search for `format`, and add a note. Reload the page; the note is still there.
6. On **your own project**, talk to 10 characters. Count how many template lines felt true and useful. Record the number.

## Definition of done
- [ ] All tests green.
- [ ] Code shown always matches the real file (verified by test).
- [ ] At least 70% of template lines rated "true and useful" in your manual check (tune the rules if lower).
- [ ] Keyboard-only use works.

## Risks
| Risk | Mitigation |
|---|---|
| Template lines feel repetitive | Several variants per rule; rule priority; Phase 06 adds AI variety |
| Code Panel covers the game | Resizable panel; compact mode; Esc closes |
| Showing code from big files is slow | Fetch only the symbol's line range; cache in memory |

## Hand-off to the next phase
Phase 06 receives working NPC interactions, a dialogue box ready for richer
content, and fact sheets (all the data the Code Panel shows) that become the
AI's grounding (for every provider, including the user's own agent through MCP).

## Start prompt for Claude
```
Read AGENTS.md, docs/plans/README.md, the MASTER-PLAN sections listed in the
phase header, and docs/plans/phases/P05-npcs-code-codex.md.
Implement Phase 05 on branch phase/05-npcs-code-codex. Run the automated tests,
walk me through the manual test script, and fill in the Results section.
```

## Results (fill in after testing)
- Date: 2026-10-19, Windows, Node.js 24 / pnpm, Chromium headless.
- Automated tests: `pnpm test` passed **273 tests in 32 files**. New: template
  rule selection for every rule, placeholder filling, per-seed deterministic
  variants, the `tiny-ts` fact-sheet golden plus an independent re-derivation of
  callers/callees/tests from graph edges; the source reader returning exact file
  lines, refusing traversal (`../`, `src/../../`, absolute, backslash, drive
  paths, symlink when the OS allows it) and secret-skipped files (`.env*`, `.pem`,
  `secrets.json`, `node_modules`), masking without shifting line numbers, range
  limits; HTTP `facts.json`/`source` through `cq play`; GitHub link parsing and
  editor-URL validation; Codex store/search/filters/completion/export; crowd
  layout; guide routing; link building and range-only cached fetch.
  `pnpm e2e` passed **29 tests** (all earlier phases plus seven new): Code Panel
  text equals lines 2–8 of the real `src/utils/slugify.ts`; clicking callee
  `saveTask` → Teleport changes `getLocation()` to its building and greets it;
  Walk there sets a guide whose first waypoint is the building exit; the Codex
  count increments once per character, search finds `formatDate`, a note survives
  reload and exports to Markdown; E by proximity and a sprite click both talk, the
  world is frozen while the panel is open and moves again after Esc; a
  keyboard-only run (E, Tab, arrows/Home/End, Enter, Esc, Esc); axe on the Code
  Panel and Codex (zero violations of any impact, full page included); a Code
  Panel screenshot baseline. The three Phase 04 baselines were regenerated
  because NPC sprites replaced dots, and inspected. The 2,000-building stress
  world with NPC sprites averaged **16.75 ms/frame** (187 samples).
- Other checks: frozen-lockfile install, `pnpm check`, `pnpm build`, license
  check and `git diff --check` passed. The production bundle contains no
  `window.__CQ__`; Shiki grammars load as lazy chunks. Remote CI has not run; the
  CI e2e job now builds fixtures first.
- CLI smoke run by the agent: `pnpm cq -- play fixtures/repos/tiny-ts --no-open
  --port 4194` (cache hit, 194 ms) served `facts.json` with local links,
  `/world/source/<taskService>?start=20&end=24` returned the exact lines with
  `stale: false`, and an out-of-range request returned 416. The production page
  loaded, entered Port of api and opened the Codex showing 0 of 58 characters.
  `pnpm cq -- play . --no-open --port 4195` built this repository in **2,150 ms**
  (10 regions, 340 buildings, 1,021 NPCs, 848 monsters). Port 4184 was already
  occupied by an older server and was left untouched.
- Template usefulness score (x/10): **pending owner rating** (manual step 6).
  Agent pre-check on this repository, ten characters (`analyze`, `generate`,
  `discover`, `secretPath`, `prepareWorld`, `serveWorld`, `buildFactBook`,
  `findPath`, `maskLines`, `CodexStore`): 26 lines, all factually true by
  construction. The doc-quote, caller-count, complexity and tested-in lines were
  specific; async/I/O lines were true but generic. One awkward template
  ("Welcome to the class CodexStore household") was fixed to use the bare name.
  This is not the owner's "true and useful" rating.
- Not verified by the agent: VS Code actually opening from **Open in editor**
  (only the `vscode://` href was tested), a GitHub remote link on a real GitHub
  checkout, a full production-build conversation by walking (covered in the
  test build), physical gamepad or screen-reader use.
- Decisions / ADRs: [ADR 0008](../../adr/0008-npcs-code-panel-and-codex.md)
  records fact sheets, live local links and `--editor`, the world-relative
  `source/` path, dialogue rules, crowd layout, reduced motion, overlay/Shiki
  choices, navigation, Codex storage key and CI fixture build. Usage and module
  ownership are in `apps/game/src/explore/README.md`.
