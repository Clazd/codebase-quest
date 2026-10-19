import type { WorldMap } from "@codebase-quest/shared";
import type Phaser from "phaser";
import { walkable } from "../explore/navigation.ts";
import { npcRng } from "../npc/appearance.ts";
import type { EncounterIndex } from "./controller.ts";

const TILE = 16;
/** Placeholder bodies per Bestiary kind (Kenney Tiny Dungeon frames). */
export const MONSTER_FRAMES: Record<string, number> = {
  gremlin: 124,
  serpent: 110,
  mimic: 92,
  mutant: 109,
  ghost: 121,
  wisp: 108,
  minotaur: 111,
  imp: 120,
  wraith: 121,
  shapeshifter: 122,
  echo: 123,
  shadow: 111,
  golem: 98,
  titan: 96,
  ouroboros: 122,
};
const TINTS: Record<string, number> = {
  shadow: 0x6a6a8a,
  wraith: 0xb0a0d0,
  wisp: 0xc8f0ff,
  golem: 0xb0b0b0,
  titan: 0xd0a070,
};
export type MonsterMode = "patrol" | "aggro" | "stunned" | "tamed" | "sealed";
export const AGGRO_TILES = 3.5;
export const SNEAK_AGGRO_TILES = 1.5;
/** One monster in the world: patrols near its spawn, notices the player, chases, or rests tamed. */
export class MonsterEntity {
  readonly entry: EncounterIndex[number];
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly alert: Phaser.GameObjects.Text;
  private readonly home: { x: number; y: number };
  private readonly rng: () => number;
  private goal: { x: number; y: number } | null = null;
  private waitUntil = 0;
  private stunnedUntil = 0;
  mode: MonsterMode;
  x: number;
  y: number;
  constructor(scene: Phaser.Scene, entry: EncounterIndex[number], tamed: boolean) {
    this.entry = entry;
    this.home = { x: (entry.position.x + 0.5) * TILE, y: (entry.position.y + 0.5) * TILE };
    this.x = this.home.x;
    this.y = this.home.y;
    this.rng = npcRng(entry.id);
    this.mode = !entry.fightable ? "sealed" : tamed ? "tamed" : "patrol";
    this.sprite = scene.add
      .sprite(this.x, this.y, "world-tiles", MONSTER_FRAMES[entry.kind] ?? 110)
      .setDepth(6)
      .setInteractive({ useHandCursor: true });
    this.sprite.setData("monsterId", entry.id);
    const tint = TINTS[entry.kind];
    if (tint) this.sprite.setTint(tint);
    this.alert = scene.add
      .text(this.x, this.y - 12, "!", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#ffdc87",
        backgroundColor: "#16232de8",
        padding: { x: 2, y: 0 },
      })
      .setOrigin(0.5, 1)
      .setDepth(9)
      .setVisible(false);
    this.applyMode();
  }
  private applyMode() {
    this.sprite.setAlpha(this.mode === "tamed" ? 0.9 : this.mode === "sealed" ? 0.7 : 1);
    if (this.mode === "tamed") this.sprite.setTint(0xc3f0b0);
    this.alert.setText(this.mode === "sealed" ? "zZ" : this.mode === "tamed" ? "♥" : "!");
  }
  tame() {
    this.mode = "tamed";
    this.x = this.home.x;
    this.y = this.home.y;
    this.applyMode();
  }
  stun(now: number, ms = 5000) {
    if (this.mode === "tamed" || this.mode === "sealed") return;
    this.mode = "stunned";
    this.stunnedUntil = now + ms;
    this.x = this.home.x;
    this.y = this.home.y;
  }
  private moveToward(goal: { x: number; y: number }, speed: number, delta: number, map: WorldMap): boolean {
    const dx = goal.x - this.x,
      dy = goal.y - this.y,
      d = Math.hypot(dx, dy),
      step = (speed * delta) / 1000;
    if (d <= step) {
      this.x = goal.x;
      this.y = goal.y;
      return true;
    }
    const nx = this.x + (dx / d) * step,
      ny = this.y + (dy / d) * step;
    if (!walkable(map, Math.floor(nx / TILE), Math.floor(ny / TILE))) return true;
    this.x = nx;
    this.y = ny;
    if (dx) this.sprite.setFlipX(dx < 0);
    return false;
  }
  /** Returns true when the monster touches the player (a fight starts). */
  update(
    time: number,
    delta: number,
    map: WorldMap,
    player: { x: number; y: number },
    sneaking: boolean,
    animate: boolean,
  ): boolean {
    if (this.mode === "stunned" && time >= this.stunnedUntil) this.mode = "patrol";
    const distance = Math.hypot(player.x - this.x, player.y - this.y);
    if (this.mode === "patrol" || this.mode === "aggro") {
      const range = (sneaking ? SNEAK_AGGRO_TILES : AGGRO_TILES) * TILE;
      this.mode = distance <= range ? "aggro" : this.mode === "aggro" && distance <= range * 1.6 ? "aggro" : "patrol";
    }
    this.alert.setVisible(this.mode !== "patrol" && this.mode !== "stunned");
    if (this.mode === "aggro") {
      this.moveToward(player, 52, delta, map);
      if (Math.hypot(player.x - this.x, player.y - this.y) <= 12) return true;
    } else if (
      (this.mode === "patrol" || this.mode === "stunned" || this.mode === "tamed") &&
      animate &&
      time >= this.waitUntil
    ) {
      if (!this.goal) {
        const r = 3;
        const tx = Math.floor(this.home.x / TILE) + Math.floor(this.rng() * (2 * r + 1)) - r,
          ty = Math.floor(this.home.y / TILE) + Math.floor(this.rng() * (2 * r + 1)) - r;
        this.goal = walkable(map, tx, ty) ? { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE } : this.home;
      }
      if (this.moveToward(this.goal, this.mode === "tamed" ? 16 : 24, delta, map)) {
        this.goal = null;
        this.waitUntil = time + 1200 + this.rng() * 2000;
      }
    }
    this.sprite.setPosition(this.x, this.y);
    this.alert.setPosition(this.x, this.y - 10);
    return false;
  }
  setShown(shown: boolean) {
    this.sprite.setVisible(shown);
    if (!shown) this.alert.setVisible(false);
  }
  get tileX() {
    return Math.floor(this.x / TILE);
  }
  get tileY() {
    return Math.floor(this.y / TILE);
  }
  destroy() {
    this.sprite.destroy();
    this.alert.destroy();
  }
}
