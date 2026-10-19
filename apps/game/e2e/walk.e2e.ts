import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { TILE_SIZE } from "../src/config.ts";
import { SPAWN_TILE, tileCenter } from "../src/world/testMap.ts";

/** Half the width of the player's physics body (TestScene: setSize(10, 8)). */
const BODY_HALF_WIDTH = 5;
/** The interior wall east of the spawn starts at tile column 15. */
const WALL_LEFT_EDGE = 15 * TILE_SIZE;

async function openTestScene(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForFunction(() => window.__CQ__?.getScene() === "Test");
}

const player = (page: Page) => page.evaluate(() => window.__CQ__?.getPlayer());
const press = (page: Page, key: string, ms: number) =>
  page.evaluate(([k, t]) => window.__CQ__?.pressKey(k, t), [key, ms] as const);

test("opens the test scene with the player at the spawn", async ({ page }) => {
  await openTestScene(page);
  expect(await page.evaluate(() => window.__CQ__?.getScene())).toBe("Test");
  expect(await player(page)).toEqual(tileCenter(SPAWN_TILE.x, SPAWN_TILE.y));
});

test("walks right, then stops at a wall", async ({ page }) => {
  await openTestScene(page);
  const start = await player(page);
  if (start === undefined) throw new Error("debug API missing");

  await press(page, "ArrowRight", 500);
  const moved = await player(page);
  expect(moved?.x).toBeGreaterThan(start.x);
  expect(moved?.y).toBe(start.y);

  // Long enough to cover the whole distance to the wall at 80 px/s.
  await press(page, "ArrowRight", 2500);
  const atWall = await player(page);
  if (atWall === undefined) throw new Error("debug API missing");
  expect(atWall.x + BODY_HALF_WIDTH).toBeLessThanOrEqual(WALL_LEFT_EDGE);
  expect(atWall.x + BODY_HALF_WIDTH).toBeGreaterThan(WALL_LEFT_EDGE - 1);

  // Pushing on keeps the player against the wall.
  await press(page, "ArrowRight", 300);
  expect((await player(page))?.x).toBeCloseTo(atWall.x, 3);
});

test("moves with WASD and teleports through the debug API", async ({ page }) => {
  await openTestScene(page);
  const target = tileCenter(8, 6);
  await page.evaluate(([x, y]) => window.__CQ__?.teleport(x, y), [target.x, target.y] as const);
  expect(await player(page)).toEqual(target);

  await press(page, "s", 300);
  const after = await player(page);
  expect(after?.x).toBe(target.x);
  expect(after?.y).toBeGreaterThan(target.y);
});

test("real keyboard input moves the player", async ({ page }) => {
  await openTestScene(page);
  const start = await player(page);
  await page.locator("canvas").click();
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(300);
  await page.keyboard.up("ArrowDown");
  expect((await player(page))?.y).toBeGreaterThan(start?.y ?? Number.POSITIVE_INFINITY);
});

test("has no detectable accessibility violations", async ({ page }) => {
  await openTestScene(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
