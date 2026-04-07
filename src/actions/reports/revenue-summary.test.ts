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
    bookingId: "booking_id",
    type: "type",
    amountCents: "amount_cents",
    platformFeeCents: "platform_fee_cents",
    createdAt: "created_at",
  },
  bookings: {
    id: "id",
    organisationId: "organisation_id",
    lodgeId: "lodge_id",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  sql: vi.fn(),
}));

// Helper: build a select chain that resolves to the given rows
function makeSelectChain(rows: unknown[]) {
  return {
    from: () => ({
      leftJoin: () => ({
        where: () => ({
          groupBy: () => ({
            orderBy: () => rows,
          }),
        }),
      }),
      where: () => ({
        groupBy: () => ({
          orderBy: () => rows,
        }),
      }),
    }),
  };
}

let selectQueue: unknown[][] = [];

import { getRevenueSummary } from "./revenue-summary";

describe("getRevenueSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectQueue = [];
    mockSelect.mockImplementation(() =>
      makeSelectChain(selectQueue.shift() ?? [])
    );
  });

  it("returns empty rows and zero totals when no transactions exist", async () => {
    selectQueue = [[]];

    const result = await getRevenueSummary({
      organisationId: "org-123",
      dateFrom: "2026-07-01",
      dateTo: "2027-06-30",
      granularity: "monthly",
    });

    expect(result.rows).toEqual([]);
    expect(result.totalNetRevenueCents).toBe(0);
    expect(result.totalPlatformFeesCents).toBe(0);
  });

  it("calls db.select when fetching revenue summary", async () => {
    selectQueue = [[]];

    await getRevenueSummary({
      organisationId: "org-123",
      dateFrom: "2026-07-01",
      dateTo: "2027-06-30",
      granularity: "monthly",
    });

    expect(mockSelect).toHaveBeenCalled();
  });

  it("computes totals from rows for monthly granularity", async () => {
    selectQueue = [
      [
        {
          period: "2026-07",
          bookingRevenueCents: 50000,
          subscriptionRevenueCents: 10000,
          refundsCents: 5000,
          platformFeesCents: 600,
        },
        {
          period: "2026-08",
          bookingRevenueCents: 30000,
          subscriptionRevenueCents: 8000,
          refundsCents: 2000,
          platformFeesCents: 400,
        },
      ],
    ];

    const result = await getRevenueSummary({
      organisationId: "org-123",
      dateFrom: "2026-07-01",
      dateTo: "2027-06-30",
      granularity: "monthly",
    });

    expect(result.rows).toHaveLength(2);

    const july = result.rows[0];
    expect(july.period).toBe("2026-07");
    expect(july.bookingRevenueCents).toBe(50000);
    expect(july.subscriptionRevenueCents).toBe(10000);
    expect(july.refundsCents).toBe(5000);
    // net = booking + subscription - refunds
    expect(july.netRevenueCents).toBe(55000);
    expect(july.platformFeesCents).toBe(600);

    // totals across all rows
    expect(result.totalNetRevenueCents).toBe(55000 + 36000);
    expect(result.totalPlatformFeesCents).toBe(1000);
  });

  it("accepts optional lodgeId filter", async () => {
    selectQueue = [[]];

    const result = await getRevenueSummary({
      organisationId: "org-123",
      dateFrom: "2026-07-01",
      dateTo: "2027-06-30",
      granularity: "quarterly",
      lodgeId: "lodge-456",
    });

    expect(mockSelect).toHaveBeenCalled();
    expect(result.rows).toEqual([]);
  });

  it("computes quarterly period labels", async () => {
    selectQueue = [
      [
        {
          period: "2026-Q3",
          bookingRevenueCents: 40000,
          subscriptionRevenueCents: 5000,
          refundsCents: 1000,
          platformFeesCents: 450,
        },
      ],
    ];

    const result = await getRevenueSummary({
      organisationId: "org-123",
      dateFrom: "2026-07-01",
      dateTo: "2026-09-30",
      granularity: "quarterly",
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].period).toBe("2026-Q3");
    expect(result.rows[0].netRevenueCents).toBe(44000);
  });

  it("computes annual period labels", async () => {
    selectQueue = [
      [
        {
          period: "2026",
          bookingRevenueCents: 120000,
          subscriptionRevenueCents: 20000,
          refundsCents: 10000,
          platformFeesCents: 1500,
        },
      ],
    ];

    const result = await getRevenueSummary({
      organisationId: "org-123",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      granularity: "annual",
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].period).toBe("2026");
    expect(result.rows[0].netRevenueCents).toBe(130000);
    expect(result.totalNetRevenueCents).toBe(130000);
    expect(result.totalPlatformFeesCents).toBe(1500);
  });
});
