# Repository analyzer (CodeGraph v1)

`cq analyze` reads a repository and writes deterministic, schema-validated facts.
It never imports or executes the target's code, tests, install scripts or config.
Parsing uses web-tree-sitter 0.27.1 and four pinned WASM grammars shipped through
Git LFS. Run `git lfs pull` after cloning. Grammar source licenses and SHA-256
hashes are in `grammars/`; provenance is in the central asset license manifest.

```sh
pnpm cq -- analyze fixtures/repos/tiny-ts --pretty --out out/tiny.json
pnpm cq -- stats out/tiny.json
pnpm cq -- analyze . --out out/self.graph.json
pnpm cq -- analyze fixtures/repos/weird-repo --pretty --out out/weird.json
```

## Discovery and privacy

Git projects use `git ls-files` for tracked and untracked/nonignored paths.
Non-git folders use directory traversal and nested `.gitignore` filters.
Neither follows symlinks; git's 120000 index entries are recognized on Windows
even when the checkout materializes a symlink as a plain text file.
`node_modules`, vendor/build/cache/virtualenv folders are always excluded.
Credential paths (`.env*`, PEM/key/PFX files, private SSH keys, credentials files,
`.aws`, `.ssh`, `.netrc`, `.npmrc`, `.pypirc`) are rejected **before any read**.
Files larger than 1 MiB, NUL-containing binary data and invalid UTF-8 are skipped
with diagnostics. Empty files are retained; CRLF is normalized; deep paths are
retained and diagnosed. `.gitkeep` is scaffolding, not a code file.

`ROLE_RULES` in `discover.ts` is the single role table. Source, test, config,
docs, build, CI, manifest, migration, generated and asset roles are represented.
Generated headers take priority; generated code is retained but not parsed.
Markdown/text docs are capped at 20,000 characters with a truncation diagnostic.
Common credential assignments, private-key blocks and token patterns are masked.
Sensitive literal assertions are skipped rather than turned into false facts.

Git history is read once with numstat, without textconv/external diffs. File
dates, commit counts, churn and distinct-author counts are recorded; identities
are never stored. Non-git/uncommitted files have null history. Fsmonitor hooks
are disabled during listings so repository configuration cannot execute hooks.

## Parsing, symbols and metrics

Workers use CPU count minus one, capped at eight independent WASM runtimes for
memory. `workers` can override the cap. Results are reassembled in input order.
Syntax errors produce location diagnostics and recoverable symbols. A failure
of the parser/runtime itself fails analysis instead of silently dropping a file.

TS/TSX/JS/JSX extraction covers function declarations, const-bound arrows and
function expressions, classes, methods/accessors/constructors, interfaces and
type aliases. Python covers module functions, classes and methods. Named nested
functions retain qualified lexical names. JS test/describe callbacks receive
stable line-qualified names for test edges. Ranges are 1-based lines and
0-based columns. Parameters/types, return annotations, async/generator flags,
exports, JSDoc/docstrings and decorators are retained.

Traits: exported, async, constructor, event-handler (name or registration),
recursive (exact self-edge), does-io (configurable API list), pure-candidate
(no detected I/O, outer assignment or unknown/dynamic calls), deprecated and
test. A pure-candidate is a heuristic, not a proof of purity.

LOC includes the whole symbol range. Cyclomatic starts at 1 for callable symbols
and adds if/elif/case/loops/catch/except/conditional/comprehension conditions and
logical `&&`, `||`, `and`, `or`. Nested functions own their own branches.
Nesting counts control blocks, including try/with. Fan-in/out count distinct
callers/callees over resolved edges; dynamicCalls counts unresolved dynamic
dispatch/callbacks and unknown object methods.

## Resolution and confidence

| Evidence | Confidence / result |
|---|---|
| Lexically visible local function; resolved named import | exact |
| `this`/`self`/`cls` method in the known class | exact |
| Module namespace member | likely |
| Unique name in another file with no binding proof | guess |
| Shadowed name, arbitrary object receiver, computed dispatch, callback parameter | no fabricated edge; diagnostic + dynamic metric |
| Source or callee file has parser recovery | call confidence capped at likely; no scored test facts |

Relative TS/JS imports try extensions and index files, including emitted `.js`
references to `.ts` sources. Python supports absolute/relative packages,
`__init__.py`, aliases and namespace imports. Basic root tsconfig JSONC
`baseUrl`/`paths` aliases and explicit reexports are supported. Bare imports
become external module nodes, with a manifest-declared badge. Dynamic imports,
inheritance outside syntax evidence, complicated barrel cycles, tsconfig
extends/project references, runtime monkeypatching and precise type resolution
remain uncertain; diagnostics preserve unresolved internal edges/calls.
Only exact facts should power scored questions. Phase 16 adds type resolution.

