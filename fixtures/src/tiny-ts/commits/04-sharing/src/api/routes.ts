import type { Express } from "express";
import {
  completeTaskHandler,
  createTaskHandler,
  getTaskHandler,
  listTasksHandler,
  shareTaskHandler,
} from "./handlers";

export function registerRoutes(app: Express): void {
  app.get("/tasks", listTasksHandler);
  app.post("/tasks", createTaskHandler);
  app.get("/tasks/:id", getTaskHandler);
  app.post("/tasks/:id/complete", completeTaskHandler);
  app.post("/tasks/:id/share", shareTaskHandler);
}
