# Codebase Quest MCP server and setup

Your own agent (Claude Code, Codex, Cursor, Claude Desktop…) prepares the
world's text, searches the code and steers the running game. No API key.

```sh
pnpm cq -- setup --dry-run                     # show the plan, write nothing
pnpm cq -- setup --client claude_code          # review, approve, then restart Claude Code
pnpm cq -- uninstall --client claude_code      # remove only what setup added
pnpm cq -- ai                                  # AI settings (Off by default)
```

Setup registers `node <repo>/apps/cli/src/main.ts mcp` and installs the
`codebase-quest` skill (`apps/mcp/skill/codebase-quest/SKILL.md`). It backs up
each config it changes (`<config>.codequest.backup`, kept from the first run),
is idempotent, and refuses malformed or symlinked configs before writing.

| Client | Config | Skill | Notes |
|---|---|---|---|
| Claude Code | `~/.claude.json` (`$CLAUDE_CONFIG_DIR`) | `~/.claude/skills/codebase-quest` | Restart after setup |
| Claude Desktop | `claude_desktop_config.json` (MSIX private copy on Windows when present) | none | Quit fully first; run from a terminal it did not start |
| Codex | `$CODEX_HOME/config.toml` (`~/.codex`) | `~/.agents/skills/codebase-quest` | `startup_timeout_sec = 30` |
| Cursor | `~/.cursor/mcp.json` | `~/.agents/skills/codebase-quest` | Reload after setup |

Sampling (Gitling level 2) works only with clients that advertise MCP sampling;
others use search or the experimental bridge loop.

## Tools

`cq_status`, `cq_build_world`, `cq_next_content_batch`, `cq_submit_content`,
`cq_search_code`, `cq_get_symbol`, `cq_player_state`, `cq_focus`,
`cq_validate_content`, `cq_create_quest`, `cq_wait_for_question`,
`cq_answer_question`. Repository text in results is wrapped as
`{ untrusted: true, … }`; submissions are validated (schema, limits, grounding,
citations, answer-leak guard) and rejected with readable reasons.

`cq_player_state`, `cq_focus` and the Gitling bridge need `cq play` running for
the same repository: it writes a token to `~/.codequest/sessions/` that the MCP
server uses to connect to `ws://127.0.0.1:<port>/bridge`.

## Gitling answer levels

1. Search (always, offline; BM25 index shipped as `search.json`).
2. MCP sampling, in agent mode when the client supports it.
3. The bridge loop (`cq_wait_for_question` → `cq_answer_question`), experimental.
4. Ollama (local) or the Anthropic API (optional key, consent, daily budget).

The chat panel shows which level answered. See ADR 0009 for the design.
