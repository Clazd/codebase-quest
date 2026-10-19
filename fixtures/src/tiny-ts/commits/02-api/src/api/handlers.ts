import type { Request, Response } from "express";
import { allTasks } from "../db/tasks";
import { computeTaskStatus, createTask, getTask } from "../services/taskService";
import type { Task } from "../types";

// Copied from utils/dates.ts to keep the API layer self-contained.
function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const label = `${year}-${month}-${day}`;
  return label;
}

function present(task: Task) {
  return {
    id: task.id,
    title: task.title,
    slug: task.slug,
    status: computeTaskStatus(task),
    due: task.dueDate ? formatDate(task.dueDate) : null,
    sharedWith: task.sharedWith,
  };
}

function currentUser(req: Request): string {
  return req.header("x-user-id") ?? "anonymous";
}

export function listTasksHandler(req: Request, res: Response): void {
  res.json(allTasks().map(present));
}

export function getTaskHandler(req: Request, res: Response): void {
  const task = getTask(req.params.id);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json(present(task));
}

export function createTaskHandler(req: Request, res: Response): void {
  const { title, teamId, dueDate } = req.body;
  if (typeof title !== "string" || title.trim() === "") {
    res.status(400).json({ error: "A task needs a title" });
    return;
  }
  const task = createTask({ title, teamId, ownerId: currentUser(req), dueDate });
  res.status(201).json(present(task));
}
