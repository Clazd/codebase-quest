import type { ContentItem, ContentSource } from "./types.ts";
import { type ValidationContext, validateContent } from "./validate.ts";

/** Anything that can write content: Ollama, the Anthropic API, MCP sampling, the bridge. */
export interface ContentProvider {
  readonly source: ContentSource;
  /** Returns raw JSON; it is validated by the engine. `feedback` holds the previous rejection reasons. */
  generate(item: ContentItem, feedback: readonly string[], signal: AbortSignal): Promise<unknown>;
}
/** A provider declined (e.g. `stop_reason: "refusal"`); the engine falls back instead of retrying. */
export class ProviderRefusal extends Error {}
export interface Attempt {
  source: ContentSource;
  ok: boolean;
  reasons: string[];
}
export interface Produced {
  output: unknown;
  source: ContentSource;
  attempts: Attempt[];
}
function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    run(controller.signal),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`timed out after ${ms} ms`));
      }, ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
/**
 * Ask each provider in turn; reject with reasons → retry once with the reasons →
 * next provider → template fallback. Every output passes the same validators.
 */
export async function produce(
  item: ContentItem,
  providers: readonly ContentProvider[],
  ctx: ValidationContext,
  fallback: () => unknown,
  options: { retries?: number; timeoutMs?: number } = {},
): Promise<Produced> {
  const attempts: Attempt[] = [];
  for (const provider of providers) {
    let feedback: string[] = [];
    for (let attempt = 0; attempt <= (options.retries ?? 1); attempt++) {
      let raw: unknown;
      try {
        raw = await withTimeout((signal) => provider.generate(item, feedback, signal), options.timeoutMs ?? 30_000);
      } catch (error) {
        const reason =
          error instanceof ProviderRefusal
            ? `refusal: ${error.message}`
            : error instanceof SyntaxError
              ? `invalid JSON: ${error.message}`
              : `error: ${error instanceof Error ? error.message : String(error)}`;
        attempts.push({ source: provider.source, ok: false, reasons: [reason] });
        if (error instanceof SyntaxError) {
          feedback = [reason];
          continue;
        }
        break;
      }
      const checked = validateContent(item, raw, ctx);
      attempts.push({ source: provider.source, ok: checked.ok, reasons: checked.ok ? [] : checked.reasons });
      if (checked.ok) return { output: checked.value, source: provider.source, attempts };
      feedback = checked.reasons;
    }
  }
  const output = fallback();
  const checked = validateContent(item, output, ctx);
  if (!checked.ok) throw new Error(`Template fallback failed validation: ${checked.reasons.join("; ")}`);
  attempts.push({ source: "template", ok: true, reasons: [] });
  return { output: checked.value, source: "template", attempts };
}
