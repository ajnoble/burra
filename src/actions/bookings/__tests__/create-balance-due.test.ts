import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();

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
              return mockWhere.mock.results[mockWhere.mock.calls.length - 1]?.value ?? [];
            },
          };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  bookingRounds: {
    id: "id",
    balanceDueDate: "balanceDueDate",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
}));

import { getBalanceDueDateForRound } from "../create-helpers";

describe("getBalanceDueDateForRound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns round balanceDueDate when set", async () => {
    mockWhere.mockReturnValue([{ balanceDueDate: "2027-06-15" }]);

    const result = await getBalanceDueDateForRound("round-1");

    expect(result).toBe("2027-06-15");
  });

  it("returns null when round has no balanceDueDate", async () => {
    mockWhere.mockReturnValue([{ balanceDueDate: null }]);

    const result = await getBalanceDueDateForRound("round-1");

    expect(result).toBeNull();
  });
});
