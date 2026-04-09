// Vitest setup file — runs ONCE before any integration test in the run,
// because vitest.integration.config.ts uses fileParallelism: false.
//
// Responsibility:
//   1. Build a single pglite instance with migrations applied.
//   2. Register it as the mock for @/db and @/db/index so any server action
//      under test picks it up automatically.
//   3. Truncate all tables after every test for isolation.

import { afterEach, vi } from "vitest";
import { createTestDb, truncateAll, type TestDb } from "./test-db";

let sharedDb: TestDb | undefined;

async function getSharedDb(): Promise<TestDb> {
  if (!sharedDb) {
    const { db } = await createTestDb();
    sharedDb = db;
  }
  return sharedDb;
}

// Both import paths must be mocked because production code uses both.
vi.mock("@/db/index", async () => ({ db: await getSharedDb() }));
vi.mock("@/db", async () => ({ db: await getSharedDb() }));

afterEach(async () => {
  const db = await getSharedDb();
  await truncateAll(db);
});

export async function getTestDb(): Promise<TestDb> {
  return getSharedDb();
}
