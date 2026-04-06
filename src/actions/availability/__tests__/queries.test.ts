import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRows: Record<string, unknown[]> = {
  availability: [],
  overrides: [],
};

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs);
              return {
                orderBy: (...oArgs: unknown[]) => {
                  mockOrderBy(...oArgs);
                  return mockRows.current ?? [];
                },
              };
            },
          };
        },
      };
    },
  },
}));

import {
  getMonthAvailability,
  getDateRangeAvailability,
  getOverridesForLodge,
} from "../queries";

beforeEach(() => {
  vi.clearAllMocks();
  mockRows.current = [];
});

describe("getMonthAvailability", () => {
  it("queries with correct lodge and date range", async () => {
    const lodgeId = "550e8400-e29b-41d4-a716-446655440000";
    mockRows.current = [
      { id: "row-1", lodgeId, date: "2027-07-01", totalBeds: 20, bookedBeds: 5 },
      { id: "row-2", lodgeId, date: "2027-07-02", totalBeds: 20, bookedBeds: 8 },
    ];

    const result = await getMonthAvailability(lodgeId, 2027, 7);

    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2027-07-01");
  });

  it("returns empty array when no data", async () => {
    mockRows.current = [];
    const result = await getMonthAvailability(
      "550e8400-e29b-41d4-a716-446655440000",
      2027,
      7
    );
    expect(result).toHaveLength(0);
  });
});

describe("getDateRangeAvailability", () => {
  it("queries with correct parameters", async () => {
    const lodgeId = "550e8400-e29b-41d4-a716-446655440000";
    mockRows.current = [
      { id: "row-1", lodgeId, date: "2027-07-10", totalBeds: 20, bookedBeds: 3 },
    ];

    const result = await getDateRangeAvailability(lodgeId, "2027-07-10", "2027-07-12");

    expect(mockSelect).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });
});

describe("getOverridesForLodge", () => {
  it("queries overrides for a lodge", async () => {
    const lodgeId = "550e8400-e29b-41d4-a716-446655440000";
    mockRows.current = [
      {
        id: "override-1",
        lodgeId,
        startDate: "2027-07-01",
        endDate: "2027-07-03",
        type: "CLOSURE",
        reason: "Maintenance",
      },
    ];

    const result = await getOverridesForLodge(lodgeId);

    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("CLOSURE");
  });

  it("returns empty array when no overrides", async () => {
    mockRows.current = [];
    const result = await getOverridesForLodge(
      "550e8400-e29b-41d4-a716-446655440000"
    );
    expect(result).toHaveLength(0);
  });
});
