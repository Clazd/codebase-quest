/** biome-ignore-all lint/style/noNonNullAssertion: Required fixture facts must fail immediately. */
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { discover } from "../../analyzer/src/discover.ts";
import { analyze } from "../../analyzer/src/index.ts";
import { buildFactBook } from "../../content/src/facts.ts";
import { generate } from "../../worldgen/src/index.ts";
import { generateQuests } from "./generate.ts";
import { newSave, parseSave, reconcile } from "./save.ts";

it("survives two real fixture commits with a file rename, function edit, deletion and addition", async () => {
  const root = mkdtempSync(join(tmpdir(), "cq-quest-commits-"));
  if (!root.startsWith(join(tmpdir(), "cq-quest-commits-"))) throw new Error("Unexpected fixture directory");
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const put = (name: string) =>
    cpSync(fileURLToPath(new URL(`../fixtures/${name}/src`, import.meta.url)), join(root, "src"), { recursive: true });
  async function atlas() {
    const graph = await analyze(root),
      world = generate(graph),
      sources = discover(root).files;
    return generateQuests(
      world,
      graph,
      buildFactBook(graph, world),
      (path) => {
        const f = sources.find((f) => f.path === path);
        return f?.language ? { text: f.text, language: f.language } : null;
      },
      [],
      "commit-fixture",
    );
  }
  try {
    git("init", "-b", "main");
    git("config", "user.name", "Quest Fixture");
    git("config", "user.email", "quest@example.com");
    git("config", "commit.gpgsign", "false");
    put("commit-a");
    git("add", ".");
    git("commit", "-m", "test: initial kingdom");
    const first = await atlas(),
      save = newSave(first, { mapId: "overworld", x: 1, y: 1 }, "2026-10-19T00:00:00Z");
    for (const s of first.symbols) {
      save.comprehension[s.id] = "mastered";
      save.codexNotes[s.id] = `Note about ${s.name}`;
    }
    // Explicit, workspace-bounded removal; this disposable fixture contains only known source files.
    for (const file of readdirSync(join(root, "src"))) rmSync(join(root, "src", file));
    put("commit-b");
    git("add", "-A");
    git("commit", "-m", "test: renovate kingdom");
    const second = await atlas(),
      mapped = reconcile(parseSave(JSON.stringify(save)), second);
    expect(first.commit).not.toBe(second.commit);
    expect(mapped.summary).toMatchObject({ renamed: 1, edited: 1, removed: 1, added: 1 });
    const greet = second.symbols.find((s) => s.name === "greet")!,
      count = second.symbols.find((s) => s.name === "count")!;
    expect(mapped.save.comprehension[greet.id]).toBe("mastered");
    expect(mapped.save.codexNotes[greet.id]).toBe("Note about greet");
    expect(mapped.save.comprehension[count.id]).toBe("read");
    expect(mapped.save.archive).toHaveLength(1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 60000);
