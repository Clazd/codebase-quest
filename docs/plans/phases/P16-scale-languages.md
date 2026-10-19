# Phase 16: Scale and More Languages

> **Milestone:** H · Everywhere · **Depends on:** 02 (best after the MVP) · **Effort:** 3–5 weeks (ongoing) ·
> **Status:** Not started
> **Read first:** MASTER-PLAN §8, §16.4, §16.9, §22.3

## Goal
Codebase Quest works on **most popular languages** (Go, Java, C#, Rust, then
Kotlin, PHP, Ruby, C/C++) and on **huge repositories and monorepos** (a million
lines and more), with more **precise** call resolution where language tooling
allows, without breaking determinism or any earlier feature.

## Why now
The MVP proves the game on TypeScript and Python. Wider language support and
scale unlock most real companies and famous open-source projects.

## Scope

### In
- Language plugin architecture formalized (one package per language).
- New languages: **Go, Java, C#, Rust** (tier 1); Kotlin, PHP, Ruby, C/C++
  (tier 2, best-effort).
- Precise resolution (optional): TypeScript compiler API; Language Server
  Protocol (LSP) mode for other languages where a server is installed.
- Scale: streaming regions, worker pools, incremental caches, level of detail,
  monorepo **continents**.
- Benchmarks across repo sizes in CI.

### Out (later phases)
- Exotic languages (on request).
- Cross-repo microservice continents (future expansion).

## Design

### Language plugin contract
```ts
interface LanguagePlugin {
  id: string;                        // "go", "java", …
  extensions: string[];
  grammar: TreeSitterGrammarRef;     // WASM
  extractSymbols(tree, file): SymbolNode[];
  resolveImports(file, ctx): ImportEdge[];
  extractCalls(symbol, tree, ctx): CallEdge[];      // with confidence
  detectEntryPoints(files, ctx): EntryPoint[];
  detectTests(files, ctx): TestLink[];
  extractTestFacts?(tree, file): TestAssertion[];
  traitHints: TraitHints;            // I/O APIs, async markers, constructors…
  smellAdapters: SmellAdapters;      // language-specific rules (e.g. Go's ignored errors as Wraith)
}
```

### Tier 1 language notes
| Language | Symbols | Entry points | Tests | Language-specific monsters |
|---|---|---|---|---|
| **Go** | funcs, methods (receivers), structs, interfaces | `func main`, `http.HandleFunc`, router frameworks | `_test.go`, `TestXxx`, table tests (facts from simple tables) | **Wraith:** `_ =` ignored errors; `err` not checked |
| **Java** | classes, methods, interfaces, records | `main`, Spring `@GetMapping` etc. | JUnit `@Test`, `assertEquals` facts | **Titan:** god classes are common |
| **C#** | classes, methods, properties, records | `Main`, ASP.NET attributes/minimal APIs | xUnit/NUnit `Assert.Equal` facts | **Wraith:** empty catch |
| **Rust** | fns, impls, traits, structs, enums | `fn main`, Axum/Actix routes | `#[test]`, `assert_eq!` facts | **Wraith:** `unwrap()` hotspots (as a Gremlin-like warning) |

### Precise resolution (optional upgrade)
- **TypeScript:** use the compiler API (`ts.createProgram`) to resolve call
  targets and types exactly → upgrade `likely`/`guess` edges to `exact` where
  confirmed; improves Type Sense.
- **LSP mode:** when a language server is available locally (gopls, jdtls,
  OmniSharp/Roslyn, rust-analyzer), query definitions and references for call
  sites the syntax tree couldn't resolve. Opt-in (it can be slow); results are
  cached per file hash.
- Every upgraded edge records its source (`syntax` vs `compiler` vs `lsp`) for
  transparency.

