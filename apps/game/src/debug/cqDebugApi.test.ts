import { describe, expect, it } from "vitest";
import pkg from "../../package.json" with { type: "json" };
import { VirtualKeys } from "../input/movement.ts";
import { createDebugApi, type PlayerHost } from "./cqDebugApi.ts";

function fakeScene(key: string, player?: { x: number; y: number }): object {
  const scene: Record<string, unknown> = { sys: { settings: { key } } };
  if (player !== undefined) {
    const host: PlayerHost = {
      getPlayerPosition: () => ({ ...player }),
      teleportPlayer: (x, y) => {
        player.x = x;
        player.y = y;
      },
    };
    Object.assign(scene, host);
  }
  return scene;
}

function fakeGame(scenes: object[]) {
  return { scene: { getScenes: () => scenes } };
}

describe("window.__CQ__ debug API", () => {
  it("reports the version and the topmost active scene", () => {
    const api = createDebugApi(fakeGame([fakeScene("Boot"), fakeScene("Test")]), new VirtualKeys());
    expect(api.version).toBe(pkg.version);
    expect(api.getScene()).toBe("Test");
    expect(createDebugApi(fakeGame([]), new VirtualKeys()).getScene()).toBe("");
  });

  it("reads and moves the player", () => {
    const player = { x: 72, y: 168 };
    const api = createDebugApi(fakeGame([fakeScene("Test", player)]), new VirtualKeys());
    expect(api.getPlayer()).toEqual({ x: 72, y: 168 });
    api.teleport(100, 120);
    expect(api.getPlayer()).toEqual({ x: 100, y: 120 });
    expect(() => api.teleport(Number.NaN, 1)).toThrow();
  });

  it("fails clearly when there is no player", () => {
    const api = createDebugApi(fakeGame([fakeScene("Boot")]), new VirtualKeys());
    expect(() => api.getPlayer()).toThrow("No active scene has a player");
  });

  it("forwards pressKey to the virtual keys", async () => {
    const keys = new VirtualKeys();
    const api = createDebugApi(fakeGame([]), keys);
    const pressed = api.pressKey("d", 5);
    expect([...keys.held()]).toEqual(["right"]);
    await pressed;
    expect([...keys.held()]).toEqual([]);
  });
});
