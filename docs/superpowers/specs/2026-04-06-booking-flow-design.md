# Phase 6: Booking Flow — Design Spec

## Overview

A 5-step member-facing booking wizard that allows club members to book beds at their organisation's lodges. The flow handles concurrent bookings on high-demand opening days using database-level locking and timed bed holds.

**Route:** `/[slug]/book`  
**Approach:** Single-page client-side wizard with URL state sync (Approach C)

---

## Architecture

### Route & Component Structure

```
BookingPage (server component)
  ├── Fetches: lodges, seasons, booking rounds, member session
  ├── Validates: auth, financial status, round eligibility
  └── Renders:
      BookingWizard (client component — "use client")
        ├── BookingContext — wizard state + URL param sync
        ├── StepIndicator — progress bar (steps 1-5)
        ├── Step components (rendered by current step):
        │   ├── Step 1: SelectLodgeDates
        │   ├── Step 2: AddGuests
        │   ├── Step 3: SelectBeds
        │   ├── Step 4: ReviewPricing
        │   └── Step 5: Confirm
        └── BookingSuccess — confirmation with reference number
```

### URL State Sync

Non-sensitive navigation state is synced to URL search params for resilience to page refresh:

| Step | URL params |
|------|-----------|
| 1 | `?step=1` |
| 2-5 | `?step=N&lodge=<uuid>&checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&round=<uuid>` |

Guest selections and bed assignments are stored in React state only (not in URL) — they contain member IDs which should not be exposed.

On page refresh at step 3+, the wizard restores lodge/dates from URL params. The member must re-select guests and beds.

### Server Actions (new files)

All in `src/actions/bookings/`:

| File | Purpose |
|------|---------|
| `schemas.ts` | Zod schemas for booking input validation |
| `queries.ts` | Booking list, detail, member's bookings |
| `create.ts` | `createBooking` — transactional booking creation with concurrency handling |
| `pricing.ts` | `calculateBookingPrice` — tariff lookup, per-night calculation, discounts |
| `holds.ts` | `createBedHold`, `releaseBedHold`, `cleanupExpiredHolds` |
| `beds.ts` | `getAvailableBeds` — rooms/beds for lodge+date range, excluding booked and held |
| `members.ts` | `getBookableMembers` — org members the current user can add as guests |
| `reference.ts` | `generateBookingReference` — org prefix + year + 4-char random alphanumeric |

---

## Schema Changes

### New column on `bookingRounds`

```
holdDurationMinutes  integer  default 10  nullable
```

When null, no soft holds are used — beds are only reserved at confirmation time. When set, beds are soft-held for this many minutes when selected in step 3.

### New table: `bedHolds`

```
bedHolds
  id               uuid PK
  lodgeId           uuid FK → lodges
  bedId             uuid FK → beds
  memberId          uuid FK → members
  bookingRoundId    uuid FK → bookingRounds
  checkInDate       date
  checkOutDate      date
  expiresAt         timestamp with timezone
  createdAt         timestamp with timezone
```

Overlapping holds on the same bed are prevented at the application level in `createBedHold` — the action checks for existing non-expired holds on the bed for overlapping date ranges before inserting. This is simpler than a database exclusion constraint and sufficient given the short-lived nature of holds.

### New column on `lodges`

```
checkInTime    text  default '17:00'
checkOutTime   text  default '16:00'
```

Lodge-level check-in and check-out times, displayed on booking confirmations.

### Extended enum: `overrideTypeEnum`

Add `EVENT` to the existing enum `['CLOSURE', 'REDUCTION']` → `['CLOSURE', 'REDUCTION', 'EVENT']`.

An `EVENT` override is informational only — it displays a label on the calendar (e.g. "Inter School Sports", "Working Bee") using the existing `reason` field but does not affect bed availability. No beds are blocked or reduced.

---

## Wizard Steps

### Step 1: Select Lodge & Dates

**UI:** Lodge selector (pills/cards), booking round dropdown with rules info box, availability calendar with date range selection.

