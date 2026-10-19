import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { FactBookSchema } from "@codebase-quest/shared";
import { expect, type Page, test } from "@playwright/test";
import { required } from "../src/explore/required.ts";

const facts = FactBookSchema.parse(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../../packages/content/goldens/tiny-ts.facts.json", import.meta.url)),
      "utf8",
    ),
  ),
);
const saveTask = required(facts.symbols.find((s) => s.name === "saveTask"));

async function start(page: Page) {
  await page.goto("/?world=fixtures/tiny-ts");
  await page.getByRole("button", { name: "Enter the kingdom" }).click();
  await expect.poll(() => page.evaluate(() => window.__CQ__?.getScene())).toBe("Overworld");
}
test("cq_focus over the (mocked) bridge moves the game to the right character and opens its panel", async ({
  page,
}) => {
  await start(page);
  await page.evaluate(() => window.__CQ__?.bridgeReceive({ type: "hello", ok: true }));
  await page.evaluate(
    (id) => window.__CQ__?.bridgeReceive({ type: "focus", id: "f1", symbolId: id }),
    saveTask.symbolId,
  );
  await expect.poll(() => page.evaluate(() => window.__CQ__?.getLocation().buildingId)).toBe(saveTask.buildingId);
  await expect(page.locator("#code-panel").getByRole("heading", { name: "saveTask()" })).toBeVisible();
  const sent = required(await page.evaluate(() => window.__CQ__?.bridgeSent()));
  expect(sent).toContainEqual({ type: "focus", id: "f1", ok: true });
  // cq_player_state reads the same location.
  await page.evaluate(() => window.__CQ__?.bridgeReceive({ type: "playerState", id: "p1" }));
  const state = required((await page.evaluate(() => window.__CQ__?.bridgeSent()))?.find((m) => m.id === "p1"));
  expect(state).toMatchObject({
    type: "playerState",
    state: { scene: "Interior", buildingId: saveTask.buildingId, openPanel: "code", panelSymbol: saveTask.symbolId },
  });
  expect((state.state as { breadcrumb: string }).breadcrumb).toContain("tasks.ts");
  // Unknown symbols are refused, not obeyed.
  await page.evaluate(() => window.__CQ__?.bridgeReceive({ type: "focus", id: "f2", symbolId: "ffffffffffff" }));
  expect(await page.evaluate(() => window.__CQ__?.bridgeSent())).toContainEqual(
    expect.objectContaining({ type: "focus", id: "f2", ok: false }),
  );
});
test("Gitling answers by search with citations that open the right Code Panel", async ({ page }) => {
  await start(page);
  await page.keyboard.press("g");
  const panel = page.getByRole("dialog", { name: "Gitling" });
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("Ask Gitling about the code")).toBeFocused();
  await expect(panel).toContainText("AI is off: answers come from search");
  await page.keyboard.type("Where are tasks saved?");
  await page.keyboard.press("Enter");
  const answer = panel.locator('[data-level="search"]').last();
  await expect(answer).toContainText("These might help:");
  await expect(answer).toContainText("answered by: search");
  const citation = answer.getByRole("button", { name: /^saveTask\(\) · src\/db\/tasks\.ts:/ });
  await expect(citation).toBeVisible();
  expect((await new AxeBuilder({ page }).include("#gitling-panel").analyze()).violations).toEqual([]);
  // A live answer arrives later (already validated by `cq play`) and is labeled with its level.
  await page.evaluate(
    (s) =>
      window.__CQ__?.bridgeReceive({
        type: "gitlingQuestion",
        id: "g1",
        status: "answered",
        reply: {
          answer: "`saveTask` stores tasks in src/db/tasks.ts.",
          refs: [{ path: s.path, startLine: s.range.startLine, endLine: s.range.endLine }],
          level: "bridge",
        },
      }),
    saveTask,
  );
  await expect(panel.locator('[data-level="bridge"]')).toContainText("answered by: your agent (bridge)");
  await citation.click();
  await expect(page.locator("#code-panel").getByRole("heading", { name: "saveTask()" })).toBeVisible();
  await expect(panel).toBeHidden();
  const real = readFileSync(
    fileURLToPath(new URL("../../../fixtures/repos/tiny-ts/src/db/tasks.ts", import.meta.url)),
    "utf8",
  ).split("\n");
  await expect(page.locator("#code-panel .code-line code").first()).toHaveText(
    required(real[saveTask.range.startLine - 1]),
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#code-panel")).toBeHidden();
});
