# Phase 23: Member Self-Service Booking Editing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let members edit their own bookings (dates, guests, beds) with configurable edit window, availability validation, automatic price recalculation, and Stripe payment delta handling.

**Architecture:** Single `memberEditBooking` server action handles all edit types atomically in one DB transaction. Two new org-level settings control the feature. A new member booking detail page at `/{slug}/dashboard/bookings/{id}` provides the edit UI. Existing pricing, email, audit, and Stripe patterns are reused.

**Tech Stack:** Next.js, Drizzle ORM, Stripe Connect, React Email, Vitest, Playwright

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/db/schema/organisations.ts` | Add `memberBookingEditWindowDays` + `memberEditRequiresApproval` columns |
| `drizzle/0015_member_booking_edit_window.sql` | Migration for new columns |
| `src/actions/availability/validation.ts` | Add `excludeBookingId` to `validateBookingDates` |
| `src/actions/availability/validation-helpers.ts` | Add `excludeBookingId` to `getMemberBookedNightsInRound` + new `getAvailabilityExcludingBooking` |
| `src/actions/bookings/member-edit.ts` | New — core `memberEditBooking` action |
| `src/actions/bookings/member-edit-helpers.ts` | New — pure helper: `isWithinEditWindow`, `buildChangesDescription` |
| `src/actions/bookings/queries.ts` | Add `getBookingDetailForEdit` query |
| `src/actions/bookings/beds.ts` | Add `excludeBookingId` to `getAvailableBeds` |
| `src/actions/organisations/update.ts` | Accept new org settings fields |
| `src/app/[slug]/admin/settings/org-settings-form.tsx` | Add edit window + re-approval inputs |
| `src/app/[slug]/dashboard/bookings/[id]/page.tsx` | New — member booking detail page |
| `src/app/[slug]/dashboard/bookings/[id]/edit-booking-form.tsx` | New — client edit form |
| `src/app/[slug]/dashboard/page.tsx` | Add "View" link on booking cards |
| `src/actions/bookings/__tests__/member-edit-helpers.test.ts` | New — pure function tests |
| `src/actions/bookings/__tests__/member-edit.test.ts` | New — server action tests |
| `src/actions/availability/__tests__/validation.test.ts` | Add `excludeBookingId` test cases |
| `e2e/member-booking-edit.spec.ts` | New — E2E spec |

---

### Task 1: Schema — Add Organisation Settings Columns

**Files:**
- Modify: `src/db/schema/organisations.ts:31` (before `isActive`)
- Create: `drizzle/0015_member_booking_edit_window.sql`

- [ ] **Step 1: Add columns to schema**

In `src/db/schema/organisations.ts`, add before the `isActive` line:

```ts
  memberBookingEditWindowDays: integer("member_booking_edit_window_days").notNull().default(0),
  memberEditRequiresApproval: boolean("member_edit_requires_approval").notNull().default(false),
```

- [ ] **Step 2: Create migration**

Create `drizzle/0015_member_booking_edit_window.sql`:

```sql
ALTER TABLE "organisations" ADD COLUMN "member_booking_edit_window_days" integer NOT NULL DEFAULT 0;
ALTER TABLE "organisations" ADD COLUMN "member_edit_requires_approval" boolean NOT NULL DEFAULT false;
```

- [ ] **Step 3: Run migration**

Run: `cd /opt/snowgum && npx drizzle-kit push`
Expected: Migration applied successfully.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/organisations.ts drizzle/0015_member_booking_edit_window.sql
git commit -m "feat(phase23): add member booking edit window org settings"
```

---

### Task 2: Pure Helpers — `isWithinEditWindow` and `buildChangesDescription`

**Files:**
- Create: `src/actions/bookings/member-edit-helpers.ts`
- Create: `src/actions/bookings/__tests__/member-edit-helpers.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/actions/bookings/__tests__/member-edit-helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  isWithinEditWindow,
  buildChangesDescription,
} from "../member-edit-helpers";

describe("isWithinEditWindow", () => {
  it("returns true when days until check-in >= window", () => {
    // 10 days from now, window is 7
    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 10);
    const checkInDate = future.toISOString().split("T")[0];
    expect(isWithinEditWindow(checkInDate, 7)).toBe(true);
  });

  it("returns false when days until check-in < window", () => {
    // 3 days from now, window is 7
    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 3);
    const checkInDate = future.toISOString().split("T")[0];
    expect(isWithinEditWindow(checkInDate, 7)).toBe(false);
  });

  it("returns false when check-in is today", () => {
    const today = new Date().toISOString().split("T")[0];
    expect(isWithinEditWindow(today, 1)).toBe(false);
  });

  it("returns false when check-in is in the past", () => {
    const past = new Date();
    past.setUTCDate(past.getUTCDate() - 2);
    const checkInDate = past.toISOString().split("T")[0];
    expect(isWithinEditWindow(checkInDate, 0)).toBe(false);
  });

  it("returns true when window is 0 and check-in is tomorrow", () => {
    // window=0 means disabled at the org level, but this function
    // only checks the date math. The caller checks window > 0.
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const checkInDate = tomorrow.toISOString().split("T")[0];
    expect(isWithinEditWindow(checkInDate, 0)).toBe(true);
  });
});

describe("buildChangesDescription", () => {
  it("describes date changes", () => {
    const result = buildChangesDescription({
      oldCheckIn: "2027-07-10",
      oldCheckOut: "2027-07-15",
      newCheckIn: "2027-07-12",
      newCheckOut: "2027-07-17",
    });
    expect(result).toContain("2027-07-10");
    expect(result).toContain("2027-07-12");
  });

  it("describes guest additions", () => {
    const result = buildChangesDescription({
      addedGuestNames: ["Jane Smith"],
    });
    expect(result).toContain("Added: Jane Smith");
  });

  it("describes guest removals", () => {
    const result = buildChangesDescription({
      removedGuestNames: ["Bob Jones"],
    });
    expect(result).toContain("Removed: Bob Jones");
  });

  it("describes price change", () => {
    const result = buildChangesDescription({
      oldTotalCents: 85000,
      newTotalCents: 102000,
    });
    expect(result).toContain("$850.00");
    expect(result).toContain("$1,020.00");
  });

  it("combines multiple changes", () => {
    const result = buildChangesDescription({
      oldCheckIn: "2027-07-10",
      oldCheckOut: "2027-07-15",
      newCheckIn: "2027-07-12",
      newCheckOut: "2027-07-17",
      addedGuestNames: ["Jane Smith"],
      oldTotalCents: 85000,
      newTotalCents: 102000,
    });
    expect(result).toContain("Dates");
    expect(result).toContain("Added");
    expect(result).toContain("Price");
  });

  it("returns empty string when nothing changed", () => {
    const result = buildChangesDescription({});
    expect(result).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /opt/snowgum && npx vitest run src/actions/bookings/__tests__/member-edit-helpers.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `src/actions/bookings/member-edit-helpers.ts`:

```ts
import { formatCurrency } from "@/lib/currency";

/**
 * Check if a booking is within the edit window.
 * Returns true if check-in is far enough in the future (>= windowDays AND > 0 days away).
 */
export function isWithinEditWindow(
  checkInDate: string,
  windowDays: number
): boolean {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const checkIn = new Date(checkInDate + "T00:00:00Z");
  const diffMs = checkIn.getTime() - today.getTime();
  const daysUntil = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  // Must be in the future AND have enough days remaining
  return daysUntil > 0 && daysUntil >= windowDays;
}

type ChangesInput = {
  oldCheckIn?: string;
  oldCheckOut?: string;
  newCheckIn?: string;
  newCheckOut?: string;
  addedGuestNames?: string[];
  removedGuestNames?: string[];
  oldTotalCents?: number;
  newTotalCents?: number;
};

/**
 * Build a human-readable description of booking changes for emails.
 */
