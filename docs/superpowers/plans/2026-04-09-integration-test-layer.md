# Integration Test Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Snow Gum a real-database integration test harness that runs alongside unit tests, plus a written convention that bans the mock-theatre patterns the Phase 23 code review identified.

**Architecture:** Use `@electric-sql/pglite` (in-process WASM Postgres) with the `drizzle-orm/pglite` adapter. Run existing `drizzle/` migrations into the in-memory DB at setup. Swap `@/db` at import time via a vitest setup file using `vi.mock`. Truncate all tables via `TRUNCATE ... CASCADE` between tests for isolation. Integration tests live beside unit tests but use a `.integration.test.ts` suffix and a separate vitest config so they don't affect the fast unit loop.

**Tech Stack:** Vitest · Drizzle ORM (postgres-js in prod, pglite in tests) · PGlite · TypeScript · existing `drizzle/` migration folder

**Non-goals:** This plan does not rewrite any existing mock-theatre tests, does not add integration coverage for the ~12 high-value actions identified in the review, and does not fix any of the Critical findings. It builds the foundation only. Subsequent plans (auth wrapper, capacity lock, Stripe-before-commit) depend on this foundation.

**Assumed reader:** Skilled TypeScript developer with limited Snow Gum context. Knows vitest basics. Has never used pglite before.

---

## File structure

| File | Action | Responsibility |
|------|--------|----------------|
| `package.json` | modify | Add `@electric-sql/pglite` dev dep; add `test:integration` script; scope `test` to unit tests only |
| `src/db/test-db.ts` | **create** | `createTestDb()` builds a pglite instance, runs migrations, returns a drizzle client. `truncateAll()` clears all tables. No production imports may ever touch this file. |
| `src/db/test-setup.ts` | **create** | Vitest `setupFiles` entry. Creates ONE shared test db for the integration run, registers `vi.mock("@/db/index")` and `vi.mock("@/db")` to return it, registers `afterEach(truncateAll)`. |
| `vitest.integration.config.ts` | **create** | Separate vitest config. Pattern: `**/*.integration.test.ts`. Single-threaded (`pool: "forks", poolOptions: { forks: { singleFork: true } }`) so the one shared pglite instance is safe. Registers `src/db/test-setup.ts` via `setupFiles`. |
| `vitest.config.ts` | modify | Exclude `**/*.integration.test.ts` so `npm test` stays fast and doesn't pull in pglite. |
| `src/db/__tests__/test-db.integration.test.ts` | **create** | Proves the layer: a trivial `SELECT 1` and an insert-truncate-verify cycle. |
| `src/actions/availability/__tests__/get-season-for-dates.integration.test.ts` | **create** | First real integration test against production code (`getSeasonForDates`). Proves the `vi.mock` swap works for a SUT that imports `db` from `@/db/index`. |
| `docs/testing.md` | **create** | Written convention: when to integration-test vs unit-test, banned antipatterns (named and quoted), integration test template. |
| `AGENTS.md` | modify | Add a pointer to `docs/testing.md` so future contributors find it. |

---

## Task 1: Install pglite

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the dev dependency**

```bash
cd /opt/snowgum && npm install --save-dev @electric-sql/pglite
```

Expected: installs successfully. `package.json` gets a new entry under `devDependencies`. `package-lock.json` updates.

- [ ] **Step 2: Verify the import resolves**

```bash
cd /opt/snowgum && node -e "import('@electric-sql/pglite').then(m => console.log('ok:', typeof m.PGlite))"
```

Expected output: `ok: function`

- [ ] **Step 3: Commit**

```bash
cd /opt/snowgum && git add package.json package-lock.json && git commit -m "chore: add @electric-sql/pglite for integration test harness"
```

---

## Task 2: Minimal `createTestDb` helper

**Files:**
- Create: `src/db/test-db.ts`
- Create: `src/db/__tests__/test-db.integration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/db/__tests__/test-db.integration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "../test-db";

describe("createTestDb", () => {
  it("returns a drizzle client that can run SELECT 1", async () => {
    const { db } = await createTestDb();
    const result = await db.execute(sql`SELECT 1 AS n`);
    // pglite returns rows under `.rows`
    expect((result as unknown as { rows: { n: number }[] }).rows[0].n).toBe(1);
  });

  it("has run migrations — organisations table exists", async () => {
    const { db } = await createTestDb();
    const result = await db.execute(
      sql`SELECT to_regclass('public.organisations') AS tbl`
    );
    const row = (result as unknown as { rows: { tbl: string | null }[] }).rows[0];
    expect(row.tbl).toBe("organisations");
  });
});
```

- [ ] **Step 2: Run the test — it must fail because `test-db.ts` does not exist yet**

```bash
cd /opt/snowgum && npx vitest run src/db/__tests__/test-db.integration.test.ts
```

Expected: FAIL with `Cannot find module '../test-db'` or similar.

(Note: this test will also be excluded by the default `vitest.config.ts` once Task 6 lands. For now the default config matches `*.test.ts` which does NOT match `*.integration.test.ts`, so the test will simply not be discovered. Force-run it with an explicit path as shown.)

- [ ] **Step 3: Create `src/db/test-db.ts` with minimal implementation**

```ts
import path from "path";
import { fileURLToPath } from "url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

export type TestDb = PgliteDatabase<typeof schema>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../drizzle");

export async function createTestDb(): Promise<{
  db: TestDb;
  client: PGlite;
}> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, client };
}
```

- [ ] **Step 4: Run the test again**

```bash
cd /opt/snowgum && npx vitest run src/db/__tests__/test-db.integration.test.ts
```

Expected: both tests PASS.

If migrations fail because pglite rejects some SQL in the `drizzle/*.sql` files, STOP and triage. Record the failing migration and the error, and do not proceed. Likely culprits: custom extensions, unsupported functions, or `generated always as identity`. Fix direction: either patch the migration to be pglite-compatible, or switch the harness to testcontainers (out of scope for this plan — raise it as a blocker).

- [ ] **Step 5: Commit**

```bash
cd /opt/snowgum && git add src/db/test-db.ts src/db/__tests__/test-db.integration.test.ts && git commit -m "test: add createTestDb pglite harness with migration runner"
```

---

## Task 3: `truncateAll` helper for test isolation

**Files:**
- Modify: `src/db/test-db.ts`
- Modify: `src/db/__tests__/test-db.integration.test.ts`

- [ ] **Step 1: Add a failing test for `truncateAll`**

Append to `src/db/__tests__/test-db.integration.test.ts`:

```ts
import { truncateAll } from "../test-db";
import { organisations } from "../schema";

describe("truncateAll", () => {
  it("removes all rows from every table", async () => {
    const { db } = await createTestDb();
    await db.insert(organisations).values({
      name: "Test Org",
      slug: "test-org",
    });
    const before = await db.select().from(organisations);
    expect(before).toHaveLength(1);

    await truncateAll(db);

    const after = await db.select().from(organisations);
    expect(after).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — must fail**

```bash
cd /opt/snowgum && npx vitest run src/db/__tests__/test-db.integration.test.ts
```

Expected: FAIL with `truncateAll is not exported` or similar.

- [ ] **Step 3: Implement `truncateAll` in `src/db/test-db.ts`**

Append to `src/db/test-db.ts`:

```ts
import { sql } from "drizzle-orm";

// Every user-defined table in the schema. CASCADE makes order irrelevant,
// but we still list them explicitly so a new table added without updating
// this list causes a test failure rather than a silent data leak.
const ALL_TABLES = [
  "audit_log",
  "custom_field_values",
  "custom_fields",
  "communication_recipients",
  "communications",
  "communication_templates",
  "document_categories",
  "documents",
  "member_imports",
  "subscriptions",
  "transactions",
  "checkout_line_items",
  "one_off_charges",
  "charge_categories",
  "waitlist_entries",
  "availability_overrides",
  "availability_cache",
  "bed_holds",
  "booking_guests",
  "bookings",
  "booking_rounds",
  "tariffs",
  "seasons",
  "cancellation_policies",
  "financial_status_changes",
  "organisation_members",
  "members",
  "membership_classes",
  "beds",
  "rooms",
  "lodges",
  "organisations",
  "profiles",
] as const;

export async function truncateAll(db: TestDb): Promise<void> {
  const list = ALL_TABLES.map((t) => `"${t}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`));
}
```

- [ ] **Step 4: Run — must pass**

```bash
cd /opt/snowgum && npx vitest run src/db/__tests__/test-db.integration.test.ts
```

Expected: 3/3 tests pass.

If the TRUNCATE fails because a new table has been added to the schema since this plan was written, add the table name to `ALL_TABLES` in alphabetical order within its dependency group, and re-run. Do not silence the error.

- [ ] **Step 5: Commit**

```bash
cd /opt/snowgum && git add src/db/test-db.ts src/db/__tests__/test-db.integration.test.ts && git commit -m "test: add truncateAll helper for per-test isolation"
```

---

## Task 4: Integration vitest config

**Files:**
- Create: `vitest.integration.config.ts`
- Modify: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Create `vitest.integration.config.ts`**

```ts
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
    // the same process.
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Registered in Task 5.
    setupFiles: ["src/db/test-setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 2: Exclude integration tests from the default unit config**

Edit `vitest.config.ts`. Replace the `include` line with:

```ts
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "__tests__/**/*.test.ts"],
    exclude: ["node_modules", ".next", "src/**/*.integration.test.ts"],
```

Full file after edit:

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "__tests__/**/*.test.ts"],
    exclude: ["node_modules", ".next", "src/**/*.integration.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/lib/**", "src/actions/**", "src/db/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 3: Add the `test:integration` script**

Edit `package.json`. In the `scripts` block, add after the existing `test:coverage` line:

```json
    "test:integration": "vitest run --config vitest.integration.config.ts",
```

- [ ] **Step 4: Verify the default unit suite still excludes integration tests**

```bash
cd /opt/snowgum && npm test -- --reporter=basic 2>&1 | tail -20
```

Expected: the existing unit-test count runs. The new `src/db/__tests__/test-db.integration.test.ts` must NOT appear in the run (it is excluded by pattern).

- [ ] **Step 5: Verify the integration config runs the integration test**

```bash
cd /opt/snowgum && npm run test:integration 2>&1 | tail -30
```

Expected: the 3 tests from Task 2/3 run and pass.

Note: `test-setup.ts` does not exist yet, so vitest will warn about a missing setup file. That is expected and is fixed in Task 5. If the warning causes a hard failure on your vitest version, temporarily remove the `setupFiles` line from `vitest.integration.config.ts` for this verification, then restore it before committing.

- [ ] **Step 6: Commit**

```bash
cd /opt/snowgum && git add vitest.integration.config.ts vitest.config.ts package.json && git commit -m "test: add separate vitest config for integration tests"
```

---

## Task 5: Global `@/db` mock via setup file

**Files:**
- Create: `src/db/test-setup.ts`
- Create: `src/actions/availability/__tests__/get-season-for-dates.integration.test.ts`

This task wires the pglite instance into the rest of the codebase by mocking `@/db/index` globally for every integration test. A single pglite is shared across all test files in the run; `afterEach` truncates between tests for isolation.

- [ ] **Step 1: Create `src/db/test-setup.ts`**

```ts
// Vitest setup file — runs ONCE before any integration test in the run,
// because vitest.integration.config.ts uses singleFork: true.
//
// Responsibility:
//   1. Build a single pglite instance with migrations applied.
//   2. Register it as the mock for @/db and @/db/index so any server action
//      under test picks it up automatically.
//   3. Truncate all tables after every test for isolation.

import { afterEach, vi } from "vitest";
import { createTestDb, truncateAll, type TestDb } from "./test-db";

// Build the db once. Exported so individual tests can seed rows directly
// without going through the mocked @/db import.
let sharedDb: TestDb | undefined;

async function getSharedDb(): Promise<TestDb> {
  if (!sharedDb) {
    const { db } = await createTestDb();
    sharedDb = db;
  }
  return sharedDb;
}

// Both import paths must be mocked because production code uses both.
// `@/db` resolves to src/db/index.ts via Node index-resolution, but vitest
// treats the two specifiers as separate mock keys.
vi.mock("@/db/index", async () => ({ db: await getSharedDb() }));
vi.mock("@/db", async () => ({ db: await getSharedDb() }));

afterEach(async () => {
  const db = await getSharedDb();
  await truncateAll(db);
});

// Export for tests that want direct access to seed rows.
export async function getTestDb(): Promise<TestDb> {
  return getSharedDb();
}
```

- [ ] **Step 2: Write a failing integration test for `getSeasonForDates`**

Create `src/actions/availability/__tests__/get-season-for-dates.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getSeasonForDates } from "../validation-helpers";
import { getTestDb } from "@/db/test-setup";
import { organisations, lodges, seasons } from "@/db/schema";

describe("getSeasonForDates (integration)", () => {
  let orgId: string;
  let lodgeId: string;

  beforeEach(async () => {
    const db = await getTestDb();
    const [org] = await db
      .insert(organisations)
      .values({ name: "Test Club", slug: "test-club" })
      .returning();
    orgId = org.id;

    const [lodge] = await db
      .insert(lodges)
      .values({
        organisationId: orgId,
        name: "Test Lodge",
        slug: "test-lodge",
      })
      .returning();
    lodgeId = lodge.id;

    await db.insert(seasons).values({
      organisationId: orgId,
      name: "2026 Winter",
      startDate: "2026-06-01",
      endDate: "2026-10-01",
      isActive: true,
    });
  });

  it("returns the season when check-in and check-out fall within it", async () => {
    const season = await getSeasonForDates(lodgeId, "2026-07-10", "2026-07-15");
    expect(season).not.toBeNull();
    expect(season?.name).toBe("2026 Winter");
  });

  it("returns null when dates fall outside any active season", async () => {
    const season = await getSeasonForDates(lodgeId, "2026-12-01", "2026-12-05");
    expect(season).toBeNull();
  });

  it("returns null when the spanning season is inactive", async () => {
    const db = await getTestDb();
    await db.insert(seasons).values({
      organisationId: orgId,
      name: "2025 Winter (archived)",
      startDate: "2025-06-01",
      endDate: "2025-10-01",
      isActive: false,
    });
    const season = await getSeasonForDates(lodgeId, "2025-07-10", "2025-07-15");
    expect(season).toBeNull();
  });
});
```

If any insert above fails because a required column is missing (the schema may require additional NOT NULL fields not listed here — e.g. `organisations.contactEmail`, `lodges.address`, `seasons.organisationId`), inspect `src/db/schema/organisations.ts`, `src/db/schema/lodges.ts`, and `src/db/schema/seasons.ts` and add the required values. Do not weaken the schema to make the test pass.

- [ ] **Step 3: Run — must fail until setup is picked up**

```bash
cd /opt/snowgum && npm run test:integration 2>&1 | tail -40
```

Expected: the test may fail with "cannot find module @/db/test-setup" because vitest may not resolve the setup alias. If that happens, change the import in the test to a relative path: `import { getTestDb } from "../../../db/test-setup";`. If it runs and fails for a different reason (schema shape), fix the seed values per Step 2's note and re-run.

Also verify: the `describe` suite for `get-season-for-dates` appears in the run output. That proves `vitest.integration.config.ts` is finding the new test file.

- [ ] **Step 4: Make the test pass**

If the schema inserts need extra fields, update the test file. If the `@/db/test-setup` alias path doesn't resolve, switch that single import line to a relative path.

Then run:

```bash
cd /opt/snowgum && npm run test:integration 2>&1 | tail -40
```

Expected: 3/3 `get-season-for-dates` tests pass in addition to the earlier `test-db` tests.

- [ ] **Step 5: Prove isolation — tests don't leak across cases**

Add one more test case at the end of the `describe` block to verify `afterEach` truncates:

```ts
  it("sees no rows from prior test cases — isolation check", async () => {
    const db = await getTestDb();
    const rows = await db.select().from(seasons);
    // `beforeEach` seeds exactly one season; prior test cases' second inserts
    // must not survive here.
    expect(rows).toHaveLength(1);
  });
```

```bash
cd /opt/snowgum && npm run test:integration 2>&1 | tail -40
```

Expected: the new test passes. If it sees more than one season, `afterEach` truncation is not running, or test ordering is wrong — STOP and debug `test-setup.ts` before continuing.

- [ ] **Step 6: Commit**

```bash
cd /opt/snowgum && git add src/db/test-setup.ts src/actions/availability/__tests__/get-season-for-dates.integration.test.ts && git commit -m "test: wire pglite into @/db via vi.mock setup file"
```

---

## Task 6: Verify default unit suite still green

**Files:**
- None (verification only)

- [ ] **Step 1: Run full unit suite**

```bash
cd /opt/snowgum && npm test 2>&1 | tail -20
```

Expected: the pre-existing unit-test count passes. Compare against the most recent known-good count (706/706 as of Phase 23 completion per the project memory). If the count differs because new tests were added between then and now, that is fine — the expectation is "all pass," not "exact count."

- [ ] **Step 2: Confirm no integration tests leaked into the unit run**

```bash
cd /opt/snowgum && npm test 2>&1 | grep -c "integration.test" || echo "0"
```

Expected output: `0`. If this is non-zero, `vitest.config.ts`'s exclude pattern isn't working — fix before proceeding.

- [ ] **Step 3: Run the integration suite one more time**

```bash
cd /opt/snowgum && npm run test:integration 2>&1 | tail -20
```

Expected: all integration tests pass (Task 2, Task 3, Task 5 tests).

- [ ] **Step 4: No commit needed — verification only**

---

## Task 7: Write `docs/testing.md` convention

**Files:**
- Create: `docs/testing.md`

This task establishes the written convention that will be enforced on future phases. It names the antipatterns from the code review so they can be cited in PR review.

- [ ] **Step 1: Create `docs/testing.md`**

```markdown
# Testing Conventions

Snow Gum has three layers of automated tests. Each layer has a specific
purpose and a specific set of rules. Violations of these rules — especially
the banned patterns — are blocking PR review comments.

## The three layers

### 1. Unit tests — `*.test.ts`

**Purpose:** verify pure functions, Zod schemas, formatters, pricing math,
date utilities, email/SMS template rendering, and thin adapters.

**Rules:**
- Prefer real inputs and real outputs. Mock only what is strictly necessary.
- Do NOT mock `@/db`. If your test needs the database, it is an integration
  test — see layer 2.
- Every side-effect assertion must verify the payload, not just the call.
  Use `toHaveBeenCalledWith(expect.objectContaining({ ... }))`. Bare
  `toHaveBeenCalled()` is acceptable only for negative assertions
  (`expect(x).not.toHaveBeenCalled()`).
- Error paths must assert on the error message string, not just that an
  error was thrown.

### 2. Integration tests — `*.integration.test.ts`

**Purpose:** verify server actions that read or write the database. This
includes tenant scoping (WHERE clauses), transaction boundaries, availability
concurrency, and anything that constructs SQL.

**Infrastructure:** `@electric-sql/pglite` runs an in-memory Postgres inside
the vitest process. Migrations from `drizzle/` are applied once per run.
Tables are truncated between tests. See `src/db/test-db.ts` and
`src/db/test-setup.ts`.

**Run:** `npm run test:integration`

**Rules:**
- File name ends in `.integration.test.ts`. The default `npm test` skips
  these. Never put an integration test under `*.test.ts` — it will slow the
  unit loop and break in environments without pglite.
- Seed rows with real `db.insert().values()` calls. Do not use fixtures
  unless a fixture is shared across ≥3 files.
- Assert on what the DB actually contains after the action runs. A passing
  integration test must be able to fail if the action writes the wrong
  organisationId, the wrong amount, or the wrong status.
- Cross-tenant leak tests are mandatory for any action that takes an
  `organisationId`: seed rows in two orgs, call the action with org A,
  verify org B rows are untouched.

### 3. End-to-end tests — `e2e/tests/*.spec.ts`

**Purpose:** verify the happy path of user-visible workflows through the
browser.

**Rules:**
- Every test must complete a meaningful state-changing workflow and verify
  the new state. "Page renders" is not an assertion.
- If a precondition isn't met, fail the test. Do not wrap assertions in
  `if (await element.isVisible())` — that makes the test unfalsifiable.
- Seed data via fixtures in `e2e/tests/auth.setup.ts` or per-test setup,
  not by navigating through the UI to create the preconditions.

---

## Banned antipatterns

The following patterns appear in the current codebase and must not appear in
new code. Existing instances will be replaced over time as part of the
hardening work.

### B1. The `selectCallCount` positional mock

**Banned.** Example of the banned pattern, paraphrased from
`src/actions/bookings/__tests__/cancel.test.ts`:

```ts
let selectCallCount = 0;
vi.mocked(db.select).mockImplementation(() => {
  selectCallCount++;
  if (selectCallCount === 1) return { /* booking row */ };
  if (selectCallCount === 2) return { /* cancellation policy row */ };
  // ...
});
```

**Why banned:** the test is coupled to the order of SELECT statements in
the SUT, not to their WHERE clauses. Refactoring the SUT to fetch rows in
a different order breaks every test. More importantly, the WHERE clauses
themselves are never verified — a missing `organisationId` filter (the
exact bug class the code review found across ~20 server actions) would
pass. The pattern gives maximum brittleness for minimum safety.

**Replacement:** write an integration test. The real DB validates the
WHERE clauses automatically.

### B2. Bare `toHaveBeenCalled()` for positive assertions

**Banned.** Example:

```ts
expect(mockDbInsert).toHaveBeenCalled();
expect(mockSendEmail).toHaveBeenCalled();
```

**Why banned:** a bug that inserts the wrong row or emails the wrong
person passes this assertion. The review found 216 occurrences across 56
files in the current codebase.

**Replacement:**

```ts
expect(mockDbInsert).toHaveBeenCalledWith(
  expect.objectContaining({
    organisationId: org.id,
    amountCents: 5000,
    type: "PAYMENT",
  }),
);
```

For complex payloads use `expect.objectContaining` with the fields that
actually matter. Negative assertions (`.not.toHaveBeenCalled()`) are fine
as-is.

### B3. Only asserting `result.success === true`

**Banned as the sole assertion for a happy path.** If an action returns
a success flag, tests must also verify at least one side effect: a DB
write (`toHaveBeenCalledWith`), an email (`toHaveBeenCalledWith`), or the
shape of the returned payload (e.g. `result.newTotalAmountCents`).

### B4. `if (await element.isVisible())` around E2E assertions

**Banned.** Example from `e2e/tests/admin-bookings.spec.ts`:

```ts
const approveButton = page.getByRole("button", { name: /approve/i });
if (await approveButton.isVisible()) {
  await approveButton.click();
  // ... assertions
}
```

**Why banned:** if the precondition isn't met, the test silently passes
without running any assertion. Tests must fail when their subject is
missing.

**Replacement:** fail explicitly, or seed the precondition:

```ts
await expect(approveButton).toBeVisible();  // fails if not present
await approveButton.click();
```

### B5. `expect(x || y || true).toBeTruthy()` (or anything equivalent)

**Banned.** The `|| true` makes the assertion tautologically true. This
was written once in `e2e/tests/member-booking-edit.spec.ts` and must not
appear again. The automated reviewer will flag any `expect(...|| true)`
pattern in diffs.

### B6. Mocking drizzle operators

**Banned.** Example from `src/actions/reports/revenue-summary.test.ts`:

```ts
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  sql: vi.fn(),
}));
```

**Why banned:** this mocks away the query construction entirely. The test
then asserts on hardcoded result rows, proving nothing about the SQL the
SUT would execute in production.

**Replacement:** integration test. Let real drizzle build real SQL against
a real pglite DB.

---

## When in doubt

- Touching the DB? → integration test.
- Pure function with no IO? → unit test.
- Rendering a React Email template? → unit test (snapshot or payload).
- Stripe Session payload? → unit test with
  `toHaveBeenCalledWith(expect.objectContaining({ application_fee_amount, transfer_data, ... }))`.
- A workflow a user clicks through? → E2E.
- Concurrency or transaction semantics? → integration test.

If you're writing a test and find yourself mocking `@/db`, stop and write
an integration test instead.
```

