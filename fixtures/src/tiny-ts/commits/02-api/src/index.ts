import { readFileSync } from "node:fs";
import express from "express";
import { registerRoutes } from "./api/routes";
import { loadSnapshot } from "./db/client";

export function createApp() {
  const app = express();
  app.use(express.json());
  registerRoutes(app);
  return app;
}

export function start(port = 3000): void {
  const snapshot = process.env.TASKLY_SNAPSHOT;
  if (snapshot) loadSnapshot(readFileSync(snapshot, "utf8"));
  createApp().listen(port, () => console.log(`Taskly listening on http://localhost:${port}`));
}
