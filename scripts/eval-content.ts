/**
 * Opt-in content eval: `pnpm eval:content -- [--repo fixtures/repos/tiny-ts]
 * [--provider template|ollama|api] [--limit 20] [--yes-spend]`.
 * The API provider costs money and needs `--yes-spend` plus your own credentials.
 */

import { Workspace } from "../apps/cli/src/workspace.ts";
import { CostMeter } from "../packages/content/src/index.ts";
import { runEval } from "../packages/content/src/node/eval.ts";
import { AnthropicProvider, loadAiConfig, OllamaProvider } from "../packages/content/src/node/index.ts";

const args = process.argv.slice(2).filter((a) => a !== "--");
const value = (flag: string, fallback: string) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? (args[i + 1] as string) : fallback;
};
const repo = value("--repo", "fixtures/repos/tiny-ts");
const kind = value("--provider", "template");
const limit = Number(value("--limit", "20"));
const ai = loadAiConfig();
const meter = new CostMeter(ai.api.budgetUsdPerDay);
let provider = null;
if (kind === "ollama") provider = new OllamaProvider(ai.ollama);
else if (kind === "api") {
  if (!args.includes("--yes-spend")) {
    process.stderr.write(
      `API evals cost money (default model ${ai.api.model}, budget $${ai.api.budgetUsdPerDay}/day). Rerun with --yes-spend.\n`,
    );
    process.exit(1);
  }
  provider = new AnthropicProvider(ai.api, meter);
} else if (kind !== "template") throw new Error("--provider must be template, ollama or api");
const ws = await Workspace.open(repo);
if (!ws) throw new Error("No world");
const report = await runEval(ws.items.slice(0, limit), provider, ws.context, ws.world.seed, () => meter.spentUsd);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
