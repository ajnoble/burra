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
    bookingReference: "booking_reference",
  },
  bookingGuests: {
    id: "id",
    bookingId: "booking_id",
    memberId: "member_id",
  },
  members: {
    id: "id",
    firstName: "first_name",
    lastName: "last_name",
  },
  lodges: {
    id: "id",
    name: "name",
    totalBeds: "total_beds",
  },
  availabilityCache: {
    id: "id",
    lodgeId: "lodge_id",
    date: "date",
    totalBeds: "total_beds",
    bookedBeds: "booked_beds",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  inArray: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("date-fns", () => ({
  format: vi.fn((date: Date, fmt: string) => {
    // Simple stub: return ISO date string portions
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    if (fmt === "yyyy-MM-dd") return `${yyyy}-${mm}-${dd}`;
    return `${yyyy}-${mm}-${dd}`;
  }),
  addDays: vi.fn((date: Date, days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }),
}));

// Helper: build a select chain that resolves to the given rows
function makeSelectChain(rows: unknown[]) {
  return {
    from: () => ({
      where: () => rows,
      innerJoin: () => ({
        innerJoin: () => ({
          where: () => ({
            orderBy: () => rows,
          }),
        }),
      }),
    }),
  };
}

// Queued return values for each mockSelect call
let selectQueue: unknown[][] = [];

import { getBookingOfficerStats } from "./booking-officer-stats";

describe("getBookingOfficerStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectQueue = [];
    mockSelect.mockImplementation(() =>
      makeSelectChain(selectQueue.shift() ?? [])
    );
  });

  it("returns zeroed stats when no data exists", async () => {
    // 6 queries: arrivalsToday, departuresToday, pendingApprovals,
    //            currentOccupancy, upcomingArrivals, occupancyForecast
    selectQueue = [
      // arrivalsToday count
      [{ count: 0 }],
      // departuresToday count
      [{ count: 0 }],
      // pendingApprovals count
      [{ count: 0 }],
      // currentOccupancy aggregate
      [{ totalBeds: 0, bookedBeds: 0 }],
      // upcomingArrivals rows
      [],
      // occupancyForecast rows
      [],
    ];

    const result = await getBookingOfficerStats({
      organisationId: "org-123",
      today: "2026-04-07",
    });

    expect(result.arrivalsToday).toBe(0);
    expect(result.departuresToday).toBe(0);
    expect(result.currentOccupancyPercent).toBe(0);
    expect(result.pendingApprovals).toBe(0);
    expect(result.upcomingArrivals).toEqual([]);
    expect(result.occupancyForecast).toEqual([]);
  });

  it("calls db.select for all required queries", async () => {
    selectQueue = [
      [{ count: 3 }],
      [{ count: 2 }],
      [{ count: 5 }],
      [{ totalBeds: 20, bookedBeds: 10 }],
      [],
      [],
    ];

    await getBookingOfficerStats({
      organisationId: "org-123",
      today: "2026-04-07",
    });

    // 6 queries total
    expect(mockSelect).toHaveBeenCalledTimes(6);
  });

  it("computes currentOccupancyPercent from aggregated availability data", async () => {
    selectQueue = [
      [{ count: 0 }],
      [{ count: 0 }],
      [{ count: 0 }],
      // 40 out of 80 beds booked = 50%
      [{ totalBeds: 80, bookedBeds: 40 }],
      [],
      [],
    ];

    const result = await getBookingOfficerStats({
      organisationId: "org-123",
      today: "2026-04-07",
    });

    expect(result.currentOccupancyPercent).toBe(50);
  });

  it("returns 0 occupancyPercent when totalBeds is zero", async () => {
    selectQueue = [
      [{ count: 0 }],
      [{ count: 0 }],
      [{ count: 0 }],
      [{ totalBeds: 0, bookedBeds: 0 }],
      [],
      [],
    ];

    const result = await getBookingOfficerStats({
      organisationId: "org-123",
      today: "2026-04-07",
    });

    expect(result.currentOccupancyPercent).toBe(0);
  });

  it("maps upcoming arrivals rows to UpcomingArrival shape", async () => {
    selectQueue = [
      [{ count: 1 }],
      [{ count: 0 }],
      [{ count: 0 }],
      [{ totalBeds: 20, bookedBeds: 5 }],
      // upcoming arrivals: joined rows
      [
        {
          bookingReference: "BSKI-2026-0001",
          memberFirstName: "Alice",
          memberLastName: "Smith",
          checkInDate: "2026-04-08",
          checkOutDate: "2026-04-12",
          guestCount: 3,
          lodgeName: "Mt Hotham Lodge",
        },
      ],
      [],
    ];

    const result = await getBookingOfficerStats({
      organisationId: "org-123",
      today: "2026-04-07",
    });

    expect(result.upcomingArrivals).toHaveLength(1);
    const arrival = result.upcomingArrivals[0];
    expect(arrival.bookingReference).toBe("BSKI-2026-0001");
    expect(arrival.memberFirstName).toBe("Alice");
    expect(arrival.memberLastName).toBe("Smith");
    expect(arrival.checkInDate).toBe("2026-04-08");
    expect(arrival.checkOutDate).toBe("2026-04-12");
    expect(arrival.guestCount).toBe(3);
    expect(arrival.lodgeName).toBe("Mt Hotham Lodge");
  });

  it("maps occupancy forecast rows to OccupancyDay shape with computed percent", async () => {
    selectQueue = [
      [{ count: 0 }],
      [{ count: 0 }],
      [{ count: 0 }],
      [{ totalBeds: 20, bookedBeds: 10 }],
      [],
      // occupancy forecast rows from availabilityCache
      [
        { date: "2026-04-08", totalBeds: 40, bookedBeds: 20 },
        { date: "2026-04-09", totalBeds: 40, bookedBeds: 0 },
      ],
    ];

    const result = await getBookingOfficerStats({
      organisationId: "org-123",
      today: "2026-04-07",
    });

    expect(result.occupancyForecast).toHaveLength(2);

    const day1 = result.occupancyForecast[0];
    expect(day1.date).toBe("2026-04-08");
    expect(day1.totalBeds).toBe(40);
    expect(day1.bookedBeds).toBe(20);
    expect(day1.occupancyPercent).toBe(50);

    const day2 = result.occupancyForecast[1];
    expect(day2.date).toBe("2026-04-09");
    expect(day2.occupancyPercent).toBe(0);
  });

  it("counts arrivals and departures from query results", async () => {
    selectQueue = [
      [{ count: 7 }],
      [{ count: 4 }],
      [{ count: 2 }],
      [{ totalBeds: 30, bookedBeds: 15 }],
      [],
      [],
    ];

    const result = await getBookingOfficerStats({
      organisationId: "org-123",
      today: "2026-04-07",
    });

    expect(result.arrivalsToday).toBe(7);
    expect(result.departuresToday).toBe(4);
    expect(result.pendingApprovals).toBe(2);
  });
});
