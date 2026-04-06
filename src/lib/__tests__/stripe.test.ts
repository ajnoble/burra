import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("stripe", () => {
  return {
    default: vi.fn().mockImplementation(() => ({})),
  };
});

describe("getStripeClient", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("throws if STRIPE_SECRET_KEY is not set", async () => {
    const originalKey = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      const { getStripeClient } = await import("../stripe");
      expect(() => getStripeClient()).toThrow("STRIPE_SECRET_KEY");
    } finally {
      if (originalKey) process.env.STRIPE_SECRET_KEY = originalKey;
    }
  });
});

describe("buildCheckoutSessionParams", () => {
  it("builds correct params with platform fee", async () => {
    const { buildCheckoutSessionParams } = await import("../stripe");

    const params = buildCheckoutSessionParams({
      connectedAccountId: "acct_test123",
      transactionId: "txn-uuid-1",
      bookingId: "bkg-uuid-1",
      organisationId: "org-uuid-1",
      bookingReference: "POLS-2027-7K3M",
      amountCents: 84000,
      platformFeeBps: 100,
      successUrl: "https://snowgum.site/pols/payment/success?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "https://snowgum.site/pols/payment/cancelled",
    });

    expect(params.mode).toBe("payment");
    expect(params.line_items).toEqual([
      {
        price_data: {
          currency: "aud",
          product_data: { name: "Booking POLS-2027-7K3M" },
          unit_amount: 84000,
        },
        quantity: 1,
      },
    ]);
    expect(params.payment_intent_data?.application_fee_amount).toBe(840);
    expect(params.metadata).toEqual({
      transactionId: "txn-uuid-1",
      bookingId: "bkg-uuid-1",
      organisationId: "org-uuid-1",
    });
    expect(params.success_url).toContain("session_id");
    expect(params.cancel_url).toContain("cancelled");
  });

  it("calculates platform fee correctly for small amounts", async () => {
    const { buildCheckoutSessionParams } = await import("../stripe");

    const params = buildCheckoutSessionParams({
      connectedAccountId: "acct_test123",
      transactionId: "txn-uuid-1",
      bookingId: "bkg-uuid-1",
      organisationId: "org-uuid-1",
      bookingReference: "POLS-2027-ABCD",
      amountCents: 333,
      platformFeeBps: 100,
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    });

    // 333 * 100 / 10000 = 3.33, rounds to 3
    expect(params.payment_intent_data?.application_fee_amount).toBe(3);
  });

  it("handles zero platform fee", async () => {
    const { buildCheckoutSessionParams } = await import("../stripe");

    const params = buildCheckoutSessionParams({
      connectedAccountId: "acct_test123",
      transactionId: "txn-uuid-1",
      bookingId: "bkg-uuid-1",
      organisationId: "org-uuid-1",
      bookingReference: "POLS-2027-ABCD",
      amountCents: 10000,
      platformFeeBps: 0,
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    });

    expect(params.payment_intent_data?.application_fee_amount).toBe(0);
  });
});
