import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, Server } from "node:http";
import { join } from "node:path";
import type { Duplex } from "node:stream";
import {
  type ContentItem,
  type ContentProvider,
  makeItem,
  produce,
  RefSchema,
  search,
  untrusted,
  validateContent,
} from "@codebase-quest/content";
import { cqHome } from "@codebase-quest/content/node";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import type { Workspace } from "./workspace.ts";

/** The only events the bridge carries. Nothing else can control the game. */
export const BRIDGE_EVENTS = ["focus", "playerState", "gitlingQuestion"] as const;
export const MAX_MESSAGE_BYTES = 64 * 1024;
const Id = z.string().min(1).max(64);
const Answer = z.object({ answer: z.string().max(800), refs: z.array(RefSchema).max(5) });
export const LiveLevelSchema = z.enum(["sampling", "bridge", "ollama", "api"]);
export const HelloSchema = z.object({
  type: z.literal("hello"),
  role: z.enum(["game", "agent"]),
  token: z.string().min(16).max(128),
  sampling: z.boolean().optional(),
});
export const BridgeMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("focus"),
    id: Id,
    symbolId: z.string().max(64).optional(),
    ok: z.boolean().optional(),
    error: z.string().max(300).optional(),
  }),
  z.object({
    type: z.literal("playerState"),
    id: Id,
    state: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    type: z.literal("gitlingQuestion"),
    id: Id,
    question: z.string().min(1).max(500).optional(),
    consent: z.boolean().optional(),
    answer: Answer.optional(),
    level: LiveLevelSchema.optional(),
    unavailable: z.boolean().optional(),
    accepted: z.boolean().optional(),
    reasons: z.array(z.string()).optional(),
    status: z.enum(["answered", "unavailable", "consent-required", "rejected"]).optional(),
    reply: z.object({ answer: z.string(), refs: z.array(RefSchema), level: LiveLevelSchema }).optional(),
    sends: z.string().max(1000).optional(),
  }),
]);
export type BridgeMessage = z.infer<typeof BridgeMessageSchema>;

export interface Session {
  port: number;
  token: string;
  pid: number;
  root: string;
  startedAt: string;
}
/** `~/.codequest/sessions/<hash of repo root>.json`, readable only by the user. */
export function sessionPath(root: string, home = cqHome()): string {
  return join(home, "sessions", `${createHash("sha256").update(root).digest("hex").slice(0, 16)}.json`);
}
export function writeSession(session: Session, home = cqHome()): string {
  const path = sessionPath(session.root, home);
  mkdirSync(join(home, "sessions"), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(session), { mode: 0o600 });
  renameSync(temp, path);
  return path;
}
export function readSession(root: string, home = cqHome()): Session | null {
  const path = sessionPath(root, home);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Session;
  } catch {
    return null;
  }
}
export function removeSession(root: string, token: string, home = cqHome()): void {
  const session = readSession(root, home);
  if (session?.token === token) rmSync(sessionPath(root, home), { force: true });
}
const loopback = (address: string | undefined) =>
  address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
const sameToken = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
export interface LiveOptions {
  /** Agent mode: send in-game questions to connected agents (sampling or the bridge loop). */
  forwardToAgents?: boolean;
  /** Ollama or Anthropic provider when the user configured one. */
  provider?: ContentProvider;
  /** API mode on a private repository needs explicit consent first. */
  needsConsent?: () => boolean;
  grantConsent?: () => void;
  agentWaitMs?: number;
}
type Pending = {
  gameId: string;
  game: WebSocket;
  item: ContentItem;
  waiting: Set<WebSocket>;
  timer: ReturnType<typeof setTimeout>;
  done: boolean;
};
/**
 * Loopback-only WebSocket hub on the `cq play` server. Clients must say hello
 * with the session token within three seconds; browsers must come from this
 * server's own origin; agents (the MCP server) must not send an Origin.
 */
