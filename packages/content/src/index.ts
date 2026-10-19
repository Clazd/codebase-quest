/**
 * @codebase-quest/content: Content engine, providers, validators and cache.
 *
 * Phase 05 adds the template dialogue engine (browser-safe). Fact sheets are
 * built in Node by `./facts`. AI providers arrive in Phase 06.
 */
export {
  type DialogueLine,
  type DialogueLocale,
  dialogueFor,
  fill,
  RULES,
  variantIndex,
  winningRule,
} from "./dialogue.ts";
export const packageInfo = {
  name: "@codebase-quest/content",
  phase: 5,
  status: "templates",
} as const;
