# Phase 10: Hero's Trial (Real Issues)

> **Milestone:** E · Real Heroes · **Depends on:** 08, 09 · **Effort:** 1.5–2 weeks ·
> **Status:** Not started
> **Read first:** MASTER-PLAN §9.8, §12, §16.6, §16.8

## Goal
After the finale, the **Quest Board** offers **real issues** from the project.
Accepting one marks the relevant places in the world, guides you through the
code, and opens a **Trial Arena** where the boss's HP is the number of
**related failing tests**. Fix the code in your real editor, run the tests, and
defeat the boss. When the pull request is merged and verified, you earn the
**Contributor Cape**.

## Why now
This is what makes Codebase Quest more than a game: playing ends in **real
work**. It only makes sense once the player has explored the kingdom (after the
MVP).

## Scope

### In
- Issue sources: GitHub (public repos), a local `.codequest/issues.yml` file and
  manual entry.
- Issue → location mapping (search + optional AI ranking, with confidence).
- Quest Board UI; the Trial quest type.
- The Trial Arena: tests as boss HP; a "Run tests" action through an **opt-in
  sandboxed runner**.
- Local git branch creation (with confirmation) and editor opening.
- A mentor-style Gitling (explains, doesn't write the fix).
- Showing the project's CONTRIBUTING and AI-use policy before starting.
- PR merge verification → Contributor Cape + Hall of Heroes slot (display comes
  in Phase 11).

### Out (later phases)
- Team raids on bugs (Phase 14).
- Non-GitHub issue trackers (future).

## Design

### Issue sources
| Source | How |
|---|---|
| GitHub | REST API: open issues with labels like `good first issue` and `help wanted` (configurable). Unauthenticated by default (low rate limit); optionally a token **from an environment variable**, never stored in saves or caches |
| Local file | `.codequest/issues.yml`: `{ id, title, body, labels, hintPaths? }`, for private repos and classrooms |
| Manual | Paste a title and description in the Quest Board |

### Mapping an issue to the world
1. Extract keywords (identifiers in backticks, file paths, error messages, nouns)
   from the issue title and body.
2. Score symbols and files: exact identifier match (high), path match (high),
   doc and name token overlap (BM25), stack-trace file:line references
   (very high).
3. **Optional AI re-ranking** (Content Engine, content type `issue-mapping`): given
   the issue + the top 20 candidates' fact sheets → ranked list with reasons. The
   output must only contain candidate IDs (validated).
4. Show the **top 3 locations with confidence badges**. The player can browse
   them; nothing is presented as certain.

### The Trial quest
- **Objectives:** visit the mapped locations → talk to the involved NPCs → (if
  tests exist) enter the Trial Arena → make the related tests pass → (optional)
  open a pull request.
- **Related tests:** tests with `tests` edges to the mapped symbols + tests in
  the matching test files. The player can adjust the selection.

### Test runner (opt-in, safe by default)
| Mode | When | How |
|---|---|---|
| **Sandbox** (default when enabled) | Any repo | Container (Docker or Podman) with **no network**, CPU, memory and time limits, the repo mounted **read-only** + a writable copy of the working tree; a detected test command (`npm test -- <files>`, `pytest <files>`) or one set in `codequest.config.json` |
| **Direct** | Only your own trusted repos, with explicit confirmation each session | Runs the test command on your machine with a timeout |
| **Off** | Default | The Trial uses a checklist mode (no HP bar from tests) |

The runner parses results (JUnit XML or JSON reporters where possible; exit
codes otherwise) into pass/fail per test → **boss HP = failing related tests**.

### Git and editor integration (local mode)
- "Start Trial" → shows the planned action: `git switch -c cq/issue-<id>` →
  **asks for confirmation** → creates the branch (refuses if the working tree is
  dirty, with an explanation).
- "Open in editor" opens the first mapped location.
- The game **never commits, pushes or opens pull requests by itself**. It shows
  the commands and links to do it yourself.

### Mentor Gitling (explain, don't write)
- Works in every AI mode. In **agent mode**, the Codebase Quest skill tells the
  user's own agent to follow the same policy (the user stays in control).
- Default policy: Gitling explains the code involved, suggests where to look and
  what a test might check, but **does not write the fix**. This respects
  maintainers' rules about AI-written contributions.
- Before starting, show the project's `CONTRIBUTING.md` and any AI policy found
  (files like `AI_POLICY.md`, or sections mentioning "AI" in CONTRIBUTING), and
  require the player to acknowledge them.

### Contributor Cape verification
- The player links the pull request URL. The game checks through the GitHub API
  that the PR is **merged** into the repo, and that its **author** matches the
  player's GitHub login **if** the player connected GitHub (Phase 13). Without a
  connection, the cape is "unverified".
- A verified cape is stored in the save (and synced in Phase 13).

### Debug API additions
```ts
loadIssues(issues: IssueInput[]): void;
getTrial(): { issueId: string; failing: number; total: number } | null;
setTestResults(results: TestResult[]): void;   // test-only
```

## Tasks
- [ ] Issue source adapters (GitHub, local file, manual) + rate-limit handling + env-only token.
- [ ] Mapping engine (keywords, scoring, stack traces) + optional AI re-ranking with ID validation.
- [ ] Quest Board UI + issue cards + confidence badges.
- [ ] Trial quest type + objectives.
- [ ] Related-test selection.
- [ ] Test runner: sandbox (container), direct (confirmed), off; result parsing.
- [ ] Trial Arena (boss HP from tests, rerun button, live updates).
- [ ] Git branch creation with confirmation + dirty-tree guard; editor opening.
- [ ] CONTRIBUTING / AI-policy display + acknowledgement.
- [ ] Mentor Gitling policy prompts.
- [ ] PR merge verification + Contributor Cape.

## Automated tests
- **Mapping eval:** 10–20 real **closed** issues from pinned repos whose fixing PRs are known → top-3 hit rate ≥ 70% (files touched by the fix). Search-only and search + AI scores reported separately.
- **Runner safety:** the sandbox has no network (a test tries to fetch → fails); time limit kills runaway tests; the original repo is untouched after a run (hash check); secrets (`.env`) are not mounted.
- **Result parsing:** fixture JUnit and pytest outputs → correct pass/fail counts.
- **Git:** on a temp repo, the branch is created only after confirmation; a dirty tree refuses with a message.
- **E2E (mocked GitHub + mocked runner):** accept an issue → markers appear → enter the Trial → the HP bar matches the failing tests → set the results to passing → victory → the cape is unverified until merge verification is mocked as merged.

## Manual test script
1. In `tiny-ts`, add an issue to `.codequest/issues.yml`: *"Sharing fails for archived tasks"* (and add a failing test for it in the fixture's `bug-archived` branch).
2. Finish (or skip with debug) the finale; open the Quest Board; accept the issue.
3. Follow the markers. Did they point to the right code?
4. Enable the sandbox runner (requires Docker). Enter the Trial Arena; the boss HP is 2.
5. Fix the bug in your editor and press "Run tests"; the boss is defeated.
6. Try a real `good first issue` on a public repo you like (read its contribution rules first).

## Definition of done
- [ ] All tests green; the runner safety tests pass.
- [ ] Mapping eval ≥ 70% top-3.
- [ ] Full Trial flow works locally with the sandbox.
- [ ] The game never commits, pushes or creates pull requests by itself (code review checklist + test).

## Risks
| Risk | Mitigation |
|---|---|
| Running tests is risky | Opt-in, sandbox by default, no network, limits, read-only mounts |
| Mapping points to wrong code | Confidence badges, top 3, player choice, eval-driven tuning |
| Low-quality AI pull requests annoy maintainers | Explain-don't-write default; show the project's policies; humans write and own the fix |

## Hand-off to the next phase
Phase 11 receives the Contributor Cape and Hall of Heroes slots; Phase 14 receives
the Trial Arena to extend into multiplayer raids.

## Start prompt for Claude
```
Read AGENTS.md, docs/plans/README.md, the MASTER-PLAN sections listed in the
phase header, and docs/plans/phases/P10-heros-trial.md.
Implement Phase 10 on branch phase/10-heros-trial. Run the automated tests,
walk me through the manual test script, and fill in the Results section.
```

## Results (fill in after testing)
- Date:
- Automated tests / mapping eval:
- Manual Trial notes:
- Decisions / ADRs:
