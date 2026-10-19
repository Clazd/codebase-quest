/**
 * @codebase-quest/puzzles: the question library (MASTER-PLAN §7.8). Generators
 * draw every scored answer from ground truth (syntax tree, call graph, test
 * assertions, the safe evaluator, injected mutations, diffs); opinion questions
 * are marked unscored. Node-only (it reads syntax trees).
 */
export * from "./encounter.ts";
export * from "./generators.ts";
export const packageInfo = { name: "@codebase-quest/puzzles", phase: 7, status: "library" } as const;
