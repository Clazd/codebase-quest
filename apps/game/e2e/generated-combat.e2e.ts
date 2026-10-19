/** biome-ignore-all lint/style/noNonNullAssertion: Missing required fixture facts must fail these tests immediately. */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const kinds = [
  "gremlin",
  "serpent",
  "mimic",
  "mutant",
  "ghost",
  "wisp",
  "minotaur",
  "imp",
  "wraith",
  "shapeshifter",
  "echo",
  "shadow",
];
type Entry = {
  id: string;
  kind: string;
  fightable: boolean;
  symbolId: string;
  position: { mapId: string; x: number; y: number };
};
async function start(page: Page, name = "smelly-ts") {
  await page.goto(`/?world=fixtures/${name}`);
  await page.getByRole("button", { name: "Enter the kingdom" }).click();
  await expect.poll(() => page.evaluate(() => window.__CQ__?.getScene())).toBe("Overworld");
  const response = await page.request.get(`/fixtures/${name}/encounters/index.json`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as Entry[];
}
async function fight(page: Page, id: string) {
  await page.evaluate((id) => window.__CQ__!.startFight(id), id);
  await expect(page.locator("#combat")).toBeVisible();
}
async function finish(page: Page) {
  return page.evaluate(async () => {
    const api = window.__CQ__!;
    for (let i = 0; i < 180; i++) {
      const s = api.getFight()!;
      if (s.outcome) return s.outcome;
      if (s.question) {
        await api.act("answer", null, api.__testAnswerKey!() ?? 0);
        continue;
      }
      if (s.prediction) {
        await api.act("predict", null, api.__testAnswerKey!()!);
        continue;
      }
      let moved = false;
      const attempt = async (action: string, id?: string) => {
        if (moved) return;
        try {
          await api.act(action, id);
          moved = true;
        } catch {}
      };
      for (const action of s.twistActions) await attempt(action);
      for (const [kind, action] of [
        ["heart", "pierce"],
        ["joint", "sever"],
        ["organ", "disable"],
        ["armor", "armor"],
        ["body", "trace"],
      ])
        for (const c of s.body.flatMap((b) => b.cells).filter((c) => c.kind === kind && !s.cells[c.id]?.destroyed))
          await attempt(action!, c.id);
      if (!moved) await attempt("trace");
      if (!moved) await api.act("end");
    }
    throw Error("Fight did not terminate");
  });
}
for (const kind of kinds)
  test(`generated ${kind}: fight, tame and record the real smell`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const index = await start(page);
    const e = index.find((e) => e.kind === kind && e.fightable)!;
    expect(e).toBeTruthy();
    await fight(page, e.id);
    if (kind === "serpent") await page.screenshot({ path: "out/phase07-combat.png", fullPage: true });
    expect(await finish(page)).toMatch(/victory|tamed/);
    expect((await new AxeBuilder({ page }).include("#combat").analyze()).violations).toEqual([]);
    await page.getByRole("button", { name: "Return to the world", exact: true }).click();
    await page.getByRole("button", { name: "Codex · C", exact: true }).click();
    await page.getByText(/Bestiary ·/).click();
    await expect(page.locator(".fight-codex")).toContainText("How to fix it:");
    if (kind === "wisp") await expect(page.locator(".fight-codex textarea")).toHaveValue(/Reported:/);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Bestiary", exact: true }).click();
    expect((await download).suggestedFilename()).toContain("bestiary");
    expect(errors).toEqual([]);
  });