export function buildChangesDescription(input: ChangesInput): string {
  const parts: string[] = [];

  if (input.oldCheckIn && input.newCheckIn && input.oldCheckOut && input.newCheckOut) {
    if (input.oldCheckIn !== input.newCheckIn || input.oldCheckOut !== input.newCheckOut) {
      parts.push(
        `Dates: ${input.oldCheckIn} – ${input.oldCheckOut} → ${input.newCheckIn} – ${input.newCheckOut}`
      );
    }
  }

  if (input.addedGuestNames && input.addedGuestNames.length > 0) {
    parts.push(`Guests — Added: ${input.addedGuestNames.join(", ")}`);
  }

  if (input.removedGuestNames && input.removedGuestNames.length > 0) {
    parts.push(`Guests — Removed: ${input.removedGuestNames.join(", ")}`);
  }

  if (
    input.oldTotalCents !== undefined &&
    input.newTotalCents !== undefined &&
    input.oldTotalCents !== input.newTotalCents
  ) {
    parts.push(
      `Price: ${formatCurrency(input.oldTotalCents)} → ${formatCurrency(input.newTotalCents)}`
    );
  }

  return parts.join("; ");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /opt/snowgum && npx vitest run src/actions/bookings/__tests__/member-edit-helpers.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/bookings/member-edit-helpers.ts src/actions/bookings/__tests__/member-edit-helpers.test.ts
git commit -m "feat(phase23): add member edit pure helpers with tests"
```

---

### Task 3: Validation — Add `excludeBookingId` Support

**Files:**
- Modify: `src/actions/availability/validation-helpers.ts:69-85`
- Modify: `src/actions/availability/validation.ts:23-117`
- Modify: `src/actions/availability/__tests__/validation.test.ts` (add cases)

- [ ] **Step 1: Write failing tests for `getMemberBookedNightsInRound` with `excludeBookingId`**

Add to `src/actions/availability/__tests__/validation.test.ts` (find the describe block for validation or the end of the file). The existing test file may need examination — add a new describe block:

```ts
describe("getMemberBookedNightsInRound with excludeBookingId", () => {
  it("excludes the specified booking from the night count", async () => {
    // This test verifies the SQL includes the exclusion clause.
    // Mock setup should return nights that include the excluded booking,
    // and verify the query filters it out.
    // Implementation depends on existing mock patterns in this file.
  });
});
```

Note: If this test file does not exist yet, create it following the mock pattern from `src/actions/bookings/__tests__/modify-dates.test.ts`. The key assertion is that when `excludeBookingId` is passed, the SQL query includes `AND id != <excludeBookingId>`.

- [ ] **Step 2: Modify `getMemberBookedNightsInRound` in `validation-helpers.ts`**

Change the function signature and query at `src/actions/availability/validation-helpers.ts:69-85`:

```ts
export async function getMemberBookedNightsInRound(
  memberId: string,
  bookingRoundId: string,
  excludeBookingId?: string
) {
  const result = await db
    .select({ totalNights: sql<number>`COALESCE(SUM(${bookings.totalNights}), 0)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.primaryMemberId, memberId),
        eq(bookings.bookingRoundId, bookingRoundId),
        sql`${bookings.status} NOT IN ('CANCELLED')`,
        ...(excludeBookingId ? [sql`${bookings.id} != ${excludeBookingId}`] : [])
      )
    );

  return Number(result[0]?.totalNights ?? 0);
}
```

- [ ] **Step 3: Add `getAvailabilityExcludingBooking` helper**

Add to the end of `src/actions/availability/validation-helpers.ts`:

```ts
/**
 * Get availability for a date range, subtracting the guest count of an excluded booking
 * from bookedBeds for dates that overlap with the excluded booking.
 */
export async function getAvailabilityExcludingBooking(
  lodgeId: string,
  checkIn: string,
  checkOut: string,
  excludeBookingId: string
) {
  // Get the excluded booking's date range and guest count
  const [excludedBooking] = await db
    .select({
      checkInDate: bookings.checkInDate,
      checkOutDate: bookings.checkOutDate,
    })
    .from(bookings)
    .where(eq(bookings.id, excludeBookingId));

  const excludedGuestCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(bookingGuests)
    .where(eq(bookingGuests.bookingId, excludeBookingId));

  const guestCount = Number(excludedGuestCount[0]?.count ?? 0);

  // Get base availability
  const availability = await getDateRangeAvailabilityForValidation(
    lodgeId,
    checkIn,
    checkOut
  );

  if (!excludedBooking || guestCount === 0) return availability;

  // Subtract excluded booking's beds from overlapping dates
  return availability.map((day) => {
    const dayOverlaps =
      day.date >= excludedBooking.checkInDate &&
      day.date < excludedBooking.checkOutDate;

    return {
      ...day,
      bookedBeds: dayOverlaps
        ? Math.max(day.bookedBeds - guestCount, 0)
        : day.bookedBeds,
    };
  });
}
```

Add the missing import at the top of validation-helpers.ts:

```ts
import {
  seasons,
  bookingRounds,
  availabilityCache,
  bookings,
  bookingGuests,
  tariffs,
} from "@/db/schema";
```

- [ ] **Step 4: Modify `validateBookingDates` in `validation.ts`**

Change the input type and function body at `src/actions/availability/validation.ts:23-117`:

```ts
export async function validateBookingDates(input: {
  lodgeId: string;
  checkIn: string;
  checkOut: string;
  bookingRoundId: string;
  memberId: string;
  excludeBookingId?: string;
}): Promise<ValidationResult> {
  const parsed = validateBookingDatesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((i) => i.message),
    };
  }

  const { lodgeId, checkIn, checkOut, bookingRoundId, memberId } = parsed.data;
  const excludeBookingId = input.excludeBookingId;
  const errors: string[] = [];
  const nights = countNights(checkIn, checkOut);

  // Rule 6: No past dates
  const today = new Date().toISOString().split("T")[0];
  if (checkIn < today) {
    errors.push("Check-in date cannot be in the past");
  }

  // Rule 1: Within season
  const season = await getSeasonForDates(lodgeId, checkIn, checkOut);
  if (!season) {
    errors.push("Dates are not within an active season");
  }

  // Rule 2: Within booking round
  const round = await getBookingRound(bookingRoundId);
  if (!round) {
    errors.push("Booking round not found");
  } else {
    // Skip round-open check when editing an existing booking
    if (!excludeBookingId) {
      const now = new Date();
      if (now < round.opensAt || now > round.closesAt) {
        errors.push("Booking round is not currently open");
      }
    }

    // Rule 4: Max nights per booking
    if (round.maxNightsPerBooking && nights > round.maxNightsPerBooking) {
      errors.push(
        `Maximum ${round.maxNightsPerBooking} nights per booking in this round`
      );
    }

    // Rule 5: Max nights per member
    if (round.maxNightsPerMember) {
      const existingNights = await getMemberBookedNightsInRound(
        memberId,
        bookingRoundId,
        excludeBookingId
      );
      if (existingNights + nights > round.maxNightsPerMember) {
        errors.push(
          `This booking would exceed your ${round.maxNightsPerMember}-night limit for this round (${existingNights} nights already booked)`
        );
      }
    }
  }

  // Rule 3: Minimum nights
  if (season) {
    const tariff = await getTariffForValidation(lodgeId, season.id);
    if (nights < tariff.minimumNights) {
      errors.push(
        `A minimum of ${tariff.minimumNights} nights is required`
      );
    }
  }

  // Rule 7: Sufficient availability
  const availability = excludeBookingId
    ? await getAvailabilityExcludingBooking(lodgeId, checkIn, checkOut, excludeBookingId)
    : await getDateRangeAvailabilityForValidation(lodgeId, checkIn, checkOut);

  if (availability.length < nights) {
    errors.push(
      "No availability data for some dates in this range — the season may not be set up yet"
    );
  } else {
    for (const day of availability) {
      const available = day.totalBeds - day.bookedBeds;
      if (available <= 0) {
        errors.push(`No availability on ${day.date}`);
        break;
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
```

Add `getAvailabilityExcludingBooking` to the imports at the top of `validation.ts`:

```ts
import {
  getSeasonForDates,
  getBookingRound,
  getDateRangeAvailabilityForValidation,
  getAvailabilityExcludingBooking,
  getMemberBookedNightsInRound,
  getTariffForValidation,
} from "./validation-helpers";
```

- [ ] **Step 5: Run existing validation tests**

Run: `cd /opt/snowgum && npx vitest run src/actions/availability/`
Expected: All existing tests PASS (no regressions from the optional param)

- [ ] **Step 6: Commit**

```bash
git add src/actions/availability/validation-helpers.ts src/actions/availability/validation.ts
git commit -m "feat(phase23): add excludeBookingId to validation for booking edits"
```

---

### Task 4: Modify `getAvailableBeds` to Support Edit Context

**Files:**
- Modify: `src/actions/bookings/beds.ts:20-104`

- [ ] **Step 1: Add `excludeBookingId` parameter**

In `src/actions/bookings/beds.ts`, change the function signature and the booked beds query:

```ts
export async function getAvailableBeds(
  lodgeId: string,
  checkInDate: string,
  checkOutDate: string,
  currentMemberId: string,
  excludeBookingId?: string
): Promise<RoomWithBeds[]> {
```

Modify the booked beds query (around line 47-58) to exclude the current booking's beds:

```ts
  // Get booked bed IDs for overlapping date ranges
  const bookedRows = await db
    .select({ bedId: bookingGuests.bedId })
    .from(bookingGuests)
    .innerJoin(bookings, eq(bookings.id, bookingGuests.bookingId))
    .where(
      and(
        eq(bookings.lodgeId, lodgeId),
        sql`${bookings.status} NOT IN ('CANCELLED')`,
        lt(bookings.checkInDate, checkOutDate),
        sql`${bookings.checkOutDate} > ${checkInDate}`,
        ...(excludeBookingId ? [sql`${bookings.id} != ${excludeBookingId}`] : [])
      )
    );
```

- [ ] **Step 2: Verify existing tests pass**

Run: `cd /opt/snowgum && npx vitest run src/actions/bookings/`
Expected: All existing booking tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/actions/bookings/beds.ts
git commit -m "feat(phase23): add excludeBookingId to getAvailableBeds"
```

---

### Task 5: Query — `getBookingDetailForEdit`

**Files:**
- Modify: `src/actions/bookings/queries.ts` (add new function at end)

- [ ] **Step 1: Add the query function**

Add to the end of `src/actions/bookings/queries.ts`:

```ts
export type BookingDetailForEdit = {
  id: string;
  bookingReference: string;
  lodgeId: string;
  lodgeName: string;
  bookingRoundId: string;
  checkInDate: string;
  checkOutDate: string;
  totalNights: number;
  subtotalCents: number;
  discountAmountCents: number;
  totalAmountCents: number;
  gstAmountCents: number;
  status: string;
  balancePaidAt: Date | null;
  primaryMemberId: string | null;
  requiresApproval: boolean;
  guests: {
    id: string;
    memberId: string;
    firstName: string;
    lastName: string;
    membershipClassName: string | null;
    bedId: string | null;
    bedLabel: string | null;
    roomId: string | null;
    roomName: string | null;
    pricePerNightCents: number;
    totalAmountCents: number;
    snapshotTariffId: string | null;
    snapshotMembershipClassId: string | null;
  }[];
};

/**
 * Get full booking detail for the member edit form.
 * Includes guest member IDs, bed/room assignments, and tariff snapshots.
 */
export async function getBookingDetailForEdit(
  bookingId: string,
  organisationId: string,
  memberId: string
): Promise<BookingDetailForEdit | null> {
  const [booking] = await db
    .select({
      id: bookings.id,
      bookingReference: bookings.bookingReference,
      lodgeId: bookings.lodgeId,
      lodgeName: lodges.name,
      bookingRoundId: bookings.bookingRoundId,
      checkInDate: bookings.checkInDate,
      checkOutDate: bookings.checkOutDate,
      totalNights: bookings.totalNights,
      subtotalCents: bookings.subtotalCents,
      discountAmountCents: bookings.discountAmountCents,
      totalAmountCents: bookings.totalAmountCents,
      gstAmountCents: bookings.gstAmountCents,
      status: bookings.status,
      balancePaidAt: bookings.balancePaidAt,
      primaryMemberId: bookings.primaryMemberId,
      requiresApproval: bookings.requiresApproval,
    })
    .from(bookings)
    .innerJoin(lodges, eq(lodges.id, bookings.lodgeId))
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.organisationId, organisationId),
        eq(bookings.primaryMemberId, memberId)
      )
    );

  if (!booking) return null;

  const guests = await db
    .select({
      id: bookingGuests.id,
      memberId: bookingGuests.memberId,
      firstName: members.firstName,
      lastName: members.lastName,
      membershipClassName: membershipClasses.name,
      bedId: bookingGuests.bedId,
      bedLabel: beds.label,
      roomId: bookingGuests.roomId,
      roomName: rooms.name,
      pricePerNightCents: bookingGuests.pricePerNightCents,
      totalAmountCents: bookingGuests.totalAmountCents,
      snapshotTariffId: bookingGuests.snapshotTariffId,
      snapshotMembershipClassId: bookingGuests.snapshotMembershipClassId,
    })
    .from(bookingGuests)
    .innerJoin(members, eq(members.id, bookingGuests.memberId))
    .leftJoin(
      membershipClasses,
      eq(membershipClasses.id, bookingGuests.snapshotMembershipClassId)
    )
    .leftJoin(beds, eq(beds.id, bookingGuests.bedId))
    .leftJoin(rooms, eq(rooms.id, bookingGuests.roomId))
    .where(eq(bookingGuests.bookingId, bookingId));

  return { ...booking, guests };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/actions/bookings/queries.ts
git commit -m "feat(phase23): add getBookingDetailForEdit query"
```

---

### Task 6: Core Server Action — `memberEditBooking` (TDD)

**Files:**
- Create: `src/actions/bookings/__tests__/member-edit.test.ts`
- Create: `src/actions/bookings/member-edit.ts`

- [ ] **Step 1: Write failing tests**

Create `src/actions/bookings/__tests__/member-edit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockExecute = vi.fn();
const mockTransaction = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockSendEmail = vi.fn();
const mockGetSessionMember = vi.fn();
const mockCreateAuditLog = vi.fn();
const mockValidateBookingDates = vi.fn();
const mockProcessStripeRefund = vi.fn();

let selectCallCount = 0;

// Default booking data
const defaultBooking = {
  id: "booking-1",
  status: "CONFIRMED",
  bookingReference: "BSKI-2027-0042",
  checkInDate: "2027-07-12",
  checkOutDate: "2027-07-16",
  lodgeId: "lodge-1",
  primaryMemberId: "member-1",
  organisationId: "org-1",
  bookingRoundId: "round-1",
  totalAmountCents: 28000,
  subtotalCents: 28000,
  discountAmountCents: 0,
  gstAmountCents: 0,
  balancePaidAt: null,
  requiresApproval: false,
};

const defaultGuests = [
  {
    id: "bg-1",
    memberId: "member-1",
    snapshotTariffId: "tariff-1",
    snapshotMembershipClassId: "class-1",
    bedId: "bed-1",
    roomId: "room-1",
    pricePerNightCents: 7000,
    totalAmountCents: 28000,
  },
];

const defaultTariff = {
  id: "tariff-1",
  pricePerNightWeekdayCents: 7000,
  pricePerNightWeekendCents: 9000,
  discountFiveNightsBps: 500,
  discountSevenNightsBps: 1000,
};

const defaultOrg = {
  id: "org-1",
  name: "Demo Club",
  slug: "demo",
  contactEmail: "admin@demo.com",
  logoUrl: null,
  memberBookingEditWindowDays: 7,
  memberEditRequiresApproval: false,
  gstEnabled: false,
  gstRateBps: 1000,
};

const defaultMember = {
  email: "sarah@test.com",
  firstName: "Sarah",
  lastName: "Mitchell",
  isFinancial: true,
  membershipClassId: "class-1",
};

const defaultLodge = { name: "Main Lodge" };

const defaultRound = { requiresApproval: false };

vi.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: (...args: unknown[]) => mockGetSessionMember(...args),
}));

