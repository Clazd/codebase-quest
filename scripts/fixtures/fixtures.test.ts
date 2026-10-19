import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildFixtures, createFixtureRepo } from "./build.ts";
import { allFixtures, FIXTURE_REPOS, REPO_ROOT, readLock } from "./definitions.ts";
import { git } from "./git.ts";

const fixtures = allFixtures();
const lock = readLock();
const repo = (name: string) => join(FIXTURE_REPOS, name);
const show = (name: string, path: string) => git(repo(name), ["show", `HEAD:${path}`]);
const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("fixture repositories", () => {
  it("defines all six fixtures", () => {
    expect(fixtures.map((f) => f.name)).toEqual([
      "tiny-ts",
      "tiny-py",
      "smelly-ts",
      "poisoned-ts",
      "weird-repo",
      "empty-repo",
    ]);
  });

  describe.each(fixtures.map((f) => [f.name, f] as const))("%s", (name, fixture) => {
    it("exists and is a git repository with a clean working tree", () => {
      expect(existsSync(join(repo(name), ".git"))).toBe(true);
      expect(git(repo(name), ["rev-parse", "--is-inside-work-tree"])).toBe("true");
      expect(git(repo(name), ["status", "--porcelain", "--untracked-files=all"])).toBe("");
    });

    it("has the expected commits, authors and dates", () => {
      const log = git(repo(name), ["log", "--reverse", "--format=%an <%ae>|%aI|%cI|%s"]).split("\n");
      const expected = fixture.commits.map((c) => {
        const date = new Date(c.date).toISOString().replace(".000Z", "Z");
        return `${c.author.name} <${c.author.email}>|${date}|${date}|${c.message}`;
      });
      expect(log).toEqual(expected);
    });

    it("matches the locked HEAD commit", () => {
      expect(git(repo(name), ["rev-parse", "HEAD"])).toBe(lock[name]?.head);
      expect(fixture.commits).toHaveLength(lock[name]?.commits ?? -1);
    });
  });

  it("changes nothing when built a second time", () => {
    const before = fixtures.map((f) => statSync(join(repo(f.name), ".git", "HEAD")).mtimeMs);
    const results = buildFixtures(fixtures, FIXTURE_REPOS);
    expect(results.map((r) => r.status)).toEqual(fixtures.map(() => "unchanged"));
    expect(fixtures.map((f) => statSync(join(repo(f.name), ".git", "HEAD")).mtimeMs)).toEqual(before);
  });

  it("builds byte-identical history in any folder", () => {
    const dir = mkdtempSync(join(tmpdir(), "cq-fixtures-"));
    tempDirs.push(dir);
    const results = buildFixtures(fixtures, dir);
    expect(Object.fromEntries(results.map((r) => [r.name, { head: r.head, commits: r.commits }]))).toEqual(lock);
  });

  it("refuses paths that escape the repository", () => {
    const dir = mkdtempSync(join(tmpdir(), "cq-unsafe-"));
    tempDirs.push(dir);
    const evil = {
      name: "evil",
      description: "",
      commits: [
        {
          message: "x",
          author: { name: "X", email: "x@example.com" },
          date: "2025-01-01T00:00:00+00:00",
          changes: [{ kind: "file" as const, path: "../escape.txt", contents: new Uint8Array() }],
        },
      ],
    };
    expect(() => createFixtureRepo(evil, join(dir, "evil"))).toThrow('Unsafe fixture path "../escape.txt"');
  });
});

