// src/actions/stripe/__tests__/refund.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockRefundCreate = vi.fn();

let selectCallCount = 0;

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      const overrideResult = mockSelect(...args);
      if (overrideResult !== undefined) return overrideResult;
      const callIndex = selectCallCount++;
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            where: () => {
              // call 0: PAYMENT transaction
              if (callIndex === 0) {
                return [{ stripePaymentIntentId: "pi_123", organisationId: "org-1" }];
              }
              // call 1: org Stripe account
              if (callIndex === 1) {
                return [{ stripeConnectAccountId: "acct_123" }];
              }
              return [];
            },
          };
        },
      };
    },
  },
}));

vi.mock("@/lib/stripe", () => ({
  getStripeClient: () => ({
    refunds: {
      create: (...args: unknown[]) => {
        mockRefundCreate(...args);
        return { id: "re_123" };
      },
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
});

import { processStripeRefund } from "../refund";

describe("processStripeRefund", () => {
  it("creates a Stripe refund on the connected account", async () => {
    const result = await processStripeRefund("booking-1", 42000);
    expect(result.success).toBe(true);
    expect(result.stripeRefundId).toBe("re_123");
    expect(mockRefundCreate).toHaveBeenCalledWith(
      { payment_intent: "pi_123", amount: 42000 },
      { stripeAccount: "acct_123" }
    );
  });

  it("returns success with no refund when no payment exists", async () => {
    selectCallCount = 0;
    vi.mocked(mockSelect).mockImplementationOnce(() => ({
      from: () => ({
        where: () => [], // no PAYMENT transaction
      }),
    }));
    const result = await processStripeRefund("booking-1", 42000);
    expect(result.success).toBe(true);
    expect(result.stripeRefundId).toBeUndefined();
    expect(mockRefundCreate).not.toHaveBeenCalled();
  });
});
