import { parentPort } from "node:worker_threads";
import type { SourceFile } from "./discover.ts";
import { treeSitterExtractor } from "./extract.ts";

parentPort?.on("message", async ({ index, file }: { index: number; file: SourceFile }) => {
  try {
    parentPort?.postMessage({ index, result: await treeSitterExtractor.extract(file) });
  } catch (error) {
    parentPort?.postMessage({ index, error: error instanceof Error ? error.message : "Parser worker failed" });
  }
});
