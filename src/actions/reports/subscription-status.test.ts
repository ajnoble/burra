import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  subscriptions: {
    id: "id",
    organisationId: "organisation_id",
    memberId: "member_id",
    seasonId: "season_id",
    amountCents: "amount_cents",
    dueDate: "due_date",
    paidAt: "paid_at",
    status: "status",
  },
  members: {
    id: "id",
    organisationId: "organisation_id",
    membershipClassId: "membership_class_id",
    firstName: "first_name",
    lastName: "last_name",
  },
  seasons: {
    id: "id",
    name: "name",
  },
  membershipClasses: {
    id: "id",
    name: "name",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  lte: vi.fn(),
  sql: vi.fn(),
}));

// Build a select chain that resolves to two calls: data rows and summary row
let callCount = 0;
let dataRows: unknown[] = [];
let summaryRow: unknown = {};

function makeSelectChain(rows: unknown[]) {
  return {
    from: () => ({
      innerJoin: function () {
        return {
          innerJoin: function () {
            return {
              leftJoin: function () {
                return {
                  where: () => ({
                    orderBy: () => ({
                      limit: () => ({
                        offset: () => rows,
                      }),
                    }),
                  }),
                };
              },
            };
          },
        };
      },
    }),
  };
}

function makeCountChain(row: unknown) {
  return {
    from: () => ({
      innerJoin: function () {
        return {
          innerJoin: function () {
            return {
              leftJoin: function () {
                return {
                  where: () => [row],
                };
              },
            };
          },
        };
      },
    }),
  };
}

import { getSubscriptionStatus } from "./subscription-status";

describe("getSubscriptionStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callCount = 0;
    dataRows = [];
    summaryRow = {
      total: 0,
      paidCount: 0,
      paidAmountCents: 0,
      unpaidCount: 0,
      unpaidAmountCents: 0,
      waivedCount: 0,
    };
  });

  it("returns empty rows and zero totals when no subscriptions found", async () => {
    mockSelect
      .mockImplementationOnce(() => makeCountChain(summaryRow))
      .mockImplementationOnce(() => makeSelectChain([]));

    const result = await getSubscriptionStatus({
      organisationId: "org-123",
    });

    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
    expect(result.summary.paidCount).toBe(0);
    expect(result.summary.paidAmountCents).toBe(0);
    expect(result.summary.unpaidCount).toBe(0);
    expect(result.summary.unpaidAmountCents).toBe(0);
    expect(result.summary.waivedCount).toBe(0);
  });

  it("calls db.select for both data and summary queries", async () => {
    mockSelect
      .mockImplementationOnce(() => makeCountChain(summaryRow))
      .mockImplementationOnce(() => makeSelectChain([]));

    await getSubscriptionStatus({
      organisationId: "org-123",
    });

    expect(mockSelect).toHaveBeenCalledTimes(2);
  });

  it("maps rows correctly", async () => {
    const rawRows = [
      {
        id: "sub-1",
        memberFirstName: "Alice",
        memberLastName: "Smith",
        membershipClassName: "Full Member",
        seasonName: "Winter 2026",
        amountCents: 20000,
        dueDate: "2026-03-01",
        status: "PAID",
        paidAt: new Date("2026-02-15"),
      },
    ];

    const summary = {
      total: 1,
      paidCount: 1,
      paidAmountCents: 20000,
      unpaidCount: 0,
      unpaidAmountCents: 0,
      waivedCount: 0,
    };

    mockSelect
      .mockImplementationOnce(() => makeCountChain(summary))
      .mockImplementationOnce(() => makeSelectChain(rawRows));

    const result = await getSubscriptionStatus({
      organisationId: "org-123",
    });

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.id).toBe("sub-1");
    expect(row.memberFirstName).toBe("Alice");
    expect(row.memberLastName).toBe("Smith");
    expect(row.membershipClassName).toBe("Full Member");
    expect(row.seasonName).toBe("Winter 2026");
    expect(row.amountCents).toBe(20000);
    expect(row.dueDate).toBe("2026-03-01");
    expect(row.status).toBe("PAID");
    expect(row.paidAt).toEqual(new Date("2026-02-15"));
    expect(result.total).toBe(1);
    expect(result.summary.paidCount).toBe(1);
    expect(result.summary.paidAmountCents).toBe(20000);
  });

  it("respects page parameter", async () => {
    mockSelect
      .mockImplementationOnce(() => makeCountChain(summaryRow))
      .mockImplementationOnce(() => makeSelectChain([]));

    const result = await getSubscriptionStatus({
      organisationId: "org-123",
      page: 3,
    });

    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(50);
  });

  it("returns correct summary counts for mixed statuses", async () => {
    const summary = {
      total: 3,
      paidCount: 1,
      paidAmountCents: 10000,
      unpaidCount: 1,
      unpaidAmountCents: 5000,
      waivedCount: 1,
    };

    mockSelect
      .mockImplementationOnce(() => makeCountChain(summary))
      .mockImplementationOnce(() => makeSelectChain([]));

    const result = await getSubscriptionStatus({
      organisationId: "org-123",
    });

    expect(result.summary.paidCount).toBe(1);
    expect(result.summary.paidAmountCents).toBe(10000);
    expect(result.summary.unpaidCount).toBe(1);
    expect(result.summary.unpaidAmountCents).toBe(5000);
    expect(result.summary.waivedCount).toBe(1);
  });
});
