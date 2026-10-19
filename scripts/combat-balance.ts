/** Reproducible simulated play; analyzes source and never executes it. */
import { resolve } from "node:path";
import { maskLines } from "../apps/cli/src/source.ts";
import { discover } from "../packages/analyzer/src/discover.ts";
import { analyze } from "../packages/analyzer/src/index.ts";
import balance from "../packages/combat/src/balance.json" with { type: "json" };
import type { Balance } from "../packages/combat/src/rules.ts";
import type { Encounter } from "../packages/combat/src/schema.ts";
import { balanceReport } from "../packages/combat/src/simulate.ts";
import { buildEncounters } from "../packages/puzzles/src/encounter.ts";
import { generate } from "../packages/worldgen/src/index.ts";

const repositories = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["fixtures/repos/tiny-ts", "fixtures/repos/smelly-ts"];
const encounters: Encounter[] = [];
for (const repository of repositories) {
  const root = resolve(repository);
  const graph = await analyze(root);
  const files = new Map(discover(root).files.map((f) => [f.path, f]));
  const result = await buildEncounters(generate(graph), graph, (path) => {
    const file = files.get(path);
    return file?.language ? { text: maskLines(file.text.split("\n")).lines.join("\n"), language: file.language } : null;
  });
  encounters.push(...result.encounters.values());
}
const baseline = encounters
  .filter((e) => !["ghost", "wisp"].includes(e.kind))
  .map((e) => ({ ...e, level: 1, smellAttack: { ...e.smellAttack, focusDamage: 1 } }));
console.log(
  JSON.stringify(
    {
      repositories,
      encounters: encounters.length,
      story: [0.4, 0.6, 0.8].map((accuracy) => balanceReport(encounters, balance as Balance, "story", accuracy, 20)),
      level1: {
        note: "Fixture severities start at level 2. Normalize attack severity to level 1; retain all generated cells/questions. Exclude instant reports and Ghost proofs from pacing.",
        ...balanceReport(baseline, balance as Balance, "normal", 0.6, 40),
      },
    },
    null,
    2,
  ),
);
