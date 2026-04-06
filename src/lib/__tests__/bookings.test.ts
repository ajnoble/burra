import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockInnerJoin = vi.fn();
const mockLeftJoin = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockOffset = vi.fn();
const mockGroupBy = vi.fn();

let selectCallCount = 0;

// Build a recursive chainable mock that always returns itself,
// terminating with an array at await-time via Symbol.iterator / then.
function makeChain(finalValue: unknown[] = []): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const methods = [
    "from",
    "innerJoin",
    "leftJoin",
    "where",
    "orderBy",
    "limit",
    "offset",
    "groupBy",
  ];
  for (const m of methods) {
    chain[m] = (..._args: unknown[]) => {
      if (m === "from") mockFrom(..._args);
      if (m === "innerJoin") mockInnerJoin(..._args);
      if (m === "leftJoin") mockLeftJoin(..._args);
      if (m === "where") mockWhere(..._args);
      if (m === "orderBy") mockOrderBy(..._args);
      if (m === "limit") mockLimit(..._args);
      if (m === "offset") {
        mockOffset();
        return finalValue;
      }
      if (m === "groupBy") {
        mockGroupBy(..._args);
        return finalValue;
      }
      return chain;
    };
  }
  // Make the chain thenable so `await chain` resolves to finalValue
  chain["then"] = (resolve: (v: unknown) => unknown) => resolve(finalValue);
  return chain;
}

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      const callIndex = selectCallCount++;

      // getAdminBookings first call: returns booking rows after offset
      if (callIndex === 0) {
        return makeChain([
          {
            id: "booking-1",
            bookingReference: "BSKI-2027-0042",
            memberFirstName: "Sarah",
            memberLastName: "Mitchell",
            lodgeName: "Main Lodge",
            checkInDate: "2027-07-12",
            checkOutDate: "2027-07-16",
            totalNights: 4,
            totalAmountCents: 84000,
            status: "PENDING",
            createdAt: new Date(),
            balancePaidAt: null,
          },
        ]);
      }
      // Count query: returns [{ count: 1 }]
      if (callIndex === 1) {
        return makeChain([{ count: 1 }]);
      }
      // Guest count query or anything else: returns []
      return makeChain([]);
    },
    execute: vi.fn().mockResolvedValue([]),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
});

import { getAdminBookings, getPendingApprovalCount } from "@/lib/bookings";

describe("getAdminBookings", () => {
  it("returns paginated bookings for an organisation", async () => {
    const result = await getAdminBookings({
      organisationId: "org-1",
      page: 1,
    });
    expect(result).toBeDefined();
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
  });
});

describe("getPendingApprovalCount", () => {
  it("calls db with correct organisation filter", async () => {
    await getPendingApprovalCount("org-1");
    expect(mockSelect).toHaveBeenCalled();
  });
});
