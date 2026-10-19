import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { FactBookSchema, WorldModelSchema } from "@codebase-quest/shared";
import { expect, type Page, test } from "@playwright/test";
import { required } from "../src/explore/required.ts";

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const facts = FactBookSchema.parse(JSON.parse(read("../../../packages/content/goldens/tiny-ts.facts.json")));
const world = WorldModelSchema.parse(JSON.parse(read("../../../packages/worldgen/goldens/tiny-ts.world.json")));
const sheet = (name: string) => required(facts.symbols.find((s) => s.name === name));
const slugify = sheet("slugify"),
  createTask = sheet("createTask"),
  saveTask = sheet("saveTask"),
  formatDate = sheet("formatDate");

async function start(page: Page) {
  await page.goto("/?world=fixtures/tiny-ts");
  await page.getByRole("button", { name: "Enter the kingdom" }).click();
  await expect.poll(() => page.evaluate(() => window.__CQ__?.getScene())).toBe("Overworld");
}
const panel = (page: Page) => page.locator("#code-panel");
async function codeLines(page: Page) {
  await expect(panel(page).locator(".code-line").first()).toBeVisible();
  return panel(page).locator(".code-line code").allTextContents();
}
const serious = async (page: Page, include: string) =>
  (await new AxeBuilder({ page }).include(include).analyze()).violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );

test("talking to slugify shows its exact lines from the real file", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await start(page);
  await page.evaluate((id) => window.__CQ__?.interactWithNpc(id), slugify.symbolId);
  await expect(panel(page).getByRole("heading", { name: "slugify()" })).toBeVisible();
  expect(await page.evaluate(() => window.__CQ__?.getOpenPanel())).toEqual({
    kind: "code",
    symbolId: slugify.symbolId,
  });
  const real = read("../../../fixtures/repos/tiny-ts/src/utils/slugify.ts").split("\n");
  const expected = real.slice(slugify.range.startLine - 1, slugify.range.endLine);
  expect(expected[0]).toContain("export function slugify");
  expect(await codeLines(page)).toEqual(expected);
  await expect(panel(page).locator(".code-line .ln").first()).toHaveText(String(slugify.range.startLine));
  await expect(panel(page).locator("section.code")).toHaveAttribute("data-highlighted", "true");
  await expect(page.locator("#dialogue-box")).toContainText("Turns a title into a URL-friendly slug");
  await expect(panel(page).getByRole("link", { name: "Open in editor" })).toHaveAttribute(
    "href",
    new RegExp(`^vscode://file/.+/src/utils/slugify\\.ts:${slugify.range.startLine}$`),
  );
  await expect(panel(page).getByRole("heading", { name: /Tested by/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("clicking a callee navigates to that character: teleport and walk-guide", async ({ page }) => {
  await start(page);
  await page.evaluate((id) => window.__CQ__?.interactWithNpc(id), createTask.symbolId);
  const before = await page.evaluate(() => window.__CQ__?.getLocation());
  expect(before?.scene).toBe("Overworld");
  await panel(page)
    .getByRole("button", { name: /^saveTask · src\/db\/tasks\.ts/ })
    .click();
  await panel(page).getByRole("button", { name: "Teleport" }).click();
  await expect.poll(() => page.evaluate(() => window.__CQ__?.getLocation().buildingId)).toBe(saveTask.buildingId);
  const after = required(await page.evaluate(() => window.__CQ__?.getLocation()));
  expect(after.scene).toBe("Interior");
  expect(after.breadcrumb).toContain("tasks.ts");
  // Arriving by teleport greets the character.
  await expect(panel(page).getByRole("heading", { name: "saveTask()" })).toBeVisible();
  const npc = required(
    (await page.evaluate(() => window.__CQ__?.getNpcs()))?.find((n) => n.symbolId === saveTask.symbolId),
  );
  const player = required(await page.evaluate(() => window.__CQ__?.getPlayer()));
  expect(Math.hypot(npc.x - player.x, npc.y - player.y)).toBeLessThanOrEqual(26);

  // Walk there: a guide toward slugify, starting with this building's exit.
  await page.evaluate((id) => window.__CQ__?.interactWithNpc(id), slugify.symbolId);
  await panel(page)
    .getByRole("button", { name: /^createTask · / })
    .click();
  await panel(page).getByRole("button", { name: "Walk there" }).click();
  await expect(panel(page)).toBeHidden();
  const guide = required(await page.evaluate(() => window.__CQ__?.getGuide()));
  expect(guide.symbolId).toBe(createTask.symbolId);
  const interior = required(world.interiors.find((i) => i.buildingId === saveTask.buildingId));
  expect(guide.waypoint).toEqual(interior.entrance);
  await expect(page.locator("#explore-status")).toContainText("createTask()");
});

test("Codex counts talks, finds entries, and keeps notes after reload", async ({ page }) => {
  await start(page);
  expect(await page.evaluate(() => window.__CQ__?.getCodexCount())).toBe(0);
  await page.evaluate((id) => window.__CQ__?.interactWithNpc(id), formatDate.symbolId);
  expect(await page.evaluate(() => window.__CQ__?.getCodexCount())).toBe(1);
  await page.evaluate((id) => window.__CQ__?.interactWithNpc(id), formatDate.symbolId);
  expect(await page.evaluate(() => window.__CQ__?.getCodexCount())).toBe(1);
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  await page.keyboard.press("c");
  const codex = page.getByRole("dialog", { name: "Codex" });
  await expect(codex).toBeVisible();
  await expect(page.locator("#codex-search")).toBeFocused();
  await page.keyboard.type("format");
  await codex.getByRole("button", { name: /formatDate\(\)/ }).click();
  await codex.getByLabel("Personal notes (Markdown)").fill("Formats due dates for the API. **Check time zones.**");
  const download = page.waitForEvent("download");
  await codex.getByRole("button", { name: "Export notes" }).click();
  const markdown = readFileSync(required(await (await download).path()), "utf8");
  expect(markdown).toContain("## formatDate()");
  expect(markdown).toContain("Check time zones.");
  await page.reload();
  await page.getByRole("button", { name: "Enter the kingdom" }).click();
  await expect.poll(() => page.evaluate(() => window.__CQ__?.getCodexCount())).toBe(1);
  await page.keyboard.press("c");
  await page.locator("#codex-search").fill("format");
  await codex.getByRole("button", { name: /formatDate\(\)/ }).click();
  await expect(codex.getByLabel("Personal notes (Markdown)")).toHaveValue(
    "Formats due dates for the API. **Check time zones.**",
  );
  expect(await page.evaluate(() => window.__CQ__?.getOpenPanel())).toEqual({
    kind: "codex",
    symbolId: formatDate.symbolId,
  });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(codex).toBeHidden();
});

test("E talks by proximity, a click talks too, and Esc returns control to the game", async ({ page }) => {
  await start(page);
  await page.evaluate((id) => window.__CQ__?.gotoNpc(id), slugify.symbolId);
  await expect(page.locator("#explore-status")).toContainText("Talk to slugify()");
  await page.keyboard.press("e");
  await expect(panel(page)).toBeVisible();
  const held = required(await page.evaluate(() => window.__CQ__?.getPlayer()));
  await page.keyboard.down("s");
  await page.waitForTimeout(250);
  await page.keyboard.up("s");
  expect(await page.evaluate(() => window.__CQ__?.getPlayer())).toEqual(held);
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  expect(await page.evaluate(() => window.__CQ__?.getOpenPanel())).toEqual({ kind: null });
  // A click on the character's sprite also talks.
  const npc = required(
    (await page.evaluate(() => window.__CQ__?.getNpcs()))?.find((n) => n.symbolId === slugify.symbolId),
  );
  const camera = required(await page.evaluate(() => window.__CQ__?.getCamera())),
    box = required(await page.locator("#game canvas").boundingBox());
  const sx = (npc.x - camera.scrollX - camera.width / 2) * camera.zoom + camera.width / 2,
    sy = (npc.y - camera.scrollY - camera.height / 2) * camera.zoom + camera.height / 2;
  await page.mouse.click(box.x + (sx * box.width) / camera.width, box.y + (sy * box.height) / camera.height);
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  const before = required(await page.evaluate(() => window.__CQ__?.getPlayer()));
  await page.keyboard.down("d");
  await page.waitForTimeout(300);
  await page.keyboard.up("d");
  await page.keyboard.down("s");
  await page.waitForTimeout(300);
  await page.keyboard.up("s");
  const after = required(await page.evaluate(() => window.__CQ__?.getPlayer()));
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(8);
});

test("keyboard-only: open the panel, move through callers, choose, and close", async ({ page }) => {
  await page.goto("/?world=fixtures/tiny-ts");
  await expect(page.getByRole("button", { name: "Enter the kingdom" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__CQ__?.getScene())).toBe("Overworld");
  await page.evaluate((id) => window.__CQ__?.gotoNpc(id), slugify.symbolId);
  await page.keyboard.press("e");
  await expect(panel(page).getByRole("heading", { name: "slugify()" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(panel(page).locator("section.code")).toBeFocused();
  await page.keyboard.press("Tab");
  const callers = panel(page).locator("#code-panel-title-callers + ul button");
  await expect(callers.nth(0)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(callers.nth(1)).toBeFocused();
  await page.keyboard.press("End");
  await expect(callers.last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(callers.nth(0)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(panel(page).getByRole("button", { name: "Walk there" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel(page).getByRole("button", { name: "Walk there" })).toBeHidden();
  await expect(callers.nth(0)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  await expect(page.locator(":focus")).toHaveCount(1);
});

test("Code Panel and Codex pass axe with no serious violations", async ({ page }) => {
  await start(page);
  await page.evaluate((id) => window.__CQ__?.interactWithNpc(id), createTask.symbolId);
  await expect(panel(page).locator("section.code")).toHaveAttribute("data-highlighted", "true");
  expect(await serious(page, "#overlay-root")).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await panel(page).getByRole("button", { name: "Add to notes" }).click();
  await expect(page.getByLabel("Personal notes (Markdown)")).toBeFocused();
  expect(await serious(page, "#codex")).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.locator("#codex-search")).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("Code Panel visual regression", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(page);
  await page.evaluate((id) => window.__CQ__?.interactWithNpc(id), slugify.symbolId);
  await expect(panel(page).locator("section.code")).toHaveAttribute("data-highlighted", "true");
  await page.locator("#code-panel-title").blur();
  await expect(panel(page)).toHaveScreenshot("code-panel-slugify.png", { maxDiffPixelRatio: 0.015 });
});