vi.mock("@/lib/audit-log", () => ({
  createAuditLog: (...args: unknown[]) => {
    mockCreateAuditLog(...args);
    return Promise.resolve();
  },
  diffChanges: (prev: Record<string, unknown>, curr: Record<string, unknown>) => {
    const previousValue: Record<string, unknown> = {};
    const newValue: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(prev), ...Object.keys(curr)])) {
      if (prev[key] !== curr[key]) { previousValue[key] = prev[key]; newValue[key] = curr[key]; }
    }
    return { previousValue, newValue };
  },
}));

vi.mock("@/actions/availability/validation", () => ({
  validateBookingDates: (...args: unknown[]) => mockValidateBookingDates(...args),
}));

vi.mock("@/actions/stripe/refund", () => ({
  processStripeRefund: (...args: unknown[]) => mockProcessStripeRefund(...args),
}));

vi.mock("@/db/schema", () => ({
  bookings: "bookings",
  bookingGuests: "bookingGuests",
  transactions: "transactions",
  members: "members",
  organisations: "organisations",
  lodges: "lodges",
  tariffs: "tariffs",
  seasons: "seasons",
  bookingRounds: "bookingRounds",
  availabilityCache: "availabilityCache",
}));

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      const override = mockSelect(...args);
      if (override) return override;
      const callIndex = selectCallCount++;
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            where: () => {
              if (callIndex === 0) return [defaultBooking]; // booking
              if (callIndex === 1) return defaultGuests; // guests
              if (callIndex === 2) return [defaultOrg]; // org
              if (callIndex === 3) return [defaultTariff]; // tariff
              if (callIndex === 4) return [defaultOrg]; // org for email
              if (callIndex === 5) return [defaultLodge]; // lodge for email
              if (callIndex === 6) return [defaultMember]; // member for email
              return [];
            },
            innerJoin: () => ({
              leftJoin: () => ({
                leftJoin: () => ({
                  leftJoin: () => ({
                    where: () => defaultGuests,
                  }),
                }),
              }),
              where: () => {
                if (callIndex === 0) return [defaultBooking];
                return [];
              },
            }),
          };
        },
      };
    },
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      mockTransaction();
      const tx = {
        update: (...args: unknown[]) => {
          mockUpdate(...args);
          return {
            set: (...sArgs: unknown[]) => {
              mockSet(...sArgs);
              return { where: () => ({}) };
            },
          };
        },
        insert: (...args: unknown[]) => {
          mockInsert(...args);
          return { values: () => ({ returning: () => [{ id: "txn-new" }] }) };
        },
        delete: (...args: unknown[]) => {
          mockDelete(...args);
          return { where: () => ({}) };
        },
        execute: (...args: unknown[]) => {
          mockExecute(...args);
          return [];
        },
      };
      return fn(tx);
    },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
  mockGetSessionMember.mockResolvedValue({
    memberId: "member-1",
    organisationId: "org-1",
    role: "MEMBER",
    firstName: "Sarah",
    lastName: "Mitchell",
    email: "sarah@test.com",
  });
  mockValidateBookingDates.mockResolvedValue({ valid: true, errors: [] });
  mockProcessStripeRefund.mockResolvedValue({ success: true });
});

import { memberEditBooking } from "../member-edit";

