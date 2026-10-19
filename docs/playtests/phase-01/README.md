# Phase 01 playtest kit

Build status: ready for a human playtest. No participant sessions have been run or invented.

## Start the prototype

Use Node 24, pnpm 10 and Git LFS. In the repository root:

```sh
pnpm install --frozen-lockfile
git lfs pull
pnpm dev
```

Open http://localhost:5173/prototype/combat/ for combat and
http://localhost:5173/prototype/art/ for the art study. If Vite reports a different
port, use that port. These routes are development/test-only; `pnpm build` omits
them and the question data.

Controls: Tab through controls; arrows move in a body; Enter selects a cell;
1 Read, 2 Trace Strike, 3 Sever, 4 Disable Organ, 5 Pierce Heart,
6 Compare Twins, 7 Ask Gitling, 8 Flee; E ends your turn.
When a question or incoming prediction is open, numbers pick its choices.
Story reveals the code; Normal starts hidden; Expert hides the kind icons.
Token animations can be skipped; reduced-motion preferences skip them by default.

## Owner's manual smoke test

1. Fight the Serpent, Mimic and Gatekeeper. Try Read, Trace, Sever, Pierce and
   Gitling. Check Focus, Energy and the battle notes after mistakes and blocks.
2. End two Gatekeeper turns without disabling its organ: `loadTeam` appears.
   Restart, disable the organ and verify it stays quiet.
3. Damage an enemy, flee and return within 60 seconds: its wounds persist.
   Flee again, wait over 60 seconds and return: wounds have expired.
4. In the Serpent fight, watch the second phase at two remaining hearts.
   Predict an exit, watch the token and use Skip animation now.
5. Win one fight using only the keyboard. Try a narrow window and scrolling the
   code panel horizontally with the keyboard.
6. After the Serpent fight, read its complete source in the victory body map.
   Explain what the function does before opening the fixture source itself.
7. Open the art study: both characters have south/east/north/west idle loops.
   Pause/resume; compare with Kenney placeholders and all six generated tiles.
   Check the TODO sign at native scale and at integer scaling.

## Recruit and run (3–5 people, about 15 minutes each)

Recruit developers who don't know Taskly. Assign anonymous IDs P1–P5; collect no
names or recordings unless they separately consent. Keep observation notes local.
Start each participant on Normal with a fresh page load. Don't show the source,
answer data, tests or facilitator rubric before their explanation.

1. Say: “Try this short fight. Think aloud if you like. You can stop whenever
   you want.” Do not explain rows/columns yourself. The onboarding card is part
   of the product under test; record whether they read it.
2. Start a stopwatch when the grid appears. Record when the participant correctly
   describes rows as statement order and columns as nesting depth. Use “not yet”
   if they never do. Ask for their interpretation at 60 seconds if needed,
   without teaching it until after the observation is recorded.
3. Let them fight the Serpent. Record action choices, reads, hints, mistakes,
   reactions to input telegraphs and tokens. Avoid rescuing unless stuck; record
   any help and changes to Story difficulty.
4. Immediately ask: “Explain computeTaskStatus in two or three sentences.”
   Write down the explanation before opening the revealed source. Score it using
   the rubric below. Allow the player to read the code afterwards and discuss.
5. Invite them to fight the Mimic and Gatekeeper. Watch if they discover the
   differing method and the organ's two-turn summon.
6. Show the art study and collect the short survey in `session-template.md`.

## Explanation rubric (facilitator only, after the fight)

Use the actual text in `fixtures/repos/tiny-ts/src/services/taskService.ts:6`
and the literal assertions in `tests/taskService.test.ts`; never run fixture code.
Award 0 or 1 for each accurately explained point:

1. The no-due-date early exit and its priority.
2. The completed-task branch and how finishing time relates to the due date.
3. Equality at the due date (the strict comparison).
4. The incomplete-task branch and how the current clock affects it.
5. The two different paths to the same open status.

Accuracy = points / 5 × 100%. An omission scores 0; do not infer knowledge the
participant did not express. Keep the raw explanation alongside the score.

## Record and decide

Copy `session-template.md` once per anonymous participant. Fill the summary table
below with actual measurements. Do not replace missing measurements with zero.

| ID | Fun 1–5 | Explanation /5 | Grid understood, seconds | Read count | Another fight? | Art preference |
|---|---|---|---|---|---|---|
| P1 | pending | pending | pending | pending | pending | pending |
| P2 | pending | pending | pending | pending | pending | pending |
| P3 | pending | pending | pending | pending | pending | pending |

Go requires **all three**: mean fun ≥3.8; mean explanation accuracy ≥70%;
at least half of participants understand the grid within 60 seconds (round the
required participant count up). Report denominators and difficulty/help used.
Also review whether players reasoned from structure or read every cell, whether
token speed felt right, and which silhouettes/signs were legible.

If the first round misses a threshold, tune `balance.json` once and repeat with
3–5 fresh participants, recording both rounds. If the tuned round still fails,
keep the body map and select the simpler question-and-answer combat fallback.
Update ADR 0003, ADR 0004, the Phase 01 Results and the plans status table only
after the observations exist. Passing automated tests is not a go decision.

## Automated checks and art reproduction

```sh
pnpm test
pnpm check
pnpm e2e
pnpm license-check -- --enforce
pnpm build
pnpm --filter @codebase-quest/asset-pipeline assets
```

Playwright always starts a freshly built test server with two workers. If 4173 is
occupied, PowerShell users can run `$env:CQ_E2E_PORT='4181'; pnpm e2e`.
The art rebuild needs raw renders from Git LFS, not Blender. To rerender, run
Blender 5.1 with its local MCP add-on listening on 9876, then from the repo root:

```sh
node tools/asset-pipeline/scripts/blender-mcp.mjs tools/asset-pipeline/scripts/render-prototype.py
pnpm --filter @codebase-quest/asset-pipeline assets
```

The script creates a separate scene and restores the original scene. It saves
Gitling/Gremlin source copies and 32 raw frames under `art/blender/prototype/`.
Standalone `pixelize` and `pack-atlas` commands are also available in that package.
All output has CC-BY-4.0 entries in `packages/assets/LICENSES.md`; AI assistance
and code rework are disclosed there. No final art direction is claimed yet.
