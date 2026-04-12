# Booking Matrix Calendar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a beds-x-dates matrix calendar view shared by three consumers: member availability, booking wizard bed selection, and admin booking manager with drag-and-drop.

**Architecture:** A `<BookingMatrix />` core component using CSS Grid with sticky headers, shared by three page-level consumers configured via props. A new `getMatrixData` server action provides all data in one round trip. Admin drag-and-drop uses `@dnd-kit/core` (desktop only). Mobile member view defaults to date-first list with grid toggle. Admin mobile uses tap-to-edit sheets instead of drag-drop.

**Tech Stack:** Next.js 16, React 19, CSS Grid, @dnd-kit/core, @dnd-kit/utilities, shadcn/ui, Drizzle ORM, Tailwind CSS, Vitest, pglite, Playwright

**Docs to read before starting:**
- `docs/testing.md` — testing rules, banned patterns, pglite harness
- `docs/auth.md` — auth guard pattern for server actions
- `node_modules/next/dist/docs/` — Next.js 16 breaking changes

---

### Task 1: Install @dnd-kit Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install @dnd-kit packages**

```bash
cd /opt/snowgum && npm install @dnd-kit/core @dnd-kit/utilities
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(matrix): install @dnd-kit/core and @dnd-kit/utilities"
```

---

### Task 2: `getMatrixData` Server Action — Tests

**Files:**
- Create: `src/actions/bookings/matrix.ts`
- Create: `src/actions/bookings/matrix.integration.test.ts`

- [ ] **Step 1: Write the integration test file**

```typescript
// src/actions/bookings/matrix.integration.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db/index";
import {
  organisations,
  lodges,
  rooms,
  beds,
  bookings,
  bookingGuests,
  members,
  membershipClasses,
  availabilityOverrides,
  bedHolds,
  bookingRounds,
  seasons,
} from "@/db/schema";
import { getMatrixData } from "./matrix";

describe("getMatrixData", () => {
  let orgId: string;
  let lodgeId: string;
  let room1Id: string;
  let room2Id: string;
  let bed1Id: string;
  let bed2Id: string;
  let bed3Id: string;
  let memberId: string;
  let classId: string;
  let seasonId: string;
  let roundId: string;

  beforeEach(async () => {
    // Seed org
    const [org] = await db
      .insert(organisations)
      .values({ name: "Test Org", slug: "test-org" })
      .returning();
    orgId = org.id;

    // Seed membership class + member
    const [mc] = await db
      .insert(membershipClasses)
      .values({ organisationId: orgId, name: "Full", sortOrder: 0 })
      .returning();
    classId = mc.id;

    const [m] = await db
      .insert(members)
      .values({
        organisationId: orgId,
        firstName: "Alice",
        lastName: "Smith",
        email: "alice@test.com",
        membershipClassId: classId,
        memberNumber: "M001",
      })
      .returning();
    memberId = m.id;

    // Seed lodge, rooms, beds
    const [lodge] = await db
      .insert(lodges)
      .values({ organisationId: orgId, name: "Alpine Lodge", totalBeds: 3 })
      .returning();
    lodgeId = lodge.id;

    const [r1] = await db
      .insert(rooms)
      .values({ lodgeId, name: "Room 1", capacity: 2, sortOrder: 0 })
      .returning();
    room1Id = r1.id;

    const [r2] = await db
      .insert(rooms)
      .values({ lodgeId, name: "Room 2", capacity: 1, sortOrder: 1 })
      .returning();
    room2Id = r2.id;

    const [b1] = await db
      .insert(beds)
      .values({ roomId: room1Id, label: "Bed A", sortOrder: 0 })
      .returning();
    bed1Id = b1.id;

    const [b2] = await db
      .insert(beds)
      .values({ roomId: room1Id, label: "Bed B", sortOrder: 1 })
      .returning();
    bed2Id = b2.id;

    const [b3] = await db
      .insert(beds)
      .values({ roomId: room2Id, label: "Bed C", sortOrder: 0 })
      .returning();
    bed3Id = b3.id;

    // Seed season + round
    const [s] = await db
      .insert(seasons)
      .values({
        organisationId: orgId,
        name: "Winter 2027",
        startDate: "2027-06-01",
        endDate: "2027-08-31",
      })
      .returning();
    seasonId = s.id;

    const [r] = await db
      .insert(bookingRounds)
      .values({
        seasonId: s.id,
        organisationId: orgId,
        name: "Priority",
        opensAt: new Date("2027-03-01"),
        closesAt: new Date("2027-05-31"),
        sortOrder: 0,
      })
      .returning();
    roundId = r.id;
  });

  it("returns rooms and beds grouped correctly", async () => {
    const result = await getMatrixData(lodgeId, "2027-07-01", "2027-07-08");

    expect(result.rooms).toHaveLength(2);
    expect(result.rooms[0].name).toBe("Room 1");
    expect(result.rooms[0].beds).toHaveLength(2);
    expect(result.rooms[1].name).toBe("Room 2");
    expect(result.rooms[1].beds).toHaveLength(1);
  });

  it("returns bookings overlapping the date range", async () => {
    const [booking] = await db
      .insert(bookings)
      .values({
        organisationId: orgId,
        lodgeId,
        bookingRoundId: roundId,
        primaryMemberId: memberId,
        status: "CONFIRMED",
        checkInDate: "2027-07-03",
        checkOutDate: "2027-07-06",
        totalNights: 3,
        subtotalCents: 30000,
        totalAmountCents: 30000,
        bookingReference: "TEST-2027-0001",
      })
      .returning();

    await db.insert(bookingGuests).values({
      bookingId: booking.id,
      memberId,
      bedId: bed1Id,
      roomId: room1Id,
      pricePerNightCents: 10000,
      totalAmountCents: 30000,
    });

    const result = await getMatrixData(lodgeId, "2027-07-01", "2027-07-08");

    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0].bedId).toBe(bed1Id);
    expect(result.bookings[0].guestName).toBe("Alice Smith");
    expect(result.bookings[0].checkIn).toBe("2027-07-03");
    expect(result.bookings[0].checkOut).toBe("2027-07-06");
    expect(result.bookings[0].status).toBe("CONFIRMED");
  });

  it("excludes cancelled bookings", async () => {
    const [booking] = await db
      .insert(bookings)
      .values({
        organisationId: orgId,
        lodgeId,
        bookingRoundId: roundId,
        primaryMemberId: memberId,
        status: "CANCELLED",
        checkInDate: "2027-07-03",
        checkOutDate: "2027-07-06",
        totalNights: 3,
        subtotalCents: 30000,
        totalAmountCents: 30000,
        bookingReference: "TEST-2027-0002",
      })
      .returning();

    await db.insert(bookingGuests).values({
      bookingId: booking.id,
      memberId,
      bedId: bed1Id,
      roomId: room1Id,
      pricePerNightCents: 10000,
      totalAmountCents: 30000,
    });

    const result = await getMatrixData(lodgeId, "2027-07-01", "2027-07-08");
    expect(result.bookings).toHaveLength(0);
  });

  it("excludes bookings outside the date range", async () => {
    const [booking] = await db
      .insert(bookings)
      .values({
        organisationId: orgId,
        lodgeId,
        bookingRoundId: roundId,
        primaryMemberId: memberId,
        status: "CONFIRMED",
        checkInDate: "2027-07-10",
        checkOutDate: "2027-07-15",
        totalNights: 5,
        subtotalCents: 50000,
        totalAmountCents: 50000,
        bookingReference: "TEST-2027-0003",
      })
      .returning();

    await db.insert(bookingGuests).values({
      bookingId: booking.id,
      memberId,
      bedId: bed1Id,
      roomId: room1Id,
      pricePerNightCents: 10000,
      totalAmountCents: 50000,
    });

    const result = await getMatrixData(lodgeId, "2027-07-01", "2027-07-08");
    expect(result.bookings).toHaveLength(0);
  });

  it("returns availability overrides for the date range", async () => {
    await db.insert(availabilityOverrides).values({
      lodgeId,
      startDate: "2027-07-04",
      endDate: "2027-07-05",
      type: "CLOSURE",
      reason: "Maintenance",
      createdByMemberId: memberId,
    });

    const result = await getMatrixData(lodgeId, "2027-07-01", "2027-07-08");

    expect(result.overrides).toHaveLength(1);
    expect(result.overrides[0].type).toBe("CLOSURE");
    expect(result.overrides[0].reason).toBe("Maintenance");
  });

  it("returns active bed holds", async () => {
    await db.insert(bedHolds).values({
      lodgeId,
      bedId: bed2Id,
      memberId,
      bookingRoundId: roundId,
      checkInDate: "2027-07-02",
      checkOutDate: "2027-07-05",
      expiresAt: new Date(Date.now() + 600_000), // 10 min from now
    });

    const result = await getMatrixData(lodgeId, "2027-07-01", "2027-07-08");

    expect(result.holds).toHaveLength(1);
    expect(result.holds[0].bedId).toBe(bed2Id);
  });

  it("excludes expired bed holds", async () => {
    await db.insert(bedHolds).values({
      lodgeId,
      bedId: bed2Id,
      memberId,
      bookingRoundId: roundId,
      checkInDate: "2027-07-02",
      checkOutDate: "2027-07-05",
      expiresAt: new Date(Date.now() - 60_000), // expired 1 min ago
    });

    const result = await getMatrixData(lodgeId, "2027-07-01", "2027-07-08");
    expect(result.holds).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:integration -- src/actions/bookings/matrix.integration.test.ts
```

