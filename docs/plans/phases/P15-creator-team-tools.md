# Phase 15: Creator Mode and Team Tools

> **Milestone:** G · Together · **Depends on:** 06, 08, 13 (14 for signposts) · **Effort:** 2.5–3 weeks ·
> **Status:** Not started
> **Read first:** MASTER-PLAN §13, §14, §16.7

## Goal
**Maintainers** can author official content for their repo (quests, lore, NPC
lines, region names) in a `.codequest/` folder, visually in **Creator Mode** or by
hand in YAML. **Teams** get onboarding tracks, an aggregate progress dashboard,
the **Debt Map**, **Review Quests** for pull requests, a **VS Code companion
extension**, and **Classroom mode** for instructors.

## Why now
Generated content is good; **human-curated** content is great. And these tools
are what teams and schools would pay for (Business model §19).

## Scope

### In
- The `.codequest/` specification + JSON Schemas + `cq validate`.
- Loading authored content with precedence over generated content.
- In-game Creator Mode (place signs, edit NPC lines, build quests visually →
  export YAML).
- **Agent as Creator assistant:** the user's own agent drafts `.codequest/`
  content through MCP; `cq_create_quest` writes files only after a diff preview
  and approval.
- An "Official world" badge for repos with `.codequest/`.
- Onboarding tracks (ordered quests + goals) for teams.
- Team dashboard (aggregate, consent-based) and the Debt Map.
- Review Quests (from a branch or pull request diff).
- The VS Code companion extension.
- Classroom mode (instructor assigns repo + track; aggregate progress).
- A self-hosted team deployment guide (Docker Compose: server + PocketBase +
  builder), so private code stays inside the company network.

### Out (later phases)
- SSO / SCIM enterprise identity (future, after launch feedback).
- JetBrains plugin (future).

## Design

### The `.codequest/` folder
```
.codequest/
├─ world.yml              # kingdom name, region names/biomes overrides, hidden paths, listed: true/false
├─ quests/
│  └─ 01-request-journey.yml
├─ lore/
│  ├─ kingdom.md
│  └─ regions/api.md
├─ npcs.yml               # per-symbol custom lines, nicknames, "spotlight" flags
├─ bosses.yml             # override or choose Guardians, add custom phases
├─ tracks.yml             # onboarding tracks (for teams and classrooms)
├─ issues.yml             # (Phase 10) local issues
└─ heroes.yml             # (Phase 11) opt-outs, anonymize
```

**Example quest:**
```yaml
id: request-journey
title: "The Journey of a Request"
chapter: 1
summary: "Follow a request from the docks to the vault."
objectives:
  - talk: "src/api/routes.ts#createTaskRoute"
    say: "Every new task starts here. Notice the validation middleware."
  - answer: "src/services/taskService.ts#createTask"
    puzzleTypes: [trace]
  - visit: "src/db/tasks.ts"
rewards: { xp: 300, keys: [key-of-requests] }
```
- **Symbol references** use `path#qualifiedName` (stable even when IDs change).
- `cq validate` checks: schema, every reference resolves in the current
  CodeGraph, no unknown puzzle types, and **every authored puzzle with a declared
  answer is checked against ground truth** when possible (warning if not
  verifiable).
- **Precedence:** authored content > AI content > templates. Generated quests that
  conflict with authored chapters are hidden.

### Creator Mode (in game)
- Toggle with a key when playing locally on a repo you can edit.
- Tools: place a sign or lore scroll; edit an NPC's custom lines; pick a Guardian;
  **quest builder** (click NPCs and buildings to add objectives, reorder, preview);
  import signposts from multiplayer sessions (Phase 14).
- **Export** writes YAML files into `.codequest/` (shows a diff first). Committing
  is up to the maintainer.

### Agent as Creator assistant (MCP)
- A maintainer tells their agent: "Write an onboarding track for new backend
  developers." The skill's *Author content* workflow drafts quests, lore and NPC
  lines with `cq_search_code` / `cq_get_symbol`, validates them with
  `cq_validate_content`, then calls `cq_create_quest`, which **shows a diff and
  writes files only after the user approves**.
- Authored questions still need ground truth: declared answers are checked by
  `cq validate`; unverifiable ones are marked opinion.

### Onboarding tracks
```yaml
tracks:
  - id: backend-week-1
    title: "Backend: your first week"
    quests: [request-journey, auth-fortress, billing-guardian]
    goal: { kingdomLight: 0.5, regions: [src/api, src/services] }
```
New hires pick or get assigned a track; the HUD shows track progress.

### Team dashboard (consent-based, aggregate)
- **Shows:** per track, how many members started, completed, and their average
  Kingdom Light; which quests people get stuck on (aggregate); **which puzzles are
  most often answered wrong** (a signal of confusing code!).
- **Does not show:** time spent per person, keystrokes, per-person rankings. A
  per-person view exists only for people who **opt in** (e.g. to get mentor help).
- Self-hosted deployments keep all data inside the company.

