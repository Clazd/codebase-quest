/**
 * Fetches the pinned open-source repositories listed in fixtures/pinned.json
 * into fixtures/pinned/<name> (ignored by git), at their exact commits.
 *
 *   pnpm fixtures:pinned              fetch all
 *   pnpm fixtures:pinned -- flask     fetch one
 *
 * Only downloads source. Nothing in these repositories is ever executed: git
 * hooks don't come with a fetch, and LFS downloads are skipped.
 */
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { git } from "./fixtures/git.ts";
import { PINNED_DIR, readPinned } from "./fixtures/pinned.ts";

const wanted = process.argv.slice(2).filter((a) => a !== "--");
const repos = readPinned().filter((r) => wanted.length === 0 || wanted.includes(r.name));
if (repos.length === 0) {
  console.error(`No pinned repository named ${wanted.join(", ")}`);
  process.exit(2);
}

const env = { GIT_LFS_SKIP_SMUDGE: "1" };

for (const repo of repos) {
  const dir = join(PINNED_DIR, repo.name);
  if (existsSync(join(dir, ".git"))) {
    try {
      if (git(dir, ["rev-parse", "HEAD"]) === repo.commit) {
        console.log(`unchanged ${repo.name} @ ${repo.tag}`);
        continue;
      }
    } catch {
      // Broken checkout: fetch again below.
    }
  }
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "--quiet", "--initial-branch=main"], { env });
  git(dir, ["remote", "add", "origin", repo.url], { env });
  git(dir, ["fetch", "--quiet", "--depth=1", "origin", repo.commit], { env });
  git(dir, ["-c", "advice.detachedHead=false", "checkout", "--quiet", "FETCH_HEAD"], { env });
  console.log(`fetched   ${repo.name} @ ${repo.tag} (${repo.commit.slice(0, 12)})`);
}
