import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDelete = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockDeleteWhere = vi.fn();
const mockOrderBy = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    delete: (...args: unknown[]) => {
      mockDelete(...args);
      return {
        where: (...wArgs: unknown[]) => {
          mockDeleteWhere(...wArgs);
          return Promise.resolve();
        },
      };
    },
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockValues(...vArgs);
          return Promise.resolve();
        },
      };
    },
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
                  return [];
                },
              };
            },
          };
        },
      };
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { rebuildAvailabilityCache } from "../rebuild";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rebuildAvailabilityCache", () => {
  it("deletes existing rows and inserts new ones for date range", async () => {
    await rebuildAvailabilityCache({
      lodgeId: "550e8400-e29b-41d4-a716-446655440000",
      totalBeds: 20,
      startDate: "2027-07-01",
      endDate: "2027-07-03",
    });

    expect(mockDelete).toHaveBeenCalled();
    expect(mockDeleteWhere).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalled();
    const insertedValues = mockValues.mock.calls[0][0];
    expect(insertedValues).toHaveLength(3);
    expect(insertedValues[0].date).toBe("2027-07-01");
    expect(insertedValues[1].date).toBe("2027-07-02");
    expect(insertedValues[2].date).toBe("2027-07-03");
  });

  it("sets totalBeds from input when no overrides exist", async () => {
    await rebuildAvailabilityCache({
      lodgeId: "550e8400-e29b-41d4-a716-446655440000",
      totalBeds: 20,
      startDate: "2027-07-01",
      endDate: "2027-07-01",
    });

    const insertedValues = mockValues.mock.calls[0][0];
    expect(insertedValues[0].totalBeds).toBe(20);
    expect(insertedValues[0].bookedBeds).toBe(0);
  });

  it("handles empty date range (endDate before startDate)", async () => {
    await rebuildAvailabilityCache({
      lodgeId: "550e8400-e29b-41d4-a716-446655440000",
      totalBeds: 20,
      startDate: "2027-07-05",
      endDate: "2027-07-01",
    });

    expect(mockDelete).toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
