# 0010. Generated combat with conservative source facts

- Status: Accepted implementation; human fun/adoption decision remains pending
- Date: 2026-10-19
- Phase: 07

## Context

The owner explicitly asked to continue Phase 07 from the interrupted Claude
implementation, using the Phase 01 rules and UI. ADR 0003 and Phase 01 still
require human observations before final adoption. This continuation does not
claim those observations exist or authorize later phases.

## Decision

Keep the prototype balance and trace/heart interpretation: a trace damages
ordinary cells and organs, reveals its path and exposes hearts. Sever destroys
a joint and its complete nested limb. Syntax, exact graph edges, literal test
assertions and the bounded interpreter determine all scored answers. Optional
AI supplies a generic, source-grounded afterword after combat; it receives a
FactSheet without encounter data, questions, choices, keys or execution routes.
MCP prebuild can prepare these afterwords. During fights Gitling uses only the
local evidence ladder; live chat and external focus changes cannot interrupt it.

## Explicit interpretations / deviations

- Prototype `computeTaskStatus` cell c7 (`Date.now()`) becomes ordinary body,
  preserving its position, the silhouette, limbs and hearts. An external clock
  has no exact repository call edge and must not be invented as an organ.
  Multiple different exact callees on one line are also ordinary cells because
  the graph has no call-column coordinates to disambiguate the main call.
- The interpreter refuses unsupported reached statements, mutations, loops,
  try/finally, default/rest binding, grouped routes, reference equality and
  coercive comparisons it cannot model faithfully. Literal-only expressions
  include JS property access, comparisons, booleans, ternaries and length;
  Python has its own empty-container truthiness and literal `len`. A test can
  still identify one unique literal return without claiming a complete path.
  Unknown paths use smell attacks and syntax questions rather than fabricated
  execution. Parameter/local shadowing cannot borrow a module constant's value.
- When Predict is unavailable (nonliteral return, external calls, implicit
  completion or throw), a source Fill the Gap can target the heart. Empty catch
  armor can ask about the calls in its enclosing protected try, or use a source
  gap. Shapeshifter uses observable field reads rather than guessing an absent
  semantic type. Shadow only offers an input when a condition is evaluable;
  otherwise its dark body remains fightable using syntax questions. A missing
  test reference is not presented as measured branch coverage.
- Group only consecutive ordinary cells, never special cells. A function with
  more than 40 irreducible special cells is honestly unavailable; its special
  fight/sub-grids belong to Phase 09. No special cells or returns are dropped
  to force a cap. Mini-bosses remain sealed and explain the phase boundary.
- The provisional Serpent rehide transition retains the prototype's silhouette.
  Rearranging sub-grids remains an adoption/playtest decision under ADR 0003.
  Minions retain up to five actual callee cells; tiny callees stay smaller than
  three rather than inventing source statements. Their heart must be defeated
  to stop their one-Focus bite.
- The smelly fixture has no natural injected bug smell, so one deterministic
  Mutant per region is added to its most-tested mutable function. Mutations
  are in-memory copies, parse-checked, and never written into analyzed sources.
- XP and item rewards remain in memory; Codex notes, understood flags, cleared
  maps and Bestiary records extend Phase 05's existing browser store. This is
  not the Phase 08 save/progression system. An opinion earns XP and records a
  note, never understanding credit.
- Fixture severities start at level 2. The level-1 pacing experiment retains
  the generated cells/questions, sets level and smell damage to 1, and excludes
  instant Wisp reports/Ghost proofs. Story defeat rates also include the full
  natural-severity corpus. These are simulated averages, not human evidence
  of fun or a promise that every fight lasts 3–6 turns.
- The full concurrent test run exposed an older shared-session race: several
  CLI/MCP suites launched the same fixture into one test home. Bridge-security
  tests now use their own temporary home and compare tokens as booleans so a
  future failure cannot print them.
- Explorer debug reads now use the same active map for scene, player and
  teleportation, reporting `Loading` until transitions settle. Previously the
  generic scene-list lookup could still select a stopping interior while the
  explorer reported its new region, making door-return checks race.

## Validation

Unit tests independently re-derive generated choices and verify all distractors
against raw syntax, graph edges, assertions, source diffs and injected changes.
The audit does not call the production evaluator to decide correctness and
never imports or executes fixture functions. Bodies, encounters and mutation
operators have golden snapshots and determinism checks. Browser tests cover
every monster, defeat/flee, two-turn minions, keyboard combat, ARIA and axe.
Provider spies and a real in-memory MCP connection verify the answer boundary.
Actual command results and remaining human checks are recorded in Phase 07.
