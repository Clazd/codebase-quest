/** biome-ignore-all lint/style/noNonNullAssertion: Missing required fixture facts must fail these tests immediately. */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type ContentProvider, produce, templateOutput, worldItems } from "@codebase-quest/content";
import { buildFactBook } from "@codebase-quest/content/facts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, it, vi } from "vitest";
import balance from "../../../packages/combat/src/balance.json" with { type: "json" };
import {
  act,
  answer,
  type Balance,
  createCombat,
  publicView,
  testAnswerKey,
} from "../../../packages/combat/src/index.ts";
import { fixture } from "../../../packages/combat/src/test-fixtures.ts";
import { createCqServer } from "./server.ts";

function clean(value: unknown) {
  if (value && typeof value === "object")
    for (const [key, child] of Object.entries(value)) {
      expect(
        ["exitHeartId", "pathCellIds", "questions", "answerKey", "correctChoice", "correctIndex"].includes(key),
      ).toBe(false);
      if (key === "answer") expect(typeof child).not.toBe("number");
      clean(child);
    }
}
it("provider spies and real MCP transport never receive generated answer keys during fights", async () => {
  const data = await fixture("tiny-ts");
  const book = buildFactBook(data.graph, data.world);
  const items = worldItems(data.world, book, () => null);
  const server = createCqServer({
    cwd: fileURLToPath(new URL("../../../fixtures/repos/tiny-ts", import.meta.url)),
    cacheRoot: mkdtempSync(join(tmpdir(), "cq-p07-security-")),
    autoBuild: true,
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "phase07-security", version: "1" });
  await Promise.all([server.server.connect(a), client.connect(b)]);
  try {
    const tools = await client.listTools();
    expect(tools.tools.some((t) => /answer.?key|fight/i.test(t.name))).toBe(false);
    const e = [...data.encounters.values()].find((e) => e.bodies[0]!.name === "computeTaskStatus")!;
    let state = createCombat(e, balance as Balance, "normal");
    state = act(state, "sever", e.bodies[0]!.limbs[0]!.jointId);
    for (const source of ["agent", "sampling", "ollama", "api"] as const) {
      const item = items.find((i) => i.contentType === "combat-explanation" && i.entityId === e.bodies[0]!.symbolId)!;
      const generate = vi.fn(async (payload) => {
        clean(payload);
        return templateOutput(payload, data.world.seed);
      });
      const provider: ContentProvider = { source, generate };
      await produce(item, [provider], { book }, () => templateOutput(item, data.world.seed));
      expect(generate).toHaveBeenCalledTimes(1);
      expect(item.facts.kind === "symbol" && item.facts.code).toBeNull();
    }
    clean(publicView(state));
    for (const [name, args] of [
      ["cq_status", {}],
      ["cq_get_symbol", { ref: e.bodies[0]!.symbolId }],
      ["cq_next_content_batch", { contentType: "combat-explanation", limit: 3 }],
      ["cq_player_state", {}],
    ] as const) {
      const response = await client.callTool({ name, arguments: args });
      clean(response);
      if (name !== "cq_player_state") expect(response.isError).not.toBe(true);
      if (name === "cq_next_content_batch") expect(JSON.stringify(response)).toContain("combat-explanation");
    }
    state = answer(state, testAnswerKey(state)!);
    clean(publicView(state));
  } finally {
    await client.close();
    await server.close();
  }
});
