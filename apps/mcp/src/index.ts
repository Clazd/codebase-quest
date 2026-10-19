/**
 * @codebase-quest/mcp: the MCP server started by `cq mcp` (stdio). The user's
 * own agent prepares content, searches code and steers the running game; no
 * API key is involved.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCqServer, type ServerOptions } from "./server.ts";

export { SERVER_INSTRUCTIONS } from "./instructions.ts";
export { createCqServer, PREBUILD_TYPES, QuestSchema, type ServerOptions } from "./server.ts";
export const packageInfo = { name: "@codebase-quest/mcp", phase: 6, status: "server" } as const;
/** The skill installed by `cq setup`. */
export const SKILL_PATH = new URL("../skill/codebase-quest/SKILL.md", import.meta.url);

/** Runs the server over stdio until the client disconnects. Logs go to stderr only. */
export async function runStdio(options: ServerOptions = {}): Promise<void> {
  const { server, close } = createCqServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  await new Promise<void>((resolveDone) => {
    server.server.onclose = () => resolveDone();
    process.stdin.once("end", () => resolveDone());
  });
  await close();
}
