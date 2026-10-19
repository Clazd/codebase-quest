# Phase 08: Quests, Progression and Saves

> **Milestone:** D · The Game · **Depends on:** 07 · **Effort:** 2–2.5 weeks ·
> **Status:** Not started
> **Read first:** MASTER-PLAN §5.7, §10, §11, §13

## Goal
The game gets **direction and memory**: a generated **main story** through the
architecture, side quests, a quest log and markers, XP and levels, a **skill
tree** whose unlocks are real developer views, items and gold, the **Kingdom
Light** progress system, achievements, a daily challenge, and a robust **save
system** that survives code changes.

## Why now
Without goals and saved progress, exploration and fights feel aimless. This phase
turns the pieces into a game loop you want to return to.

## Scope

### In
- `packages/quests`: data-driven quest engine and quest generators.
- Quest types: Main story, Exploration, Delivery, Escort, Bounty, Investigation,
  Collection, Daily.
- Quest log UI, HUD tracker, world and minimap markers.
- XP, levels, skill tree (5 branches) and the **equipment overlays** they unlock.
- Inventory, consumables, gold, the Bazaar shop and the Concept Keys gating
  system.
- Comprehension states + **Kingdom Light** (fog visuals tied to understanding).
- Achievements and the shareable profile card (image export).
- Save system: versioned schema, localStorage + file export/import, migrations,
  commit-change handling.

### Out (later phases)
- Boss and dungeon quests (Phase 09 adds them to the story).
- Hero's Trial (Phase 10), Review quests and authored quests (Phase 15).
- Cloud saves and leaderboards (Phase 13).

## Design

### Quest definition (data-driven)
```ts
interface QuestDef {
  id: string; type: QuestType; title: string; summary: string;
  chapter?: number;
  objectives: Objective[];              // completed in order or any order
  prerequisites?: string[];             // other quest IDs or Concept Keys
  rewards: { xp: number; gold?: number; items?: ItemId[]; keys?: KeyId[] };
  narration?: { intro: string; outro: string };   // template, AI-rephrasable
}

type Objective =
  | { kind: "visit"; buildingId: string }
  | { kind: "talk"; symbolId: string }
  | { kind: "defeat"; smellId: string }
  | { kind: "answer"; symbolId: string; puzzleTypes?: PuzzleType[] }
  | { kind: "collect"; codexIds: string[] }
  | { kind: "deliver"; path: string[] }     // symbol IDs along a data-flow path
  | { kind: "find"; query: string; answerSymbolIds: string[] };
```
The engine is a **state machine** per quest (`locked → available → active →
completed`) driven by game events from the event bus.

### Quest generators
| Quest | Generated from | Example |
|---|---|---|
| **Main story chapter** | For each important entry point (by fan-out and route count), the longest **exact** call path to a data-layer or I/O symbol. 3–7 chapters, ordered by Concept Key dependencies | *Chapter 2: The Journey of a Task*: talk to 5 NPCs along `POST /tasks → … → insertTask`, answer a Trace question at 2 of the stops |
| **Exploration** | Each region | Visit 80% of the buildings in the Bazaar |
| **Delivery** | Data-flow paths: a value returned by A passed into B (assignment then argument, from the syntax tree) | Carry the "Task" from `parseTaskInput` to `insertTask` |
| **Escort** | Pipelines (middleware chains, decorator stacks) | Walk the request through 4 middleware stops in order |
| **Bounty** | Smell clusters per region | Tame 5 Gremlins in the Forge |
| **Investigation** | Keyword groups mapped to symbols by name and doc tokens (e.g. "email", "password", "cache") | Find where passwords are hashed (accept any of the matching symbols) |
| **Collection** | Region symbols | Complete the Codex of the Mines |
| **Daily** | Seeded by date + repo: one Code-Body fight against one function | "Today's function: `computeTaskStatus`" |