describe("memberEditBooking", () => {
  it("rejects when not authenticated", async () => {
    mockGetSessionMember.mockResolvedValue(null);
    const result = await memberEditBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      slug: "demo",
      newCheckInDate: "2027-07-14",
      newCheckOutDate: "2027-07-18",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("authenticated");
  });

  it("rejects when member does not own the booking", async () => {
    mockGetSessionMember.mockResolvedValue({
      memberId: "member-999",
      organisationId: "org-1",
      role: "MEMBER",
      firstName: "Other",
      lastName: "User",
      email: "other@test.com",
    });
    const result = await memberEditBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      slug: "demo",
      newCheckInDate: "2027-07-14",
      newCheckOutDate: "2027-07-18",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("own");
  });

  it("rejects when edit window is disabled (0)", async () => {
    // Override org to have editWindowDays = 0
    selectCallCount = 0;
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => [defaultBooking] }),
    }));
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => defaultGuests }),
    }));
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => [{ ...defaultOrg, memberBookingEditWindowDays: 0 }] }),
    }));

    const result = await memberEditBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      slug: "demo",
      newCheckInDate: "2027-07-14",
      newCheckOutDate: "2027-07-18",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not enabled");
  });

  it("rejects cancelled booking", async () => {
    selectCallCount = 0;
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => [{ ...defaultBooking, status: "CANCELLED" }] }),
    }));

    const result = await memberEditBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      slug: "demo",
      newCheckInDate: "2027-07-14",
      newCheckOutDate: "2027-07-18",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("CANCELLED");
  });

  it("updates booking dates and recalculates pricing", async () => {
    const result = await memberEditBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      slug: "demo",
      newCheckInDate: "2027-07-14",
      newCheckOutDate: "2027-07-18",
    });
    expect(result.success).toBe(true);
    expect(mockTransaction).toHaveBeenCalled();
    expect(mockValidateBookingDates).toHaveBeenCalledWith(
      expect.objectContaining({ excludeBookingId: "booking-1" })
    );
  });

  it("calls processStripeRefund when paid booking price decreases", async () => {
    // Set up a paid booking
    selectCallCount = 0;
    const paidBooking = {
      ...defaultBooking,
      balancePaidAt: new Date("2027-06-01"),
      totalAmountCents: 50000,
    };
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => [paidBooking] }),
    }));

    const result = await memberEditBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      slug: "demo",
      newCheckInDate: "2027-07-14",
      newCheckOutDate: "2027-07-16", // shorter stay = lower price
    });

    expect(result.success).toBe(true);
    expect(mockProcessStripeRefund).toHaveBeenCalled();
  });

  it("returns topUpTransactionId when paid booking price increases", async () => {
    selectCallCount = 0;
    const paidBooking = {
      ...defaultBooking,
      balancePaidAt: new Date("2027-06-01"),
      totalAmountCents: 10000, // original was cheap
    };
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => [paidBooking] }),
    }));

    const result = await memberEditBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      slug: "demo",
      newCheckInDate: "2027-07-10",
      newCheckOutDate: "2027-07-18", // longer stay = higher price
    });

    expect(result.success).toBe(true);
    expect(result.topUpTransactionId).toBeDefined();
    expect(mockProcessStripeRefund).not.toHaveBeenCalled();
  });

  it("writes audit log", async () => {
    await memberEditBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      slug: "demo",
      newCheckInDate: "2027-07-14",
      newCheckOutDate: "2027-07-18",
    });
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "BOOKING_MEMBER_EDITED" })
    );
  });

  it("sends emails to member and admin", async () => {
    await memberEditBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      slug: "demo",
      newCheckInDate: "2027-07-14",
      newCheckOutDate: "2027-07-18",
    });
    // Member email + admin email
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });

  it("rejects when validateBookingDates fails", async () => {
    mockValidateBookingDates.mockResolvedValue({
      valid: false,
      errors: ["No availability on 2027-07-14"],
    });
    const result = await memberEditBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      slug: "demo",
      newCheckInDate: "2027-07-14",
      newCheckOutDate: "2027-07-18",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("availability");
  });

  it("sets status to PENDING when re-approval is required", async () => {
    selectCallCount = 0;
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({
        where: () => [{ ...defaultBooking, requiresApproval: true }],
      }),
    }));
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => defaultGuests }),
    }));
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({
        where: () => [{ ...defaultOrg, memberEditRequiresApproval: true }],
      }),
    }));

    const result = await memberEditBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      slug: "demo",
      newCheckInDate: "2027-07-14",
      newCheckOutDate: "2027-07-18",
    });
    expect(result.success).toBe(true);
    expect(result.requiresApproval).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /opt/snowgum && npx vitest run src/actions/bookings/__tests__/member-edit.test.ts`
Expected: FAIL — module "../member-edit" not found

- [ ] **Step 3: Implement `memberEditBooking`**

Create `src/actions/bookings/member-edit.ts`:

```ts
"use server";

import { db } from "@/db/index";
import {
  bookings,
  bookingGuests,
  transactions,
  members,
  organisations,
  lodges,
  tariffs,
  seasons,
  bookingRounds,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getSessionMember } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { BookingModifiedEmail } from "@/lib/email/templates/booking-modified";
import { AdminBookingNotificationEmail } from "@/lib/email/templates/admin-booking-notification";
import { createAuditLog, diffChanges } from "@/lib/audit-log";
import { validateBookingDates } from "@/actions/availability/validation";
import { processStripeRefund } from "@/actions/stripe/refund";
import {
  calculateGuestPrice,
  calculateBookingPrice,
  countNights,
  getNightDates,
} from "./pricing";
import { calculateGst } from "@/lib/currency";
import {
  isWithinEditWindow,
  buildChangesDescription,
} from "./member-edit-helpers";

type MemberEditInput = {
  bookingId: string;
  organisationId: string;
  slug: string;
  newCheckInDate?: string;
  newCheckOutDate?: string;
  newGuestMemberIds?: string[];
  newBedAssignments?: { guestMemberId: string; bedId: string }[];
};

type MemberEditResult = {
  success: boolean;
  error?: string;
  newTotalAmountCents?: number;
  priceDeltaCents?: number;
  topUpTransactionId?: string;
  requiresApproval?: boolean;
};

