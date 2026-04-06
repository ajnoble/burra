import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
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
    stripePaymentIntentId: "stripe_payment_intent_id",
    stripeCheckoutSessionId: "stripe_checkout_session_id",
    platformFeeCents: "platform_fee_cents",
    description: "description",
  },
  bookings: {
    id: "id",
    balancePaidAt: "balance_paid_at",
    updatedAt: "updated_at",
  },
}));

import { handleCheckoutSessionCompleted } from "../webhook-handlers";

describe("handleCheckoutSessionCompleted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates PAYMENT transaction and updates booking", async () => {
    // Check for existing payment — none found
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => [],
      }),
    });
    // Get invoice transaction
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => [{
          id: "txn-invoice-1",
          organisationId: "org-1",
          memberId: "m-1",
          bookingId: "bkg-1",
          amountCents: 84000,
        }],
      }),
    });
    // Insert payment transaction
    mockDbInsert.mockReturnValue({
      values: () => ({ returning: () => [{ id: "txn-payment-1" }] }),
    });
    // Update booking
    mockDbUpdate.mockReturnValue({
      set: () => ({ where: () => ({}) }),
    });

    const session = {
      id: "cs_test_123",
      payment_intent: "pi_test_456",
      metadata: {
        transactionId: "txn-invoice-1",
        bookingId: "bkg-1",
        organisationId: "org-1",
      },
      amount_total: 84000,
    };

    await handleCheckoutSessionCompleted(session as unknown as Stripe.Checkout.Session);

    expect(mockDbInsert).toHaveBeenCalled();
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it("skips processing if payment already exists (idempotent)", async () => {
    // Check for existing payment — found one
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => [{ id: "txn-existing" }],
      }),
    });

    const session = {
      id: "cs_test_123",
      payment_intent: "pi_test_456",
      metadata: {
        transactionId: "txn-invoice-1",
        bookingId: "bkg-1",
        organisationId: "org-1",
      },
      amount_total: 84000,
    };

    await handleCheckoutSessionCompleted(session as unknown as Stripe.Checkout.Session);

    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });
});
