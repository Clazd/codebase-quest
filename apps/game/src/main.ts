import Phaser from "phaser";
import { VIEW_HEIGHT, VIEW_WIDTH, ZOOM } from "./config.ts";
import { createDebugApi } from "./debug/cqDebugApi.ts";
import { VirtualKeys } from "./input/movement.ts";
import { BootScene } from "./scenes/BootScene.ts";
import { TestScene } from "./scenes/TestScene.ts";

const virtualKeys = new VirtualKeys();

const world = new URLSearchParams(location.search).get("world");
if (world) {
  const url = world.startsWith("fixtures/")
    ? __CQ_DEBUG__
      ? `/fixtures/${world.slice(9)}/world.json`
      : ""
    : new URL(world, location.href).href;
  const { startExplorer } = await import("./explore/game.ts");
  try {
    if (!url) throw new Error("Fixture worlds are available only in development and test builds");
    if (new URL(url, location.href).origin !== location.origin)
      throw new Error("World must be served by this local server");
    const app = await startExplorer(new URL(url, location.href).href, virtualKeys);
    document
      .querySelector("#game")
      ?.setAttribute(
        "aria-label",
        "Explore your repository. WASD or arrows to walk, Shift to run, E to interact, M for map, Escape to pause.",
      );
    if (__CQ_DEBUG__) {
      window.__CQ__ = {
        ...createDebugApi(app.game, virtualKeys),
        getScene: () => app.active?.sys.settings.key ?? "Title",
        getWorldSummary: () => ({
          regions: app.session.world.regions.length,
          buildings: app.session.world.buildings.length,
          npcs: app.session.world.npcs.length,
        }),
        getLocation: () => ({
          scene: app.active?.sys.settings.key ?? "Title",
          regionId: app.session.region?.id,
          buildingId: app.session.building?.id,
          breadcrumb: app.session.breadcrumb,
        }),
        gotoRegion: async (id: string) => {
          const r = app.session.world.regions.find((r) => r.id === id);
          if (!r) throw new Error("Unknown region");
          await app.go(r.spawn);
        },
        enterBuilding: async (id: string) => {
          const interior = app.session.world.interiors.find((i) => i.buildingId === id);
          if (!interior) throw new Error("Unknown building");
          await app.go(interior.entrance);
        },
        getFogSeenRatio: () => app.session.ratio(),
        getFrameStats: () => ({
          chunks: app.active?.chunkCount ?? 0,
          samples: app.frames.length,
          averageMs: app.frames.reduce((a, b) => a + b, 0) / Math.max(1, app.frames.length),
        }),
        getCamera: () => {
          const c = app.active?.cameras.main;
          return {
            scrollX: c?.scrollX ?? 0,
            scrollY: c?.scrollY ?? 0,
            zoom: c?.zoom ?? 1,
            width: c?.width ?? 0,
            height: c?.height ?? 0,
          };
        },
      };
    }
  } catch (error) {
    const panel = document.createElement("section");
    panel.id = "explore-error";
    panel.setAttribute("role", "alert");
    const title = document.createElement("h1");
    title.textContent = "Could not load this world";
    const detail = document.createElement("p");
    detail.textContent = error instanceof Error ? error.message : String(error);
    const retry = document.createElement("button");
    retry.textContent = "Retry";
    retry.onclick = () => location.reload();
    panel.append(title, detail, retry);
    document.querySelector("main")?.append(panel);
  }
} else {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: "#1b1b24",
    pixelArt: true,
    scale: { width: VIEW_WIDTH, height: VIEW_HEIGHT, zoom: ZOOM },
    physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 } } },
    scene: [new BootScene(), new TestScene(virtualKeys)],
  });

  if (__CQ_DEBUG__) {
    window.__CQ__ = createDebugApi(game, virtualKeys);
  }
}
