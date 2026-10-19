import Phaser from "phaser";
import { VIEW_HEIGHT, VIEW_WIDTH, ZOOM } from "./config.ts";
import { createDebugApi } from "./debug/cqDebugApi.ts";
import { VirtualKeys } from "./input/movement.ts";
import { BootScene } from "./scenes/BootScene.ts";
import { TestScene } from "./scenes/TestScene.ts";

const virtualKeys = new VirtualKeys();

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
