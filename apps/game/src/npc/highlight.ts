import type { Language } from "@codebase-quest/shared";

export type Token = { content: string; color?: string };
/** A high-contrast theme keeps every token readable (WCAG AA) on the code background. */
export const CODE_THEME = "github-dark-high-contrast";
const LANGS: Record<Language, string> = {
  typescript: "typescript",
  tsx: "tsx",
  javascript: "javascript",
  jsx: "jsx",
  python: "python",
};
type Highlighter = { codeToTokensBase(code: string, options: { lang: string; theme: string }): Token[][] };
let highlighter: Promise<Highlighter> | undefined;

/** Shiki loads lazily (JavaScript regex engine, no WASM) the first time code is shown. */
function load(): Promise<Highlighter> {
  highlighter ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
      import("shiki/core"),
      import("shiki/engine/javascript"),
    ]);
    return createHighlighterCore({
      themes: [import("shiki/themes/github-dark-high-contrast.mjs")],
      langs: [
        import("shiki/langs/typescript.mjs"),
        import("shiki/langs/tsx.mjs"),
        import("shiki/langs/javascript.mjs"),
        import("shiki/langs/jsx.mjs"),
        import("shiki/langs/python.mjs"),
      ],
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
  })();
  highlighter.catch(() => {
    highlighter = undefined;
  });
  return highlighter;
}
/**
 * Tokens per line, or null when the language is unknown or highlighting fails.
 * The token text of each line always concatenates back to the exact source line.
 */
export async function highlight(lines: readonly string[], language: Language | null): Promise<Token[][] | null> {
  if (!language) return null;
  try {
    const tokens = (await load()).codeToTokensBase(lines.join("\n"), { lang: LANGS[language], theme: CODE_THEME });
    if (tokens.length !== lines.length || tokens.some((line, i) => line.map((t) => t.content).join("") !== lines[i]))
      return null;
    return tokens.map((line) => line.map((t) => ({ content: t.content, color: t.color })));
  } catch {
    return null;
  }
}
