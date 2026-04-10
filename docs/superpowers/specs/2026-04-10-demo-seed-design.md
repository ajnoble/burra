# Demo Seed Script Design

## Purpose

A comprehensive seed script that populates the database with realistic demo data for the Polski Ski Club, covering all 22 completed phases. Aimed at prospective ski clubs evaluating the platform.

## Decisions

- **Audience:** Prospective ski clubs (sales demo)
- **Approach:** Single file (`src/db/seed-demo.ts`), matching existing seed patterns
- **Org name:** "Polski Ski Club" (slug: `polski`)
- **Rename existing:** `seed-polski.ts` → `seed-test.ts`, `seed-polski-data.ts` → `seed-test-data.ts`, org name → "Test Org", slug → `test-org`
- **Auth:** Supabase Auth users created for all non-junior members
- **Pricing:** Realistic Australian ski club rates
- **Dates:** Two seasons — Winter 2025 (historical/completed) and Winter 2026 (upcoming/active)
- **GST:** Enabled at 10%
- **Idempotent:** Clears existing Polski data on re-run

---

## Organisation & Lodge

**Organisation:** "Polski Ski Club"
- Slug: `polski`
- Timezone: `Australia/Sydney`
- GST enabled, rate 1000 bps (10%)
- Contact email, accent colour configured
- `memberBookingEditWindowDays`: 7
- `memberEditRequiresApproval`: true

**Lodge:** "Kosciuszko Lodge" — 8 rooms, 2 floors, 24 beds total

| Floor | Room | Capacity |
|-------|------|----------|
| Ground | Common Room | 2 beds |
| Ground | Family Room 1 | 4 beds |
| Ground | Family Room 2 | 4 beds |
| Ground | Accessible Room | 2 beds |
| Upper | Bunk Room A | 4 beds |
| Upper | Bunk Room B | 4 beds |
| Upper | Double Room | 2 beds |
| Upper | Single Room | 2 beds |

---

## Membership Classes

| Class | Annual Fee | Sort Order |
|-------|-----------|------------|
| Life Member | $0 (waived) | 1 |
| Full Member | $750 | 2 |
| Associate | $400 | 3 |
| Junior | $0 | 4 |

---

## Members & Auth

**30 members** with Polish names:

| Role | Count | Classes |
|------|-------|---------|
| ADMIN | 2 | Full Member |
| COMMITTEE | 3 | Full Member, Life Member |
| BOOKING_OFFICER | 2 | Full Member |
| MEMBER | 18 | Full Member (10), Associate (5), Life Member (3) |
| Junior (no auth) | 5 | Junior, linked to parent members |

- 25 Supabase Auth users (all non-juniors), password: `testpass123`
- 22 financial, 3 non-financial members
- 5 juniors linked to parent members via `primaryMemberId`

**Key demo credentials:**
- Admin: `marek.kowalski@example.com`
- Booking Officer: `anna.nowak@example.com`
- Committee: `piotr.wisniewski@example.com`
- Member: `katarzyna.wojcik@example.com`

---

## Seasons & Booking Rounds

**Two seasons:**

| Season | Dates |
|--------|-------|
| Winter 2025 | 1 Jun – 30 Sep 2025 |
| Winter 2026 | 1 Jun – 30 Sep 2026 |

**Booking rounds (per season):**

| Round | Opens | Closes | Approval | Max Nights | Allowed Classes |
|-------|-------|--------|----------|------------|-----------------|
| Priority | Season - 8 weeks | Season - 4 weeks | No | 14 | Life, Full |
| General | Season - 4 weeks | Season - 1 week | Yes | 7 | Life, Full, Associate |

---

## Tariffs

Per night, per season (same rates both seasons):

| Class | Weekday | Weekend | 5-night | 7-night |
|-------|---------|---------|---------|---------|
| Life Member | $0 | $0 | 0% | 0% |
| Full Member | $85 | $110 | 5% | 10% |
| Associate | $110 | $140 | 5% | 10% |
| Junior | $45 | $55 | 5% | 10% |

---

## Cancellation Policy

3-tier policy:
- 14+ days before check-in: full refund
- 7–13 days: 50% forfeit
- Under 7 days: 100% forfeit

---

## Bookings

**Winter 2025 (historical) — 12 bookings:**
- 10 COMPLETED, varied dates across season, 1–3 guests each
- 1 CANCELLED (with refund transaction)
- 1 COMPLETED with 7-night stay (shows multi-night discount)

