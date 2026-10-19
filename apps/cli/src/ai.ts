import { resolve } from "node:path";
import { CONTENT_TYPES, PRICES } from "@codebase-quest/content";
import {
  AI_MODES,
  type AiMode,
  cqHome,
  grantApiConsent,
  loadAiConfig,
  loadSpend,
  saveAiConfig,
} from "@codebase-quest/content/node";

const API_SENDS =
  "In API mode, Gitling questions and content prebuilds send fact sheets (names, paths, signatures, doc comments, callers, callees, metrics) and, for dialogue, the symbol's masked code lines to the Anthropic API. Keys are read only from your environment or `ant auth login`; Codebase Quest never stores them.";

/** `cq ai`: show or change AI settings. Off is the default; nothing here needs a key. */
export async function aiCommand(
  args: readonly string[],
  confirm: (question: string) => Promise<boolean>,
  home = cqHome(),
): Promise<{ code: number; stdout: string; stderr: string }> {
  const [, sub = "status", value, ...rest] = args;
  const config = loadAiConfig(home);
  if (sub === "status") {
    const lines = [
      `AI mode: ${config.mode}${config.mode === "off" ? " (templates and search only; no network)" : ""}`,
      `Ollama: ${config.ollama.model} at ${config.ollama.url}`,
      `API: ${config.api.model} · effort ${config.api.effort} · refusal fallback ${config.api.refusalFallback ? "on" : "off"}`,
      `API budget: $${loadSpend(home).toFixed(4)} of $${config.api.budgetUsdPerDay.toFixed(2)} today`,
      `API consent: ${Object.keys(config.consent).join(", ") || "none"}`,
      "Recommended: agent mode through MCP (`cq setup`), no key needed.",
    ];
    return { code: 0, stdout: `${lines.join("\n")}\n`, stderr: "" };
  }
  if (sub === "mode") {
    if (!AI_MODES.includes(value as AiMode)) throw new Error(`Usage: cq ai mode ${AI_MODES.join("|")}`);
    config.mode = value as AiMode;
    saveAiConfig(config, home);
    const extra =
      value === "api" ? `\n${API_SENDS}\nPrivate repositories ask for consent before the first request.` : "";
    return { code: 0, stdout: `AI mode set to ${value}.${extra}\n`, stderr: "" };
  }
  if (sub === "budget") {
    const usd = Number(value);
    if (!Number.isFinite(usd) || usd < 0 || usd > 1000) throw new Error("Usage: cq ai budget <usd per day, 0-1000>");
    config.api.budgetUsdPerDay = usd;
    saveAiConfig(config, home);
    return { code: 0, stdout: `API budget set to $${usd.toFixed(2)} per day.\n`, stderr: "" };
  }
  if (sub === "model") {
    if (!value) throw new Error("Usage: cq ai model <model id> [--type <content type>]");
    const type = rest[0] === "--type" ? rest[1] : undefined;
    if (type && !(CONTENT_TYPES as readonly string[]).includes(type)) throw new Error(`Unknown content type ${type}`);
    if (type) config.api.models[type as (typeof CONTENT_TYPES)[number]] = value;
    else config.api.model = value;
    saveAiConfig(config, home);
    const priced = PRICES[value] ? "" : " (no price on file: the cost meter uses the default model's price)";
    return { code: 0, stdout: `API model${type ? ` for ${type}` : ""} set to ${value}${priced}.\n`, stderr: "" };
  }
  if (sub === "consent") {
    const root = resolve(value ?? ".");
    if (!(await confirm(`${API_SENDS}\nAllow API mode for ${root}? [y/N] `)))
      return { code: 0, stdout: "No consent given. Nothing was changed.\n", stderr: "" };
    grantApiConsent(root, home);
    return { code: 0, stdout: `API consent recorded for ${root}.\n`, stderr: "" };
  }
  throw new Error(
    "Usage: cq ai [status|mode <off|agent|ollama|api>|budget <usd>|model <id> [--type <t>]|consent <repo>]",
  );
}
