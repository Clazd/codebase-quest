# Phase 07: Code-Body Combat and Question Library

> **Milestone:** D · The Game · **Depends on:** 01 (prototype decision), 05 (06
> optional for explanations) · **Effort:** 2.5–3 weeks · **Status:** Implemented and tested; owner playtest pending
> **Read first:** MASTER-PLAN §7, §8, §10.2, §16.4, ADR 0003 (from Phase 01)

## Goal
Every code smell in the world becomes a **monster whose body is its real code**.
Bodies are **generated automatically** from the syntax tree. Fights use the
Energy/Focus rules validated in the Phase 01 prototype. Every scored action is
backed by ground truth (call graph, syntax tree, test assertions, mutations, the
safe evaluator). Defeated monsters are **tamed**, their bodies become **Codex
maps**, and the **Bestiary** records the real smells.

## Why now
This turns the world into a game, and it's how comprehension gets measured
(`read → understood`) for Kingdom Light in Phase 08.

## Scope

### In
- `packages/combat`: **CodeBody builder** (syntax tree → cells, limbs, hearts,
  organs, armor, grouping), the **safe evaluator**, **body inputs** (monster
  turns), the combat rules engine (deterministic state machine), monster
  behaviors (the grid twists per monster).
- `packages/puzzles`: the **question library** (MASTER-PLAN §7.8) with generators
  + validators, used by actions.
- Monsters in the world: patrol, aggro, sneak, telegraph visuals, tamed critters.
- The combat scene: grid panel, monster sprite, Code Panel (revealed lines),
  action bar, meters, token animation, minions.
- Hints: potions + the Gitling ladder (built from evidence, never answer keys).
- Explanations: templates, optionally rephrased by the content engine (agent
  prebuild or providers).
- Codex body maps; the Bestiary + export.
- Difficulty modes; accessibility (keyboard, screen reader, shapes + icons).
- A balance simulator.

### Out (later phases)
- Guardians, Hydras, dungeons, mini-boss special fights, the final boss (Phase 09).
- Saving XP and inventory (Phase 08); kept in memory here.
- Final art (Phase 12).

## Design

### CodeBody builder
1. Walk the function's syntax tree **statement by statement**: each statement is a
   cell. `row` = order of appearance; `col` = nesting depth relative to the
   function body.
2. **Kinds:** branch statements (`if`, `else if`, `switch` cases, loops) →
   `joint`; `return` / final `throw` → `heart`; statements whose main expression is
   a call to a symbol with an **exact** edge → `organ` (`calleeId` set); `try`
   blocks and `catch` clauses → `armor`; everything else → `body`.
3. **Limbs:** each joint owns every cell nested under it (its block, recursively).
4. **HP:** 1 (≤ 8 tokens), 2 (≤ 20), 3 (> 20).
5. **Grouping:** while cells > 40, merge the longest run of consecutive `body`
   cells at the deepest level into one grouped cell (`grouped = n`). Joints,
   hearts, organs and armor are never merged.
6. Output is deterministic (sorted, stable IDs) and validated with zod.

### The safe evaluator
- Supports literals, parameters bound to literal inputs, property access on
  literal objects, comparisons, `!`, `&&`, `||`, ternaries, `length`/`len()` of
  literal strings and arrays.
- **Anything else** (calls, `Date.now()`, globals, mutation) → "not evaluable".
- Used for Sever questions (Path Finder), Trace Strike paths and monster turns.

### Body inputs (for monster turns)
Two sources, both ground truth:
1. **Test assertions:** a `TestAssertion` whose call targets this function and
   whose expected value equals the literal of **exactly one** heart → that heart is
   the exit; the path is computed by the evaluator if possible, otherwise only the
   exit is used ("predict the exit" without a drawn path).
2. **Evaluator inputs:** boundary values from literals in the conditions (e.g. 10 →
   9, 10, 11), kept only if the whole path is evaluable.

If a function has neither, its monster uses smell attacks only.