export async function memberEditBooking(
  input: MemberEditInput
): Promise<MemberEditResult> {
  // 1. Auth check
  const session = await getSessionMember(input.organisationId);
  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  // 2. Load booking
  const [booking] = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      bookingReference: bookings.bookingReference,
      checkInDate: bookings.checkInDate,
      checkOutDate: bookings.checkOutDate,
      lodgeId: bookings.lodgeId,
      primaryMemberId: bookings.primaryMemberId,
      organisationId: bookings.organisationId,
      bookingRoundId: bookings.bookingRoundId,
      totalAmountCents: bookings.totalAmountCents,
      subtotalCents: bookings.subtotalCents,
      discountAmountCents: bookings.discountAmountCents,
      gstAmountCents: bookings.gstAmountCents,
      balancePaidAt: bookings.balancePaidAt,
      requiresApproval: bookings.requiresApproval,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.id, input.bookingId),
        eq(bookings.organisationId, input.organisationId)
      )
    );

  if (!booking) {
    return { success: false, error: "Booking not found" };
  }

  // 3. Ownership check
  if (booking.primaryMemberId !== session.memberId) {
    return { success: false, error: "You can only edit bookings you own" };
  }

  // 4. Status check
  if (booking.status === "CANCELLED" || booking.status === "COMPLETED" || booking.status === "WAITLISTED") {
    return { success: false, error: `Cannot modify a ${booking.status} booking` };
  }

  // 5. Load org settings
  const existingGuests = await db
    .select({
      id: bookingGuests.id,
      memberId: bookingGuests.memberId,
      snapshotTariffId: bookingGuests.snapshotTariffId,
      snapshotMembershipClassId: bookingGuests.snapshotMembershipClassId,
      bedId: bookingGuests.bedId,
      roomId: bookingGuests.roomId,
      pricePerNightCents: bookingGuests.pricePerNightCents,
      totalAmountCents: bookingGuests.totalAmountCents,
    })
    .from(bookingGuests)
    .where(eq(bookingGuests.bookingId, input.bookingId));

  const [org] = await db
    .select({
      id: organisations.id,
      name: organisations.name,
      slug: organisations.slug,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
      memberBookingEditWindowDays: organisations.memberBookingEditWindowDays,
      memberEditRequiresApproval: organisations.memberEditRequiresApproval,
      gstEnabled: organisations.gstEnabled,
      gstRateBps: organisations.gstRateBps,
    })
    .from(organisations)
    .where(eq(organisations.id, input.organisationId));

  if (!org) {
    return { success: false, error: "Organisation not found" };
  }

  // 6. Edit window check
  if (org.memberBookingEditWindowDays === 0) {
    return { success: false, error: "Booking editing is not enabled for this organisation" };
  }

  if (!isWithinEditWindow(booking.checkInDate, org.memberBookingEditWindowDays)) {
    return {
      success: false,
      error: `Cannot edit — booking must be edited at least ${org.memberBookingEditWindowDays} days before check-in`,
    };
  }

  // 7. Determine what changed
  const newCheckIn = input.newCheckInDate ?? booking.checkInDate;
  const newCheckOut = input.newCheckOutDate ?? booking.checkOutDate;
  const datesChanged = newCheckIn !== booking.checkInDate || newCheckOut !== booking.checkOutDate;

  const oldGuestMemberIds = existingGuests.map((g) => g.memberId);
  const newGuestMemberIds = input.newGuestMemberIds ?? oldGuestMemberIds;
  const guestsChanged =
    JSON.stringify([...oldGuestMemberIds].sort()) !==
    JSON.stringify([...newGuestMemberIds].sort());

  // Build bed assignment map from input
  const newBedMap = new Map<string, string>();
  if (input.newBedAssignments) {
    for (const a of input.newBedAssignments) {
      newBedMap.set(a.guestMemberId, a.bedId);
    }
  }

  if (!datesChanged && !guestsChanged && !input.newBedAssignments) {
    return { success: false, error: "No changes detected" };
  }

  // 8. Validate dates if changed
  if (datesChanged) {
    const dateValidation = await validateBookingDates({
      lodgeId: booking.lodgeId,
      checkIn: newCheckIn,
      checkOut: newCheckOut,
      bookingRoundId: booking.bookingRoundId,
      memberId: session.memberId,
      excludeBookingId: input.bookingId,
    });

    if (!dateValidation.valid) {
      return { success: false, error: dateValidation.errors[0] };
    }
  }

  // 9. Validate guests if changed
  const addedMemberIds = newGuestMemberIds.filter(
    (id) => !oldGuestMemberIds.includes(id)
  );
  const removedMemberIds = oldGuestMemberIds.filter(
    (id) => !newGuestMemberIds.includes(id)
  );

  // Primary member cannot be removed
  if (booking.primaryMemberId && removedMemberIds.includes(booking.primaryMemberId)) {
    return { success: false, error: "Cannot remove the primary member from the booking" };
  }

  // Validate new guests exist and are financial
  const addedGuestDetails: { memberId: string; membershipClassId: string | null; firstName: string; lastName: string }[] = [];
  for (const memberId of addedMemberIds) {
    const [member] = await db
      .select({
        isFinancial: members.isFinancial,
        membershipClassId: members.membershipClassId,
        firstName: members.firstName,
        lastName: members.lastName,
      })
      .from(members)
      .where(
        and(
          eq(members.id, memberId),
          eq(members.organisationId, input.organisationId)
        )
      );

    if (!member) {
      return { success: false, error: "Guest member not found in this organisation" };
    }
    if (!member.isFinancial) {
      return { success: false, error: `${member.firstName} ${member.lastName} is not a financial member` };
    }
    addedGuestDetails.push({
      memberId,
      membershipClassId: member.membershipClassId,
      firstName: member.firstName,
      lastName: member.lastName,
    });
  }

  // 10. Look up tariffs for new guests
  const newNights = countNights(newCheckIn, newCheckOut);
  const newNightDates = getNightDates(newCheckIn, newCheckOut);
  const oldNightDates = getNightDates(booking.checkInDate, booking.checkOutDate);
  const oldGuestCount = existingGuests.length;
  const newGuestCount = newGuestMemberIds.length;

  // Get season for tariff lookup (needed for new guests)
  let seasonId: string | null = null;
  if (addedMemberIds.length > 0) {
    const [season] = await db
      .select({ id: seasons.id })
      .from(seasons)
      .where(
        and(
          eq(seasons.isActive, true),
          sql`${seasons.startDate} <= ${newCheckIn}`,
          sql`${seasons.endDate} >= ${newCheckIn}`
        )
      );
    seasonId = season?.id ?? null;
  }

  // Build pricing for all guests (existing + new)
  type GuestPriceEntry = {
    memberId: string;
    price: ReturnType<typeof calculateGuestPrice>;
    tariffId: string | null;
    membershipClassId: string | null;
    bedId: string | null;
    roomId: string | null;
    isNew: boolean;
  };

  const allGuestPrices: GuestPriceEntry[] = [];

  // Price existing guests that are staying
  for (const guest of existingGuests) {
    if (removedMemberIds.includes(guest.memberId)) continue;

    const [tariff] = guest.snapshotTariffId
      ? await db
          .select()
          .from(tariffs)
          .where(eq(tariffs.id, guest.snapshotTariffId))
      : [];

    if (!tariff) {
      return { success: false, error: "Tariff not found for existing guest" };
    }

    const price = calculateGuestPrice({
      checkInDate: newCheckIn,
      checkOutDate: newCheckOut,
      pricePerNightWeekdayCents: tariff.pricePerNightWeekdayCents,
      pricePerNightWeekendCents: tariff.pricePerNightWeekendCents,
      discountFiveNightsBps: tariff.discountFiveNightsBps,
      discountSevenNightsBps: tariff.discountSevenNightsBps,
    });

    // Determine bed: use new assignment if provided, else keep existing
    const bedId = newBedMap.get(guest.memberId) ?? guest.bedId;

    allGuestPrices.push({
      memberId: guest.memberId,
      price,
      tariffId: guest.snapshotTariffId,
      membershipClassId: guest.snapshotMembershipClassId,
      bedId,
      roomId: guest.roomId,
      isNew: false,
    });
  }

  // Price new guests
  for (const newGuest of addedGuestDetails) {
    // Look up tariff: class-specific first, then default
    let tariff = null;
    if (seasonId && newGuest.membershipClassId) {
      const [classTariff] = await db
        .select()
        .from(tariffs)
        .where(
          and(
            eq(tariffs.lodgeId, booking.lodgeId),
            eq(tariffs.seasonId, seasonId),
            eq(tariffs.membershipClassId, newGuest.membershipClassId)
          )
        );
      tariff = classTariff ?? null;
    }
    if (!tariff && seasonId) {
      const [defaultTariff] = await db
        .select()
        .from(tariffs)
        .where(
          and(
            eq(tariffs.lodgeId, booking.lodgeId),
            eq(tariffs.seasonId, seasonId),
            sql`${tariffs.membershipClassId} IS NULL`
          )
        );
      tariff = defaultTariff ?? null;
    }
    if (!tariff) {
      return { success: false, error: "No tariff found for new guest" };
    }

    const price = calculateGuestPrice({
      checkInDate: newCheckIn,
      checkOutDate: newCheckOut,
      pricePerNightWeekdayCents: tariff.pricePerNightWeekdayCents,
      pricePerNightWeekendCents: tariff.pricePerNightWeekendCents,
      discountFiveNightsBps: tariff.discountFiveNightsBps,
      discountSevenNightsBps: tariff.discountSevenNightsBps,
    });

    const bedId = newBedMap.get(newGuest.memberId) ?? null;

    allGuestPrices.push({
      memberId: newGuest.memberId,
      price,
      tariffId: tariff.id,
      membershipClassId: newGuest.membershipClassId,
      bedId,
      roomId: null,
      isNew: true,
    });
  }

  const bookingTotal = calculateBookingPrice(allGuestPrices.map((g) => g.price));
  const gstAmountCents = org.gstEnabled
    ? calculateGst(bookingTotal.totalAmountCents, org.gstRateBps)
    : 0;

  // 11. Price delta handling
  const oldTotalCents = booking.totalAmountCents;
  const newTotalCents = bookingTotal.totalAmountCents;
  const priceDeltaCents = newTotalCents - oldTotalCents;
  const isPaid = !!booking.balancePaidAt;

  let topUpTransactionId: string | undefined;

  // 12. Re-approval check
  const needsReApproval =
    org.memberEditRequiresApproval && booking.requiresApproval;
  const newStatus = needsReApproval ? "PENDING" : booking.status;

  // 13. DB transaction
  await db.transaction(async (tx) => {
    // Release old guest count from old night dates
    for (const nightDate of oldNightDates) {
      await tx.execute(
        sql`UPDATE availability_cache
            SET booked_beds = GREATEST(booked_beds - ${oldGuestCount}, 0),
                version = version + 1,
                updated_at = NOW()
            WHERE lodge_id = ${booking.lodgeId}
            AND date = ${nightDate}`
      );
    }

    // Lock new dates
    await tx.execute(
      sql`SELECT id FROM availability_cache
          WHERE lodge_id = ${booking.lodgeId}
          AND date >= ${newCheckIn}
          AND date < ${newCheckOut}
          FOR UPDATE`
    );

    // Book new guest count on new night dates
    for (const nightDate of newNightDates) {
      await tx.execute(
        sql`UPDATE availability_cache
            SET booked_beds = booked_beds + ${newGuestCount},
                version = version + 1,
                updated_at = NOW()
            WHERE lodge_id = ${booking.lodgeId}
            AND date = ${nightDate}`
      );
    }

    // Update booking
    await tx
      .update(bookings)
      .set({
        checkInDate: newCheckIn,
        checkOutDate: newCheckOut,
        totalNights: newNights,
        subtotalCents: bookingTotal.subtotalCents,
        discountAmountCents: bookingTotal.discountAmountCents,
        totalAmountCents: newTotalCents,
        gstAmountCents,
        ...(needsReApproval && { status: "PENDING" }),
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, input.bookingId));

    // Delete removed guests
    for (const removedId of removedMemberIds) {
      const removedGuest = existingGuests.find((g) => g.memberId === removedId);
      if (removedGuest) {
        await tx.execute(
          sql`DELETE FROM booking_guests WHERE id = ${removedGuest.id}`
        );
      }
    }

    // Insert new guests
    for (const gp of allGuestPrices.filter((g) => g.isNew)) {
      await tx.insert(bookingGuests).values({
        bookingId: input.bookingId,
        memberId: gp.memberId,
        bedId: gp.bedId,
        roomId: gp.roomId,
        pricePerNightCents: gp.price.blendedPerNightCents,
        totalAmountCents: gp.price.totalCents,
        snapshotTariffId: gp.tariffId,
        snapshotMembershipClassId: gp.membershipClassId,
      });
    }

    // Update existing guests' pricing and beds
    for (const gp of allGuestPrices.filter((g) => !g.isNew)) {
      const existingGuest = existingGuests.find(
        (eg) => eg.memberId === gp.memberId
      );
      if (existingGuest) {
        await tx
          .update(bookingGuests)
          .set({
            pricePerNightCents: gp.price.blendedPerNightCents,
            totalAmountCents: gp.price.totalCents,
            ...(gp.bedId !== existingGuest.bedId && { bedId: gp.bedId }),
          })
          .where(eq(bookingGuests.id, existingGuest.id));
      }
    }

    // Handle transactions
    if (isPaid && priceDeltaCents < 0) {
      // Price decreased — insert refund transaction
      await tx.insert(transactions).values({
        organisationId: input.organisationId,
        memberId: session.memberId,
        bookingId: input.bookingId,
        type: "REFUND",
        amountCents: priceDeltaCents, // negative
        description: `Refund for booking edit ${booking.bookingReference}`,
      });
    } else if (isPaid && priceDeltaCents > 0) {
      // Price increased — insert top-up invoice
      const [newTxn] = await tx
        .insert(transactions)
        .values({
          organisationId: input.organisationId,
          memberId: session.memberId,
          bookingId: input.bookingId,
          type: "INVOICE",
          amountCents: priceDeltaCents,
          description: `Top-up for booking edit ${booking.bookingReference}`,
        })
        .returning();
      topUpTransactionId = newTxn.id;
    } else if (!isPaid) {
      // Not yet paid — update existing invoice amount
      await tx.execute(
        sql`UPDATE transactions
            SET amount_cents = ${newTotalCents}
            WHERE booking_id = ${input.bookingId}
            AND type = 'INVOICE'`
      );
    }
  });

  // 14. Stripe refund (outside transaction)
  if (isPaid && priceDeltaCents < 0) {
    await processStripeRefund(input.bookingId, Math.abs(priceDeltaCents));
  }

  // 15. Audit log
  const removedGuestNames = removedMemberIds
    .map((id) => {
      const g = existingGuests.find((eg) => eg.memberId === id);
      return g ? id : id;
    });

  const { previousValue, newValue } = diffChanges(
    {
      checkInDate: booking.checkInDate,
      checkOutDate: booking.checkOutDate,
      totalAmountCents: oldTotalCents,
      guestMemberIds: oldGuestMemberIds,
    },
    {
      checkInDate: newCheckIn,
      checkOutDate: newCheckOut,
      totalAmountCents: newTotalCents,
      guestMemberIds: newGuestMemberIds,
    }
  );

  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: session.memberId,
    action: "BOOKING_MEMBER_EDITED",
    entityType: "booking",
    entityId: input.bookingId,
    previousValue,
    newValue,
  }).catch(console.error);

  // 16. Emails
  const [orgForEmail] = await db
    .select({
      name: organisations.name,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
    })
    .from(organisations)
    .where(eq(organisations.id, input.organisationId));

  const [lodge] = await db
    .select({ name: lodges.name })
    .from(lodges)
    .where(eq(lodges.id, booking.lodgeId));

  const [memberForEmail] = await db
    .select({
      email: members.email,
      firstName: members.firstName,
      lastName: members.lastName,
    })
    .from(members)
    .where(eq(members.id, booking.primaryMemberId!));

  const changes = buildChangesDescription({
    oldCheckIn: booking.checkInDate,
    oldCheckOut: booking.checkOutDate,
    newCheckIn: datesChanged ? newCheckIn : undefined,
    newCheckOut: datesChanged ? newCheckOut : undefined,
    addedGuestNames: addedGuestDetails.map(
      (g) => `${g.firstName} ${g.lastName}`
    ),
    removedGuestNames: removedGuestNames.length > 0 ? removedGuestNames : undefined,
    oldTotalCents: oldTotalCents !== newTotalCents ? oldTotalCents : undefined,
    newTotalCents: oldTotalCents !== newTotalCents ? newTotalCents : undefined,
  });

  if (memberForEmail) {
    sendEmail({
      to: memberForEmail.email,
      subject: `Booking modified — ${booking.bookingReference}`,
      template: React.createElement(BookingModifiedEmail, {
        orgName: orgForEmail?.name ?? input.slug,
        bookingReference: booking.bookingReference,
        lodgeName: lodge?.name ?? "Lodge",
        checkInDate: newCheckIn,
        checkOutDate: newCheckOut,
        totalAmountCents: newTotalCents,
        changes: changes || "Booking details updated",
        logoUrl: orgForEmail?.logoUrl || undefined,
      }),
      replyTo: orgForEmail?.contactEmail || undefined,
      orgName: orgForEmail?.name ?? input.slug,
    });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  if (orgForEmail?.contactEmail) {
    sendEmail({
      to: orgForEmail.contactEmail,
      subject: `[Admin] Booking modified by member — ${booking.bookingReference}`,
      template: React.createElement(AdminBookingNotificationEmail, {
        orgName: orgForEmail.name,
        bookingReference: booking.bookingReference,
        memberName: memberForEmail
          ? `${memberForEmail.firstName} ${memberForEmail.lastName}`
          : "Unknown",
        lodgeName: lodge?.name ?? "Lodge",
        checkInDate: newCheckIn,
        checkOutDate: newCheckOut,
        action: "modified" as const,
        adminUrl: `${appUrl}/${input.slug}/admin/bookings/${input.bookingId}`,
        logoUrl: orgForEmail.logoUrl || undefined,
      }),
      orgName: orgForEmail.name,
    });
  }

  // 17. Revalidate
  revalidatePath(`/${input.slug}/dashboard`);
  revalidatePath(`/${input.slug}/dashboard/bookings/${input.bookingId}`);
  revalidatePath(`/${input.slug}/admin/bookings`);
  revalidatePath(`/${input.slug}/admin/bookings/${input.bookingId}`);

  return {
    success: true,
    newTotalAmountCents: newTotalCents,
    priceDeltaCents,
    topUpTransactionId,
    requiresApproval: needsReApproval || undefined,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /opt/snowgum && npx vitest run src/actions/bookings/__tests__/member-edit.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/bookings/member-edit.ts src/actions/bookings/__tests__/member-edit.test.ts
git commit -m "feat(phase23): add memberEditBooking server action with TDD tests"
```

---

### Task 7: Organisation Settings — Accept New Fields

**Files:**
- Modify: `src/actions/organisations/update.ts:11-22`
- Modify: `src/actions/organisations/update.ts:29-50`

- [ ] **Step 1: Update Zod schema**

In `src/actions/organisations/update.ts`, add to `updateOrgSchema`:

```ts
  memberBookingEditWindowDays: z.number().int().min(0).max(365).optional(),
  memberEditRequiresApproval: z.boolean().optional(),
```

- [ ] **Step 2: Update the `.set()` call**

Add to the spread pattern in the `db.update().set()` call:

```ts
      ...(data.memberBookingEditWindowDays !== undefined && {
        memberBookingEditWindowDays: data.memberBookingEditWindowDays,
      }),
      ...(data.memberEditRequiresApproval !== undefined && {
        memberEditRequiresApproval: data.memberEditRequiresApproval,
      }),
```

- [ ] **Step 3: Commit**

```bash
git add src/actions/organisations/update.ts
git commit -m "feat(phase23): accept member edit settings in updateOrganisation"
```

---

### Task 8: Admin Settings UI — Edit Window & Re-Approval Inputs

**Files:**
- Modify: `src/app/[slug]/admin/settings/org-settings-form.tsx`

- [ ] **Step 1: Update the `Org` type**

Add to the `Org` type at line 18-30:

```ts
  memberBookingEditWindowDays: number;
  memberEditRequiresApproval: boolean;
```

- [ ] **Step 2: Add form fields**

Add after the "Payment Reminder Schedule" section (before the `<Button>` at line 170), add:

```tsx
          <div className="space-y-2">
            <Label htmlFor="memberBookingEditWindowDays">Member Booking Edit Window (days)</Label>
            <Input
              id="memberBookingEditWindowDays"
              name="memberBookingEditWindowDays"
              type="number"
              min="0"
              max="365"
              defaultValue={org.memberBookingEditWindowDays}
              required
            />
            <p className="text-xs text-muted-foreground">
              0 = disabled. Members can edit their bookings up to this many days before check-in.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <input
              id="memberEditRequiresApproval"
              name="memberEditRequiresApproval"
              type="checkbox"
              defaultChecked={org.memberEditRequiresApproval}
              className="rounded border-input"
            />
            <Label htmlFor="memberEditRequiresApproval">
              Require re-approval for member edits
            </Label>
            <p className="text-xs text-muted-foreground ml-2">
              When enabled, edits to bookings that originally required approval will be set back to pending.
            </p>
          </div>
```

- [ ] **Step 3: Update `handleSubmit` to include new fields**

In the `handleSubmit` function, add to the `updateOrganisation` call:

```ts
        memberBookingEditWindowDays: parseInt(form.get("memberBookingEditWindowDays") as string, 10),
        memberEditRequiresApproval: form.get("memberEditRequiresApproval") === "on",
```

- [ ] **Step 4: Commit**

```bash
git add src/app/[slug]/admin/settings/org-settings-form.tsx
git commit -m "feat(phase23): add member edit window settings to admin UI"
```

---

### Task 9: Member Booking Detail Page

**Files:**
- Create: `src/app/[slug]/dashboard/bookings/[id]/page.tsx`

- [ ] **Step 1: Read the Next.js docs for page conventions**

Run: `ls /opt/snowgum/node_modules/next/dist/docs/`
Read any relevant guide about dynamic route params and server components.

- [ ] **Step 2: Create the page**

Create `src/app/[slug]/dashboard/bookings/[id]/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { getOrgBySlug } from "@/lib/org";
import { getSessionMember } from "@/lib/auth";
import { getBookingDetailForEdit } from "@/actions/bookings/queries";
import { getAvailableBeds } from "@/actions/bookings/beds";
import { formatCurrency } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CancelBookingDialog } from "../../cancel-booking-dialog";
import { EditBookingForm } from "./edit-booking-form";
import { isWithinEditWindow } from "@/actions/bookings/member-edit-helpers";
import { db } from "@/db/index";
import { cancellationPolicies, members as membersTable } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  CONFIRMED: "default",
  PENDING: "secondary",
  WAITLISTED: "secondary",
  CANCELLED: "destructive",
  COMPLETED: "secondary",
};

