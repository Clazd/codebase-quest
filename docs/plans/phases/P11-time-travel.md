# Phase 11: Time Travel and Chronicles

> **Milestone:** E · Real Heroes · **Depends on:** 04, 08 (09 for Heralds) · **Effort:** 2 weeks ·
> **Status:** Not started
> **Read first:** MASTER-PLAN §2 (pillar 6), §9.2, §9.3, §14

## Goal
The **Chronicle Stone** lets you travel through the project's git history:
watch the kingdom **grow** (buildings rise, districts expand, ruins appear where
code was deleted), read an auto-written **Chronicle** of the project's eras,
visit the **Hall of Heroes** (with opt-outs respected), and solve **Crime Scene**
investigations (find the commit that changed a behavior). Each new release
spawns a **Herald**, a seasonal boss built from that release's most-changed
function.

## Why now
History explains *why* the code is the way it is. It builds on the world
generator (Phase 03) and the save system (Phase 08). It's also visually
impressive for demos.

## Scope

### In
- Incremental analysis across commits (cache by file content hash).
- History sampling (tags, releases, evenly spaced commits).
- The Chronicle Stone UI: a timeline slider with world morphing.
- Ruins (deleted files), construction animations (new files), renovations
  (changed files).
- Chronicle book: eras, major events, Relics.
- Hall of Heroes with an opt-out list and an anonymize switch.
- Crime Scene mode: find the commit that changed a given line or behavior.
- **Heralds:** seasonal bosses from releases (MASTER-PLAN §9.3).
- The Chronicle Monocle upgrade (full history for a file).

### Out (later phases)
- History for repos without git (not supported; diagnostic shown).
- Multi-repo histories (future).

## Design

### Incremental analysis
- For each sampled commit: `git ls-tree` → file list with blob hashes. Parse only
  blobs not already in the **blob cache** (`.codequest/cache/blobs/<hash>.json`
  holds per-file extraction results). Rebuild graph-level parts (edges, metrics,
  smells) from cached per-file results.
- Read file contents with `git show <commit>:<path>` (no checkout; the working
  tree is never touched).
- Sampling: all tags (up to 30); if fewer than 10 tags, 20 evenly spaced commits
  on the main branch's first-parent history; always include the first and last.

### World morphing
- **Layout stability:** worlds across time are generated with the **current**
  commit's layout as an anchor. Buildings keep their lots, deleted files become
  ruins on their old lots, new files appear on reserved lots. This needs a
  "historical layout" mode in the world generator that keeps districts stable.
- **Animations:** scaffolding rising (new), fresh paint (changed), crumbling
  (deleted).
- **Timeline slider:** drag between sampled commits; the world updates in under
  1 second per step (pre-generate the sampled worlds in the background after the
  first visit).

### The Chronicle (history book)
- **Eras:** split by tags or by year, named from the era's dominant change (e.g.
  "The Age of the API", when the API region grew most).
- **Events:** region founded (first file in a folder), great refactor (more than
  30% of a region's lines changed in one commit range), migration (a manifest
  dependency swap), big deletions (ruins).
- **Relics:** the oldest symbols still alive (same name, same file, code hash
  partially stable). Collectible items.
- Text is template-based; AI-phrased if enabled, grounded on event facts with
  commit references.

### Hall of Heroes
- Statues for contributors by number of commits (top 20), with the regions they
  shaped most.
- **Privacy:**
  - Names come only from git metadata already public in the repo.
  - `.codequest/heroes.yml` supports an `optOut` list (emails or names) and an
    `anonymize: true` switch. **Anonymize is the default for private repos.**
  - Email addresses are never displayed.
- A verified Contributor Cape holder (Phase 10) gets a special plaque.

