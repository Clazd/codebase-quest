import { z } from "zod";
export const AnalyzerConfigSchema = z.object({
  workers: z.number().int().min(1).max(64).optional(),
  thresholds: z
    .object({
      complexity: z.number().positive().default(10),
      functionLoc: z.number().positive().default(60),
      nesting: z.number().positive().default(4),
      parameters: z.number().positive().default(5),
      fileLoc: z.number().positive().default(800),
      methods: z.number().positive().default(20),
      duplicateStatements: z.number().positive().default(6),
    })
    .default({
      complexity: 10,
      functionLoc: 60,
      nesting: 4,
      parameters: 5,
      fileLoc: 800,
      methods: 20,
      duplicateStatements: 6,
    }),
  ioApis: z
    .array(z.string())
    .default([
      "fetch",
      "open",
      "print",
      "fs.",
      "readFile",
      "writeFile",
      "requests.",
      "query",
      "insert",
      "update",
      "database.",
      "db.",
      "console.",
      "time.",
    ]),
});
export type AnalyzerConfig = z.infer<typeof AnalyzerConfigSchema>;
