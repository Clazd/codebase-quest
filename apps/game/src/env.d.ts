/// <reference types="vite/client" />

import type { CqDebugApi } from "./debug/cqDebugApi.ts";

declare global {
  /** `true` in dev and test builds, `false` in production (see vite.config.ts). */
  const __CQ_DEBUG__: boolean;
  /** `true` only in test builds: enables `__testAnswerKey`. */
  const __CQ_TEST__: boolean;

  interface Window {
    /** Debug API for tests and the browser console. Dev and test builds only. */
    __CQ__?: CqDebugApi;
  }
}
