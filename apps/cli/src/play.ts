import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze } from "@codebase-quest/analyzer";
import { WorldModelSchema } from "@codebase-quest/shared";
import { generate, writeWorld } from "@codebase-quest/worldgen";
import { discover, secretPath } from "../../../packages/analyzer/src/discover.ts";

const CACHE_VERSION = "walkable-v2";
const gameRoot = fileURLToPath(new URL("../../game", import.meta.url));
function safeParents(path: string) {
  for (let p = resolve(path); ; p = dirname(p)) {
    if (existsSync(p) && lstatSync(p).isSymbolicLink()) throw new Error("Symlink cache/repository path refused");
    if (dirname(p) === p) break;
  }
}
export async function prepareWorld(repo: string, cacheRoot?: string) {
  const started = performance.now(),
    root = resolve(repo);
  safeParents(root);
  if (secretPath(root.replaceAll("\\", "/"))) throw new Error("Credential path refused");
  const discovery = discover(root);
  let commit = "unversioned";
  try {
    commit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {}
  const hash = createHash("sha256").update(CACHE_VERSION).update(root).update(commit);
  for (const file of discovery.files) hash.update(file.path).update("\0").update(file.text).update("\0");
  const digest = hash.digest("hex").slice(0, 20);
  const bases = cacheRoot
    ? [cacheRoot]
    : [
        join(root, ".codequest", "cache"),
        join(tmpdir(), "codequest-cache", createHash("sha256").update(root).digest("hex").slice(0, 20)),
      ];
  // Check both locations before analysis, including an existing read-only fallback.
  for (const base of bases) {
    const directory = join(base, commit, digest);
    safeParents(directory);
    const ready = join(directory, "ready.json"),
      json = join(directory, "world.json");
    if (existsSync(ready) && existsSync(json)) {
      safeParents(ready);
      safeParents(json);
      try {
        const world = WorldModelSchema.parse(JSON.parse(readFileSync(json, "utf8")));
        if (
          world.maps.every((m) => existsSync(join(directory, m.path))) &&
          existsSync(join(directory, world.theme.image))
        )
          return { world, directory, cached: true, ms: performance.now() - started };
      } catch {}
    }
  }
  let world: ReturnType<typeof generate> | undefined;
  for (const base of bases) {
    const directory = join(base, commit, digest);
    safeParents(directory);
    try {
      mkdirSync(directory, { recursive: true });
      if (!world) {
        world = generate(await analyze(root));
        const manifest = discovery.files.find((f) => f.path === "package.json");
        let name = world.kingdom.name;
        if (manifest) {
          try {
            const data = JSON.parse(manifest.text) as { name?: unknown };
            if (typeof data.name === "string" && data.name.length <= 100) name = data.name.replace(/^@[^/]+\//, "");
          } catch {}
        }
        world.kingdom.name = `Kingdom of ${name.charAt(0).toUpperCase()}${name.slice(1)}`;
      }
      writeWorld(world, directory);
      writeFileSync(join(directory, "ready.json"), JSON.stringify({ version: CACHE_VERSION }));
      return { world, directory, cached: false, ms: performance.now() - started };
    } catch (error) {
      if (cacheRoot || !["EACCES", "EPERM", "EROFS"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
    }
  }
  throw new Error("No writable local or temporary world cache");
}
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
export async function serveWorld(
  directory: string,
  gameDirectory: string,
  port = 0,
): Promise<{ server: Server; url: string }> {
  const worldRoot = realpathSync(directory),
    game = realpathSync(gameDirectory);
  const server = createServer((req, res) => {
    const address = server.address();
    const bound = typeof address === "object" && address ? address.port : 0;
    const allowedHosts = [`localhost:${bound}`, `127.0.0.1:${bound}`];
    if (
      !allowedHosts.includes(req.headers.host ?? "") ||
      (req.headers.origin && !allowedHosts.some((h) => req.headers.origin === `http://${h}`))
    ) {
      res.writeHead(403).end();
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end();
      return;
    }
    try {
      const path = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
      if (path.includes("\\") || path.includes("\0") || path.split("/").some((p) => p === "..") || secretPath(path)) {
        res.writeHead(403).end();
        return;
      }
      const isWorld = path.startsWith("/world/"),
        root = isWorld ? worldRoot : game;
      const filename = resolve(root, isWorld ? path.slice(7) : path === "/" ? "index.html" : path.slice(1));
      const actual = realpathSync(filename),
        within = relative(root, actual);
      if (
        within === ".." ||
        within.startsWith(`..${sep}`) ||
        resolve(root, within) !== actual ||
        !statSync(actual).isFile() ||
        !MIME[extname(actual)]
      ) {
        res.writeHead(403).end();
        return;
      }
      const body = readFileSync(actual);
      res.writeHead(200, {
        "Content-Type": MIME[extname(actual)] ?? "application/octet-stream",
        "Content-Length": body.length,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(404).end("Not found");
    }
  });
  await new Promise<void>((done, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", done);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No local server address");
  return { server, url: `http://127.0.0.1:${address.port}/?world=/world/world.json` };
}
function newest(path: string): number {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  return stat.isDirectory() ? Math.max(0, ...readdirSync(path).map((p) => newest(join(path, p)))) : stat.mtimeMs;
}
export async function startPlay(
  repo: string,
  options: { port?: number; open?: boolean; gameDirectory?: string; cacheRoot?: string } = {},
) {
  const prepared = await prepareWorld(repo, options.cacheRoot);
  const gameDirectory = options.gameDirectory ?? join(gameRoot, "dist");
  if (
    !options.gameDirectory &&
    (!existsSync(join(gameDirectory, "index.html")) ||
      statSync(join(gameDirectory, "index.html")).mtimeMs <
        Math.max(newest(join(gameRoot, "src")), newest(join(gameRoot, "vite.config.ts"))))
  ) {
    const { build } = await import("vite");
    await build({ root: gameRoot, configFile: join(gameRoot, "vite.config.ts"), mode: "production", logLevel: "warn" });
  }
  const served = await serveWorld(prepared.directory, gameDirectory, options.port);
  if (options.open !== false) {
    const args =
      process.platform === "win32"
        ? (["rundll32", ["url.dll,FileProtocolHandler", served.url]] as const)
        : process.platform === "darwin"
          ? (["open", [served.url]] as const)
          : (["xdg-open", [served.url]] as const);
    execFile(args[0], [...args[1]], { windowsHide: true }, (error) => {
      if (error) process.stderr.write(`Browser could not open. Visit ${served.url}\n`);
    });
  }
  return { ...prepared, ...served };
}
export async function playCommand(args: readonly string[]) {
  const repo = args[1];
  if (!repo || repo.startsWith("--")) throw new Error("Usage: cq play <repo> [--no-open] [--port N]");
  let open = true,
    port = 0;
  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--no-open") open = false;
    else if (args[i] === "--port") {
      const value = args[++i];
      port = Number(value);
      if (!value || !Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid --port");
    } else throw new Error(`Unknown play option: ${args[i]}`);
  }
  const result = await startPlay(repo, { open, port }),
    w = result.world;
  const stop = () => {
    result.server.close();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return {
    code: 0,
    stdout: `${result.cached ? "Cache hit" : "Built world"} in ${result.ms.toFixed(0)} ms · ${w.regions.length} regions · ${w.buildings.length} buildings · ${w.npcs.length} NPCs · ${w.monsters.length} monsters\n${result.url}\nPress Ctrl+C to stop.\n`,
    stderr: "",
  };
}
