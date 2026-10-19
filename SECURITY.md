# Security policy

## Reporting a vulnerability

**Please don't report security problems in public issues.**

Report them privately through GitHub:
[**Report a vulnerability**](https://github.com/Clazd/codebase-quest/security/advisories/new)
(Security tab → "Report a vulnerability").

Please include what you found, how to reproduce it, and what an attacker could
do with it. We'll acknowledge your report within 72 hours, keep you updated,
and credit you in the fix unless you'd rather stay anonymous.

## What matters most here

Codebase Quest reads other people's code, so we especially want to hear about:

- Any way an analyzed repository can make Codebase Quest **execute its code**,
  read secrets (`.env`, keys, credentials), or write outside its output folder.
- **Prompt injection** that changes a scored answer, leaks answer keys, or makes
  an AI path take actions (via repository text, the MCP server, or content).
- Secrets leaking into saves, caches, logs or shared worlds.

## Supported versions

The project is pre-alpha. Only the latest `main` branch is supported.
