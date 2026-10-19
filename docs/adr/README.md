# Architecture decision records

Short records of decisions that shape the project, and of every deviation from
the plans in `docs/plans/`. One file per decision: `NNNN-title.md`, numbered in
order, never renumbered. Superseded records stay, with a link to the new one.

| # | Decision | Status |
|---|---|---|
| [0001](0001-tech-stack.md) | Tech stack and workspace layout | Accepted |
| [0002](0002-licenses.md) | MIT for code, CC-BY-4.0 for original assets | Accepted |
| [0003](0003-combat-model.md) | Combat prototype; adjust pending playtest | Prototype accepted |
| [0004](0004-art-style.md) | Blender pixel style study; adoption pending playtest | Prototype accepted |
| [0005](0005-analyzer-contract-and-confidence.md) | Analyzer contract, confidence and known grammar recoveries | Accepted |
| [0006](0006-world-layout-and-export-contract.md) | Deterministic world layout and portable exports | Accepted |
| [0007](0007-walkable-client-and-local-play.md) | Walkable client, accessible HUD and local play cache | Accepted |

Template:

```md
# NNNN. Title

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD
- Phase: XX

## Context
## Decision
## Consequences
```
