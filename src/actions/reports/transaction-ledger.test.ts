import { describe, it, expect, vi, beforeEach } from "vitest";

// --- mock db ---
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockInnerJoin = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockOffset = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...a: unknown[]) => {
          mockFrom(...a);
          return {
            innerJoin: (...a: unknown[]) => {
              mockInnerJoin(...a);
              return {
                where: (...a: unknown[]) => {
                  mockWhere(...a);
                  return {
                    orderBy: (...a: unknown[]) => {
                      mockOrderBy(...a);
                      return {
                        limit: (...a: unknown[]) => {
                          mockLimit(...a);
                          return {
                            offset: (...a: unknown[]) => {
                              mockOffset(...a);
                              return [];
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  transactions: { organisationId: "org_id", createdAt: "created_at", type: "type", memberId: "member_id" },
  members: { id: "id" },
}));

import {
  getTransactionLedger,
  formatLedgerForXero,
  type LedgerRow,
} from "./transaction-ledger";

describe("getTransactionLedger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty rows and zero total for an organisation with no transactions", async () => {
    const result = await getTransactionLedger({ organisationId: "org-123" });

    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
  });

  it("uses page 1 by default", async () => {
    const result = await getTransactionLedger({ organisationId: "org-123" });
    expect(result.page).toBe(1);
  });

  it("respects custom page number", async () => {
    const result = await getTransactionLedger({
      organisationId: "org-123",
      page: 3,
    });
    expect(result.page).toBe(3);
  });

  it("calls db.select and queries from transactions joined to members", async () => {
    await getTransactionLedger({ organisationId: "org-123" });
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockInnerJoin).toHaveBeenCalled();
  });
});

describe("formatLedgerForXero", () => {
  const baseRow: LedgerRow = {
    id: "txn-1",
    date: new Date("2025-07-15T10:00:00Z"),
    memberFirstName: "Jane",
    memberLastName: "Smith",
    type: "PAYMENT",
    amountCents: 15000,
    description: "Booking payment",
    stripeRef: "pi_abc123",
  };

  it("formats date in Australian dd/MM/yyyy format", () => {
    const [row] = formatLedgerForXero([baseRow]);
    expect(row.date).toBe("15/07/2025");
  });

  it("formats amountCents as decimal amount string", () => {
    const [row] = formatLedgerForXero([baseRow]);
    expect(row.amount).toBe("150.00");
  });

  it("formats payee as firstName + lastName", () => {
    const [row] = formatLedgerForXero([baseRow]);
    expect(row.payee).toBe("Jane Smith");
  });

  it("passes through description", () => {
    const [row] = formatLedgerForXero([baseRow]);
    expect(row.description).toBe("Booking payment");
  });

  it("passes through stripeRef as reference", () => {
    const [row] = formatLedgerForXero([baseRow]);
    expect(row.reference).toBe("pi_abc123");
  });

  it("uses empty string for reference when stripeRef is null", () => {
    const row: LedgerRow = { ...baseRow, stripeRef: null };
    const [xeroRow] = formatLedgerForXero([row]);
    expect(xeroRow.reference).toBe("");
  });

  it("formats REFUND as negative amount", () => {
    const refundRow: LedgerRow = {
      ...baseRow,
      type: "REFUND",
      amountCents: -5000,
    };
    const [xeroRow] = formatLedgerForXero([refundRow]);
    expect(xeroRow.amount).toBe("-50.00");
  });

  it("returns empty array for empty input", () => {
    expect(formatLedgerForXero([])).toEqual([]);
  });
});
