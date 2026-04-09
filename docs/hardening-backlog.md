# Hardening Backlog

Security and quality items identified by the six-reviewer code audit of
phases 6-23, not yet addressed. The completed work is in PR #14
(auth-guards rollout) and the integration-test-layer plan that precedes
it.

**Pattern to follow for every mass-assignment fix:** see `docs/auth.md`
and the commits on branch `hardening/auth-guards` — each action gets
`requireSession` + `requireRole` at the top, wrapped in the standard
try/catch, plus a red/green integration test in `__tests__/` that proves
cross-tenant rejection, insufficient-role rejection, and sufficient-role
happy path.

---

## Batch 2 — Financial surface

Same shape as Tasks 13/14 in the auth-guards plan. These touch money,
so they're the highest priority after bookings and reports. `COMMITTEE`
or `ADMIN` min role.

- [ ] **`src/actions/communications/send.ts`** — bulk email/SMS role
  gaps. Check both `sendBulkCommunication` and any waitlist/reminder
  senders. Min role: `COMMITTEE` (matches the audit finding). Widen
  return type if the action returns a domain object.
- [ ] **`src/actions/charges/bulk-create.ts`** — bulk one-off charges.
  Any authenticated user could currently create charges against any
  org. Min role: `ADMIN` or `COMMITTEE` — confirm by checking which
  roles can create single charges today.
- [ ] **`src/actions/dashboard/booking-officer-stats.ts` + `treasurer-stats.ts`**
  — dashboard aggregate queries. Cross-tenant leaks expose occupancy,
  revenue, outstanding balances. Min role: `BOOKING_OFFICER` for the
  former, `COMMITTEE` for the latter. Return-type widening likely
  needed (they return stat objects, not `{success, error}`).
  **Bonus:** their unit tests are mock-theatre (see Mock-theatre sweep
  below) — replace them with integration tests in the same commit.

## Batch 3 — Booking lifecycle

- [ ] **`src/actions/waitlist/expire.ts`** — cron-driven expiry. Verify
  whether it's callable by an authenticated HTTP caller or only by the
  cron runner; if the former, add `requireRole(session, "BOOKING_OFFICER")`.
- [ ] **`src/actions/waitlist/notify.ts`** — admin manually triggers
  waitlist notifications. Min role: `BOOKING_OFFICER`.
- [ ] **Availability cache writes** — any server action that mutates
  `availability_cache` outside a booking flow. Audit found at least
  one direct-write path. Min role: `BOOKING_OFFICER`.
- [ ] **Subscription modifications** — `src/actions/subscriptions/...`
  any action that changes a member's subscription state (waive, mark
  paid, adjust). Min role: `ADMIN`.

## Batch 4 — Remaining mass-assignment offenders

The audit flagged ~25 bugs total; PR #14 fixed 10, Batches 2-3 cover ~6
more. The rest:

- [ ] **Custom-field admin ops** — `src/actions/custom-fields/manage.ts`
  create/update/delete. Min role: `ADMIN`.
- [ ] **Any remaining org-scoped action** without `requireSession`.
  Quick audit:

  ```bash
  grep -rLn "requireSession" src/actions/ --include="*.ts" \
    | xargs grep -l "organisationId" \
    | xargs grep -L "__tests__"
  ```

  Inspect each file in the output, decide whether it's org-scoped
  (some actions take org id for context but don't mutate), and add a
  row to this backlog or fix it.

## Mock-theatre test sweep

Banned by `docs/testing.md` antipatterns B1/B6. These unit tests mock
`@/db`, `@/db/schema`, or `drizzle-orm` and therefore prove nothing.
PR #14 deleted 6 of them along the way; the remaining ones contribute
to the pre-existing `npx tsc --noEmit` baseline of 15 errors.

- [ ] `src/actions/dashboard/booking-officer-stats.test.ts`
- [ ] `src/actions/dashboard/treasurer-stats.test.ts`
- [ ] `src/actions/documents/delete.test.ts`
- [ ] `src/actions/documents/update.test.ts`
- [ ] `src/actions/documents/upload.test.ts`
- [ ] `src/lib/email/__tests__/layout.test.ts`

For each: either **delete** (if the behaviour is better covered by an
integration test) or **rewrite** as an integration test using the
pglite harness in `src/db/test-setup.ts`. Dashboard stats + documents
are natural candidates for integration tests because they have real
DB query logic; the email layout test can probably just render to
string and assert on the output without any DB.

Deleting all six clears the final 15 `npx tsc --noEmit` errors on this
codebase (they're all type errors in the broken mocks).

## Defence-in-depth (longer horizon)

These are worth doing but aren't gating on any known bug. Consider
after Batches 2-4 are merged.

- [ ] **`guardedAction(opts, handler)` HOF** — extract the try/catch +
  guard boilerplate from every server action into a single wrapper.
  Deferred from PR #14 per the plan: wait until ~20 fixes have landed
  so the right abstraction shape is obvious. At ~10 right now.
- [ ] **Supabase RLS / database-side enforcement** — add row-level
  security policies on `organisations`, `members`, `bookings`, etc.
  so a leaked connection string or raw SQL injection can't bypass the
  application-layer guards. Defence in depth, not a replacement for
  `requireSession`.
- [ ] **Rate limiting** — per-org and per-IP rate limits on auth
  endpoints, bulk communications, and report generation. Probably
  Upstash Redis + a middleware or a Next.js `middleware.ts` check.
- [ ] **CSRF** — Next.js server actions include a built-in token check,
  but confirm it's not bypassed anywhere we handle form posts directly.
- [ ] **Audit log coverage** — every guard-protected action should
  write an audit log entry, success or failure. Spot-check that the
  10 fixed actions in PR #14 actually do this (most already did pre-fix).

---

## Working on an item

1. Branch off `main`: `git checkout -b hardening/<batch-name>`
2. Write an integration test first (red). Follow
   `src/actions/reports/__tests__/revenue-summary.integration.test.ts`
   as the reference for the seed helper pattern and the `signInAs`
   + `requireSession` flow.
3. Add guards to the action. Widen the return type if needed.
4. Make the test green.
5. Delete any mock-theatre unit test for the same file (if it exists).
6. Run `npm test && npm run test:integration && npx tsc --noEmit` —
   new errors only acceptable if they're pre-existing baseline noise
   listed in this doc.
7. Commit with prefix `fix(auth):` for guard fixes or `test:` for test
   rewrites. PR against `main`.
8. Tick the box in this doc as part of the same PR.
