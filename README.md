# Codebase Quest

> **Every codebase is a world. Go explore.**

![Status: pre-alpha](https://img.shields.io/badge/status-pre--alpha-orange)
[![CI](https://github.com/Clazd/codebase-quest/actions/workflows/ci.yml/badge.svg)](https://github.com/Clazd/codebase-quest/actions/workflows/ci.yml)
![License: MIT](https://img.shields.io/badge/code-MIT-blue)
![Assets: CC-BY-4.0](https://img.shields.io/badge/assets-CC--BY--4.0-lightgrey)

Codebase Quest turns any code repository into a 2D pixel-art RPG. Folders become
regions, files become buildings, and functions become characters you can talk to.
Code smells are monsters **whose bodies are made of their real code**, the most
complex functions are bosses, and the final quest is fixing a real issue in the
real project.

- 🧭 **Learn any codebase by playing it.** Every scored question in the game
  comes from facts about the real code (call graph, syntax tree, tests, git),
  never AI guesses.
- 🔑 **No API key needed.** It works with no AI at all, or with your own AI agent
  (Claude Code, Codex, Cursor…) through MCP.
- 🔒 **Local-first.** Your code stays on your machine.

<!-- First GIF goes here once a repository is walkable (Milestone B). -->

## Status: pre-alpha

Nothing is playable yet. The project is being built in public, phase by phase.
Right now there is a project skeleton, a test scene with a walking character,
and the test fixtures the analyzer will be built against.

## Roadmap

The full design and the step-by-step build plan live in
[`docs/plans/`](docs/plans/README.md):

- [Master plan](docs/plans/MASTER-PLAN.md): vision, game design, architecture
- [Phases](docs/plans/README.md#build-order-and-status): 18 phases, each built and tested before the next
- [Decision records](docs/adr/): why things are the way they are

## Run it

You need [Node.js 24](https://nodejs.org/) and [pnpm](https://pnpm.io/)
(`corepack enable` sets up the right version).

```sh
pnpm install
pnpm dev          # the game's test scene at http://localhost:5173
pnpm test         # unit tests (also builds the fixture repositories)
pnpm e2e          # browser tests (first time: pnpm exec playwright install chromium)
pnpm check        # lint, format and type checks
pnpm cq -- help   # the command-line tool
```

## Contribute

You're welcome here, and there are many ways to help: code, pixel art, music
and sound, monster designs, language support, fixtures, translations and
playtesting. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and look for issues
labelled [`good first issue`](https://github.com/Clazd/codebase-quest/labels/good%20first%20issue).

Please read our [Code of Conduct](CODE_OF_CONDUCT.md). To report a security
problem, see [SECURITY.md](SECURITY.md).

## License

Code: [MIT](LICENSE). Original art and audio: [CC-BY-4.0](ASSETS-LICENSE.md).
Third-party assets keep their own licenses, listed in
[`packages/assets/LICENSES.md`](packages/assets/LICENSES.md).
