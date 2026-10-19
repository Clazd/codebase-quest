import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let isolatedConfig: string | undefined;

/** An empty file used as the global git config, so nobody's personal settings leak into fixtures. */
function emptyGlobalConfig(): string {
  if (isolatedConfig === undefined) {
    const dir = mkdtempSync(join(tmpdir(), "cq-git-"));
    isolatedConfig = join(dir, "gitconfig");
    writeFileSync(isolatedConfig, "");
  }
  return isolatedConfig;
}

/**
 * Environment for running git on fixture repositories.
 *
 * Fixture history must be byte-identical on every machine, so this ignores the
 * system and global git config (autocrlf, signing, templates, default branch…)
 * and drops inherited `GIT_*` variables (e.g. `GIT_DIR` when run from a hook).
 * It never touches the user's own config or this project's repository.
 */
export function isolatedGitEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.toUpperCase().startsWith("GIT_")) env[key] = value;
  }
  return {
    ...env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: emptyGlobalConfig(),
    GIT_TERMINAL_PROMPT: "0",
    ...extra,
  };
}

export interface GitOptions {
  env?: Record<string, string>;
  input?: string | Uint8Array;
}

/** Runs git in `cwd` without a shell and returns stdout (trimmed of one trailing newline). */
export function git(cwd: string, args: readonly string[], options: GitOptions = {}): string {
  const out = execFileSync("git", args, {
    cwd,
    env: isolatedGitEnv(options.env),
    input: options.input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.endsWith("\n") ? out.slice(0, -1) : out;
}
