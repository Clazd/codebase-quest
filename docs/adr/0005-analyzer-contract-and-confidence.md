# 0005. Analyzer v1 contracts, bounded workers and recovery confidence

- Status: Accepted
- Date: 2026-10-19
- Phase: 02

## Context

Phase 02 needs offline deterministic facts from TypeScript/JavaScript and Python,
without executing analyzed code or exposing credentials. The original schema was
a placeholder. Phase 03 is queued and needs a stable CodeGraph contract.

## Decision

Use the explicit CodeGraph v1 schema and documented pipeline in
`packages/analyzer/README.md`. Keep syntax-derived call confidence separate from
runtime/type certainty, require exact bindings for literal test facts and keep
all parser/skipping/resolution diagnostics visible. Fixed inputs are decoded
as syntax; arbitrary expressions never run.

Vendor four WASM grammars from @vscode/tree-sitter-wasm 0.3.1 (upstream TS/TSX
0.23.2, JS/Python 0.25.0), with licenses, SHA-256 manifest and Git LFS. Use
web-tree-sitter 0.27.1. Worker count is CPU-minus-one **capped at eight** to bound
WASM memory; config may explicitly override this cap. This is a small deviation
from an uncapped CPU-minus-one pool.

Normalize identifier and member spelling when finding duplicate bodies. This
deliberately identifies the fixture's semantically different formatDate/money
twins as near copies. It is not a proof of equivalent behavior. No static Mutant
is reported: the fixture's designated injection target belongs to Phase 07.
No fixture source/history was changed to force a detector to pass.

## Parser limitation and smoke threshold deviation

Real-repo smoke found valid syntax recovered as errors in five files of the
pinned Zustand commit: semicolonless generic call signatures and a trailing
comma following a typeof-import generic argument. The same errors reproduced
with the grammar distributor's matching runtime and an alternate build of the
same upstream grammar. All three other pinned repos have zero parser-error files.

Keep `parse-error` diagnostics and the measured 10% raw file error rate for
Zustand. An exact commit/path allowlist distinguishes those known recoveries
from **new** errors in the nightly <5% sanity gate. This deliberately deviates
from applying the example <5% threshold to raw errors across every repo; it
does not suppress diagnostics or report recovered files as clean. Call edges
touching recovered files cannot be exact, and such files cannot yield scored
literal facts. Upgrade grammars and remove this allowance when it is fixed.

## Consequences

Phase 03 receives real roles, metrics, topology, entry points, tests, smells and
uncertainty. Analyzer README documents every v1 heuristic and gap. Pinned smoke
and an explicit 2× time/RSS regression gate provide a reviewable baseline.
Manual owner verification of their chosen project's three familiar functions
remains separate from the agent's documented spot-check of this repository.
