# E2E Testing Design — Playwright

## Goal

Catch regressions in critical user flows before they reach users. Cover the 6 most important flows: login, booking, admin members, dashboard, admin bookings, and org picker. Tests run manually during development and automatically in CI after deploy.

## Approach

**Tool:** Playwright with `@playwright/test` runner, headless Chromium.

**Target:** Tests run against the production container on `localhost:3010` using seeded test accounts with known passwords (`testpass123`). Tests are read-heavy — they navigate, verify content, and check renders. Write tests (create member, complete booking) use timestamped unique data to avoid collisions.

**Known limitation:** Tests currently share the production database and Supabase auth. A dedicated test environment (separate Supabase project or local Postgres, Docker Compose `test` profile, pre-deploy instead of post-deploy) should be created when the test suite is stable and the project has more than a handful of users. This is flagged as future work, not built now.

## Project Structure

```
e2e/
├── playwright.config.ts       # Config — baseURL, auth setup, timeouts
├── auth.setup.ts              # Global setup — login as each role, save auth state
├── fixtures/
│   └── auth.ts                # Custom fixtures — adminPage, memberPage, officerPage
├── tests/
│   ├── login.spec.ts          # Flow 1: Login
│   ├── booking.spec.ts        # Flow 2: Booking wizard
│   ├── admin-members.spec.ts  # Flow 3: Admin member management
│   ├── dashboard.spec.ts      # Flow 4: Member dashboard
│   ├── admin-bookings.spec.ts # Flow 5: Admin bookings
│   └── org-picker.spec.ts     # Flow 6: Org picker
└── .auth/                     # Git-ignored — stored auth state files
```

## Authentication Strategy

A Playwright **setup project** runs before all tests:

1. `auth.setup.ts` logs in as 3 test users via the real login page (`/polski/login`), saves browser state (cookies/storage) to `.auth/` files.
2. Each test file uses a **custom fixture** that loads pre-authenticated state.

### Test Accounts

| Fixture | Account | Role | Auth File |
|---------|---------|------|-----------|
| `adminPage` | `marek.kowalski@example.com` | ADMIN | `.auth/admin.json` |
| `officerPage` | `anna.nowak@example.com` | BOOKING_OFFICER | `.auth/officer.json` |
| `memberPage` | `katarzyna.wojcik@example.com` | MEMBER | `.auth/member.json` |

All passwords: `testpass123`

### Fixture Usage

```ts
test('member can complete booking flow', async ({ memberPage }) => {
  await memberPage.goto('/polski/book');
  // memberPage is already logged in as Katarzyna
});
```

## Test Coverage — 6 Flows

### Flow 1: Login (`login.spec.ts`)

- Password login succeeds, redirects to dashboard
- Wrong password shows error message
- Magic link tab renders and accepts email input
- "Forgot password?" link navigates to reset page
- Sign out button works (redirects to login)

### Flow 2: Booking (`booking.spec.ts`)

Uses `memberPage` fixture.

- Booking page loads with lodge and booking round
- Booking round shows name (not UUID)
- Can select check-in and check-out dates
- "Next: Add Guests" progresses to step 2
- Can add self as guest
- Can select beds
- Review pricing shows correct amounts
- Full flow through to confirmation

### Flow 3: Admin Members (`admin-members.spec.ts`)

Uses `adminPage` fixture.

- Member list loads with seeded members
- Search filters members by name
- "Add Member" form renders with required fields
- Can create a new member (timestamped email)
- Member detail page shows correct info

### Flow 4: Dashboard (`dashboard.spec.ts`)

Uses `memberPage` fixture.

- Dashboard loads without errors
- Shows welcome message with member name
- "Book a Stay" button links to booking page
- Upcoming bookings section renders
- Subscription card renders if applicable
- Sign out button works

### Flow 5: Admin Bookings (`admin-bookings.spec.ts`)

Uses `adminPage` fixture.

- Booking list loads with seeded bookings
- Can filter by status
- Can view booking detail
- Approve action works on pending booking
- Cancel action shows confirmation dialog

### Flow 6: Org Picker (`org-picker.spec.ts`)

- Authenticated single-org user auto-redirects to dashboard
- Unauthenticated user sees landing page
- Root page (`/`) doesn't error for logged-in users

## Configuration

### `playwright.config.ts`

- `baseURL`: `http://localhost:3010`
- `testDir`: `./e2e/tests`
- Browser: Chromium only
- Workers: 1 (sequential to avoid race conditions on shared data)
- Screenshots: on failure only
- Trace: on first retry
- Global test timeout: 30 seconds
- Navigation timeout: 15 seconds
- Retries: 1 in CI, 0 locally

### Dependencies

- `@playwright/test` (devDependency)
- Chromium binary via `npx playwright install chromium`

### npm Scripts

```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

### `.gitignore` Additions

```
e2e/.auth/
e2e/test-results/
e2e/playwright-report/
```

## CI Integration

### GitHub Actions

Add an E2E job to the existing deploy workflow:

```
Push to main → Build → Unit tests → Deploy to VPS → E2E tests against live container → Pass/Fail
```

- Tests run **after** deploy (they need the running container)
- On failure: upload Playwright trace files as workflow artifacts
- Deploy is not auto-rolled-back on failure (manual investigation)

### Retries

- 1 retry on failure in CI to handle transient network issues
- 0 retries locally for fast feedback

## Test Data Approach

- Seeded data is the baseline (30 members, 15 bookings, subscriptions)
- Read-heavy tests verify existing data, don't modify it
- Write tests use unique data: `test-${Date.now()}@example.com` for emails, timestamped names
- No DB teardown between runs
- If data accumulates, re-seed with `npm run db:seed:polski` scripts

## Future: Dedicated Test Environment

When the project grows beyond a few clubs and the test suite is stable:

1. **Separate Supabase project** (or local Postgres via Docker) for test isolation
2. **Docker Compose `test` profile** — isolated app container pointing at test DB
3. **Pre-deploy testing** — run E2E before deploy instead of after
4. **DB reset** — truncate and re-seed before each test run
5. **Auto-rollback** — if E2E fails post-deploy, revert to previous image

This ensures tests never touch production data and can run destructive scenarios freely.