- [ ] **Step 2: Commit**

```bash
cd /opt/snowgum && git add docs/testing.md && git commit -m "docs: add testing conventions banning mock-theatre patterns"
```

---

## Task 8: Link `docs/testing.md` from `AGENTS.md`

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Read the current file**

```bash
cd /opt/snowgum && cat AGENTS.md
```

Expected: the file currently contains only the Next.js rules block.

- [ ] **Step 2: Append a testing section**

Replace the contents of `/opt/snowgum/AGENTS.md` with:

```markdown
<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Testing

Read `docs/testing.md` before writing any test. It distinguishes unit /
integration / E2E tests, lists the banned mock-theatre antipatterns by name,
and documents the pglite integration harness. Violations block PR review.

Commands:
- `npm test` — unit tests (fast, no DB)
- `npm run test:integration` — integration tests (pglite, slower)
- `npm run test:e2e` — Playwright E2E
```

- [ ] **Step 3: Verify the file**

```bash
cd /opt/snowgum && cat AGENTS.md
```

Expected: the Next.js block is preserved, followed by the new Testing section.

- [ ] **Step 4: Commit**

```bash
cd /opt/snowgum && git add AGENTS.md && git commit -m "docs: link AGENTS.md to new testing conventions"
```

---

## Task 9: Final verification

