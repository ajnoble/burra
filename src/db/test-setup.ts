// Vitest setup file — runs ONCE before any integration test in the run,
// because vitest.integration.config.ts uses fileParallelism: false.
//
// Responsibility:
//   1. Build a single pglite instance with migrations applied.
//   2. Register it as the mock for @/db and @/db/index so any server action
//      under test picks it up automatically.
//   3. Mock @/lib/supabase/server so getSessionMember reads a configurable
//      "signed-in user" email via the signInAs() helper.
//   4. Truncate all tables and reset the signed-in user after every test.

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

// Per-test mutable state for the mocked supabase client.
let currentTestUserEmail: string | null = null;

/**
 * Set the signed-in user email for subsequent auth checks in this test.
 * Pass null (or call with no argument) to sign out.
 * The `afterEach` hook below resets this between tests.
 */
export function signInAs(email: string | null = null): void {
  currentTestUserEmail = email;
}

// Both import paths must be mocked because production code uses both.
vi.mock("@/db/index", async () => ({ db: await getSharedDb() }));
vi.mock("@/db", async () => ({ db: await getSharedDb() }));

// Mock the supabase server client. Only the shape consumed by
// getSessionMember is implemented: client.auth.getUser() → { data: { user } }.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: currentTestUserEmail
            ? {
                id: `test-user-${currentTestUserEmail}`,
                email: currentTestUserEmail,
              }
            : null,
        },
        error: null,
      }),
    },
  }),
}));

afterEach(async () => {
  const db = await getSharedDb();
  await truncateAll(db);
  currentTestUserEmail = null;
});

export async function getTestDb(): Promise<TestDb> {
  return getSharedDb();
}
