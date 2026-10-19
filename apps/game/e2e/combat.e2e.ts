import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { monsterById } from "../src/prototype/bodies/index.ts";

async function open(page: Page, monster = "serpent") {
  await page.goto("/prototype/combat/");
  await expect(page.getByRole("heading", { name: "Know the code. Break the monster." })).toBeVisible();
  await page.getByLabel("Skip token animation").check();
  if (monster !== "serpent") await page.getByLabel("Encounter").selectOption(monster);
}
async function solve(page: Page, monster: string, action: string, cellId: string, questionId: string) {
  const q = monsterById(monster).questions.find((q) => q.id === questionId);
  if (!q) throw new Error(questionId);
  await page.locator(`[data-cell="${cellId}"]`).click();
  await page.getByRole("button", { name: new RegExp(action) }).click();
  await page.locator(".question").getByRole("button").nth(q.answer).click();
}
async function turn(page: Page) {
  await page.getByRole("button", { name: "E End turn" }).click();
  const reaction = page.locator(".question");
  if (await reaction.count()) await reaction.getByRole("button").first().click();
}
for (const monster of ["serpent", "mimic", "gatekeeper"])
  test(`wins ${monster} through real controls`, async ({ page }) => {
    await open(page, monster);
    if (monster === "serpent") {
      await solve(page, monster, "Sever", "c1", "sever-c1");
      await turn(page);
      await solve(page, monster, "Sever", "c3", "sever-c3");
      await turn(page);
      await solve(page, monster, "Sever", "c8", "sever-c8");
      await turn(page);
      await solve(page, monster, "Pierce Heart", "c10", "pierce-c10");
    } else if (monster === "mimic") {
      await solve(page, monster, "Compare Twins", "b4", "compare-row3");
      await turn(page);
      await solve(page, monster, "Pierce Heart", "a6", "pierce-a6");
      await turn(page);
      await solve(page, monster, "Pierce Heart", "b6", "pierce-b6");
    } else {
      await solve(page, monster, "Sever", "p2", "sever-p2");
      await turn(page);
      await solve(page, monster, "Pierce Heart", "p4", "pierce-p4");
    }
    await expect(page.getByRole("heading", { name: "Victory — the code is your map." })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
test("wrong answers and exit predictions reach defeat", async ({ page }) => {
  await open(page);
  await page.getByLabel("Difficulty").selectOption("expert");
  await page.locator('[data-cell="c1"]').click();
  await page.getByRole("button", { name: /Sever/ }).click();
  await page.locator(".question button").nth(1).click();
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: "E End turn" }).click();
    // Inputs cycle c2,c6,c5,c9: c10 is wrong for every one.
    await page
      .locator(".question")
      .getByRole("button", { name: /Heart c10/ })
      .click();
  }
  await expect(page.getByRole("heading", { name: "Defeat — take another look." })).toBeVisible();
});
test("wins a complete fight with keyboard only, including arrow navigation", async ({ page }) => {
  await page.goto("/prototype/combat/");
  // Reach encounter selector entirely by tabbing from the document.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Encounter")).toBeFocused();
  await page.keyboard.press("End");
  // Tab through difficulty, restart, onboarding, then first grid cell.
  for (
    let i = 0;
    i < 12 && !(await page.locator('[data-cell="p1"]').evaluate((el) => el === document.activeElement));
    i++
  )
    await page.keyboard.press("Tab");
  await expect(page.locator('[data-cell="p1"]')).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-cell="p2"]')).toBeFocused();
  await page.keyboard.press("3");
  await page.keyboard.press("2");
  await page.keyboard.press("e");
  // Focus returned to End Turn; shift-tab is unnecessary: arrow navigation
  // resumes by tabbing forward through skip animation, then back to the grid.
  await page.keyboard.press("Shift+Tab");
  // Navigate to p2 via only Tab keys (bounded to avoid hanging on regressions).
  for (
    let i = 0;
    i < 30 && !(await page.locator('[data-cell="p2"]').evaluate((el) => el === document.activeElement));
    i++
  )
    await page.keyboard.press("Tab");
  await expect(page.locator('[data-cell="p2"]')).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-cell="p4"]')).toBeFocused();
  await page.keyboard.press("5");
  await page.keyboard.press("1");
  await expect(page.getByRole("heading", { name: "Victory — the code is your map." })).toBeVisible();
});
test("reveals only read lines, summons a minion, and resumes flee damage", async ({ page }) => {
  await open(page, "gatekeeper");
  await expect(page.locator(".code-panel")).not.toContainText("const team = loadTeam");
  await page.getByRole("button", { name: /1 Read/ }).click();
  await expect(page.locator(".code-panel")).toContainText("const team = loadTeam");
  await expect(page.locator(".code-panel")).not.toContainText("if (!team");
  await turn(page);
  await turn(page);
  await expect(page.getByRole("heading", { name: "loadTeam", exact: true })).toBeVisible();
  await solve(page, "gatekeeper", "Sever", "p2", "sever-p2");
  await page.getByRole("button", { name: /Flee/ }).click();
  await page.getByRole("button", { name: "Fight again" }).click();
  await expect(page.locator('[data-cell="p2"]')).toHaveClass(/destroyed/);
});
test("combat questions pass axe and no answer key is attached to window", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /Sever/ }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => Object.keys(window).filter((k) => /cq|answer/i.test(k)))).toEqual([]);
});
test("Phaser loads all atlas frames, art page is accessible and pauses", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/prototype/art/");
  await expect(page.locator("#art-stage")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#art-stage")).not.toHaveAttribute("data-error");
  await page.getByRole("button", { name: "Pause animation" }).click();
  await expect(page.getByRole("button", { name: "Resume animation" })).toHaveAttribute("aria-pressed", "true");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("telegraphs an input, animates its path after prediction and allows skipping", async ({ page }) => {
  await page.goto("/prototype/combat/");
  await page.getByRole("button", { name: "E End turn" }).click();
  await expect(page.locator(".question")).toContainText("a task with no due date");
  await page
    .locator(".question")
    .getByRole("button", { name: /Heart c2/ })
    .click();
  await expect(page.locator(".token")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "E End turn" })).toBeDisabled();
  await page.getByRole("button", { name: "Skip animation now" }).click();
  await expect(page.locator(".token")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "E End turn" })).toBeEnabled();
  await expect(page.locator(".combat-log")).toContainText("Blocked!");
});