**Files:**
- None (verification only)

- [ ] **Step 1: Clean unit run**

```bash
cd /opt/snowgum && npm test 2>&1 | tail -10
```

Expected: all unit tests pass. The run does NOT include any `*.integration.test.ts` files.

- [ ] **Step 2: Clean integration run**

```bash
cd /opt/snowgum && npm run test:integration 2>&1 | tail -20
```

Expected:
- `src/db/__tests__/test-db.integration.test.ts` — 3 tests pass
- `src/actions/availability/__tests__/get-season-for-dates.integration.test.ts` — 4 tests pass
- Total: 7 integration tests, 7 pass, 0 fail.

- [ ] **Step 3: Full check**

```bash
cd /opt/snowgum && npm run check 2>&1 | tail -10
```

Expected: lint + unit test + build all succeed. If `check` does not include `test:integration`, that is fine — integration tests will be wired into CI as a separate step in the hardening rollout, not in this plan.

- [ ] **Step 4: Review the commits**

```bash
cd /opt/snowgum && git log --oneline HEAD~8..HEAD
```

Expected: 8 commits spanning pglite install, `createTestDb`, `truncateAll`, vitest integration config, setup file + first integration test, testing docs, AGENTS.md link. (Task 6 is verification-only and does not add a commit.)

---

