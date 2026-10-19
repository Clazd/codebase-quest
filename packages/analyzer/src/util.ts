import { createHash } from "node:crypto";
import type { Diagnostic } from "@codebase-quest/shared";
export const hash = (text: string) => createHash("sha1").update(text).digest("hex");
export const id = (path: string, kind: string, name: string, ordinal = 0) =>
  hash(`${path}#${kind}#${name}#${ordinal}`).slice(0, 12);
export const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function diagnostic(path: string | null, code: string, line: number | null, message: string): Diagnostic {
  return { id: id(path ?? "", `diagnostic:${code}`, `${line}:${message}`), path, code, line, message };
}
export function mask(text: string): string {
  return text
    .replace(
      /(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|AKIA[A-Z0-9]{16}|-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----)/g,
      "[REDACTED]",
    )
    .replace(
      /((?:password|secret|api[_-]?key|access[_-]?token|auth[_-]?token)["']?\s*[:=]\s*["']?)[^\s"',;}]+/gi,
      "$1[REDACTED]",
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]{12,}/gi, "Bearer [REDACTED]");
}
