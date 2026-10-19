import { existsSync, mkdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { git } from "./git.ts";
import type { FixtureDefinition } from "./types.ts";

export type BuildStatus = "created" | "rebuilt" | "unchanged";

export interface BuildResult {
  name: string;
  status: BuildStatus;
  head: string;
  commits: number;
}

function assertSafeRelativePath(path: string): void {
  const parts = path.split("/");
  if (path.startsWith("/") || path.includes("\\") || parts.some((p) => p === "" || p === "." || p === "..")) {
    throw new Error(`Unsafe fixture path "${path}"`);
  }
}

/** Creates the git repository for `fixture` in `dir` (which must not exist). Returns the HEAD commit. */
export function createFixtureRepo(fixture: FixtureDefinition, dir: string): string {
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "--quiet", "--initial-branch=main"]);
  // Repo-local settings that keep content byte-exact and history unsigned on every OS.
  git(dir, ["config", "core.autocrlf", "false"]);
  git(dir, ["config", "commit.gpgsign", "false"]);

  const symlinks: { path: string; target: string }[] = [];

  for (const commit of fixture.commits) {
    const toAdd: string[] = [];
    const toRemove: string[] = [];
    for (const change of commit.changes) {
      assertSafeRelativePath(change.path);
      const abs = join(dir, change.path);
      if (change.kind === "file") {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, change.contents);
        toAdd.push(change.path);
      } else if (change.kind === "delete") {
        rmSync(abs, { force: true });
        toRemove.push(change.path);
      } else {
        // Stage the symlink directly (mode 120000), so the commit is the same
        // whether or not this OS can create symlinks.
        const blob = git(dir, ["hash-object", "-w", "--stdin"], { input: change.target });
        git(dir, ["update-index", "--add", "--cacheinfo", `120000,${blob},${change.path}`]);
        symlinks.push(change);
      }
    }
    if (toAdd.length > 0) git(dir, ["add", "--", ...toAdd]);
    if (toRemove.length > 0) git(dir, ["rm", "--cached", "--quiet", "--", ...toRemove]);

    const who = {
      GIT_AUTHOR_NAME: commit.author.name,
      GIT_AUTHOR_EMAIL: commit.author.email,
      GIT_AUTHOR_DATE: commit.date,
      GIT_COMMITTER_NAME: commit.author.name,
      GIT_COMMITTER_EMAIL: commit.author.email,
      GIT_COMMITTER_DATE: commit.date,
    };
    git(dir, ["commit", "--quiet", "--allow-empty", "-m", commit.message], { env: who });
  }

  // Put symlinks in the working tree. Where git found no symlink support at
  // `init` (usually Windows), git's own convention applies: a plain file
  // holding the target.
  const symlinksSupported = gitConfig(dir, "core.symlinks") !== "false";
  for (const link of symlinks) {
    const abs = join(dir, link.path);
    mkdirSync(dirname(abs), { recursive: true });
    if (symlinksSupported) symlinkSync(link.target, abs);
    else writeFileSync(abs, link.target);
  }
  git(dir, ["update-index", "--refresh", "-q"]);

  return git(dir, ["rev-parse", "HEAD"]);
}

function gitConfig(dir: string, key: string): string | undefined {
  try {
    return git(dir, ["config", "--get", key]);
  } catch {
    return undefined; // `git config --get` exits 1 when the key is unset
  }
}

function currentHead(dir: string): string | undefined {
  if (!existsSync(join(dir, ".git"))) return undefined;
  try {
    const head = git(dir, ["rev-parse", "HEAD"]);
    const dirty = git(dir, ["status", "--porcelain", "--untracked-files=all"]);
    return dirty === "" ? head : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Builds `fixture` into `root/<name>`. Idempotent: if an identical, clean
 * repository is already there, it is left untouched ("unchanged").
 */
export function buildFixture(fixture: FixtureDefinition, root: string): BuildResult {
  const target = join(root, fixture.name);
  const staging = join(root, `.staging-${fixture.name}-${process.pid}`);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });

  const head = createFixtureRepo(fixture, staging);
  const result = { name: fixture.name, head, commits: fixture.commits.length };

  const existing = currentHead(target);
  if (existing === head) {
    rmSync(staging, { recursive: true, force: true });
    return { ...result, status: "unchanged" };
  }
  const status: BuildStatus = existsSync(target) ? "rebuilt" : "created";
  rmSync(target, { recursive: true, force: true });
  renameSync(staging, target);
  return { ...result, status };
}

/** Builds every fixture into `root`. */
export function buildFixtures(fixtures: readonly FixtureDefinition[], root: string): BuildResult[] {
  return fixtures.map((fixture) => buildFixture(fixture, root));
}

/** Lists fixtures whose HEAD differs from the lock (or that the lock doesn't know). */
export function lockMismatches(
  results: readonly BuildResult[],
  lock: Readonly<Record<string, { head: string; commits: number }>>,
): string[] {
  const problems: string[] = [];
  for (const r of results) {
    const expected = lock[r.name];
    if (expected === undefined) problems.push(`${r.name}: not in fixtures.lock.json`);
    else if (expected.head !== r.head || expected.commits !== r.commits) {
      problems.push(
        `${r.name}: built ${r.head} (${r.commits} commits), lock says ${expected.head} (${expected.commits})`,
      );
    }
  }
  for (const name of Object.keys(lock)) {
    if (!results.some((r) => r.name === name)) problems.push(`${name}: in fixtures.lock.json but not defined`);
  }
  return problems;
}