## What this plan does NOT do

All of the following are explicitly out of scope and belong to follow-up plans:

1. **Auth wrapper rollout** across ~25 server actions (plan: next).
2. **Capacity lock + `CHECK` constraint** on `availability_cache`.
3. **Stripe refund outbox / two-phase commit** for refund-after-commit bugs.
4. **Transactional email outbox** replacing `sendEmail` fire-and-forget.
5. **Webhook signature verification** for Resend and Telnyx.
6. **Rewriting existing mock-theatre tests.** The review listed ~10 files
   to delete or rewrite; this plan only provides the replacement pattern.
   The rewrites happen inside the auth-wrapper and money-fix plans as
   supporting work.
7. **Integration tests for the 12 high-value actions.** This plan lays one
   representative integration test (`getSeasonForDates`); the broader
   coverage is added alongside the fix for each Critical finding.

---

## Reuse existing code

- `drizzle/` migration files — unchanged, run against pglite via the built-in `drizzle-orm/pglite/migrator`.
- `src/db/schema/*.ts` — unchanged, imported as-is by `test-db.ts`.
- `vitest.config.ts` — modified only to exclude `*.integration.test.ts` from the unit run.
- `AGENTS.md` — existing Next.js rules block preserved verbatim.

## Risk register

- **Migrations may be pglite-incompatible.** 15 migration files span Phases 6–23. If pglite chokes on any of them, Task 2 Step 4 fails and the plan stops. Fix direction: patch the offending migration if possible, otherwise raise switching to testcontainers as a blocker.
- **Schema shape may have changed since this plan was written.** The seed data in Task 5 assumes specific required fields on `organisations`, `lodges`, `seasons`. Check the live schema before running Task 5 and adjust seed values if a NOT NULL column has been added.
- **vi.mock alias resolution.** Some vitest versions resolve `@/db/index` and `@/db` to the same mock key; others treat them as separate. The plan mocks both paths defensively. If a third import shape (e.g. `../db`) appears somewhere, add it to `test-setup.ts`.
- **Single-worker run.** `vitest.integration.config.ts` uses `singleFork: true` because the pglite instance and the mock must share a process. This serialises integration tests; acceptable at current scale (~dozen integration tests expected before the next plan).
