import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AiConfigSchema } from "@codebase-quest/content/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { readSession } from "./bridge.ts";
import { liveProvider, startPlay } from "./play.ts";

const tiny = fileURLToPath(new URL("../../../fixtures/repos/tiny-ts", import.meta.url));
const temp = mkdtempSync(join(tmpdir(), "cq-bridge-"));
const game = join(temp, "game");
mkdirSync(game);
writeFileSync(join(game, "index.html"), "<h1>Game shell</h1>");

let played: Awaited<ReturnType<typeof startPlay>>;
let port = "",
  token = "";
beforeAll(async () => {
  played = await startPlay(tiny, {
    open: false,
    gameDirectory: game,
    cacheRoot: join(temp, "cache"),
    ai: AiConfigSchema.parse({}),
  });
  const url = new URL(played.url);
  port = url.port;
  token = url.hash.replace("#bridge=", "");
}, 120_000);
afterAll(async () => {
  played.server.closeAllConnections();
  await new Promise<void>((done) => played.server.close(() => done()));
});
/** Opens a socket, sends hello, and reports how the server answered. */
function attempt(
  hello: Record<string, unknown> | null,
  options: { origin?: string; host?: string; next?: Record<string, unknown> } = {},
): Promise<{ status: "hello" | "closed" | "refused"; code?: number; messages: unknown[] }> {
  return new Promise((resolve) => {
    const headers: Record<string, string> = {};
    if (options.host) headers.host = options.host;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/bridge`, {
      ...(options.origin ? { origin: options.origin } : {}),
      headers,
    });
    const messages: unknown[] = [];
    ws.on("unexpected-response", () => resolve({ status: "refused", messages }));
    ws.on("error", () => resolve({ status: "refused", messages }));
    ws.on("open", () => {
      if (hello) ws.send(JSON.stringify(hello));
    });
    ws.on("message", (data) => {
      const m = JSON.parse(String(data));
      messages.push(m);
      if (m.type === "hello" && options.next) ws.send(JSON.stringify(options.next));
      else if (m.type === "hello") {
        ws.close();
        resolve({ status: "hello", messages });
      }
    });
    ws.on("close", (code) =>
      resolve({ status: messages.length && !options.next ? "hello" : "closed", code, messages }),
    );
  });
}
describe("bridge security", () => {
  it("writes a private session file with the token for the MCP server", () => {
    const session = readSession(played.root);
    expect(session?.token).toBe(token);
    expect(session?.port).toBe(Number(port));
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });
  it("accepts the right token for the right role", async () => {
    expect((await attempt({ type: "hello", role: "agent", token })).status).toBe("hello");
    expect((await attempt({ type: "hello", role: "game", token }, { origin: `http://127.0.0.1:${port}` })).status).toBe(
      "hello",
    );
  });
  it("refuses connections without the token, with a wrong token, or with a silent client", async () => {
    expect(await attempt({ type: "hello", role: "agent", token: "0".repeat(64) })).toMatchObject({
      status: "closed",
      code: 1008,
    });
    expect(await attempt({ type: "hello", role: "agent" })).toMatchObject({ status: "closed", code: 1008 });
    expect(await attempt(null)).toMatchObject({ status: "closed", code: 1008 });
  });
  it("refuses foreign origins and hosts, and role spoofing", async () => {
    expect((await attempt({ type: "hello", role: "game", token }, { origin: "http://evil.example" })).status).toBe(
      "refused",
    );
    expect((await attempt({ type: "hello", role: "agent", token }, { host: `evil.example:${port}` })).status).toBe(
      "refused",
    );
    // A browser page cannot claim to be the agent; a non-browser cannot claim to be the game.
    expect(
      (await attempt({ type: "hello", role: "agent", token }, { origin: `http://127.0.0.1:${port}` })).status,
    ).toBe("closed");
    expect((await attempt({ type: "hello", role: "game", token })).status).toBe("closed");
  });
  it("binds to loopback only", () => {
    const address = played.server.address();
    expect(typeof address === "object" && address?.address).toBe("127.0.0.1");
  });
  it("allows only the three events: anything else closes the connection", async () => {
    for (const bad of [
      { type: "eval", id: "1", code: "process.exit()" },
      { type: "teleport", id: "1", x: 1, y: 1 },
      { type: "focus" },
      { type: "gitlingQuestion", id: "x", question: "q".repeat(5000) },
    ])
      expect(
        (await attempt({ type: "hello", role: "agent", token }, { next: bad })).status,
        JSON.stringify(bad).slice(0, 40),
      ).toBe("closed");
  });
});
describe("AI mode Off", () => {
  it("has no live provider and answers Gitling with search only, making no network calls", async () => {
    expect(liveProvider(AiConfigSchema.parse({}), temp)).toBeUndefined();
    const hosts: string[] = [];
    const original = net.Socket.prototype.connect;
    const originalFetch = globalThis.fetch;
    net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
      const first = args[0] as { host?: string; port?: number } | number;
      hosts.push(typeof first === "object" ? String(first.host ?? "localhost") : String(args[1] ?? "localhost"));
      return (original as (...a: unknown[]) => net.Socket).apply(this, args);
    } as typeof original;
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
      hosts.push(new URL(String(args[0] instanceof Request ? args[0].url : args[0])).hostname);
      return originalFetch(...args);
    }) as typeof fetch;
    try {
      const reply = await new Promise<Record<string, unknown>>((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/bridge`, { origin: `http://127.0.0.1:${port}` });
        ws.on("open", () => ws.send(JSON.stringify({ type: "hello", role: "game", token })));
        ws.on("message", (data) => {
          const m = JSON.parse(String(data));
          if (m.type === "hello")
            ws.send(JSON.stringify({ type: "gitlingQuestion", id: "q1", question: "Where are tasks saved?" }));
          else {
            ws.close();
            resolve(m);
          }
        });
      });
      expect(reply).toMatchObject({ type: "gitlingQuestion", id: "q1", status: "unavailable" });
      const ai = await (await originalFetch(`http://127.0.0.1:${port}/world/ai.json`)).json();
      expect(ai).toMatchObject({
        mode: "off",
        levels: { search: true, agent: false, sampling: false, ollama: false, api: false },
      });
    } finally {
      net.Socket.prototype.connect = original;
      globalThis.fetch = originalFetch;
    }
    expect(hosts.filter((h) => !["127.0.0.1", "localhost", "::1"].includes(h))).toEqual([]);
  });
});