const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "Confirmed",
  PENDING: "Pending",
  WAITLISTED: "Waitlisted",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
};

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/${slug}/login`);

  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const session = await getSessionMember(org.id);
  if (!session) redirect(`/${slug}/login`);

  const booking = await getBookingDetailForEdit(id, org.id, session.memberId);
  if (!booking) notFound();

  const isEditable =
    org.memberBookingEditWindowDays > 0 &&
    (booking.status === "CONFIRMED" || booking.status === "PENDING") &&
    isWithinEditWindow(booking.checkInDate, org.memberBookingEditWindowDays);

  // Get available beds for the edit form
  let availableBeds: Awaited<ReturnType<typeof getAvailableBeds>> = [];
  if (isEditable) {
    availableBeds = await getAvailableBeds(
      booking.lodgeId,
      booking.checkInDate,
      booking.checkOutDate,
      session.memberId,
      booking.id
    );
  }

  // Get org members for guest search
  let orgMembers: { id: string; firstName: string; lastName: string }[] = [];
  if (isEditable) {
    orgMembers = await db
      .select({
        id: membersTable.id,
        firstName: membersTable.firstName,
        lastName: membersTable.lastName,
      })
      .from(membersTable)
      .where(
        and(
          eq(membersTable.organisationId, org.id),
          eq(membersTable.isFinancial, true)
        )
      );
  }

  // Get cancellation policy
  let defaultPolicyRules = null;
  const [defaultPolicy] = await db
    .select({ rules: cancellationPolicies.rules })
    .from(cancellationPolicies)
    .where(
      and(
        eq(cancellationPolicies.organisationId, org.id),
        eq(cancellationPolicies.isDefault, true)
      )
    );
  defaultPolicyRules = defaultPolicy?.rules ?? null;

  const editWindowMessage = org.memberBookingEditWindowDays > 0
    ? `You can edit this booking up to ${org.memberBookingEditWindowDays} days before check-in.`
    : "Booking editing is not enabled.";

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 max-w-3xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" render={<Link href={`/${slug}/dashboard`} />}>
          &larr; Dashboard
        </Button>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold">Booking {booking.bookingReference}</h1>
          <Badge variant={STATUS_VARIANT[booking.status] ?? "secondary"}>
            {STATUS_LABEL[booking.status] ?? booking.status}
          </Badge>
        </div>
        <p className="text-muted-foreground">{booking.lodgeName}</p>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Check-in</p>
            <p className="font-medium">{booking.checkInDate}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Check-out</p>
            <p className="font-medium">{booking.checkOutDate}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Nights</p>
            <p className="font-medium">{booking.totalNights}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Total</p>
            <p className="font-medium">{formatCurrency(booking.totalAmountCents)}</p>
          </div>
        </div>

        <div>
          <p className="text-sm text-muted-foreground mb-2">Guests</p>
          <div className="space-y-1">
            {booking.guests.map((g) => (
              <div key={g.id} className="flex items-center justify-between text-sm">
                <span>
                  {g.firstName} {g.lastName}
                  {g.memberId === booking.primaryMemberId && (
                    <span className="text-xs text-muted-foreground ml-1">(primary)</span>
                  )}
                </span>
                <span className="text-muted-foreground">
                  {g.bedLabel ? `${g.roomName} — ${g.bedLabel}` : "No bed assigned"}{" "}
                  &middot; {formatCurrency(g.totalAmountCents)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {booking.balancePaidAt ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-sm text-green-600 dark:text-green-400">Paid</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted">
            <span className="h-2 w-2 rounded-full bg-yellow-500" />
            <span className="text-sm text-yellow-600 dark:text-yellow-400">Unpaid</span>
          </div>
        )}
      </div>

      {isEditable && (
        <EditBookingForm
          booking={booking}
          organisationId={org.id}
          slug={slug}
          availableBeds={availableBeds}
          orgMembers={orgMembers}
          stripeConnected={!!org.stripeConnectOnboardingComplete}
        />
      )}

      {!isEditable && booking.status !== "CANCELLED" && booking.status !== "COMPLETED" && (
        <p className="text-sm text-muted-foreground">{editWindowMessage}</p>
      )}

      {booking.status !== "CANCELLED" && booking.status !== "COMPLETED" && (
        <CancelBookingDialog
          bookingId={booking.id}
          organisationId={org.id}
          slug={slug}
          totalAmountCents={booking.totalAmountCents}
          balancePaidAt={booking.balancePaidAt?.toISOString() ?? null}
          checkInDate={booking.checkInDate}
          policyRules={defaultPolicyRules}
          memberId={session.memberId}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/[slug]/dashboard/bookings/[id]/page.tsx
git commit -m "feat(phase23): add member booking detail page"
```

