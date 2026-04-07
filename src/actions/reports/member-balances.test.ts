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
    firstName: "first_name",
    lastName: "last_name",
    isFinancial: "is_financial",
  },
  membershipClasses: {
    id: "id",
    name: "name",
  },
  transactions: {
    id: "id",
    organisationId: "organisation_id",
    memberId: "member_id",
    type: "type",
    amountCents: "amount_cents",
  },
  subscriptions: {
    id: "id",
    organisationId: "organisation_id",
    memberId: "member_id",
    status: "status",
    createdAt: "created_at",
  },
  oneOffCharges: {
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
  sql: vi.fn(),
  leftJoin: vi.fn(),
}));

// Build a select chain that resolves to the given rows
function makeSelectChain(rows: unknown[]) {
  return {
    from: () => ({
      leftJoin: function () {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        return {
          leftJoin: function () {
            return {
              where: () => ({
                groupBy: () => rows,
              }),
              groupBy: () => rows,
            };
          },
          where: () => ({
            groupBy: () => rows,
          }),
          groupBy: () => rows,
          innerJoin: function () {
            return {
              where: () => ({
                groupBy: () => rows,
              }),
            };
          },
        };
        void self;
      },
      innerJoin: function () {
        return {
          leftJoin: function () {
            return {
              where: () => ({
                groupBy: () => rows,
              }),
            };
          },
          where: () => ({
            groupBy: () => rows,
          }),
        };
      },
      where: () => ({
        groupBy: () => rows,
      }),
      groupBy: () => rows,
    }),
  };
}

import { getMemberBalances } from "./member-balances";

describe("getMemberBalances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty rows and zero total when no members found", async () => {
    mockSelect.mockImplementation(() => makeSelectChain([]));

    const result = await getMemberBalances({
      organisationId: "org-123",
    });

    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
  });

  it("calls db.select for the query", async () => {
    mockSelect.mockImplementation(() => makeSelectChain([]));

    await getMemberBalances({
      organisationId: "org-123",
    });

    expect(mockSelect).toHaveBeenCalled();
  });

  it("maps rows and computes outstanding balance", async () => {
    const rawRows = [
      {
        memberId: "m-1",
        firstName: "Alice",
        lastName: "Smith",
        membershipClassName: "Full Member",
        isFinancial: true,
        subscriptionStatus: "PAID",
        totalPaidCents: 20000,
        totalRefundedCents: 2000,
        totalInvoicedCents: 25000,
        totalUnpaidChargesCents: 0,
      },
    ];
    mockSelect.mockImplementation(() => makeSelectChain(rawRows));

    const result = await getMemberBalances({
      organisationId: "org-123",
    });

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.memberId).toBe("m-1");
    expect(row.firstName).toBe("Alice");
    expect(row.lastName).toBe("Smith");
    expect(row.membershipClassName).toBe("Full Member");
    expect(row.isFinancial).toBe(true);
    expect(row.subscriptionStatus).toBe("PAID");
    expect(row.totalPaidCents).toBe(20000);
    expect(row.totalRefundedCents).toBe(2000);
    // outstanding = invoiced - paid + refunded = 25000 - 20000 + 2000 = 7000
    expect(row.outstandingBalanceCents).toBe(7000);
  });

  it("clamps outstanding balance to zero when negative", async () => {
    const rawRows = [
      {
        memberId: "m-2",
        firstName: "Bob",
        lastName: "Jones",
        membershipClassName: null,
        isFinancial: false,
        subscriptionStatus: null,
        totalPaidCents: 30000,
        totalRefundedCents: 0,
        totalInvoicedCents: 10000,
        totalUnpaidChargesCents: 0,
      },
    ];
    mockSelect.mockImplementation(() => makeSelectChain(rawRows));

    const result = await getMemberBalances({
      organisationId: "org-123",
    });

    const row = result.rows[0];
    // outstanding = 10000 - 30000 + 0 = -20000 → clamp to 0
    expect(row.outstandingBalanceCents).toBe(0);
  });

  it("filters by hasOutstandingBalance post-query", async () => {
    const rawRows = [
      {
        memberId: "m-3",
        firstName: "Carol",
        lastName: "White",
        membershipClassName: "Associate",
        isFinancial: true,
        subscriptionStatus: "UNPAID",
        totalPaidCents: 0,
        totalRefundedCents: 0,
        totalInvoicedCents: 5000,
        totalUnpaidChargesCents: 0,
      },
      {
        memberId: "m-4",
        firstName: "Dave",
        lastName: "Black",
        membershipClassName: "Full Member",
        isFinancial: true,
        subscriptionStatus: "PAID",
        totalPaidCents: 5000,
        totalRefundedCents: 0,
        totalInvoicedCents: 5000,
        totalUnpaidChargesCents: 0,
      },
    ];
    mockSelect.mockImplementation(() => makeSelectChain(rawRows));

    const result = await getMemberBalances({
      organisationId: "org-123",
      hasOutstandingBalance: true,
    });

    // Only Carol has outstanding balance > 0
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].memberId).toBe("m-3");
    expect(result.total).toBe(1);
  });

  it("respects page parameter", async () => {
    mockSelect.mockImplementation(() => makeSelectChain([]));

    const result = await getMemberBalances({
      organisationId: "org-123",
      page: 3,
    });

    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(50);
  });

  it("includes unpaid one-off charges in outstanding balance", async () => {
    const rawRows = [
      {
        memberId: "m-5",
        firstName: "Eve",
        lastName: "Green",
        membershipClassName: "Full Member",
        isFinancial: true,
        subscriptionStatus: "PAID",
        totalPaidCents: 10000,
        totalRefundedCents: 0,
        totalInvoicedCents: 10000,
        totalUnpaidChargesCents: 3500,
      },
    ];
    mockSelect.mockImplementation(() => makeSelectChain(rawRows));

    const result = await getMemberBalances({
      organisationId: "org-123",
    });

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    // outstanding = invoiced - paid + refunded + unpaidCharges = 10000 - 10000 + 0 + 3500 = 3500
    expect(row.outstandingBalanceCents).toBe(3500);
  });
});
