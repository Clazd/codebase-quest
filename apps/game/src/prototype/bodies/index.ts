import { type Monster, MonsterSchema } from "../combat/schema.ts";
import checkPermissions from "./checkPermissions.json" with { type: "json" };
import computeTaskStatus from "./computeTaskStatus.json" with { type: "json" };
import formatDate from "./formatDate.json" with { type: "json" };

/** Hand-authored monsters for the Phase 01 prototype, validated on load. */
export const MONSTERS: readonly Monster[] = [computeTaskStatus, formatDate, checkPermissions].map((m) =>
  MonsterSchema.parse(m),
);

export function monsterById(id: string): Monster {
  const monster = MONSTERS.find((m) => m.id === id);
  if (monster === undefined) throw new Error(`Unknown monster "${id}"`);
  return monster;
}

/**
 * Checks references inside a monster: unique cell ids, limbs, guards, inputs,
 * questions and hints all point at real cells. Returns a list of problems.
 */
export function referenceProblems(monster: Monster): string[] {
  const problems: string[] = [];
  const bodies = [...monster.bodies, ...monster.minions];
  const cells = new Map(bodies.flatMap((b) => b.cells.map((c) => [c.id, c] as const)));
  const allIds = bodies.flatMap((b) => b.cells.map((c) => c.id));
  if (new Set(allIds).size !== allIds.length) problems.push("duplicate cell ids");

  for (const body of bodies) {
    for (const limb of body.limbs) {
      if (cells.get(limb.jointId)?.kind !== "joint") problems.push(`${limb.id}: joint ${limb.jointId} is not a joint`);
      for (const id of limb.cellIds) if (!cells.has(id)) problems.push(`${limb.id}: unknown cell ${id}`);
    }
    for (const cell of body.cells) {
      for (const g of cell.guardJointIds ?? []) {
        if (cells.get(g)?.kind !== "joint") problems.push(`${cell.id}: guard ${g} is not a joint`);
      }
      if (cell.minionId !== undefined && !monster.minions.some((m) => m.id === cell.minionId)) {
        problems.push(`${cell.id}: unknown minion ${cell.minionId}`);
      }
      if (monster.hints[cell.id] === undefined) problems.push(`${cell.id}: no Gitling hint`);
    }
    for (const input of body.inputs) {
      for (const id of input.pathCellIds) if (!cells.has(id)) problems.push(`${input.id}: unknown path cell ${id}`);
      if (cells.get(input.exitHeartId)?.kind !== "heart") problems.push(`${input.id}: exit is not a heart`);
      if (input.pathCellIds.at(-1) !== input.exitHeartId) problems.push(`${input.id}: path must end at the exit`);
    }
  }
  for (const q of monster.questions) {
    if (q.answer >= q.choices.length) problems.push(`${q.id}: answer out of range`);
    if (q.cellId !== undefined && !cells.has(q.cellId)) problems.push(`${q.id}: unknown cell ${q.cellId}`);
    if (q.action === "trace" && !bodies.some((b) => b.inputs.some((i) => i.id === q.inputId))) {
      problems.push(`${q.id}: unknown input ${q.inputId}`);
    }
  }
  return problems;
}
