import type { WorldPosition } from "@codebase-quest/shared";
import Phaser from "phaser";
import type { VirtualKeys } from "../input/movement.ts";
import { ExploreHud } from "./hud.ts";
import { assetUrl, type TiledMap, WorldLoader } from "./loader.ts";
import { BINDINGS, direction, findPath, move, type Point, visibleChunks, walkable } from "./navigation.ts";
import { required } from "./required.ts";
import { ExploreSession } from "./session.ts";
import "./explore.css";

const TEXTURE = "world-tiles";
const SCENE_KEYS = { overworld: "Overworld", region: "Region", interior: "Interior" } as const;
type Chunk = { map: Phaser.Tilemaps.Tilemap; layers: Phaser.Tilemaps.TilemapLayer[] };
export class Explorer {
  readonly session: ExploreSession;
  readonly hud: ExploreHud;
  readonly held = new Set<string>();
  game!: Phaser.Game;
  active: MapScene | undefined;
  loading = false;
  sceneSerial = 0;
  zoom = 1.5;
  message = "Find a blue gate, then press E to enter.";
  private tiled: TiledMap | undefined;
  private position: WorldPosition | undefined;
  readonly frames: number[] = [];
  readonly loader: WorldLoader;
  readonly virtualKeys: VirtualKeys;
  constructor(loader: WorldLoader, virtualKeys: VirtualKeys) {
    this.loader = loader;
    this.virtualKeys = virtualKeys;
    this.session = new ExploreSession(loader.world);
    this.hud = new ExploreHud(this.session, {
      start: () => {
        void this.go(this.session.world.kingdom.gate).catch(() => {});
      },
      interact: () => this.interact(),
      zoom: (d) => this.changeZoom(d),
    });
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || this.hud.title) return;
      if (event.repeat && ["m", "M", "F3", "Escape", "e", "E", "Enter", " "].includes(event.key)) return;
      if (BINDINGS.map.includes(event.key as "m")) {
        event.preventDefault();
        this.held.clear();
        this.hud.toggleMap();
        return;
      }
      if (BINDINGS.pause.includes(event.key as "Escape")) {
        event.preventDefault();
        this.held.clear();
        this.hud.togglePause();
        return;
      }
      if (BINDINGS.debug.includes(event.key as "F3")) {
        event.preventDefault();
        this.hud.debugOpen = !this.hud.debugOpen;
        return;
      }
      if (this.hud.blocked) return;
      if (BINDINGS.interact.includes(event.key as "e")) {
        event.preventDefault();
        this.interact();
        return;
      }
      if (Object.values(BINDINGS).some((keys) => (keys as readonly string[]).includes(event.key))) {
        event.preventDefault();
        this.held.add(event.key);
      }
    };
    const keyup = (e: KeyboardEvent) => this.held.delete(e.key),
      blur = () => this.held.clear();
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", blur);
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game",
      backgroundColor: "#15232d",
      pixelArt: true,
      scale: { mode: Phaser.Scale.RESIZE, width: 960, height: 560 },
      input: { gamepad: true },
      scene: [
        new PreloadScene(this),
        new TitleScene(),
        new MapScene("Overworld", this),
        new MapScene("Region", this),
        new MapScene("Interior", this),
        new HudScene(),
      ],
      callbacks: {
        postBoot: (game) =>
          game.events.once("destroy", () => {
            window.removeEventListener("keydown", keydown);
            window.removeEventListener("keyup", keyup);
            window.removeEventListener("blur", blur);
            this.hud.root.remove();
          }),
      },
    });
  }
  changeZoom(delta: number) {
    const levels = [1, 1.5, 2],
      index = levels.indexOf(this.zoom);
    this.zoom = required(levels[Math.max(0, Math.min(2, index + Math.sign(delta)))]);
    this.active?.cameras.main.setZoom(this.zoom);
  }
  async go(p: WorldPosition): Promise<void> {
    if (this.loading) return;
    const map = this.session.maps.get(p.mapId);
    if (!map || !walkable(map, p.x, p.y)) throw new Error("Destination is blocked or missing");
    this.loading = true;
    this.held.clear();
    this.active?.stopPath();
    try {
      const tiled = await this.loader.map(map);
      this.tiled = tiled;
      this.position = p;
      const old = this.active;
      old?.cameras.main.fadeOut(90, 16, 25, 35);
      if (old) await new Promise((resolve) => setTimeout(resolve, 95));
      this.session.setPosition(p);
      old?.scene.stop();
      this.game.scene.stop("Title");
      const serial = this.sceneSerial;
      this.game.scene.start(SCENE_KEYS[map.kind]);
      await new Promise<void>((resolve) => {
        const poll = () => {
          if (this.sceneSerial > serial && this.active?.sys.isActive()) resolve();
          else setTimeout(poll, 10);
        };
        poll();
      });
    } catch (error) {
      this.message = `Could not enter map: ${error instanceof Error ? error.message : String(error)}`;
      this.active?.cameras.main.resetFX();
      this.hud.status.textContent = this.message;
      if (!this.active) this.hud.retryTitle();
      throw error;
    } finally {
      this.loading = false;
    }
  }
  sceneData() {
    if (!this.tiled || !this.position) throw new Error("No map loaded");
    return { tiled: this.tiled, position: this.position };
  }
  interact() {
    if (this.loading || this.hud.blocked) return;
    const t = this.session.nearbyTransition();
    if (t) void this.go(t.to).catch(() => {});
    else this.message = "Walk closer to a blue gate or building door.";
  }
}
class PreloadScene extends Phaser.Scene {
  private failed = false;
  private readonly app: Explorer;
  constructor(app: Explorer) {
    super("Preload");
    this.app = app;
  }
  preload() {
    this.load.spritesheet(TEXTURE, assetUrl(this.app.loader.world.theme.image, this.app.loader.url), {
      frameWidth: 16,
      frameHeight: 16,
    });
    this.load.on("loaderror", () => {
      this.failed = true;
      this.app.hud.status.textContent = "Tileset failed to load. Check the local world assets and reload.";
    });
  }
  create() {
    if (this.failed) {
      this.app.hud.assetFailure();
      return;
    }
    this.scene.launch("HUD");
    this.scene.start("Title");
    this.app.hud.ready();
  }
}
class TitleScene extends Phaser.Scene {
  constructor() {
    super("Title");
  }
}
class HudScene extends Phaser.Scene {
  constructor() {
    super("HUD");
  }
}
export class MapScene extends Phaser.Scene {
  get chunkCount() {
    return this.chunks.size;
  }
  private player!: Phaser.GameObjects.Sprite;
  private fog!: Phaser.GameObjects.Graphics;
  private markers!: Phaser.GameObjects.Graphics;
  private chunks = new Map<string, Chunk>();
  private path: Point[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private nextHud = 0;
  private chunkStamp = "";
  private tiled!: TiledMap;
  private readonly app: Explorer;
  constructor(key: string, app: Explorer) {
    super(key);
    this.app = app;
  }
  create() {
    const { tiled, position } = this.app.sceneData();
    this.tiled = tiled;
    this.chunks = new Map();
    this.labels = [];
    this.chunkStamp = "";
    this.nextHud = 0;
    this.path = [];
    const map = this.app.session.map;
    this.player = this.add.sprite((position.x + 0.5) * 16, (position.y + 0.5) * 16, TEXTURE, 85).setDepth(8);
    this.fog = this.add.graphics().setDepth(4);
    this.markers = this.add.graphics().setDepth(5);
    this.cameras.main
      .setBounds(0, 0, map.width * 16, map.height * 16)
      .setZoom(this.app.zoom)
      .startFollow(this.player, false)
      .setDeadzone(50, 35);
    this.cameras.main.fadeIn(100, 16, 25, 35);
    this.app.active = this;
    this.app.sceneSerial++;
    this.app.frames.length = 0;
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.app.hud.blocked || this.app.loading) return;
      const at = this.cameras.main.getWorldPoint(pointer.x, pointer.y),
        goal = { x: Math.floor(at.x / 16), y: Math.floor(at.y / 16) };
      this.path = findPath(map, this.app.session.position, goal);
      this.app.message = this.path.length ? "Following the path…" : "That tile cannot be reached.";
      // A second click at the nearby destination enters its gate or door.
      if (goal.x === this.app.session.position.x && goal.y === this.app.session.position.y) this.app.interact();
    });
    this.input.on("wheel", (_p: unknown, _o: unknown, _dx: number, dy: number) => this.app.changeZoom(dy < 0 ? 1 : -1));
    this.events.once("shutdown", () => {
      for (const chunk of this.chunks.values()) chunk.map.destroy();
      this.chunks.clear();
      this.input.removeAllListeners();
    });
  }
  stopPath() {
    this.path = [];
  }
  getPlayerPosition() {
    return { x: this.player.x, y: this.player.y };
  }
  teleportPlayer(x: number, y: number) {
    const map = this.app.session.map;
    const tx = Math.floor(x / 16),
      ty = Math.floor(y / 16);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !walkable(map, tx, ty))
      throw new Error("Teleport destination is blocked");
    this.path = [];
    this.player.setPosition(x, y);
    this.app.session.setPosition({ mapId: map.id, x: tx, y: ty });
    this.cameras.main.centerOn(x, y);
  }
  private updateChunks() {
    const map = this.app.session.map,
      camera = this.cameras.main;
    const size = map.width > 200 || map.height > 200 ? 64 : Math.max(map.width, map.height);
    const wanted = visibleChunks(map.width, map.height, camera.worldView, size),
      stamp = wanted.join(";");
    if (stamp === this.chunkStamp) return;
    this.chunkStamp = stamp;
    for (const [key, chunk] of this.chunks)
      if (!wanted.includes(key)) {
        chunk.map.destroy();
        this.chunks.delete(key);
      }
    for (const key of wanted)
      if (!this.chunks.has(key)) {
        const [cx, cy] = key.split(",").map(Number) as [number, number],
          x = cx * size,
          y = cy * size,
          w = Math.min(size, map.width - x),
          h = Math.min(size, map.height - y);
        const tilemap = this.make.tilemap({ tileWidth: 16, tileHeight: 16, width: w, height: h });
        const tileset = tilemap.addTilesetImage(this.app.loader.world.theme.name, TEXTURE, 16, 16, 0, 0, 1);
        if (!tileset) throw new Error("Tileset missing");
        const layers: Phaser.Tilemaps.TilemapLayer[] = [];
        for (const name of ["ground", "decor", "flickering"]) {
          const source = this.tiled.layers.find((l) => l.name === name);
          if (source?.type !== "tilelayer") continue;
          const layer = tilemap.createBlankLayer(name, tileset, x * 16, y * 16);
          if (!layer) continue;
          const data = Array.from({ length: h }, (_, dy) =>
            source.data.slice((y + dy) * map.width + x, (y + dy) * map.width + x + w).map((n) => n || -1),
          );
          layer.putTilesAt(data, 0, 0);
          layer.setCullPadding(2, 2);
          if (name === "flickering") layer.setAlpha(0.45);
          layers.push(layer);
        }
        this.chunks.set(key, { map: tilemap, layers });
      }
  }
  private drawOverlays() {
    const s = this.app.session,
      map = s.map,
      seen = s.fog(),
      view = this.cameras.main.worldView;
    this.fog.clear().fillStyle(0x0b1420, 1);
    for (
      let y = Math.max(0, Math.floor(view.y / 16) - 1);
      y < Math.min(map.height, Math.ceil(view.bottom / 16) + 1);
      y++
    )
      for (
        let x = Math.max(0, Math.floor(view.x / 16) - 1);
        x < Math.min(map.width, Math.ceil(view.right / 16) + 1);
        x++
      )
        if (!seen[y * map.width + x]) this.fog.fillRect(x * 16, y * 16, 16, 16);
    this.markers.clear();
    for (const label of this.labels) label.destroy();
    this.labels = [];
    const marker = (p: WorldPosition, color: number) => {
      if (p.mapId === map.id && seen[p.y * map.width + p.x] && view.contains(p.x * 16, p.y * 16))
        this.markers.fillStyle(color).fillCircle((p.x + 0.5) * 16, (p.y + 0.5) * 16, 3);
    };
    for (const n of s.world.npcs) {
      marker(n.position, 0xa8e0c5);
      if (n.outdoor) marker(n.outdoor, 0xa8e0c5);
    }
    for (const m of s.world.monsters) marker(m.position, 0xf18e9c);
    for (const p of s.world.portals) marker(p.position, 0xbfa2f5);
    for (const d of s.world.dungeons) marker(d.position, 0xe6b368);
    for (const l of s.world.landmarks) marker(l.position, 0xf5d381);
    for (const b of s.world.bosses)
      if (b.arena.mapId === map.id)
        marker({ mapId: map.id, x: b.arena.bounds.x + 6, y: b.arena.bounds.y + 5 }, 0xf26781);
    for (const t of s.world.transitions) {
      marker(t.from, 0x9ad9f2);
      marker(t.to, 0x9ad9f2);
    }
    const text = (x: number, y: number, label: string, size = 9) => {
      const t = this.add
        .text(x, y, label, {
          fontFamily: document.documentElement.dataset.mapFont === "system" ? "sans-serif" : "monospace",
          fontSize: `${size}px`,
          color: "#fff4d6",
          backgroundColor: "#16232de8",
          padding: { x: 3, y: 2 },
        })
        .setDepth(7);
      this.labels.push(t);
      return t;
    };
    if (map.kind === "overworld")
      for (const r of s.world.regions)
        if (view.contains((r.bounds.x + 2) * 16, (r.bounds.y + 3) * 16))
          text((r.bounds.x + 2) * 16, (r.bounds.y + 3) * 16, r.name, 11);
    if (map.kind === "overworld")
      for (const r of s.world.regions)
        if (Math.hypot(r.entrance.x - s.position.x, r.entrance.y - s.position.y) < 7)
          text((r.entrance.x + 1) * 16, (r.entrance.y - 1) * 16, r.name, 10);
    for (const b of s.world.buildings)
      if (b.door.mapId === map.id && Math.hypot(b.door.x - s.position.x, b.door.y - s.position.y) <= 4) {
        const label = text(b.bounds.x * 16, (b.bounds.y - 1) * 16, b.label);
        label.setInteractive().on("pointerover", () => {
          this.app.message = [s.world.districts.find((d) => d.id === b.districtId)?.path, b.label]
            .filter(Boolean)
            .join("/");
        });
      }
    for (const d of s.world.districts)
      if (d.regionId === s.region?.id && Math.hypot(d.bounds.x + 2 - s.position.x, d.bounds.y + 2 - s.position.y) < 15)
        text((d.bounds.x + 2) * 16, (d.bounds.y + 2) * 16, d.path, 8);
  }
  override update(time: number, delta: number) {
    if (!this.player) return;
    const s = this.app.session,
      map = s.map;
    this.app.frames.push(delta);
    if (this.app.frames.length > 600) this.app.frames.shift();
    let x = 0,
      y = 0;
    if (!this.app.hud.blocked && !this.app.loading) {
      const held = this.app.held,
        virtual = this.app.virtualKeys.held();
      const down = (keys: readonly string[]) => keys.some((k) => held.has(k));
      x = Number(down(BINDINGS.right) || virtual.has("right")) - Number(down(BINDINGS.left) || virtual.has("left"));
      y = Number(down(BINDINGS.down) || virtual.has("down")) - Number(down(BINDINGS.up) || virtual.has("up"));
      const pad = this.input.gamepad?.getPad(0);
      if (pad?.connected) {
        const px = pad.axes[0]?.getValue() ?? 0,
          py = pad.axes[1]?.getValue() ?? 0;
        if (Math.hypot(px, py) > 0.2) {
          x = px;
          y = py;
        }
      }
      if (x || y) this.path = [];
      const target = this.path[0];
      let speed = down(BINDINGS.run) ? 150 : 80;
      if (target) {
        const dx = (target.x + 0.5) * 16 - this.player.x,
          dy = (target.y + 0.5) * 16 - this.player.y;
        if (Math.hypot(dx, dy) < 2) {
          this.path.shift();
        } else {
          const v = direction(dx, dy);
          x = v.x;
          y = v.y;
          speed = Math.min(speed, Math.hypot(dx, dy) / Math.max(0.001, Math.min(delta / 1000, 0.05)));
        }
      }
      const vector = direction(x, y),
        at = move(map, this.player, { x: vector.x * speed, y: vector.y * speed }, Math.min(delta / 1000, 0.05));
      this.player.setPosition(at.x, at.y);
      if (x) this.player.setFlipX(x < 0);
      const tx = Math.floor(at.x / 16),
        ty = Math.floor(at.y / 16);
      if (tx !== s.position.x || ty !== s.position.y) {
        s.position = { mapId: map.id, x: tx, y: ty };
        s.reveal();
      }
      if (target && !this.path.length) {
        this.app.message = "Arrived. Click again or press E to enter a nearby door.";
      }
    }
    this.updateChunks();
    if (time >= this.nextHud) {
      this.nextHud = time + 100;
      this.drawOverlays();
      const t = s.nearbyTransition();
      const point = this.input.activePointer;
      const worldPoint = this.cameras.main.getWorldPoint(point.x, point.y);
      const entities = s.world.buildings
        .filter(
          (b) =>
            b.door.mapId === map.id &&
            Math.abs(b.door.x - Math.floor(worldPoint.x / 16)) <= 1 &&
            Math.abs(b.door.y - Math.floor(worldPoint.y / 16)) <= 1,
        )
        .map((b) => b.id);
      const cursorX = Math.floor(worldPoint.x / 16),
        cursorY = Math.floor(worldPoint.y / 16);
      for (const entity of [
        ...s.world.npcs.flatMap((n) => [
          { id: n.id, position: n.position },
          ...(n.outdoor ? [{ id: n.id, position: n.outdoor }] : []),
        ]),
        ...s.world.monsters,
        ...s.world.portals,
        ...s.world.dungeons,
        ...s.world.landmarks,
      ])
        if (entity.position.mapId === map.id && entity.position.x === cursorX && entity.position.y === cursorY)
          entities.push(entity.id);
      this.app.hud.update(
        this.app.loading ? "Loading map…" : t ? `${t.label} · press E or Interact` : this.app.message,
        `FPS ${this.game.loop.actualFps.toFixed(0)}\nTile ${s.position.x}, ${s.position.y}\nMap ${map.id}\nChunks ${this.chunks.size}\nCursor IDs ${entities.join(", ") || "—"}`,
      );
    }
  }
}

export async function startExplorer(url: string, virtualKeys: VirtualKeys): Promise<Explorer> {
  const loader = await WorldLoader.open(url);
  return new Explorer(loader, virtualKeys);
}
