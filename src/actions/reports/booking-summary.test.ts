import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  bookings: {
    id: "id",
    organisationId: "organisation_id",
    lodgeId: "lodge_id",
    primaryMemberId: "primary_member_id",
    status: "status",
    checkInDate: "check_in_date",
    checkOutDate: "check_out_date",
    totalNights: "total_nights",
    totalAmountCents: "total_amount_cents",
    bookingReference: "booking_reference",
    createdAt: "created_at",
  },
  members: {
    id: "id",
    firstName: "first_name",
    lastName: "last_name",
  },
  lodges: {
    id: "id",
    name: "name",
  },
  bookingGuests: {
    bookingId: "booking_id",
    id: "id",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  gte: vi.fn((a: unknown, b: unknown) => ({ gte: [a, b] })),
  lte: vi.fn((a: unknown, b: unknown) => ({ lte: [a, b] })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({ inArray: [col, vals] })),
  sql: vi.fn(),
  count: vi.fn(),
  desc: vi.fn((col: unknown) => ({ desc: col })),
}));

// Build a select chain for the main bookings query
function makeMainSelectChain(rows: unknown[]) {
  return {
    from: () => ({
      leftJoin: () => ({
        leftJoin: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => ({
                offset: () => rows,
              }),
            }),
          }),
        }),
      }),
    }),
  };
}

// Build a select chain for the count query
function makeCountSelectChain(count: number) {
  return {
    from: () => ({
      leftJoin: () => ({
        leftJoin: () => ({
          where: () => [{ count }],
        }),
      }),
    }),
  };
}

// Build a select chain for the guest count query
function makeGuestCountSelectChain(rows: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        groupBy: () => rows,
      }),
    }),
  };
}

let selectQueue: Array<ReturnType<typeof makeMainSelectChain> | ReturnType<typeof makeCountSelectChain> | ReturnType<typeof makeGuestCountSelectChain>> = [];

import { getBookingSummary } from "./booking-summary";

describe("getBookingSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectQueue = [];
    mockSelect.mockImplementation(() => selectQueue.shift());
  });

  it("returns empty rows and zero total when no bookings exist", async () => {
    selectQueue = [
      makeMainSelectChain([]),
      makeCountSelectChain(0),
      makeGuestCountSelectChain([]),
    ];

    const result = await getBookingSummary({ organisationId: "org-123" });

    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.totalAmountCents).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
  });

  it("calls db.select when fetching booking summary", async () => {
    selectQueue = [
      makeMainSelectChain([]),
      makeCountSelectChain(0),
      makeGuestCountSelectChain([]),
    ];

    await getBookingSummary({ organisationId: "org-123" });

    expect(mockSelect).toHaveBeenCalled();
  });

  it("maps booking rows to BookingSummaryRow shape", async () => {
    const dbRow = {
      bookingReference: "BSKI-2027-0001",
      memberFirstName: "Alice",
      memberLastName: "Smith",
      lodgeName: "Mount Buller Lodge",
      checkInDate: "2027-07-10",
      checkOutDate: "2027-07-17",
      totalNights: 7,
      totalAmountCents: 140000,
      status: "CONFIRMED",
      bookingId: "booking-uuid-1",
    };

    selectQueue = [
      makeMainSelectChain([dbRow]),
      makeCountSelectChain(1),
      makeGuestCountSelectChain([{ bookingId: "booking-uuid-1", guestCount: 3 }]),
    ];

    const result = await getBookingSummary({ organisationId: "org-123" });

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.bookingReference).toBe("BSKI-2027-0001");
    expect(row.memberFirstName).toBe("Alice");
    expect(row.memberLastName).toBe("Smith");
    expect(row.lodgeName).toBe("Mount Buller Lodge");
    expect(row.checkInDate).toBe("2027-07-10");
    expect(row.checkOutDate).toBe("2027-07-17");
    expect(row.totalNights).toBe(7);
    expect(row.guestCount).toBe(3);
    expect(row.totalAmountCents).toBe(140000);
    expect(row.status).toBe("CONFIRMED");
    expect(result.total).toBe(1);
    expect(result.totalAmountCents).toBe(140000);
  });

  it("defaults guestCount to 0 when no guests found for a booking", async () => {
    const dbRow = {
      bookingReference: "BSKI-2027-0002",
      memberFirstName: "Bob",
      memberLastName: "Jones",
      lodgeName: "Falls Creek Lodge",
      checkInDate: "2027-08-01",
      checkOutDate: "2027-08-05",
      totalNights: 4,
      totalAmountCents: 80000,
      status: "PENDING",
      bookingId: "booking-uuid-2",
    };

    selectQueue = [
      makeMainSelectChain([dbRow]),
      makeCountSelectChain(1),
      makeGuestCountSelectChain([]), // no guests
    ];

    const result = await getBookingSummary({ organisationId: "org-123" });

    expect(result.rows[0].guestCount).toBe(0);
  });

  it("respects page parameter", async () => {
    selectQueue = [
      makeMainSelectChain([]),
      makeCountSelectChain(0),
      makeGuestCountSelectChain([]),
    ];

    const result = await getBookingSummary({
      organisationId: "org-123",
      page: 3,
    });

    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(50);
  });

  it("sums totalAmountCents across all rows", async () => {
    const rows = [
      {
        bookingReference: "BSKI-2027-0001",
        memberFirstName: "Alice",
        memberLastName: "Smith",
        lodgeName: "Lodge A",
        checkInDate: "2027-07-01",
        checkOutDate: "2027-07-08",
        totalNights: 7,
        totalAmountCents: 70000,
        status: "CONFIRMED",
        bookingId: "b1",
      },
      {
        bookingReference: "BSKI-2027-0002",
        memberFirstName: "Bob",
        memberLastName: "Jones",
        lodgeName: "Lodge B",
        checkInDate: "2027-08-01",
        checkOutDate: "2027-08-04",
        totalNights: 3,
        totalAmountCents: 30000,
        status: "CONFIRMED",
        bookingId: "b2",
      },
    ];

    selectQueue = [
      makeMainSelectChain(rows),
      makeCountSelectChain(2),
      makeGuestCountSelectChain([]),
    ];

    const result = await getBookingSummary({ organisationId: "org-123" });

    expect(result.totalAmountCents).toBe(100000);
  });
});
