import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { FactFile } from "@codebase-quest/shared";
import { SKIP_DIRS, secretPath } from "../../../packages/analyzer/src/discover.ts";
import { mask } from "../../../packages/analyzer/src/util.ts";

/** At most this many lines per request: the Code Panel fetches one symbol's range. */
export const MAX_SOURCE_LINES = 2000;
const PRIVATE_KEY = /-----BEGIN [^-]*PRIVATE KEY-----/;
const PRIVATE_KEY_END = /-----END [^-]*PRIVATE KEY-----/;

export interface SourceSlice {
  fileId: string;
  path: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  lines: string[];
  /** 1-based line numbers whose displayed text was masked. */
  masked: number[];
  /** The file changed since analysis; lines may not match the graph's ranges. */
  stale: boolean;
}
export type SourceResult =
  | { status: 200; body: SourceSlice }
  | { status: 400 | 403 | 404 | 416; body: { error: string } };

/** Masks secrets line by line, so line numbers still match the real file. */
export function maskLines(lines: readonly string[]): { lines: string[]; masked: number[] } {
  const out: string[] = [],
    masked: number[] = [];
  let inKey = false;
  lines.forEach((line, i) => {
    if (!inKey && PRIVATE_KEY.test(line)) inKey = true;
    const next = inKey ? "[REDACTED]" : mask(line);
    if (inKey && PRIVATE_KEY_END.test(line)) inKey = false;
    if (next !== line) masked.push(i + 1);
    out.push(next);
  });
  return { lines: out, masked };
}
/** Is a graph-relative path safe to read under the analyzer's skip and secret rules? */
export function safeRelativePath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.includes("\\") &&
    !path.includes("\0") &&
    !isAbsolute(path) &&
    !/^[a-z]:/i.test(path) &&
    !path.split("/").some((p) => p === ".." || p === "." || p === "" || SKIP_DIRS.has(p)) &&
    !secretPath(path)
  );
}
/**
 * Reads exact line ranges of files the analyzer included. Only file IDs from the
 * allowlist are served; paths are re-checked, symlinks and non-files refused,
 * the real path must stay inside the repository, and obvious secrets are masked.
 */
export function createSourceReader(repoRoot: string, files: readonly Pick<FactFile, "id" | "path" | "hash">[]) {
  const root = realpathSync(repoRoot);
  const byId = new Map(files.map((f) => [f.id, f]));
  return function read(fileId: string, start: number, end: number): SourceResult {
    if (!/^[a-f0-9]{12}$/.test(fileId)) return { status: 400, body: { error: "Invalid file ID" } };
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start)
      return { status: 400, body: { error: "Invalid line range" } };
    if (end - start + 1 > MAX_SOURCE_LINES) return { status: 416, body: { error: "Line range too large" } };
    const file = byId.get(fileId);
    if (!file) return { status: 404, body: { error: "Unknown file" } };
    if (!safeRelativePath(file.path)) return { status: 403, body: { error: "Path refused" } };
    try {
      const parts = file.path.split("/");
      for (let i = 1; i <= parts.length; i++)
        if (lstatSync(join(root, ...parts.slice(0, i))).isSymbolicLink())
          return { status: 403, body: { error: "Symlink refused" } };
      const target = resolve(root, ...parts),
        actual = realpathSync(target),
        within = relative(root, actual);
      if (within === "" || within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within) || actual !== target)
        return { status: 403, body: { error: "Path outside repository" } };
      const stat = lstatSync(actual);
      if (!stat.isFile() || stat.size > 1024 * 1024) return { status: 403, body: { error: "Not a readable file" } };
      const data = readFileSync(actual);
      if (data.includes(0)) return { status: 403, body: { error: "Binary file refused" } };
      const text = new TextDecoder("utf-8", { fatal: true }).decode(data).replaceAll("\r\n", "\n");
      const all = text.split("\n");
      if (text.endsWith("\n")) all.pop();
      if (end > all.length) return { status: 416, body: { error: "Line range outside file" } };
      const shown = maskLines(all.slice(start - 1, end));
      return {
        status: 200,
        body: {
          fileId,
          path: file.path,
          startLine: start,
          endLine: end,
          totalLines: all.length,
          lines: shown.lines,
          masked: shown.masked.map((n) => n + start - 1),
          stale: createHash("sha1").update(text).digest("hex") !== file.hash,
        },
      };
    } catch {
      return { status: 404, body: { error: "File not readable" } };
    }
  };
}
/** Handles `source/<fileId>?start=&end=` (the part after the world prefix). */
export function sourceResponse(read: ReturnType<typeof createSourceReader>, rest: string, search: string) {
  const query = new URLSearchParams(search);
  const num = (key: string) => (/^\d{1,7}$/.test(query.get(key) ?? "") ? Number(query.get(key)) : Number.NaN);
  return read(rest, num("start"), num("end"));
}
