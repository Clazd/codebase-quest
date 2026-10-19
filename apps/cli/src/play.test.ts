import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FactBookSchema } from "@codebase-quest/shared";
import { expect, it } from "vitest";
import { githubBase, localLinks, prepareWorld, startPlay } from "./play.ts";

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
it("serves fact sheets with local links and exact source lines over HTTP", async () => {
  const temp = mkdtempSync(join(tmpdir(), "cq-play-src-")),
    game = join(temp, "game");
  mkdirSync(game);
  writeFileSync(join(game, "index.html"), "<h1>Game shell</h1>");
  const repo = fileURLToPath(new URL("../../../fixtures/repos/tiny-ts", import.meta.url));
  const played = await startPlay(repo, { open: false, gameDirectory: game, cacheRoot: join(temp, "cache") });
  try {
    const facts = FactBookSchema.parse(await (await fetch(new URL("/world/facts.json", played.url))).json());
    expect(facts.links?.editor).toBe("vscode://file/{path}:{line}");
    expect(facts.links?.root).toBe(repo.replaceAll("\\", "/"));
    const slugify = facts.symbols.find((s) => s.name === "slugify");
    if (!slugify) throw new Error("slugify missing");
    const response = await fetch(
      new URL(
        `/world/source/${slugify.fileId}?start=${slugify.range.startLine}&end=${slugify.range.endLine}`,
        played.url,
      ),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    const real = readFileSync(join(repo, "src/utils/slugify.ts"), "utf8").split("\n");
    expect(body.lines).toEqual(real.slice(slugify.range.startLine - 1, slugify.range.endLine));
    expect(body.stale).toBe(false);
    expect((await fetch(new URL("/world/source/..%2f..%2fpackage.json?start=1&end=1", played.url))).status).toBe(400);
    expect((await fetch(new URL("/world/source/ffffffffffff?start=1&end=1", played.url))).status).toBe(404);
  } finally {
    played.server.closeAllConnections();
    await new Promise<void>((done) => played.server.close(() => done()));
  }
});
it("derives GitHub links without credentials and validates editor URLs", () => {
  expect(githubBase("git@github.com:Clazd/codebase-quest.git")).toBe("https://github.com/Clazd/codebase-quest");
  expect(githubBase("https://user:token@github.com/Clazd/codebase-quest.git\n")).toBe(
    "https://github.com/Clazd/codebase-quest",
  );
  expect(githubBase("https://gitlab.com/a/b.git")).toBeNull();
  expect(githubBase("https://github.com.evil.example/a/b")).toBeNull();
  const repo = mkdtempSync(join(tmpdir(), "cq-links-"));
  expect(localLinks(repo, "idea://open?file={path}&line={line}").editor).toContain("idea://");
  for (const bad of ["javascript:alert(1)", "https://example.com/{path}", "data:text/html,x", "notaurl"])
    expect(() => localLinks(repo, bad)).toThrow(/--editor/);
});
