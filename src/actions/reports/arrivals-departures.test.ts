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
    balancePaidAt: "balance_paid_at",
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
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  or: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  between: vi.fn(),
  sql: vi.fn(),
}));

// Build a select chain that resolves to the given rows
function makeSelectChain(rows: unknown[]) {
  const chain: Record<string, (...args: unknown[]) => unknown> = {
    from: () => ({
      innerJoin: function () {
        return {
          innerJoin: function () {
            return {
              where: () => rows,
            };
          },
          where: () => rows,
        };
      },
      where: () => rows,
    }),
  };
  return chain;
}

import { getArrivalsAndDepartures } from "./arrivals-departures";

describe("getArrivalsAndDepartures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty rows and zero total when no bookings found", async () => {
    mockSelect.mockImplementation(() => makeSelectChain([]));

    const result = await getArrivalsAndDepartures({
      organisationId: "org-123",
      dateFrom: "2025-07-01",
      dateTo: "2025-07-31",
    });

    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
  });

  it("calls db.select for the query", async () => {
    mockSelect.mockImplementation(() => makeSelectChain([]));

    await getArrivalsAndDepartures({
      organisationId: "org-123",
      dateFrom: "2025-07-01",
      dateTo: "2025-07-31",
    });

    expect(mockSelect).toHaveBeenCalled();
  });

  it("expands a booking with checkIn in range into an arrival row", async () => {
    const rawRows = [
      {
        bookingReference: "BSKI-2025-0001",
        memberFirstName: "Alice",
        memberLastName: "Smith",
        lodgeName: "Kosciuszko Lodge",
        checkInDate: "2025-07-10",
        checkOutDate: "2025-08-05",
        balancePaidAt: new Date("2025-06-01"),
      },
    ];
    mockSelect.mockImplementation(() => makeSelectChain(rawRows));

    const result = await getArrivalsAndDepartures({
      organisationId: "org-123",
      dateFrom: "2025-07-01",
      dateTo: "2025-07-31",
    });

    const arrivalRow = result.rows.find((r) => r.type === "arrival");
    expect(arrivalRow).toBeDefined();
    expect(arrivalRow?.bookingReference).toBe("BSKI-2025-0001");
    expect(arrivalRow?.date).toBe("2025-07-10");
    expect(arrivalRow?.memberFirstName).toBe("Alice");
    expect(arrivalRow?.memberLastName).toBe("Smith");
    expect(arrivalRow?.lodgeName).toBe("Kosciuszko Lodge");
    expect(arrivalRow?.paymentStatus).toBe("paid");
  });

  it("expands a booking with checkOut in range into a departure row", async () => {
    const rawRows = [
      {
        bookingReference: "BSKI-2025-0002",
        memberFirstName: "Bob",
        memberLastName: "Jones",
        lodgeName: "Mount Hotham Lodge",
        checkInDate: "2025-06-20",
        checkOutDate: "2025-07-15",
        balancePaidAt: null,
      },
    ];
    mockSelect.mockImplementation(() => makeSelectChain(rawRows));

    const result = await getArrivalsAndDepartures({
      organisationId: "org-123",
      dateFrom: "2025-07-01",
      dateTo: "2025-07-31",
    });

    const departureRow = result.rows.find((r) => r.type === "departure");
    expect(departureRow).toBeDefined();
    expect(departureRow?.bookingReference).toBe("BSKI-2025-0002");
    expect(departureRow?.date).toBe("2025-07-15");
    expect(departureRow?.paymentStatus).toBe("unpaid");
  });

  it("expands a booking with both checkIn and checkOut in range into two rows", async () => {
    const rawRows = [
      {
        bookingReference: "BSKI-2025-0003",
        memberFirstName: "Carol",
        memberLastName: "White",
        lodgeName: "Falls Creek Lodge",
        checkInDate: "2025-07-05",
        checkOutDate: "2025-07-20",
        balancePaidAt: new Date("2025-06-15"),
      },
    ];
    mockSelect.mockImplementation(() => makeSelectChain(rawRows));

    const result = await getArrivalsAndDepartures({
      organisationId: "org-123",
      dateFrom: "2025-07-01",
      dateTo: "2025-07-31",
    });

    expect(result.rows).toHaveLength(2);
    const arrival = result.rows.find((r) => r.type === "arrival");
    const departure = result.rows.find((r) => r.type === "departure");
    expect(arrival?.date).toBe("2025-07-05");
    expect(departure?.date).toBe("2025-07-20");
  });

  it("excludes rows that are outside the date range", async () => {
    const rawRows = [
      {
        bookingReference: "BSKI-2025-0004",
        memberFirstName: "Dave",
        memberLastName: "Black",
        lodgeName: "Some Lodge",
        checkInDate: "2025-06-01",
        checkOutDate: "2025-06-15",
        balancePaidAt: null,
      },
    ];
    mockSelect.mockImplementation(() => makeSelectChain(rawRows));

    const result = await getArrivalsAndDepartures({
      organisationId: "org-123",
      dateFrom: "2025-07-01",
      dateTo: "2025-07-31",
    });

    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("sorts rows by date then by type (arrival before departure)", async () => {
    const rawRows = [
      {
        bookingReference: "BSKI-2025-0005",
        memberFirstName: "Eve",
        memberLastName: "Green",
        lodgeName: "Lodge A",
        checkInDate: "2025-07-10",
        checkOutDate: "2025-07-10",
        balancePaidAt: null,
      },
    ];
    mockSelect.mockImplementation(() => makeSelectChain(rawRows));

    const result = await getArrivalsAndDepartures({
      organisationId: "org-123",
      dateFrom: "2025-07-01",
      dateTo: "2025-07-31",
    });

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].type).toBe("arrival");
    expect(result.rows[1].type).toBe("departure");
  });

  it("respects page parameter", async () => {
    mockSelect.mockImplementation(() => makeSelectChain([]));

    const result = await getArrivalsAndDepartures({
      organisationId: "org-123",
      dateFrom: "2025-07-01",
      dateTo: "2025-07-31",
      page: 3,
    });

    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(50);
  });

  it("returns checkInDate and checkOutDate on each row", async () => {
    const rawRows = [
      {
        bookingReference: "BSKI-2025-0006",
        memberFirstName: "Frank",
        memberLastName: "Lee",
        lodgeName: "Summit Lodge",
        checkInDate: "2025-07-08",
        checkOutDate: "2025-07-22",
        balancePaidAt: null,
      },
    ];
    mockSelect.mockImplementation(() => makeSelectChain(rawRows));

    const result = await getArrivalsAndDepartures({
      organisationId: "org-123",
      dateFrom: "2025-07-01",
      dateTo: "2025-07-31",
    });

    for (const row of result.rows) {
      expect(row.checkInDate).toBe("2025-07-08");
      expect(row.checkOutDate).toBe("2025-07-22");
    }
  });
});
