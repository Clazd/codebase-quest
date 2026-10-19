import type { Atlas, Comprehension } from "./model.ts";
import { WEIGHTS } from "./model.ts";
export const levelCost = (level: number) => Math.ceil(100 * level ** 1.5);
export function levelFor(xp: number) {
  let level = 1,
    spent = 0;
  while (level < 30 && xp >= spent + levelCost(level)) spent += levelCost(level++);
  return level;
}
export const BRANCHES = ["Reading", "Tracing", "Debugging", "Architecture", "Testing"] as const;
const NODES = [
  ["spyglass", "Signatures", "Documentation", "hourglass", "chronicle"],
  ["compass", "First step", "Call threads", "boots", "Flow ledger"],
  ["Error paths", "Armor discount", "Patient mutants", "Free read", "Evidence hints"],
  ["lens", "Module names", "Dependency counts", "Import ledger", "Key ledger"],
  ["lantern", "Test references", "Gentle shadows", "Assertion ledger", "Coverage ledger"],
];
export const EQUIPMENT: Record<string, string> = {
  compass: "Compass of Callers",
  spyglass: "Spyglass of Types",
  lantern: "Lantern of Coverage",
  hourglass: "Hourglass of Steps",
  boots: "Boots of Import",
  lens: "Cartographer's Lens",
  chronicle: "Chronicle Monocle",
};
export const SKILLS = BRANCHES.flatMap((branch, b) =>
  (NODES[b] ?? []).map((effect, i) => ({
    id: `${branch.toLowerCase()}-${i + 1}`,
    branch,
    tier: i + 1,
    effect,
    title: EQUIPMENT[effect] ?? effect,
    prerequisite: i ? `${branch.toLowerCase()}-${i}` : null,
  })),
);
export const SHOP = [
  { id: "hint", title: "Hint Potion", price: 10 },
  { id: "tonic", title: "Energy Tonic", price: 12 },
  { id: "recall", title: "Scroll of Recall", price: 8 },
  { id: "smoke", title: "Smoke Bomb", price: 8 },
  { id: "hat", title: "Cartographer hat", price: 25 },
  { id: "color", title: "Ocean colors", price: 20 },
];
export function light(atlas: Pick<Atlas, "symbols">, states: Record<string, Comprehension>) {
  const sum = (symbols: Atlas["symbols"]) => {
    const total = symbols.reduce((n, s) => n + s.loc, 0);
    return total ? (symbols.reduce((n, s) => n + s.loc * WEIGHTS[states[s.id] ?? "unseen"], 0) / total) * 100 : 0;
  };
  return {
    kingdom: sum(atlas.symbols),
    regions: Object.fromEntries(
      [...new Set(atlas.symbols.map((s) => s.regionId))].map((id) => [
        id,
        sum(atlas.symbols.filter((s) => s.regionId === id)),
      ]),
    ),
  };
}
export const stars = (percent: number, guardian = false) =>
  percent >= 90 && guardian ? 3 : percent >= 70 ? 2 : percent >= 40 ? 1 : 0;
