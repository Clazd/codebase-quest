# 0003. Hand-authored Code-Body Combat prototype

- Status: Accepted for prototype; adoption pending playtest
- Date: 2026-10-19
- Phase: 01

## Context

The interrupted implementation supplied three hand-authored Taskly encounters
and a pure combat engine. Phase 01 must test both fun and teaching before Phase
07 adopts these rules. Human playtest data does not yet exist.

## Decision

**Adjust: keep this as an experiment and hold the production go decision.**
Ship a dev/test-only combat lab, fixed hints, one balance file, a body map and
code panel, keyboard controls, a Serpent with two phases, mirrored Mimic bodies,
and the Gatekeeper's two-turn `loadTeam` summon. No fixture code is executed.
Question indexes are checked against a separate, hand-audited fact table and
fixture source/assertion text. No answer data is attached to a debug API or MCP.
Prototype routes and data are absent from the production bundle.

The playtest kit defines the planned 3–5-person measurements and thresholds.
After one tuning round, choose go or the documented question-combat fallback
using actual measurements. Do not treat automated victories as evidence of fun.

## Explicit prototype interpretations / deviations

- Trace Strike and correct prediction counters damage body/organ cells, reveal
  the path and expose hearts. They do not destroy joints/hearts. This resolves
  the plan's tension between “damage every cell” and “trace exposes hearts”:
  hearts retain a reason to use Pierce; joints retain a reason to use Sever.
  Playtest this choice before adoption.
- The Serpent's second phase rehides surviving cells and increases prediction
  damage; it preserves the whole function silhouette instead of rearranging
  into a branch-only sub-grid. This keeps the small prototype readable. Phase
  07 must revisit branch grouping with real playtest evidence.
- `checkPermissions` falls through without a return statement. Its closing line
  is an explicit implicit-return heart, so both normal completion and a throw
  are represented. Type annotation and source text establish the distinction.
- Date-dependent questions explicitly fix `now=100`. The fixture's live-clock
  assertion is corroborating text, not an instruction to run its tests.
  Mimic date-method semantics use a named UTC−5 scenario and fixed platform
  arithmetic, not execution of analyzed functions or a generic evaluator.
- Call/permission facts not asserted by fixture tests are labelled syntax/type
  facts with source citations. No tests or histories in analyzed fixtures were
  modified to manufacture evidence.
- Playwright builds a fresh server instead of reusing a potentially stale
  preview; its port is configurable and concurrency capped at two workers.

## Consequences

The balance and pure state machine are reviewable starting points for Phase 07,
not a settled combat design. The phase stays in progress until human sessions,
their results and the final decision are recorded. Phase 00's owner/CI checks
remain pending as recorded in its Results; this continuation is explicitly
authorized by the owner and does not certify that earlier hand-off complete.