test("generated combat: lose, return to the gate and flee with retained wounds", async ({ page }) => {
  const index = await start(page);
  const e = index.find((e) => e.kind === "serpent")!;
  await fight(page, e.id);
  const hp = await page.evaluate(() => window.__CQ__!.getFight()!.monsterHp);
  const joint = await page.evaluate(
    () => window.__CQ__!.getFight()!.body[0]!.cells.find((c) => c.kind === "joint")!.id,
  );
  await page.evaluate(async (id) => {
    const a = window.__CQ__!;
    await a.act("sever", id);
    await a.act("answer", null, a.__testAnswerKey!()!);
    await a.act("flee");
    await a.act("close");
  }, joint);
  await fight(page, e.id);
  expect(await page.evaluate(() => window.__CQ__!.getFight()!.monsterHp)).toBeLessThan(hp);
  await page.evaluate(async () => {
    const a = window.__CQ__!;
    for (let i = 0; i < 40 && !a.getFight()!.outcome; i++) {
      await a.act("end");
      if (a.getFight()!.prediction)
        await a.act("predict", null, ((a.__testAnswerKey!() ?? 0) + 1) % a.getFight()!.prediction!.choices.length);
    }
  });
  await expect(page.locator(".outcome")).toContainText("Defeat");
  await page.getByRole("button", { name: "Return to the world", exact: true }).click();
  await expect(page.locator("#combat")).toHaveCount(0);
});
test("ignored organ summons after two turns; revealed code, hints and keyboard announcements", async ({ page }) => {
  const index = await start(page, "tiny-ts");
  // Pick a generated fight containing a real callee mini-body, without inputs.
  let id = "";
  for (const e of index.filter((e) => e.fightable)) {
    const json = await (await page.request.get(`/fixtures/tiny-ts/encounters/${e.id}.json`)).json();
    if (json.minions.length && !json.bodies[0].inputs.length) {
      id = e.id;
      break;
    }
  }
  expect(id).toBeTruthy();
  await fight(page, id);
  await page.evaluate(() => window.__CQ__!.act("end"));
  expect(await page.evaluate(() => window.__CQ__!.getFight()!.summoned)).toHaveLength(0);
  await page.evaluate(() => window.__CQ__!.act("end"));
  expect((await page.evaluate(() => window.__CQ__!.getFight()!.summoned)).length).toBeGreaterThan(0);
  await expect(page.locator("#combat .bodies")).toContainText("(minion)");
  await expect(page.locator("#combat [aria-live='polite']").last()).toContainText(/bites|Focus/);
});
test("a whole generated fight works with keyboard only and passes axe on its question", async ({ page }) => {
  const index = await start(page);
  await fight(page, index.find((e) => e.kind === "minotaur")!.id);
  await page.keyboard.press("Tab");
  // The first focusable cell is selected. Arrows and Enter navigate/select.
  await expect(page.locator("#combat [data-cell]").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.keyboard.press("9");
  await expect(page.locator("#combat .question")).toBeVisible();
  expect((await new AxeBuilder({ page }).include("#combat").analyze()).violations).toEqual([]);
  await page.keyboard.press(String((await page.evaluate(() => window.__CQ__!.__testAnswerKey!()))! + 1));
  await page.keyboard.press("e");
  if (await page.locator("#combat .question").count())
    await page.keyboard.press(String((await page.evaluate(() => window.__CQ__!.__testAnswerKey!()))! + 1));
  for (let i = 0; i < 20 && !(await page.evaluate(() => window.__CQ__!.getFight()!.outcome)); i++) {
    // Navigate to the final return, then Pierce (6). Every operation after
    // starting the encounter is a real key press; debug reads only pick answers.
    for (let tabs = 0; tabs < 30; tabs++) {
      if (
        await page.locator("#combat [data-cell][aria-pressed='true']").evaluate((el) => el === document.activeElement)
      )
        break;
      await page.keyboard.press("Tab");
    }
    for (let down = 0; down < 12; down++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("6");
    if (await page.locator("#combat .question").count())
      await page.keyboard.press(String((await page.evaluate(() => window.__CQ__!.__testAnswerKey!()))! + 1));
    if (!(await page.evaluate(() => window.__CQ__!.getFight()!.outcome))) await page.keyboard.press("e");
    if (await page.locator("#combat .question").count())
      await page.keyboard.press(String((await page.evaluate(() => window.__CQ__!.__testAnswerKey!()))! + 1));
  }
  await expect(page.locator(".outcome")).toContainText("Victory");
});
