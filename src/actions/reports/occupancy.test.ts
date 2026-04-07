import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  availabilityCache: {
    id: "id",
    lodgeId: "lodge_id",
    date: "date",
    totalBeds: "total_beds",
    bookedBeds: "booked_beds",
  },
  lodges: {
    id: "id",
    organisationId: "organisation_id",
    name: "name",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  sql: vi.fn(),
}));

// Build a select chain that resolves to the given rows
function makeSelectChain(rows: unknown[]) {
  return {
    from: () => ({
      innerJoin: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => ({
              offset: () => rows,
            }),
          }),
        }),
      }),
    }),
  };
}

import { getOccupancyReport } from "./occupancy";

describe("getOccupancyReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty rows and zero total when no data exists", async () => {
    mockSelect.mockImplementation(() => makeSelectChain([]));

    const result = await getOccupancyReport({
      organisationId: "org-123",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    });

    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
  });

  it("calls db.select when fetching occupancy report", async () => {
    mockSelect.mockImplementation(() => makeSelectChain([]));

    await getOccupancyReport({
      organisationId: "org-123",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    });

    expect(mockSelect).toHaveBeenCalled();
  });

  it("maps rows and computes availableBeds and occupancyPercent", async () => {
    const rawRows = [
      {
        date: "2026-07-01",
        lodgeName: "Snowgum Lodge",
        totalBeds: 20,
        bookedBeds: 15,
      },
    ];
    mockSelect.mockImplementation(() => makeSelectChain(rawRows));

    const result = await getOccupancyReport({
      organisationId: "org-123",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    });

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.date).toBe("2026-07-01");
    expect(row.lodgeName).toBe("Snowgum Lodge");
    expect(row.totalBeds).toBe(20);
    expect(row.bookedBeds).toBe(15);
    expect(row.availableBeds).toBe(5);
    expect(row.occupancyPercent).toBe(75);
  });

  it("guards against division by zero when totalBeds is 0", async () => {
    const rawRows = [
      {
        date: "2026-07-02",
        lodgeName: "Empty Lodge",
        totalBeds: 0,
        bookedBeds: 0,
      },
    ];
    mockSelect.mockImplementation(() => makeSelectChain(rawRows));

    const result = await getOccupancyReport({
      organisationId: "org-123",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    });

    const row = result.rows[0];
    expect(row.availableBeds).toBe(0);
    expect(row.occupancyPercent).toBe(0);
  });

  it("rounds occupancyPercent correctly", async () => {
    const rawRows = [
      {
        date: "2026-07-03",
        lodgeName: "Mountain Hut",
        totalBeds: 3,
        bookedBeds: 2,
      },
    ];
    mockSelect.mockImplementation(() => makeSelectChain(rawRows));

    const result = await getOccupancyReport({
      organisationId: "org-123",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    });

    const row = result.rows[0];
    // 2/3 * 100 = 66.666... → rounds to 67
    expect(row.occupancyPercent).toBe(67);
  });

  it("accepts optional lodgeId filter", async () => {
    mockSelect.mockImplementation(() => makeSelectChain([]));

    const result = await getOccupancyReport({
      organisationId: "org-123",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      lodgeId: "lodge-456",
    });

    expect(mockSelect).toHaveBeenCalled();
    expect(result.rows).toEqual([]);
  });

  it("respects page parameter", async () => {
    mockSelect.mockImplementation(() => makeSelectChain([]));

    const result = await getOccupancyReport({
      organisationId: "org-123",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      page: 3,
    });

    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(50);
  });
});