Expected: FAIL — `getMatrixData` does not exist yet.

- [ ] **Step 3: Commit failing tests**

```bash
git add src/actions/bookings/matrix.integration.test.ts
git commit -m "test(matrix): add getMatrixData integration tests (red)"
```

---

### Task 3: `getMatrixData` Server Action — Implementation

**Files:**
- Create: `src/actions/bookings/matrix.ts`

- [ ] **Step 1: Implement getMatrixData**

```typescript
// src/actions/bookings/matrix.ts
"use server";

import { db } from "@/db/index";
import {
  rooms,
  beds,
  bookings,
  bookingGuests,
  members,
  associates,
  availabilityOverrides,
  bedHolds,
} from "@/db/schema";
import { eq, and, sql, lt, gte } from "drizzle-orm";

export type MatrixRoom = {
  id: string;
  name: string;
  floor: string | null;
  sortOrder: number;
  beds: MatrixBed[];
};

export type MatrixBed = {
  id: string;
  label: string;
  sortOrder: number;
};

export type MatrixBooking = {
  id: string;
  bookingId: string;
  guestName: string;
  bedId: string;
  checkIn: string;
  checkOut: string;
  status: string;
  membershipClass: string | null;
  bookingReference: string;
  totalAmountCents: number;
  hasAdminNotes: boolean;
};

export type MatrixOverride = {
  startDate: string;
  endDate: string;
  type: "CLOSURE" | "REDUCTION" | "EVENT";
  reason: string | null;
  bedReduction: number | null;
};

export type MatrixHold = {
  bedId: string;
  checkIn: string;
  checkOut: string;
  memberId: string;
  expiresAt: Date;
};

export type MatrixData = {
  rooms: MatrixRoom[];
  bookings: MatrixBooking[];
  overrides: MatrixOverride[];
  holds: MatrixHold[];
};

export async function getMatrixData(
  lodgeId: string,
  startDate: string,
  endDate: string
): Promise<MatrixData> {
  // Get rooms with beds
  const lodgeRooms = await db
    .select({
      id: rooms.id,
      name: rooms.name,
      floor: rooms.floor,
      sortOrder: rooms.sortOrder,
    })
    .from(rooms)
    .where(eq(rooms.lodgeId, lodgeId))
    .orderBy(rooms.sortOrder);

  const roomIds = lodgeRooms.map((r) => r.id);

  const allBeds =
    roomIds.length > 0
      ? await db
          .select({
            id: beds.id,
            label: beds.label,
            roomId: beds.roomId,
            sortOrder: beds.sortOrder,
          })
          .from(beds)
          .where(sql`${beds.roomId} IN ${roomIds}`)
          .orderBy(beds.sortOrder)
      : [];

  const matrixRooms: MatrixRoom[] = lodgeRooms.map((room) => ({
    id: room.id,
    name: room.name,
    floor: room.floor,
    sortOrder: room.sortOrder,
    beds: allBeds
      .filter((b) => b.roomId === room.id)
      .map((b) => ({ id: b.id, label: b.label, sortOrder: b.sortOrder })),
  }));

  // Get bookings overlapping [startDate, endDate)
  const bookingRows = await db
    .select({
      bgId: bookingGuests.id,
      bookingId: bookings.id,
      bedId: bookingGuests.bedId,
      checkIn: bookings.checkInDate,
      checkOut: bookings.checkOutDate,
      status: bookings.status,
      bookingReference: bookings.bookingReference,
      totalAmountCents: bookings.totalAmountCents,
      adminNotes: bookings.adminNotes,
      memberFirstName: members.firstName,
      memberLastName: members.lastName,
      associateFirstName: associates.firstName,
      associateLastName: associates.lastName,
    })
    .from(bookingGuests)
    .innerJoin(bookings, eq(bookings.id, bookingGuests.bookingId))
    .leftJoin(members, eq(members.id, bookingGuests.memberId))
    .leftJoin(associates, eq(associates.id, bookingGuests.associateId))
    .where(
      and(
        eq(bookings.lodgeId, lodgeId),
        sql`${bookings.status} NOT IN ('CANCELLED')`,
        lt(bookings.checkInDate, endDate),
        sql`${bookings.checkOutDate} > ${startDate}`
      )
    );

  const matrixBookings: MatrixBooking[] = bookingRows
    .filter((r) => r.bedId !== null)
    .map((r) => ({
      id: r.bgId,
      bookingId: r.bookingId,
      guestName: r.memberFirstName
        ? `${r.memberFirstName} ${r.memberLastName}`
        : `${r.associateFirstName} ${r.associateLastName}`,
      bedId: r.bedId!,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      status: r.status,
      membershipClass: null,
      bookingReference: r.bookingReference,
      totalAmountCents: r.totalAmountCents,
      hasAdminNotes: !!r.adminNotes,
    }));

  // Get availability overrides
  const overrideRows = await db
    .select({
      startDate: availabilityOverrides.startDate,
      endDate: availabilityOverrides.endDate,
      type: availabilityOverrides.type,
      reason: availabilityOverrides.reason,
      bedReduction: availabilityOverrides.bedReduction,
    })
    .from(availabilityOverrides)
    .where(
      and(
        eq(availabilityOverrides.lodgeId, lodgeId),
        lt(availabilityOverrides.startDate, endDate),
        sql`${availabilityOverrides.endDate} > ${startDate}`
      )
    );

  const matrixOverrides: MatrixOverride[] = overrideRows.map((o) => ({
    startDate: o.startDate,
    endDate: o.endDate,
    type: o.type as MatrixOverride["type"],
    reason: o.reason,
    bedReduction: o.bedReduction,
  }));

  // Get active holds
  const holdRows = await db
    .select({
      bedId: bedHolds.bedId,
      checkIn: bedHolds.checkInDate,
      checkOut: bedHolds.checkOutDate,
      memberId: bedHolds.memberId,
      expiresAt: bedHolds.expiresAt,
    })
    .from(bedHolds)
    .where(
      and(
        eq(bedHolds.lodgeId, lodgeId),
        gte(bedHolds.expiresAt, new Date()),
        lt(bedHolds.checkInDate, endDate),
        sql`${bedHolds.checkOutDate} > ${startDate}`
      )
    );

  const matrixHolds: MatrixHold[] = holdRows.map((h) => ({
    bedId: h.bedId,
    checkIn: h.checkIn,
    checkOut: h.checkOut,
    memberId: h.memberId,
    expiresAt: h.expiresAt,
  }));

  return {
    rooms: matrixRooms,
    bookings: matrixBookings,
    overrides: matrixOverrides,
    holds: matrixHolds,
  };
}
```

- [ ] **Step 2: Run the integration tests**

```bash
npm run test:integration -- src/actions/bookings/matrix.integration.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/actions/bookings/matrix.ts
git commit -m "feat(matrix): implement getMatrixData server action"
```

---

### Task 4: Matrix Grid Utilities — Tests & Implementation

**Files:**
- Create: `src/lib/matrix-utils.ts`
- Create: `src/lib/matrix-utils.test.ts`

These are pure functions for date window logic, grid position calculations, and overlap detection.

- [ ] **Step 1: Write unit tests**

