import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import type { SourceFile } from "./discover.ts";
import type { Extracted } from "./extract.ts";
/** CPU-minus-one pool, with an explicit memory budget cap of eight WASM runtimes. */
export async function extractAll(
  files: SourceFile[],
  workers = Math.min(8, Math.max(1, availableParallelism() - 1)),
): Promise<Extracted[]> {
  if (!files.length) return [];
  const pool: Worker[] = [];
  let cursor = 0;
  let completed = 0;
  const results: Extracted[] = [];
  try {
    return await new Promise((resolve, reject) => {
      for (let i = 0; i < Math.min(workers, files.length); i++) {
        const worker = new Worker(new URL("./worker.ts", import.meta.url), { execArgv: [] });
        pool.push(worker);
        const dispatch = () => {
          const index = cursor++;
          if (index < files.length) worker.postMessage({ index, file: files[index] });
        };
        worker.on("error", reject);
        worker.on("exit", (code) => {
          if (code && completed < files.length) reject(new Error(`Parser worker exited (${code})`));
        });
        worker.on("message", ({ index, result, error }: { index: number; result: Extracted; error?: string }) => {
          if (error) {
            reject(new Error(error));
            return;
          }
          results[index] = result;
          completed++;
          if (completed === files.length) resolve(results);
          else dispatch();
        });
        dispatch();
      }
    });
  } finally {
    await Promise.all(pool.map((w) => w.terminate()));
  }
}