### Debt Map (for leads)
- Overworld heat overlay of **monster density** (smells per 1k lines) per region
  and district.
- Trends over time using Phase 11's history (debt rising or falling per region).
- Export: a markdown or CSV report (pairs with the Bestiary export).

### Review Quests
- Input: a branch or a pull request (GitHub API for public, local `git diff`
  otherwise).
- The world highlights **changed buildings** (glowing outlines) and **affected
  callers** (from the CodeGraph: symbols that call changed symbols).
- A generated quest walks the reviewer through changed functions in a sensible
  order (call order); at each one, a short **diff view** in the Code Panel and 1
  puzzle about the change (e.g. "Which caller is affected by this signature
  change?" from ground truth).
- The **summary** at the end: changed symbols, affected callers, new smells
  introduced (monster spawns) and removed (tamed). A reviewer's checklist to copy
  into the review.

### VS Code companion extension (`apps/vscode`)
- Command "Show in Codebase Quest" → opens or focuses the game at the NPC for the
  symbol under the cursor (via a local WebSocket to the `cq play` server).
- CodeLens above functions: Codex note (if any), Bestiary marker if a smell
  exists, "Guardian" badge for hotspots.
- The game's "Open in editor" already works through `vscode://` (Phase 05); this
  adds the reverse direction.

### Classroom mode
- An instructor creates a class (Phase 13 account), picks a repo + track, and
  shares an invite.
- Students play normally; the instructor sees **aggregate** progress and the most
  missed puzzles, plus per-student progress **only** for students who opt in
  (required by some schools; shown clearly on joining).

## Tasks
- [ ] `.codequest/` JSON Schemas + docs + `cq validate`.
- [ ] Authored content loader + precedence rules + conflict handling.
- [ ] Creator Mode tools + quest builder + YAML export with a diff preview.
- [ ] Official world badge.
- [ ] Agent Creator assistant: `cq_create_quest` file writing with diff preview + approval; skill workflow update.
- [ ] Onboarding tracks (loading, assignment, HUD).
- [ ] Team dashboard (aggregate queries, opt-in per-person view).
- [ ] Debt Map overlay + trends + export.
- [ ] Review Quests (diff ingestion, highlights, quest generation, summary).
- [ ] VS Code extension (command, CodeLens, local connection).
- [ ] Classroom mode.
- [ ] Self-hosted Docker Compose + deployment guide.

## Automated tests
- **Schema and validator:** valid and invalid fixture `.codequest/` folders; unresolved references reported with file:line; authored puzzle answers verified where possible.
- **Agent authoring:** a scripted MCP client drafts a quest → `cq_create_quest` writes nothing without approval; with approval, the files match the diff shown.
- **Precedence:** authored lines override AI and templates; conflicting generated quests hidden.
- **Creator export:** round-trip (create in UI → export YAML → reload → same content).
- **Review Quests:** fixture branches (rename, signature change, new function, deleted function) → correct changed and affected symbols; summary counts are right.
- **Dashboard privacy:** API tests prove per-person data is unavailable without opt-in; aggregates need at least 3 people (k-anonymity threshold) before display.
- **VS Code extension:** the extension test runner checks the command resolves the symbol under the cursor and sends the right message.
- **Self-hosted:** Docker Compose comes up in CI (smoke test), builds a fixture world, and plays it.

## Manual test script
1. In `tiny-ts`, use Creator Mode to write a 3-step quest and custom lines for 2 NPCs. Export, `cq validate`, replay.
2. Create a branch in `tiny-ts` that changes `createTask`'s signature. Run a Review Quest on it. Did it catch the affected callers?
3. Install the VS Code extension; put the cursor in a function → "Show in Codebase Quest".
4. Set up a classroom with 3 test accounts; check what the instructor can and cannot see.
5. Bring up the self-hosted stack with Docker Compose on your machine.

## Definition of done
- [ ] All tests green, including the privacy tests.
- [ ] An authored quest works end to end; a Review Quest is useful on a real branch.
- [ ] The self-hosted stack runs from the guide alone.

## Risks
| Risk | Mitigation |
|---|---|
| Authored content breaks as code changes | `path#name` references; `cq validate` in the maintainers' CI (provide a GitHub Action) |
| Dashboards feel like surveillance | Aggregate by default; k-anonymity; opt-in per-person; no time tracking |
| Review Quests are noisy for big pull requests | Cap at the top 15 changed symbols by impact; a summary-only mode |

## Hand-off to the next phase
Phase 16 receives authored content features that must work across new languages;
Phase 17 receives team, education and maintainer features for the launch plans.

## Start prompt for Claude
```
Read AGENTS.md, docs/plans/README.md, the MASTER-PLAN sections listed in the
phase header, and docs/plans/phases/P15-creator-team-tools.md.
Implement Phase 15 on branch phase/15-creator-team-tools. Run the automated tests,
walk me through the manual test script, and fill in the Results section.
```

## Results (fill in after testing)
- Date:
- Automated tests:
- Review Quest notes:
- Decisions / ADRs:
