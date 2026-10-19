# Phase 09: Bosses and Dungeons ★ MVP

> **Milestone:** D · The Game · **Depends on:** 07, 08 · **Effort:** 2–3 weeks ·
> **Status:** Not started
> **Read first:** MASTER-PLAN §7, §9, §13, §15

## Goal
Every region gets a **Guardian** (its hotspot) with a multi-phase **body that
rearranges each phase**. Changed hotspots come back as **Evolved Guardians**.
Pipelines become **Hydras** (chained bodies). Deep call chains become **Call-Stack
Dungeons**. God classes, huge files and cycles become **mini-bosses**. The
kingdom ends with the **Architect's Shadow**. After this phase, Codebase Quest is
a **complete MVP**, playable from start to finish, and it's playtested.

## Why now
Bosses make understanding the *most important* code feel epic, and they give the
main story an ending.

## Scope

### In
- Hotspot scoring and Guardian selection (one per region with ≥ 15 symbols).
- Boss framework: phase sub-grids (one per main branch), telegraphs (real inputs),
  weak point (Path Finder), enrage (error path), intro cards, arena camera lock,
  rewards.
- **Boss evolution:** a code-hash change → Evolved Guardian + "The Guardian
  Returns" quest.
- New questions: **Map Maker**, **Responsibility Sort** (partially scored).
- Hydra flow bosses (pipelines → chained bodies).
- Call-Stack Dungeons (descend and ascend).
- Mini-bosses: Titan, Golem, Ouroboros.
- The Architect's Shadow (3 phases) + ending sequence.
- Boss, dungeon and finale quests in the main story; 3★ mastery.
- **MVP checkpoint:** a full run, a real-repo run, a playtest with 5 people, a retro.

### Out (later phases)
- Heralds (seasonal bosses) need release history (Phase 11).
- Raid bosses (Phase 14); Trial bosses on real issues (Phase 10).
- Final boss art and music polish (Phase 12).

## Design

### Hotspot score
```
hotspot = 0.35·norm(cyclomatic) + 0.25·norm(churn) + 0.20·norm(fanIn)
        + 0.10·norm(loc) + 0.10·norm(maxNesting)
```
`norm` = percentile rank in the repo. Pick the top symbol per region that yields
at least 2 phases with valid questions. Exclude test and generated code. Ties are
broken by ID.

