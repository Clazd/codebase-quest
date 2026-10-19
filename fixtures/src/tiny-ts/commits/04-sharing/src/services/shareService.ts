import { patchTask } from "../db/tasks";
import { loadTeam } from "../db/teams";
import type { Task } from "../types";
import { computeTaskStatus, getTask } from "./taskService";

export class PermissionError extends Error {}

export function isSharedWith(task: Task, userId: string): boolean {
  return task.sharedWith.includes(userId);
}

/** Throws unless `userId` belongs to the task's team. */
export function checkPermissions(task: Task, userId: string): void {
  const team = loadTeam(task.teamId);
  if (!team.memberIds.includes(userId)) {
    throw new PermissionError(`User "${userId}" is not in team "${team.name}"`);
  }
}

/** Shares a task with another user. Only team members can share, and finished tasks can't be shared. */
export function shareTask(taskId: string, userId: string, withUserId: string): Task {
  const task = getTask(taskId);
  if (!task) throw new Error(`No task "${taskId}"`);
  checkPermissions(task, userId);
  if (computeTaskStatus(task) === "done") throw new Error("Finished tasks can't be shared");
  patchTask(task.id, { sharedWith: [...task.sharedWith, withUserId] });
  return task;
}
