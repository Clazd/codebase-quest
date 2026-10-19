import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { CostMeter } from "../budget.ts";
import { type ContentProvider, ProviderRefusal } from "../engine.ts";
import { parseJson, SYSTEM_PROMPT, userPrompt } from "../prompts.ts";
import { type ContentItem, type ContentType, OUTPUT_SCHEMAS } from "../types.ts";
import type { AiConfig } from "./settings.ts";

/** Ollama's local HTTP API: private and free. JSON output constrained by the item's schema. */
export class OllamaProvider implements ContentProvider {
  readonly source = "ollama" as const;
  private readonly config: AiConfig["ollama"];
  private readonly request: typeof fetch;
  constructor(config: AiConfig["ollama"], request: typeof fetch = fetch) {
    this.config = config;
    this.request = request;
  }
  async generate(item: ContentItem, feedback: readonly string[], signal: AbortSignal): Promise<unknown> {
    const response = await this.request(new URL("/api/chat", this.config.url), {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.config.model,
        stream: false,
        format: item.outputSchema,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt(item, feedback) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
    const body = (await response.json()) as { message?: { content?: string } };
    return parseJson(body.message?.content ?? "");
  }
}

/** Never let a key or auth header reach logs or the game: report the error class only. */
export function safeApiError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return "authentication failed (check your API key)";
  if (error instanceof Anthropic.RateLimitError) return "rate limited, try again later";
  if (error instanceof Anthropic.APIError) return `API error ${error.status ?? ""}`.trim();
  if (error instanceof Error) return error.message.replace(/sk-ant-[\w-]+/g, "[REDACTED]");
  return "unknown error";
}
type Client = Pick<Anthropic, "beta" | "messages">;
/**
 * Optional Anthropic API mode. Credentials come only from the SDK's own
 * resolution (environment or `ant auth login` profile); nothing is stored.
 */
export class AnthropicProvider implements ContentProvider {
  readonly source = "api" as const;
  private readonly config: AiConfig["api"];
  private readonly meter: CostMeter;
  private client: Client | undefined;
  constructor(config: AiConfig["api"], meter: CostMeter, client?: Client) {
    this.config = config;
    this.meter = meter;
    this.client = client;
  }
  private get api(): Client {
    this.client ??= new Anthropic();
    return this.client;
  }
  model(type: ContentType): string {
    return this.config.models[type] ?? this.config.model;
  }
  private system() {
    // The stable prefix is cached; the per-item fact sheet follows it.
    return [{ type: "text" as const, text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" as const } }];
  }
  async generate(item: ContentItem, feedback: readonly string[], signal: AbortSignal): Promise<unknown> {
    this.meter.assertAvailable();
    const model = this.model(item.contentType);
    const response = await this.api.beta.messages.parse(
      {
        model,
        max_tokens: 16000,
        ...(this.config.refusalFallback
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
        output_config: { effort: this.config.effort, format: zodOutputFormat(OUTPUT_SCHEMAS[item.contentType]) },
        system: this.system(),
        messages: [{ role: "user", content: userPrompt(item, feedback) }],
      },
      { signal },
    );
    this.meter.record(response.model ?? model, response.usage);
    if (response.stop_reason === "refusal")
      throw new ProviderRefusal(response.stop_details?.category ?? "declined by the model");
    if (response.stop_reason === "max_tokens") throw new Error("response was cut off (max_tokens)");
    if (response.parsed_output == null) throw new SyntaxError("structured output could not be parsed");
    return response.parsed_output;
  }
  /** Streams a Gitling answer's text for chat, then returns the parsed JSON for validation. */
  async stream(item: ContentItem, onText: (text: string) => void, signal: AbortSignal): Promise<unknown> {
    this.meter.assertAvailable();
    const model = this.model(item.contentType);
    const stream = this.api.messages.stream(
      {
        model,
        max_tokens: 16000,
        output_config: { effort: this.config.effort, format: zodOutputFormat(OUTPUT_SCHEMAS[item.contentType]) },
        system: this.system(),
        messages: [{ role: "user", content: userPrompt(item, []) }],
      },
      { signal },
    );
    stream.on("text", onText);
    const message = await stream.finalMessage();
    this.meter.record(message.model ?? model, message.usage);
    if (message.stop_reason === "refusal") throw new ProviderRefusal(message.stop_details?.category ?? "declined");
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return parseJson(text);
  }
  /**
   * Bulk prebuild through the Batches API (half price). Fallbacks are not accepted
   * on batches, so refusals there fall back to templates.
   */
  async prebuild(
    items: readonly ContentItem[],
    options: { pollMs?: number; signal?: AbortSignal } = {},
  ): Promise<Map<string, unknown>> {
    this.meter.assertAvailable();
    const batch = await this.api.messages.batches.create({
      requests: items.map((item, i) => ({
        custom_id: `item-${i}`,
        params: {
          model: this.model(item.contentType),
          max_tokens: 16000,
          output_config: { effort: this.config.effort, format: zodOutputFormat(OUTPUT_SCHEMAS[item.contentType]) },
          system: this.system(),
          messages: [{ role: "user" as const, content: userPrompt(item, []) }],
        },
      })),
    });
    let status = batch;
    while (status.processing_status !== "ended") {
      if (options.signal?.aborted) throw new Error("prebuild cancelled");
      await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? 30_000));
      status = await this.api.messages.batches.retrieve(batch.id);
    }
    const out = new Map<string, unknown>();
    for await (const result of await this.api.messages.batches.results(batch.id)) {
      const item = items[Number(result.custom_id.slice(5))];
      if (!item || result.result.type !== "succeeded") continue;
      const message = result.result.message;
      this.meter.record(message.model, message.usage, { batch: true });
      if (message.stop_reason !== "end_turn") continue;
      const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      try {
        out.set(item.id, parseJson(text));
      } catch {}
    }
    return out;
  }
}
