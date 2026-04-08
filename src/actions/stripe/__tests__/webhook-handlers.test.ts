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
    bookingReference: "booking_reference",
  },
  members: { id: "id", email: "email" },
  organisations: { id: "id", name: "name", contactEmail: "contact_email", logoUrl: "logo_url", slug: "slug", gstEnabled: "gst_enabled", gstRateBps: "gst_rate_bps", abnNumber: "abn_number", platformFeeBps: "platform_fee_bps" },
  subscriptions: { id: "id", memberId: "member_id", amountCents: "amount_cents", organisationId: "organisation_id", status: "status", paidAt: "paid_at", stripePaymentIntentId: "stripe_payment_intent_id", updatedAt: "updated_at" },
}));

const mockSendEmail = vi.fn();
vi.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock("@/lib/email/templates/payment-received", () => ({
  PaymentReceivedEmail: () => null,
}));

vi.mock("@/lib/email/templates/payment-expired", () => ({
  PaymentExpiredEmail: () => null,
}));

import { handleCheckoutSessionCompleted, handleCheckoutSessionExpired } from "../webhook-handlers";

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
    // Org GST lookup
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => [{ gstEnabled: false, gstRateBps: 1000, abnNumber: null }],
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
    // Get email data for payment received email
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => [{
              bookingReference: "PSKI-2027-0042",
              email: "jan@example.com",
              orgName: "Polski Ski Club",
              contactEmail: "admin@polski.com",
              logoUrl: null,
            }],
          }),
        }),
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

    expect(mockDbInsert).toHaveBeenCalled();
    expect(mockDbUpdate).toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalled();
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

describe("handleCheckoutSessionExpired", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends Payment Expired email", async () => {
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            innerJoin: () => ({
              where: () => [{
                bookingReference: "PSKI-2027-0042",
                email: "jan@example.com",
                orgName: "Polski Ski Club",
                contactEmail: "admin@polski.com",
                logoUrl: null,
                slug: "polski",
                amountCents: 84000,
              }],
            }),
          }),
        }),
      }),
    });

    await handleCheckoutSessionExpired({
      id: "cs_test_expired",
      metadata: {
        transactionId: "txn-1",
        bookingId: "bkg-1",
        organisationId: "org-1",
      },
    } as unknown as Stripe.Checkout.Session);

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining("expired"),
      })
    );
  });

  it("does nothing when metadata is missing", async () => {
    await handleCheckoutSessionExpired({
      id: "cs_test_expired",
      metadata: {},
    } as unknown as Stripe.Checkout.Session);

    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe("handleCheckoutSessionCompleted — subscription payment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks subscription as PAID and creates transaction when subscriptionId in metadata", async () => {
    // 1. Idempotency check → no existing SUBSCRIPTION transaction
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => [],
      }),
    });

    // 2. Subscription lookup → returns subscription data
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => [{
          id: "sub-1",
          memberId: "m-1",
          amountCents: 15000,
          organisationId: "org-1",
        }],
      }),
    });

    // 2b. Org GST lookup
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => [{ gstEnabled: false, gstRateBps: 1000, abnNumber: null }],
      }),
    });

    // 3. Insert SUBSCRIPTION transaction
    mockDbInsert.mockReturnValue({
      values: () => ({ returning: () => [{ id: "txn-sub-1" }] }),
    });

    // 4. Update subscription
    mockDbUpdate.mockReturnValue({
      set: () => ({ where: () => ({}) }),
    });

    // 5. Email data lookup → returns member/org data
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () => [{
            email: "jan@example.com",
            orgName: "Polski Ski Club",
            contactEmail: "admin@polski.com",
            logoUrl: null,
          }],
        }),
      }),
    });

    const session = {
      id: "cs_test_sub_123",
      payment_intent: "pi_test_sub_456",
      metadata: {
        subscriptionId: "sub-1",
        organisationId: "org-1",
      },
      amount_total: 15000,
    };

    await handleCheckoutSessionCompleted(session as unknown as Stripe.Checkout.Session);

    expect(mockDbInsert).toHaveBeenCalled();
    expect(mockDbUpdate).toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalled();
  });
});
