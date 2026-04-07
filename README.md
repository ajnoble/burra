# Snow Gum

A SaaS booking and membership management platform for member-owned accommodation clubs in Australia. Built to replace legacy systems like CBDWeb with a modern, mobile-first experience.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router, Turbopack) |
| **Language** | TypeScript (strict mode) |
| **Database** | PostgreSQL via Supabase |
| **ORM** | Drizzle ORM |
| **Auth** | Supabase Auth (email/password, magic link) |
| **Payments** | Stripe Connect (Express accounts) |
| **UI** | Tailwind CSS v4 + shadcn/ui (Base UI) |
| **Email** | Resend + React Email |
| **Rate Limiting** | Upstash Redis |
| **Testing** | Vitest (unit/integration), Playwright (E2E) |
| **Deployment** | Docker on VPS |

## Architecture

### Multi-Tenant Design

Every club is an `Organisation` with a unique slug. All routes are scoped under `/[slug]/` and every database query is filtered by `organisationId`. Supabase Row Level Security provides a second enforcement layer.

### Data Model (21 tables)

```
Organisation
 ├── Lodge ── Room ── Bed
 ├── MembershipClass
 ├── Member ── OrganisationMember (role-based)
 ├── Season ── BookingRound
 ├── Tariff (per lodge, season, membership class)
 ├── CancellationPolicy
 ├── Booking ── BookingGuest (snapshots tariff at booking time)
 ├── AvailabilityCache (materialised, optimistic concurrency)
 ├── Transaction / Subscription
 ├── WaitlistEntry
 ├── MemberImport
 ├── Document
 └── AuditLog
```

### Key Design Decisions

- **Money**: All financial values stored as integer cents. No floating point arithmetic. Display-only formatting via `formatCurrency()`.
- **Dates**: All dates stored in UTC. Converted to organisation timezone (`Australia/Melbourne` default) at the presentation layer using `date-fns-tz`.
- **Concurrency**: Booking creation uses `SELECT FOR UPDATE` row locks plus optimistic versioning on `AvailabilityCache` to handle high-concurrency opening day scenarios.
- **Access Control**: Four roles per organisation (MEMBER, BOOKING_OFFICER, COMMITTEE, ADMIN) enforced via server-side middleware on every admin route.

### Project Structure

```
src/
  app/                          # Next.js App Router pages
    [slug]/                     # Per-club routes
      admin/                    # Admin pages (role-protected)
        availability/           # Availability calendar and overrides
        lodges/                 # Lodge, room, bed management
        members/import/         # CSV member import flow
        settings/               # Org settings, membership classes
      dashboard/                # Member dashboard
      login/                    # Auth
  actions/                      # Server actions (mutations)
    availability/               # Cache rebuild, overrides, validation
    lodges/
    membership-classes/
    members/
    organisations/
  components/ui/                # shadcn/ui components
  db/
    schema/                     # Drizzle schema (14 files, 21 tables)
    seed.ts                     # Demo data (Alpine Demo Club)
    seed-polski.ts              # Polski Ski Club config
    index.ts                    # Drizzle client
  lib/
    email/                      # Resend client, sendEmail helper, 12 templates
    import/                     # CSV parsing and validation
    supabase/                   # Supabase client helpers
    auth.ts                     # Session and role helpers
    currency.ts                 # Money formatting (cents -> AUD)
    dates.ts                    # UTC/timezone conversion
    org.ts                      # Organisation resolver
    validation.ts               # Shared Zod schemas
drizzle/                        # Generated SQL migrations
```

## Features

### Completed

| Phase | Feature | Description |
|-------|---------|-------------|
| 1 | Project Scaffold | Next.js 16, Drizzle, Supabase Auth, shadcn/ui, shared utilities |
| 2 | Data Model | 21 tables with full migration, demo + Polski seed scripts |
| 0 | CSV Member Import | 4-step flow: upload, preview with validation, confirm, results |
| 3 | Organisation & Lodge Admin | Admin layout with sidebar, org settings, membership classes, lodge/room/bed CRUD |
| 4 | Member Management | Member list with search/filter, add/edit members, family linking, role management, financial status with history |
| 5 | Availability Engine | Cache rebuild, admin overrides (closures/reductions), calendar component (admin + member), booking date validation |
| 6 | Booking Flow | 5-step member booking wizard, concurrency handling with SELECT FOR UPDATE, timed bed holds, per-guest pricing |
| 7 | Stripe Connect | Express account onboarding, Stripe Checkout payments, webhook processing, 1% platform fee |
| 8 | Email Notifications | 12 templates via Resend + React Email, fire-and-forget delivery, admin copy on bookings |
| 9 | Admin Booking Management | Admin booking list, approve/cancel/modify, bed reassignment, cancellation policies, Stripe refunds, member self-cancel |
| 10 | Subscription Management | Annual fees per membership class, Stripe Checkout payment, admin waive/adjust/record, daily cron for reminders and grace period |
| 11 | Authentication & Onboarding | Magic link login, password reset, invite-based onboarding, logout, org-picker, setup script |

