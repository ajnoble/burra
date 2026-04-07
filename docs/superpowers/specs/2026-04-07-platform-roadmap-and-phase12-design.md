# Platform Roadmap & Phase 12 Design

## Competitive Analysis Summary

Analysed two direct competitors:

- **CBDweb (Alpine Booking Service)** — established Australian ski lodge booking system
- **Clubman** — club management platform ($0-$11k/yr + 0-6% platform fee)

### Snow Gum Advantages
- Modern stack (Next.js 16, React Email, shadcn/ui) vs dated competitor UIs
- Multi-tenant architecture — competitors appear single-tenant
- Testing discipline (353+ tests, E2E, TDD)
- Transparent pricing ($99/mo + 1%) vs Clubman's $1,900-$11k/yr
- More sophisticated tariff system (weekday/weekend, multi-tier discounts, single supplement, per-class)

### Competitive Gaps to Close
1. No financial reporting UI — both competitors have this
2. No bulk communications — both competitors offer targeted email
3. No accounting integration — Clubman has Xero/MYOB
4. No custom one-off charges — Clubman offers locker fees, event charges, etc.
5. No family fee consolidation — CBDweb bundles family invoices
6. No auto-cancel unpaid bookings — CBDweb has this
7. No minimum night requirements — CBDweb enforces weekend pairs

### Strategic Decisions
- **Target market:** Australian ski clubs
- **Approach:** Close competitive gaps AND leapfrog with modern UX
- **Accounting:** CSV export in Xero-compatible format first, direct integration later
- **Communications:** Email + SMS from the start
- **Mobile:** Responsive web first, PWA/native later
- **Deferred:** Ballot/lottery allocation (complex, niche)

---

## Revised Platform Roadmap (Phases 12-20)

### Phase 12 — Treasurer Reporting, Role Dashboards & CSV Exports
- 3 role-specific dashboards (treasurer, booking officer, committee)
- 7 pre-built reports with filtering and pagination
- CSV export with Xero-compatible transaction format
- ~15-20 test files, ~15 E2E tests

### Phase 13 — One-Off Charges & Family Fee Consolidation
- New `one_off_charges` table for locker fees, cleaning, events, etc.
- Admin UI to create/manage charges per member
- Family fee consolidation — single invoice for linked family members
- Charges appear in transaction ledger and member balances
- Payment via Stripe Checkout (earns platform fee)

### Phase 14 — Booking Engine Rules
- Auto-cancel unpaid bookings after configurable deadline (new cron job)
- Minimum night requirements per booking round (e.g. both weekend nights)
- Overdue payment reminder emails before auto-cancel
- Config UI in admin settings per season/booking round

### Phase 15 — Bulk Communications (Email + SMS)
- Compose and send emails to filtered member lists
- Filter by: membership class, financial status, season, booking status
- Draft save and preview before send
- SMS via Twilio or similar (pre-arrival reminders, payment alerts)
- Email audit trail with sent/opened tracking

### Phase 16 — Waitlist
- Schema already exists — build UI and actions
- Join waitlist when beds unavailable
- Auto-notify when cancellation frees beds
- One-click convert waitlist entry to booking

### Phase 17 — Document Library
- Schema already exists — build UI
- Upload documents with role-based access (public/member/committee/admin)
- Member-facing download page

### Phase 18 — Audit Log Viewer
- Schema already exists — build UI
- Filterable log: action, actor, entity, date range
- Links to affected entities (member, booking, etc.)

### Phase 19 — Xero Integration
- OAuth2 connect flow
- Auto-sync invoices and payments to Xero
- Bank feed integration for reconciliation
- Mapping config UI (chart of accounts)

### Phase 20 — Hardening & Mobile Polish
- Dedicated test environment with seeded DB
- Expand E2E suite: edge cases, error states, mobile viewports
- Performance audit and optimisation
- Security review (OWASP top 10)
- Responsive polish across all pages
- PWA groundwork (manifest, service worker shell) if ready

---

## Phase 12 Detailed Design

### Data Model

No new tables required. All reporting data is computed from existing tables:

- `transactions` — revenue, refunds, credits, payments, subscriptions
- `bookings` + `booking_guests` — occupancy, arrivals/departures
- `subscriptions` — subscription status, outstanding amounts
- `members` + `membership_classes` — member balances, class breakdowns
- `availability_cache` — bed utilisation

