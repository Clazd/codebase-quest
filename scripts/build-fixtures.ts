/**
 * Builds the fixture repositories in fixtures/repos/ (see fixtures/README.md).
 *
 *   pnpm fixtures                  build (idempotent) and verify against fixtures/fixtures.lock.json
 *   pnpm fixtures -- --update-lock build and rewrite the lock (after changing fixture sources)
 */
import { existsSync, writeFileSync } from "node:fs";
import { buildFixtures, lockMismatches } from "./fixtures/build.ts";
import { allFixtures, FIXTURE_LOCK, FIXTURE_REPOS, type FixtureLock, readLock } from "./fixtures/definitions.ts";

const args = new Set(process.argv.slice(2).filter((a) => a !== "--"));
const unknown = [...args].filter((a) => a !== "--update-lock");
if (unknown.length > 0) {
  console.error(`Unknown option(s): ${unknown.join(" ")}`);
  process.exit(2);
}

const results = buildFixtures(allFixtures(), FIXTURE_REPOS);
for (const r of results) {
  console.log(`${r.status.padEnd(9)} ${r.name.padEnd(12)} ${r.head} (${r.commits} commits)`);
}

if (args.has("--update-lock")) {
  const lock: FixtureLock = Object.fromEntries(results.map((r) => [r.name, { head: r.head, commits: r.commits }]));
  writeFileSync(FIXTURE_LOCK, `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`Wrote ${FIXTURE_LOCK}`);
} else {
  const problems = existsSync(FIXTURE_LOCK) ? lockMismatches(results, readLock()) : ["fixtures.lock.json is missing"];
  if (problems.length > 0) {
    console.error("Fixture history differs from fixtures/fixtures.lock.json:");
    for (const p of problems) console.error(`  - ${p}`);
    console.error("If you changed fixture sources on purpose, run: pnpm fixtures -- --update-lock");
    process.exit(1);
  }
  console.log("All fixtures match fixtures.lock.json.");
}
