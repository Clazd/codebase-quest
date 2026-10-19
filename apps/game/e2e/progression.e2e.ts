/** biome-ignore-all lint/style/noNonNullAssertion: This suite requires the test debug API. */
import AxeBuilder from "@axe-core/playwright";
import { levelFor, SKILLS } from "@codebase-quest/quests";
import { expect, type Page, test } from "@playwright/test";

test.setTimeout(90000);

test("Concept Gates warn in Story and enforce prerequisite keys in Expert", async ({ page }) => {
  await start(page);
  const atlas = await (await page.request.get("/fixtures/tiny-ts/quests.json")).json();
  const gate = atlas.gates[0];
  expect(gate).toBeTruthy();
  const world = await (await page.request.get("/fixtures/tiny-ts/world.json")).json();
  const region = world.regions.find((r: { id: string }) => r.id === gate.regionId);
  await page.evaluate(
    async ({ region }) => {
      const api = window.__CQ__!,
        save = api.getSave();
      save.settings.difficulty = "expert";
      await api.loadSave(save);
      await api.gotoRegion(region);
    },
    { region: region.id },
  );
  expect(await page.evaluate(() => window.__CQ__!.getLocation().regionId)).toBeUndefined();
  await expect(page.locator("#progression-notice")).toContainText("Concept Gate");
  await page.evaluate(
    async ({ region, key }) => {
      const api = window.__CQ__!,
        save = api.getSave();
      save.keys.push(key);
      await api.loadSave(save);
      await api.gotoRegion(region);
    },
    { region: region.id, key: gate.key },
  );
  expect(await page.evaluate(() => window.__CQ__!.getLocation().regionId)).toBe(region.id);
  await page.evaluate(
    async ({ region, position }) => {
      const api = window.__CQ__!,
        save = api.getSave();
      save.keys = [];
      save.settings.difficulty = "story";
      save.player.position = position;
      await api.loadSave(save);
      await api.gotoRegion(region);
    },
    { region: region.id, position: world.kingdom.gate },
  );
  expect(await page.evaluate(() => window.__CQ__!.getLocation().regionId)).toBe(region.id);
  await expect(page.locator("#progression-notice")).toContainText("may continue in story");
});