The main story also adds a **Prologue** (Gate → README speech → meet Gitling →
first NPC → first easy monster) and a placeholder **Finale** slot (filled by
Phase 09's final boss).

### Quest UI
- **Quest log (Q):** active, available and completed; objective checklist; rewards.
- **HUD tracker:** the current objective + distance arrow.
- **Markers:** "!" over available quest givers, "?" over objectives, and the same on
  the minimap and the full map.
- **Narration:** template text; AI rephrasing via the Content Engine
  (`quest-narration`) when enabled, grounded on the quest's facts.

### Progression
- **XP curve:** level N needs `100 × N^1.5` XP (tunable). Max level 30 in v1.
- **Skill points:** 1 per level. The tree has 5 branches × 5 nodes (see Master
  Plan §11.1).
- **Equipment overlays unlocked by skills:**

| Item | Implementation |
|---|---|
| Compass of Callers | Arrows from the current NPC to its callers (screen-edge arrows when off-screen) |
| Spyglass of Types | Type labels above NPCs; types highlighted in the Code Panel |
| Lantern of Coverage | Light radius showing tested buildings; Shadows (untested-code monsters) revealed and weakened. Uses `tests` edges; also reads `lcov.info` / `coverage.xml` if present |
| Hourglass of Steps | Step through a function's syntax tree: highlight statement by statement with branch choices (static, no execution) |
| Boots of Import | Fast-travel menu listing a building's imports and importers |
| Cartographer's Lens | Overworld overlay: region dependency arrows with weights |
| Chronicle Monocle | Shows the file's age and last-change date (from git stats) |

### Economy
- **Gold:** from quests and fights.
- **Bazaar shop:** Hint Potions, Energy Tonics, Scrolls of Recall, Smoke Bombs and cosmetics
  (hats, colors).
- **Concept Keys:** awarded by chapters. Some regions or buildings have gates
  requiring a key (computed from module dependency order: a region whose code
  depends heavily on another region's code is gated behind that region's key).
  Gates are **soft** in Story mode (warning + allowed) and hard in Expert mode.

### Kingdom Light
- States per symbol: `unseen → seen → read → understood → mastered`, with
  weights 0, 0.1, 0.4, 0.8 and 1.0.
- **Light % = Σ(weight × symbol LOC) / Σ(symbol LOC)**, per region and for the
  kingdom.
- Visuals: region fog density and color saturation follow the region's light
  (desaturated and foggy → vivid and clear). **Mastery stars:** 1★ at 40%, 2★
  at 70%, 3★ at 90% + Guardian defeated (Phase 09).

### Achievements
At least 20 in v1, e.g. *First Steps* (talk to 1 NPC), *Cartographer* (visit all
regions), *Exterminator* (tame 50 monsters), *Mutant Hunter* (10 Mutant Hunts
first try), *Librarian* (read every doc scroll), *Night Owl* (play the daily
challenge 7 days in a row), *Illuminated* (100% light in a region).

### Profile card
"Kingdom of Taskly · Level 12 · 68% Light · 41 monsters tamed · 2 regions
mastered", exported as a PNG for sharing (rendered from a hidden canvas).

### Save system
```ts
interface SaveV1 {
  saveVersion: 1; repoId: string; createdAt: string; updatedAt: string;
  lastCommit: string | null;
  player: { level: number; xp: number; gold: number; position: Position; skills: SkillId[] };
  inventory: Record<ItemId, number>; equipment: ItemId[]; keys: KeyId[];
  comprehension: Record<SymbolId, ComprehensionState>;
  quests: Record<QuestId, QuestProgress>;
  bestiary: Record<SmellId, { tamedAt: string; notes?: string }>;
  codexNotes: Record<SymbolId, string>;
  achievements: Record<AchievementId, string>;
  settings: PlayerSettings;
}
```
- **Storage:** localStorage (autosave every 30 seconds + on scene change) +
  **Export / Import** a `.cqsave` JSON file.
- **Migrations:** a `migrations/` folder; each version bump adds a pure function
  `vN → vN+1`, tested.
- **Commit changes:** on load with a new commit, map progress by **stable IDs**.
  Symbols whose code hash changed drop from `understood` to `read` (the code
  changed, so re-check your understanding). Removed symbols move to an "Archive"
  list. Show a friendly "The kingdom changed since your last visit: 12 buildings
  renovated, 3 new residents" summary.

### Debug API additions
```ts
getQuests(): QuestSummary[];
completeObjective(questId: string, index: number): void;   // test-only
getLight(): { kingdom: number; regions: Record<string, number> };
getSave(): SaveV1;  loadSave(save: SaveV1): void;
```

## Tasks
- [ ] Quest schema + state machine engine + event wiring.
- [ ] Generators: main story (prologue + chapters), exploration, delivery, escort, bounty, investigation, collection, daily.
- [ ] Quest log, tracker, markers, narration (template + AI hook).
- [ ] XP, levels, skill tree UI + effects.
- [ ] Equipment overlays (7 items above).
- [ ] Inventory, shop, gold, Concept Keys and gates.
- [ ] Comprehension states + Kingdom Light computation + fog and saturation visuals + mastery stars.
- [ ] Achievements + profile card PNG.
- [ ] Save system: schema, autosave, export/import, migrations, commit-change mapping + summary screen.
- [ ] Move the Phase 05 Codex storage into the save.
- [ ] Bot playthrough script: completes the whole main story of `tiny-ts` through the debug API.

## Automated tests
- **Quest engine:** state transitions, prerequisites, out-of-order objectives, rewards granted once.
- **Generators (invariants on fixtures):** the main story exists with 3–7 chapters; every objective's target exists and is reachable; delivery paths are valid data flows in the syntax tree; every investigation answer symbol really matches its query.
- **Bot playthrough (CI):** the bot finishes the prologue and all chapters of `tiny-ts`; Kingdom Light ≥ 60% afterwards.
- **Light math:** unit tests with hand-computed examples.
- **Saves:** round-trip (save → load → deep equal); migration tests from fixture saves; corrupted save → clear error + backup kept; commit-change mapping using two fixture commits (rename, edit, delete) → expected states.
- **E2E:** accept a quest → complete its objectives → reward popup → the quest log updates; reload the page → everything persists.
- **Overlays:** each equipment overlay renders correct data for a known NPC (e.g. the Compass arrows count equals the caller count).

## Manual test script
1. Start a fresh game on `tiny-ts`. Play the prologue and Chapter 1 without the debug tools.
2. Does the story make the architecture clearer? Write down one sentence about Taskly's architecture *from memory*.
3. Spend skill points; try every equipment overlay. Which ones would you use in real work?
4. Export your save, start a new game, then import the save. Progress is restored.
5. Edit a function in `tiny-ts` (make a change, commit), relaunch `cq play`, and read the "kingdom changed" summary.
6. On **your own project**: play the first chapter. Is it the flow you'd show a new teammate first?

## Definition of done
- [ ] All tests green; the bot playthrough passes in CI.
- [ ] Saves survive reloads, export/import and code changes.
- [ ] Your own-project chapter 1 matches what you would teach first (or the generator rule is adjusted).

## Risks
| Risk | Mitigation |
|---|---|
| Generated story picks unimportant flows | Rank by entry-point importance + route count; maintainer overrides arrive in Phase 15 |
| Too many quests overwhelm | Limit active side quests to 3; the tracker shows one objective |
| Save corruption | Backups, schema validation, migrations, export files |

## Hand-off to the next phase
Phase 09 receives the quest engine (to add boss, dungeon and finale quests), the
progression system, and Kingdom Light (for mastery stars after Guardians).

## Start prompt for Claude
```
Read AGENTS.md, docs/plans/README.md, the MASTER-PLAN sections listed in the
phase header, and docs/plans/phases/P08-quests-progression.md.
Implement Phase 08 on branch phase/08-quests-progression. Run the automated tests,
walk me through the manual test script, and fill in the Results section.
```

## Results (fill in after testing)
- Date:
- Automated tests / bot playthrough:
- Architecture sentence from memory:
- Decisions / ADRs:
