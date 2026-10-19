import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { REPO_ROOT } from "./definitions.ts";

/** Licenses we may analyze and redistribute results from (MASTER-PLAN §21.4 spirit: permissive only). */
export const PERMISSIVE_LICENSES = ["MIT", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "ISC"] as const;

export const PinnedRepoSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/),
  url: z.url().startsWith("https://github.com/").endsWith(".git"),
  tag: z.string().min(1),
  commit: z.string().regex(/^[0-9a-f]{40}$/),
  language: z.enum(["typescript", "python"]),
  license: z.enum(PERMISSIVE_LICENSES),
  /** Lines in tracked source files of `language` at `commit`. */
  sourceLines: z.number().int().min(5_000).max(50_000),
});
export type PinnedRepo = z.infer<typeof PinnedRepoSchema>;

export const PinnedFileSchema = z.object({
  $comment: z.string().optional(),
  repos: z.array(PinnedRepoSchema),
});

export const PINNED_FILE = join(REPO_ROOT, "fixtures", "pinned.json");
export const PINNED_DIR = join(REPO_ROOT, "fixtures", "pinned");

export function readPinned(file = PINNED_FILE): PinnedRepo[] {
  return PinnedFileSchema.parse(JSON.parse(readFileSync(file, "utf8"))).repos;
}
