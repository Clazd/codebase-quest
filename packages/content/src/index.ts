/**
 * @codebase-quest/content: Content engine, providers, validators and cache.
 *
 * This entry is browser-safe: dialogue templates, content types, validators,
 * BM25 search, the answer guard and the hint ladder. Node-only parts (fact sheet
 * builder, disk cache, settings, Ollama/Anthropic providers) live in `./node`.
 */
export { BudgetExceeded, CostMeter, costUsd, DEFAULT_MODEL, PRICES, type Usage } from "./budget.ts";
export {
  type DialogueLine,
  type DialogueLocale,
  dialogueFor,
  fill,
  RULES,
  variantIndex,
  winningRule,
} from "./dialogue.ts";
export { type Attempt, type ContentProvider, type Produced, ProviderRefusal, produce } from "./engine.ts";
export { AnswerGuard } from "./guard.ts";
export { HINT_LEVELS, type Hint, type HintEvidence, HintLadder, type HintLevel } from "./hints.ts";
export { makeItem, outputSchema, stableHash, templateOutput, worldItems } from "./items.ts";
export { parseJson, SYSTEM_PROMPT, userPrompt } from "./prompts.ts";
export { buildSearchIndex, type SearchHit, type SearchIndex, search, searchAnswer, stem, tokenize } from "./search.ts";
export * from "./types.ts";
export {
  allowedIdentifiers,
  checkRef,
  codeIdentifiers,
  suspiciousReasons,
  type Validation,
  type ValidationContext,
  validateContent,
} from "./validate.ts";
export const packageInfo = {
  name: "@codebase-quest/content",
  phase: 6,
  status: "engine",
} as const;
