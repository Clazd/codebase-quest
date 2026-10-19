import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { DEFAULT_MODEL } from "../budget.ts";
import { CONTENT_TYPES } from "../types.ts";

export const AI_MODES = ["off", "agent", "ollama", "api"] as const;
export type AiMode = (typeof AI_MODES)[number];
const loopback = (url: string) => {
  try {
    return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
};
export const AiConfigSchema = z.object({
  version: z.literal(1).default(1),
  /** Off by default: templates and search only, no network. */
  mode: z.enum(AI_MODES).default("off"),
  ollama: z
    .object({
      url: z
        .string()
        .refine(loopback, "Ollama must run on this machine (127.0.0.1/localhost)")
        .default("http://127.0.0.1:11434"),
      model: z.string().min(1).default("llama3.2"),
    })
    .default({ url: "http://127.0.0.1:11434", model: "llama3.2" }),
  api: z
    .object({
      model: z.string().min(1).default(DEFAULT_MODEL),
      /** Per content type overrides; moving to a cheaper model is the owner's decision after evals. */
      models: z.partialRecord(z.enum(CONTENT_TYPES), z.string().min(1)).default({}),
      effort: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
      budgetUsdPerDay: z.number().nonnegative().max(1000).default(1),
      /** Server-side refusal fallback (`fallbacks: "default"`); shown in settings. */
      refusalFallback: z.boolean().default(true),
    })
    .default({ model: DEFAULT_MODEL, models: {}, effort: "medium", budgetUsdPerDay: 1, refusalFallback: true }),
  /** Explicit consent per repository root for off-machine AI (API mode). */
  consent: z.record(z.string(), z.object({ api: z.string() })).default({}),
  notices: z.object({ agent: z.string().optional() }).default({}),
});
export type AiConfig = z.infer<typeof AiConfigSchema>;

/** `$CQ_HOME` or `~/.codequest`: user-level settings, never inside a repository or save. */
export function cqHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.CQ_HOME || join(homedir(), ".codequest");
}
function writePrivate(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, text, { mode: 0o600 });
  renameSync(temp, path);
  try {
    chmodSync(path, 0o600);
  } catch {}
}
export function loadAiConfig(home = cqHome()): AiConfig {
  const path = join(home, "config.json");
  if (!existsSync(path)) return AiConfigSchema.parse({});
  return AiConfigSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}
/** Keys are never stored: the schema has no field for them, and unknown fields are dropped. */
export function saveAiConfig(config: AiConfig, home = cqHome()): void {
  writePrivate(join(home, "config.json"), `${JSON.stringify(AiConfigSchema.parse(config), null, 2)}\n`);
}
export function hasApiConsent(config: AiConfig, repoRoot: string): boolean {
  return Boolean(config.consent[repoRoot]?.api);
}
export function grantApiConsent(repoRoot: string, home = cqHome(), now = new Date()): AiConfig {
  const config = loadAiConfig(home);
  config.consent[repoRoot] = { api: now.toISOString() };
  saveAiConfig(config, home);
  return config;
}
/** Daily API spend, by UTC date. */
export function loadSpend(home = cqHome(), now = new Date()): number {
  const path = join(home, "usage.json");
  if (!existsSync(path)) return 0;
  try {
    const data = z.record(z.string(), z.number()).parse(JSON.parse(readFileSync(path, "utf8")));
    return data[now.toISOString().slice(0, 10)] ?? 0;
  } catch {
    return 0;
  }
}
export function saveSpend(spentUsd: number, home = cqHome(), now = new Date()): void {
  const path = join(home, "usage.json");
  let data: Record<string, number> = {};
  try {
    if (existsSync(path)) data = JSON.parse(readFileSync(path, "utf8"));
  } catch {}
  data[now.toISOString().slice(0, 10)] = spentUsd;
  writePrivate(path, `${JSON.stringify(data, null, 2)}\n`);
}