### Crime Scene mode
- **Setup:** the player picks a line in the Code Panel ("Who changed this?"), or
  the game offers a case ("The task status rule for overdue tasks changed. Find
  when.").
- **Clues:** the commits that touched that line range (from `git log -L
  <start>,<end>:<file>`), presented as **suspects** (commit message, date,
  diff snippet; author shown only if allowed).
- **Puzzle:** "Which commit introduced this behavior?" Ground truth is git's
  answer. Distractors are other commits that touched the same file.
- **Reward:** Detective badges; teaches git archaeology.

### Heralds (seasonal bosses)
- Releases = tags (semver-like tags first; otherwise all tags), newest first.
- For each of the latest 3 releases: find the function with the most changed
  lines between that tag and the previous one (`git diff --numstat` + symbol
  ranges at the newer tag).
- The Herald is a boss built with the Phase 09 framework from that function's
  CodeBody (Phase 07), named "Herald of <tag>", with a quest available for 30
  days after the tag date (always available in Free Roam).
- Reward: a release cosmetic and a "What's new in <tag>" Codex page listing the
  release's changed symbols.

### Debug API additions
```ts
getTimeline(): { commits: string[]; current: string };
travelTo(commit: string): Promise<void>;
startCrimeScene(fileId: string, line: number): Promise<void>;
```

## Tasks
- [ ] Blob cache + incremental per-commit analysis using `git show` / `git ls-tree`.
- [ ] Commit sampling.
- [ ] Historical layout mode in the world generator (anchored lots, ruins, reserved lots).
- [ ] Chronicle Stone UI + slider + morph animations + background pre-generation.
- [ ] Chronicle book generator (eras, events, Relics) + UI.
- [ ] Hall of Heroes + `heroes.yml` (opt-out, anonymize) + private-repo default.
- [ ] Crime Scene mode (suspects, clues, puzzle) using `git log -L`.
- [ ] Heralds: release detection, most-changed function per release, Herald
      boss (Phase 07 body + Phase 09 framework), limited-time quest, reward page.
- [ ] Chronicle Monocle upgrade.

## Automated tests
- **Incremental correctness:** for 5 commits of `tiny-ts`, incremental analysis equals a full analysis at that commit (byte-identical graph).
- **Working tree safety:** time travel never changes the working tree or HEAD (assert `git status` and `rev-parse HEAD` before and after).
- **Layout stability:** a building's lot is the same across all sampled worlds for files that exist in both.
- **Crime Scene:** the puzzle answer equals `git log -L` output for fixture cases; distractors never include the right commit.
- **Heralds:** for fixture tags, the Herald's function is the one with the most changed lines between consecutive tags (verified with `git diff --numstat`); no tags → no Heralds.
- **Privacy:** opt-out names never appear in any output; anonymize mode shows no names; emails never appear (search tests).
- **Performance:** 20 sampled commits of a pinned mid-size repo processed with the cache in under N minutes (record a baseline).

## Manual test script
1. `cq play fixtures/repos/tiny-ts` → touch the Chronicle Stone → drag the timeline from the first commit to the last. Watch the kingdom grow.
2. Read the Chronicle. Does it tell Taskly's story plausibly (compare with `git log`)?
3. Open the Hall of Heroes; add yourself to `optOut` in `heroes.yml`; reload; your statue is gone.
4. Solve a Crime Scene for a line you changed in Phase 08's manual test.
5. Tag a release in `tiny-ts` after changing a function; a Herald appears.
6. Try it on **your own project's** history.

## Definition of done
- [ ] All tests green, including working-tree safety and privacy tests.
- [ ] The timeline is smooth on `tiny-ts` and usable on a pinned mid-size repo.
- [ ] The Crime Scene answer is always git-verified.

## Risks
| Risk | Mitigation |
|---|---|
| History processing is slow | Blob cache, sampling, background pre-generation |
| Layout jumps between commits | Anchored historical layout mode |
| People don't want their names shown | Opt-out, anonymize, private-repo default, no emails |

## Hand-off to the next phase
Phase 12 receives the morph animations and ruins to make beautiful; Phase 15
receives history data for the Debt Map trends.

## Start prompt for Claude
```
Read AGENTS.md, docs/plans/README.md, the MASTER-PLAN sections listed in the
phase header, and docs/plans/phases/P11-time-travel.md.
Implement Phase 11 on branch phase/11-time-travel. Run the automated tests,
walk me through the manual test script, and fill in the Results section.
```

## Results (fill in after testing)
- Date:
- Automated tests:
- Notes on your own project's history:
- Decisions / ADRs:
