import type { Task } from "../types";
import { insert, query, update } from "./client";

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
