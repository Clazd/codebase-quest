import { tinyDungeon } from "@codebase-quest/assets";
import Phaser from "phaser";
import { PLAYER_SPEED, TILE_SIZE, TILES_KEY } from "../config.ts";
import type { PlayerHost } from "../debug/cqDebugApi.ts";
import { type Direction, type VirtualKeys, velocityFor } from "../input/movement.ts";
import { buildTestMap, isFloorVariant, SPAWN_TILE, Tile, tileCenter } from "../world/testMap.ts";

const { frames } = tinyDungeon;

/** Phase 00 test scene: a 30×20 tile map, a 4-direction player, wall collisions, camera follow. */
export class TestScene extends Phaser.Scene implements PlayerHost {
  static readonly KEY = "Test";

  private readonly virtualKeys: VirtualKeys;
  private player!: Phaser.Physics.Arcade.Sprite;
  private keys!: Record<Direction, Phaser.Input.Keyboard.Key[]>;

  constructor(virtualKeys: VirtualKeys) {
    super(TestScene.KEY);
    this.virtualKeys = virtualKeys;
  }

  create(): void {
    const data = buildTestMap().map((row, y) =>
      row.map((tile, x) => {
        if (tile === Tile.Wall) return frames.wall;
        return isFloorVariant(x, y) ? frames.floorAlt : frames.floor;
      }),
    );
    const map = this.make.tilemap({ data, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const tileset = map.addTilesetImage(TILES_KEY, TILES_KEY);
    if (tileset === null) throw new Error("Tileset failed to load");
    const layer = map.createLayer(0, tileset, 0, 0) as Phaser.Tilemaps.TilemapLayer | null;
    if (layer === null) throw new Error("Tile layer failed to load");
    layer.setCollision(frames.wall);

    const spawn = tileCenter(SPAWN_TILE.x, SPAWN_TILE.y);
    this.player = this.physics.add.sprite(spawn.x, spawn.y, TILES_KEY, frames.hero);
    // A smaller body at the feet makes walking past walls feel natural.
    this.player.setSize(10, 8).setOffset(3, 8);
    this.player.setCollideWorldBounds(true);
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.physics.add.collider(this.player, layer);

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.player, true);

    const keyboard = this.input.keyboard;
    if (keyboard === null) throw new Error("Keyboard input is not available");
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: [keyboard.addKey(K.UP), keyboard.addKey(K.W)],
      down: [keyboard.addKey(K.DOWN), keyboard.addKey(K.S)],
      left: [keyboard.addKey(K.LEFT), keyboard.addKey(K.A)],
      right: [keyboard.addKey(K.RIGHT), keyboard.addKey(K.D)],
    };
  }

  override update(): void {
    const held = new Set<Direction>(this.virtualKeys.held());
    for (const [direction, keys] of Object.entries(this.keys) as [Direction, Phaser.Input.Keyboard.Key[]][]) {
      if (keys.some((key) => key.isDown)) held.add(direction);
    }
    const velocity = velocityFor(held, PLAYER_SPEED);
    this.player.setVelocity(velocity.x, velocity.y);
    if (velocity.x !== 0) this.player.setFlipX(velocity.x < 0);
  }

  getPlayerPosition(): { x: number; y: number } {
    return { x: this.player.x, y: this.player.y };
  }

  teleportPlayer(x: number, y: number): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.reset(x, y);
  }
}
