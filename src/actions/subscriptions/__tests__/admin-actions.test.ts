import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockSet = vi.fn();
const mockValues = vi.fn();
const mockWhere = vi.fn();
const mockReturning = vi.fn();
const mockFrom = vi.fn();

// Default subscription returned by select
let mockSubscriptionResult: unknown[] = [
  { id: "sub-id", memberId: "member-id", amountCents: 12000 },
];

const mockTransaction = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: (...sArgs: unknown[]) => {
          mockSet(...sArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs);
              return {
                returning: () => {
                  mockReturning();
                  return [{ id: "sub-id", memberId: "member-id", amountCents: 12000 }];
                },
              };
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
          return {};
        },
      };
    },
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            where: () => mockSubscriptionResult,
          };
        },
      };
    },
    transaction: async (fn: (tx: unknown) => Promise<void>) => {
      mockTransaction();
      // Provide a tx object with the same update/insert interface
      const tx = {
        update: (...args: unknown[]) => {
          mockUpdate(...args);
          return {
            set: (...sArgs: unknown[]) => {
              mockSet(...sArgs);
              return {
                where: () => ({}),
              };
            },
          };
        },
        insert: (...args: unknown[]) => {
          mockInsert(...args);
          return {
            values: (...vArgs: unknown[]) => {
              mockValues(...vArgs);
              return {};
            },
          };
        },
      };
      await fn(tx);
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn().mockResolvedValue({ memberId: "admin-1", role: "ADMIN" }),
  canAccessAdmin: vi.fn().mockReturnValue(true),
}));

import { waiveSubscription, adjustSubscriptionAmount, recordOfflinePayment } from "../admin-actions";

beforeEach(() => {
  vi.clearAllMocks();
  mockSubscriptionResult = [
    { id: "sub-id", memberId: "member-id", amountCents: 12000 },
  ];
});

const BASE = {
  subscriptionId: "sub-id",
  organisationId: "org-id",
  slug: "demo",
};

describe("waiveSubscription", () => {
  it("updates status to WAIVED with the provided reason", async () => {
    const result = await waiveSubscription({ ...BASE, reason: "Hardship" });
    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "WAIVED", waivedReason: "Hardship" })
    );
  });

  it("returns error when reason is empty", async () => {
    const result = await waiveSubscription({ ...BASE, reason: "" });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns error when reason is whitespace only", async () => {
    const result = await waiveSubscription({ ...BASE, reason: "   " });
    expect(result.success).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("adjustSubscriptionAmount", () => {
  it("updates amountCents on the subscription", async () => {
    const result = await adjustSubscriptionAmount({ ...BASE, amountCents: 15000 });
    expect(result.success).toBe(true);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 15000 })
    );
  });

  it("returns error for negative amountCents", async () => {
    const result = await adjustSubscriptionAmount({ ...BASE, amountCents: -1 });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("allows zero amountCents", async () => {
    const result = await adjustSubscriptionAmount({ ...BASE, amountCents: 0 });
    expect(result.success).toBe(true);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 0 })
    );
  });

  it("returns error for non-integer amountCents", async () => {
    const result = await adjustSubscriptionAmount({ ...BASE, amountCents: 99.5 });
    expect(result.success).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("recordOfflinePayment", () => {
  it("marks subscription as PAID and creates a transaction", async () => {
    const result = await recordOfflinePayment({ ...BASE, adminName: "Jane Admin" });
    expect(result.success).toBe(true);
    // Should update subscription
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "PAID" })
    );
    // Should insert a transaction
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SUBSCRIPTION",
        amountCents: 12000,
        description: expect.stringContaining("Jane Admin"),
      })
    );
  });

  it("returns error when subscription is not found", async () => {
    mockSubscriptionResult = [];
    const result = await recordOfflinePayment({ ...BASE, adminName: "Jane Admin" });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
