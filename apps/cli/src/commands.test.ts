import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CodeGraphSchema } from "@codebase-quest/shared";
import { describe, expect, it } from "vitest";
import { runCommand } from "./commands.ts";

describe("analyzer CLI", () => {
  it("generates a world and regenerates previews from world.json", async () => {
    const output = join(mkdtempSync(join(tmpdir(), "cq-world-cli-")), "world");
    const input = fileURLToPath(new URL("../../../packages/analyzer/goldens/tiny-ts.graph.json", import.meta.url));
    const result = await runCommand(["generate", input, "--out", output]);
    expect(result.code).toBe(0);
    const svg = readFileSync(join(output, "preview/overworld.svg"), "utf8");
    expect((await runCommand(["world", "preview", join(output, "world.json")])).code).toBe(0);
    expect(readFileSync(join(output, "preview/overworld.svg"), "utf8")).toBe(svg);
  });
  it("analyzes Taskly, writes JSON and summarizes it", async () => {
    const output = join(mkdtempSync(join(tmpdir(), "cq-cli-")), "graph.json");
    const root = fileURLToPath(new URL("../../../fixtures/repos/tiny-ts", import.meta.url));
    expect((await runCommand(["--", "analyze", root, "--out", output, "--pretty"])).code).toBe(0);
    const graph = CodeGraphSchema.parse(JSON.parse(readFileSync(output, "utf8")));
    expect(graph.testFacts.length).toBeGreaterThan(3);
    const stats = await runCommand(["stats", output]);
    expect(stats.code).toBe(0);
    expect(JSON.parse(stats.stdout).files).toBe(graph.files.length);
  });
  it("fails clearly for missing paths/options, invalid graphs and credential arguments", async () => {
    for (const args of [
      ["analyze"],
      ["analyze", "missing-path"],
      ["analyze", ".", "--out"],
      ["stats", ".env"],
      ["analyze", ".", "--unknown"],
    ])
      expect((await runCommand(args)).code).toBe(1);
  });
});
