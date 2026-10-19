import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig(({ mode }) => ({
  base: "./",
  define: {
    // The `window.__CQ__` debug API exists in dev and test builds only. In a
    // production build this is the literal `false`, so the bundler drops it.
    __CQ_DEBUG__: JSON.stringify(mode !== "production"),
  },
  oxc: {
    jsx: { runtime: "automatic", importSource: "preact" },
  },
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    target: "es2022",
    // Phaser alone is over 1 MB minified; one chunk is fine for now.
    chunkSizeWarningLimit: 2000,
    rolldownOptions: {
      // The Phase 01 prototype pages are dev/test only: never in production builds.
      input:
        mode === "production"
          ? ({ main: page("./index.html") } as Record<string, string>)
          : {
              main: page("./index.html"),
              combat: page("./prototype/combat/index.html"),
              art: page("./prototype/art/index.html"),
              tiledSmoke: page("./prototype/worldgen-smoke/index.html"),
            },
    },
  },
}));
