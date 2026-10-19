import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterAll, describe, expect, it } from "vitest";

const gameRoot = fileURLToPath(new URL("..", import.meta.url));
const outDirs: string[] = [];

/** Builds the game in `mode` and returns all emitted JavaScript. */
async function bundle(mode: "production" | "test"): Promise<string> {
  const outDir = mkdtempSync(join(tmpdir(), `cq-game-${mode}-`));
  outDirs.push(outDir);
  await build({
    root: gameRoot,
    configFile: join(gameRoot, "vite.config.ts"),
    mode,
    logLevel: "silent",
    build: { outDir, emptyOutDir: true },
  });
  const assets = join(outDir, "assets");
  return readdirSync(assets)
    .filter((f) => f.endsWith(".js"))
    .map((f) => readFileSync(join(assets, f), "utf8"))
    .join("\n");
}

afterAll(() => {
  for (const dir of outDirs) rmSync(dir, { recursive: true, force: true });
});

describe("game bundle", () => {
  it("leaves the __CQ__ debug API out of production builds", { timeout: 180_000 }, async () => {
    const [production, test] = await Promise.all([bundle("production"), bundle("test")]);
    // Guard against a vacuous pass: the test build must contain it.
    expect(test).toContain("__CQ__");
    expect(production).not.toContain("__CQ__");
    expect(production).not.toContain("pressKey");
    expect(test).toContain("Know the code.");
    expect(production).not.toContain("Know the code.");
    expect(production).not.toContain("sever-c1");
    expect(test).toContain("__testAnswerKey");
    expect(production).not.toContain("__testAnswerKey");
  });
});