**Behaviour:**
- Lodge list filtered to active lodges for the organisation
- Booking round dropdown shows only rounds that are currently open and that the member's class is eligible for
- Calendar shows availability per day (colour-coded: available, limited, full, closed, event labels)
- Member selects check-in and check-out dates by clicking
- Dates marked red (full) or with closure overrides cannot be selected
- Event overrides display their label on the calendar without affecting selectability
- On "Next": calls `validateBookingDates` server action (existing from Phase 5)

**URL sync:** On advancing to step 2, writes `lodge`, `checkIn`, `checkOut`, `round` to URL params.

### Step 2: Add Guests

**UI:** Guest list with the logged-in member auto-added as primary. Search input to add other members.

**Behaviour:**
- Primary member is always included and cannot be removed
- Search shows family members (linked via `primaryMemberId`) first, then other org members
- Each guest shows their membership class (affects pricing)
- Maximum guests limited by available beds for the date range
- Guest data stored in React state only

### Step 3: Select Beds

**UI:** Room-by-room grid showing all beds with status (available, booked, held by another, selected by you). Each guest is assigned a different colour. Hold timer warning banner.

**Behaviour:**
- On page load: calls `getAvailableBeds` which also runs `cleanupExpiredHolds`
- Beds that are booked or held by other members are shown as unavailable
- Member clicks a bed, then assigns a guest to it (or auto-assigns in order)
- All guests must be assigned a bed before proceeding
- On assignment: calls `createBedHold` server action
  - Inserts into `bedHolds` with `expiresAt = now + holdDurationMinutes`
  - If the round has `holdDurationMinutes = null`, no hold is created (beds only reserved at confirmation)
- Hold timer displayed in the UI showing time remaining
- If hold expires while on this step, the UI warns and the member must re-select

### Step 4: Review & Pricing

**UI:** Two-column layout — booking summary (left) and price breakdown table (right).

**Behaviour:**
- Calls `calculateBookingPrice` server action
- Price breakdown table shows per-guest: bed assignment, guest name, tariff (membership class), total
- Matches legacy email format: Bed Details | Name | Tariff | Calculated Cost
- Shows subtotal, any multi-night discount, and grand total
- Info banner: "An invoice will be created. Payment can be made later via your dashboard."
- Check-in/check-out times displayed from lodge settings

### Step 5: Confirm

**UI:** Compact summary card with single "Confirm Booking" button.

**Behaviour:**
- Displays: lodge, dates, night count, guest count, total
- On confirm: calls `createBooking` server action (see Concurrency section)
- Button shows loading state during submission
- On success: redirects to BookingSuccess component
- On failure (bed taken): redirects back to step 3 with error message

### Success Screen

**UI:** Confirmation with large booking reference, booking details, and action buttons.

**Content:**
- Booking reference (e.g. `POLS-2027-7K3M`)
- Lodge, dates, check-in/out times, guest list, total, status
- Buttons: "View My Bookings", "Make Another Booking"

---

## Pricing Calculation

`calculateBookingPrice` computes the total for a booking:

### Per-guest calculation

1. **Tariff lookup** — by `lodgeId` + `seasonId` + guest's `membershipClassId`. Falls back to default tariff (`membershipClassId = null`) if no class-specific tariff exists.

2. **Per-night rate** — iterate each night from check-in to check-out:
   - Friday and Saturday nights → `pricePerNightWeekendCents`
   - All other nights → `pricePerNightWeekdayCents`

3. **Guest subtotal** — sum of all per-night rates for that guest.

4. **Multi-night discount** (applied per-guest):
   - 7+ nights → `discountSevenNightsBps` (takes priority over 5-night)
   - 5-6 nights → `discountFiveNightsBps`
   - Applied using `applyBasisPoints()` — integer arithmetic, no floats
   - Discount amount is rounded to nearest cent

5. **Guest total** = subtotal − discount amount

### Booking total

Sum of all guest totals. Stored on the `bookings` row as:
- `subtotalCents` — sum of guest subtotals (before discounts)
- `discountAmountCents` — sum of guest discounts
- `totalAmountCents` — subtotalCents − discountAmountCents

### Tariff snapshot

