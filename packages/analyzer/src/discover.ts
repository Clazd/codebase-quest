import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, relative, sep } from "node:path";
import type { Diagnostic, FileRole, Language } from "@codebase-quest/shared";
import ignore from "ignore";
import { compare, diagnostic } from "./util.ts";

export const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "vendor",
  "dist",
  "dist-test",
  "build",
  ".venv",
  "venv",
  "__pycache__",
  ".next",
  ".cache",
  ".codequest",
]);
export function secretPath(path: string): boolean {
  return path
    .split("/")
    .some((part) =>
      /^\.env|\.(?:pem|key|p12|pfx|keystore)$|^id_(?:rsa|ed25519|ecdsa)|credentials?|secrets?\.json$|^\.netrc$|^\.npmrc$|^\.pypirc$|^\.aws$|^\.ssh$/i.test(
        part,
      ),
    );
}
export const ROLE_RULES: readonly [FileRole, RegExp][] = [
  ["test", /(?:^|\/)(?:tests?|__tests__)\/|(?:\.test|\.spec)\.[^.]+$|(?:^|\/)test_[^/]+\.py$/],
  ["ci", /^\.github\/workflows\/|(?:^|\/)\.gitlab-ci\.yml$/],
  ["manifest", /(?:^|\/)(?:package\.json|pyproject\.toml|requirements[^/]*\.txt|setup\.(?:py|cfg))$/],
  ["migration", /(?:^|\/)migrations?\//],
  ["generated", /\.generated\.|(?:^|\/)generated\//],
  ["build", /(?:^|\/)(?:Dockerfile[^/]*|Makefile|scripts\/|tools\/)/],
  ["config", /(?:^|\/)(?:tsconfig[^/]*\.json|[^/]*config\.[^/]+|\.[a-z]+rc(?:\.[a-z]+)?)$/],
  ["docs", /\.(?:md|mdx|rst|txt)$/],
];
export const languageOf = (path: string): Language | null =>
  (
    ({
      ".ts": "typescript",
      ".tsx": "tsx",
      ".js": "javascript",
      ".jsx": "jsx",
      ".mjs": "javascript",
      ".cjs": "javascript",
      ".py": "python",
    }) as Record<string, Language>
  )[extname(path).toLowerCase()] ?? null;
export function roleOf(path: string, text = ""): FileRole {
  if (/^\s*(?:\/\/|#|\/\*)\s*(?:@generated|generated\b)/i.test(text.slice(0, 300))) return "generated";
  return ROLE_RULES.find(([, pattern]) => pattern.test(path))?.[0] ?? (languageOf(path) ? "source" : "asset");
}
export interface SourceFile {
  path: string;
  text: string;
  language: Language | null;
  role: FileRole;
  loc: number;
}
export interface Discovery {
  files: SourceFile[];
  diagnostics: Diagnostic[];
  git: boolean;
  gitRoot: string | null;
}
export function discover(root: string, read: (path: string) => Buffer = readFileSync): Discovery {
  const diagnostics: Diagnostic[] = [];
  if (lstatSync(root).isSymbolicLink())
    return {
      files: [],
      diagnostics: [diagnostic(null, "symlink-skipped", null, "Repository root is a symlink; not followed.")],
      git: false,
      gitRoot: null,
    };
  let paths: string[] = [];
  let gitRoot: string | null = null;
  const symlinks = new Set<string>();
  try {
    gitRoot = execFileSync("git", ["-C", root, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    paths = execFileSync(
      "git",
      [
        "-C",
        root,
        "-c",
        "core.fsmonitor=false",
        "ls-files",
        "-z",
        "--cached",
        "--others",
        "--exclude-standard",
        "--",
        ".",
      ],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    )
      .split("\0")
      .filter(Boolean);
    const index = execFileSync(
      "git",
      ["-C", root, "-c", "core.fsmonitor=false", "ls-files", "-z", "--stage", "--", "."],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
    for (const entry of index.split("\0"))
      if (entry.startsWith("120000 ")) symlinks.add(entry.slice(entry.indexOf("\t") + 1));
  } catch {
    gitRoot = null;
    const walk = (dir: string, filters: { base: string; filter: ReturnType<typeof ignore> }[] = []) => {
      const ignorePath = join(dir, ".gitignore");
      if (existsSync(ignorePath) && !lstatSync(ignorePath).isSymbolicLink())
        filters = [...filters, { base: dir, filter: ignore().add(read(ignorePath).toString("utf8")) }];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const absolute = join(dir, entry.name);
        const path = relative(root, absolute).split(sep).join("/");
        if (secretPath(path)) {
          diagnostics.push(
            diagnostic(path, "secret-skipped", null, "Credential path skipped without reading content."),
          );
          continue;
        }
        if (
          filters.some((f) =>
            f.filter.ignores(relative(f.base, absolute).split(sep).join("/") + (entry.isDirectory() ? "/" : "")),
          )
        )
          continue;
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name)) walk(absolute, filters);
        } else paths.push(relative(root, join(dir, entry.name)).split(sep).join("/"));
      }
    };
    walk(root);
  }
  const files: SourceFile[] = [];
  for (const path of [...new Set(paths)].sort(compare)) {
    if (path.split("/").some((p) => SKIP_DIRS.has(p)) || path === ".gitkeep") continue;
    if (secretPath(path)) {
      diagnostics.push(diagnostic(path, "secret-skipped", null, "Credential path skipped without reading content."));
      continue;
    }
    try {
      const components = path.split("/");
      let safe = true;
      for (let i = 1; i <= components.length; i++)
        if (lstatSync(join(root, ...components.slice(0, i))).isSymbolicLink()) safe = false;
      if (!safe || symlinks.has(path)) {
        diagnostics.push(diagnostic(path, "symlink-skipped", null, "Symlink recorded without following it."));
        continue;
      }
      const stat = lstatSync(join(root, path));
      if (!stat.isFile()) {
        diagnostics.push(diagnostic(path, "special-file-skipped", null, "Non-regular file skipped."));
        continue;
      }
      if (stat.size > 1024 * 1024) {
        diagnostics.push(diagnostic(path, "large-file-skipped", null, "File exceeds the 1 MiB limit."));
        continue;
      }
      const data = read(join(root, path));
      if (data.includes(0)) {
        diagnostics.push(diagnostic(path, "binary-skipped", null, "NUL byte detected; binary file skipped."));
        continue;
      }
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(data);
      } catch {
        diagnostics.push(diagnostic(path, "encoding-skipped", null, "File is not valid UTF-8."));
        continue;
      }
      if (text.includes("\r\n"))
        diagnostics.push(diagnostic(path, "crlf-normalized", null, "CRLF normalized to LF for parsing."));
      text = text.replaceAll("\r\n", "\n");
      if (!text) diagnostics.push(diagnostic(path, "empty-file", null, "Empty file retained in the graph."));
      if (components.length > 10)
        diagnostics.push(diagnostic(path, "deep-path", null, "Path exceeds nine directory levels; retained."));
      files.push({
        path,
        text,
        language: languageOf(path),
        role: roleOf(path, text),
        loc: text ? text.split("\n").length - (text.endsWith("\n") ? 1 : 0) : 0,
      });
    } catch {
      diagnostics.push(diagnostic(path, "read-error", null, `Unable to read ${basename(path)}.`));
    }
  }
  return { files, diagnostics, git: gitRoot !== null, gitRoot };
}
