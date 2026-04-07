import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockUpdateWhere = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockSelectWhere = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();

// Track which charge to return for select queries
let mockChargeStatus = "UNPAID";
let mockChargeExists = true;

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockSelectWhere(...wArgs);
              if (!mockChargeExists) return [];
              return [
                {
                  id: "charge-id-1",
                  status: mockChargeStatus,
                  organisationId: "org-1",
                  memberId: "member-1",
                  amountCents: 5000,
                },
              ];
            },
          };
        },
      };
    },
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: (...sArgs: unknown[]) => {
          mockSet(...sArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockUpdateWhere(...wArgs);
              return Promise.resolve();
            },
          };
        },
      };
    },
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockValues(...vArgs);
          return {
            returning: () => {
              mockReturning();
              return [{ id: "txn-id-1" }];
            },
          };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  oneOffCharges: { id: "oneOffCharges" },
  transactions: { id: "transactions" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val, type: "eq" })),
  and: vi.fn((...conditions) => ({ conditions, type: "and" })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn().mockResolvedValue({ memberId: "admin-1", role: "ADMIN" }),
  canAccessAdmin: vi.fn().mockReturnValue(true),
}));

import { waiveCharge, cancelCharge, markChargeAsPaid } from "../update-status";

beforeEach(() => {
  vi.clearAllMocks();
  mockChargeStatus = "UNPAID";
  mockChargeExists = true;
});

describe("waiveCharge", () => {
  const baseInput = {
    chargeId: "charge-id-1",
    organisationId: "org-1",
    reason: "Financial hardship",
    slug: "test-org",
  };

  it("waives an unpaid charge with a reason", async () => {
    const result = await waiveCharge(baseInput);

    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "WAIVED",
        waivedReason: "Financial hardship",
      })
    );
  });

  it("rejects waiving a non-UNPAID charge", async () => {
    mockChargeStatus = "PAID";

    const result = await waiveCharge(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Only unpaid charges can be waived");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns error when charge not found", async () => {
    mockChargeExists = false;

    const result = await waiveCharge(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Charge not found");
  });
});

describe("cancelCharge", () => {
  const baseInput = {
    chargeId: "charge-id-1",
    organisationId: "org-1",
    slug: "test-org",
  };

  it("cancels an unpaid charge", async () => {
    const result = await cancelCharge(baseInput);

    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "CANCELLED" })
    );
  });

  it("rejects cancelling a non-UNPAID charge", async () => {
    mockChargeStatus = "WAIVED";

    const result = await cancelCharge(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Only unpaid charges can be cancelled");
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("markChargeAsPaid", () => {
  const baseInput = {
    chargeId: "charge-id-1",
    organisationId: "org-1",
    slug: "test-org",
  };

  it("marks an unpaid charge as paid and creates a transaction", async () => {
    const result = await markChargeAsPaid(baseInput);

    expect(result.success).toBe(true);
    // Should create a transaction
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "PAYMENT",
        amountCents: 5000,
      })
    );
    // Should update the charge
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "PAID",
        transactionId: "txn-id-1",
      })
    );
  });

  it("rejects marking a non-UNPAID charge as paid", async () => {
    mockChargeStatus = "CANCELLED";

    const result = await markChargeAsPaid(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Only unpaid charges can be marked as paid");
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
