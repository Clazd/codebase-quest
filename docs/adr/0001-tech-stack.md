# 0001. Tech stack and workspace layout

- Status: Accepted
- Date: 2026-10-19
- Phase: 00

## Context

MASTER-PLAN §16.2 chooses the stack and §16.3 the repository layout. Phase 00
sets them up so every later phase only adds code. This record pins the exact
versions and the few implementation choices the plan leaves open.

## Decision

**Versions (latest stable on 2026-10-19):**

| Tool | Version | Notes |
|---|---|---|
| Node.js | 24 LTS (`.nvmrc`; tested on 24.20.0) | Runs TypeScript scripts directly (type stripping), so no `tsx`/`ts-node` |
| pnpm | 10.33.1 (`packageManager`) | Workspaces: `apps/*`, `packages/*`, `tools/*` |
| TypeScript | 7.0.2 | The native compiler; only used for `tsc --noEmit` |
| zod | 4.6.7 | |
| Vite | 8.3.4 | |
| Vitest | 5.0.5 | One root config for all packages |
| Playwright | 1.64.1 | Chromium only for now; `@axe-core/playwright` 4.14.0 for accessibility |
| Biome | 2.5.15 | Lint + format |
| Phaser | 4.2.1 | Current stable major |

Preact, Shiki, web-tree-sitter, the MCP SDK and the rest of §16.2 are added by
the phases that first need them, so nothing unused is installed now.

**Implementation choices:**

- **Source-first packages.** Workspace packages export their `src/index.ts`
  directly (`"exports": { ".": "./src/index.ts" }`). Vite, Vitest and Node's type
  stripping all consume TypeScript as-is, so there's no build step between
  packages. TypeScript code uses only erasable syntax (`erasableSyntaxOnly`)
  and `.ts` import extensions so Node can run it.
- **One type-check for the whole repo** (`tsconfig.json` at the root, strict,
  `noUncheckedIndexedAccess`). Per-package configs can come later if needed.
- **Package names** use the `@codebase-quest/*` scope. All packages are
  `private` for now.
- **Debug API** `window.__CQ__` is installed behind a compile-time constant
  `__CQ_DEBUG__` (Vite `define`), `false` only in production builds, so the
  bundler removes it entirely. A unit test builds both modes and checks the
  production bundle doesn't contain `__CQ__`.
- **E2E tests** run against a test-mode build served by `vite preview`
  (production-like bundle plus the debug API), not the dev server.
- **Fixture repositories are generated, not committed.** Git can't store nested
  repositories, so fixture sources live in `fixtures/src/` (one folder per
  commit) and `scripts/build-fixtures.ts` builds real git repos in
  `fixtures/repos/` (ignored). Fixtures that need exact bytes (binary, CRLF,
  non-UTF-8, symlinks, a 2 MB file, a `.env`) are generated in code. Git runs
  with system/global config ignored and fixed authors and dates, and
  `fixtures/fixtures.lock.json` records the expected HEADs, so any machine
  that builds different history fails loudly.
- **Placeholder art:** Kenney "Tiny Dungeon" (CC0), recorded in
  `packages/assets/LICENSES.md`.

**npm package name.** On 2026-10-19, `npm view codebase-quest` returned 404, so
the unscoped name **`codebase-quest` is available**. Nothing has been published
or reserved. Publishing the `@codebase-quest/*` scope would need an npm
organization of that name, which wasn't checked or created.

## Consequences

- Any contributor needs only Node 24 and pnpm (plus Git, and Git LFS for art).
- TypeScript 7, Vite 8 and Vitest 5 are recent majors; if a later tool needs the
  TypeScript JS API (e.g. the analyzer's precise TS mode), it can depend on the
  `typescript` 6.x package separately.
- Packages can't use TypeScript `enum`s or parameter properties (erasable
  syntax only).
- Changing fixture sources requires `pnpm fixtures -- --update-lock`.