async function start(page: Page) {
  await page.goto("/?world=fixtures/tiny-ts");
  await page.getByRole("button", { name: "Enter the kingdom" }).click();
  await expect.poll(() => page.evaluate(() => window.__CQ__?.getScene())).toBe("Overworld");
}
test("bot completes the prologue and all tiny-ts chapters with at least 60% Kingdom Light", async ({ page }) => {
  await start(page);
  await page.keyboard.press("q");
  const chapters = await page.evaluate(() => window.__CQ__!.getQuests().filter((q) => q.type === "main"));
  for (const q of chapters) {
    if (q.id !== "prologue") await page.getByRole("button", { name: `Accept ${q.title}`, exact: true }).click();
    await page.evaluate((id) => {
      const api = window.__CQ__!,
        quest = api.getQuests().find((q) => q.id === id)!;
      for (let i = 0; i < quest.objectives.length; i++)
        if ((quest.progress?.counts[i] ?? 0) === 0) api.completeObjective!(id, i);
    }, q.id);
  }
  expect(
    await page.evaluate(() =>
      window
        .__CQ__!.getQuests()
        .filter((q) => q.type === "main")
        .every((q) => q.progress?.state === "completed"),
    ),
  ).toBe(true);
  expect(await page.evaluate(() => window.__CQ__!.getLight().kingdom)).toBeGreaterThanOrEqual(60);
  await expect(page.locator("#progression-dialog")).toContainText("Architecture Apprentice");
});
test("accept quest, complete real visits, receive one reward, reload and restore exported save", async ({ page }) => {
  await start(page);
  await page.keyboard.press("q");
  const q = await page.evaluate(
    () =>
      window
        .__CQ__!.getQuests()
        .filter((q) => q.type === "exploration")
        .sort((a, b) => a.objectives.length - b.objectives.length)[0]!,
  );
  await page.getByRole("button", { name: `Accept ${q.title}`, exact: true }).click();
  await page.getByRole("button", { name: "Return to kingdom", exact: true }).click();
  for (const o of q.objectives)
    if (o.kind === "visit") await page.evaluate((id) => window.__CQ__!.enterBuilding(id), o.buildingId);
  await expect(page.locator("#progression-notice")).toContainText(`${q.title} complete!`);
  const before = await page.evaluate(() => window.__CQ__!.getSave());
  expect(before.quests[q.id]?.state).toBe("completed");
  expect(before.player.gold).toBe(q.rewards.gold);
  await page.reload();
  await page.getByRole("button", { name: "Enter the kingdom" }).click();
  await expect.poll(() => page.evaluate(() => window.__CQ__?.getScene())).toBe("Interior");
  const after = await page.evaluate(() => window.__CQ__!.getSave());
  expect(after.player).toEqual(before.player);
  expect(after.quests).toEqual(before.quests);
  await page.keyboard.press("q");
  await page.getByRole("button", { name: "Saves", exact: true }).click();
  const exported = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export .cqsave", exact: true }).click();
  expect((await exported).suggestedFilename()).toBe("kingdom.cqsave");
  await page.getByRole("button", { name: "Start new game (keeps backup)", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__CQ__!.getSave().player.gold)).toBe(0);
  await page.getByLabel("Import .cqsave").setInputFiles({
    name: "kingdom.cqsave",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(before)),
  });
  await expect.poll(() => page.evaluate(() => window.__CQ__!.getSave().player.gold)).toBe(before.player.gold);
  await expect(page.locator("#progression-dialog")).toContainText("Save restored");
});
test("all equipment data and keyboard-only progression panels pass axe", async ({ page }) => {
  await start(page);
  const data = await (await page.request.get("/fixtures/tiny-ts/quests.json")).json();
  await page.evaluate(
    ({ skills, level }) => {
      const api = window.__CQ__!,
        save = api.getSave();
      save.player.xp = 10000000;
      save.player.level = level;
      save.player.skills = skills.map((s) => s.id);
      save.equipment = skills
        .filter((s) => ["compass", "spyglass", "lantern", "hourglass", "boots", "lens", "chronicle"].includes(s.effect))
        .map((s) => s.effect);
      return api.loadSave(save);
    },
    { skills: SKILLS, level: levelFor(10000000) },
  );
  await page.keyboard.press("q");
  for (const tab of ["Quests", "Skills", "Equipment", "Bazaar", "Journal", "Saves"]) {
    const button = page.getByRole("button", { name: tab, exact: true });
    await button.focus();
    await page.keyboard.press("Enter");
    expect((await new AxeBuilder({ page }).analyze()).violations, tab).toEqual([]);
  }
  await page.getByRole("button", { name: "Equipment", exact: true }).click();
  const known = data.symbols.find((s: { name: string }) => s.name === "query");
  await page.getByLabel("Equipment resident").selectOption(known.id);
  const view = (await page.evaluate((id) => window.__CQ__!.getEquipment(id), known.id)) as {
    callers: string[];
    signature: string;
    imports: string[];
    steps: unknown[];
  };
  expect(view.callers).toEqual(known.callers);
  await expect(page.locator('[data-equipment="compass"]')).toContainText(`${known.callers.length} exact callers`);
  await expect(page.locator('[data-equipment="spyglass"]')).toContainText(known.signature);
  await expect(page.locator('[data-equipment="hourglass"] .static-steps li')).toHaveCount(known.steps.length);
  const profile = page.waitForEvent("download");
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await page.getByRole("button", { name: "Export profile PNG" }).click();
  expect((await profile).suggestedFilename()).toBe("codebase-quest-profile.png");
  await page.keyboard.press("Escape");
  await expect(page.locator("#progression-dialog")).not.toBeVisible();
  await expect(page.locator("#quest-tracker")).toBeFocused();
});
test("damaged imports retain a backup and leave the current game intact", async ({ page }) => {
  await start(page);
  const before = await page.evaluate(() => window.__CQ__!.getSave());
  await page.keyboard.press("q");
  await page.getByRole("button", { name: "Saves", exact: true }).click();
  await page
    .getByLabel("Import .cqsave")
    .setInputFiles({ name: "broken.cqsave", mimeType: "application/json", buffer: Buffer.from("{broken") });
  await expect(page.locator("#progression-dialog")).toContainText("damaged");
  await expect(page.getByRole("button", { name: "Download damaged save backup" })).toBeVisible();
  expect((await page.evaluate(() => window.__CQ__!.getSave())).player).toEqual(before.player);
});

test("a real quest question rejects a distractor and records verified comprehension", async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const api = window.__CQ__!,
      q = api.getQuests().find((q) => q.id === "prologue")!;
    for (let i = 0; i < q.objectives.length; i++) if (!(q.progress?.counts[i] ?? 0)) api.completeObjective!(q.id, i);
  });
  const q = await page.evaluate(() => window.__CQ__!.getQuests().find((q) => q.id === "chapter:1")!);
  const data = await (await page.request.get("/fixtures/tiny-ts/quests.json")).json();
  const talk = q.objectives[0];
  if (talk?.kind !== "talk") throw Error("Expected a real resident");
  await page.keyboard.press("q");
  await page.getByRole("button", { name: `Accept ${q.title}`, exact: true }).click();
  await page.keyboard.press("Escape");
  await page.evaluate((id) => window.__CQ__!.interactWithNpc(id), talk.symbolId);
  await expect(page.locator("#code-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("q");
  const symbol = data.symbols.find((s: { id: string }) => s.id === talk.symbolId),
    expected = symbol.callOrder[0] ?? String(symbol.parameters);
  const select = page.locator(`[data-quest="${q.id}"]`).getByRole("combobox");
  const values = await select
    .locator("option")
    .evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
  await select.selectOption(values.find((v) => v !== expected)!);
  await page.locator(`[data-quest="${q.id}"]`).getByRole("button", { name: "Check answer" }).click();
  expect(
    (await page.evaluate(() => window.__CQ__!.getQuests().find((q) => q.id === "chapter:1")!)).progress?.counts[1],
  ).toBe(0);
  await select.selectOption(expected);
  await page.locator(`[data-quest="${q.id}"]`).getByRole("button", { name: "Check answer" }).click();
  expect(
    (await page.evaluate(() => window.__CQ__!.getQuests().find((q) => q.id === "chapter:1")!)).progress?.counts[1],
  ).toBe(1);
  expect((await page.evaluate(() => window.__CQ__!.getSave())).comprehension[talk.symbolId]).toBe("understood");
});
