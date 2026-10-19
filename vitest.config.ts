import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "apps/*/src/**/*.test.ts",
      "packages/*/src/**/*.test.ts",
      "tools/*/src/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
    // Builds the fixture repositories (idempotent) so every test can use them.
    globalSetup: ["scripts/fixtures/global-setup.ts"],
    testTimeout: 30_000,
  },
});
