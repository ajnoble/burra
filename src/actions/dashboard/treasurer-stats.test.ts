import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  transactions: {
    id: "id",
    organisationId: "organisation_id",
    memberId: "member_id",
    type: "type",
    amountCents: "amount_cents",
    platformFeeCents: "platform_fee_cents",
    createdAt: "created_at",
  },
  subscriptions: {
    id: "id",
    organisationId: "organisation_id",
    memberId: "member_id",
    amountCents: "amount_cents",
    status: "status",
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

// Helper: build a select chain that resolves to the given rows
function makeSelectChain(rows: unknown[]) {
  return {
    from: () => ({
      where: () => {
        const result = rows as unknown[];
        (result as Record<string, unknown>).groupBy = () => rows;
        return result;
      },
    }),
  };
}

// Queued return values for each mockSelect call
let selectQueue: unknown[][] = [];

import { getTreasurerStats } from "./treasurer-stats";

describe("getTreasurerStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectQueue = [];
    // Default: return empty arrays for all five queries
    mockSelect.mockImplementation(() =>
      makeSelectChain(selectQueue.shift() ?? [])
    );
  });

  it("returns zeroed stats when no transactions exist", async () => {
    // Five queries: ytd, mtd, priorYtd, outstanding, monthly
    selectQueue = [
      // YTD aggregate: { totalRevenueCents, totalRefundCents, totalPlatformFeesCents }
      [{ totalRevenueCents: 0, totalRefundCents: 0, totalPlatformFeesCents: 0 }],
      // MTD aggregate
      [{ totalRevenueCents: 0, totalRefundCents: 0, totalPlatformFeesCents: 0 }],
      // Prior YTD aggregate
      [{ totalRevenueCents: 0, totalRefundCents: 0, totalPlatformFeesCents: 0 }],
      // Outstanding subscriptions
      [{ totalOutstandingCents: 0 }],
      // Monthly breakdown
      [],
    ];

    const result = await getTreasurerStats({
      organisationId: "org-123",
      financialYearStart: "2026-07-01",
      financialYearEnd: "2027-06-30",
    });

    expect(result.revenueYtdCents).toBe(0);
    expect(result.revenueMtdCents).toBe(0);
    expect(result.revenuePriorYtdCents).toBe(0);
    expect(result.outstandingBalanceCents).toBe(0);
    expect(result.platformFeesYtdCents).toBe(0);
    expect(result.monthlyRevenue).toEqual([]);
  });

  it("calls db.select for transaction aggregation", async () => {
    selectQueue = [
      [{ totalRevenueCents: 50000, totalRefundCents: 5000, totalPlatformFeesCents: 500 }],
      [{ totalRevenueCents: 10000, totalRefundCents: 1000, totalPlatformFeesCents: 100 }],
      [{ totalRevenueCents: 40000, totalRefundCents: 4000, totalPlatformFeesCents: 400 }],
      [{ totalOutstandingCents: 20000 }],
      [],
    ];

    const result = await getTreasurerStats({
      organisationId: "org-123",
      financialYearStart: "2026-07-01",
      financialYearEnd: "2027-06-30",
    });

    expect(mockSelect).toHaveBeenCalled();
    // YTD: revenue minus refunds
    expect(result.revenueYtdCents).toBe(45000);
    // MTD: revenue minus refunds
    expect(result.revenueMtdCents).toBe(9000);
    // Prior YTD: revenue minus refunds
    expect(result.revenuePriorYtdCents).toBe(36000);
    expect(result.outstandingBalanceCents).toBe(20000);
    expect(result.platformFeesYtdCents).toBe(500);
  });

  it("computes monthly revenue from grouped rows", async () => {
    selectQueue = [
      [{ totalRevenueCents: 0, totalRefundCents: 0, totalPlatformFeesCents: 0 }],
      [{ totalRevenueCents: 0, totalRefundCents: 0, totalPlatformFeesCents: 0 }],
      [{ totalRevenueCents: 0, totalRefundCents: 0, totalPlatformFeesCents: 0 }],
      [{ totalOutstandingCents: 0 }],
      // Monthly rows: two months, one with PAYMENT one with REFUND
      [
        { month: "2026-07", type: "PAYMENT", totalCents: 15000 },
        { month: "2026-07", type: "REFUND", totalCents: 2000 },
        { month: "2026-08", type: "SUBSCRIPTION", totalCents: 8000 },
      ],
    ];

    const result = await getTreasurerStats({
      organisationId: "org-123",
      financialYearStart: "2026-07-01",
      financialYearEnd: "2027-06-30",
    });

    expect(result.monthlyRevenue).toHaveLength(2);

    const july = result.monthlyRevenue.find((m) => m.month === "2026-07");
    expect(july).toBeDefined();
    expect(july?.bookingCents).toBe(15000);
    expect(july?.refundCents).toBe(2000);
    expect(july?.subscriptionCents).toBe(0);

    const aug = result.monthlyRevenue.find((m) => m.month === "2026-08");
    expect(aug).toBeDefined();
    expect(aug?.subscriptionCents).toBe(8000);
    expect(aug?.bookingCents).toBe(0);
  });
});
