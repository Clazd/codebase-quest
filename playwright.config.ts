import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const isCI = process.env.CI !== undefined;

export default defineConfig({
  testDir: "apps/game/e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // A test-mode build: production-like bundle, but with the window.__CQ__ debug API.
  webServer: {
    command: "pnpm --filter @codebase-quest/game run preview:test",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
