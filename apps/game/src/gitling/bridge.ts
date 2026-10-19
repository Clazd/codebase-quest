/** Messages the game exchanges with the local `cq play` bridge. Only these three event types exist. */
export type BridgeIn =
  | { type: "hello"; ok: boolean }
  | { type: "focus"; id: string; symbolId?: string }
  | { type: "playerState"; id: string }
  | {
      type: "gitlingQuestion";
      id: string;
      status?: "answered" | "unavailable" | "consent-required" | "rejected";
      reply?: { answer: string; refs: { path: string; startLine: number; endLine: number }[]; level: LiveLevel };
      sends?: string;
    };
export type LiveLevel = "sampling" | "bridge" | "ollama" | "api";
export interface BridgeHandlers {
  focus(symbolId: string): Promise<{ ok: boolean; error?: string }>;
  playerState(): Record<string, unknown>;
  answer(message: Extract<BridgeIn, { type: "gitlingQuestion" }>): void;
}
/**
 * The game's end of the bridge. The token comes from the URL fragment that
 * `cq play` opened (never sent over HTTP). Without it, the game runs offline.
 */
export class GameBridge {
  private ws: WebSocket | null = null;
  /** Outgoing messages, kept for the dev/test mock bridge. */
  readonly sent: Record<string, unknown>[] = [];
  private readonly handlers: BridgeHandlers;
  connected = false;
  constructor(handlers: BridgeHandlers) {
    this.handlers = handlers;
  }
  static token(hash = location.hash): string | null {
    const match = /(?:^#|&)bridge=([a-f0-9]{64})(?:&|$)/.exec(hash);
    return match?.[1] ?? null;
  }
  connect(token: string | null = GameBridge.token()): void {
    if (!token || this.ws) return;
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/bridge`);
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: "hello", role: "game", token }));
    ws.onmessage = (event) => {
      try {
        void this.receive(JSON.parse(String(event.data)) as BridgeIn);
      } catch {}
    };
    ws.onclose = () => {
      this.connected = false;
      this.ws = null;
    };
  }
  send(message: Record<string, unknown>): boolean {
    this.sent.push(message);
    if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }
  /** Handles one incoming message (also the entry point for the dev/test mock). */
  async receive(message: BridgeIn): Promise<void> {
    if (message.type === "hello") this.connected = message.ok;
    else if (message.type === "focus" && message.symbolId) {
      const result = await this.handlers.focus(message.symbolId).catch((e: unknown) => ({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      }));
      this.send({ type: "focus", id: message.id, ...result });
    } else if (message.type === "playerState")
      this.send({ type: "playerState", id: message.id, state: this.handlers.playerState() });
    else if (message.type === "gitlingQuestion") this.handlers.answer(message);
  }
}