### Combat rules
Start from Phase 01's `balance.json` and ADR 0003. Rules follow MASTER-PLAN
§7.3–§7.4: Focus (HP), Energy (6 per turn), actions and costs, exposure of
hearts, minion summons from ignored organs (a mini body of the callee, 3–5 cells,
1 Focus damage per turn until defeated), victory at monster HP 0 or all hearts
pierced, defeat at Focus 0 (back to the region entrance; no other loss).

### Actions → questions (all scored ones have ground truth)

| Action | Question generator | Fallback if not applicable |
|---|---|---|
| Trace Strike | Path for input X (evaluator/test) | **Order the Steps** on the calls in the body (always available) |
| Sever | **Path Finder** on the joint's condition | **Fill the Gap** on the condition |
| Disable Organ | **Fill the Gap** on the callee name (choices: in-scope functions) | **Type Sense** on the callee's return type |
| Break Armor | **Lost Error** (calls inside the try) | — (armor cells always contain a try) |
| Pierce Heart | **Predict** from test assertions | Evaluator-based "which value is returned for X?" |
| Monster turn | Exit prediction | Smell attack |

Other question types in the library: **Trace** and **Who Calls?** (used by Ghost
fights and quests), **Mutant Hunt** (Mutant twist), **Responsibility Sort** and
**Map Maker** (Phase 09).

**Mutation operators** (Mutant twist): flip a comparison, swap `&&`/`||`, remove a
`!`, `+1` ↔ `-1`, swap two arguments, `return x` → `return null`. The mutated code
must still parse.

### Monster twists (MASTER-PLAN §8)
| Monster | Implementation |
|---|---|
| Gremlin | Body + one TODO cell; "classify the TODO" (opinion: XP only) calms it |
| Spaghetti Serpent | Standard body; spawns at level by complexity |
| Mimic | Two bodies side by side; the differing cells come from a diff of the two copies (ground truth); hitting the right one = critical |
| Mutant | Mutated body; the corrupted cell spreads one neighbor per monster turn (visual only; the answer stays the original line) |
| Ghost | No tethers drawn to callers; **Who Calls?** with "Nobody" correct |
| Wisp | Investigate the evidence → choose Dead / Used dynamically / Not sure (unscored; note saved) |
| Labyrinth Minotaur | Path Finder to the deepest cell |
| Imp | Sparkling literal cells; name the constant (opinion) |
| Wraith | Extra armor cells |
| Shapeshifter | Type Sense on the untyped parameters |
| Echo | Match parameters to the cells that use them (syntax-tree references) |
| Shadow | Choose an input that reaches the untested branch (evaluator) |

### Combat scene layout
```
┌──────────────────────────┬──────────────────────────────┐
│ Monster sprite + twist   │ BODY GRID (cells)            │
│ telegraph / token anim   │  [◆][♥]                      │
│                          │  [◆]                         │
├──────────────────────────┤     [◆]                      │
│ Question (when an action │        [♥]   …               │
│ needs one): A B C D      ├──────────────────────────────┤
│                          │ Code Panel: revealed lines   │
├──────────────────────────┴──────────────────────────────┤
│ Focus ███  Energy ●●●●●○  [Read][Trace][Sever][Organ]… │
└──────────────────────────────────────────────────────────┘
```

### After the fight
- The monster is **tamed** (a friendly critter in the region).
- The **body map** goes into the Codex entry of that function.
- The **Bestiary** entry shows the smell, its location, evidence (value vs
  threshold), "how to fix it in real life" (template, optionally rephrased), and
  your notes. **Export Bestiary** produces a markdown tech-debt report.
- Symbols involved in correct scored actions move to `understood`.

### Hints
- **Hint Potion:** remove two wrong choices, or reveal one hidden cell.
- **Gitling ladder:** nudge → pointer (highlights cells) → explanation (costs a
  potion). Built from the question's evidence; the answer key never leaves the
  combat engine.

### Debug API additions
```ts
startFight(smellId: string): Promise<void>;
getFight(): { body: PublicCodeBody; focus: number; energy: number; monsterHp: number } | null;
act(action: ActionId, target?: string, choice?: number): Promise<{ correct?: boolean }>;
__testAnswerKey(): number | null;   // test builds only
```