**Winter 2026 (upcoming) — 10 bookings:**
- 4 CONFIRMED (paid, beds assigned, July–August)
- 3 PENDING (awaiting approval, General round)
- 1 WAITLISTED
- 1 CANCELLED (recent)
- 1 CONFIRMED but unpaid (balance due, demos payment reminders)

---

## Transactions

- INVOICE on each booking creation
- PAYMENT for paid bookings (1% platform fee)
- REFUND for cancelled bookings (per cancellation policy tiers)
- ~40 transactions total across bookings, subscriptions, and charges

---

## Subscriptions (Winter 2026)

- 15 PAID (Full + Associate + Life members)
- 5 UNPAID (due dates approaching)
- 2 WAIVED (Life Members)

---

## One-Off Charges

**4 categories:**
- Locker Hire ($120)
- Key Deposit ($50)
- Cleaning Fee ($80)
- Social Event ($45)

**8 charges:** 4 PAID, 2 UNPAID, 1 WAIVED, 1 OVERDUE

---

## Availability

**Cache:** One row per lodge per date for both seasons. Occupancy varies 30–90% reflecting booked beds.

**Overrides:**
- CLOSURE: "Plumbing maintenance" — 3 days in early June 2026
- REDUCTION: "Floor renovation" — 6 beds unavailable, 1 week in late June 2026
- EVENT: "Club working bee" — 2 beds reserved, weekend in May 2026

---

## Communications (Phase 15)

**3 templates:**
- "Season Opening Announcement"
- "Payment Reminder"
- "Pre-Arrival Info"

**3 communications:**
- 1 sent email to all members (mix of delivered/opened statuses on recipients)
- 1 sent SMS to upcoming arrivals
- 1 draft (unsent)

---

## Waitlist (Phase 16)

3 entries:
- 1 WAITING
- 1 NOTIFIED (48h expiry set)
- 1 CONVERTED (linked to booking)

---

## Document Library (Phase 17)

**3 categories:** "Club Policies", "Lodge Information", "Forms"

**Document records** (no actual file uploads — placeholder metadata):
- "Booking Rules" (MEMBER access)
- "Fire Safety Plan" (MEMBER access)
- "Membership Application Form" (MEMBER access)
- "Committee Meeting Minutes" (COMMITTEE access)
- "Financial Audit Report" (ADMIN access)

---

## Custom Fields (Phase 20)

**5 field definitions:**
- "Dietary Requirements" (text)
- "Emergency Contact" (text)
- "Ski Ability" (dropdown: Beginner/Intermediate/Advanced/Expert)
- "Own Key Holder" (checkbox)
- "Date of Last Visit" (date)

**Values:** Populated for ~15 members with realistic data.

---

## Reporting & Dashboard Coverage

All 7 reports return meaningful data:

| Report | Source |
|--------|-------|
| Transaction Ledger | ~40 transactions |
| Revenue Summary | Two seasons for period comparison |
| Member Balances | Paid, unpaid, partially paid members |
| Subscription Status | Paid, unpaid, waived across classes |
| Occupancy Report | Varied occupancy 30–90% |
| Arrivals & Departures | Upcoming 2026 bookings |
| Booking Summary | 22 bookings across all statuses |

Dashboards:
- Treasurer: YTD vs prior year revenue
- Booking Officer: upcoming arrivals, 3 pending approvals, occupancy
- Committee: member count, growth, occupancy trends

---

## Seed Script Mechanics

**File:** `src/db/seed-demo.ts`
**NPM script:** `npm run db:seed:demo`
**Requires:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

**Execution order:**
1. Check for existing Polski org — delete all related data if found
2. Create organisation
3. Create lodge, rooms, beds
4. Create membership classes
5. Create members + Supabase Auth users (skip existing)
6. Create seasons, booking rounds, tariffs, cancellation policy
7. Create availability cache for both seasons
8. Create availability overrides
9. Create bookings + guests + transactions (2025 then 2026)
10. Create subscriptions
11. Create charge categories + charges
12. Create communication templates + communications + recipients
13. Create waitlist entries
14. Create document categories + documents
15. Create custom field definitions + values
16. Print demo credentials to console

**Rename existing:**
- `seed-polski.ts` → `seed-test.ts` (org name → "Test Org", slug → `test-org`)
- `seed-polski-data.ts` → `seed-test-data.ts` (references updated)
- Update npm scripts accordingly