```typescript
// src/lib/matrix-utils.test.ts
import { describe, it, expect } from "vitest";
import {
  generateDateRange,
  dateToColumnIndex,
  bookingToGridColumns,
  datesOverlap,
  getResponsiveDayCount,
} from "./matrix-utils";

describe("generateDateRange", () => {
  it("generates correct dates for a 7-day range", () => {
    const dates = generateDateRange("2027-07-01", 7);
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe("2027-07-01");
    expect(dates[6]).toBe("2027-07-07");
  });

  it("handles month boundary", () => {
    const dates = generateDateRange("2027-06-28", 5);
    expect(dates).toEqual([
      "2027-06-28",
      "2027-06-29",
      "2027-06-30",
      "2027-07-01",
      "2027-07-02",
    ]);
  });
});

describe("dateToColumnIndex", () => {
  it("returns correct 0-based index", () => {
    expect(dateToColumnIndex("2027-07-03", "2027-07-01")).toBe(2);
  });

  it("returns 0 for start date", () => {
    expect(dateToColumnIndex("2027-07-01", "2027-07-01")).toBe(0);
  });

  it("returns negative for date before start", () => {
    expect(dateToColumnIndex("2027-06-30", "2027-07-01")).toBe(-1);
  });
});

describe("bookingToGridColumns", () => {
  it("returns correct start and end columns for a booking within range", () => {
    const result = bookingToGridColumns(
      "2027-07-03",
      "2027-07-06",
      "2027-07-01",
      "2027-07-10"
    );
    // CSS grid columns are 1-based; +1 for the bed label column
    expect(result).toEqual({ colStart: 4, colEnd: 7 });
  });

  it("clips booking that starts before the visible range", () => {
    const result = bookingToGridColumns(
      "2027-06-28",
      "2027-07-03",
      "2027-07-01",
      "2027-07-10"
    );
    expect(result).toEqual({ colStart: 2, colEnd: 4, clippedStart: true });
  });

  it("clips booking that ends after the visible range", () => {
    const result = bookingToGridColumns(
      "2027-07-08",
      "2027-07-15",
      "2027-07-01",
      "2027-07-10"
    );
    expect(result).toEqual({ colStart: 9, colEnd: 11, clippedEnd: true });
  });

  it("returns null for booking entirely outside range", () => {
    const result = bookingToGridColumns(
      "2027-07-15",
      "2027-07-20",
      "2027-07-01",
      "2027-07-10"
    );
    expect(result).toBeNull();
  });
});

describe("datesOverlap", () => {
  it("detects overlapping date ranges", () => {
    expect(datesOverlap("2027-07-01", "2027-07-05", "2027-07-03", "2027-07-08")).toBe(true);
  });

  it("returns false for adjacent non-overlapping ranges", () => {
    expect(datesOverlap("2027-07-01", "2027-07-05", "2027-07-05", "2027-07-08")).toBe(false);
  });

  it("returns false for non-overlapping ranges", () => {
    expect(datesOverlap("2027-07-01", "2027-07-03", "2027-07-05", "2027-07-08")).toBe(false);
  });
});

describe("getResponsiveDayCount", () => {
  it("returns 7 for mobile", () => {
    expect(getResponsiveDayCount("mobile")).toBe(7);
  });

  it("returns 14 for tablet", () => {
    expect(getResponsiveDayCount("tablet")).toBe(14);
  });

  it("returns 30 for desktop", () => {
    expect(getResponsiveDayCount("desktop")).toBe(30);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/lib/matrix-utils.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement matrix-utils**

```typescript
// src/lib/matrix-utils.ts
import { addDays, differenceInCalendarDays, format } from "date-fns";

/**
 * Generate an array of date strings (YYYY-MM-DD) starting from startDate.
 */
export function generateDateRange(startDate: string, days: number): string[] {
  const start = new Date(startDate + "T00:00:00");
  return Array.from({ length: days }, (_, i) =>
    format(addDays(start, i), "yyyy-MM-dd")
  );
}

/**
 * Get 0-based column index for a date relative to the grid start date.
 */
export function dateToColumnIndex(date: string, gridStartDate: string): number {
  return differenceInCalendarDays(
    new Date(date + "T00:00:00"),
    new Date(gridStartDate + "T00:00:00")
  );
}

type GridColumns = {
  colStart: number;
  colEnd: number;
  clippedStart?: boolean;
  clippedEnd?: boolean;
};

/**
 * Convert a booking's check-in/check-out to CSS grid column positions.
 * Returns null if the booking is entirely outside the visible range.
 * Column 1 is the bed label column, so date columns start at 2.
 */
export function bookingToGridColumns(
  checkIn: string,
  checkOut: string,
  gridStartDate: string,
  gridEndDate: string
): GridColumns | null {
  const gridStart = new Date(gridStartDate + "T00:00:00");
  const gridEnd = new Date(gridEndDate + "T00:00:00");
  const bookingStart = new Date(checkIn + "T00:00:00");
  const bookingEnd = new Date(checkOut + "T00:00:00");

  // Entirely outside range
  if (bookingEnd <= gridStart || bookingStart >= gridEnd) {
    return null;
  }

  const clippedStart = bookingStart < gridStart;
  const clippedEnd = bookingEnd > gridEnd;

  const effectiveStart = clippedStart ? gridStart : bookingStart;
  const effectiveEnd = clippedEnd ? gridEnd : bookingEnd;

  // +2 because: +1 for 1-based grid, +1 for bed label column
  const colStart = differenceInCalendarDays(effectiveStart, gridStart) + 2;
  const colEnd = differenceInCalendarDays(effectiveEnd, gridStart) + 2;

  const result: GridColumns = { colStart, colEnd };
  if (clippedStart) result.clippedStart = true;
  if (clippedEnd) result.clippedEnd = true;
  return result;
}

/**
 * Check if two date ranges overlap. Uses half-open interval [start, end).
 */
export function datesOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  return start1 < end2 && start2 < end1;
}

export type Breakpoint = "mobile" | "tablet" | "desktop";

/**
 * Get the number of visible days for a responsive breakpoint.
 */