export class BridgeHub {
  readonly token: string;
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  private game: WebSocket | null = null;
  private readonly agents = new Map<WebSocket, { sampling: boolean }>();
  private readonly waitingReplies = new Map<string, { agent: WebSocket; agentId: string }>();
  private readonly pending = new Map<string, Pending>();
  private serial = 0;
  private readonly server: Server;
  private readonly workspace: Workspace | undefined;
  private readonly live: LiveOptions;
  constructor(server: Server, workspace?: Workspace, live: LiveOptions = {}, token = randomBytes(32).toString("hex")) {
    this.server = server;
    this.workspace = workspace;
    this.live = live;
    this.token = token;
    server.on("upgrade", this.upgrade);
  }
  get agentConnected(): boolean {
    return this.agents.size > 0;
  }
  get samplingAvailable(): boolean {
    return [...this.agents.values()].some((a) => a.sampling);
  }
  private readonly upgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const address = this.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const origin = req.headers.origin;
    const allowed = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
    if (
      (req.url ?? "").split("?")[0] !== "/bridge" ||
      !loopback(req.socket.remoteAddress) ||
      ![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host ?? "") ||
      (origin !== undefined && !allowed.includes(origin))
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => this.accept(ws, origin !== undefined));
  };
  private accept(ws: WebSocket, browser: boolean) {
    let role: "game" | "agent" | null = null;
    const timer = setTimeout(() => ws.close(1008, "hello required"), 3000);
    ws.on("message", (data, binary) => {
      try {
        if (binary) throw new Error("text only");
        const json = JSON.parse(String(data));
        if (!role) {
          const hello = HelloSchema.parse(json);
          if (!sameToken(hello.token, this.token) || (hello.role === "game") !== browser) throw new Error("denied");
          role = hello.role;
          clearTimeout(timer);
          if (role === "game") this.game = ws;
          else this.agents.set(ws, { sampling: Boolean(hello.sampling) });
          ws.send(JSON.stringify({ type: "hello", ok: true }));
          return;
        }
        const message = BridgeMessageSchema.parse(json);
        if (role === "game") this.fromGame(ws, message);
        else this.fromAgent(ws, message);
      } catch {
        ws.close(1008, "not allowed");
      }
    });
    ws.on("close", () => {
      clearTimeout(timer);
      if (this.game === ws) this.game = null;
      this.agents.delete(ws);
      for (const p of [...this.pending.values()]) {
        if (!p.waiting.delete(ws)) continue;
        if (!p.done && p.waiting.size === 0) void this.fallback(p);
      }
    });
  }
  private send(ws: WebSocket | null, message: BridgeMessage) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }
  private fromAgent(agent: WebSocket, m: BridgeMessage) {
    if (m.type === "focus" || m.type === "playerState") {
      if (!this.game) {
        this.send(
          agent,
          m.type === "focus"
            ? { type: "focus", id: m.id, ok: false, error: "The game is not open" }
            : { type: "playerState", id: m.id },
        );
        return;
      }
      const relay = `a${++this.serial}`;
      this.waitingReplies.set(relay, { agent, agentId: m.id });
      this.send(
        this.game,
        m.type === "focus" ? { type: "focus", id: relay, symbolId: m.symbolId } : { type: "playerState", id: relay },
      );
      return;
    }
    const p = this.pending.get(m.id);
    if (!p || p.done) return;
    if (m.unavailable) {
      p.waiting.delete(agent);
      if (p.waiting.size === 0) void this.fallback(p);
      return;
    }
    if (!m.answer || !m.level) return;
    const checked = this.workspace
      ? validateContent(p.item, m.answer, this.workspace.context)
      : { ok: false as const, reasons: ["no workspace"] };
    this.send(agent, {
      type: "gitlingQuestion",
      id: m.id,
      accepted: checked.ok,
      reasons: checked.ok ? undefined : checked.reasons,
    });
    if (checked.ok) this.deliver(p, m.answer, m.level);
  }
  private fromGame(game: WebSocket, m: BridgeMessage) {
    if (m.type === "focus" || m.type === "playerState") {
      const waiting = this.waitingReplies.get(m.id);
      if (!waiting) return;
      this.waitingReplies.delete(m.id);
      this.send(waiting.agent, { ...m, id: waiting.agentId });
      return;
    }
    if (!m.question || !this.workspace) return;
    const ws = this.workspace;
    const sheets = search(ws.index, m.question, 5).flatMap((h) =>
      ws.book.symbols.filter((s) => s.symbolId === h.symbolId),
    );
    const id = `q${++this.serial}`;
    const item = makeItem("gitling-answer", id, { kind: "question", question: untrusted(m.question), sheets });
    const p: Pending = {
      gameId: m.id,
      game,
      item,
      waiting: new Set(this.live.forwardToAgents ? this.agents.keys() : []),
      timer: setTimeout(() => void this.fallback(p), this.live.agentWaitMs ?? 60_000),
      done: false,
    };
    this.pending.set(id, p);
    if (m.consent && this.live.grantConsent) this.live.grantConsent();
    if (p.waiting.size)
      for (const agent of p.waiting) this.send(agent, { type: "gitlingQuestion", id, question: m.question });
    else void this.fallback(p);
  }
  private deliver(p: Pending, answer: z.infer<typeof Answer>, level: z.infer<typeof LiveLevelSchema>) {
    if (p.done) return;
    p.done = true;
    clearTimeout(p.timer);
    this.pending.delete(p.item.entityId);
    this.send(p.game, { type: "gitlingQuestion", id: p.gameId, status: "answered", reply: { ...answer, level } });
  }
  /** No agent answered: try the configured local/API provider, else keep the search answer. */
  private async fallback(p: Pending) {
    if (p.done) return;
    const provider = this.live.provider;
    if (!provider || !this.workspace) {
      p.done = true;
      clearTimeout(p.timer);
      this.pending.delete(p.item.entityId);
      this.send(p.game, { type: "gitlingQuestion", id: p.gameId, status: "unavailable" });
      return;
    }
    if (provider.source === "api" && this.live.needsConsent?.()) {
      p.done = true;
      clearTimeout(p.timer);
      this.pending.delete(p.item.entityId);
      this.send(p.game, {
        type: "gitlingQuestion",
        id: p.gameId,
        status: "consent-required",
        sends: `Your question and ${p.item.facts.kind === "question" ? p.item.facts.sheets.length : 0} fact sheets (names, paths, signatures, doc comments, callers and callees) are sent to the Anthropic API. Code lines are not sent. Secrets are masked.`,
      });
      return;
    }
    const result = await produce(p.item, [provider], this.workspace.context, () => null, { retries: 1 }).catch(
      () => null,
    );
    if (result && result.source !== "template" && (result.source === "api" || result.source === "ollama"))
      this.deliver(p, result.output as z.infer<typeof Answer>, result.source);
    else if (!p.done) {
      p.done = true;
      clearTimeout(p.timer);
      this.pending.delete(p.item.entityId);
      this.send(p.game, { type: "gitlingQuestion", id: p.gameId, status: "unavailable" });
    }
  }
  close() {
    for (const p of this.pending.values()) clearTimeout(p.timer);
    for (const client of this.wss.clients) client.terminate();
    this.wss.close();
    this.server.off("upgrade", this.upgrade);
  }
}
