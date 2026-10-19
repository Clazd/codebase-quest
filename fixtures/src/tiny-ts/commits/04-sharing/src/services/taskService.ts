import { allTasks, findTask, patchTask, saveTask } from "../db/tasks";
import type { StatusFields, Task, TaskStatus } from "../types";
import { slugify } from "../utils/slugify";
import { isSharedWith } from "./shareService";

export function computeTaskStatus(task: StatusFields): TaskStatus {
  if (!task.dueDate) return "open";
  if (task.done) {
    if (task.doneAt > task.dueDate)
      return "late";
    return "done";
  }
  return "open";
}

let nextId = 1;

export type NewTask = { title: string; teamId: string; ownerId: string; dueDate?: number };

export function createTask(input: NewTask): Task {
  const task: Task = {
    id: `task-${nextId++}`,
    title: input.title,
    slug: slugify(input.title),
    teamId: input.teamId,
    ownerId: input.ownerId,
    dueDate: input.dueDate,
    sharedWith: [],
    archived: false,
    done: false,
  };
  return saveTask(task);
}

export function getTask(id: string): Task | undefined {
  return findTask(id);
}

export function completeTask(id: string, at: number): Task | undefined {
  return patchTask(id, { done: true, doneAt: at });
}

/** Tasks the user owns or that were shared with them, without archived ones. */
export function listTasksForUser(userId: string): Task[] {
  return allTasks().filter((task) => !task.archived && (task.ownerId === userId || isSharedWith(task, userId)));
}
