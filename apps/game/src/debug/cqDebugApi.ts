import pkg from "../../package.json" with { type: "json" };
import type { VirtualKeys } from "../input/movement.ts";

/**
 * The debug API on `window.__CQ__` (dev and test builds only). Playwright drives
 * the game through it, and every later phase extends it.
 */
export interface CqDebugApi {
  /** The game client's version. */
  version: string;
  /** Key of the topmost active scene, e.g. `"Test"`. */
  getScene(): string;
  /** Player position in world pixels (center of the sprite). */
  getPlayer(): { x: number; y: number };
  /** Moves the player to a position in world pixels. */
  teleport(x: number, y: number): void;
  /** Holds a key (`ArrowRight`, `w`…) for `ms` milliseconds; resolves when released. */
  pressKey(key: string, ms: number): Promise<void>;
}

/** A scene that has a player the debug API can read and move. */
export interface PlayerHost {
  getPlayerPosition(): { x: number; y: number };
  teleportPlayer(x: number, y: number): void;
}

/** The part of `Phaser.Game` the debug API needs (kept small so it's testable without Phaser). */
export interface SceneSource {
  scene: { getScenes(isActive?: boolean): readonly object[] };
}

function sceneKey(scene: object): string {
  const sys = (scene as { sys?: { settings?: { key?: unknown } } }).sys;
  const key = sys?.settings?.key;
  return typeof key === "string" ? key : "";
}

function isPlayerHost(scene: object): scene is PlayerHost {
  const s = scene as Partial<PlayerHost>;
  return typeof s.getPlayerPosition === "function" && typeof s.teleportPlayer === "function";
}

export function createDebugApi(game: SceneSource, virtualKeys: VirtualKeys): CqDebugApi {
  const activeScenes = () => game.scene.getScenes(true);

  const playerHost = (): PlayerHost => {
    const host = [...activeScenes()].reverse().find(isPlayerHost);
    if (host === undefined) throw new Error("No active scene has a player");
    return host;
  };

  return {
    version: pkg.version,
    getScene() {
      const scenes = activeScenes();
      const top = scenes[scenes.length - 1];
      return top === undefined ? "" : sceneKey(top);
    },
    getPlayer() {
      const { x, y } = playerHost().getPlayerPosition();
      return { x, y };
    },
    teleport(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("teleport needs finite x and y");
      playerHost().teleportPlayer(x, y);
    },
    pressKey(key, ms) {
      return virtualKeys.press(key, ms);
    },
  };
}
