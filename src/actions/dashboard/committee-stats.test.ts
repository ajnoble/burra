import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  members: {
    id: "id",
    organisationId: "organisation_id",
    membershipClassId: "membership_class_id",
    isFinancial: "is_financial",
    joinedAt: "joined_at",
  },
  membershipClasses: {
    id: "id",
    organisationId: "organisation_id",
    name: "name",
  },
  organisationMembers: {
    id: "id",
    organisationId: "organisation_id",
    memberId: "member_id",
    isActive: "is_active",
  },
  transactions: {
    id: "id",
    organisationId: "organisation_id",
    type: "type",
    amountCents: "amount_cents",
    createdAt: "created_at",
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

// Helper: build a simple select chain resolving to the given rows
function makeSelectChain(rows: unknown[]) {
  const terminal = {
    groupBy: () => rows,
  };
  const whereResult = Object.assign(rows, terminal);
  return {
    from: () => ({
      where: () => whereResult,
      innerJoin: () => ({
        innerJoin: () => ({
          where: () => whereResult,
          groupBy: () => rows,
        }),
        where: () => terminal,
      }),
      leftJoin: () => ({
        where: () => terminal,
      }),
    }),
  };
}

// Queued return values for each mockSelect call
let selectQueue: unknown[][] = [];

import { getCommitteeStats } from "./committee-stats";

describe("getCommitteeStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectQueue = [];
    mockSelect.mockImplementation(() =>
      makeSelectChain(selectQueue.shift() ?? [])
    );
  });

  it("returns zeroed stats when no data exists", async () => {
    // 8 queries:
    // 1. totalActiveMembers
    // 2. financial/non-financial member counts
    // 3. prior year member count
    // 4. membersByClass
    // 5. YTD revenue
    // 6. prior year revenue
    // 7. season occupancy
    // 8. monthly occupancy
    selectQueue = [
      [{ count: 0 }],
      [{ financialCount: 0, nonFinancialCount: 0 }],
      [{ count: 0 }],
      [],
      [{ totalRevenueCents: 0, totalRefundCents: 0 }],
      [{ totalRevenueCents: 0, totalRefundCents: 0 }],
      [{ averagePercent: null }],
      [],
    ];

    const result = await getCommitteeStats({
      organisationId: "org-123",
      financialYearStart: "2026-07-01",
      financialYearEnd: "2027-06-30",
    });

    expect(result.totalActiveMembers).toBe(0);
    expect(result.totalActiveMembersPriorYear).toBe(0);
    expect(result.financialMemberCount).toBe(0);
    expect(result.nonFinancialMemberCount).toBe(0);
    expect(result.revenueYtdCents).toBe(0);
    expect(result.revenuePriorYtdCents).toBe(0);
    expect(result.occupancySeasonPercent).toBe(0);
    expect(result.membersByClass).toEqual([]);
    expect(result.monthlyOccupancy).toEqual([]);
  });

  it("computes active member counts from org members", async () => {
    selectQueue = [
      [{ count: 42 }],
      [{ financialCount: 30, nonFinancialCount: 12 }],
      [{ count: 38 }],
      [],
      [{ totalRevenueCents: 0, totalRefundCents: 0 }],
      [{ totalRevenueCents: 0, totalRefundCents: 0 }],
      [{ averagePercent: null }],
      [],
    ];

    const result = await getCommitteeStats({
      organisationId: "org-123",
      financialYearStart: "2026-07-01",
      financialYearEnd: "2027-06-30",
    });

    expect(result.totalActiveMembers).toBe(42);
    expect(result.financialMemberCount).toBe(30);
    expect(result.nonFinancialMemberCount).toBe(12);
    expect(result.totalActiveMembersPriorYear).toBe(38);
  });

  it("computes YTD and prior year revenue with refunds subtracted", async () => {
    selectQueue = [
      [{ count: 0 }],
      [{ financialCount: 0, nonFinancialCount: 0 }],
      [{ count: 0 }],
      [],
      [{ totalRevenueCents: 100000, totalRefundCents: 5000 }],
      [{ totalRevenueCents: 80000, totalRefundCents: 3000 }],
      [{ averagePercent: null }],
      [],
    ];

    const result = await getCommitteeStats({
      organisationId: "org-123",
      financialYearStart: "2026-07-01",
      financialYearEnd: "2027-06-30",
    });

    expect(result.revenueYtdCents).toBe(95000);
    expect(result.revenuePriorYtdCents).toBe(77000);
  });

  it("computes season occupancy percent from availability cache", async () => {
    selectQueue = [
      [{ count: 0 }],
      [{ financialCount: 0, nonFinancialCount: 0 }],
      [{ count: 0 }],
      [],
      [{ totalRevenueCents: 0, totalRefundCents: 0 }],
      [{ totalRevenueCents: 0, totalRefundCents: 0 }],
      [{ averagePercent: "65.50" }],
      [],
    ];

    const result = await getCommitteeStats({
      organisationId: "org-123",
      financialYearStart: "2026-07-01",
      financialYearEnd: "2027-06-30",
    });

    expect(result.occupancySeasonPercent).toBe(65.5);
  });

  it("returns membersByClass with counts from grouped query", async () => {
    selectQueue = [
      [{ count: 3 }],
      [{ financialCount: 2, nonFinancialCount: 1 }],
      [{ count: 0 }],
      [
        { className: "Full Member", count: 10, financialCount: 8 },
        { className: "Associate", count: 5, financialCount: 3 },
      ],
      [{ totalRevenueCents: 0, totalRefundCents: 0 }],
      [{ totalRevenueCents: 0, totalRefundCents: 0 }],
      [{ averagePercent: null }],
      [],
    ];

    const result = await getCommitteeStats({
      organisationId: "org-123",
      financialYearStart: "2026-07-01",
      financialYearEnd: "2027-06-30",
    });

    expect(result.membersByClass).toHaveLength(2);

    const fullMember = result.membersByClass.find(
      (c) => c.className === "Full Member"
    );
    expect(fullMember).toBeDefined();
    expect(fullMember?.count).toBe(10);
    expect(fullMember?.financialCount).toBe(8);

    const associate = result.membersByClass.find(
      (c) => c.className === "Associate"
    );
    expect(associate).toBeDefined();
    expect(associate?.count).toBe(5);
    expect(associate?.financialCount).toBe(3);
  });

  it("returns monthly occupancy averages from grouped availability data", async () => {
    selectQueue = [
      [{ count: 0 }],
      [{ financialCount: 0, nonFinancialCount: 0 }],
      [{ count: 0 }],
      [],
      [{ totalRevenueCents: 0, totalRefundCents: 0 }],
      [{ totalRevenueCents: 0, totalRefundCents: 0 }],
      [{ averagePercent: null }],
      [
        { month: "2026-07", averagePercent: "72.00" },
        { month: "2026-08", averagePercent: "85.50" },
      ],
    ];

    const result = await getCommitteeStats({
      organisationId: "org-123",
      financialYearStart: "2026-07-01",
      financialYearEnd: "2027-06-30",
    });

    expect(result.monthlyOccupancy).toHaveLength(2);

    const july = result.monthlyOccupancy.find((m) => m.month === "2026-07");
    expect(july).toBeDefined();
    expect(july?.averagePercent).toBe(72);

    const aug = result.monthlyOccupancy.find((m) => m.month === "2026-08");
    expect(aug).toBeDefined();
    expect(aug?.averagePercent).toBe(85.5);
  });

  it("calls db.select the expected number of times", async () => {
    selectQueue = [
      [{ count: 0 }],
      [{ financialCount: 0, nonFinancialCount: 0 }],
      [{ count: 0 }],
      [],
      [{ totalRevenueCents: 0, totalRefundCents: 0 }],
      [{ totalRevenueCents: 0, totalRefundCents: 0 }],
      [{ averagePercent: null }],
      [],
    ];

    await getCommitteeStats({
      organisationId: "org-123",
      financialYearStart: "2026-07-01",
      financialYearEnd: "2027-06-30",
    });

    expect(mockSelect).toHaveBeenCalledTimes(8);
  });
});
