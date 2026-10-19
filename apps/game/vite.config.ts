import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  base: "./",
  define: {
    // The `window.__CQ__` debug API exists in dev and test builds only. In a
    // production build this is the literal `false`, so the bundler drops it.
    __CQ_DEBUG__: JSON.stringify(mode !== "production"),
  },
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    target: "es2022",
    // Phaser alone is over 1 MB minified; one chunk is fine for now.
    chunkSizeWarningLimit: 2000,
  },
}));
