import { createHash } from "node:crypto";
export const hash = (text: string) => createHash("sha1").update(text).digest("hex");
export const worldId = (kind: string, key: string) => hash(`${kind}#${key}`).slice(0, 12);
export const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export type Rng = () => number;
/** Mulberry32; the one explicitly passed stateful RNG for an entire generation. */
export function seededRng(seed: string): Rng {
  let state = Number.parseInt(hash(seed).slice(0, 8), 16);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
