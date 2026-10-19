import { WebSocket } from "ws";
import { readSession } from "../../cli/src/bridge.ts";

type Reply = Record<string, unknown> & { type: string; id: string };
export type IncomingQuestion = { id: string; question: string };
/**
 * The MCP server's side of the game bridge: connects to the running `cq play`
 * server for this repository using the token from its session file.
 */
export class BridgeClient {
  private ws: WebSocket | null = null;
  private ready: Promise<void> | null = null;
  private serial = 0;
  private readonly replies = new Map<string, (reply: Reply) => void>();
  private readonly root: string;
  private readonly home: string | undefined;
  private readonly sampling: () => boolean;
  private readonly onQuestion: (q: IncomingQuestion) => void;
  constructor(
    root: string,
    options: { home?: string; sampling: () => boolean; onQuestion: (q: IncomingQuestion) => void },
  ) {
    this.root = root;
    this.home = options.home;
    this.sampling = options.sampling;
    this.onQuestion = options.onQuestion;
  }
  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
  /** Connects when a game session exists; resolves false when the game is not running. */
  async connect(): Promise<boolean> {
    if (this.connected) return true;
    const session = readSession(this.root, this.home);
    if (!session) return false;
    this.ready ??= new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${session.port}/bridge`);
      const fail = (error: Error) => {
        this.ws = null;
        this.ready = null;
        reject(error);
      };
      ws.once("error", fail);
      ws.once("open", () =>
        ws.send(JSON.stringify({ type: "hello", role: "agent", token: session.token, sampling: this.sampling() })),
      );
      ws.on("message", (data) => {
        let message: Reply;
        try {
          message = JSON.parse(String(data)) as Reply;
        } catch {
          return;
        }
        if (message.type === "hello") {
          this.ws = ws;
          resolve();
          return;
        }
        const waiting = this.replies.get(message.id);
        if (waiting) {
          this.replies.delete(message.id);
          waiting(message);
        } else if (message.type === "gitlingQuestion" && typeof message.question === "string")
          this.onQuestion({ id: message.id, question: message.question });
      });
      ws.on("close", () => {
        this.ws = null;
        this.ready = null;
      });
    });
    try {
      await this.ready;
      return true;
    } catch {
      return false;
    }
  }
  /** Sends a request and waits for the reply with the same ID. */
  async request(message: Record<string, unknown>, timeoutMs = 5000): Promise<Reply | null> {
    if (!(await this.connect()) || !this.ws) return null;
    const id = typeof message.id === "string" ? message.id : `m${++this.serial}`;
    const ws = this.ws;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.replies.delete(id);
        resolve(null);
      }, timeoutMs);
      this.replies.set(id, (reply) => {
        clearTimeout(timer);
        resolve(reply);
      });
      ws.send(JSON.stringify({ ...message, id }));
    });
  }
  send(message: Record<string, unknown>): void {
    if (this.connected) this.ws?.send(JSON.stringify(message));
  }
  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
