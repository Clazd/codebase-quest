import { execFileSync } from "node:child_process";
import type { GitStats } from "@codebase-quest/shared";
import { hash } from "./util.ts";

export function gitStats(root: string): { commit: string | null; files: Map<string, GitStats> } {
  const files = new Map<string, GitStats>();
  try {
    const options = {
      encoding: "utf8" as const,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"] as ["ignore", "pipe", "ignore"],
    };
    const commit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], options).trim();
    const log = execFileSync(
      "git",
      [
        "-C",
        root,
        "-c",
        "core.quotepath=false",
        "log",
        "--no-textconv",
        "--no-ext-diff",
        "--no-renames",
        "--relative",
        "--numstat",
        "-z",
        "--format=%x00CQCOMMIT%x00%H%x00%aI%x00%ae%x00",
        "--",
        ".",
      ],
      options,
    );
    const authors = new Map<string, Set<string>>();
    let date = "",
      author = "";
    const parts = log.split("\0");
    for (let i = 0; i < parts.length; i++) {
      const part = (parts[i] ?? "").replace(/^\n+/, "");
      if (part === "CQCOMMIT") {
        i++;
        date = parts[++i] ?? "";
        author = hash(parts[++i] ?? "");
        continue;
      }
      const match = /^(\d+|-)\t(\d+|-)\t([\s\S]+)$/.exec(part);
      if (!match) continue;
      const path = match[3] ?? "";
      const current = files.get(path);
      const set = authors.get(path) ?? new Set<string>();
      set.add(author);
      authors.set(path, set);
      files.set(path, {
        firstCommitAt: !current || date < current.firstCommitAt ? date : current.firstCommitAt,
        lastCommitAt: !current || date > current.lastCommitAt ? date : current.lastCommitAt,
        commits: (current?.commits ?? 0) + 1,
        churn:
          (current?.churn ?? 0) + Number(match[1] === "-" ? 0 : match[1]) + Number(match[2] === "-" ? 0 : match[2]),
        authors: set.size,
      });
    }
    return { commit, files };
  } catch {
    return { commit: null, files };
  }
}
