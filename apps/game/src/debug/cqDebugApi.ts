import type { QuestDef, QuestProgress, SaveV1 } from "@codebase-quest/quests";
import pkg from "../../package.json" with { type: "json" };
import type { VirtualKeys } from "../input/movement.ts";

/**
 * The debug API on `window.__CQ__` (dev and test builds only). Playwright drives
 * the game through it, and every later phase extends it.
 */
export interface CqDebugApi {
  getQuests(): (QuestDef & { progress: QuestProgress | undefined })[];
  getLight(): { kingdom: number; regions: Record<string, number> };
  getSave(): SaveV1;
  loadSave(save: SaveV1): Promise<void>;
  completeObjective?(questId: string, index: number): void;
  getEquipment(symbolId: string): unknown;
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
  getWorldSummary(): { regions: number; buildings: number; npcs: number };
  getLocation(): { scene: string; regionId?: string; buildingId?: string; breadcrumb: string };
  enterBuilding(buildingId: string): Promise<void>;
  gotoRegion(regionId: string): Promise<void>;
  getFogSeenRatio(): number;
  getFrameStats(): { samples: number; averageMs: number; chunks: number };
  getCamera(): { scrollX: number; scrollY: number; zoom: number; width: number; height: number };
  /** Talks to a character as if the player pressed E beside it (opens dialogue + Code Panel). */
  interactWithNpc(symbolId: string): Promise<void>;
  getOpenPanel(): { kind: "code" | "codex" | "gitling" | "combat" | null; symbolId?: string };
  getCodexCount(): number;
  /** Teleports to stand beside a character at home, without talking. */
  gotoNpc(symbolId: string): Promise<void>;
  /** The active "Walk there" guide, if any. */
  getGuide(): { symbolId: string; waypoint: { mapId: string; x: number; y: number } | null } | null;
  /** Characters on the current map (pixel positions of their feet). */
  getNpcs(): { symbolId: string; x: number; y: number; visible: boolean }[];
  /** Mock bridge (tests): deliver a message as if `cq play` sent it. */
  bridgeReceive(message: unknown): Promise<void>;
  /** Messages the game tried to send over the bridge. */
  bridgeSent(): Record<string, unknown>[];
  /** Asks Gitling a question; returns the chat entry ID. */
  askGitling(question: string): string;
  /** Code-Body Combat (Phase 07): start a fight by smell ID or encounter ID. */
  startFight(smellOrEncounterId: string): Promise<void>;
  /** The fight as the player sees it (no answer keys), or null. */
  getFight(): FightView | null;
  /**
   * Performs an action (`read`, `trace`, `sever`…; `end` ends the turn; `predict`
   * predicts with `choice` as the heart index) and, with `choice`, answers its question.
   */
  act(action: string, target?: string | null, choice?: number): Promise<{ correct?: boolean }>;
  /** Monsters on the current map. */
  getMonsters(): { id: string; kind: string; mode: string; x: number; y: number }[];
  /** Test builds only: the correct choice for the pending question or prediction. */
  __testAnswerKey?(): number | null;
}
export interface FightView {
  name: string;
  kind: string;
  body: { cells: { id: string; kind: string; row: number; col: number; lines: [number, number] }[] }[];
  focus: number;
  energy: number;
  monsterHp: number;
  outcome: string | null;
  turn: number;
  question: { id: string; type: string; prompt: string; choices: string[] } | null;
  prediction: { choices: string[] } | null;
  cells: Record<string, { destroyed: boolean; revealed: boolean; hp: number }>;
  summoned: string[];
  twistActions: string[];
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
    getQuests: () => [],
    getLight: () => ({ kingdom: 0, regions: {} }),
    getSave: () => {
      throw new Error("Load a world to save");
    },
    loadSave: async () => {
      throw new Error("Load a world to save");
    },
    getEquipment: () => null,
    getWorldSummary: () => ({ regions: 0, buildings: 0, npcs: 0 }),
    getLocation: () => ({ scene: "Test", breadcrumb: "Test scene" }),
    enterBuilding: async () => {
      throw new Error("Load a world to enter buildings");
    },
    gotoRegion: async () => {
      throw new Error("Load a world to enter regions");
    },
    getFogSeenRatio: () => 0,
    getFrameStats: () => ({ samples: 0, averageMs: 0, chunks: 0 }),
    getCamera: () => ({ scrollX: 0, scrollY: 0, zoom: 1, width: 320, height: 240 }),
    interactWithNpc: async () => {
      throw new Error("Load a world to talk to characters");
    },
    getOpenPanel: () => ({ kind: null }),
    getCodexCount: () => 0,
    gotoNpc: async () => {
      throw new Error("Load a world to visit characters");
    },
    getGuide: () => null,
    getNpcs: () => [],
    bridgeReceive: async () => {
      throw new Error("Load a world to use the bridge");
    },
    bridgeSent: () => [],
    askGitling: () => {
      throw new Error("Load a world to ask Gitling");
    },
    startFight: async () => {
      throw new Error("Load a world to fight");
    },
    getFight: () => null,
    act: async () => {
      throw new Error("Load a world to fight");
    },
    getMonsters: () => [],
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
