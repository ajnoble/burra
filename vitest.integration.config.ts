import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Only integration tests — the unit suite is in vitest.config.ts.
    include: ["src/**/*.integration.test.ts"],
    exclude: ["node_modules", ".next"],
    // Single pglite instance is shared across all integration tests in a run.
    // Run everything in one worker so the mock and the db instance live in
    // the same process. (vitest 4 equivalent of poolOptions.forks.singleFork.)
    pool: "forks",
    fileParallelism: false,
    setupFiles: ["src/db/test-setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
