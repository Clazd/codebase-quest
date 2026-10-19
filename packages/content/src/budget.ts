/** USD per million tokens (Anthropic first-party list prices, 2026-10). Update with the model table. */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};
export const DEFAULT_MODEL = "claude-opus-5-5";
export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}
/** Estimated cost of one response; cache writes cost 1.25× input, batches half price. */
export function costUsd(model: string, usage: Usage, options: { batch?: boolean } = {}): number {
  const price = PRICES[model] ?? PRICES[DEFAULT_MODEL];
  if (!price) return 0;
  const usd =
    (usage.input_tokens * price.input +
      (usage.cache_creation_input_tokens ?? 0) * price.input * 1.25 +
      (usage.cache_read_input_tokens ?? 0) * price.cacheRead +
      usage.output_tokens * price.output) /
    1_000_000;
  return options.batch ? usd / 2 : usd;
}
export class BudgetExceeded extends Error {}
/** Tracks API spend per day against the user's budget; persisted by the caller's store. */
export class CostMeter {
  spentUsd: number;
  readonly limitUsd: number;
  private readonly onChange: (spentUsd: number) => void;
  constructor(limitUsd: number, spentUsd = 0, onChange: (spentUsd: number) => void = () => {}) {
    this.limitUsd = limitUsd;
    this.spentUsd = spentUsd;
    this.onChange = onChange;
  }
  get remainingUsd(): number {
    return Math.max(0, this.limitUsd - this.spentUsd);
  }
  /** Throws before a request when the budget is already used up. */
  assertAvailable(): void {
    if (this.spentUsd >= this.limitUsd)
      throw new BudgetExceeded(`API budget of $${this.limitUsd.toFixed(2)} for today is used up`);
  }
  record(model: string, usage: Usage, options: { batch?: boolean } = {}): number {
    const usd = costUsd(model, usage, options);
    this.spentUsd = Math.round((this.spentUsd + usd) * 1e6) / 1e6;
    this.onChange(this.spentUsd);
    return usd;
  }
}