### Boss naming
A template generator combines a title and an epithet from traits ("Grimtax,
Guardian of the Billing Vault"); it can be rephrased by the content engine. **The
real function name is always shown under the boss name.**

### Guardian fight
- **Phases:** the top-level branches of the hotspot (max 4). Each phase shows only
  that branch's **sub-grid** (cells of that limb + shared cells), so big functions
  stay readable.
- **Telegraphs:** body inputs (Phase 07) that run through the current phase's
  sub-grid; the player predicts the exit heart.
- **Weak point:** Path Finder on the phase's joint → critical damage.
- **Enrage (last 20%):** if the function has `try/catch` or error returns, "What
  happens when `<call>` fails?" (ground truth: the catch block / error path).
- **Rewards:** a Legendary Codex body map (special frame), XP, gold, a cosmetic
  trophy, a region light burst (involved symbols → `mastered`), the 3★ condition.

### Boss evolution
- Each Guardian stores the **code hash** of its function at defeat time.
- On a new commit, if the hash changed, the Guardian is marked **Evolved**: a new
  body from the new code and a new name suffix ("Grimtax the Reforged"), via the
  quest **"The Guardian Returns"** with a diff preview of what changed.
- Defeating an Evolved Guardian restores the region's 3★ status.

### Map Maker
- The overworld silhouette with empty region slots; drag region tokens into slots,
  then draw roads.
- Score = 0.5 × (correct placements) + 0.5 × (F1 of drawn roads vs the real
  top-weighted region edges). Win ≥ 70% (Story 55%, Expert 85%).

### Responsibility Sort (Titan)
Methods are clustered by shared fields and mutual calls (deterministic). The
player paints each method cell with one of 2–4 colors. **Scored pairs only:**
methods with no shared fields and no calls must differ; methods sharing many fields
must match. Other pairs are opinion.

### Hydra (flow boss)
- **Pipelines:** ordered `app.use(...)` / `router.use(...)` + the handler; Python
  decorator stacks; ≥ 4 sequential exact calls in an entry function.
- **Mechanic:** each head is one stage, shown as a small body. Choose the next head
  in execution order; a wrong choice makes a head regrow (−Focus). Each defeated
  head shows a one-line description of its stage.

### Call-Stack Dungeons
- Chains from Phase 03's entrances (exact edges, depth ≥ 4, max 8 floors).
- **Descend:** each floor is a small seeded room with the function's NPC and a quick
  question on why it calls the next function (Trace / Fill the Gap).
- **Bottom:** the deepest function as a 2-phase mini-boss body.
- **Ascend, carrying the return value:** on each floor, "What does this caller do
  with the result: return it, check it in a condition, pass it to another call, or
  ignore it?" (ground truth: syntax-tree usage of the call result), plus the line.

### Mini-bosses
| Mini-boss | Fight |
|---|---|
| **Titan** | Responsibility Sort on a giant method grid + Who Calls? on its busiest methods |
| **Golem** | A body of section blocks; match top-level symbols to sections (name-based ground truth only) |
| **Ouroboros** | A ring grid of the cycle's modules; select all members of the strongly connected component |

### The Architect's Shadow
- Unlocks when all Guardians are defeated (Story: 70%).
- Phase 1, **The Fog Returns:** Map Maker. Phase 2, **The Great Paths:** match the
  main story flows to their start and end. Phase 3, **Final Strike:** a harder Hydra
  rematch, with no hints.
- **Victory:** an ending sequence and credits (regions, plus contributors only if
  Phase 11 opt-in data exists). The **Hero's Trial unlocks** (Phase 10; a "coming
  soon" placeholder until then).

### MVP checkpoint
1. **Full run:** a new game on `tiny-ts` to the ending, without debug tools.
2. **Real repo:** a pinned mid-size repo; at least 3 regions + 1 Guardian.
3. **Playtest with 5 people** new to the repo: 30 minutes of play → explain the
   architecture in 2 minutes → find where X happens in the real code without the
   game. Survey: fun (1–5), learned (1–5), confusing moments, "would you use it at
   a new job?" **Targets:** fun ≥ 3.8, learned ≥ 4.0, ≥ 3 of 5 explain the
   architecture correctly.
4. **MVP retro** (keep / change / cut) in Results.
5. **Announcement-ready?** If the targets are met, record a GIF for the devlog
   (MASTER-PLAN §22.3).

## Tasks
- [ ] Hotspot scoring + Guardian selection + naming.
- [ ] Boss framework: phase sub-grids, telegraphs, weak point, enrage, intro card, arena lock, rewards.
- [ ] Boss evolution (hash tracking, Evolved Guardian, quest).
- [ ] Map Maker UI + scoring.
- [ ] Responsibility Sort clustering + partial scoring.
- [ ] Pipeline detection + Hydra.
- [ ] Call-Stack Dungeons (floors, rooms, descend/ascend questions, result-usage classifier).
- [ ] Titan, Golem, Ouroboros.
- [ ] The Architect's Shadow + ending + credits.
- [ ] Boss, dungeon and finale quests in the story generator; 3★ mastery.
- [ ] Extend the bot playthrough to the ending.
- [ ] Playtest kit (script, survey, results template).

## Automated tests
- **Hotspot:** hand-computed ranking for `tiny-ts` (`computeTaskStatus` guards the Capital).
- **Boss invariants:** every eligible region has a boss; every phase has at least one valid scored question; a perfect bot always wins; a random bot wins under 10% in Normal mode.
- **Evolution:** change the hotspot in a fixture commit → Evolved Guardian appears with a new body; an unchanged commit → no evolution.
- **Map Maker scoring:** known inputs → known scores.
- **Pipelines:** the detected middleware order equals the registration order in an Express fixture.
- **Dungeons:** floors = chain depth (capped); result-usage answers re-derived from the syntax tree.
- **Bot playthrough (CI):** new game → ending on `tiny-ts`.
- **E2E:** one Guardian fight, one Hydra, one dungeon descent and ascent through the UI.

## Manual test script
1. Fight the Capital's Guardian on `tiny-ts`. Do the phases match the real branches?
2. Change `computeTaskStatus` in the fixture, commit, relaunch. Does the Evolved Guardian appear?
3. Do the `shareTask` dungeon. Does climbing back up teach you how results flow?
4. Beat the Architect's Shadow. Was the Map Maker fair?
5. Run the **MVP checkpoint** and write the retro.

## Definition of done
- [ ] All tests green; the bot finishes the game in CI.
- [ ] MVP checkpoint completed and targets met, **or** a written change plan before continuing.
- [ ] MVP retro written.

## Risks
| Risk | Mitigation |
|---|---|
| Boss fights feel long | Max 4 phases; sub-grids; quick animations; tuning |
| Hotspots are boring utility code | Exclusions; maintainer overrides (Phase 15) |
| The Map Maker frustrates | Generous Story thresholds; a practice mode at the Library |

## Hand-off to the next phase
Phase 10 receives the boss framework (Trial bosses from tests) and the post-finale
unlock. Phase 11 receives Guardian hashes for Heralds. Phase 12 receives the full
content to polish.

## Start prompt for Claude
```
Read AGENTS.md, docs/plans/README.md, the MASTER-PLAN sections listed in the
phase header, and docs/plans/phases/P09-bosses-dungeons.md.
Implement Phase 09 on branch phase/09-bosses-dungeons, reusing the CodeBody
builder, evaluator and question library from Phase 07. Run the tests, extend
the bot playthrough to the ending, then give me the MVP checkpoint kit.
```

## Results (fill in after testing)
- Date:
- Automated tests / bot playthrough:
- Playtest (fun / learned / explained architecture):
- MVP retro (keep / change / cut):
- Decisions / ADRs:
