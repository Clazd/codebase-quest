import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { WorldModelSchema } from "@codebase-quest/shared";
import { expect, type Page, test } from "@playwright/test";
import { findPath } from "../src/explore/navigation.ts";
import { required } from "../src/explore/required.ts";

const world = WorldModelSchema.parse(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../../packages/worldgen/goldens/tiny-ts.world.json", import.meta.url)),
      "utf8",
    ),
  ),
);
const port = required(world.regions.find((r) => r.path === "src/api"));
const building = required(world.buildings.find((b) => b.regionId === port.id && b.label === "routes.ts"));
async function start(page: Page, name = "tiny-ts") {
  await page.goto(`/?world=fixtures/${name}`);
  await expect(page.getByRole("button", { name: "Enter the kingdom" })).toBeVisible();
  if (name === "tiny-ts") await expect(page.getByRole("heading", { name: "Kingdom of Taskly" })).toBeVisible();
  await page.getByRole("button", { name: "Enter the kingdom" }).click();
  await expect.poll(() => page.evaluate(() => window.__CQ__?.getScene())).toBe("Overworld");
  await page.waitForTimeout(250);
}
async function region(page: Page) {
  await page.evaluate((id) => window.__CQ__?.gotoRegion(id), port.id);
  await expect.poll(() => page.evaluate(() => window.__CQ__?.getLocation().breadcrumb)).toContain("src/api");
}
test("loads title, enters a real door using keyboard, and exits at the same door", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await start(page);
  expect(await page.evaluate(() => window.__CQ__?.getWorldSummary())).toEqual({ regions: 5, buildings: 18, npcs: 58 });
  await region(page);
  await page.evaluate((p) => window.__CQ__?.teleport((p.x + 0.5) * 16, (p.y + 0.5) * 16), building.door);
  await page.keyboard.press("e");
  await expect.poll(() => page.evaluate(() => window.__CQ__?.getScene())).toBe("Interior");
  await expect(page.locator("#breadcrumb")).toContainText("routes.ts");
  await page.keyboard.press("e");
  await expect.poll(() => page.evaluate(() => window.__CQ__?.getScene())).toBe("Region");
  expect(await page.evaluate(() => window.__CQ__?.getPlayer())).toEqual({
    x: (building.door.x + 0.5) * 16,
    y: (building.door.y + 0.5) * 16,
  });
  expect(errors).toEqual([]);
  await page.getByRole("button", { name: "Interact · E" }).click();
  await expect.poll(() => page.evaluate(() => window.__CQ__?.getScene())).toBe("Interior");
});
test("gamepad left stick moves the player and its deadzone prevents drift", async ({ page }) => {
  await page.addInitScript(() => {
    const pad = {
      id: "CQ synthetic standard pad",
      index: 0,
      connected: true,
      mapping: "standard",
      axes: [0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      get timestamp() {
        return performance.now();
      },
      vibrationActuator: null,
    };
    Object.defineProperty(navigator, "getGamepads", { value: () => [pad] });
    (window as unknown as { cqTestPad: typeof pad }).cqTestPad = pad;
  });
  await start(page);
  await page.evaluate((id) => window.__CQ__?.enterBuilding(id), building.id);
  const before = required(await page.evaluate(() => window.__CQ__?.getPlayer()));
  await page.evaluate(() => {
    (window as unknown as { cqTestPad: { axes: number[] } }).cqTestPad.axes = [0.8, 0];
  });
  await page.waitForTimeout(350);
  const after = required(await page.evaluate(() => window.__CQ__?.getPlayer()));
  expect(after.x).toBeGreaterThan(before.x + 10);
  await page.evaluate(() => {
    (window as unknown as { cqTestPad: { axes: number[] } }).cqTestPad.axes = [0.1, 0];
  });
  await page.waitForTimeout(100);
  const stopped = required(await page.evaluate(() => window.__CQ__?.getPlayer()));
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__CQ__?.getPlayer())).toEqual(stopped);
});
test("reveals fog along a twenty-tile walk and accepts click-to-move", async ({ page }) => {
  await start(page);
  await region(page);
  const map = required(world.maps.find((m) => m.id === port.mapId));
  const startAt = port.spawn;
  const candidates = world.buildings
    .filter((b) => b.regionId === port.id)
    .map((b) => findPath(map, startAt, b.door))
    .sort((a, b) => b.length - a.length);
  const path = required(candidates[0]);
  expect(path.length).toBeGreaterThan(20);
  const before = await page.evaluate(() => window.__CQ__?.getFogSeenRatio());
  for (const p of path.slice(0, 22)) {
    const at = required(await page.evaluate(() => window.__CQ__?.getPlayer()));
    const dx = (p.x + 0.5) * 16 - at.x,
      dy = (p.y + 0.5) * 16 - at.y;
    if (Math.abs(dx) > 1)
      await page.evaluate(async ({ key, ms }) => window.__CQ__?.pressKey(key, ms), {
        key: dx > 0 ? "d" : "a",
        ms: (Math.abs(dx) / 80) * 1000,
      });
    if (Math.abs(dy) > 1)
      await page.evaluate(async ({ key, ms }) => window.__CQ__?.pressKey(key, ms), {
        key: dy > 0 ? "s" : "w",
        ms: (Math.abs(dy) / 80) * 1000,
      });
  }
  expect(await page.evaluate(() => window.__CQ__?.getFogSeenRatio())).toBeGreaterThan(before ?? 0);
  // Teleport to a stable street tile, then use a real pointer click to walk three tiles.
  const goal = required(path[3]),
    origin = required(path[0]);
  await page.evaluate((p) => window.__CQ__?.teleport((p.x + 0.5) * 16, (p.y + 0.5) * 16), origin);
  await page.waitForTimeout(200);
  const camera = required(await page.evaluate(() => window.__CQ__?.getCamera())),
    box = await page.locator("#game canvas").boundingBox();
  if (!box) throw new Error("Canvas missing");
  const screenX = ((goal.x + 0.5) * 16 - camera.scrollX - camera.width / 2) * camera.zoom + camera.width / 2;
  const screenY = ((goal.y + 0.5) * 16 - camera.scrollY - camera.height / 2) * camera.zoom + camera.height / 2;
  await page.mouse.click(box.x + (screenX * box.width) / camera.width, box.y + (screenY * box.height) / camera.height);
  await expect
    .poll(
      async () => {
        const p = required(await page.evaluate(() => window.__CQ__?.getPlayer()));
        return Math.hypot(p.x - (goal.x + 0.5) * 16, p.y - (goal.y + 0.5) * 16);
      },
      { timeout: 6000 },
    )
    .toBeLessThan(3);
});
test("map, pause and controls work keyboard-only and pass axe", async ({ page }) => {
  await page.goto("/?world=fixtures/tiny-ts");
  await expect(page.getByRole("button", { name: "Enter the kingdom" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__CQ__?.getScene())).toBe("Overworld");
  await page.keyboard.press("m");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.keyboard.press("F3");
  await expect(page.locator("#explore-debug")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Paused", exact: true })).toBeVisible();
  await page.getByLabel("Use system font for map labels").check();
  await page.getByRole("button", { name: "Return to world" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test("overworld, region and interior visual regression", async ({ page }) => {
  // Reduced motion freezes idle NPC behaviors, so frames are deterministic.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(page);
  await expect(page.locator("main")).toHaveScreenshot("overworld.png", { maxDiffPixelRatio: 0.015 });
  await region(page);
  await page.waitForTimeout(300);
  await expect(page.locator("main")).toHaveScreenshot("region.png", { maxDiffPixelRatio: 0.015 });
  await page.evaluate((id) => window.__CQ__?.enterBuilding(id), building.id);
  await page.waitForTimeout(300);
  await expect(page.locator("main")).toHaveScreenshot("interior.png", { maxDiffPixelRatio: 0.015 });
});
test("shows an actionable load error instead of a blank game", async ({ page }) => {
  await page.goto("/?world=/does-not-exist.json");
  await expect(page.getByRole("heading", { name: "Could not load this world" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});
test("2000-building stress world has bounded chunks and a recorded frame budget", async ({ page }, testInfo) => {
  test.setTimeout(60000);
  await start(page, "stress");
  const stress = await (await page.request.get("/fixtures/stress/world.json")).json();
  const largest = [...stress.regions].sort((a, b) => b.fileIds.length - a.fileIds.length)[0];
  expect(await page.evaluate(() => window.__CQ__?.getWorldSummary().buildings)).toBe(2000);
  await page.evaluate((id) => window.__CQ__?.gotoRegion(id), largest.id);
  await page.keyboard.down("Shift");
  await page.keyboard.down("d");
  await page.waitForTimeout(3000);
  await page.keyboard.up("d");
  await page.keyboard.up("Shift");
  const stats = required(await page.evaluate(() => window.__CQ__?.getFrameStats()));
  await testInfo.attach("frame-budget", { body: JSON.stringify(stats), contentType: "application/json" });
  console.log(`Stress 2000 buildings: ${stats.averageMs.toFixed(2)} ms/frame (${stats.samples} samples)`);
  expect(stats.samples).toBeGreaterThan(60);
  expect(stats.chunks).toBeGreaterThan(0);
  expect(stats.chunks).toBeLessThanOrEqual(16);
  expect(stats.averageMs).toBeLessThan(40);
});