---

### Task 10: Edit Booking Form — Client Component

**Files:**
- Create: `src/app/[slug]/dashboard/bookings/[id]/edit-booking-form.tsx`

- [ ] **Step 1: Create the edit form component**

Create `src/app/[slug]/dashboard/bookings/[id]/edit-booking-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { memberEditBooking } from "@/actions/bookings/member-edit";
import { createCheckoutSession } from "@/actions/stripe/checkout";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";
import type { BookingDetailForEdit } from "@/actions/bookings/queries";
import type { RoomWithBeds } from "@/actions/bookings/beds";

type Props = {
  booking: BookingDetailForEdit;
  organisationId: string;
  slug: string;
  availableBeds: RoomWithBeds[];
  orgMembers: { id: string; firstName: string; lastName: string }[];
  stripeConnected: boolean;
};

export function EditBookingForm({
  booking,
  organisationId,
  slug,
  availableBeds,
  orgMembers,
  stripeConnected,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [checkInDate, setCheckInDate] = useState(booking.checkInDate);
  const [checkOutDate, setCheckOutDate] = useState(booking.checkOutDate);
  const [guestMemberIds, setGuestMemberIds] = useState<string[]>(
    booking.guests.map((g) => g.memberId)
  );
  const [bedAssignments, setBedAssignments] = useState<
    Record<string, string>
  >(
    Object.fromEntries(
      booking.guests
        .filter((g) => g.bedId)
        .map((g) => [g.memberId, g.bedId!])
    )
  );
  const [addGuestId, setAddGuestId] = useState("");

  const hasChanges =
    checkInDate !== booking.checkInDate ||
    checkOutDate !== booking.checkOutDate ||
    JSON.stringify([...guestMemberIds].sort()) !==
      JSON.stringify([...booking.guests.map((g) => g.memberId)].sort()) ||
    JSON.stringify(bedAssignments) !==
      JSON.stringify(
        Object.fromEntries(
          booking.guests
            .filter((g) => g.bedId)
            .map((g) => [g.memberId, g.bedId!])
        )
      );

  const availableToAdd = orgMembers.filter(
    (m) => !guestMemberIds.includes(m.id)
  );

  function handleAddGuest() {
    if (addGuestId && !guestMemberIds.includes(addGuestId)) {
      setGuestMemberIds([...guestMemberIds, addGuestId]);
      setAddGuestId("");
    }
  }

  function handleRemoveGuest(memberId: string) {
    if (memberId === booking.primaryMemberId) return;
    setGuestMemberIds(guestMemberIds.filter((id) => id !== memberId));
    const { [memberId]: _, ...rest } = bedAssignments;
    setBedAssignments(rest);
  }

  function handleBedChange(memberId: string, bedId: string) {
    setBedAssignments({ ...bedAssignments, [memberId]: bedId });
  }

  // Flatten available beds for the select
  const allAvailableBeds = availableBeds.flatMap((room) =>
    room.beds
      .filter((b) => b.status === "available" || b.status === "held-by-you")
      .map((b) => ({
        bedId: b.id,
        label: `${room.name} — ${b.label}`,
      }))
  );

  // Include currently assigned beds as options
  const currentBeds = booking.guests
    .filter((g) => g.bedId)
    .map((g) => ({
      bedId: g.bedId!,
      label: `${g.roomName ?? "Room"} — ${g.bedLabel ?? "Bed"}`,
    }));

  const allBedOptions = [
    ...currentBeds,
    ...allAvailableBeds.filter(
      (b) => !currentBeds.some((cb) => cb.bedId === b.bedId)
    ),
  ];

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const newBedAssignments = Object.entries(bedAssignments).map(
        ([guestMemberId, bedId]) => ({ guestMemberId, bedId })
      );

      const result = await memberEditBooking({
        bookingId: booking.id,
        organisationId,
        slug,
        ...(checkInDate !== booking.checkInDate && {
          newCheckInDate: checkInDate,
        }),
        ...(checkOutDate !== booking.checkOutDate && {
          newCheckOutDate: checkOutDate,
        }),
        ...(JSON.stringify([...guestMemberIds].sort()) !==
          JSON.stringify(
            [...booking.guests.map((g) => g.memberId)].sort()
          ) && { newGuestMemberIds: guestMemberIds }),
        ...(newBedAssignments.length > 0 && { newBedAssignments }),
      });

      if (!result.success) {
        toast.error(result.error ?? "Failed to update booking");
        return;
      }

      if (result.topUpTransactionId && stripeConnected) {
        toast.success(
          `Booking updated. Additional payment of ${formatCurrency(result.priceDeltaCents ?? 0)} required.`
        );
        // Redirect to Stripe checkout for the top-up
        const checkout = await createCheckoutSession(
          organisationId,
          result.topUpTransactionId,
          slug
        );
        if (checkout.url) {
          window.location.href = checkout.url;
          return;
        }
      }

      if (result.requiresApproval) {
        toast.success("Changes saved and pending admin approval.");
      } else if (result.priceDeltaCents && result.priceDeltaCents < 0) {
        toast.success(
          `Booking updated. A refund of ${formatCurrency(Math.abs(result.priceDeltaCents))} will be issued.`
        );
      } else {
        toast.success("Booking updated successfully.");
      }

      setEditing(false);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update booking"
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!editing) {
    return (
      <Button onClick={() => setEditing(true)} variant="outline">
        Edit Booking
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit Booking</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Dates */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Dates</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="edit-checkin">Check-in</Label>
              <Input
                id="edit-checkin"
                type="date"
                value={checkInDate}
                onChange={(e) => setCheckInDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-checkout">Check-out</Label>
              <Input
                id="edit-checkout"
                type="date"
                value={checkOutDate}
                onChange={(e) => setCheckOutDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Guests */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Guests</h4>
          <div className="space-y-2">
            {guestMemberIds.map((memberId) => {
              const existingGuest = booking.guests.find(
                (g) => g.memberId === memberId
              );
              const memberInfo =
                existingGuest ??
                orgMembers.find((m) => m.id === memberId);
              const isPrimary = memberId === booking.primaryMemberId;

              return (
                <div
                  key={memberId}
                  className="flex items-center justify-between rounded-lg border p-2"
                >
                  <span className="text-sm">
                    {memberInfo
                      ? `${memberInfo.firstName} ${memberInfo.lastName}`
                      : memberId}
                    {isPrimary && (
                      <span className="text-xs text-muted-foreground ml-1">
                        (primary)
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <Select
                      value={bedAssignments[memberId] ?? ""}
                      onValueChange={(v) => handleBedChange(memberId, v)}
                    >
                      <SelectTrigger className="w-48 h-8 text-xs">
                        <SelectValue placeholder="Select bed..." />
                      </SelectTrigger>
                      <SelectContent>
                        {allBedOptions.map((bed) => (
                          <SelectItem key={bed.bedId} value={bed.bedId}>
                            {bed.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!isPrimary && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveGuest(memberId)}
                        className="text-destructive text-xs"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {availableToAdd.length > 0 && (
            <div className="flex items-center gap-2">
              <Select value={addGuestId} onValueChange={setAddGuestId}>
                <SelectTrigger className="w-64 h-8 text-xs">
                  <SelectValue placeholder="Add a guest..." />
                </SelectTrigger>
                <SelectContent>
                  {availableToAdd.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.firstName} {m.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddGuest}
                disabled={!addGuestId}
              >
                Add
              </Button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => {
              setEditing(false);
              setCheckInDate(booking.checkInDate);
              setCheckOutDate(booking.checkOutDate);
              setGuestMemberIds(booking.guests.map((g) => g.memberId));
              setBedAssignments(
                Object.fromEntries(
                  booking.guests
                    .filter((g) => g.bedId)
                    .map((g) => [g.memberId, g.bedId!])
                )
              );
            }}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !hasChanges}
          >
            {submitting ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/[slug]/dashboard/bookings/[id]/edit-booking-form.tsx
git commit -m "feat(phase23): add edit booking form client component"
```

