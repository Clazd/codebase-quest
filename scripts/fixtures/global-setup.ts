import { buildFixtures, lockMismatches } from "./build.ts";
import { allFixtures, FIXTURE_REPOS, readLock } from "./definitions.ts";

/** Vitest global setup: make sure fixtures/repos/ is built and matches the lock. */
export default function setup(): void {
  const results = buildFixtures(allFixtures(), FIXTURE_REPOS);
  const problems = lockMismatches(results, readLock());
  if (problems.length > 0) {
    throw new Error(`Fixture repositories don't match fixtures/fixtures.lock.json:\n${problems.join("\n")}`);
  }
}
