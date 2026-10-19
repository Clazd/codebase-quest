import type { Express } from "express";
import { createTaskHandler, getTaskHandler, listTasksHandler } from "./handlers";

export function registerRoutes(app: Express): void {
  app.get("/tasks", listTasksHandler);
  app.post("/tasks", createTaskHandler);
  app.get("/tasks/:id", getTaskHandler);
}
