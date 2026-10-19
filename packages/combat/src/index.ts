/**
 * @codebase-quest/combat: Code-Body Combat. This entry is browser-safe: data
 * contracts, the rules engine and the balance simulator. The syntax-tree body
 * builder, safe evaluator, body inputs and mutations live in `./node`.
 */
export * from "./rules.ts";
export * from "./schema.ts";
export * from "./simulate.ts";
export const packageInfo = { name: "@codebase-quest/combat", phase: 7, status: "engine" } as const;
