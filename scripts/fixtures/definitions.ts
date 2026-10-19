import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { emptyRepo, weirdRepo } from "./generated.ts";
import type { Change, FixtureDefinition } from "./types.ts";

export const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
/** Sources of the hand-written fixtures (tracked in this repo). */
export const FIXTURE_SOURCES = join(REPO_ROOT, "fixtures", "src");
/** Where the fixture git repositories are built (ignored by git). */
export const FIXTURE_REPOS = join(REPO_ROOT, "fixtures", "repos");
/** Expected HEAD commit of every fixture; proves the build is deterministic across machines. */
export const FIXTURE_LOCK = join(REPO_ROOT, "fixtures", "fixtures.lock.json");

/** Fixtures written as files under `fixtures/src/<name>/`. */
const FILE_FIXTURES = ["tiny-ts", "tiny-py", "smelly-ts", "poisoned-ts"] as const;

const PersonSchema = z.object({ name: z.string().min(1), email: z.string().endsWith("@example.com") });

const FixtureFileSchema = z.object({
  description: z.string().min(1),
  people: z.record(z.string(), PersonSchema),
  commits: z
    .array(
      z.object({
        /** Folder under `commits/` holding every file this commit adds or changes (full contents). */
        dir: z.string().regex(/^\d{2}-[a-z0-9-]+$/),
        message: z.string().min(1),
        author: z.string(),
        date: z.iso.datetime({ offset: true }),
        delete: z.array(z.string()).default([]),
      }),
    )
    .min(1),
});

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(abs));
    else if (entry.isFile()) out.push(abs);
    else throw new Error(`Fixture sources may only contain files and folders: ${abs}`);
  }
  return out;
}

export function loadFileFixture(name: string, sourcesRoot = FIXTURE_SOURCES): FixtureDefinition {
  const root = join(sourcesRoot, name);
  const spec = FixtureFileSchema.parse(JSON.parse(readFileSync(join(root, "fixture.json"), "utf8")));
  const commits = spec.commits.map((commit) => {
    const author = spec.people[commit.author];
    if (author === undefined) throw new Error(`${name}: unknown author "${commit.author}"`);
    const commitDir = join(root, "commits", commit.dir);
    const files: Change[] = listFiles(commitDir)
      .map((abs) => ({
        kind: "file" as const,
        path: relative(commitDir, abs).split(sep).join("/"),
        contents: readFileSync(abs),
      }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const deletions: Change[] = commit.delete.map((path) => ({ kind: "delete", path }));
    return { message: commit.message, author, date: commit.date, changes: [...files, ...deletions] };
  });
  return { name, description: spec.description, commits };
}

/** Every fixture, in a stable order. */
export function allFixtures(): FixtureDefinition[] {
  return [...FILE_FIXTURES.map((name) => loadFileFixture(name)), weirdRepo(), emptyRepo()];
}

export const LockSchema = z.record(
  z.string(),
  z.object({ head: z.string().regex(/^[0-9a-f]{40}$/), commits: z.number() }),
);
export type FixtureLock = z.infer<typeof LockSchema>;

export function readLock(): FixtureLock {
  return LockSchema.parse(JSON.parse(readFileSync(FIXTURE_LOCK, "utf8")));
}