## Tasks
- [x] CodeBody builder (+ grouping) with zod schema and goldens.
- [x] Safe evaluator + body inputs (test-assertion and evaluator sources).
- [x] Question library generators + validators (all types listed above, except Phase 09's).
- [x] Mutation engine.
- [x] Combat rules engine (from the prototype's balance and ADR 0003).
- [x] Monster entities in the world (patrol, aggro, sneak, telegraph, tamed critters).
- [x] Combat scene UI (port and harden the Phase 01 prototype UI).
- [x] Monster twists for every Bestiary monster.
- [x] Minions from organs.
- [x] Hints and the Gitling ladder.
- [x] Explanations (template + content-engine hook).
- [x] Codex body maps; Bestiary + export.
- [x] Difficulty modes; accessibility (keyboard, ARIA announcements, shapes + icons).
- [x] Balance simulator (simulated players at 40/60/80% accuracy).
- [x] Debug API additions.

## Automated tests
- **CodeBody goldens** for every function in `tiny-ts` and `smelly-ts`.
- **CodeBody invariants (all fixtures + property tests):** every cell maps to real lines; rows follow source order; each limb contains exactly the cells nested under its joint; every `return` is a heart; organs only on exact edges; ≤ 40 cells.
- **Prototype parity:** the generated body for `computeTaskStatus` matches the structure of the hand-made Phase 01 JSON (cells, limbs, hearts).
- **Evaluator truth tables;** unsupported expressions are rejected.
- **Ground-truth re-derivation:** every generated scored question re-derived independently; exactly one correct answer; distractors verified wrong.
- **Body inputs:** every test-assertion input maps to exactly one heart; every evaluator path is consistent with the conditions.
- **No-answer guarantee:** a spy on all content providers and the MCP server proves no answer key is ever sent or exposed during fights.
- **E2E:** fight one monster of each type in `smelly-ts` using `__testAnswerKey`; lose a fight; flee a fight; a minion appears after 2 ignored organ turns.
- **Balance:** at 60% accuracy, level-1 fights last 3–6 turns; the Story-mode defeat rate is under 15%.
- **Accessibility:** a keyboard-only fight; ARIA live announcements for cells, questions and monster turns; axe-core clean.

## Manual test script
1. `cq play fixtures/repos/smelly-ts`. Fight one of each monster.
2. After each fight, ask yourself: *Did I learn something true about this code?* (1–5)
3. Look at the Codex body map of `computeTaskStatus`. Is it a good summary?
4. Play 15 minutes on **your own project**; note any action that felt wrong, with its ID from the debug overlay.
5. Export the Bestiary. Does it read like a useful tech-debt report?

## Definition of done
- [x] All tests green, including re-derivation and the no-answer guarantee.
- [x] Every monster type fightable on `smelly-ts`.
- [ ] "Learned something true" average ≥ 4.
- [ ] Zero wrong answer keys found in manual play (each one found → regression test + fix).

## Risks
| Risk | Mitigation |
|---|---|
| Generated bodies are unreadable for complex code | Grouping, 40-cell cap, phase sub-grids for bosses |
| Few evaluable inputs in real code | Test assertions + fallbacks; smell attacks |
| Fights drag | Balance simulator; Energy tuning; skippable animations |

## Hand-off to the next phase
Phase 08 receives fights that award XP and items, `understood` states, Bestiary
data and body maps to save. Phase 09 receives the body builder, evaluator and
question library for bosses.

## Start prompt for Claude
```
Read AGENTS.md, docs/plans/README.md, the MASTER-PLAN sections listed in the
phase header, ADR 0003, and docs/plans/phases/P07-code-body-combat.md.
Implement Phase 07 on branch phase/07-code-body-combat, starting from the
Phase 01 prototype's rules and UI. Every scored question must have a test that
re-derives its answer independently. Run the tests and walk me through the
manual script when done.
```

## Results (fill in after testing)
- Date: 2026-10-19, Windows, Node 24 / pnpm 10.33.1.
- Implementation: continued Claude's interrupted work on
  `phase/07-code-body-combat`. Generated syntax-tree bodies and safe inputs,
  pure combat rules based on Phase 01, mutations, all twelve monster twists,
  patrol/aggro/sneak/taming, minions, evidence hints, consumables, session XP,
  lazy local encounters, cleared Codex maps and editable/exportable Bestiary
  records are implemented. Optional prebuilt afterwords use only FactSheets;
  they never receive questions, choices, answer keys or input routes.
- Automated tests:
  - `pnpm install --frozen-lockfile`: passed.
  - `pnpm test`: **371/371 passed in 43 files**. New coverage includes body
    goldens/determinism for all 123 function/method/class bodies in `tiny-ts`
    and `smelly-ts`, source/limb/heart/exact-edge invariants on all six fixtures,
    grouping cases, prototype parity, evaluator truth tables and unsupported
    paths, all six mutation operators, consumables, minions and terminal rules.
    **293 generated scored questions** are independently re-derived from raw
    syntax, graph edges, assertions, diffs and mutations; every distractor is
    checked. The oracle does not call the production evaluator and no fixture
    code is imported or executed. Additional library tests cover Trace, Who
    Calls and Type Sense even when another action fallback is selected.
  - Provider spies (agent/sampling/Ollama/API) and a real in-memory MCP transport
    pass the no-answer boundary checks during a generated fight. The browser's
    public fight/debug views omit answers and routes. Production bundles omit
    the debug API and `__testAnswerKey`; ordinary development has no test key.
  - `CQ_E2E_PORT=4297 pnpm e2e` (PowerShell: set `$env:CQ_E2E_PORT='4297'`
    first): **46/46 passed** in headless Chromium. Includes a generated victory
    or honest investigation for all twelve monster types, Bestiary notes and
    Markdown download, defeat/flee, real callee minions after two ignored turns,
    a keyboard-only generated fight, ARIA and axe checks, and all earlier
    prototype/world/NPC/Gitling regressions. Existing screenshots pass without
    baseline changes. Stress world: 16.84 ms/frame in the final run.
  - `pnpm check`, `pnpm build`, `pnpm license-check -- --enforce` and
    `git diff --check`: passed. Combat was visually inspected from a browser
    screenshot; long grids scroll within the panel and actions stay reachable.
  - The full suite exposed an older concurrent test-session collision; bridge
    tests now have a private temporary home. Browser runs exposed contrast and
    accessible-name defects plus a transition/debug-scene race; all were fixed.
- Balance: `pnpm balance:combat` analyzed both fixtures without executing them:
  **54 encounters**, 1,080 Story fights per accuracy setting. At 40/60/80%
  accuracy, mean durations were **4.589 / 3.071 / 2.331 turns**, defeat rates
  **0.278% / 0% / 0%**, and no timeouts. The documented level-1 normalization
  experiment ran 2,040 Normal fights at 60% accuracy: **3.159 mean turns**,
  **0.294% defeats**, no timeouts. Instant investigations/proofs are excluded
  from that pacing average; real fixture severities start at level 2.
- "Learned something true" average: **not measured; owner playtest pending**.
  Automated victories are not evidence of fun, learning or adoption. Use the
  [manual walkthrough and observation sheet](../../playtests/phase-07/README.md).
- Wrong-key actions found (should be 0): **0 in the automated fixture audit**;
  manual count is **not measured**. A manual wrong key must become a regression
  test before marking this phase done. Own-project 15-minute play is pending.
- Decisions / ADRs: [ADR 0010](../../adr/0010-generated-code-body-combat.md)
  records the conservative fallbacks, prototype clock-cell interpretation,
  minion sizes, irreducible-body limit, provisional Serpent layout, safe optional
  afterwords and balance normalization. ADR 0003's human adoption decision
  remains open. No push, PR, merge, remote CI or GitHub setting change was made.
