# ADR 0011: Grounded quests and local progression

- Date: 2026-10-19
- Status: Accepted for Phase 08; owner architecture playtest pending
- Scope: Phase 08 only. Guardians, dungeon objectives, authored quests, cloud
  saves and the final boss remain in their later phases.

## Decision

`packages/quests` owns the event state machine, progression, achievements and
versioned saves. Its browser entry contains no parser or repository reader. The
Node-only generator writes `quests.json` beside the world. The game consumes
this atlas, the existing FactBook and lazy combat files. Repository code is
parsed, never imported or executed.

Scored quest checks use lexical source order from syntax plus exactly paired
call edges, not a claim about runtime execution order. An unpaired exact edge
disables that quiz rather than incorrectly choosing a later call. The fallback is a
declared-parameter question when no such call exists, or declaration-kind checks
for classes, interfaces and types. Investigations accept the
generated set of matching residents. A separate test oracle reconstructs the
keys from source/graph data. Narration items contain only titles, summaries and
names/paths: no objectives, investigation answer IDs, signatures, parameter
counts, choices, combat inputs or answer keys. Existing content validation and
the answer-leak guard still apply. MCP gets these presentation items only.

## Conservative generation

- Prefer important real entry points. If fewer than three exist, consider
  exported call roots, then explicitly labeled one-resident surveys. Empty
  worlds have a welcome prologue; a world with fewer than three residents has
  fewer chapters rather than fictional residents or edges.
- Search simple exact call paths up to 16 residents and 10,000 expansions per
  root. Prefer the longest discovered path ending in I/O/data or an exact leaf;
  this is not a claim about the longest possible path in an arbitrary graph.
  Selected chapters follow their primary regions' dependency order.
- Chapters include explicitly labeled supplementary resident surveys. These
  stops are not represented as call edges. They cover the architecture beyond
  the request paths, including types and tests, and let the complete story
  meet the planned 60% LOC-weighted Light threshold. The owner must judge whether
  this survey length and the first chapter are useful onboarding.
- Delivery proves an adjacent JavaScript/TypeScript declaration whose direct
  call result is used as a direct argument in the next unconditional call in
  the same lexical block. Mutation, member access, ambiguous resolution,
  conditional consumption and unsupported language shapes are not inferred.
- Escort recognizes top-level `.use(a, b, …)` registrations of unique local
  function declarations, in argument order. Callback reassignment, nested
  registration and unresolved imports are excluded. These are registration
  sequences, not guessed runtime call edges. A repository without proven
  deliveries/registrations receives none of that quest type.
- Exploration chooses a deterministic route covering 80% of a region's
  buildings. It lists those destinations rather than silently counting a
  different set. Collections award the region's Concept Key as well as chapter
  rewards. Gates use the strongest dependency with at least two exact imports;
  cycle members remain open. Story and Normal warn and permit entry; Expert
  requires the key. This keeps prerequisite-region collection routes reachable.
  Side quests may be set aside with their checklist preserved: the three-active
  limit must not block accepting a Collection quest for a missing gate key.

## Progression and equipment

XP is cumulative: leaving level N costs `ceil(100 × N^1.5)`, maximum level 30.
There is one skill point per level gained (level one starts with zero).
Chapters award `1,500 × chapter number` XP: Taskly's five chapters provide enough
earned points to try all seven views without repeating identical fights for XP.
This is a tunable onboarding economy, not a measured human pacing result.
Twenty-five nodes cover five branches. Seven equipment views expose callers,
types, test references/report coverage, static syntax steps, imports, weighted
regional dependencies and git dates. Other nodes add field ledgers, map labels
or deterministic combat assists; they never alter scored keys.

Light uses each resident symbol's analyzer LOC, including zero-LOC handling.
Reading is 40%, one distinct correct evidence item is 80%, and two distinct
evidence items are 100%. Repeating a question cannot farm evidence XP. Fights
and quests grant their economy rewards once, including after reload. A daily
uses the UTC date and repository identity; an already tamed monster can be
replayed for that daily's reward. No Guardian is invented to grant three stars.
The card reports two-star regions honestly until Phase 09 adds Guardians.

## Saves and recovery

Save V1 includes the planned fields plus code/file/quest fingerprints, compact
explored-tile indices, body maps, legacy Codex records, evidence IDs, reward
ledgers, daily dates and archived residents. These are gameplay data, not AI
configuration. Runtime credentials are never copied into a save.

- Autosave every 30 seconds, on scene changes, and on durable gameplay edits.
  An unopened title screen preserves the previous saved position.
- Last-good autosave backup, damaged-input backup, and an explicit checkpoint
  before importing or starting over. Automatic writes do not overwrite that
  explicit checkpoint. Export/import is ordinary `.cqsave` JSON with schema and
  size validation. The old Codex key is read once; subsequent writes belong to
  the save. A pure migration reads the development V0 envelope; its fixture is
  tested. Future version bumps must add their own migrations.
- Stable IDs preserve progress. Unique unchanged definitions with the same
  qualified name can move between files; ambiguous matches are archived.
  Edited understood/mastered residents become read and lose stale evidence/body
  maps. Deleted residents retain their notes in Archive. Unfinished objectives
  restart when the atlas changes; changed quest definitions are rechecked while
  keeping their reward ledger, so they cannot grant duplicate rewards.
- localStorage is origin scoped. `cq play` now chooses a stable default port
  from the repository path; `--port 0` still requests an ephemeral server.
  An explicit fixed port works too. Export before changing browser, port or
  repository location. Repository saves are isolated by a local root identity.
- Importing a gameplay save during combat is rejected. Mid-fight state and the
  60-second flee memory remain session-only; inventory consumption and earned
  evidence persist immediately.
- Arrival gives a brief monster grace period, and doors/gates are safe interaction
  spots. The browser suite exposed an immediate exit ambush that disabled the
  door button; navigation remains usable while deliberately starting a fight is
  still possible. The new HUD/Light/marker screenshots are reviewed and updated.
  Repeated imports also exposed a Phaser stop/start queue race for equal scene
  keys. Transitions now stop through the scene manager synchronously, avoiding
  a delayed stop that would shut down the newly started scene.
  Debug teleports also move Gitling immediately; otherwise its trailing sprite
  could cross a street-click target and open chat during movement checks.

Phase 07's outstanding human playtest and ADR 0003's adoption decision remain
open. The user's explicit Phase 08 request authorizes continuation; automated
completion is not a human architecture-learning or fun rating.
