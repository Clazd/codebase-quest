import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
/** Reads report data only. Never launches a test runner or imports repository code. */
export function readCoverage(root: string, paths: string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const relative of ["lcov.info", "coverage/lcov.info", "coverage.xml", "coverage/coverage.xml"]) {
    let current = root,
      safe = true;
    for (const part of relative.split("/")) {
      current = join(current, part);
      if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
        safe = false;
        break;
      }
    }
    if (!safe || !existsSync(current) || !lstatSync(current).isFile() || lstatSync(current).size > 20_000_000) continue;
    for (const [path, value] of parseCoverage(readFileSync(current, "utf8"), paths)) result.set(path, value);
  }
  return result;
}
export function parseCoverage(text: string, paths: string[]): Map<string, number> {
  const result = new Map<string, number>();
  const resolve = (name: string) => {
    const clean = name.replaceAll("\\", "/").replace(/^\.\//, "");
    const candidates = paths.filter((p) => clean === p || clean.endsWith(`/${p}`));
    return candidates.length === 1 ? candidates[0] : null;
  };
  for (const block of text.split("end_of_record")) {
    const file = /^SF:(.+)$/m.exec(block)?.[1]?.trim();
    if (!file) continue;
    const path = resolve(file);
    if (!path) continue;
    const lines = [...block.matchAll(/^DA:(\d+),(\d+)/gm)];
    if (lines.length) result.set(path, lines.filter((m) => Number(m[2]) > 0).length / lines.length);
  }
  // No XML parser/evaluation: only bounded report class/line attributes; external entities are ignored.
  for (const item of text.matchAll(/<class\b[^>]*filename=["']([^"']+)["'][^>]*>([\s\S]*?)<\/class>/g)) {
    const path = resolve(item[1] ?? "");
    if (!path) continue;
    const lines = [...(item[2] ?? "").matchAll(/<line\b[^>]*hits=["'](\d+)["'][^>]*\/?\s*>/g)];
    if (lines.length) result.set(path, lines.filter((m) => Number(m[1]) > 0).length / lines.length);
  }
  return result;
}