All aggregations computed at query time from existing tables. No denormalisation needed at this stage.

### Role-Specific Dashboards

Located at `/{slug}/admin/dashboard` with role-based tab navigation.

#### Treasurer Dashboard (ADMIN + COMMITTEE)
- **Revenue summary cards:** total revenue (MTD, YTD, prior year comparison), outstanding balances, platform fees paid
- **Revenue chart:** monthly revenue bar chart (bookings vs subscriptions), 12-month rolling view
- **Subscription status:** paid/unpaid/waived breakdown with amounts, overdue members list
- **Recent transactions:** filterable table (date range, type, member) with running totals
- **Quick actions:** export CSV, generate subscription invoices

#### Booking Officer Dashboard (BOOKING_OFFICER)
- **Today/upcoming cards:** arrivals today, departures today, current occupancy %, pending approvals count
- **Upcoming arrivals:** next 7 days grouped by date, guest names, room/bed assignments
- **Pending approvals:** bookings requiring approval with one-click approve/reject
- **Occupancy chart:** bed utilisation over next 30 days
- **Waitlist alerts:** placeholder for Phase 16

#### Committee Dashboard (COMMITTEE)
- **KPI cards:** total active members, occupancy rate (season to date), revenue (YTD), member growth (vs prior year)
- **Occupancy trends:** monthly occupancy % chart by lodge, season comparison
- **Membership breakdown:** by class, financial status, new vs returning
- **Revenue vs prior year:** side-by-side monthly comparison

#### Access Rules
- ADMIN: sees all three views via tabs
- COMMITTEE: sees committee + treasurer views
- BOOKING_OFFICER: sees booking officer view only
- MEMBER: existing `/dashboard` (no change)

### Reporting & CSV Exports

Located at `/{slug}/admin/reports` — accessible to ADMIN and COMMITTEE.

#### Pre-Built Reports

| Report | Columns | Filters |
|---|---|---|
| Transaction Ledger | Date, member, type, description, amount, stripe ref, running balance | Date range, type, member |
| Revenue Summary | Period, booking revenue, subscription revenue, refunds, net revenue, platform fees | Monthly/quarterly/annual, date range, lodge |
| Member Balances | Member, class, subscription status, total paid, total refunded, outstanding balance | Class, financial status, balance > $0 |
| Subscription Status | Member, class, season, amount, due date, status, paid date | Season, status, overdue only |
| Occupancy Report | Date, lodge, total beds, booked beds, available beds, occupancy % | Date range, lodge, season |
| Arrivals & Departures | Date, member, guests, lodge, room/bed, check-in, check-out, payment status | Date range, lodge |
| Booking Summary | Reference, member, lodge, dates, nights, guests, amount, status | Date range, status, lodge, member |

#### Export Format
- All reports export as CSV with headers
- Transaction Ledger CSV matches Xero bank statement import format (Date, Amount, Payee, Description, Reference)
- Date format: `DD/MM/YYYY` (Australian convention)
- Money format: dollars with 2 decimal places in exports (not cents)

#### PDF (Stretch Goal)
- Arrivals & Departures as printable daily sheet for lodge noticeboard

### UI Components & Layout

#### Dashboard Page
- Role-based tab navigation at top
- 4 stat cards row with value, label, trend indicator (up/down vs prior period)
- Charts via Recharts (bar, line, area) — React-based, lightweight
- Tables reuse existing shadcn/ui DataTable pattern
- Date range picker top-right, defaults to current financial year (July-June for Australian clubs)

#### Reports Page
- Card grid showing 7 reports with title and description
- Click into report: filter controls at top, data table below, "Export CSV" button
- Filters use existing shadcn/ui Select, DatePicker components
- Server-rendered tables with pagination
- CSV export via server action returning `text/csv`

#### New Dependency
- `recharts` — dashboard charts only

#### Responsive Behaviour
- Cards stack vertically on mobile
- Charts scale down, remain readable
- Tables scroll horizontally on small screens
- Export button remains accessible

### Technical Architecture

#### Server Actions (New Files)

**Report actions (`src/actions/reports/`):**
- `revenue-summary.ts` — aggregate transactions by period/type
- `transaction-ledger.ts` — filtered transaction list with running balance
- `member-balances.ts` — computed from transactions per member
- `subscription-status.ts` — joins subscriptions + members + seasons
- `occupancy.ts` — computed from availability_cache + bookings
- `arrivals-departures.ts` — bookings with guest/bed details by date
- `booking-summary.ts` — filtered booking list with totals
- `export-csv.ts` — generic CSV serialiser, takes report data + column config

