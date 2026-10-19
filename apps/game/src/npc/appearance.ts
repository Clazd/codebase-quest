import type { FactSheet } from "@codebase-quest/shared";

/** Kenney Tiny Dungeon frames used as placeholder bodies (MASTER-PLAN §5.5). */
export const FRAMES = { function: 98, method: 86, class: 96, shape: 100, trainer: 112, ghost: 121 } as const;
export function baseFrame(sheet: FactSheet): number {
  if (sheet.traits.includes("deprecated")) return FRAMES.ghost;
  if (sheet.traits.includes("test")) return FRAMES.trainer;
  if (sheet.kind === "class") return FRAMES.class;
  if (sheet.kind === "interface" || sheet.kind === "type") return FRAMES.shape;
  return sheet.kind === "method" ? FRAMES.method : FRAMES.function;
}
/** Guild colors: methods of one class share a tint; functions share their folder's tint. */
export const TINTS = [0xffffff, 0xffd59a, 0xa9e2ff, 0xc3f0b0, 0xffb3c7, 0xd6c2ff, 0xfff1a1, 0x9ff0dc] as const;
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
export function tintFor(sheet: FactSheet): number {
  return TINTS[hashString(sheet.group.key) % TINTS.length] ?? 0xffffff;
}
/** Trait badges: a 5×5 pixel icon, its color and the object it depicts. */
export const BADGES = {
  async: { label: "async", icon: "wings", color: 0xbfe8ff, pixels: ["1...1", "11.11", "11111", ".111.", "..1.."] },
  constructor: {
    label: "constructor",
    icon: "hammer",
    color: 0xd8b07a,
    pixels: ["11111", "11111", "..1..", "..1..", "..1.."],
  },
  "event-handler": {
    label: "event handler",
    icon: "ear trumpet",
    color: 0xf2d16b,
    pixels: ["1....", "11...", "1.1..", "1..11", "11111"],
  },
  recursive: {
    label: "recursive",
    icon: "mirror",
    color: 0xd9c4ff,
    pixels: [".111.", "1...1", "1.1.1", "1...1", ".111."],
  },
  "does-io": {
    label: "does I/O",
    icon: "coin",
    color: 0xffd34d,
    pixels: [".111.", "11.11", "1.1.1", "11.11", ".111."],
  },
  "pure-candidate": {
    label: "pure candidate",
    icon: "lotus",
    color: 0xffb7d5,
    pixels: ["..1..", ".111.", "1.1.1", "11111", ".111."],
  },
  deprecated: {
    label: "deprecated",
    icon: "ghost",
    color: 0xe9eef2,
    pixels: [".111.", "1.1.1", "11111", "11111", "1.1.1"],
  },
} as const;
export type BadgeId = keyof typeof BADGES;
export function badgesFor(sheet: FactSheet): BadgeId[] {
  const ids = Object.keys(BADGES) as BadgeId[];
  return ids.filter((id) =>
    id === "async" ? sheet.async || sheet.traits.includes("async") : sheet.traits.includes(id),
  );
}
export type Behavior = "brisk" | "busy" | "meditate" | "alone" | "wander" | "stand";
/** Idle behavior by trait (P05 table). High fan-in adds visitor particles on top of any behavior. */
export function behaviorFor(sheet: FactSheet): Behavior {
  const callable = sheet.kind === "function" || sheet.kind === "method";
  if (!callable) return "stand";
  if (sheet.async || sheet.traits.includes("async")) return "brisk";
  if (sheet.traits.includes("does-io")) return "busy";
  if (sheet.traits.includes("pure-candidate") && !sheet.traits.includes("test")) return "meditate";
  if (sheet.metrics.fanIn === 0 && !sheet.traits.includes("test")) return "alone";
  return "wander";
}
export const hasVisitors = (sheet: FactSheet) => sheet.metrics.fanIn >= 5;
/** Mulberry32 seeded by the NPC ID: idle motion is the same on every visit. */
export function npcRng(id: string): () => number {
  let state = hashString(id);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
