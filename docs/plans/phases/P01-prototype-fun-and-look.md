# Phase 01: Prototype: Fun and Look

> **Milestone:** A · Prove the Fun · **Depends on:** 00 · **Effort:** ~1 week ·
> **Status:** In progress — prototype implemented on `phase/01-prototype`; human playtest and final adoption decisions pending
> **Read first:** MASTER-PLAN §2 (pillars 1, 2, 4), §7, §8, §21

## Goal
Answer the two riskiest questions **before** spending months on the full game:
1. **Is Code-Body Combat fun, and does it teach?** A playable fight against
   monsters whose bodies are real functions from Taskly.
2. **Does the art style work?** Gitling and a Gremlin rendered from Blender as
   pixel sprites, plus code-generated tiles, shown side by side with the
   placeholders.

The phase ends with a **go / adjust / fallback decision** recorded in ADRs.

## Why now
Combat is the heart of the game, and art is the biggest cost. Both are cheap to
test now and expensive to change later. This phase is deliberately a
**prototype**: hand-made data, quick code, real playtests.

## Scope

### In
- A dev-only scene `/prototype/combat` in `apps/game`.
- **Hand-authored CodeBody JSON** (MASTER-PLAN §16.4) for 3 functions from
  `tiny-ts`:
  1. `computeTaskStatus` (Spaghetti Serpent / Guardian-like, 2 phases).
  2. The `formatDate` pair (Mimic: two mirrored bodies).
  3. `checkPermissions` with one organ that can summon a minion (`loadTeam`).
- Hand-written questions for every action, with answers **checked by hand
  against the code and the fixture's tests** (documented in the JSON).
- The combat rules (MASTER-PLAN §7.3–§7.4): Energy, Focus, Read, Trace Strike,
  Sever, Disable Organ, Pierce Heart, Ask Gitling (fixed hints), Flee, the monster
  turn with input telegraph + token animation + exit prediction, and the minion
  summon.
- Minimal UI: the grid panel, a monster sprite, the Code Panel showing only
  revealed lines, an action bar, Focus and Energy meters.
- Keyboard controls for the grid (arrows, Enter, number keys).
- **Art style test** using **Blender MCP**: Gitling and a Gremlin, each in 4
  directions with a 4-frame idle animation, through the pixel pipeline.
- Prototype `tools/asset-pipeline` scripts: `pixelize` (palette snap, alpha
  threshold, 1-pixel outline) and `pack-atlas` (sprite sheet + Phaser atlas JSON).
- A code-generated tile sample: grass (3 variants), road, water, a stone wall.
- A playtest with **3–5 people** + a short survey.
- ADR 0003 (combat model) and ADR 0004 (art style).

### Out (later phases)
- Generating bodies from real code automatically (Phase 07). This phase is hand-made.
- The world, NPCs and quests (Phases 03–08).
- Final art (Phase 12). This is a style test only.

## Design

### Prototype data file
`apps/game/src/prototype/bodies/computeTaskStatus.json`:
```json
{
  "symbolId": "proto-computeTaskStatus",
  "source": "fixtures/repos/tiny-ts/src/services/taskService.ts",
  "cells": [
    { "id": "c1", "row": 0, "col": 0, "kind": "joint", "lines": [2, 2], "hp": 1, "limbId": "L1" },
    { "id": "c2", "row": 0, "col": 1, "kind": "heart", "lines": [2, 2], "hp": 1, "limbId": "L1" }
  ],
  "limbs": [{ "id": "L1", "jointId": "c1", "cellIds": ["c2"] }],
  "inputs": [
    { "args": [{ "done": true, "doneAt": 20, "dueDate": 10 }], "pathCellIds": ["c1","c3","c4","c5"],
      "exitHeartId": "c5", "source": "test-assertion", "evidence": "tests/taskService.test.ts:14" }
  ],
  "questions": [
    { "action": "sever", "cellId": "c3", "prompt": "Which task makes `task.done` true?",
      "choices": ["…"], "answer": 0, "evidence": "line 3 condition" }
  ]
}
```
(The full file lists every cell, limb, input and question.)

### Combat state machine
`PlayerTurn (spend Energy) → MonsterTurn (execute or smell attack) → check win/lose
→ PlayerTurn …`

All numbers live in one `balance.json` so the playtest can tune them live.