Test imports and calls create `tests` edges; importing a class covers its class
for smell detection. Literal facts support JS `expect(f(...)).toBe/toEqual`,
`assert.equal/strictEqual/deepEqual`, Python `assert f(...) == ...`, and
`self.assertEqual`. Values may be nested literal objects/arrays, finite numbers,
strings, booleans and null/None. Variables, function calls, spreads, template
interpolation and unsupported matchers are never evaluated. A fact requires an
exact, unrecovered callee binding. Unsupported literal assertion shapes are
skipped or diagnosed; no answer is inferred with AI.

Entry points cover manifest main/bin/exports, Python `__main__`, Express-style
routes, Flask/FastAPI route decorators, basic commander/argparse/click/typer
commands, and event `.on` registrations. Their labels are masked data.

## Smells and configuration

Every smell records target IDs, lines, measured values/thresholds where relevant,
and explanatory evidence. Config file `codequest.config.json` is read as JSON;
`--config` explicitly supplies a different file. Config never runs as code.

```json
{
  "workers": 4,
  "thresholds": {
    "complexity": 10, "functionLoc": 60, "nesting": 4,
    "parameters": 5, "fileLoc": 800, "methods": 20,
    "duplicateStatements": 6
  },
  "ioApis": ["fetch", "open", "fs.", "requests.", "query"]
}
```

- Gremlin: TODO/FIXME/HACK **comment nodes**, not matching strings.
- Serpent: complexity >10 or callable LOC >60. Minotaur: nesting >4.
- Mimic: equal hashes of normalized body syntax with at least six statements;
  all identifiers, including member names, are placeholders. This flags near
  copies such as getDate/getUTCDate; it does not claim semantic equivalence.
- Ghost: unexported function with no known callers/entry role. Wisp replaces it
  when dynamic calls or a string reference make reachability uncertain.
- Imp: unnamed numeric literals other than 0/1 and index -1, excluding named
  const initializers and tests. One finding per affected line.
- Wraith: empty catch/except body (comments/pass count as empty).
- Shapeshifter: unannotated or explicit-any parameters. Echo: >5 parameters.
- Shadow: no exact test reference; excludes Ghost/Wisp, methods of classes,
  entry points, interfaces/types and test files.
- Golem: file >800 lines. Titan: class >20 methods (cohesion is not proven).
- Ouroboros: Tarjan components over file-import edges.
- Mutant: no static finding. Injection belongs to Phase 07; the fixture names
  its future target. Emitting one now would invent a bug.

## Output and validation

Stable IDs are the first 12 SHA-1 hex digits of path/kind/qualified-name/ordinal
components. All ID collections and trait arrays are sorted; zod fixes key order.
There are no timestamps, absolute roots, thread-completion ordering or RNG in
the graph. The schema checks IDs, references and symbol bounds before output.
`serializeGraph` is the canonical JSON writer. `stats` reports edges by confidence,
smells, entries, assertions and diagnostics.

## Validation and known limits

Unit tests cover all languages, literal decoding, aliases/reexports, shadowing,
methods, credential-read boundaries and hostile code that must never execute.
Three committed `goldens/*.graph.json` files make changes reviewable; update
deliberately with `CQ_UPDATE_GOLDENS=1 pnpm test packages/analyzer/src` (PowerShell:
set `$env:CQ_UPDATE_GOLDENS='1'` first, then remove it after updating).
All six fixtures have schema, range/reference and cross-worker determinism tests.

`pnpm fixtures:pinned` fetches four pinned permissive repos without executing
them. `pnpm analyzer:smoke` analyzes all four and benchmarks Jotai, the largest
by recorded source LOC. It fails above 2× the committed time or peak RSS baseline.
`--update-baseline` explicitly records a new measurement. The nightly workflow
also checks >50% internal import resolution and <5% new parser-error files.

The pinned TypeScript grammar reports errors in five valid Zustand files
(semicolonless generic overload signatures / trailing comma after typeof-import
generic arguments). The exact commit/file allowance is versioned in
`known-grammar-recoveries.json`; actual error counts remain reported (10% there),
and affected calls/facts are downgraded. Other pinned repos currently parse
without errors. This is a documented deviation in ADR 0005, not a claim that all
TypeScript syntax is supported perfectly.
