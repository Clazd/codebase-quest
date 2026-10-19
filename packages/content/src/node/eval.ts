import type { ContentProvider } from "../engine.ts";
import { produce } from "../engine.ts";
import { templateOutput } from "../items.ts";
import type { ContentItem } from "../types.ts";
import type { ValidationContext } from "../validate.ts";

export interface EvalReport {
  provider: string;
  items: number;
  /** Accepted from the provider on the first try / after one retry. */
  firstTry: number;
  afterRetry: number;
  /** Fell back to templates. */
  fallbacks: number;
  /** Rejection reasons by category (schema, grounding, citation, limits, refusal, error…). */
  reasons: Record<string, number>;
  costUsd: number;
}
/**
 * The content eval: runs world items through a provider and measures how often
 * its output passes the validators. Opt-in; with the API provider it costs money.
 */
export async function runEval(
  items: readonly ContentItem[],
  provider: ContentProvider | null,
  ctx: ValidationContext,
  seed: string,
  spent: () => number = () => 0,
): Promise<EvalReport> {
  const report: EvalReport = {
    provider: provider?.source ?? "template",
    items: items.length,
    firstTry: 0,
    afterRetry: 0,
    fallbacks: 0,
    reasons: {},
    costUsd: 0,
  };
  const start = spent();
  for (const item of items) {
    const result = await produce(item, provider ? [provider] : [], ctx, () => templateOutput(item, seed), {
      retries: 1,
    });
    const tries = result.attempts.filter((a) => a.source !== "template");
    if (result.source === "template" && provider) report.fallbacks++;
    else if (tries.length <= 1) report.firstTry++;
    else report.afterRetry++;
    for (const a of tries)
      for (const reason of a.reasons) {
        const key = reason.split(":")[0] ?? "other";
        report.reasons[key] = (report.reasons[key] ?? 0) + 1;
      }
  }
  report.costUsd = Math.round((spent() - start) * 1e6) / 1e6;
  return report;
}
