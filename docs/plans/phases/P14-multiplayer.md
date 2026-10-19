# Phase 14: Multiplayer (Guide Mode and Raids)

> **Milestone:** G · Together · **Depends on:** 13 · **Effort:** 2–3 weeks ·
> **Status:** Not started
> **Read first:** MASTER-PLAN §7, §9.8, §14

## Goal
Players explore a kingdom **together**. In **Guide mode**, a mentor leads juniors
through the world: placing signposts, summoning the party, spotlighting
characters. In **co-op fights**, players fight side by side. In **Raids**, a
team takes on a real bug (the Hero's Trial) with roles split across regions.

## Why now
Onboarding and teaching are social. Mentoring inside the world is a unique,
high-value feature for teams and classrooms, and it needs accounts and servers
(Phase 13).

## Scope

### In
- `apps/multiplayer`: **Colyseus** rooms per (world, party).
- Presence: see other players, names, positions, current location breadcrumb.
- Party system: invite links, roles (mentor, member), max 8 players.
- Communication: text chat, emotes, **ping markers** ("look here").
- Guide tools: signposts (persisted notes on the world), summon party, follow mode,
  spotlight NPC (opens the Code Panel for everyone), a guided "tour step" list.
- Co-op Code-Body fights (shared body grid, separate Energy and Focus).
- Raids on Hero's Trial issues: role assignment by region, shared boss HP from
  tests.
- Moderation basics: invite-only rooms, kick, mute, report.

### Out (later phases)
- Voice chat (use external tools; future integration).
- Public open-world servers with strangers (not planned; invite-only by design).

## Design

### Network model
- **Server-authoritative** for fights, quest progress in party mode, signposts
  and raid state.
- **Client-authoritative movement** with server sanity checks (speed limits,
  walkable tiles) and interpolation for remote players.
- Colyseus schema state: `players`, `signposts`, `fight`, `raid`, `chat`
  (last 100 messages).
- Reconnection: 60 seconds to rejoin with state restored.

### Party and roles
| Role | Can |
|---|---|
| **Mentor** | Summon, spotlight, place and edit signposts, start a raid, assign roles, set tour steps |
| **Member** | Move freely, chat, ping, answer in co-op fights, place personal notes |

### Guide tools
- **Signposts:** a mentor writes a note on any tile or NPC ("Start here: this is
  where requests enter"). Persisted per world+party in PocketBase; exportable to
  `.codequest/` authored content (Phase 15).
- **Summon:** teleport the party to the mentor (members can decline).
- **Follow mode:** a member's camera follows the mentor.
- **Spotlight:** opens the same NPC's Code Panel on everyone's screen, with the
  mentor's highlighted line range.
- **Tour steps:** an ordered checklist of places; members see the next step
  marker.
- **Progress view:** the mentor sees members' **Kingdom Light %** and current
  objective (only within the party, only with the members' consent shown on joining).

### Co-op fights
- When any party member starts a fight, nearby members (within 10 tiles) can
  join.
- **Shared body, separate Energy:** all players act on the same monster body
  grid; each has their own Energy per round and their own Focus. One player can
  Read while another Severs, so teams learn to split the work.
- **Monster turns** target one player at a time (rotating); teammates may suggest
  the exit heart, but only the targeted player commits the prediction.
- The **explanation** is shown to everyone after each round (learning together).
- Variant: "Discuss mode" — the mentor locks the answer until the team agrees.

### Raids (team Hero's Trial)
- The mentor picks an issue from the Quest Board → the raid starts.
- **Role assignment:** the mapped locations are split by region; each member gets
  an investigation zone with objectives (talk to these NPCs, read these tests).
- The **shared boss HP** = failing related tests (from the mentor's runner,
  Phase 10). Results are broadcast to the party.
- Members post **findings** (a pinned note + code ref) to a shared raid board.
- Victory when the tests pass; everyone gets a Raid trophy (the Contributor Cape
  still requires the individual's own merged pull request).

### Safety and moderation
- Rooms are **invite-only** (signed links, expiring).
- Chat filters (basic profanity list, configurable), mute, kick, report → stored
  for the room owner.
- No direct messages between strangers (there are no strangers: invite-only).

## Tasks
- [ ] Colyseus server + room lifecycle + auth through Phase 13 accounts.
- [ ] State schema + client sync + interpolation + sanity checks + reconnection.
- [ ] Party invites + roles.
- [ ] Chat, emotes, pings.
- [ ] Guide tools: signposts (persisted), summon, follow, spotlight, tour steps, progress view with consent.
- [ ] Co-op fights (join radius, shared body, separate Energy, rotating monster turns, discuss mode).
- [ ] Raids (role assignment, shared HP, raid board).
- [ ] Moderation basics.

## Automated tests
- **Room state unit tests:** joins, leaves, role changes, signposts CRUD, raid lifecycle.
- **Multi-client E2E (Playwright, 2–3 browser contexts):** mentor creates a room → member joins via link → sees the mentor → summon works → spotlight opens the same panel → co-op fight: both act on the shared body → the body state is identical on both clients.
- **Network conditions:** simulated latency (150 ms) and packet loss → movement stays smooth and the fight state stays consistent.
- **Reconnection:** kill a client connection → rejoin within 60 seconds → state restored.
- **Authorization:** members can't use mentor tools (server rejects); expired invites fail.
- **Consent:** the progress view is hidden for members who declined.

## Manual test script
1. Open two browsers (or ask a friend). Create a room on `tiny-ts` as the mentor; join as a member.
2. As the mentor, place 3 signposts telling the story of a request; use summon and spotlight.
3. Fight a monster together in co-op mode.
4. Start a raid on the "archived tasks" issue from Phase 10; split roles; finish it.
5. Ask yourself: would this be a better first day than a 2-hour architecture talk?

## Definition of done
- [ ] All tests green, including the multi-client tests.
- [ ] A real two-person session completed (notes below).
- [ ] Invite-only, consent and authorization rules verified.

## Risks
| Risk | Mitigation |
|---|---|
| Sync bugs | Server-authoritative core state; extensive multi-client tests |
| Server costs | Rooms only while active; small state; idle shutdown |
| Mentor features feel like surveillance | Consent on joining; party-only; no keystroke or time tracking |

## Hand-off to the next phase
Phase 15 receives signposts (to export as authored content) and party
infrastructure for classrooms.

## Start prompt for Claude
```
Read AGENTS.md, docs/plans/README.md, the MASTER-PLAN sections listed in the
phase header, and docs/plans/phases/P14-multiplayer.md.
Implement Phase 14 on branch phase/14-multiplayer. Run the automated tests,
walk me through the manual test script, and fill in the Results section.
```

## Results (fill in after testing)
- Date:
- Automated tests:
- Two-person session notes:
- Decisions / ADRs:
