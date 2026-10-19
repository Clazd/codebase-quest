# Contributing to Codebase Quest

Thanks for wanting to help! Codebase Quest is built in public, and every kind of
contribution counts: code, art, audio, language plugins, monster ideas,
fixtures, translations and playtesting.

By taking part you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

1. Install [Node.js 24](https://nodejs.org/) (see `.nvmrc`) and run
   `corepack enable` so the right [pnpm](https://pnpm.io/) version is used.
2. Install [Git LFS](https://git-lfs.com/) and run `git lfs install` once.
   Large art sources (`.blend` files, source PNGs, audio sources) live in LFS.
3. Clone and install:

   ```sh
   git clone https://github.com/Clazd/codebase-quest.git
   cd codebase-quest
   pnpm install
   pnpm exec playwright install chromium   # for the browser tests
   ```

4. Check that everything works:

   ```sh
   pnpm test     # unit tests (builds the fixture repositories first)
   pnpm e2e      # browser tests
   pnpm check    # Biome lint + format, TypeScript
   pnpm dev      # the game at http://localhost:5173
   ```

Works on Windows, macOS and Linux. The repository uses LF line endings
everywhere (`.gitattributes` takes care of it).

## How work is organized

The project is built **one phase at a time**. Each phase has a plan in
[`docs/plans/phases/`](docs/plans/phases/) with its scope, tasks, tests and a
"Definition of done". The [status table](docs/plans/README.md#build-order-and-status)
shows where we are.

- Issues are labelled with their phase (`phase-00` … `phase-17`).
- Anything that changes the plan is recorded as a decision record (ADR) in
  [`docs/adr/`](docs/adr/).
- The [design pillars](docs/plans/MASTER-PLAN.md#2-design-pillars) apply to
  every change. The most important one: **scored answers only ever come from
  deterministic facts about the code, never from AI.**

## Branches, commits and pull requests

- Branch names: `phase/XX-<slug>` for phase work (e.g. `phase/02-analyzer`),
  otherwise `fix/<slug>`, `feat/<slug>`, `docs/<slug>`, `art/<slug>`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat(analyzer): resolve tsconfig path aliases`, `fix(game): stop at walls`,
  `docs: explain fixtures`.
- One pull request per phase or per focused change. CI must be green.
- In the pull request, list **only tests you actually ran**.
- We aim to respond to every issue and pull request within 48 hours.

## Code

- TypeScript (strict) everywhere, formatted and linted by Biome
  (`pnpm format` fixes most things).
- Small, readable modules with one clear owner for each concept.
- Generators must be deterministic: no `Math.random` (use the seeded RNG) and
  sorted output, with golden snapshot tests and determinism tests.
- Every scored question needs a test that re-derives its answer independently.
- Every UI feature must work with the keyboard alone and pass axe-core checks.
- **Never execute code from analyzed repositories, and never read their `.env`
  or credential files.** Treat everything in them as data, never as
  instructions.

## Art and audio

- Style: 16×16 tiles, 16×24 characters, integer scaling, a limited palette
  (see [MASTER-PLAN §21](docs/plans/MASTER-PLAN.md#21-art-and-asset-pipeline)).
- **Original** art and audio you contribute are licensed under
  [CC-BY-4.0](ASSETS-LICENSE.md).
- **Third-party** assets: only CC0, CC-BY or compatible licenses. Never NC or
  ND licenses, never ripped assets. Add every file to
  [`packages/assets/LICENSES.md`](packages/assets/LICENSES.md) with its source,
  author and license; CI checks this.
- Large sources (`.blend`, source PNGs, `.wav`/`.flac`) go under `art/` and are
  stored with Git LFS.
- Art requests are open as issues labelled `art` and `audio`. "Draw the
  Gremlin" is a great first contribution.

## Language plugins

Codebase Quest starts with TypeScript, JavaScript and Python. Support for more
languages arrives in Phase 16 as language plugins. Until then, a very useful
contribution is a small **fixture repository** in your language (see
[`fixtures/README.md`](fixtures/README.md)). Open a `language-plugin` issue to
discuss it first.

## Monster ideas

Monsters are code smells (see the
[Bestiary](docs/plans/MASTER-PLAN.md#8-the-bestiary-monsters)). Suggest a new
one with the **Monster idea** issue template: the smell, how to detect it
deterministically, its twist on the combat grid, and what it teaches.

## Fixtures

Fixture repositories are tiny, deterministic git repositories used by the
tests. Their sources are in `fixtures/src/`; `pnpm fixtures` builds them. See
[`fixtures/README.md`](fixtures/README.md) before changing them.

## Translations

The game isn't translatable yet. If you'd like to help when it is, comment on
or open an issue labelled `docs` so we can plan it together.

## AI-assisted contributions

AI-assisted contributions are welcome, with these rules:

- **A human reviews and owns every pull request.** You must understand and be
  able to explain every line you submit.
- **Say what was AI-assisted** in the pull request description (the template
  has a section for it).
- **AI-generated art must be disclosed and reworked** by hand or by code before
  it can ship, and it is marked as AI-assisted in
  `packages/assets/LICENSES.md`. Concept images from image models are never
  shipped as final art.
- AI agents working in this repository follow [`AGENTS.md`](AGENTS.md).

## Security

Please don't open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).