### Planned (Build Order)

| Phase | Feature |
|-------|---------|
| 12 | Treasurer Reporting — revenue, occupancy, ledger, CSV exports |
| 13 | Bulk Communications — filtered email to members |
| 14 | Waitlist — entry, notification, conversion to booking |
| 15 | Document Library — upload, access control |
| 16 | Audit Log — viewer, filtering, export |
| 17 | Hardening — E2E tests, load testing, security review |

## Getting Started

### Prerequisites

- Node.js 20+
- A Supabase project
- (Optional) Stripe test account

### Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/ajnoble/snowgum.git
   cd snowgum
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env.local` from the example:
   ```bash
   cp .env.example .env.local
   ```
   Fill in your Supabase and Stripe credentials.

4. Run database migrations:
   ```bash
   npm run db:migrate
   ```

5. (Optional) Seed demo data:
   ```bash
   npm run db:seed
   ```

6. Start the dev server:
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

### NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Run ESLint |
| `npm run check` | Lint + test + build (full quality check) |
| `npm run db:generate` | Generate Drizzle migration from schema |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Seed demo data (Alpine Demo Club) |
| `npm run db:seed:polski` | Seed Polski Ski Club config |
| `npm run test:e2e` | Run E2E tests (headless Chromium) |
| `npm run test:e2e:ui` | Interactive Playwright UI |

## Testing

### Unit / Integration Tests

Tests use [Vitest](https://vitest.dev/) and live alongside the code in `__tests__/` directories.

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

### E2E Tests (Playwright)

Run against the production container on the VPS (Docker internal IP `172.20.0.2:3010`):

```bash
npm run test:e2e          # Run all E2E tests (headless)
npm run test:e2e:ui       # Interactive Playwright UI
```

E2E tests cover 6 critical flows: login, booking, admin members, dashboard, admin bookings, and org picker. They use seeded test accounts (password: `testpass123`):

- **Admin:** marek.kowalski@example.com
- **Booking Officer:** anna.nowak@example.com
- **Member:** katarzyna.wojcik@example.com

> **Note:** E2E tests currently run against the production database on the VPS. A dedicated test environment with isolated data should be set up before expanding the test suite to include write operations (e.g. creating members, making bookings).

### Test Coverage

- **Currency utilities** — formatting, basis point calculations, integer arithmetic
- **Date utilities** — UTC/timezone conversion, AEDT/AEST handling, weekend detection
- **Validation schemas** — email, slug, cents, pagination
- **CSV parser** — header normalisation, required columns, empty handling
- **Import validator** — required fields, email uniqueness, membership class matching, boolean parsing
- **Member validation** — create/update schemas, financial status change schema
- **Member queries** — paginated list, detail, family, financial history, search
- **Member actions** — create, update, role change, financial status, family linking
- **Availability schemas** — override create/update, booking date validation inputs
- **Availability queries** — month availability, date range, overrides by lodge
- **Cache rebuild** — date range generation, override application, season seeding
- **Override actions** — create, update, delete with cache rebuild
- **Booking date validation** — all 7 rules: season, round, min/max nights, past dates, availability
- **Email templates** — all 12 template rendering tests, layout component, sendEmail helper
- **Email integrations** — Welcome on member create, Booking Confirmation on booking create, Payment Received/Expired on webhooks, Financial Status Changed on status update
- **Admin booking queries** — paginated list, detail, pending count, available beds
- **Refund calculation** — policy tiers, boundary conditions, rounding, empty rules
- **Booking actions** — approve, cancel with refund, modify dates with repricing, reassign beds, admin notes
- **Cancellation policy** — save with validation, tier sorting, duplicate detection
- **Stripe refund** — connected account refund, missing payment handling
- **Payment gating** — block checkout for PENDING bookings

### Development Workflow

1. **Write tests first** (TDD) for new features
2. **Implement** to make tests pass
3. **Run quality checks**: `npm run check` (lint + test + build)
4. **Update README** with new features
5. **Commit** with conventional commit messages

## Business Model

- **SaaS subscription**: $99/month per club
- **Platform fee**: 1% on all booking payments via Stripe `application_fee_amount`
- Infrastructure costs ~$50/month (Supabase Pro + Vercel Pro + Upstash)

## License

Private. All rights reserved.
