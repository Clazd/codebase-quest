/**
 * Checks that every asset file in packages/assets/ has an entry in
 * packages/assets/LICENSES.md (MASTER-PLAN §21.4).
 *
 *   pnpm license-check               report only (Phase 00: a stub, always exits 0)
 *   pnpm license-check -- --enforce  fail when a file is missing (enforced from Phase 01)
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ASSETS = fileURLToPath(new URL("../packages/assets/", import.meta.url));
/** Package plumbing, not assets. */
const NOT_ASSETS = new Set(["package.json", "LICENSES.md"]);

export function listAssetFiles(root = ASSETS): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const rel = relative(root, abs).split(sep).join("/");
      if (entry.isDirectory()) {
        if (rel !== "src" && rel !== "node_modules") walk(abs);
      } else if (!NOT_ASSETS.has(rel)) {
        out.push(rel);
      }
    }
  };
  walk(root);
  return out.sort();
}

export function unlicensedAssets(root = ASSETS): string[] {
  const licenses = readFileSync(join(root, "LICENSES.md"), "utf8");
  return listAssetFiles(root).filter((file) => !licenses.includes(`\`${file}\``));
}

function main(): void {
  const enforce = process.argv.includes("--enforce");
  const files = listAssetFiles();
  const missing = unlicensedAssets();
  console.log(`Checked ${files.length} asset file(s) against packages/assets/LICENSES.md.`);
  for (const file of missing) console.log(`  missing license entry: ${file}`);
  if (missing.length > 0 && enforce) process.exit(1);
  if (missing.length === 0) console.log("Every asset has a license entry.");
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) main();
