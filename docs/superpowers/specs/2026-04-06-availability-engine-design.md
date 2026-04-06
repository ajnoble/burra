# Phase 5: Availability Engine — Design Spec

## Overview

The availability engine provides a cache-first system for tracking lodge bed availability, an admin interface for viewing and managing availability (including date blocks and capacity reductions), a member-facing calendar for checking availability, and a date validation layer that Phase 6 (Booking Flow) will consume.

## Architecture

**Approach: Cache-First.** The existing `availabilityCache` table is the single source of truth for all availability reads. It stores one row per lodge per date with `totalBeds`, `bookedBeds`, and a `version` field for optimistic concurrency. Available beds = `totalBeds - bookedBeds`.

Cache population is dual-mode:
- **Bulk seed** when a season is activated — generates rows for every date in the season across all org lodges
- **Incremental updates** when bookings are created/cancelled (Phase 6) or overrides change

A new `availabilityOverrides` table lets admins block dates or reduce capacity. Override changes patch the cache immediately.

## Data Model

### Existing table: `availabilityCache` (no changes)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `lodgeId` | uuid FK → lodges | |
| `date` | date | |
| `totalBeds` | integer | Effective total (base minus overrides) |
| `bookedBeds` | integer, default 0 | |
| `version` | integer, default 0 | Optimistic concurrency |
| `updatedAt` | timestamptz | |

Unique index on `(lodgeId, date)`.

### New table: `availabilityOverrides`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `lodgeId` | uuid FK → lodges | |
| `startDate` | date | First date of block (inclusive) |
| `endDate` | date | Last date of block (inclusive) |
| `type` | enum: `CLOSURE`, `REDUCTION` | |
| `bedReduction` | integer, nullable | Only for `REDUCTION` type |
| `reason` | text, nullable | Admin note |
| `createdByMemberId` | uuid FK → members | |
| `createdAt` | timestamptz | |
| `updatedAt` | timestamptz | |

- `CLOSURE` sets effective available beds to 0 for the date range
- `REDUCTION` subtracts `bedReduction` from `totalBeds` when computing effective availability
- Overlapping overrides stack: multiple reductions sum, a closure overrides everything

### New enum: `overrideType`

Values: `CLOSURE`, `REDUCTION`

## Server Actions & Query Layer

All files under `src/actions/availability/`.

### Cache management

**`rebuildAvailabilityCache(lodgeId, startDate, endDate)`**
- Deletes existing cache rows for the range
- Bulk-inserts one row per date
- Computes `totalBeds` = `lodge.totalBeds` minus active override reductions (or 0 if closure)
- Sets `bookedBeds` to 0 (or counts existing confirmed bookings if any)

**`seedSeasonAvailability(seasonId)`**
- Looks up season date range and all lodges in the org
- Calls `rebuildAvailabilityCache` for each lodge

### Override actions

**`createAvailabilityOverride(data)`**
- Validates dates within an active season
- Creates override row
- Patches affected cache rows (`totalBeds` recalculated for each date in range)

**`updateAvailabilityOverride(id, data)`**
- Updates override
- Reverts old cache rows to base `totalBeds`
- Reapplies all active overrides for affected dates

**`deleteAvailabilityOverride(id)`**
- Removes override
- Rebuilds cache rows for affected date range

### Query helpers (`queries.ts`)

**`getMonthAvailability(lodgeId, year, month)`**
- Returns all cache rows for the month
- Single indexed query on `(lodgeId, date)`

**`getDateRangeAvailability(lodgeId, startDate, endDate)`**
- Returns cache rows for an arbitrary range
- Used by booking validation and calendar

**`getOverridesForLodge(lodgeId, startDate?, endDate?)`**
- Returns active overrides, optionally filtered by date range

### Date validation (`validation.ts`)

**`validateBookingDates(params)`**
- Input: `lodgeId`, `checkIn`, `checkOut`, `bookingRoundId`, `memberId`
- Output: `{ valid: boolean, errors: string[] }`

Seven rules enforced:
1. **Within season** — dates must fall within an active season's start/end range
2. **Within booking round** — the round must be open (between `opensAt` and `closesAt`)
3. **Minimum nights** — from the tariff's `minimumNights`
4. **Max nights per booking** — from `bookingRound.maxNightsPerBooking`
5. **Max nights per member** — from `bookingRound.maxNightsPerMember` (counts existing bookings for the member in this round)
6. **No past dates** — `checkIn` must be today or later
7. **Sufficient availability** — at least 1 available bed on every night of the stay

