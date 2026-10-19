/**
 * Applies .github/labels.json to the GitHub repository with the GitHub CLI.
 *
 *   pnpm labels:sync                 dry run: prints what would be created or updated
 *   pnpm labels:sync -- --apply      creates/updates the labels (needs `gh auth login`)
 *
 * It never deletes labels. Only run --apply with the repository owner's approval.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const LabelsSchema = z.array(
  z.object({
    name: z.string().min(1).max(50),
    color: z.string().regex(/^[0-9a-f]{6}$/),
    description: z.string().max(100),
  }),
);
export type Label = z.infer<typeof LabelsSchema>[number];

export const LABELS_FILE = fileURLToPath(new URL("../.github/labels.json", import.meta.url));

export function readLabels(file = LABELS_FILE): Label[] {
  return LabelsSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

/** Arguments for `gh` that create or update one label (no shell involved). */
export function ghArgs(label: Label): string[] {
  return ["label", "create", label.name, "--color", label.color, "--description", label.description, "--force"];
}

function main(): void {
  const apply = process.argv.includes("--apply");
  const labels = readLabels();
  for (const label of labels) {
    const args = ghArgs(label);
    if (apply) {
      execFileSync("gh", args, { stdio: "inherit" });
    } else {
      console.log(`gh ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}`);
    }
  }
  console.log(apply ? `Applied ${labels.length} labels.` : `Dry run: ${labels.length} labels. Add --apply to apply.`);
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) main();