Each `bookingGuest` row snapshots:
- `pricePerNightCents` — blended average for display (total ÷ nights)
- `totalAmountCents` — guest total after discount
- `snapshotTariffId` — the tariff used
- `snapshotMembershipClassId` — the guest's class at booking time

This freezes pricing at booking time regardless of future tariff changes.

---

## Concurrency Handling

### createBooking server action

1. **Rate limit check** — Upstash Redis, 5 submissions/min per member. If exceeded: return "Too many requests, try again shortly."

2. **Auth + eligibility** — Verify session, membership, financial status, membership class allowed in round.

3. **BEGIN TRANSACTION**

4. **SELECT FOR UPDATE on availability_cache** — Lock the date range rows for this lodge. Other concurrent bookings wait here.

5. **Verify beds still available** — Check each selected bed isn't already booked for the date range. If taken: ROLLBACK, return error, redirect to step 3.

6. **Re-validate booking rules** — Season, round open, min/max nights, member limits. Server-side re-check (never trust client state).

7. **Calculate final pricing** — Full per-guest tariff calculation (as described above).

8. **Insert records:**
   - `bookings` row — status `PENDING` (if `requiresApproval`) or `CONFIRMED`
   - `bookingGuests` rows — per guest with bed assignment, tariff snapshot
   - `transactions` row — type `INVOICE`, debit for total amount

9. **Update availability_cache** — Increment `bookedBeds` for each date in range. Bump `version` (optimistic concurrency guard).

10. **Delete bed holds** — Remove any `bedHolds` rows for this member/round.

11. **COMMIT**

12. **Return success** — Booking reference, redirect to confirmation.

### Concurrent booking scenario

When two members attempt to book the same bed simultaneously:
- Member A acquires the row lock at step 4
- Member B's transaction waits at step 4 until A commits
- After A commits, B acquires the lock, sees the bed is taken at step 5, rolls back
- Member B receives "Bed X is no longer available" and is returned to step 3 with refreshed availability

### Bed holds

Soft holds prevent the scenario where a member selects beds in step 3 but another member books them before they reach step 5.

**Hold lifecycle:**
1. Member selects bed in step 3 → `createBedHold` inserts row with `expiresAt`
2. Other members querying `getAvailableBeds` see held beds as unavailable
3. Member completes booking → `createBooking` deletes the hold and creates the real booking
4. Member abandons → hold expires naturally

**Cleanup:** No background cron needed. Expired holds are cleaned up lazily:
- On every `getAvailableBeds` call: `DELETE FROM bed_holds WHERE expires_at < now()`
- Before inserting new holds: same cleanup

**Configuration:** `holdDurationMinutes` on `bookingRounds` table. Different rounds can have different hold durations. Opening day rounds (high demand) might use 5 minutes; off-peak rounds could use 15 minutes. Set to `null` to disable holds entirely.

---

## Booking Reference Format

Format: `{ORG_PREFIX}-{YEAR}-{RANDOM}`

- **ORG_PREFIX** — derived from organisation slug, uppercase, max 4 chars (e.g. `POLS` for polski-ski-club)
- **YEAR** — 4-digit year of the booking creation
- **RANDOM** — 4 alphanumeric characters (uppercase letters + digits, no ambiguous chars like O/0/I/1)

Example: `POLS-2027-7K3M`

Collision handling: retry with new random on unique constraint violation (extremely rare with 34^4 = 1.3M combinations per org per year).

---

## Calendar Enhancement: Event Overrides

The existing `availabilityOverrides` table and `overrideTypeEnum` are extended with a third type:

| Type | Effect | Calendar display |
|------|--------|-----------------|
| `CLOSURE` | All beds blocked | Red, not bookable |
| `REDUCTION` | Bed count reduced | Shows reduced availability |
| `EVENT` | No effect on availability | Shows event label from `reason` field |

Admin creates `EVENT` overrides via the existing availability management UI (Phase 5). The admin form gains a third option for override type. The `bedReduction` field is hidden/ignored when type is `EVENT`.

Member and admin calendars display event labels on the relevant dates. Members can still book on event dates — the label is purely informational.

---

