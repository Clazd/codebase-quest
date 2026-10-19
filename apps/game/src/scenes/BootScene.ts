import { tinyDungeon } from "@codebase-quest/assets";
import tilesUrl from "@codebase-quest/assets/kenney/tiny-dungeon/tilemap_packed.png";
import Phaser from "phaser";
import { TILES_KEY } from "../config.ts";
import { TestScene } from "./TestScene.ts";

/** Loads the shared assets, then starts the test scene. */
export class BootScene extends Phaser.Scene {
  static readonly KEY = "Boot";

  constructor() {
    super(BootScene.KEY);
  }

  preload(): void {
    this.load.spritesheet(TILES_KEY, tilesUrl, {
      frameWidth: tinyDungeon.tileSize,
      frameHeight: tinyDungeon.tileSize,
    });
  }

  create(): void {
    this.scene.start(TestScene.KEY);
  }
}