**Dashboard actions (`src/actions/dashboard/`):**
- `treasurer-stats.ts` — MTD/YTD revenue, outstanding balances, platform fees
- `booking-officer-stats.ts` — today's arrivals/departures, occupancy, pending count
- `committee-stats.ts` — member count, occupancy rate, YTD revenue, growth

#### Pattern
- Each report action takes `{ organisationId, filters }` and returns typed data
- Dashboard stats actions return card data + chart series in one call (avoid waterfalls)
- All queries use Drizzle `sql` template for aggregations — no raw strings
- CSV export reuses report actions, pipes through serialiser
- Xero-format CSV is a column mapping config on the transaction ledger

#### File Structure
```
src/
  actions/
    reports/
      revenue-summary.ts + .test.ts
      transaction-ledger.ts + .test.ts
      member-balances.ts + .test.ts
      subscription-status.ts + .test.ts
      occupancy.ts + .test.ts
      arrivals-departures.ts + .test.ts
      booking-summary.ts + .test.ts
      export-csv.ts + .test.ts
    dashboard/
      treasurer-stats.ts + .test.ts
      booking-officer-stats.ts + .test.ts
      committee-stats.ts + .test.ts
  app/[slug]/admin/
    dashboard/page.tsx (replace existing)
    reports/page.tsx
    reports/[reportId]/page.tsx
```

### Testing

#### Unit/Integration (~15-20 test files, ~40-60 tests)
- Each report action tested with seeded data
- Correct aggregation, filtering, date ranges
- Edge cases: no data, single transaction, cross-period boundaries
- CSV serialiser: correct formatting, header mapping, Xero compatibility
- Dashboard stats: correct card values given known data

#### E2E (2 spec files, ~15 tests)

**`e2e/admin-dashboard.spec.ts` (~8 tests):**
- Treasurer tab: revenue cards render, transactions table visible
- Booking officer tab: arrivals/departures cards, pending approvals, occupancy chart
- Committee tab: KPI cards, membership breakdown, occupancy trends
- Tab visibility by role (officer only sees their tab, committee sees two)
- Date range picker changes values

**`e2e/admin-reports.spec.ts` (~7 tests):**
- Reports page shows 7 report cards
- Transaction ledger: date filter changes table rows
- Member balances: filter by financial status
- CSV export: download with correct headers
- Subscription status: filter by season
- Occupancy report: filter by lodge
- Empty state: no data message

### E2E Testing Strategy (Platform-Wide)

Every phase that ships UI includes E2E tests in the same PR.

#### Coverage by Phase

| Phase | Spec Files | Key Flows |
|---|---|---|
| 12 | `admin-dashboard.spec.ts`, `admin-reports.spec.ts` | Role dashboards, report filtering, CSV export |
| 13 | `admin-charges.spec.ts` | Charge creation, family consolidation, payment |
| 14 | `booking-rules.spec.ts` | Auto-cancel trigger, min night validation |
| 15 | `admin-communications.spec.ts` | Compose, filter recipients, send, SMS |
| 16 | `waitlist.spec.ts` | Join waitlist, notification, convert to booking |
| 17 | `admin-documents.spec.ts` | Upload, access control, member download |
| 18 | `admin-audit-log.spec.ts` | Filter by action/actor/date, verify entries |
| 19 | `admin-xero.spec.ts` | Connect flow, sync trigger, data mapping |
| 20 | Expand all specs | Edge cases, error states, mobile viewports |

#### Standards
- Reuse existing auth fixtures (admin/officer/member) — no new accounts unless phase adds a role
- Tests must be idempotent — clean up created data or use unique identifiers
- No sleeps — use Playwright `waitFor` and auto-retry assertions
- Each spec under 150 lines — split if larger
- Happy path + one key error state per flow
- Mobile viewport test for at least one critical flow per phase
- **Target:** grow from 29 E2E tests to ~100+ by Phase 20

#### Infrastructure
- Current: Playwright against production DB via SSH after deploy
- Phase 20: dedicated test environment with seeded DB
- Until then: read-only E2E preferred, write-ops must clean up