### Validation schemas (`schemas.ts`)

Zod schemas for:
- Override create input (startDate, endDate, type, bedReduction, reason)
- Override update input
- `validateBookingDates` input params

Constraints:
- `endDate >= startDate`
- `bedReduction` required and > 0 when type is `REDUCTION`
- `bedReduction` must be null/omitted when type is `CLOSURE`
- Dates must be valid ISO date strings

## UI

### Admin view: `/[slug]/admin/availability/`

**Lodge selector** — dropdown at top, defaults to first lodge. Hidden if org has one lodge.

**Month calendar** — grid of days with left/right navigation arrows:
- Colour coding per cell:
  - Green: >50% beds available
  - Amber: 1-50% available
  - Red: fully booked (0 available)
  - Dark grey: closed (override closure)
- Each cell shows beds available as fraction (e.g. "12/20")
- Small icon indicator if an override is active on that date
- Click a date opens a detail panel/modal showing: availability breakdown, active overrides, option to create a new override starting on that date

**Override management** — table below calendar showing active/upcoming overrides for the selected lodge:
- Columns: date range, type, bed reduction, reason, created by
- Edit and delete actions per row
- "Add Override" button opens a form: date range picker, type selector (closure/reduction), bed count input (if reduction), reason text field

**Sidebar integration** — new "Availability" link in admin sidebar, positioned between Lodges and Members.

### Member view: `/[slug]/availability/`

**Same calendar component** but simplified:
- Colour coding: green ("Available"), amber ("Limited"), red ("Unavailable")
- No exact bed counts shown
- Lodge selector if multiple lodges
- No override details or management actions
- Read-only informational page

### Shared component

`<AvailabilityCalendar mode="admin" | "member">` — single component with mode prop controlling display level. Calendar grid, navigation, and data fetching are shared. Rendering varies by mode.

## File Structure

```
src/
  actions/availability/
    rebuild.ts              # rebuildAvailabilityCache, seedSeasonAvailability
    overrides.ts            # create/update/delete override actions
    queries.ts              # getMonthAvailability, getDateRangeAvailability, getOverridesForLodge
    validation.ts           # validateBookingDates
    schemas.ts              # Zod schemas for overrides and validation inputs
    __tests__/
      rebuild.test.ts
      overrides.test.ts
      queries.test.ts
      validation.test.ts
      schemas.test.ts
  app/[slug]/
    admin/availability/
      page.tsx              # Admin availability page
      availability-calendar.tsx  # Shared calendar component
      override-form.tsx     # Create/edit override dialog
      override-table.tsx    # Active overrides list
    availability/
      page.tsx              # Member-facing availability page
  db/schema/
    availability.ts         # Add availabilityOverrides table + override type enum
drizzle/
    XXXX_availability_overrides.sql  # Generated migration
```

## Season Activation Hook

When an admin activates a season via the existing settings flow, `seedSeasonAvailability` is called to populate the cache for all lodges across the season's date range. This is the primary entry point for cache population.

## Testing Strategy

All tests written before implementation (TDD).

### Unit tests
- **Validation schemas** — override create/update schemas, date range constraints, type-dependent bedReduction rules
- **Date validation** — each of the 7 rules tested individually with edge cases (boundary dates, timezone AEDT/AEST crossover, exactly-at-limit nights)
- **Availability computation** — base beds minus overrides, closure zeroes out, reduction subtracts, overlapping overrides stack

### Integration tests (mocked DB)
- **Cache rebuild** — seeds correct rows for date range, applies overrides, handles empty ranges
- **Override CRUD** — create/update/delete with cache row patch verification
- **Query helpers** — correct shape returned, proper lodge/date filtering
- **`validateBookingDates`** — end-to-end scenarios: valid range, past dates, no availability, round closed, exceeded night limits

### No E2E tests
Playwright E2E deferred to Phase 17 per project plan.

## Dependencies

- Phase 2 schema (lodges, seasons, bookingRounds, tariffs) — already built
- Phase 3 admin layout and sidebar — already built
- `src/lib/dates.ts` utilities (timezone conversion, weekend detection) — already built

## What This Enables

- Phase 6 (Booking Flow) calls `validateBookingDates` before booking creation and uses `getDateRangeAvailability` to check capacity
- Phase 6 incremental cache updates: booking creation increments `bookedBeds` with `version` check, cancellation decrements
- Phase 9 (Admin Booking Management) uses the admin calendar for visual booking oversight
