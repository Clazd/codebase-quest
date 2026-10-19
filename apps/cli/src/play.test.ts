import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { prepareWorld, startPlay } from "./play.ts";

it("serves a world over HTTP and reuses the cache on a second play run", async () => {
  const temp = mkdtempSync(join(tmpdir(), "cq-play-")),
    game = join(temp, "game"),
    cache = join(temp, "cache");
  mkdirSync(game);
  writeFileSync(join(game, "index.html"), "<h1>Game shell</h1>");
  const repo = fileURLToPath(new URL("../../../fixtures/repos/tiny-ts", import.meta.url));
  const first = await startPlay(repo, { open: false, gameDirectory: game, cacheRoot: cache });
  try {
    expect(first.cached).toBe(false);
    const result = await fetch(new URL("/world/world.json", first.url));
    expect(result.status).toBe(200);
    expect((await result.json()).kingdom.name).toBe("Kingdom of Taskly");
    expect(await (await fetch(first.url)).text()).toContain("Game shell");
    expect((await fetch(new URL("/world/%2e%2e%2f.env", first.url))).status).not.toBe(200);
    const second = await startPlay(repo, { open: false, gameDirectory: game, cacheRoot: cache });
    try {
      expect(second.cached).toBe(true);
      expect(second.directory).toBe(first.directory);
      expect(second.ms).toBeLessThan(first.ms);
    } finally {
      second.server.closeAllConnections();
      await new Promise<void>((done) => second.server.close(() => done()));
    }
  } finally {
    first.server.closeAllConnections();
    await new Promise<void>((done) => first.server.close(() => done()));
  }
});
it("invalidates cache for edits without a commit and never reads credential content into the world", async () => {
  const repo = mkdtempSync(join(tmpdir(), "cq-play-edits-"));
  writeFileSync(join(repo, "index.ts"), "export function hello(){return 1}\n");
  writeFileSync(join(repo, ".env"), "TOKEN=must-not-appear");
  const first = await prepareWorld(repo);
  writeFileSync(join(repo, "index.ts"), "export function hello(){return 2}\n");
  const next = await prepareWorld(repo);
  expect(next.cached).toBe(false);
  expect(next.directory).not.toBe(first.directory);
  expect(readFileSync(join(next.directory, "world.json"), "utf8")).not.toContain("must-not-appear");
});
