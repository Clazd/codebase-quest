import { expect, test } from "@playwright/test";

test("headless Phaser parses a generated Tiled map", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/prototype/worldgen-smoke/");
  const status = page.locator("#status");
  await expect(status).toHaveAttribute("data-ready", "true");
  await expect(status).toHaveAttribute("data-width", "112");
  await expect(status).toHaveAttribute("data-height", "80");
  await expect(status).toHaveAttribute("data-layers", /ground,decor,collision/);
  expect(errors).toEqual([]);
});
