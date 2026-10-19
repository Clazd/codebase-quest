import type { FactSheet, WorldMap } from "@codebase-quest/shared";
import type Phaser from "phaser";
import { walkable } from "../explore/navigation.ts";
import {
  BADGES,
  type BadgeId,
  type Behavior,
  badgesFor,
  baseFrame,
  behaviorFor,
  hasVisitors,
  npcRng,
  tintFor,
} from "./appearance.ts";
import type { NpcSpot } from "./layout.ts";

const TILE = 16;
/** Creates the 5×5 trait badge textures once per game. */
export function createBadgeTextures(scene: Phaser.Scene): void {
  for (const [id, badge] of Object.entries(BADGES)) {
    const key = `badge-${id}`;
    if (scene.textures.exists(key)) continue;
    const g = scene.make.graphics({}, false);
    g.fillStyle(0x101923, 1).fillRect(0, 0, 7, 7);
    g.fillStyle(badge.color, 1);
    badge.pixels.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === "1") g.fillRect(x + 1, y + 1, 1, 1);
    });
    g.generateTexture(key, 7, 7);
    g.destroy();
  }
}
/** One character: placeholder body, guild tint, trait badges, name tag and idle behavior. */
export class NpcEntity {
  readonly spot: NpcSpot;
  readonly sheet: FactSheet;
  readonly behavior: Behavior;
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly badges: Phaser.GameObjects.Image[];
  private readonly visitors: Phaser.GameObjects.Graphics | null;
  private tag: Phaser.GameObjects.Text | null = null;
  private readonly scene: Phaser.Scene;
  private readonly home: { x: number; y: number };
  private readonly route: { x: number; y: number }[];
  private readonly rng: () => number;
  private goal: { x: number; y: number } | null = null;
  private waitUntil = 0;
  private leg = 0;
  /** Logical position (feet); the drawn sprite may add an idle offset. */
  x: number;
  y: number;
  constructor(scene: Phaser.Scene, map: WorldMap, spot: NpcSpot, sheet: FactSheet) {
    this.scene = scene;
    this.spot = spot;
    this.sheet = sheet;
    this.behavior = behaviorFor(sheet);
    this.rng = npcRng(`${spot.npcId}:${spot.outdoor}`);
    this.home = { x: (spot.x + 0.5) * TILE, y: (spot.y + 0.5) * TILE };
    this.x = this.home.x;
    this.y = this.home.y;
    this.sprite = scene.add
      .sprite(this.x, this.y, "world-tiles", baseFrame(sheet))
      .setDepth(6)
      .setTint(tintFor(sheet))
      .setInteractive({ useHandCursor: true });
    this.sprite.setData("symbolId", sheet.symbolId);
    if (sheet.traits.includes("deprecated")) this.sprite.setAlpha(0.6);
    else if (this.behavior === "alone") this.sprite.setAlpha(0.75);
    this.badges = badgesFor(sheet)
      .slice(0, 3)
      .map((id: BadgeId) => scene.add.image(0, 0, `badge-${id}`).setDepth(7));
    this.visitors = hasVisitors(sheet) ? scene.add.graphics().setDepth(5) : null;
    this.route = this.behavior === "brisk" ? [this.home, this.errandPoint(map)] : [this.home];
    this.place(0, 0);
  }
  /** Brisk walkers pace between home and the furthest straight walkable tile within three. */
  private errandPoint(map: WorldMap) {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      let reach = 0;
      for (let i = 1; i <= 3 && walkable(map, this.spot.x + dx * i, this.spot.y + dy * i); i++) reach = i;
      if (reach >= 2) return { x: this.home.x + dx * reach * TILE, y: this.home.y + dy * reach * TILE };
    }
    return this.home;
  }
  private wanderPoint(map: WorldMap) {
    const dir = Math.floor(this.rng() * 5),
      steps = 1 + Math.floor(this.rng() * 2);
    if (dir === 4) return this.home;
    const [dx, dy] = (
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const
    )[dir] ?? [0, 0];
    for (let i = 1; i <= steps; i++) if (!walkable(map, this.spot.x + dx * i, this.spot.y + dy * i)) return this.home;
    return { x: this.home.x + dx * steps * TILE, y: this.home.y + dy * steps * TILE };
  }
  private moveToward(goal: { x: number; y: number }, speed: number, delta: number): boolean {
    const dx = goal.x - this.x,
      dy = goal.y - this.y,
      d = Math.hypot(dx, dy),
      step = (speed * delta) / 1000;
    if (d <= step) {
      this.x = goal.x;
      this.y = goal.y;
      return true;
    }
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
    if (dx) this.sprite.setFlipX(dx < 0);
    return false;
  }
  update(time: number, delta: number, map: WorldMap, animate: boolean): void {
    let ox = 0,
      oy = 0;
    if (!animate) {
      this.x = this.home.x;
      this.y = this.home.y;
    } else if (this.behavior === "brisk") {
      const goal = this.route[(this.leg + 1) % this.route.length] ?? this.home;
      if (time >= this.waitUntil && this.moveToward(goal, 42, delta)) {
        this.leg = (this.leg + 1) % this.route.length;
        this.waitUntil = time + 350;
      }
    } else if (this.behavior === "wander") {
      if (time >= this.waitUntil) {
        this.goal ??= this.wanderPoint(map);
        if (this.moveToward(this.goal, 20, delta)) {
          this.goal = null;
          this.waitUntil = time + 1500 + this.rng() * 2500;
        }
      }
    } else if (this.behavior === "busy") {
      ox = Math.round(Math.sin(time / 70));
      oy = -Math.abs(Math.round(Math.sin(time / 140) * 1.5));
    } else if (this.behavior === "meditate") {
      this.sprite.setAlpha(0.82 + 0.18 * Math.sin(time / 650));
    } else if (this.behavior === "stand") {
      oy = time % 3200 < 200 ? -1 : 0;
    }
    this.place(ox, oy);
    if (this.visitors) {
      this.visitors.clear().fillStyle(0xfff1a1, 0.9);
      for (let i = 0; i < 3; i++) {
        const a = (animate ? time / 900 : 0) + (i * Math.PI * 2) / 3;
        this.visitors.fillCircle(this.x + Math.cos(a) * 11, this.y + 3 + Math.sin(a) * 5, 1.5);
      }
    }
  }
  private place(ox: number, oy: number) {
    this.sprite.setPosition(this.x + ox, this.y + oy);
    const top = this.y + oy - 12;
    this.badges.forEach((b, i) => {
      b.setPosition(this.x + ox + (i - (this.badges.length - 1) / 2) * 8, top);
    });
    this.tag?.setPosition(this.x + ox, top - (this.badges.length ? 6 : 0));
  }
  setShown(shown: boolean) {
    this.sprite.setVisible(shown);
    for (const b of this.badges) b.setVisible(shown);
    this.visitors?.setVisible(shown);
    if (!shown) this.tag?.setVisible(false);
  }
  /** The name tag appears on approach: `createTask()`, `class TaskService`. */
  showTag(show: boolean, font: string) {
    if (show && !this.tag) {
      const name = this.sheet.displayName;
      this.tag = this.scene.add
        .text(this.x, this.y - 12, name.length > 30 ? `${name.slice(0, 29)}…` : name, {
          fontFamily: font,
          fontSize: "8px",
          color: "#fff4d6",
          backgroundColor: "#16232de8",
          padding: { x: 2, y: 1 },
        })
        .setOrigin(0.5, 1)
        .setDepth(9);
      this.place(0, 0);
    }
    this.tag?.setVisible(show);
  }
  get tileX() {
    return Math.floor(this.x / TILE);
  }
  get tileY() {
    return Math.floor(this.y / TILE);
  }
  destroy() {
    this.sprite.destroy();
    for (const b of this.badges) b.destroy();
    this.visitors?.destroy();
    this.tag?.destroy();
  }
}
