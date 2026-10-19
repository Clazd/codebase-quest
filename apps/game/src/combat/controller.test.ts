/** biome-ignore-all lint/style/noNonNullAssertion: Missing required fixture facts must fail these tests immediately. */

import { costOf } from "@codebase-quest/combat";
import { expect, it } from "vitest";
import { fixture } from "../../../../packages/combat/src/test-fixtures.ts";
import { CodexStore, exportBestiary } from "../npc/codex.ts";
import { CombatController } from "./controller.ts";

it("reports a persistent victory before closing its result and never reports it twice", async () => {
  const data = await fixture("smelly-ts"),
    e = [...data.encounters.values()].find((e) => e.kind === "ghost")!;
  const c = new CombatController("http://localhost/world/world.json");
  let reports = 0;
  c.progression = {
    inventory: () => ({ hint: 2 }),
    skills: () => [],
    onInventory: () => {},
    onAnswer: () => {},
    rewarded: () => false,
  };
  c.onEnd = () => {
    reports++;
  };
  c.start(e);
  c.act("prove", null);
  c.answer(c.testKey()!);
  expect(c.state!.outcome).toBeTruthy();
  expect(reports).toBe(1);
  expect(c.rewardNotice).toBe(true);
  c.close();
  expect(reports).toBe(1);
});

it("uses persistent consumables and applies unlocked combat assists without changing question keys", async () => {
  const data = await fixture("smelly-ts"),
    encounter = [...data.encounters.values()].find((e) => e.kind === "shadow")!;
  const controller = new CombatController("http://localhost/world/world.json");
  const inventory = { hint: 4, tonic: 2, smoke: 3, recall: 1 };
  controller.progression = {
    inventory: () => inventory,
    skills: () => ["debugging-2", "debugging-3", "debugging-4", "testing-3"],
    onInventory: (i) => {
      Object.assign(inventory, i);
    },
    onAnswer: () => {},
  };
  controller.start(encounter);
  const s = controller.state!;
  expect(s.potions).toBe(4);
  expect(s.items.tonics).toBe(2);
  expect(costOf(s, "read")).toBe(0);
  expect(costOf(s, "armor")).toBe(2);
  expect(s.encounter.questions).toEqual(encounter.questions);
  expect(s.balance.mutantSpreadEvery).toBe(2);
  expect(s.encounter.smellAttack.focusDamage).toBe(Math.max(0, encounter.smellAttack.focusDamage - 2));
  controller.act("tonic", null);
  const first = encounter.bodies[0]?.cells[0];
  if (first) {
    const before = controller.state!.energy;
    controller.act("read", first.id);
    expect(controller.state!.energy).toBe(before);
    expect(costOf(controller.state!, "read")).toBeGreaterThan(0);
  }
  expect(inventory.tonic).toBe(1);
  controller.act("smoke", null);
  controller.close();
  expect(inventory.smoke).toBe(2);
  controller.start(encounter);
  expect(controller.state!.items.tonics).toBe(1);
  expect(controller.state!.items.smokeBombs).toBe(2);
});

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