### Scale
| Technique | Detail |
|---|---|
| **Monorepo continents** | Each package or app is a **continent** with its own regions; the overworld becomes a world map of continents; cross-package imports become sea routes |
| **Streaming regions** | The client loads region maps and NPC data on demand; the overworld keeps only summaries |
| **Level of detail** | Far zoom shows districts as blocks; individual buildings appear on approach |
| **Worker pools** | Analysis and world generation are parallel per region; the client uses web workers for pathfinding and minimap rendering |
| **Incremental caches** | Per-file results by content hash (from Phase 11) reused for every analysis |
| **Memory budgets** | The CodeGraph is stored as columnar arrays for big repos; the client never holds all source text |

### Benchmarks (CI job)
| Size | Example | Targets |
|---|---|---|
| 10k lines | fixtures + small pinned | analyze < 5 s; play-ready < 15 s |
| 100k lines | pinned mid-size | analyze < 60 s cold / < 10 s cached; 60 fps |
| 1M lines | pinned large (nightly) | analyze < 10 min cold / < 1 min cached; region load < 2 s; client memory < 1 GB |

## Tasks
- [ ] Extract TS/JS and Python into plugins using the formal contract (no behavior change: goldens stay identical).
- [ ] Go plugin + fixture `tiny-go` (Taskly in Go) + goldens.
- [ ] Java plugin + `tiny-java` + goldens.
- [ ] C# plugin + `tiny-cs` + goldens.
- [ ] Rust plugin + `tiny-rust` + goldens.
- [ ] Tier 2 plugins (best-effort, fewer features).
- [ ] TypeScript compiler-based resolution (optional flag).
- [ ] LSP mode (optional, cached).
- [ ] Monorepo continents in the world generator + client world map.
- [ ] Streaming regions + level of detail + web workers.
- [ ] Columnar graph storage for big repos.
- [ ] Benchmark CI job with thresholds.

## Automated tests
- **Per-language goldens:** each `tiny-<lang>` fixture → CodeGraph and WorldModel snapshots; the known facts (call chain, hotspot, Mimic, cycle, test facts) are found in every language version of Taskly.
- **Cross-language consistency:** all Taskly versions produce the **same number** of regions, a main story with the same chapter count, and equivalent Guardians.
- **Refactor safety:** after the plugin extraction, TS/JS/Python goldens are byte-identical to before.
- **Precision:** with compiler/LSP mode on, the percentage of `exact` edges increases and no previously exact edge changes target (on pinned repos).
- **Scale:** benchmark thresholds; invariants (reachability etc.) hold on the 1M-line repo; client memory measured in Playwright.
- **Monorepo:** a fixture monorepo (3 packages) → 3 continents with sea routes matching cross-package imports.

## Manual test script
1. Play `tiny-go` and `tiny-java`. Does Taskly feel like the same kingdom in another culture?
2. Play a big famous open-source repo in your favorite language. Is it still fun at that size?
3. Turn on LSP mode for a Go or Java repo you know; compare roads before and after.
4. Open a monorepo you know; check the continents.

## Definition of done
- [ ] Tier 1 languages pass all tests; tier 2 basic support works.
- [ ] Benchmarks pass for 10k / 100k / 1M lines.
- [ ] Earlier features (quests, bosses, Time Travel, authored content) work on at least one non-TS/Python repo.

## Risks
| Risk | Mitigation |
|---|---|
| Each language is a deep rabbit hole | Tiered support; contract tests; ship tier 1 well first |
| LSP setup is fragile | Optional; cached; syntax-only remains the default |
| Huge repos overwhelm players | Continents, level of detail, story focused on main flows |

## Hand-off to the next phase
Phase 17 can market "works with your language and your size".

## Start prompt for Claude
```
Read AGENTS.md, docs/plans/README.md, the MASTER-PLAN sections listed in the
phase header, and docs/plans/phases/P16-scale-languages.md.
Implement Phase 16 on branch phase/16-scale-languages. Run the automated tests,
walk me through the manual test script, and fill in the Results section.
```

## Results (fill in after testing)
- Date:
- Automated tests / benchmarks:
- Notes per language:
- Decisions / ADRs:
