# Auth Guards Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce `requireSession` / `requireRole` / `AuthError` guards, plus a supabase-auth mock for the integration test harness, then apply the guards to the 10 highest-risk server actions (cross-tenant mass-assignment + role-gap bugs) — each fix verified by a red/green integration test that exercises the real cross-tenant attack path.

**Architecture:** A tiny procedural guard layer in `src/lib/auth-guards.ts` (three exports: `requireSession`, `requireRole`, `AuthError` + helper `authErrorToResult`). Each server action wraps its body in `try { ... } catch (e) { const r = authErrorToResult(e); if (r) return r; throw e; }` and calls the guards at the top. The supabase client used by `getSessionMember` is mocked by the integration test setup file via a module-level `currentTestUserEmail` + exported `signInAs(email)` helper; `getSessionMember` itself runs for real against the pglite DB. This plan does NOT introduce a higher-order wrapper (e.g. `guardedAction(...)`) — that's premature until we see more patterns.

**Tech Stack:** TypeScript · Next.js 16 server actions · Supabase auth · Drizzle ORM + pglite (via the integration harness from the prior plan)

**Non-goals:**
- Fixing every mass-assignment bug. This plan fixes the 10 highest-severity ones. A follow-up plan will cover the remaining ~15.
- Rewriting existing unit tests that mock-theatre the auth path (`vi.mock("@/lib/auth")`). Those tests become redundant once the integration tests exist; delete or leave them for a test cleanup pass.
- A HOF wrapper (`guardedAction(opts, handler)`). Adopt after this plan proves the pattern.
- Changing call sites. Client components that pass `organisationId` to these actions are unchanged; the organisationId is now used to VALIDATE the session, not to trust the caller.
- Fixing callers that swallow action errors without surfacing them — out of scope.

**Assumed reader:** Skilled TypeScript developer, knows Drizzle basics, has read `docs/testing.md` and knows the pglite integration harness exists.

**Prerequisite:** The integration test layer (prior plan) must be merged or this plan must be branched off a commit that includes it. This plan continues on the same `hardening/integration-test-layer` branch; if the prior plan has merged, rebase onto `main` first.

---

## File structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/auth-guards.ts` | **create** | `AuthError` class, `requireSession(orgId)`, `requireRole(session, minRole)`, `authErrorToResult(e)`. No other exports. |
| `src/lib/__tests__/auth-guards.test.ts` | **create** | Unit tests for `requireRole` ordering, `AuthError` shape, `authErrorToResult` discrimination. Does NOT test `requireSession` — that's integration-only because it needs real DB + supabase mock. |
| `src/db/test-setup.ts` | **modify** | Add supabase `createClient` mock + `signInAs(email)` + `afterEach(() => signInAs(null))` reset. |
| `src/lib/__tests__/auth-guards.integration.test.ts` | **create** | Proves `requireSession` end-to-end against real DB with real `getSessionMember`. Covers: signed-out, cross-tenant, happy path, inactive membership. |
| `src/actions/bookings/cancel.ts` | **modify** | Add guards to `cancelBooking`. Min role: `BOOKING_OFFICER`. |
| `src/actions/bookings/cancel.integration.test.ts` (co-located under `__tests__/`) | **create** | Red-green test: cross-tenant attack rejected; org-member-no-role rejected; admin succeeds. |
| `src/actions/bookings/admin-notes.ts` | **modify** | Add guards to `updateBookingAdminNotes`. Min role: `BOOKING_OFFICER`. |
| `src/actions/bookings/__tests__/admin-notes.integration.test.ts` | **create** | Red-green: cross-tenant rejected, admin succeeds. |
| `src/actions/bookings/reassign-beds.ts` | **modify** | Add guards. Min role: `BOOKING_OFFICER`. |
| `src/actions/bookings/__tests__/reassign-beds.integration.test.ts` | **create** | Red-green. |
| `src/actions/lodges/index.ts` | **modify** | Add guards to `createLodge`, `updateLodge`, `deleteLodge`. Min role: `ADMIN`. |
| `src/actions/lodges/__tests__/lodges.integration.test.ts` | **create** | Red-green for `createLodge` only (the other two share the exact same guard line — no need to test each). |
| `src/actions/members/create.ts` | **modify** | Add guards. Min role: `COMMITTEE`. |
| `src/actions/members/__tests__/create.integration.test.ts` | **create** | Red-green. |
| `src/actions/members/import.ts` | **modify** | Add guards. Min role: `ADMIN`. |
| `src/actions/members/__tests__/import.integration.test.ts` | **create** | Red-green for auth only — existing import business logic unchanged. |
| `src/actions/organisations/update.ts` | **modify** | Add guards. Min role: `ADMIN`. This one ALSO fixes a role-gap bug, not just mass-assignment. |
| `src/actions/organisations/__tests__/update.integration.test.ts` | **create** | Red-green: non-admin member of correct org rejected; cross-tenant rejected; admin succeeds. |
| `src/actions/organisations/update-gst.ts` | **modify** | Add guards. Min role: `ADMIN`. |
| `src/actions/organisations/__tests__/update-gst.integration.test.ts` | **create** | Red-green. |
| `src/actions/reports/revenue-summary.ts` | **modify** | Add guards to `getRevenueSummary`. Min role: `COMMITTEE`. |
| `src/actions/reports/__tests__/revenue-summary.integration.test.ts` | **create** | Red-green: cross-tenant rejected (financial data leak); BOOKING_OFFICER rejected (too low); COMMITTEE succeeds. |
| `src/actions/reports/booking-summary.ts` | **modify** | Add guards. Min role: `COMMITTEE`. |
| `src/actions/reports/__tests__/booking-summary.integration.test.ts` | **create** | Red-green. |
| `docs/auth.md` | **create** | Written pattern doc. Referenced from `AGENTS.md`. |
| `AGENTS.md` | **modify** | Add one-line pointer to `docs/auth.md`. |

---

## Task 1: Create auth-guards module with unit tests

**Files:**
- Create: `src/lib/auth-guards.ts`
- Create: `src/lib/__tests__/auth-guards.test.ts`

- [ ] **Step 1: Write the failing unit test**

Create `src/lib/__tests__/auth-guards.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  AuthError,
  requireRole,
  authErrorToResult,
  type SessionLike,
} from "../auth-guards";

function session(role: SessionLike["role"]): SessionLike {
  return {
    memberId: "m1",
    organisationId: "o1",
    role,
    firstName: "X",
    lastName: "Y",
    email: "x@y",
  };
}

describe("AuthError", () => {
  it("has a code field that discriminates UNAUTHORISED vs FORBIDDEN", () => {
    const unauth = new AuthError("UNAUTHORISED", "signed out");
    const forbid = new AuthError("FORBIDDEN", "wrong role");
    expect(unauth.code).toBe("UNAUTHORISED");
    expect(forbid.code).toBe("FORBIDDEN");
    expect(unauth).toBeInstanceOf(Error);
  });
});

describe("requireRole", () => {
  const ORDER = ["MEMBER", "BOOKING_OFFICER", "COMMITTEE", "ADMIN"] as const;

  it("passes when session role equals required", () => {
    for (const r of ORDER) {
      expect(() => requireRole(session(r), r)).not.toThrow();
    }
  });

  it("passes when session role is above required", () => {
    expect(() => requireRole(session("ADMIN"), "COMMITTEE")).not.toThrow();
    expect(() => requireRole(session("COMMITTEE"), "BOOKING_OFFICER")).not.toThrow();
    expect(() => requireRole(session("BOOKING_OFFICER"), "MEMBER")).not.toThrow();
  });

  it("throws FORBIDDEN when session role is below required", () => {
    expect(() => requireRole(session("MEMBER"), "BOOKING_OFFICER")).toThrow(
      AuthError
    );
    try {
      requireRole(session("BOOKING_OFFICER"), "ADMIN");
    } catch (e) {
      expect((e as AuthError).code).toBe("FORBIDDEN");
    }
  });
});

describe("authErrorToResult", () => {
  it("converts AuthError to a { success: false, error } shape", () => {
    const e = new AuthError("FORBIDDEN", "Requires ADMIN");
    expect(authErrorToResult(e)).toEqual({
      success: false,
      error: "Requires ADMIN",
    });
  });

  it("returns null for non-AuthError values (caller re-throws)", () => {
    expect(authErrorToResult(new Error("kaboom"))).toBeNull();
    expect(authErrorToResult("string")).toBeNull();
    expect(authErrorToResult(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test — expected to fail**

```bash
cd /opt/snowgum && npx vitest run src/lib/__tests__/auth-guards.test.ts 2>&1 | tail -10
```

Expected: fail with "Cannot find module '../auth-guards'".

- [ ] **Step 3: Create `src/lib/auth-guards.ts`**

```ts
import { getSessionMember, type SessionMember } from "@/lib/auth";

// The shape requireRole operates on. Kept as a structural type so tests
// can construct fixtures without going through getSessionMember.
export type SessionLike = Pick<
  SessionMember,
  "memberId" | "organisationId" | "role" | "firstName" | "lastName" | "email"
>;

export type Role = SessionMember["role"];

export type AuthErrorCode = "UNAUTHORISED" | "FORBIDDEN";

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}

const ROLE_ORDER: Record<Role, number> = {
  MEMBER: 0,
  BOOKING_OFFICER: 1,
  COMMITTEE: 2,
  ADMIN: 3,
};

/**
 * Fetch the current session and assert it belongs to `organisationId`.
 * Throws AuthError("UNAUTHORISED") if no user is signed in, or if the
 * signed-in user is not an active member of the organisation. The
 * returned SessionMember is safe to trust for org-scoped work.
 */
export async function requireSession(
  organisationId: string
): Promise<SessionMember> {
  const session = await getSessionMember(organisationId);
  if (!session) {
    throw new AuthError(
      "UNAUTHORISED",
      "You must be signed in to this organisation"
    );
  }
  return session;
}

/**
 * Assert that `session.role` is at or above `minRole`. Role order:
 * MEMBER < BOOKING_OFFICER < COMMITTEE < ADMIN. Throws
 * AuthError("FORBIDDEN") otherwise.
 */
export function requireRole(session: SessionLike, minRole: Role): void {
  if (ROLE_ORDER[session.role] < ROLE_ORDER[minRole]) {
    throw new AuthError(
      "FORBIDDEN",
      `This action requires ${minRole} role or higher`
    );
  }
}

/**
 * If `e` is an AuthError, return the standard server-action error shape.
 * Otherwise return null so the caller can re-throw (unhandled errors
 * should still crash the action).
 */
export function authErrorToResult(
  e: unknown
): { success: false; error: string } | null {
  if (e instanceof AuthError) {
    return { success: false, error: e.message };
  }
  return null;
}
```

- [ ] **Step 4: Run the test — expected to pass**

```bash
cd /opt/snowgum && npx vitest run src/lib/__tests__/auth-guards.test.ts 2>&1 | tail -10
```

Expected: 3 test suites, 8+ tests pass.

- [ ] **Step 5: Commit**

```bash
cd /opt/snowgum && git add src/lib/auth-guards.ts src/lib/__tests__/auth-guards.test.ts && git commit -m "$(cat <<'EOF'
feat(auth): add AuthError + requireSession + requireRole guards

Introduces a minimal procedural guard layer for server actions.
requireSession wraps getSessionMember and throws AuthError("UNAUTHORISED")
when the signed-in user is not an active member of the target
organisation — the same call pins cross-tenant mass-assignment.
requireRole enforces a linear role order (MEMBER < BOOKING_OFFICER <
COMMITTEE < ADMIN). authErrorToResult adapts thrown AuthErrors to the
standard server-action { success: false, error } shape.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extend test-setup.ts with supabase auth mock

**Files:**
- Modify: `src/db/test-setup.ts`

- [ ] **Step 1: Read the current file**

```bash
cd /opt/snowgum && cat src/db/test-setup.ts
```

Expected: the file currently mocks `@/db` and `@/db/index` and exports `getTestDb`.

- [ ] **Step 2: Replace the file with the extended version**

Overwrite `src/db/test-setup.ts` with:

```ts
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
```

- [ ] **Step 3: Run the existing integration suite to verify no regressions**

```bash
cd /opt/snowgum && npm run test:integration 2>&1 | tail -15
```

Expected: the 7 existing tests still pass (the new supabase mock doesn't affect them because they don't call `createClient`).

- [ ] **Step 4: Commit**

```bash
cd /opt/snowgum && git add src/db/test-setup.ts && git commit -m "$(cat <<'EOF'
test: add supabase auth mock + signInAs helper to test-setup

Extends the integration test setup file with a vi.mock of
@/lib/supabase/server that serves a configurable test user via the
new signInAs(email) helper. The mock exposes exactly the shape
getSessionMember consumes (client.auth.getUser()) and is reset to
signed-out in afterEach. Enables integration tests for actions that
call requireSession / getSessionMember.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Integration test for requireSession end-to-end

**Files:**
- Create: `src/lib/__tests__/auth-guards.integration.test.ts`

This test proves the whole auth stack works: mocked supabase → real getSessionMember → real pglite → real guard.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/auth-guards.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { requireSession, AuthError } from "../auth-guards";
import { getTestDb, signInAs } from "../../db/test-setup";
import {
  organisations,
  members,
  organisationMembers,
} from "../../db/schema";

describe("requireSession (integration)", () => {
  let orgAId: string;
  let orgBId: string;

  beforeEach(async () => {
    const db = await getTestDb();

    const [orgA] = await db
      .insert(organisations)
      .values({ name: "Org A", slug: "org-a" })
      .returning();
    orgAId = orgA.id;

    const [orgB] = await db
      .insert(organisations)
      .values({ name: "Org B", slug: "org-b" })
      .returning();
    orgBId = orgB.id;

    // Alice is a member of Org A only.
    const [alice] = await db
      .insert(members)
      .values({
        organisationId: orgAId,
        firstName: "Alice",
        lastName: "A",
        email: "alice@test",
      })
      .returning();
    await db.insert(organisationMembers).values({
      organisationId: orgAId,
      memberId: alice.id,
      role: "ADMIN",
      isActive: true,
    });
  });

  it("throws UNAUTHORISED when no user is signed in", async () => {
    signInAs(null);
    await expect(requireSession(orgAId)).rejects.toThrow(AuthError);
    try {
      await requireSession(orgAId);
    } catch (e) {
      expect((e as AuthError).code).toBe("UNAUTHORISED");
    }
  });

  it("throws UNAUTHORISED when signed-in user is not a member of the org", async () => {
    signInAs("stranger@test");
    await expect(requireSession(orgAId)).rejects.toThrow(AuthError);
  });

  it("throws UNAUTHORISED for cross-tenant attempts (Alice is in Org A, not Org B)", async () => {
    signInAs("alice@test");
    await expect(requireSession(orgBId)).rejects.toThrow(AuthError);
  });

  it("returns the session when signed-in user is an active member", async () => {
    signInAs("alice@test");
    const session = await requireSession(orgAId);
    expect(session.email).toBe("alice@test");
    expect(session.organisationId).toBe(orgAId);
    expect(session.role).toBe("ADMIN");
  });

  it("throws UNAUTHORISED when membership row exists but is inactive", async () => {
    const db = await getTestDb();
    // Alice's existing active membership → deactivate it
    const { eq, and } = await import("drizzle-orm");
    await db
      .update(organisationMembers)
      .set({ isActive: false })
      .where(
        and(
          eq(organisationMembers.organisationId, orgAId),
          eq(organisationMembers.memberId, /* Alice's id, looked up */ (
            await db
              .select({ id: members.id })
              .from(members)
              .where(eq(members.email, "alice@test"))
          )[0].id)
        )
      );
    signInAs("alice@test");
    await expect(requireSession(orgAId)).rejects.toThrow(AuthError);
  });
});
```

