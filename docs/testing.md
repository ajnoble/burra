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
