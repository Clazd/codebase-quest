import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    jsx: { runtime: "automatic", importSource: "preact" },
  },
  test: {
    include: [
      "apps/*/src/**/*.test.{ts,tsx}",
      "packages/*/src/**/*.test.ts",
      "tools/*/src/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
    // Builds the fixture repositories (idempotent) so every test can use them.
    globalSetup: ["scripts/fixtures/global-setup.ts"],
    testTimeout: 30_000,
    // Tests never touch the user's real ~/.codequest (settings, sessions, setup state).
    env: { CQ_HOME: join(tmpdir(), `cq-test-home-${process.pid}`) },
  },
});
