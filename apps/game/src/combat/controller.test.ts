/** biome-ignore-all lint/style/noNonNullAssertion: Missing required fixture facts must fail these tests immediately. */
import { expect, it } from "vitest";
import { fixture } from "../../../../packages/combat/src/test-fixtures.ts";
import { CodexStore, exportBestiary } from "../npc/codex.ts";
import { CombatController } from "./controller.ts";

it("keeps flee damage for 60 seconds, discards it after expiry and handles failed lazy loads", async () => {
  const data = await fixture("smelly-ts");
  const e = [...data.encounters.values()].find((e) => e.kind === "serpent")!;
  let requests = 0;
  const c = new CombatController("http://localhost/world/world.json", (async () => {
    requests++;
    return new Response(JSON.stringify(e));
  }) as typeof fetch);
  expect(await c.load(e.id)).toEqual(e);
  await c.load(e.id);
  expect(requests).toBe(1);
  await expect(c.load("../bad")).rejects.toThrow("Bad encounter");
  c.start(e, 0);
  const target = e.bodies[0]!.limbs[0]!.jointId;
  c.act("sever", target);
  c.answer(c.testKey()!);
  const hp = c.view()!.monsterHp;
  c.act("flee", null);
  c.close(1000);
  c.start(e, 60_999);
  expect(c.view()!.monsterHp).toBe(hp);
  c.act("flee", null);
  c.close(61_000);
  c.start(e, 121_001);
  expect(c.view()!.monsterHp).toBeGreaterThan(hp);
});
it("stores cleared maps, understanding and Bestiary notes and exports deterministic evidence", () => {
  const c = new CodexStore(null, "test");
  c.recordFight(
    "test",
    {
      name: "Test",
      species: "Serpent",
      smellKind: "complex-function",
      title: "Test",
      path: "sample.ts",
      lines: [1, 4],
      message: "complexity 12",
      measured: 12,
      threshold: 10,
      fix: "Extract helpers",
      outcome: "victory",
      note: "",
      at: "now",
    },
    { symbolId: "abcdefabcdef", value: { name: "sample", path: "sample.ts", cells: [[0, 0, "heart"]], at: "now" } },
    ["abcdefabcdef"],
  );
  c.setBestiaryNote("test", "Investigated");
  expect(c.isUnderstood("abcdefabcdef")).toBe(true);
  expect(c.data.bodyMaps.abcdefabcdef?.cells).toHaveLength(1);
  expect(exportBestiary("Test", c)).toContain("measured 12, threshold 10");
  expect(exportBestiary("Test", c)).toContain("Investigated");
});
