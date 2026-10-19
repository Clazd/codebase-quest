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
import { createServer, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze } from "@codebase-quest/analyzer";
import { buildFactBook } from "@codebase-quest/content/facts";
import { type FactBook, FactBookSchema, type FactLinks, WorldModelSchema } from "@codebase-quest/shared";
import { generate, writeWorld } from "@codebase-quest/worldgen";
import { discover, secretPath } from "../../../packages/analyzer/src/discover.ts";
import { createSourceReader, sourceResponse } from "./source.ts";

const CACHE_VERSION = "npcs-v1";
export const DEFAULT_EDITOR = "vscode://file/{path}:{line}";
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
      json = join(directory, "world.json"),
      factsJson = join(directory, "facts.json");
    if (existsSync(ready) && existsSync(json) && existsSync(factsJson)) {
      safeParents(ready);
      safeParents(json);
      safeParents(factsJson);
      try {
        const world = WorldModelSchema.parse(JSON.parse(readFileSync(json, "utf8")));
        const facts = FactBookSchema.parse(JSON.parse(readFileSync(factsJson, "utf8")));
        if (
          world.maps.every((m) => existsSync(join(directory, m.path))) &&
          existsSync(join(directory, world.theme.image))
        )
          return { world, facts, root, directory, cached: true, ms: performance.now() - started };
      } catch {}
    }
  }
  let world: ReturnType<typeof generate> | undefined;
  let facts: FactBook | undefined;
  for (const base of bases) {
    const directory = join(base, commit, digest);
    safeParents(directory);
    try {
      mkdirSync(directory, { recursive: true });
      if (!world || !facts) {
        const graph = await analyze(root);
        world = generate(graph);
        facts = buildFactBook(graph, world);
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
      writeFileSync(join(directory, "facts.json"), `${JSON.stringify(facts)}\n`);
      writeFileSync(join(directory, "ready.json"), JSON.stringify({ version: CACHE_VERSION }));
      return { world, facts, root, directory, cached: false, ms: performance.now() - started };
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
/** `https://github.com/owner/repo` from the origin remote, without credentials; null otherwise. */
export function githubBase(remote: string): string | null {
  const match =
    /^(?:git@github\.com:|ssh:\/\/git@github\.com\/|https:\/\/(?:[^@/]+@)?github\.com\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(
      remote.trim(),
    );
  return match ? `https://github.com/${match[1]}/${match[2]}` : null;
}
/** Editor and GitHub links for local play. They are served live, never cached or committed. */
export function localLinks(root: string, editor = DEFAULT_EDITOR): FactLinks {
  if (!/^[a-z][a-z0-9+.-]*:/i.test(editor) || /^(?:javascript|data|vbscript|blob|file|https?):/i.test(editor))
    throw new Error("--editor must be an editor URL such as vscode://file/{path}:{line}");
  let github: string | null = null;
  try {
    github = githubBase(
      execFileSync("git", ["-C", root, "remote", "get-url", "origin"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {}
  return { root: root.replaceAll("\\", "/"), github, editor };
}
type Local = { repoRoot: string; facts: FactBook; links: FactLinks };
export async function serveWorld(
  directory: string,
  gameDirectory: string,
  port = 0,
  local?: Local,
): Promise<{ server: Server; url: string }> {
  const worldRoot = realpathSync(directory),
    game = realpathSync(gameDirectory);
  const readSource = local ? createSourceReader(local.repoRoot, local.facts.files) : undefined;
  const factsBody = local ? Buffer.from(JSON.stringify({ ...local.facts, links: local.links })) : undefined;
  const json = (res: ServerResponse, status: number, body: Buffer, head: boolean) => {
    res.writeHead(status, {
      "Content-Type": MIME[".json"],
      "Content-Length": body.length,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    res.end(head ? undefined : body);
  };
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
      const [rawPath = "/", search = ""] = (req.url ?? "/").split("?");
      const head = req.method === "HEAD";
      if (factsBody && rawPath === "/world/facts.json") {
        json(res, 200, factsBody, head);
        return;
      }
      if (readSource && rawPath.startsWith("/world/source/")) {
        const result = sourceResponse(readSource, rawPath.slice("/world/source/".length), search);
        json(res, result.status, Buffer.from(JSON.stringify(result.body)), head);
        return;
      }
      const path = decodeURIComponent(rawPath);
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
      res.end(head ? undefined : body);
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
  options: { port?: number; open?: boolean; gameDirectory?: string; cacheRoot?: string; editor?: string } = {},
) {
  const links = localLinks(resolve(repo), options.editor);
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
  const served = await serveWorld(prepared.directory, gameDirectory, options.port, {
    repoRoot: prepared.root,
    facts: prepared.facts,
    links: prepared.facts.repo.commit ? links : { ...links, github: null },
  });
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
  if (!repo || repo.startsWith("--"))
    throw new Error("Usage: cq play <repo> [--no-open] [--port N] [--editor vscode://file/{path}:{line}]");
  let open = true,
    port = 0,
    editor: string | undefined;
  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--no-open") open = false;
    else if (args[i] === "--port") {
      const value = args[++i];
      port = Number(value);
      if (!value || !Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid --port");
    } else if (args[i] === "--editor") {
      editor = args[++i];
      if (!editor) throw new Error("Missing value for --editor");
    } else throw new Error(`Unknown play option: ${args[i]}`);
  }
  const result = await startPlay(repo, { open, port, editor }),
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
