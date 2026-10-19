import type { Task, Team } from "../types";
import { beginBatch, insert, query, update } from "./client";

export function findTask(id: string): Task | undefined {
  return query<Task>("tasks", { id })[0];
}

export function allTasks(): Task[] {
  return query<Task>("tasks");
}

export function saveTask(task: Task): Task {
  return insert("tasks", task);
}

export function patchTask(id: string, patch: Partial<Task>): Task | undefined {
  return update<Task>("tasks", id, patch);
}

function isArchivable(task: Task, before: number): boolean {
  return task.done && task.doneAt < before;
}

/** Archives every task of `teams` that was finished before `before`. Returns how many. */
export function archiveCompleted(teams: Team[], before: number): number {
  let archived = 0;
  const batch = beginBatch();
  try {
    for (const team of teams) {
      for (const task of query<Task>("tasks", { teamId: team.id })) {
        if (isArchivable(task, before)) {
          update<Task>("tasks", task.id, { archived: true });
          archived += 1;
        }
      }
    }
  } finally {
    batch.end();
  }
  return archived;
}