### What to observe in the playtest
| Question | How |
|---|---|
| Is it fun? | Survey: 1–5, and "would you fight another one?" |
| Does it teach? | After the fight, ask the player to explain `computeTaskStatus` in 2–3 sentences, then score their explanation for accuracy |
| Is the grid readable? | Watch: do players understand that rows are lines and columns are nesting without being told? (Note the time until they "get it") |
| Is the strategy real? | Do players Read everything (bad), or reason from shape (good)? |
| Is the monster's turn exciting? | Watch reactions to the token animation; ask "too slow/fast?" |

**Go criteria:** fun ≥ 3.8 average, explanation accuracy ≥ 70%, and at least half of
the players "get" the grid within 1 minute.

### Fallback
If the criteria fail after one round of tuning: keep the grid as a **visual body
map** (still useful in the Codex), but switch fights to the simpler
question-and-answer combat (questions targeting cells). Record it in ADR 0003.

### Art style test (Blender MCP)
1. Requires **Blender running with the MCP add-on**, connected to the Claude
   session.
2. Model Gitling (a small glowing creature) and a Gremlin (holding a "TODO" sign)
   as low-poly shapes with flat palette materials and toon shading.
3. Orthographic camera at the game angle; 32×32 renders, no anti-aliasing; 4
   directions × 4 idle frames.
4. Run `pixelize` → `pack-atlas`; load in the prototype scene next to the Kenney
   placeholders and the code-generated tiles.
5. Save `.blend` files in `art/blender/` (Git LFS); add every output to
   `packages/assets/LICENSES.md` (original, CC-BY-4.0).

## Tasks
- [x] Prototype scene + routing (dev only).
- [x] Hand-author the 3 body JSON files with questions, answers and evidence; double-check each answer against the code and tests.
- [x] Combat state machine + `balance.json`.
- [x] Grid panel UI (cell kinds by shape + icon + color), Code Panel (revealed lines only), action bar, meters.
- [x] Actions: Read, Trace Strike, Sever, Disable Organ, Pierce Heart, Ask Gitling (fixed hints), Flee.
- [x] Monster turn: telegraph, token animation (skippable), exit prediction; Mimic twin bodies; minion summon.
- [x] Keyboard controls.
- [x] Blender MCP: Gitling + Gremlin models and renders.
- [x] `tools/asset-pipeline`: `pixelize`, `pack-atlas`.
- [x] Code-generated tile sample.
- [x] Enforce the license manifest in the CI `license-check` job.
- [ ] Run the playtest; fill in the survey results.
- [x] ADR 0003 (combat: go / adjust / fallback) and ADR 0004 (art style). Both record adjust/hold pending human observations.

## Automated tests
- **Data validation:** each body JSON validates against the CodeBody schema; every cell's line range exists in the fixture file; every `pathCellIds` path follows real control flow (checked by hand-written assertions in the test).
- **Combat rules:** unit tests for Energy spending, limb severing (all limb cells destroyed), heart exposure, win and lose conditions, minion summon after 2 ignored turns.
- **E2E:** open `/prototype/combat` → win a fight using the correct answers (from the JSON) → victory screen; lose a fight with wrong answers → defeat screen.
- **Keyboard:** a full fight with the keyboard only.
- **Assets:** the sprite sheet loads in Phaser; the atlas JSON frames match the image size; the license check passes.

