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
  },
});