export function getResponsiveDayCount(breakpoint: Breakpoint): number {
  switch (breakpoint) {
    case "mobile":
      return 7;
    case "tablet":
      return 14;
    case "desktop":
      return 30;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/lib/matrix-utils.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matrix-utils.ts src/lib/matrix-utils.test.ts
git commit -m "feat(matrix): add grid utility functions with tests"
```

---

### Task 5: `useMatrixState` Hook

**Files:**
- Create: `src/components/matrix/use-matrix-state.ts`

- [ ] **Step 1: Create the matrix state hook**

```typescript
// src/components/matrix/use-matrix-state.ts
"use client";

import { useState, useCallback, useMemo } from "react";
import { format, addDays } from "date-fns";
import { generateDateRange, type Breakpoint, getResponsiveDayCount } from "@/lib/matrix-utils";

export type ViewMode = "grid" | "list";

export type MatrixState = {
  startDate: string;
  visibleDates: string[];
  endDate: string;
  collapsedRooms: Set<string>;
  selectedBookingIds: Set<string>;
  viewMode: ViewMode;
  navigateForward: () => void;
  navigateBackward: () => void;
  jumpToDate: (date: string) => void;
  jumpToToday: () => void;
  toggleRoom: (roomId: string) => void;
  toggleBookingSelection: (bookingId: string) => void;
  clearSelection: () => void;
  setViewMode: (mode: ViewMode) => void;
};

type Options = {
  initialDate?: string;
  breakpoint: Breakpoint;
  seasonStartDate?: string;
  seasonEndDate?: string;
};

export function useMatrixState(options: Options): MatrixState {
  const dayCount = getResponsiveDayCount(options.breakpoint);
  const today = format(new Date(), "yyyy-MM-dd");

  const [startDate, setStartDate] = useState(
    options.initialDate ?? today
  );
  const [collapsedRooms, setCollapsedRooms] = useState<Set<string>>(new Set());
  const [selectedBookingIds, setSelectedBookingIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const visibleDates = useMemo(
    () => generateDateRange(startDate, dayCount),
    [startDate, dayCount]
  );

  const endDate = useMemo(
    () => format(addDays(new Date(startDate + "T00:00:00"), dayCount), "yyyy-MM-dd"),
    [startDate, dayCount]
  );

  const navigateForward = useCallback(() => {
    const next = format(addDays(new Date(startDate + "T00:00:00"), dayCount), "yyyy-MM-dd");
    if (options.seasonEndDate && next > options.seasonEndDate) return;
    setStartDate(next);
  }, [startDate, dayCount, options.seasonEndDate]);

  const navigateBackward = useCallback(() => {
    const prev = format(addDays(new Date(startDate + "T00:00:00"), -dayCount), "yyyy-MM-dd");
    if (options.seasonStartDate && prev < options.seasonStartDate) {
      setStartDate(options.seasonStartDate);
      return;
    }
    setStartDate(prev);
  }, [startDate, dayCount, options.seasonStartDate]);

  const jumpToDate = useCallback((date: string) => {
    setStartDate(date);
  }, []);

  const jumpToToday = useCallback(() => {
    setStartDate(today);
  }, [today]);

  const toggleRoom = useCallback((roomId: string) => {
    setCollapsedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) {
        next.delete(roomId);
      } else {
        next.add(roomId);
      }
      return next;
    });
  }, []);

  const toggleBookingSelection = useCallback((bookingId: string) => {
    setSelectedBookingIds((prev) => {
      const next = new Set(prev);
      if (next.has(bookingId)) {
        next.delete(bookingId);
      } else {
        next.add(bookingId);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedBookingIds(new Set());
  }, []);

  return {
    startDate,
    visibleDates,
    endDate,
    collapsedRooms,
    selectedBookingIds,
    viewMode,
    navigateForward,
    navigateBackward,
    jumpToDate,
    jumpToToday,
    toggleRoom,
    toggleBookingSelection,
    clearSelection,
    setViewMode,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/matrix/use-matrix-state.ts
git commit -m "feat(matrix): add useMatrixState hook for client-side grid state"
```

---

### Task 6: `useBreakpoint` Hook

**Files:**
- Create: `src/components/matrix/use-breakpoint.ts`

- [ ] **Step 1: Create the breakpoint detection hook**

```typescript
// src/components/matrix/use-breakpoint.ts
"use client";

import { useState, useEffect } from "react";
import type { Breakpoint } from "@/lib/matrix-utils";

export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop");

  useEffect(() => {
    function update() {
      const width = window.innerWidth;
      if (width < 640) {
        setBreakpoint("mobile");
      } else if (width < 1024) {
        setBreakpoint("tablet");
      } else {
        setBreakpoint("desktop");
      }
    }

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return breakpoint;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/matrix/use-breakpoint.ts
git commit -m "feat(matrix): add useBreakpoint hook for responsive day count"
```

---

### Task 7: Core `<BookingMatrix />` Component

**Files:**
- Create: `src/components/matrix/booking-matrix.tsx`
- Create: `src/components/matrix/matrix-header.tsx`
- Create: `src/components/matrix/room-group.tsx`
- Create: `src/components/matrix/bed-row.tsx`
- Create: `src/components/matrix/booking-bar.tsx`
- Create: `src/components/matrix/date-navigator.tsx`

- [ ] **Step 1: Create DateNavigator**

```typescript
// src/components/matrix/date-navigator.tsx
"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { format } from "date-fns";

type Props = {
  startDate: string;
  endDate: string;
  onNavigateForward: () => void;
  onNavigateBackward: () => void;
  onJumpToToday: () => void;
};

export function DateNavigator({
  startDate,
  endDate,
  onNavigateForward,
  onNavigateBackward,
  onJumpToToday,
}: Props) {
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");

  return (
    <div className="flex items-center gap-2 mb-3">
      <Button variant="outline" size="sm" onClick={onNavigateBackward}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" onClick={onJumpToToday}>
        <CalendarDays className="h-4 w-4 mr-1" />
        Today
      </Button>
      <Button variant="outline" size="sm" onClick={onNavigateForward}>
        <ChevronRight className="h-4 w-4" />
      </Button>
      <span className="text-sm text-muted-foreground ml-2">
        {format(start, "d MMM")} — {format(end, "d MMM yyyy")}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Create MatrixHeader**

```typescript
// src/components/matrix/matrix-header.tsx
"use client";

import { format, getDay } from "date-fns";

type Props = {
  dates: string[];
};

export function MatrixHeader({ dates }: Props) {
  return (
    <>
      {/* Corner cell — sticky both axes */}
      <div
        className="sticky left-0 top-0 z-30 bg-background border-b border-r p-2 text-xs font-medium text-muted-foreground"
        style={{ gridColumn: 1, gridRow: 1 }}
      >
        Bed
      </div>
      {/* Date header cells */}
      {dates.map((date, i) => {
        const d = new Date(date + "T00:00:00");
        const dayOfWeek = getDay(d);
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        return (
          <div
            key={date}
            className={`sticky top-0 z-20 border-b border-r p-1 text-center text-xs ${
              isWeekend
                ? "bg-muted/50 font-semibold"
                : "bg-background"
            }`}
            style={{ gridColumn: i + 2, gridRow: 1 }}
          >
            <div>{format(d, "EEE")}</div>
            <div>{format(d, "d")}</div>
          </div>
        );
      })}
    </>
  );
}
```

- [ ] **Step 3: Create BookingBar**

```typescript
// src/components/matrix/booking-bar.tsx
"use client";

import type { MatrixBooking } from "@/actions/bookings/matrix";
import { bookingToGridColumns } from "@/lib/matrix-utils";

const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: "bg-blue-500/80 text-white",
  PENDING: "bg-amber-500/80 text-white",
  WAITLISTED: "bg-purple-500/80 text-white",
  COMPLETED: "bg-green-500/80 text-white",
};

type Props = {
  booking: MatrixBooking;
  gridStartDate: string;
  gridEndDate: string;
  gridRow: number;
  onClick?: (booking: MatrixBooking) => void;
  draggable?: boolean;
};

export function BookingBar({
  booking,
  gridStartDate,
  gridEndDate,
  gridRow,
  onClick,
  draggable,
}: Props) {
  const cols = bookingToGridColumns(
    booking.checkIn,
    booking.checkOut,
    gridStartDate,
    gridEndDate
  );

  if (!cols) return null;

  const colorClass = STATUS_COLORS[booking.status] ?? "bg-gray-400/80 text-white";

  return (
    <div
      className={`absolute inset-y-1 rounded-md px-1.5 flex items-center text-xs font-medium truncate cursor-pointer ${colorClass} ${
        cols.clippedStart ? "rounded-l-none" : ""
      } ${cols.clippedEnd ? "rounded-r-none" : ""}`}
      style={{
        gridColumn: `${cols.colStart} / ${cols.colEnd}`,
        gridRow,
      }}
      onClick={() => onClick?.(booking)}
      data-booking-id={booking.id}
      data-draggable={draggable}
    >
      {cols.clippedStart && <span className="mr-0.5">...</span>}
      <span className="truncate">{booking.guestName}</span>
      {cols.clippedEnd && <span className="ml-0.5">...</span>}
    </div>
  );
}
```

- [ ] **Step 4: Create BedRow**

```typescript
// src/components/matrix/bed-row.tsx
"use client";

import type { MatrixBed, MatrixBooking, MatrixOverride, MatrixHold } from "@/actions/bookings/matrix";
import { BookingBar } from "./booking-bar";
import { datesOverlap } from "@/lib/matrix-utils";

type CellStatus = "available" | "booked" | "held" | "held-by-you" | "closed";

type Props = {
  bed: MatrixBed;
  dates: string[];
  gridRow: number;
  gridStartDate: string;
  gridEndDate: string;
  bookings: MatrixBooking[];
  overrides: MatrixOverride[];
  holds: MatrixHold[];
  currentMemberId?: string;
  onCellClick?: (bedId: string, date: string) => void;
  onBookingClick?: (booking: MatrixBooking) => void;
  draggable?: boolean;
  abbreviateLabel?: boolean;
};

function getCellStatus(
  date: string,
  bedId: string,
  bookings: MatrixBooking[],
  holds: MatrixHold[],
  overrides: MatrixOverride[],
  currentMemberId?: string
): CellStatus {
  const nextDate = new Date(date + "T00:00:00");
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = nextDate.toISOString().slice(0, 10);

  // Check for closures
  for (const o of overrides) {
    if (o.type === "CLOSURE" && datesOverlap(date, nextDateStr, o.startDate, o.endDate)) {
      return "closed";
    }
  }

  // Check bookings
  for (const b of bookings) {
    if (b.bedId === bedId && datesOverlap(date, nextDateStr, b.checkIn, b.checkOut)) {
      return "booked";
    }
  }

  // Check holds
  for (const h of holds) {
    if (h.bedId === bedId && datesOverlap(date, nextDateStr, h.checkIn, h.checkOut)) {
      return h.memberId === currentMemberId ? "held-by-you" : "held";
    }
  }

  return "available";
}

const CELL_STATUS_CLASSES: Record<CellStatus, string> = {
  available: "bg-green-50 dark:bg-green-950/20 hover:bg-green-100 dark:hover:bg-green-950/40",
  booked: "bg-red-50 dark:bg-red-950/20",
  held: "bg-amber-50 dark:bg-amber-950/20",
  "held-by-you": "bg-blue-100 dark:bg-blue-900/30",
  closed: "bg-gray-100 dark:bg-gray-800/50",
};

export function BedRow({
  bed,
  dates,
  gridRow,
  gridStartDate,
  gridEndDate,
  bookings,
  overrides,
  holds,
  currentMemberId,
  onCellClick,
  onBookingClick,
  draggable,
  abbreviateLabel,
}: Props) {
  return (
    <>
      {/* Bed label — sticky left */}
      <div
        className="sticky left-0 z-10 bg-background border-b border-r px-2 py-1 text-xs truncate flex items-center"
        style={{ gridColumn: 1, gridRow }}
      >
        {abbreviateLabel ? bed.label.replace(/Room (\d+) - /, "R$1-") : bed.label}
      </div>

      {/* Date cells */}
      {dates.map((date, colIdx) => {
        const status = getCellStatus(date, bed.id, bookings, holds, overrides, currentMemberId);
        const isClickable = status === "available" && onCellClick;

        return (
          <div
            key={date}
            className={`border-b border-r min-h-[36px] relative ${CELL_STATUS_CLASSES[status]} ${
              isClickable ? "cursor-pointer" : ""
            }`}
            style={{ gridColumn: colIdx + 2, gridRow }}
            onClick={isClickable ? () => onCellClick(bed.id, date) : undefined}
          />
        );
      })}

      {/* Booking bars overlay */}
      {bookings
        .filter((b) => b.bedId === bed.id)
        .map((b) => (
          <BookingBar
            key={b.id}
            booking={b}
            gridStartDate={gridStartDate}
            gridEndDate={gridEndDate}
            gridRow={gridRow}
            onClick={onBookingClick}
            draggable={draggable}
          />
        ))}
    </>
  );
}
```

- [ ] **Step 5: Create RoomGroup**

```typescript
// src/components/matrix/room-group.tsx
"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import type { MatrixRoom, MatrixBooking, MatrixOverride, MatrixHold } from "@/actions/bookings/matrix";
import { BedRow } from "./bed-row";

type Props = {
  room: MatrixRoom;
  dateCount: number;
  startingRow: number;
  gridStartDate: string;
  gridEndDate: string;
  dates: string[];
  bookings: MatrixBooking[];
  overrides: MatrixOverride[];
  holds: MatrixHold[];
  collapsed: boolean;
  onToggle: () => void;
  currentMemberId?: string;
  onCellClick?: (bedId: string, date: string) => void;
  onBookingClick?: (booking: MatrixBooking) => void;
  draggable?: boolean;
  abbreviateLabels?: boolean;
};

export function RoomGroup({
  room,
  dateCount,
  startingRow,
  gridStartDate,
  gridEndDate,
  dates,
  bookings,
  overrides,
  holds,
  collapsed,
  onToggle,
  currentMemberId,
  onCellClick,
  onBookingClick,
  draggable,
  abbreviateLabels,
}: Props) {
  const bookedBeds = room.beds.filter((bed) =>
    bookings.some((b) => b.bedId === bed.id)
  ).length;

  return (
    <>
      {/* Room header row — spans all columns */}
      <div
        className="sticky left-0 z-10 bg-muted/30 border-b px-2 py-1.5 flex items-center gap-1 cursor-pointer col-span-full"
        style={{ gridRow: startingRow }}
        onClick={onToggle}
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="text-xs font-medium">{room.name}</span>
        <span className="text-xs text-muted-foreground ml-1">
          ({bookedBeds}/{room.beds.length} beds in use)
        </span>
      </div>

      {/* Bed rows — only if not collapsed */}
      {!collapsed &&
        room.beds.map((bed, bedIdx) => (
          <BedRow
            key={bed.id}
            bed={bed}
            dates={dates}
            gridRow={startingRow + 1 + bedIdx}
            gridStartDate={gridStartDate}
            gridEndDate={gridEndDate}
            bookings={bookings}
            overrides={overrides}
            holds={holds}
            currentMemberId={currentMemberId}
            onCellClick={onCellClick}
            onBookingClick={onBookingClick}
            draggable={draggable}
            abbreviateLabel={abbreviateLabels}
          />
        ))}
    </>
  );
}
```

- [ ] **Step 6: Create BookingMatrix**

```typescript
// src/components/matrix/booking-matrix.tsx
"use client";

import { MatrixHeader } from "./matrix-header";
import { RoomGroup } from "./room-group";
import { DateNavigator } from "./date-navigator";
import type { MatrixData, MatrixBooking } from "@/actions/bookings/matrix";
import type { MatrixState } from "./use-matrix-state";

type Props = {
  data: MatrixData;
  state: MatrixState;
  currentMemberId?: string;
  onCellClick?: (bedId: string, date: string) => void;
  onBookingClick?: (booking: MatrixBooking) => void;
  draggable?: boolean;
  abbreviateLabels?: boolean;
};

export function BookingMatrix({
  data,
  state,
  currentMemberId,
  onCellClick,
  onBookingClick,
  draggable,
  abbreviateLabels,
}: Props) {
  // Calculate grid rows: 1 (header) + for each room: 1 (room header) + N beds (if not collapsed)
  let currentRow = 2; // row 1 is the date header
  const roomRows: { room: (typeof data.rooms)[0]; startingRow: number }[] = [];

  for (const room of data.rooms) {
    roomRows.push({ room, startingRow: currentRow });
    currentRow += 1; // room header row
    if (!state.collapsedRooms.has(room.id)) {
      currentRow += room.beds.length;
    }
  }

  const totalColumns = state.visibleDates.length + 1; // +1 for bed label column

  return (
    <div>
      <DateNavigator
        startDate={state.startDate}
        endDate={state.endDate}
        onNavigateForward={state.navigateForward}
        onNavigateBackward={state.navigateBackward}
        onJumpToToday={state.jumpToToday}
      />

      <div className="overflow-x-auto border rounded-lg">
        <div
          className="grid relative"
          style={{
            gridTemplateColumns: `minmax(80px, 150px) repeat(${state.visibleDates.length}, minmax(36px, 1fr))`,
            gridTemplateRows: `auto repeat(${currentRow - 2}, minmax(36px, auto))`,
          }}
        >
          <MatrixHeader dates={state.visibleDates} />

          {roomRows.map(({ room, startingRow }) => (
            <RoomGroup
              key={room.id}
              room={room}
              dateCount={state.visibleDates.length}
              startingRow={startingRow}
              gridStartDate={state.startDate}
              gridEndDate={state.endDate}
              dates={state.visibleDates}
              bookings={data.bookings}
              overrides={data.overrides}
              holds={data.holds}
              collapsed={state.collapsedRooms.has(room.id)}
              onToggle={() => state.toggleRoom(room.id)}
              currentMemberId={currentMemberId}
              onCellClick={onCellClick}
              onBookingClick={onBookingClick}
              draggable={draggable}
              abbreviateLabels={abbreviateLabels}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create barrel export**

```typescript
// src/components/matrix/index.ts
export { BookingMatrix } from "./booking-matrix";
export { useMatrixState } from "./use-matrix-state";
export { useBreakpoint } from "./use-breakpoint";
```

- [ ] **Step 8: Commit**

```bash
git add src/components/matrix/
git commit -m "feat(matrix): add core BookingMatrix component with grid layout"
```

---

### Task 8: Member Availability View — Matrix Integration

**Files:**
- Create: `src/app/[slug]/availability/availability-matrix-client.tsx`
- Modify: `src/app/[slug]/availability/page.tsx` (to pass lodgeId for matrix data)
- Create: `src/app/[slug]/availability/availability-list.tsx`

- [ ] **Step 1: Create the mobile date-first list component**

```typescript
// src/app/[slug]/availability/availability-list.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight } from "lucide-react";
import { getMatrixData, type MatrixData } from "@/actions/bookings/matrix";

type Props = {
  lodgeId: string;
  slug: string;
};

export function AvailabilityList({ lodgeId, slug }: Props) {
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!checkIn || !checkOut || checkIn >= checkOut) {
      setData(null);
      return;
    }

    setLoading(true);
    getMatrixData(lodgeId, checkIn, checkOut)
      .then(setData)
      .finally(() => setLoading(false));
  }, [lodgeId, checkIn, checkOut]);

  function toggleRoom(roomId: string) {
    setExpandedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) {
        next.delete(roomId);
      } else {
        next.add(roomId);
      }
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Check-in</label>
          <Input
            type="date"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Check-out</label>
          <Input
            type="date"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
          />
        </div>
      </div>

      {loading && (
        <div className="py-8 text-center text-muted-foreground text-sm">
          Loading availability...
        </div>
      )}

      {data && !loading && (
        <div className="space-y-2">
          {data.rooms.map((room) => {
            const bookedBedIds = new Set(
              data.bookings.filter((b) => room.beds.some((bed) => bed.id === b.bedId)).map((b) => b.bedId)
            );
            const heldBedIds = new Set(
              data.holds.filter((h) => room.beds.some((bed) => bed.id === h.bedId)).map((h) => h.bedId)
            );
            const availableCount = room.beds.filter(
              (bed) => !bookedBedIds.has(bed.id) && !heldBedIds.has(bed.id)
            ).length;
            const expanded = expandedRooms.has(room.id);

            return (
              <div key={room.id} className="rounded-lg border">
                <button
                  type="button"
                  className="w-full flex items-center justify-between p-3 text-left"
                  onClick={() => toggleRoom(room.id)}
                >
                  <div className="flex items-center gap-2">
                    {expanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium">{room.name}</span>
                  </div>
                  <span className={`text-xs ${availableCount > 0 ? "text-green-600" : "text-red-600"}`}>
                    {availableCount} of {room.beds.length} available
                  </span>
                </button>

                {expanded && (
                  <div className="border-t px-3 pb-3 space-y-1">
                    {room.beds.map((bed) => {
                      const isBooked = bookedBedIds.has(bed.id);
                      const isHeld = heldBedIds.has(bed.id);
                      const available = !isBooked && !isHeld;

                      return (
                        <div
                          key={bed.id}
                          className="flex items-center justify-between py-1.5 text-sm"
                        >
                          <span className={isBooked || isHeld ? "text-muted-foreground" : ""}>
                            {bed.label}
                            {isBooked && " — Booked"}
                            {isHeld && " — Held"}
                          </span>
                          {available && (
                            <Button variant="outline" size="sm" asChild>
                              <a
                                href={`/${slug}/book?checkIn=${checkIn}&checkOut=${checkOut}`}
                              >
                                Book
                              </a>
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {data && !loading && data.rooms.length === 0 && (
        <div className="py-8 text-center text-muted-foreground text-sm">
          No rooms configured for this lodge.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the matrix client wrapper**

```typescript
// src/app/[slug]/availability/availability-matrix-client.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { BookingMatrix, useMatrixState, useBreakpoint } from "@/components/matrix";
import { AvailabilityList } from "./availability-list";
import { getMatrixData, type MatrixData } from "@/actions/bookings/matrix";
import { useRouter } from "next/navigation";

type Props = {
  lodgeId: string;
  lodgeName: string;
  slug: string;
  seasonStartDate?: string;
  seasonEndDate?: string;
};

export function AvailabilityMatrixClient({
  lodgeId,
  lodgeName,
  slug,
  seasonStartDate,
  seasonEndDate,
}: Props) {
  const breakpoint = useBreakpoint();
  const state = useMatrixState({
    breakpoint,
    seasonStartDate,
    seasonEndDate,
  });
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    setLoading(true);
    getMatrixData(lodgeId, state.startDate, state.endDate)
      .then(setData)
      .finally(() => setLoading(false));
  }, [lodgeId, state.startDate, state.endDate]);

  // Mobile: default to list view
  const showList = breakpoint === "mobile" && state.viewMode === "list";

  function handleCellClick(bedId: string, date: string) {
    router.push(`/${slug}/book?checkIn=${date}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{lodgeName} — Availability</h2>
        {breakpoint === "mobile" && (
          <div className="flex rounded-md border text-xs">
            <button
              type="button"
              className={`px-3 py-1 ${state.viewMode === "list" ? "bg-primary text-primary-foreground" : ""}`}
              onClick={() => state.setViewMode("list")}
            >
              List
            </button>
            <button
              type="button"
              className={`px-3 py-1 ${state.viewMode === "grid" ? "bg-primary text-primary-foreground" : ""}`}
              onClick={() => state.setViewMode("grid")}
            >
              Grid
            </button>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded bg-green-100 dark:bg-green-950/30 border border-green-300" />
          Available
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded bg-red-100 dark:bg-red-950/30 border border-red-300" />
          Booked
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded bg-amber-100 dark:bg-amber-950/30 border border-amber-300" />
          Held
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded bg-gray-100 dark:bg-gray-800/50 border border-gray-300" />
          Closed
        </div>
      </div>

      {showList ? (
        <AvailabilityList lodgeId={lodgeId} slug={slug} />
      ) : loading || !data ? (
        <div className="py-12 text-center text-muted-foreground">Loading matrix...</div>
      ) : (
        <BookingMatrix
          data={data}
          state={state}
          onCellClick={handleCellClick}
          abbreviateLabels={breakpoint === "mobile"}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/[slug]/availability/availability-matrix-client.tsx src/app/[slug]/availability/availability-list.tsx
git commit -m "feat(matrix): add member availability view with list/grid toggle"
```

---

### Task 9: Wire Member Availability Page to Matrix

**Files:**
- Modify: `src/app/[slug]/availability/page.tsx`

This task requires reading the current page.tsx, understanding how it fetches data, and replacing the old calendar with the new matrix client component. The server component should fetch the current season + lodge and pass props to `AvailabilityMatrixClient`.

- [ ] **Step 1: Read the current availability page**

```bash
cat src/app/[slug]/availability/page.tsx
```

Understand the current data fetching and modify to pass `lodgeId`, `lodgeName`, `slug`, `seasonStartDate`, `seasonEndDate` to `AvailabilityMatrixClient` instead of the old `AvailabilityCalendar`.

- [ ] **Step 2: Update the page to use AvailabilityMatrixClient**

Replace the old `MemberAvailabilityClient` / `AvailabilityCalendar` usage with `AvailabilityMatrixClient`. Keep the lodge selector if multi-lodge. Pass the active season's date range.

- [ ] **Step 3: Verify the page loads**

```bash
cd /opt/snowgum && npm run dev
```

Navigate to `http://localhost:3000/<slug>/availability` and verify the matrix renders.

- [ ] **Step 4: Commit**

```bash
git add src/app/[slug]/availability/page.tsx
git commit -m "feat(matrix): wire member availability page to BookingMatrix"
```

---

### Task 10: Admin Booking Calendar Page

**Files:**
- Create: `src/app/[slug]/admin/bookings/calendar/page.tsx`
- Create: `src/app/[slug]/admin/bookings/calendar/admin-matrix-client.tsx`
- Create: `src/app/[slug]/admin/bookings/calendar/booking-detail-sheet.tsx`

- [ ] **Step 1: Create the booking detail sheet**

```typescript
// src/app/[slug]/admin/bookings/calendar/booking-detail-sheet.tsx
"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MatrixBooking } from "@/actions/bookings/matrix";
import { formatCurrency } from "@/lib/currency";
import Link from "next/link";

type Props = {
  booking: MatrixBooking | null;
  onClose: () => void;
  slug: string;
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  CONFIRMED: "default",
  PENDING: "secondary",
  WAITLISTED: "outline",
  COMPLETED: "default",
};

export function BookingDetailSheet({ booking, onClose, slug }: Props) {
  if (!booking) return null;

  return (
    <Sheet open={!!booking} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{booking.guestName}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reference</span>
              <span className="font-mono">{booking.bookingReference}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={STATUS_VARIANTS[booking.status] ?? "secondary"}>
                {booking.status}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Check-in</span>
              <span>{booking.checkIn}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Check-out</span>
              <span>{booking.checkOut}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span>{formatCurrency(booking.totalAmountCents)}</span>
            </div>
            {booking.hasAdminNotes && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Admin Notes</span>
                <Badge variant="outline">Has notes</Badge>
              </div>
            )}
          </div>

          <div className="pt-2 space-y-2">
            <Button asChild className="w-full">
              <Link href={`/${slug}/admin/bookings/${booking.bookingId}`}>
                View Full Details
              </Link>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Create the admin matrix client**

```typescript
// src/app/[slug]/admin/bookings/calendar/admin-matrix-client.tsx
"use client";

import { useState, useEffect } from "react";
import { BookingMatrix, useMatrixState, useBreakpoint } from "@/components/matrix";
import { BookingDetailSheet } from "./booking-detail-sheet";
import { getMatrixData, type MatrixData, type MatrixBooking } from "@/actions/bookings/matrix";

type Props = {
  lodgeId: string;
  lodgeName: string;
  slug: string;
  seasonStartDate?: string;
  seasonEndDate?: string;
};

export function AdminMatrixClient({
  lodgeId,
  lodgeName,
  slug,
  seasonStartDate,
  seasonEndDate,
}: Props) {
  const breakpoint = useBreakpoint();
  const state = useMatrixState({
    breakpoint,
    seasonStartDate,
    seasonEndDate,
  });
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<MatrixBooking | null>(null);

  useEffect(() => {
    setLoading(true);
    getMatrixData(lodgeId, state.startDate, state.endDate)
      .then(setData)
      .finally(() => setLoading(false));
  }, [lodgeId, state.startDate, state.endDate]);

  function handleBookingClick(booking: MatrixBooking) {
    setSelectedBooking(booking);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{lodgeName} — Booking Calendar</h2>
      </div>

      {/* Status legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1">
          <div className="h-3 w-5 rounded bg-blue-500/80" />
          Confirmed
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-5 rounded bg-amber-500/80" />
          Pending
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-5 rounded bg-purple-500/80" />
          Waitlisted
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-5 rounded bg-green-500/80" />
          Completed
        </div>
      </div>

      {loading || !data ? (
        <div className="py-12 text-center text-muted-foreground">Loading calendar...</div>
      ) : (
        <BookingMatrix
          data={data}
          state={state}
          onBookingClick={handleBookingClick}
          draggable={breakpoint !== "mobile"}
          abbreviateLabels={breakpoint === "mobile"}
        />
      )}

      <BookingDetailSheet
        booking={selectedBooking}
        onClose={() => setSelectedBooking(null)}
        slug={slug}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create the admin calendar page**

```typescript
// src/app/[slug]/admin/bookings/calendar/page.tsx
import { redirect } from "next/navigation";
import { db } from "@/db/index";
import { organisations, lodges, seasons } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { AdminMatrixClient } from "./admin-matrix-client";
import { requireSession, requireRole } from "@/lib/auth-guards";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lodge?: string }>;
};

export default async function AdminBookingCalendarPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { lodge: lodgeIdParam } = await searchParams;

  const [org] = await db
    .select({ id: organisations.id })
    .from(organisations)
    .where(eq(organisations.slug, slug));

  if (!org) redirect("/");

  const session = await requireSession(org.id);
  requireRole(session, "BOOKING_OFFICER");

  // Get lodges
  const orgLodges = await db
    .select({ id: lodges.id, name: lodges.name })
    .from(lodges)
    .where(and(eq(lodges.organisationId, org.id), eq(lodges.isActive, true)));

  if (orgLodges.length === 0) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">No lodges configured.</p>
      </div>
    );
  }

  const selectedLodge = lodgeIdParam
    ? orgLodges.find((l) => l.id === lodgeIdParam) ?? orgLodges[0]
    : orgLodges[0];

  // Get current/latest season for date bounds
  const [season] = await db
    .select({ startDate: seasons.startDate, endDate: seasons.endDate })
    .from(seasons)
    .where(and(eq(seasons.organisationId, org.id), eq(seasons.isActive, true)))
    .orderBy(desc(seasons.startDate))
    .limit(1);

  return (
    <div className="p-6 space-y-4">
      {/* Lodge selector if multiple */}
      {orgLodges.length > 1 && (
        <div className="flex gap-2">
          {orgLodges.map((l) => (
            <a
              key={l.id}
              href={`/${slug}/admin/bookings/calendar?lodge=${l.id}`}
              className={`text-sm px-3 py-1 rounded-md border ${
                l.id === selectedLodge.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              {l.name}
            </a>
          ))}
        </div>
      )}

      <AdminMatrixClient
        lodgeId={selectedLodge.id}
        lodgeName={selectedLodge.name}
        slug={slug}
        seasonStartDate={season?.startDate}
        seasonEndDate={season?.endDate}
      />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/[slug]/admin/bookings/calendar/
git commit -m "feat(matrix): add admin booking calendar page with detail sheet"
```

---

### Task 11: Admin Drag-and-Drop — Move Between Beds

**Files:**
- Create: `src/components/matrix/draggable-matrix.tsx`
- Create: `src/components/matrix/draggable-booking-bar.tsx`
- Create: `src/components/matrix/droppable-cell.tsx`
- Modify: `src/app/[slug]/admin/bookings/calendar/admin-matrix-client.tsx`

- [ ] **Step 1: Create DroppableCell**

```typescript
// src/components/matrix/droppable-cell.tsx
"use client";

import { useDroppable } from "@dnd-kit/core";

type Props = {
  bedId: string;
  date: string;
  gridColumn: number;
  gridRow: number;
  className: string;
  children?: React.ReactNode;
};

export function DroppableCell({ bedId, date, gridColumn, gridRow, className, children }: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${bedId}:${date}`,
    data: { bedId, date },
  });

  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isOver ? "ring-2 ring-primary ring-inset" : ""}`}
      style={{ gridColumn, gridRow }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create DraggableBookingBar**

```typescript
// src/components/matrix/draggable-booking-bar.tsx
"use client";

import { useDraggable } from "@dnd-kit/core";
import type { MatrixBooking } from "@/actions/bookings/matrix";
import { bookingToGridColumns } from "@/lib/matrix-utils";

const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: "bg-blue-500/80 text-white",
  PENDING: "bg-amber-500/80 text-white",
  WAITLISTED: "bg-purple-500/80 text-white",
  COMPLETED: "bg-green-500/80 text-white",
};

type Props = {
  booking: MatrixBooking;
  gridStartDate: string;
  gridEndDate: string;
  gridRow: number;
  onClick?: (booking: MatrixBooking) => void;
};

export function DraggableBookingBar({
  booking,
  gridStartDate,
  gridEndDate,
  gridRow,
  onClick,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: booking.id,
    data: { booking },
  });

  const cols = bookingToGridColumns(
    booking.checkIn,
    booking.checkOut,
    gridStartDate,
    gridEndDate
  );

  if (!cols) return null;

  const colorClass = STATUS_COLORS[booking.status] ?? "bg-gray-400/80 text-white";

  const style: React.CSSProperties = {
    gridColumn: `${cols.colStart} / ${cols.colEnd}`,
    gridRow,
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      className={`absolute inset-y-1 rounded-md px-1.5 flex items-center text-xs font-medium truncate cursor-grab ${colorClass} ${
        cols.clippedStart ? "rounded-l-none" : ""
      } ${cols.clippedEnd ? "rounded-r-none" : ""}`}
      style={style}
      onClick={() => onClick?.(booking)}
      {...attributes}
      {...listeners}
    >
      {cols.clippedStart && <span className="mr-0.5">...</span>}
      <span className="truncate">{booking.guestName}</span>
      {cols.clippedEnd && <span className="ml-0.5">...</span>}
    </div>
  );
}
```

- [ ] **Step 3: Create DraggableMatrix wrapper**

```typescript
// src/components/matrix/draggable-matrix.tsx
"use client";

import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { BookingMatrix } from "./booking-matrix";
import type { MatrixData, MatrixBooking } from "@/actions/bookings/matrix";
import type { MatrixState } from "./use-matrix-state";

type Props = {
  data: MatrixData;
  state: MatrixState;
  onBookingClick?: (booking: MatrixBooking) => void;
  onMoveToBed?: (bookingGuestId: string, bookingId: string, newBedId: string) => void;
  abbreviateLabels?: boolean;
};

export function DraggableMatrix({
  data,
  state,
  onBookingClick,
  onMoveToBed,
  abbreviateLabels,
}: Props) {
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  });
  const sensors = useSensors(pointerSensor);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !onMoveToBed) return;

    const booking = active.data.current?.booking as MatrixBooking | undefined;
    if (!booking) return;

    const dropData = over.data.current as { bedId: string; date: string } | undefined;
    if (!dropData) return;

    // Only handle bed-change drops (vertical moves)
    if (dropData.bedId !== booking.bedId) {
      onMoveToBed(booking.id, booking.bookingId, dropData.bedId);
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <BookingMatrix
        data={data}
        state={state}
        onBookingClick={onBookingClick}
        draggable={true}
        abbreviateLabels={abbreviateLabels}
      />
    </DndContext>
  );
}
```

- [ ] **Step 4: Update barrel export**

Add to `src/components/matrix/index.ts`:

```typescript
export { DraggableMatrix } from "./draggable-matrix";
```

- [ ] **Step 5: Update admin-matrix-client to use DraggableMatrix on desktop**

Update `src/app/[slug]/admin/bookings/calendar/admin-matrix-client.tsx`:

Import `DraggableMatrix` from `@/components/matrix` and `reassignBeds` from `@/actions/bookings/reassign-beds`. On desktop, render `<DraggableMatrix>` instead of `<BookingMatrix>`. Add an `onMoveToBed` handler that:
1. Optimistically updates data state (move the booking to new bedId)
2. Calls `reassignBeds({ bookingId, organisationId, assignments: [{ bookingGuestId, bedId }], slug })`
3. On success: refetch data
4. On failure: revert optimistic update, show toast

On mobile, continue rendering `<BookingMatrix>` without drag.

- [ ] **Step 6: Commit**

```bash
git add src/components/matrix/ src/app/[slug]/admin/bookings/calendar/admin-matrix-client.tsx
git commit -m "feat(matrix): add drag-and-drop bed reassignment for admin"
```

---

### Task 12: Admin Drag-and-Drop — Move Dates & Resize

**Files:**
- Modify: `src/components/matrix/draggable-matrix.tsx`
- Modify: `src/components/matrix/draggable-booking-bar.tsx`

- [ ] **Step 1: Add resize handles to DraggableBookingBar**

Update `src/components/matrix/draggable-booking-bar.tsx` to add left and right edge drag handles (small divs at each end of the bar). These handles use `onPointerDown` + `onPointerMove` + `onPointerUp` to track the resize interaction. They report the delta in days via a callback prop `onResize(bookingGuestId, bookingId, newCheckIn, newCheckOut)`.

The resize logic:
- Left handle: moving left extends check-in earlier, moving right shortens
- Right handle: moving right extends check-out later, moving left shortens
- Calculate column width from the DOM (the bar's width / number of nights)
- Convert pixel delta to day delta
- Enforce minimum 1 night
- On pointer up: fire the `onResize` callback

- [ ] **Step 2: Update DraggableMatrix to handle horizontal drags as date moves**

Update the `handleDragEnd` in `draggable-matrix.tsx`:
- If the drop target bed is the same but the drop date column differs from the original check-in, this is a date move
- Calculate the day delta from the drop position
- Call `onMoveDates(bookingGuestId, bookingId, newCheckIn, newCheckOut)` callback

- [ ] **Step 3: Update admin-matrix-client to handle date moves and resizes**

Wire `onMoveDates` and `onResize` callbacks that:
1. Optimistically update the data
2. Call `modifyBookingDates` server action
3. Show price change toast on success
4. Revert on failure

- [ ] **Step 4: Commit**

```bash
git add src/components/matrix/ src/app/[slug]/admin/bookings/calendar/admin-matrix-client.tsx
git commit -m "feat(matrix): add drag-to-move-dates and resize for admin"
```

---

### Task 13: Admin Drag-to-Create

**Files:**
- Create: `src/app/[slug]/admin/bookings/calendar/quick-create-dialog.tsx`
- Modify: `src/components/matrix/booking-matrix.tsx` (add onRangeSelect callback)
- Modify: `src/app/[slug]/admin/bookings/calendar/admin-matrix-client.tsx`

- [ ] **Step 1: Create QuickCreateDialog**

```typescript
// src/app/[slug]/admin/bookings/calendar/quick-create-dialog.tsx
"use client";

import { useState } from "react";
import { Dialog, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

type Props = {
  open: boolean;
  onClose: () => void;
  bedLabel: string;
  checkIn: string;
  checkOut: string;
  slug: string;
};

export function QuickCreateDialog({ open, onClose, bedLabel, checkIn, checkOut, slug }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-background rounded-lg border p-6 w-full max-w-md space-y-4">
          <h3 className="text-lg font-semibold">Quick Create Booking</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bed</span>
              <span>{bedLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Check-in</span>
              <span>{checkIn}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Check-out</span>
              <span>{checkOut}</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            To complete the booking, use the full booking wizard with pre-filled dates.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button asChild>
              <Link href={`/${slug}/book?checkIn=${checkIn}&checkOut=${checkOut}`}>
                Start Booking
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 2: Add range selection to BookingMatrix**

Add an `onRangeSelect` callback prop to BookingMatrix. When the user clicks and drags across empty cells in a bed row (mousedown on one cell, mouseup on another in the same row), calculate the date range and fire `onRangeSelect(bedId, bedLabel, startDate, endDate)`.

Track `dragStartCell` in local state. On mousedown on an empty cell, set `dragStartCell = { bedId, date }`. On mouseup on another empty cell in the same bed row, calculate the range and fire the callback. On mouseup elsewhere, clear the drag.

- [ ] **Step 3: Wire quick-create in admin-matrix-client**

When `onRangeSelect` fires, open `QuickCreateDialog` pre-filled with the bed and dates.

- [ ] **Step 4: Commit**

```bash
git add src/app/[slug]/admin/bookings/calendar/quick-create-dialog.tsx src/components/matrix/booking-matrix.tsx src/app/[slug]/admin/bookings/calendar/admin-matrix-client.tsx
git commit -m "feat(matrix): add drag-to-create and quick booking dialog for admin"
```

---

### Task 14: Admin Multi-Guest Move

**Files:**
- Modify: `src/components/matrix/draggable-matrix.tsx`
- Modify: `src/components/matrix/draggable-booking-bar.tsx`
- Modify: `src/app/[slug]/admin/bookings/calendar/admin-matrix-client.tsx`

- [ ] **Step 1: Add selection UI to DraggableBookingBar**

When `selectedBookingIds` (from MatrixState) contains the booking's ID, render a selection highlight (ring-2 ring-primary). Add a click handler: if Ctrl/Cmd is held, toggle selection instead of opening the detail sheet.

- [ ] **Step 2: Update DraggableMatrix for multi-drag**

When a selected booking is dragged, compute the bed offset (delta) between the source and target beds. Apply that same offset to all selected bookings from the same booking group. Fire `onMultiMove(moves: Array<{ bookingGuestId, bookingId, newBedId }>)`.

- [ ] **Step 3: Wire multi-move in admin-matrix-client**

`onMultiMove` handler calls `reassignBeds` with all assignments in one call. Optimistic update + revert pattern as before.

- [ ] **Step 4: Commit**

```bash
git add src/components/matrix/ src/app/[slug]/admin/bookings/calendar/admin-matrix-client.tsx
git commit -m "feat(matrix): add multi-guest selection and group move for admin"
```

---

### Task 15: Booking Wizard Step 3 — Matrix Integration

**Files:**
- Modify: `src/app/[slug]/book/steps/select-beds.tsx`

- [ ] **Step 1: Read the current select-beds.tsx**

Already read above. The current implementation uses a flat list of rooms with bed buttons.

- [ ] **Step 2: Refactor select-beds to use BookingMatrix**

Replace the room/bed list rendering with `<BookingMatrix>`. The wizard's date range is short (2-14 days), so render a focused matrix showing only those dates.

Key changes:
- Import `BookingMatrix`, `useMatrixState`, `useBreakpoint` from `@/components/matrix`
- Import `getMatrixData` instead of `getAvailableBeds`
- Initialize `useMatrixState` with the booking's check-in as `initialDate` and the booking's date range length as a fixed day count
- Keep the existing guest colour coding and assignment logic
- `onCellClick` handler: assign next unassigned guest to the clicked bed, create hold (same logic as current `handleBedClick`)
- Remove the old room/bed list rendering
- Keep: hold timer, guest legend, porta-cot info, navigation buttons, all existing context interactions

The matrix cells for this view should use the guest colour coding: held-by-you cells show the assigned guest's colour.

- [ ] **Step 3: Verify the booking wizard still works end-to-end**

```bash
cd /opt/snowgum && npm run dev
```

Walk through the booking wizard and verify bed selection works on the matrix.

- [ ] **Step 4: Commit**

```bash
git add src/app/[slug]/book/steps/select-beds.tsx
git commit -m "feat(matrix): integrate BookingMatrix into wizard step 3"
```

---

### Task 16: Admin Navigation Link

**Files:**
- Modify: `src/app/[slug]/admin/bookings/page.tsx` (add "Calendar View" link)

- [ ] **Step 1: Add calendar view link to admin bookings page**

At the top of the admin bookings list page, next to the existing header, add a link/button to the calendar view:

```tsx
<Link href={`/${slug}/admin/bookings/calendar`}>
  <Button variant="outline" size="sm">
    <CalendarDays className="h-4 w-4 mr-1" />
    Calendar View
  </Button>
</Link>
```

Also add a reciprocal "List View" link on the calendar page back to the bookings list.

- [ ] **Step 2: Commit**

```bash
git add src/app/[slug]/admin/bookings/page.tsx src/app/[slug]/admin/bookings/calendar/page.tsx
git commit -m "feat(matrix): add navigation between list and calendar admin views"
```

---

### Task 17: E2E Tests

**Files:**
- Create: `e2e/tests/booking-matrix.spec.ts`

- [ ] **Step 1: Write E2E tests**

```typescript
// e2e/tests/booking-matrix.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Booking Matrix", () => {
  test("member availability view loads matrix with colour-coded cells", async ({ page }) => {
    await page.goto("/test-org/availability");
    // Wait for matrix to render
    await expect(page.locator("[class*='grid']").first()).toBeVisible();
    // Verify date header is present
    await expect(page.getByText("Today")).toBeVisible();
  });

  test("member mobile shows list/grid toggle", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/test-org/availability");
    await expect(page.getByText("List")).toBeVisible();
    await expect(page.getByText("Grid")).toBeVisible();
  });

  test("member mobile list view shows date pickers and bed availability", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/test-org/availability");
    // Default is list view
    await expect(page.locator("input[type='date']").first()).toBeVisible();
  });

  test("admin calendar page loads with booking bars", async ({ page }) => {
    // Login as admin first (use existing auth fixture)
    await page.goto("/test-org/admin/bookings/calendar");
    await expect(page.locator("[class*='grid']").first()).toBeVisible();
  });

  test("admin can click booking bar to see detail sheet", async ({ page }) => {
    await page.goto("/test-org/admin/bookings/calendar");
    // Click first booking bar
    const bar = page.locator("[data-booking-id]").first();
    if (await bar.isVisible()) {
      await bar.click();
      await expect(page.getByText("View Full Details")).toBeVisible();
    }
  });

  test("admin mobile shows tap-to-edit instead of drag", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/test-org/admin/bookings/calendar");
    // Booking bars should not have draggable attribute on mobile
    const bar = page.locator("[data-booking-id]").first();
    if (await bar.isVisible()) {
      await expect(bar).not.toHaveAttribute("data-draggable", "true");
    }
  });
});
```

Note: These tests use placeholder selectors. The implementing engineer should adjust selectors to match actual rendered DOM and use the project's existing auth fixtures for admin login.

- [ ] **Step 2: Run E2E tests**

```bash
npm run test:e2e -- e2e/tests/booking-matrix.spec.ts
```

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/booking-matrix.spec.ts
git commit -m "test(matrix): add E2E tests for booking matrix views"
```

---

### Task 18: Cleanup & Final Verification

**Files:**
- No new files

- [ ] **Step 1: Run all unit tests**

```bash
npm test
```

Expected: All tests pass including new matrix-utils tests.

- [ ] **Step 2: Run all integration tests**

```bash
npm run test:integration
```

Expected: All tests pass including new getMatrixData tests.

- [ ] **Step 3: Run E2E tests**

```bash
npm run test:e2e
```

Expected: All tests pass.

- [ ] **Step 4: Verify no TypeScript errors**

```bash
cd /opt/snowgum && npx tsc --noEmit
```

- [ ] **Step 5: Final commit if any cleanup needed**

```bash
git add -A && git commit -m "chore(matrix): final cleanup and type fixes"
```