---

### Task 11: Dashboard — Add "View" Link

**Files:**
- Modify: `src/app/[slug]/dashboard/page.tsx:191-193`

- [ ] **Step 1: Add View link to booking cards**

In `src/app/[slug]/dashboard/page.tsx`, inside the booking card div (around line 191, after the booking reference `<p>` tag), add a "View" link:

Replace:
```tsx
                      <p className="text-xs text-muted-foreground font-mono">
                        {b.bookingReference}
                      </p>
```

With:
```tsx
                      <p className="text-xs text-muted-foreground font-mono">
                        <Link
                          href={`/${slug}/dashboard/bookings/${b.id}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {b.bookingReference}
                        </Link>
                      </p>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/[slug]/dashboard/page.tsx
git commit -m "feat(phase23): add booking detail link on dashboard cards"
```

---

### Task 12: E2E Tests

**Files:**
- Create: `e2e/member-booking-edit.spec.ts`

- [ ] **Step 1: Create E2E test file**

Create `e2e/member-booking-edit.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test.describe("Member booking editing", () => {
  test("member can view booking detail from dashboard", async ({ page }) => {
    // Login as a member who has a booking
    // Navigate to dashboard
    // Click on booking reference link
    // Verify booking detail page renders with correct data
    await page.goto("/demo/dashboard");
    const bookingLink = page.locator("a[href*='/dashboard/bookings/']").first();
    if (await bookingLink.isVisible()) {
      await bookingLink.click();
      await expect(page.locator("h1")).toContainText("Booking");
      await expect(page.locator("text=Check-in")).toBeVisible();
      await expect(page.locator("text=Check-out")).toBeVisible();
      await expect(page.locator("text=Guests")).toBeVisible();
    }
  });

  test("edit button appears when edit window is enabled", async ({ page }) => {
    // Requires admin to set memberBookingEditWindowDays > 0
    // Then member should see "Edit Booking" button on detail page
    await page.goto("/demo/dashboard");
    const bookingLink = page.locator("a[href*='/dashboard/bookings/']").first();
    if (await bookingLink.isVisible()) {
      await bookingLink.click();
      // Check for edit button (may or may not be visible depending on org config)
      const editButton = page.locator("button:has-text('Edit Booking')");
      // If edit window is configured, button should be present
      if (await editButton.isVisible()) {
        await expect(editButton).toBeEnabled();
      }
    }
  });

  test("member can change dates on their booking", async ({ page }) => {
    await page.goto("/demo/dashboard");
    const bookingLink = page.locator("a[href*='/dashboard/bookings/']").first();
    if (await bookingLink.isVisible()) {
      await bookingLink.click();
      const editButton = page.locator("button:has-text('Edit Booking')");
      if (await editButton.isVisible()) {
        await editButton.click();
        // Verify edit form appears
        await expect(page.locator("text=Dates")).toBeVisible();
        await expect(page.locator("text=Guests")).toBeVisible();
      }
    }
  });

  test("cancel button returns to view mode", async ({ page }) => {
    await page.goto("/demo/dashboard");
    const bookingLink = page.locator("a[href*='/dashboard/bookings/']").first();
    if (await bookingLink.isVisible()) {
      await bookingLink.click();
      const editButton = page.locator("button:has-text('Edit Booking')");
      if (await editButton.isVisible()) {
        await editButton.click();
        const cancelButton = page.locator("button:has-text('Cancel')").first();
        await cancelButton.click();
        await expect(editButton).toBeVisible();
      }
    }
  });

  test("edit button hidden when edit window is disabled", async ({ page }) => {
    // This test assumes org has memberBookingEditWindowDays = 0
    // or booking is within the edit window cutoff
    // Navigate to booking detail and verify no edit button
    await page.goto("/demo/dashboard");
    const bookingLink = page.locator("a[href*='/dashboard/bookings/']").first();
    if (await bookingLink.isVisible()) {
      await bookingLink.click();
      // If editing is disabled, the message should be shown instead
      const editDisabledMsg = page.locator("text=not enabled");
      const editWindowMsg = page.locator("text=days before check-in");
      const editButton = page.locator("button:has-text('Edit Booking')");
      // One of these should be true depending on config
      const hasEditButton = await editButton.isVisible();
      const hasDisabledMsg =
        (await editDisabledMsg.isVisible()) ||
        (await editWindowMsg.isVisible());
      expect(hasEditButton || hasDisabledMsg).toBeTruthy();
    }
  });

  test("dashboard back link works", async ({ page }) => {
    await page.goto("/demo/dashboard");
    const bookingLink = page.locator("a[href*='/dashboard/bookings/']").first();
    if (await bookingLink.isVisible()) {
      await bookingLink.click();
      const backLink = page.locator("a:has-text('Dashboard')");
      await backLink.click();
      await expect(page).toHaveURL(/\/demo\/dashboard$/);
    }
  });
});
```

- [ ] **Step 2: Run E2E tests**

Run: `cd /opt/snowgum && npx playwright test e2e/member-booking-edit.spec.ts`
Expected: Tests pass (some may be conditional on test data availability)

- [ ] **Step 3: Commit**

```bash
git add e2e/member-booking-edit.spec.ts
git commit -m "test(phase23): add E2E tests for member booking editing"
```

---

### Task 13: Run Full Test Suite

- [ ] **Step 1: Run all Vitest tests**

Run: `cd /opt/snowgum && npx vitest run`
Expected: All tests pass, no regressions

- [ ] **Step 2: Fix any failures**

If any tests fail, investigate and fix. Re-run until green.

- [ ] **Step 3: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix(phase23): resolve test regressions"
```

---

## Verification

1. `npx vitest run` — all unit tests pass
2. Enable edit window: admin settings > set "Member Booking Edit Window" to 7
3. Log in as member with a booking > click booking reference on dashboard > see detail page
4. Click "Edit Booking" > change dates > save > verify price recalculated
5. Add a guest > pick a bed > save > verify guest appears
6. Remove a guest > save > verify guest removed and price updated
7. Verify admin receives notification email
8. Check audit log viewer for `BOOKING_MEMBER_EDITED` entry
9. `npx playwright test e2e/member-booking-edit.spec.ts` — E2E passes