Note: the inactive-membership test does an inline lookup for Alice's member id. That's ugly; accepted here because it keeps the test self-contained without exporting test fixtures.

- [ ] **Step 2: Run the test — expected to pass**

```bash
cd /opt/snowgum && npm run test:integration 2>&1 | tail -20
```

Expected: 5 new tests pass (auth-guards integration), plus the 7 existing tests from the previous plan. Total: 12 integration tests.

If a test fails because `getSessionMember` can't find the `cache()` module or similar, the issue is that `getSessionMember` is defined with `cache(...)` from React which may not be importable in a node-only vitest process. If that happens, STOP and open an issue — the fix is to unwrap the `cache()` call, which is a change to `src/lib/auth.ts` that needs user input.

- [ ] **Step 3: Commit**

```bash
cd /opt/snowgum && git add src/lib/__tests__/auth-guards.integration.test.ts && git commit -m "$(cat <<'EOF'
test(auth): integration test for requireSession against real DB + mocked supabase

Exercises the whole auth stack end-to-end: signInAs() sets the mocked
supabase user, getSessionMember runs for real against the pglite DB,
and requireSession either returns the session or throws AuthError.
Covers signed-out, cross-tenant, inactive-membership, and happy path.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Document auth patterns in docs/auth.md

**Files:**
- Create: `docs/auth.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Create `docs/auth.md`**

```markdown
# Authentication & Authorisation

Every org-scoped server action must call `requireSession(organisationId)`
before reading or writing any data. Most must also call
`requireRole(session, minRole)` to enforce privilege level.

## The guards

From `src/lib/auth-guards.ts`:

- `requireSession(organisationId)` — throws `AuthError("UNAUTHORISED")` if
  the current user is not signed in OR is not an active member of the
  target organisation. Pins cross-tenant mass-assignment: if the caller
  passes a foreign `organisationId` in the input, the membership lookup
  fails and the request is rejected.
- `requireRole(session, minRole)` — throws `AuthError("FORBIDDEN")` if
  the session role is below the required threshold. Role order is
  `MEMBER < BOOKING_OFFICER < COMMITTEE < ADMIN`.
- `AuthError` — thrown by both guards. Has `.code` field which is either
  `"UNAUTHORISED"` or `"FORBIDDEN"`.
- `authErrorToResult(e)` — if `e` is an `AuthError`, returns the standard
  server-action `{ success: false, error }` shape. Otherwise returns
  `null` so the caller can re-throw.

## The pattern

Every org-scoped server action follows this shape:

```ts
import {
  requireSession,
  requireRole,
  authErrorToResult,
} from "@/lib/auth-guards";

export async function myAction(input: MyInput): Promise<MyResult> {
  try {
    const session = await requireSession(input.organisationId);
    requireRole(session, "BOOKING_OFFICER");

    // ... existing action body. Use session.memberId and
    // session.organisationId instead of trusting input values where
    // possible.
  } catch (e) {
    const authResult = authErrorToResult(e);
    if (authResult) return authResult as MyResult;
    throw e;
  }
}
```

The `as MyResult` cast is accepted because every server-action result
type must include the `{ success: false, error: string }` shape for
error handling anyway.

## Choosing minRole

| Role             | What they can do                                      |
|------------------|-------------------------------------------------------|
| `MEMBER`         | Book, cancel own booking, edit own profile            |
| `BOOKING_OFFICER`| All booking writes: cancel any, reassign beds, admin notes |
| `COMMITTEE`      | Reports, bulk comms, waitlist admin                   |
| `ADMIN`          | Organisation settings, lodges, members, subscription  |

When in doubt, pick the **higher** role. Downgrading is easy later;
upgrading after a bug is found is painful.

## When `requireSession` alone is sufficient

Member-facing actions (e.g. `memberEditBooking`, `memberCancelOwnBooking`)
call `requireSession` to establish the caller, then do additional
ownership checks (`booking.primaryMemberId === session.memberId`).
Don't use `requireRole` for these — a regular member's role doesn't
grant booking admin privileges, it's their ownership of the row.

## Testing

Every fix to this pattern gets an integration test that proves:
1. Cross-tenant attempt is rejected (the mass-assignment attack).
2. Same-org member without the required role is rejected (the role
   gap).
3. Same-org user with the required role succeeds.

See `src/lib/__tests__/auth-guards.integration.test.ts` for the
foundational test and `src/actions/bookings/__tests__/cancel.integration.test.ts`
for the action-level pattern.

## What NOT to do

- **Do not** check `session?.role === "ADMIN"` yourself. Use `requireRole`.
- **Do not** accept `organisationId` from input without calling
  `requireSession(input.organisationId)` first.
- **Do not** call `getSessionMember` directly in a server action.
  Always use `requireSession` so the throw path is consistent.
- **Do not** swallow `AuthError` with a generic catch. Use
  `authErrorToResult` to convert and re-throw unknown errors.
```

- [ ] **Step 2: Add a pointer from AGENTS.md**

Read current `AGENTS.md`:

```bash
cd /opt/snowgum && cat AGENTS.md
```

Append after the Testing section:

```markdown

# Authentication

Every org-scoped server action must call `requireSession(organisationId)`
from `@/lib/auth-guards` at entry. Most must also call
`requireRole(session, minRole)`. Read `docs/auth.md` before writing or
modifying any server action.
```

- [ ] **Step 3: Commit**

```bash
cd /opt/snowgum && git add docs/auth.md AGENTS.md && git commit -m "$(cat <<'EOF'
docs(auth): add auth-guards pattern doc and link from AGENTS.md

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Shared test helper: `seedOrgWithMember`

The ten action-fix tasks below all seed a similar fixture: an organisation,
a lodge, one member with a specific role. To avoid repeating this in every
test, each task inlines a small `seedOrgWithMember` helper at the top of
its test file. It's not worth extracting to a shared utility — per
`docs/testing.md` section 2, "Do not use fixtures unless a fixture is
shared across ≥3 files" and these are all self-contained per-file.

Template (adapt per test):

```ts
async function seedOrgWithMember(opts: {
  orgName: string;
  orgSlug: string;
  memberEmail: string;
  role: "MEMBER" | "BOOKING_OFFICER" | "COMMITTEE" | "ADMIN";
}) {
  const db = await getTestDb();
  const [org] = await db
    .insert(organisations)
    .values({ name: opts.orgName, slug: opts.orgSlug })
    .returning();
  const [member] = await db
    .insert(members)
    .values({
      organisationId: org.id,
      firstName: "Test",
      lastName: opts.memberEmail,
      email: opts.memberEmail,
    })
    .returning();
  await db.insert(organisationMembers).values({
    organisationId: org.id,
    memberId: member.id,
    role: opts.role,
    isActive: true,
  });
  return { orgId: org.id, memberId: member.id };
}
```

Action-specific tasks will extend this (e.g. Task 5 also seeds a lodge and
a booking) but share the basic org+member+role shape.

---

## Task 5: Fix `cancelBooking`

**Files:**
- Modify: `src/actions/bookings/cancel.ts`
- Create: `src/actions/bookings/__tests__/cancel.integration.test.ts`

`cancelBooking` currently accepts `organisationId` in input and uses it
in the WHERE clause of the booking lookup without verifying the caller's
session. Any authenticated user can cancel any booking in any org.

- [ ] **Step 1: Write the failing integration test**

Create `src/actions/bookings/__tests__/cancel.integration.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { cancelBooking } from "../cancel";
import { getTestDb, signInAs } from "../../../db/test-setup";
import {
  organisations,
  members,
  organisationMembers,
  lodges,
  bookings,
} from "../../../db/schema";

// Silence downstream side effects (email, stripe, audit) that cancel
// triggers after auth passes. The AuthError path returns before any of
// these, so the mocks only matter for the happy-path assertion.
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn() }));
vi.mock("@/actions/stripe/refund", () => ({
  processStripeRefund: vi.fn(async () => ({ success: true, refundId: "re_x" })),
}));
vi.mock("@/lib/audit-log", () => ({ createAuditLog: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

async function seedOrgLodgeBooking(opts: {
  orgName: string;
  orgSlug: string;
  memberEmail: string;
  role: "MEMBER" | "BOOKING_OFFICER" | "COMMITTEE" | "ADMIN";
}) {
  const db = await getTestDb();
  const [org] = await db
    .insert(organisations)
    .values({ name: opts.orgName, slug: opts.orgSlug })
    .returning();
  const [member] = await db
    .insert(members)
    .values({
      organisationId: org.id,
      firstName: "Test",
      lastName: opts.memberEmail,
      email: opts.memberEmail,
    })
    .returning();
  await db.insert(organisationMembers).values({
    organisationId: org.id,
    memberId: member.id,
    role: opts.role,
    isActive: true,
  });
  const [lodge] = await db
    .insert(lodges)
    .values({
      organisationId: org.id,
      name: "Main Lodge",
      totalBeds: 20,
    })
    .returning();
  const [booking] = await db
    .insert(bookings)
    .values({
      organisationId: org.id,
      lodgeId: lodge.id,
      primaryMemberId: member.id,
      bookingReference: `TST-${opts.orgSlug}`,
      checkInDate: "2026-07-10",
      checkOutDate: "2026-07-12",
      totalNights: 2,
      totalAmountCents: 10000,
      status: "CONFIRMED",
    })
    .returning();
  return { orgId: org.id, memberId: member.id, bookingId: booking.id };
}

describe("cancelBooking (integration — auth)", () => {
  it("rejects cross-tenant attempts (Org A member cancelling Org B booking)", async () => {
    const a = await seedOrgLodgeBooking({
      orgName: "Org A",
      orgSlug: "org-a",
      memberEmail: "admin-a@test",
      role: "ADMIN",
    });
    const b = await seedOrgLodgeBooking({
      orgName: "Org B",
      orgSlug: "org-b",
      memberEmail: "admin-b@test",
      role: "ADMIN",
    });
    signInAs("admin-a@test");
    const result = await cancelBooking({
      bookingId: b.bookingId,
      organisationId: b.orgId,
      cancelledByMemberId: a.memberId,
      reason: "attack",
      slug: "org-b",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/signed in/i);
  });

  it("rejects plain MEMBER trying to cancel any booking (role gap)", async () => {
    const a = await seedOrgLodgeBooking({
      orgName: "Org A",
      orgSlug: "org-a",
      memberEmail: "member-a@test",
      role: "MEMBER",
    });
    signInAs("member-a@test");
    const result = await cancelBooking({
      bookingId: a.bookingId,
      organisationId: a.orgId,
      cancelledByMemberId: a.memberId,
      reason: "",
      slug: "org-a",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/BOOKING_OFFICER/);
  });

  it("allows BOOKING_OFFICER to cancel a same-org booking", async () => {
    const a = await seedOrgLodgeBooking({
      orgName: "Org A",
      orgSlug: "org-a",
      memberEmail: "officer-a@test",
      role: "BOOKING_OFFICER",
    });
    signInAs("officer-a@test");
    const result = await cancelBooking({
      bookingId: a.bookingId,
      organisationId: a.orgId,
      cancelledByMemberId: a.memberId,
      reason: "guest cancelled",
      slug: "org-a",
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test — expected to FAIL on the first two cases**

```bash
cd /opt/snowgum && npm run test:integration src/actions/bookings/__tests__/cancel.integration.test.ts 2>&1 | tail -40
```

Expected:
- **Test 1 (cross-tenant)** — FAILS. Without the guard, `cancelBooking` happily cancels the Org B booking. `result.success` is likely `true` or `false` for a *different* reason (not the auth message).
- **Test 2 (role gap)** — FAILS. Plain MEMBER currently can cancel anything.
- **Test 3 (happy path)** — may pass or fail depending on whether cancellation business logic works end-to-end against the minimal seed. If it fails for a business-logic reason, simplify the seed to match what `cancelBooking` needs.

The point of this red-test step: PROVE the bug exists, then fix it.

- [ ] **Step 3: Add guards to `cancelBooking`**

In `src/actions/bookings/cancel.ts`, add imports and wrap the body.

Add to the imports at the top of the file:

```ts
import {
  requireSession,
  requireRole,
  authErrorToResult,
} from "@/lib/auth-guards";
```

Then wrap the existing `cancelBooking` function body. The existing
signature is:

```ts
export async function cancelBooking(input: CancelInput): Promise<CancelResult> {
  // ... existing body starting with: const [booking] = await db...
}
```

Replace with:

```ts
export async function cancelBooking(input: CancelInput): Promise<CancelResult> {
  try {
    const session = await requireSession(input.organisationId);
    requireRole(session, "BOOKING_OFFICER");

    // ... existing body unchanged, starting with: const [booking] = await db...
    // (keep the entire original function body here, including the final return)
  } catch (e) {
    const authResult = authErrorToResult(e);
    if (authResult) return authResult;
    throw e;
  }
}
```

**Do not** change any of the existing business logic. The only edits are
(a) three import lines, (b) a `try {` after the function declaration,
(c) three guard lines at the very top of the try, and (d) the
`} catch (e) { ... }` block at the end.

- [ ] **Step 4: Run the test — expected to pass**

```bash
cd /opt/snowgum && npm run test:integration src/actions/bookings/__tests__/cancel.integration.test.ts 2>&1 | tail -30
```

Expected: all 3 tests pass.

- [ ] **Step 5: Run the full integration suite — no regressions**

```bash
cd /opt/snowgum && npm run test:integration 2>&1 | tail -15
```

Expected: all prior integration tests still pass + 3 new ones.

- [ ] **Step 6: Run the unit suite — existing mock-theatre tests might break**

```bash
cd /opt/snowgum && npx vitest run src/actions/bookings/__tests__/cancel.test.ts 2>&1 | tail -30
```

If the existing `cancel.test.ts` unit test breaks because the function now
calls `requireSession` which calls `getSessionMember` which is not mocked
in the unit test, either:
- (a) Delete the broken `cancel.test.ts` unit test. Its coverage is now
  provided by the integration test, and per `docs/testing.md` unit tests
  must NOT mock `@/db` — so if it was relying on that, it was a B1/B6
  banned pattern anyway. Deleting it is correct.
- (b) Update the unit test to mock `getSessionMember` to return a fake
  session with role `ADMIN`.

**Default: option (a), delete the broken unit test.** The integration
test is the authoritative coverage now. Note the deletion in the commit
message.

- [ ] **Step 7: Full unit suite green**

```bash
cd /opt/snowgum && npm test 2>&1 | tail -10
```

Expected: all unit tests pass. The count may drop if you deleted a broken
test file in Step 6.

- [ ] **Step 8: Commit**

```bash
cd /opt/snowgum && git add src/actions/bookings/cancel.ts src/actions/bookings/__tests__/cancel.integration.test.ts && git commit -m "$(cat <<'EOF'
fix(auth): enforce requireSession + BOOKING_OFFICER on cancelBooking

Cross-tenant mass-assignment: any authenticated user could cancel any
booking in any org by passing a foreign organisationId. Role gap:
plain MEMBER role could cancel bookings. Both verified by red/green
integration test covering cross-tenant, MEMBER, and BOOKING_OFFICER
happy path. Existing mock-theatre unit test (if broken by the guards)
is deleted in favour of the integration test.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

(If you also deleted `src/actions/bookings/__tests__/cancel.test.ts` in Step 6,
`git add` that deletion into the same commit.)

---

## Task 6: Fix `updateBookingAdminNotes`

**Files:**
- Modify: `src/actions/bookings/admin-notes.ts`
- Create: `src/actions/bookings/__tests__/admin-notes.integration.test.ts`

Same pattern as Task 5. The action is smaller (no email/stripe side effects).

- [ ] **Step 1: Read the current implementation**

```bash
cd /opt/snowgum && cat src/actions/bookings/admin-notes.ts
```

Note the function signature and input type. The current input should
include at least `bookingId`, `organisationId`, and `notes`.

- [ ] **Step 2: Write the failing integration test**

Create `src/actions/bookings/__tests__/admin-notes.integration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { updateBookingAdminNotes } from "../admin-notes";
import { getTestDb, signInAs } from "../../../db/test-setup";
import {
  organisations,
  members,
  organisationMembers,
  lodges,
  bookings,
} from "../../../db/schema";
import { eq } from "drizzle-orm";

async function seed(opts: {
  orgSlug: string;
  memberEmail: string;
  role: "MEMBER" | "BOOKING_OFFICER" | "COMMITTEE" | "ADMIN";
}) {
  const db = await getTestDb();
  const [org] = await db
    .insert(organisations)
    .values({ name: opts.orgSlug, slug: opts.orgSlug })
    .returning();
  const [member] = await db
    .insert(members)
    .values({
      organisationId: org.id,
      firstName: "T",
      lastName: opts.memberEmail,
      email: opts.memberEmail,
    })
    .returning();
  await db.insert(organisationMembers).values({
    organisationId: org.id,
    memberId: member.id,
    role: opts.role,
    isActive: true,
  });
  const [lodge] = await db
    .insert(lodges)
    .values({ organisationId: org.id, name: "L", totalBeds: 5 })
    .returning();
  const [booking] = await db
    .insert(bookings)
    .values({
      organisationId: org.id,
      lodgeId: lodge.id,
      primaryMemberId: member.id,
      bookingReference: `R-${opts.orgSlug}`,
      checkInDate: "2026-07-01",
      checkOutDate: "2026-07-03",
      totalNights: 2,
      totalAmountCents: 5000,
      status: "CONFIRMED",
    })
    .returning();
  return { orgId: org.id, memberId: member.id, bookingId: booking.id };
}

describe("updateBookingAdminNotes (integration — auth)", () => {
  it("rejects cross-tenant attempts", async () => {
    const a = await seed({ orgSlug: "a", memberEmail: "admin-a@t", role: "ADMIN" });
    const b = await seed({ orgSlug: "b", memberEmail: "admin-b@t", role: "ADMIN" });
    signInAs("admin-a@t");
    const result = await updateBookingAdminNotes({
      bookingId: b.bookingId,
      organisationId: b.orgId,
      notes: "hijacked",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/signed in/i);
  });

  it("rejects MEMBER role", async () => {
    const a = await seed({ orgSlug: "a", memberEmail: "mem@t", role: "MEMBER" });
    signInAs("mem@t");
    const result = await updateBookingAdminNotes({
      bookingId: a.bookingId,
      organisationId: a.orgId,
      notes: "nope",
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/BOOKING_OFFICER/);
  });

  it("allows BOOKING_OFFICER and persists the note", async () => {
    const a = await seed({ orgSlug: "a", memberEmail: "off@t", role: "BOOKING_OFFICER" });
    signInAs("off@t");
    const result = await updateBookingAdminNotes({
      bookingId: a.bookingId,
      organisationId: a.orgId,
      notes: "VIP guest — late arrival",
    });
    expect(result.success).toBe(true);
    const db = await getTestDb();
    const [row] = await db
      .select({ adminNotes: bookings.adminNotes })
      .from(bookings)
      .where(eq(bookings.id, a.bookingId));
    expect(row.adminNotes).toBe("VIP guest — late arrival");
  });
});
```

- [ ] **Step 3: Run the test — red**

```bash
cd /opt/snowgum && npm run test:integration src/actions/bookings/__tests__/admin-notes.integration.test.ts 2>&1 | tail -30
```

Expected: cross-tenant and MEMBER tests fail (no guard yet).

- [ ] **Step 4: Add guards to `updateBookingAdminNotes`**

Apply the same pattern as Task 5 Step 3:
- Add `import { requireSession, requireRole, authErrorToResult } from "@/lib/auth-guards";`
- Wrap the body in `try { ... } catch (e) { const r = authErrorToResult(e); if (r) return r; throw e; }`
- Add `const session = await requireSession(input.organisationId); requireRole(session, "BOOKING_OFFICER");` at the top of the try.

- [ ] **Step 5: Run the test — green**

```bash
cd /opt/snowgum && npm run test:integration src/actions/bookings/__tests__/admin-notes.integration.test.ts 2>&1 | tail -20
```

Expected: 3/3 pass.

- [ ] **Step 6: Full integration + unit suites still green**

```bash
cd /opt/snowgum && npm run test:integration 2>&1 | tail -10 && npm test 2>&1 | tail -10
```

- [ ] **Step 7: Commit**

```bash
cd /opt/snowgum && git add src/actions/bookings/admin-notes.ts src/actions/bookings/__tests__/admin-notes.integration.test.ts && git commit -m "fix(auth): enforce requireSession + BOOKING_OFFICER on updateBookingAdminNotes

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Fix `reassignBeds` (bookings)

**Files:**
- Modify: `src/actions/bookings/reassign-beds.ts`
- Create: `src/actions/bookings/__tests__/reassign-beds.integration.test.ts`

Identical pattern to Task 6. Min role: `BOOKING_OFFICER`.

- [ ] **Step 1: Read current implementation**

```bash
cd /opt/snowgum && cat src/actions/bookings/reassign-beds.ts
```

Note the exported function name(s) and their input shape. There may be more than one exported action (e.g. `reassignBed` plural or singular).

- [ ] **Step 2: Write failing integration test**

Create `src/actions/bookings/__tests__/reassign-beds.integration.test.ts`. Use the `seed()` helper pattern from Task 6. Seed two orgs each with a booking that has at least one bed assigned (add `beds` and `bookingGuests` rows as the production code expects). Write three cases: cross-tenant rejection, MEMBER rejection, BOOKING_OFFICER happy path.

Because `reassignBeds` may require more elaborate seed data (beds + booking guests), inspect the action file first and seed exactly the shape it reads. Do NOT weaken the function to match a simpler seed.

- [ ] **Step 3: Run — red**

```bash
cd /opt/snowgum && npm run test:integration src/actions/bookings/__tests__/reassign-beds.integration.test.ts 2>&1 | tail -30
```

- [ ] **Step 4: Add guards**

Same three-line guard block + try/catch wrap as Task 5 Step 3. Min role: `BOOKING_OFFICER`.

- [ ] **Step 5: Run — green**

- [ ] **Step 6: Full suites green**

- [ ] **Step 7: Commit**

```bash
cd /opt/snowgum && git add src/actions/bookings/reassign-beds.ts src/actions/bookings/__tests__/reassign-beds.integration.test.ts && git commit -m "fix(auth): enforce requireSession + BOOKING_OFFICER on reassignBeds

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Fix `lodges/index.ts` (createLodge, updateLodge, deleteLodge)

**Files:**
- Modify: `src/actions/lodges/index.ts`
- Create: `src/actions/lodges/__tests__/lodges.integration.test.ts`

Three exported server actions in one file. All three need the same guard:
`requireSession` + `requireRole(session, "ADMIN")`. We only write an
integration test for `createLodge` — adding the identical guard to the
other two is a mechanical repetition and the test coverage on one export
is sufficient evidence. (If a reviewer disagrees, add the extra two tests
in a follow-up.)

- [ ] **Step 1: Read current implementation**

```bash
cd /opt/snowgum && cat src/actions/lodges/index.ts
```

Note the three function signatures and their input types.

- [ ] **Step 2: Write failing integration test**

Create `src/actions/lodges/__tests__/lodges.integration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createLodge } from "../index";
import { getTestDb, signInAs } from "../../../db/test-setup";
import {
  organisations,
  members,
  organisationMembers,
  lodges,
} from "../../../db/schema";
import { eq } from "drizzle-orm";

async function seedOrgMember(opts: {
  slug: string;
  email: string;
  role: "MEMBER" | "BOOKING_OFFICER" | "COMMITTEE" | "ADMIN";
}) {
  const db = await getTestDb();
  const [org] = await db
    .insert(organisations)
    .values({ name: opts.slug, slug: opts.slug })
    .returning();
  const [member] = await db
    .insert(members)
    .values({
      organisationId: org.id,
      firstName: "T",
      lastName: opts.email,
      email: opts.email,
    })
    .returning();
  await db.insert(organisationMembers).values({
    organisationId: org.id,
    memberId: member.id,
    role: opts.role,
    isActive: true,
  });
  return { orgId: org.id, memberId: member.id };
}

describe("createLodge (integration — auth)", () => {
  it("rejects cross-tenant attempts (Org A admin creating in Org B)", async () => {
    await seedOrgMember({ slug: "a", email: "admin-a@t", role: "ADMIN" });
    const b = await seedOrgMember({ slug: "b", email: "admin-b@t", role: "ADMIN" });
    signInAs("admin-a@t");
    const result = await createLodge({
      organisationId: b.orgId, // attack
      name: "Hijacked Lodge",
      totalBeds: 10,
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/signed in/i);
  });

  it("rejects COMMITTEE role (only ADMIN can create lodges)", async () => {
    const a = await seedOrgMember({ slug: "a", email: "com@t", role: "COMMITTEE" });
    signInAs("com@t");
    const result = await createLodge({
      organisationId: a.orgId,
      name: "New Lodge",
      totalBeds: 10,
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ADMIN/);
  });

  it("allows ADMIN and inserts the lodge", async () => {
    const a = await seedOrgMember({ slug: "a", email: "admin@t", role: "ADMIN" });
    signInAs("admin@t");
    const result = await createLodge({
      organisationId: a.orgId,
      name: "Summit Lodge",
      totalBeds: 15,
    });
    expect(result.success).toBe(true);
    const db = await getTestDb();
    const rows = await db
      .select()
      .from(lodges)
      .where(eq(lodges.organisationId, a.orgId));
    expect(rows.some((l) => l.name === "Summit Lodge")).toBe(true);
  });
});
```

**Note:** if `createLodge` takes a different input shape (e.g. requires
`slug` or `address`), adjust the values above to match the real schema.
Read `createLodge` first and match its input contract.

- [ ] **Step 3: Red**

- [ ] **Step 4: Add guards to all three exports**

In `src/actions/lodges/index.ts`, add the imports once at the top:

```ts
import {
  requireSession,
  requireRole,
  authErrorToResult,
} from "@/lib/auth-guards";
```

Then wrap the body of EACH of `createLodge`, `updateLodge`, `deleteLodge`
in the same try/catch + guard pattern. Every one uses
`requireRole(session, "ADMIN")`.

- [ ] **Step 5: Green**

- [ ] **Step 6: Full suites green**

- [ ] **Step 7: Commit**

```bash
cd /opt/snowgum && git add src/actions/lodges/index.ts src/actions/lodges/__tests__/lodges.integration.test.ts && git commit -m "fix(auth): enforce requireSession + ADMIN on createLodge/updateLodge/deleteLodge

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Fix `members/create.ts`

**Files:**
- Modify: `src/actions/members/create.ts`
- Create: `src/actions/members/__tests__/create.integration.test.ts`

Min role: `COMMITTEE` (admins and committee members can onboard members;
booking officers cannot).

- [ ] **Step 1: Read current implementation**

```bash
cd /opt/snowgum && cat src/actions/members/create.ts
```

Note the exported function name (`createMember` or similar) and input shape.

- [ ] **Step 2: Write failing integration test**

Create `src/actions/members/__tests__/create.integration.test.ts`. Follow
the Task 8 structure. Three cases:
- Cross-tenant: Org A committee tries to create a member in Org B →
  rejected.
- Role: BOOKING_OFFICER in Org A tries to create a member in Org A →
  rejected with `/COMMITTEE/`.
- Happy: COMMITTEE in Org A creates a member in Org A → success + row
  exists in DB.

- [ ] **Step 3: Red**

- [ ] **Step 4: Add guards**

Same pattern. `requireRole(session, "COMMITTEE");`

- [ ] **Step 5: Green**

- [ ] **Step 6: Full suites green**

- [ ] **Step 7: Commit**

```bash
cd /opt/snowgum && git add src/actions/members/create.ts src/actions/members/__tests__/create.integration.test.ts && git commit -m "fix(auth): enforce requireSession + COMMITTEE on createMember

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Fix `members/import.ts`

**Files:**
- Modify: `src/actions/members/import.ts`
- Create: `src/actions/members/__tests__/import.integration.test.ts`

Bulk import is the most destructive member operation. Min role: `ADMIN`.

- [ ] **Step 1: Read current implementation**

```bash
cd /opt/snowgum && cat src/actions/members/import.ts
```

- [ ] **Step 2: Write failing integration test**

Just the auth path. Don't test the CSV parsing or validation business
logic — those are unit-test territory (pure functions). The three cases:
cross-tenant, COMMITTEE-rejected, ADMIN-accepted with at least one row
imported.

Minimal valid input: a small CSV string with one row, whatever shape the
function expects.

- [ ] **Step 3: Red**

- [ ] **Step 4: Add guards. `requireRole(session, "ADMIN");`**

- [ ] **Step 5: Green**

- [ ] **Step 6: Full suites green**

- [ ] **Step 7: Commit**

```bash
cd /opt/snowgum && git add src/actions/members/import.ts src/actions/members/__tests__/import.integration.test.ts && git commit -m "fix(auth): enforce requireSession + ADMIN on importMembers

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 11: Fix `organisations/update.ts`

**Files:**
- Modify: `src/actions/organisations/update.ts`
- Create: `src/actions/organisations/__tests__/update.integration.test.ts`

Role gap AND mass-assignment. The current code calls `getSessionMember`
for audit log purposes AFTER the update, not BEFORE it. That's the worst
of both worlds: the DB write happens regardless of auth, and only after
it runs does the session check happen (and even then, without role
enforcement).

- [ ] **Step 1: Read current implementation**

```bash
cd /opt/snowgum && cat src/actions/organisations/update.ts
```

Note: the current `getSessionMember(data.id)` call near the end is part
of the audit-log path, NOT an auth check. Do NOT delete it — the audit
log still needs the session. Move the existing call up to the top of
the function (via `requireSession`) and keep the `session` reference for
the audit log call later in the body.

- [ ] **Step 2: Write failing integration test**

Create `src/actions/organisations/__tests__/update.integration.test.ts`
with three cases:
- Cross-tenant: Alice (admin of Org A) passes `id: orgB.id` in the input
  → expect `{ success: false, error: /signed in/i }` AND verify Org B's
  name is unchanged in the DB.
- Role gap: Bob is an active MEMBER of Org A, passes `id: orgA.id`.
  Expect `{ success: false, error: /ADMIN/ }` AND verify Org A's name
  is unchanged.
- Happy: Admin of Org A updates Org A → success + name changed.

The "unchanged in DB" assertion is important for this task — the current
bug lets the update happen even without auth, so the test must prove the
row is NOT mutated on rejection, not just that the return shape is
correct.

- [ ] **Step 3: Red**

The first case will almost certainly fail with the unchanged assertion:
Org B's name will have been overwritten because the update runs before
any auth check.

- [ ] **Step 4: Add guards**

Apply the standard pattern. Min role: `ADMIN`. Call `requireSession(input.id)`
— the `id` IS the organisationId for this action.

Then remove the now-redundant `getSessionMember(data.id)` call in the
audit-log section and use `session` from the top of the try instead.

- [ ] **Step 5: Green**

- [ ] **Step 6: Full suites green**

- [ ] **Step 7: Commit**

```bash
cd /opt/snowgum && git add src/actions/organisations/update.ts src/actions/organisations/__tests__/update.integration.test.ts && git commit -m "$(cat <<'EOF'
fix(auth): enforce requireSession + ADMIN on updateOrganisation

Cross-tenant bug: update ran before session check, so an attacker
could overwrite any org's settings. Role gap: session check was only
used for audit logging, never for authorisation. Both fixed. Test
asserts the target org's row is unchanged on rejection, not just
return shape, because the previous code actually mutated it.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Fix `organisations/update-gst.ts`

**Files:**
- Modify: `src/actions/organisations/update-gst.ts`
- Create: `src/actions/organisations/__tests__/update-gst.integration.test.ts`

Min role: `ADMIN`.

- [ ] **Step 1: Read current implementation**

```bash
cd /opt/snowgum && cat src/actions/organisations/update-gst.ts
```

- [ ] **Step 2: Write failing integration test**

Same structure as Task 11 — cross-tenant, role-gap (COMMITTEE rejected),
happy path (ADMIN). Assert the DB row is unchanged on rejection.

- [ ] **Step 3: Red**

- [ ] **Step 4: Add guards. `requireRole(session, "ADMIN");`**

- [ ] **Step 5: Green**

- [ ] **Step 6: Full suites green**

- [ ] **Step 7: Commit**

```bash
cd /opt/snowgum && git add src/actions/organisations/update-gst.ts src/actions/organisations/__tests__/update-gst.integration.test.ts && git commit -m "fix(auth): enforce requireSession + ADMIN on updateOrganisationGst

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 13: Fix `reports/revenue-summary.ts`

**Files:**
- Modify: `src/actions/reports/revenue-summary.ts`
- Create: `src/actions/reports/__tests__/revenue-summary.integration.test.ts`

`getRevenueSummary` returns financial data (revenue, GST, platform fees).
Min role: `COMMITTEE`. Cross-tenant attacks here leak financial data,
making this the highest-severity report fix.

**Complication:** the current return type is `Promise<RevenueSummaryResult>`,
not `Promise<{success, error}>`. Adding a `{success: false}` fallback
changes the callers. Solution: change the return type to
`Promise<RevenueSummaryResult | { success: false; error: string }>` and
update the one call site to narrow on the `error` property.

- [ ] **Step 1: Read current implementation AND all callers**

```bash
cd /opt/snowgum && cat src/actions/reports/revenue-summary.ts
cd /opt/snowgum && grep -rn "getRevenueSummary" --include="*.ts" --include="*.tsx" src/ app/
```

Expected: one or two call sites, probably in `src/app/[slug]/admin/reports/...`.

- [ ] **Step 2: Write failing integration test**

Create `src/actions/reports/__tests__/revenue-summary.integration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getRevenueSummary } from "../revenue-summary";
import { getTestDb, signInAs } from "../../../db/test-setup";
import {
  organisations,
  members,
  organisationMembers,
} from "../../../db/schema";

async function seedOrgMember(opts: {
  slug: string;
  email: string;
  role: "MEMBER" | "BOOKING_OFFICER" | "COMMITTEE" | "ADMIN";
}) {
  const db = await getTestDb();
  const [org] = await db
    .insert(organisations)
    .values({ name: opts.slug, slug: opts.slug })
    .returning();
  const [member] = await db
    .insert(members)
    .values({
      organisationId: org.id,
      firstName: "T",
      lastName: opts.email,
      email: opts.email,
    })
    .returning();
  await db.insert(organisationMembers).values({
    organisationId: org.id,
    memberId: member.id,
    role: opts.role,
    isActive: true,
  });
  return { orgId: org.id };
}

describe("getRevenueSummary (integration — auth)", () => {
  it("rejects cross-tenant attempts — financial data leak", async () => {
    await seedOrgMember({ slug: "a", email: "adm-a@t", role: "ADMIN" });
    const b = await seedOrgMember({ slug: "b", email: "adm-b@t", role: "ADMIN" });
    signInAs("adm-a@t");
    const result = await getRevenueSummary({
      organisationId: b.orgId,
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      granularity: "annual",
    });
    expect("success" in result && result.success === false).toBe(true);
  });

  it("rejects BOOKING_OFFICER (needs COMMITTEE)", async () => {
    const a = await seedOrgMember({ slug: "a", email: "off@t", role: "BOOKING_OFFICER" });
    signInAs("off@t");
    const result = await getRevenueSummary({
      organisationId: a.orgId,
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      granularity: "annual",
    });
    expect("success" in result && result.success === false).toBe(true);
  });

  it("allows COMMITTEE and returns a result shape", async () => {
    const a = await seedOrgMember({ slug: "a", email: "com@t", role: "COMMITTEE" });
    signInAs("com@t");
    const result = await getRevenueSummary({
      organisationId: a.orgId,
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      granularity: "annual",
    });
    expect("success" in result).toBe(false);
    if (!("success" in result)) {
      expect(result.rows).toBeInstanceOf(Array);
      expect(result.totalNetRevenueCents).toBe(0);
    }
  });
});
```

- [ ] **Step 3: Red**

- [ ] **Step 4: Add guards and widen the return type**

In `src/actions/reports/revenue-summary.ts`:

1. Update the return type:

```ts
export async function getRevenueSummary(
  filters: RevenueSummaryFilters
): Promise<RevenueSummaryResult | { success: false; error: string }> {
```

2. Add the imports and guard wrap at the top of the body:

```ts
import {
  requireSession,
  requireRole,
  authErrorToResult,
} from "@/lib/auth-guards";

// ...
export async function getRevenueSummary(
  filters: RevenueSummaryFilters
): Promise<RevenueSummaryResult | { success: false; error: string }> {
  try {
    const session = await requireSession(filters.organisationId);
    requireRole(session, "COMMITTEE");

    // ... existing body unchanged, returning RevenueSummaryResult at the end.
  } catch (e) {
    const authResult = authErrorToResult(e);
    if (authResult) return authResult;
    throw e;
  }
}
```

3. Update the call site(s) found in Step 1. At each, narrow on the error
   property before using the result:

```tsx
const result = await getRevenueSummary({ ... });
if ("success" in result && result.success === false) {
  // render error
  return <ErrorCard message={result.error} />;
}
// use result.rows, result.totalNetRevenueCents, etc.
```

- [ ] **Step 5: Green**

- [ ] **Step 6: Full suites green** — watch for type errors in the
  updated call sites.

```bash
cd /opt/snowgum && npm test 2>&1 | tail -10 && npm run test:integration 2>&1 | tail -10 && npx tsc --noEmit 2>&1 | tail -30
```

- [ ] **Step 7: Commit**

```bash
cd /opt/snowgum && git add src/actions/reports/revenue-summary.ts src/actions/reports/__tests__/revenue-summary.integration.test.ts src/app/ && git commit -m "$(cat <<'EOF'
fix(auth): enforce requireSession + COMMITTEE on getRevenueSummary

Cross-tenant financial data leak: any authenticated user could call
getRevenueSummary with any organisationId and see revenue, GST, and
platform fees. Adds guards and widens the return type to include the
error discriminant; updates the call site to narrow on error.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Fix `reports/booking-summary.ts`

**Files:**
- Modify: `src/actions/reports/booking-summary.ts`
- Create: `src/actions/reports/__tests__/booking-summary.integration.test.ts`

Same shape as Task 13. Min role: `COMMITTEE`. Widen return type and
update callers.

- [ ] **Step 1: Read current implementation AND call sites**

```bash
cd /opt/snowgum && cat src/actions/reports/booking-summary.ts
cd /opt/snowgum && grep -rn "getBookingSummary\|bookingSummary" --include="*.ts" --include="*.tsx" src/ app/
```

- [ ] **Step 2: Write failing integration test**

Same structure as Task 13 — cross-tenant, BOOKING_OFFICER rejected, COMMITTEE accepted.

- [ ] **Step 3: Red**

- [ ] **Step 4: Add guards + widen return type + update callers**

Same pattern as Task 13.

- [ ] **Step 5: Green**

- [ ] **Step 6: Full suites + tsc --noEmit green**

- [ ] **Step 7: Commit**

```bash
cd /opt/snowgum && git add src/actions/reports/booking-summary.ts src/actions/reports/__tests__/booking-summary.integration.test.ts src/app/ && git commit -m "fix(auth): enforce requireSession + COMMITTEE on getBookingSummary

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 15: Final verification

**Files:**
- None (verification only)

- [ ] **Step 1: Clean unit run**

```bash
cd /opt/snowgum && npm test 2>&1 | tail -10
```

Expected: all unit tests pass. The count may be lower than before this
plan if broken mock-theatre tests were deleted in Tasks 5-14. That's
fine; the integration tests cover that ground with stronger guarantees.

- [ ] **Step 2: Clean integration run**

```bash
cd /opt/snowgum && npm run test:integration 2>&1 | tail -20
```

Expected:
- 7 tests from the previous integration-test-layer plan (test-db harness + getSeasonForDates)
- 5 tests from Task 3 (auth-guards integration)
- 3 tests × 10 action fixes = 30 tests from Tasks 5-14 (some tasks may
  have more than 3 if they needed extra cases — minimum 30)
- **Total: ~42 integration tests, all passing.**

- [ ] **Step 3: Type-check**

```bash
cd /opt/snowgum && npx tsc --noEmit 2>&1 | tail -20
```

Expected: 0 errors. The return-type widening in Tasks 13 and 14
propagates to call sites which are updated in those same tasks.

- [ ] **Step 4: Lint unchanged from baseline**

```bash
cd /opt/snowgum && npm run lint 2>&1 | tail -5
```

Expected: same pre-existing error count as on `main` (1341 errors at
time of writing — all pre-existing, unrelated to this plan). A higher
count means this plan introduced new lint errors; investigate before
closing the plan out.

- [ ] **Step 5: Review the commits**

```bash
cd /opt/snowgum && git log --oneline HEAD~15..HEAD
```

Expected: ~15 commits — infrastructure (4) + action fixes (10) + final
verification is not a commit. If a task was combined with another (e.g.
Task 8's three exports in one commit), the count may be 14.

- [ ] **Step 6: Sanity check — no uncaught AuthError escapes**

```bash
cd /opt/snowgum && grep -rn "requireSession\|requireRole" src/actions/ --include="*.ts" | grep -v "__tests__" | wc -l
```

Expected: at least 12 matches (10 files × at least 1 requireSession each,
plus requireRole where added, plus Task 8's three exports). Cross-check
the number against the file modifications in Tasks 5-14.

- [ ] **Step 7: No commit needed — verification only**

---

## What this plan does NOT do

All of the following are explicitly out of scope for this plan:

1. **The remaining ~15 mass-assignment offenders.** The cross-codebase
   review flagged ~25 mass-assignment bugs total; this plan fixes the 10
   most critical. A follow-up plan will cover: communications/send.ts
   role gaps, waitlist expire/notify, charges/bulk-create, availability
   cache writes, subscription modifications, dashboard queries, and
   custom-field admin ops. Each follows the pattern established here.
2. **Rewriting unit tests that mocked `@/db`.** Those tests are already
   banned by `docs/testing.md` antipattern B1/B6. Delete them as you
   encounter them in Tasks 5-14; a later cleanup plan will sweep the
   remainder.
3. **Higher-order wrapper `guardedAction(opts, handler)`.** Defer until
   we've written 20+ fixes and see what boilerplate is worth extracting.
4. **Supabase RLS / database-side enforcement.** A defence-in-depth layer
   worth adding later but out of scope for this session.
5. **Rate limiting, CSRF, or other auth-adjacent hardening.** Separate
   concerns, separate plans.

---

## Reuse existing code

- `src/lib/auth.ts` — `getSessionMember` and `SessionMember` type used as-is.
- `src/db/test-db.ts` and `src/db/test-setup.ts` — from the prior plan,
  extended in Task 2 but not replaced.
- All ten target action files — modified only to add imports and wrap
  the body. The existing business logic is untouched.
- `docs/testing.md` — referenced from `docs/auth.md` for the testing
  conventions.

---

## Risk register

- **`cache()` import in getSessionMember.** `src/lib/auth.ts` wraps
  `getSessionMember` in React's `cache()`. If vitest in a node-only
  integration run can't resolve `react/cache`, Task 3 fails. Fix
  direction: unwrap the cache or mock it. The integration test in Task 3
  is the canary — if it passes, all downstream tasks are safe.
- **Actions with non-standard return shapes.** Tasks 13 and 14 widen
  return types. If more actions in the 10 have custom shapes (not
  `{success, error}`), the same widening is needed. Watch for tsc
  errors at each task's Step 6.
- **Cross-action coupling through email/stripe/audit.** Tasks 5-14 mock
  these side effects via `vi.mock("@/lib/email/send")` etc. If an action
  imports email/stripe through a different path, the mock won't catch it
  and the happy-path test may fail for an unrelated reason. Fix: trace
  the import path and mock it at the right module specifier.
- **Plan branch ordering.** This plan assumes the integration test layer
  (prior plan) is already committed. If it's not, rebase or cherry-pick
  those commits first.
- **Plain MEMBER tests.** Several tasks assert that `MEMBER` role is
  rejected for an action. If the schema's role enum ever changes (e.g.
  introducing a `STAFF` role below ADMIN), the role-order array in
  `auth-guards.ts` and the test expectations both need updating.