## Manual test script
1. `pnpm dev` → open `/prototype/combat`. Fight all three monsters.
2. Read the code of `computeTaskStatus` *after* the fight. Did the fight make it clearer?
3. Look at the art test page: Blender sprites vs placeholders vs code tiles. Which style do you like?
4. Run the playtest with 3–5 people (developers who don't know Taskly), using the observation table.
5. Decide go / adjust / fallback, and write the ADRs.

## Definition of done
- [x] All tests green (local automated checks; remote CI not run).
- [ ] Playtest done with recorded results.
- [x] ADR 0003 and ADR 0004 written with clear decisions (prototype accepted; final adoption pending playtest).
- [ ] If "go": the combat rules and `balance.json` become the starting point for Phase 07.

## Risks
| Risk | Mitigation |
|---|---|
| Players don't understand the grid | Onboarding hint ("rows are lines, columns are nesting"); test again |
| Blender MCP unavailable | Make the sprites by hand in LibreSprite/Piskel for the test; revisit later |
| The prototype becomes the product | Keep it in `src/prototype/`; Phase 07 rebuilds it properly |

## Hand-off to the next phase
Phase 07 receives the validated combat rules, balance numbers, UI learnings and
ADR 0003. Phase 12 receives the art direction (ADR 0004) and the pipeline scripts.
Phase 02 can start in parallel right after Phase 00.

## Start prompt for Claude
```
Read AGENTS.md, docs/plans/README.md, the MASTER-PLAN sections listed in the
phase header, and docs/plans/phases/P01-prototype-fun-and-look.md.
Implement Phase 01 on branch phase/01-prototype. For the art style test, use the
Blender MCP (tell me if it isn't connected). Hand-author the body JSON and
double-check every answer against the Taskly fixture code and tests.
When finished, run the automated tests and give me the playtest kit.
```

## Results (fill in after testing)
- Date: 2026-10-19 (Windows, Node 24.20.0, pnpm 10.33.1).
- Implementation: continued the interrupted work on `phase/01-prototype`.
  Three hand-authored monsters, a pure combat engine, Preact combat UI, keyboard
  grid controls, revealed-code panel, fixed hints, flee memory, two Serpent
  phases, mirrored Mimic bodies, Gatekeeper summon, telegraphs and skippable
  path animation are implemented. The dev/test pages are `/prototype/combat/`
  and `/prototype/art/`; production contains neither prototype nor answer data.
- Automated tests:
  - `pnpm install --frozen-lockfile`: passed.
  - `pnpm test`: **132/132 tests passed in 24 files**. Includes 33 body/ground-
    truth tests (every scored question, fixture source/ranges, references and
    literal control-flow paths), 18 combat-rule tests, three asset pipeline
    golden/determinism tests and all existing Phase 00 checks. No fixture code
    was executed by the answer audit.
  - `pnpm e2e` with `CQ_E2E_PORT=4181`: **14/14 passed** in headless Chromium.
    Includes victories for all three monsters, defeat after wrong answers and
    predictions, a full keyboard-only fight, hidden/revealed lines, minion
    summon, flee damage, token animation/skip, Phaser atlas load and axe checks
    on combat questions, victories and the art study; Phase 00 walking checks
    also pass. The test server is rebuilt each run, with two workers.
  - `pnpm check`: Biome (107 files) and strict TypeScript passed.
  - `pnpm build`: passed; the production-bundle test additionally checks for
    absence of prototype UI text and question IDs.
  - `pnpm license-check -- --enforce`: passed for shipped assets and all 34
    Blender source/raw-frame files; CI now enforces this check.
  - `pnpm --filter @codebase-quest/asset-pipeline assets`: passed. Two Blender
    renders and pipeline builds produced the golden-tested sprite pixels.
    32 frames, a Phaser atlas and six tiles are available. Git LFS attributes
    were checked for `.blend` and raw `.png` files; CI's test checkout fetches LFS.
  - `git diff --check`: passed. No remote CI run, push or PR was performed.
  - During development, browser checks exposed a stale reused preview server,
    keyboard handler timing, code-scroll keyboard access, label mismatch and
    low line-number contrast. These were fixed before the passing final E2E run.
- Blender: **connected**, using Blender 5.1.2's installed local MCP add-on on
  port 9876. Created original Gitling and TODO Gremlin models in a separate
  scene; rendered four directions × four idle frames per character at 32px;
  saved study-only `.blend` sources and raw frames under `art/blender/prototype/`.
  The authored Python and transport are included for reproduction. The pixel
  pipeline applies 32-color palette snap, alpha threshold and a one-pixel outline.
- Manual inspection: combat UI and art study opened in the in-app browser.
  The owner has not yet run the manual smoke script or recruited participants.
  [Playtest kit](../../playtests/phase-01/README.md) includes the manual script,
  facilitator instructions, rubric, thresholds and a copyable session survey.
- Playtest (fun / explanation accuracy / time to understand the grid):
  **Not run. No participant results exist.** Phase 01 remains in progress.
- Decision (go / adjust / fallback): **Adjust / hold adoption pending playtest**.
  [ADR 0003](../../adr/0003-combat-model.md) records the prototype's trace/heart
  interpretation, fixed clock, implicit-return heart and two-phase presentation.
  Apply the planned go criteria only after 3–5 real sessions; tune once before
  choosing fallback if needed.
- Art style decision: **Adjust / evaluate the study before final adoption**.
  [ADR 0004](../../adr/0004-art-style.md) records the Blender MCP transport,
  flat hard-band rendering, palette/outline cleanup and provenance. In particular,
  collect human feedback on the tiny TODO sign and direction readability.