## Error Handling

| Scenario | Response |
|----------|----------|
| Member not authenticated | Redirect to login |
| Member not financial | Error: "Your membership is not currently financial" |
| Membership class not eligible for round | Error: "This booking round is not available for your membership class" |
| Booking round not open | Error: "This booking round is not currently open" |
| Dates outside season | Error: "Dates are not within an active season" |
| Below minimum nights | Error: "A minimum of N nights is required" |
| Exceeds max nights per booking | Error: "Maximum N nights per booking in this round" |
| Exceeds max nights per member in round | Error: "This booking would exceed your N-night limit" |
| No availability on a date | Error: "No availability on {date}" |
| Bed taken at confirmation | Error: "Bed X is no longer available" → redirect to step 3 |
| Hold expired | Warning in UI, must re-select beds |
| Rate limited | Error: "Too many requests, please try again shortly" |

---

## Testing Strategy

### Unit tests (Vitest)

- **Pricing calculation** — weekday/weekend rates, multi-night discounts, per-guest with different membership classes, edge cases (all weekend, all weekday, exactly 5 nights, exactly 7 nights)
- **Booking reference generation** — format validation, uniqueness, no ambiguous characters
- **Bed hold logic** — creation, expiry check, cleanup
- **Validation schemas** — all Zod schemas for booking inputs

### Integration tests (Vitest with DB)

- **createBooking** — happy path, concurrent booking conflict, rate limiting, all validation rules
- **Bed holds** — hold creation, expiry, cleanup on query, conversion to booking
- **Pricing queries** — tariff fallback, season/class combinations

### Future (Phase 17)

- **E2E tests** (Playwright) — full wizard flow, concurrent user simulation
- **Load testing** — opening day scenario with many concurrent bookings

---

## Files to Create/Modify

### New files

| File | Purpose |
|------|---------|
| `src/app/[slug]/book/page.tsx` | Booking page (server component) |
| `src/app/[slug]/book/booking-wizard.tsx` | Wizard client component |
| `src/app/[slug]/book/booking-context.tsx` | React context for wizard state |
| `src/app/[slug]/book/steps/select-lodge-dates.tsx` | Step 1 |
| `src/app/[slug]/book/steps/add-guests.tsx` | Step 2 |
| `src/app/[slug]/book/steps/select-beds.tsx` | Step 3 |
| `src/app/[slug]/book/steps/review-pricing.tsx` | Step 4 |
| `src/app/[slug]/book/steps/confirm.tsx` | Step 5 |
| `src/app/[slug]/book/booking-success.tsx` | Success screen |
| `src/app/[slug]/book/step-indicator.tsx` | Progress bar component |
| `src/actions/bookings/schemas.ts` | Zod validation schemas |
| `src/actions/bookings/queries.ts` | Booking queries |
| `src/actions/bookings/create.ts` | createBooking server action |
| `src/actions/bookings/pricing.ts` | calculateBookingPrice |
| `src/actions/bookings/holds.ts` | Bed hold CRUD |
| `src/actions/bookings/beds.ts` | Available bed queries |
| `src/actions/bookings/members.ts` | Bookable member queries |
| `src/actions/bookings/reference.ts` | Booking reference generation |
| `src/actions/bookings/__tests__/` | Test files for all above |
| `drizzle/XXXX_add_bed_holds.sql` | Migration for schema changes |

### Modified files

| File | Change |
|------|--------|
| `src/db/schema/bookings.ts` | Add `bedHolds` table export |
| `src/db/schema/seasons.ts` | Add `holdDurationMinutes` to `bookingRounds` |
| `src/db/schema/lodges.ts` | Add `checkInTime`, `checkOutTime` to `lodges` |
| `src/db/schema/availability.ts` | Add `EVENT` to `overrideTypeEnum` |
| `src/db/schema/index.ts` | Export new table |
| `src/app/[slug]/availability/` | Show event labels on member calendar |
| `src/app/[slug]/admin/availability/` | Add EVENT option to override form, show event labels |
| `src/app/[slug]/dashboard/page.tsx` | Show upcoming bookings (query real data) |