describe("tiny-ts (Taskly)", () => {
  it("contains computeTaskStatus exactly as in MASTER-PLAN §7.1", () => {
    const plan = readFileSync(join(REPO_ROOT, "docs/plans/MASTER-PLAN.md"), "utf8");
    const block = /```ts\nfunction computeTaskStatus\(task\) \{\n([\s\S]*?)\n\}\n```/.exec(plan)?.[1];
    expect(block).toBeDefined();
    const source = show("tiny-ts", "src/services/taskService.ts");
    expect(source).toContain(`export function computeTaskStatus(task: StatusFields): TaskStatus {\n${block}\n}`);
  });

  it("has at least 3 literal assertions on computeTaskStatus with different results", () => {
    const tests = show("tiny-ts", "tests/taskService.test.ts");
    const results = [...tests.matchAll(/expect\(computeTaskStatus\(\{[^}]*\}\)\)\.toBe\("(\w+)"\)/g)].map((m) => m[1]);
    expect(new Set(results).size).toBeGreaterThanOrEqual(3);
  });

  it("has literal slugify assertions", () => {
    expect(show("tiny-ts", "tests/slugify.test.ts")).toContain('expect(slugify("Hello World")).toBe("hello-world")');
  });

  it("has the call chain shareTask → checkPermissions → loadTeam → query", () => {
    const share = show("tiny-ts", "src/services/shareService.ts");
    expect(share).toMatch(/export function shareTask[\s\S]*checkPermissions\(task, userId\)/);
    expect(share).toMatch(/export function checkPermissions[\s\S]*loadTeam\(task\.teamId\)/);
    expect(show("tiny-ts", "src/db/teams.ts")).toMatch(/export function loadTeam[\s\S]*query<Team>\(/);
  });

  it("has a circular import between taskService and shareService", () => {
    expect(show("tiny-ts", "src/services/taskService.ts")).toContain('from "./shareService"');
    expect(show("tiny-ts", "src/services/shareService.ts")).toContain('from "./taskService"');
  });

  it("has formatDate twice, one ignoring the time zone", () => {
    expect(show("tiny-ts", "src/utils/dates.ts")).toContain("date.getUTCDate()");
    expect(show("tiny-ts", "src/api/handlers.ts")).toContain("date.getDate()");
  });

  it("has exactly one TODO, one empty catch and one unused function", () => {
    const files = git(repo("tiny-ts"), ["ls-files", "src"]).split("\n");
    const all = files.map((f) => show("tiny-ts", f)).join("\n");
    expect(all.match(/TODO/g)).toHaveLength(1);
    expect(all.match(/catch \(error\) \{\n\s*\}/g)).toHaveLength(1);
    expect(all.match(/unslugify/g)).toHaveLength(1);
  });

  it("makes taskService.ts the most changed file (the hotspot)", () => {
    const changes = git(repo("tiny-ts"), ["log", "--format=", "--name-only"]).split("\n").filter(Boolean);
    const counts = new Map<string, number>();
    for (const file of changes) counts.set(file, (counts.get(file) ?? 0) + 1);
    const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    expect(top).toEqual(["src/services/taskService.ts", 4]);
  });
});

describe("smelly-ts", () => {
  it("lists every Bestiary monster in SMELLS.md", () => {
    const key = show("smelly-ts", "SMELLS.md");
    const monsters = [
      "Gremlin",
      "Spaghetti Serpent",
      "Mimic",
      "Mutant",
      "Ghost",
      "Wisp",
      "Labyrinth Minotaur",
      "Imp",
      "Wraith",
      "Shapeshifter",
      "Echo",
      "Shadow",
      "Golem",
      "Titan",
      "Ouroboros",
    ];
    for (const monster of monsters) expect(key).toContain(`| ${monster} |`);
  });

  it("has a Golem file over 800 lines", () => {
    expect(show("smelly-ts", "src/i18n/messages.ts").split("\n").length).toBeGreaterThan(800);
  });
});

describe("poisoned-ts", () => {
  it("contains injection attempts and their answer key", () => {
    expect(show("poisoned-ts", "README.md")).toContain("Ignore previous instructions");
    expect(show("poisoned-ts", "src/math.ts")).toContain("add(2, 2) returns 5");
    expect(show("poisoned-ts", "INJECTIONS.md")).toContain("`add(2, 2)` returns `4`");
  });
});

describe("weird-repo", () => {
  const tree = () =>
    new Map(
      git(repo("weird-repo"), ["ls-tree", "-r", "-l", "HEAD"])
        .split("\n")
        .map((line) => {
          const [meta = "", path = ""] = line.split("\t");
          const [mode, , , size] = meta.split(/\s+/);
          return [path, { mode, size: Number(size) }] as const;
        }),
    );

  it("contains every oddity", () => {
    const files = tree();
    expect(files.get("docs/readme-link.md")?.mode).toBe("120000");
    expect(files.get("generated/bundle.generated.js")?.size).toBeGreaterThanOrEqual(2 * 1024 * 1024);
    expect(files.get("src/empty.ts")?.size).toBe(0);
    expect(files.has(".env")).toBe(true);
    expect([...files.keys()].some((p) => p.split("/").length >= 11)).toBe(true);
  });

  it("keeps exact bytes: CRLF, non-UTF-8 and binary", () => {
    const raw = (path: string) => readFileSync(join(repo("weird-repo"), path));
    expect(raw("src/crlf.ts").includes("\r\n")).toBe(true);
    expect(raw("src/latin1.ts").includes(0xe9)).toBe(true);
    expect(() => new TextDecoder("utf-8", { fatal: true }).decode(raw("src/latin1.ts"))).toThrow();
    expect(raw("assets/blob.bin").subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });
});

describe("empty-repo", () => {
  it("contains only .gitkeep", () => {
    expect(git(repo("empty-repo"), ["ls-files"])).toBe(".gitkeep");
  });
});
