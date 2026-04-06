import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStripeCheckoutCreate = vi.fn();
const mockGetStripeClient = vi.fn();
const mockGetSessionMember = vi.fn();
const mockDbSelect = vi.fn();

vi.mock("@/lib/stripe", async () => {
  const actual = await vi.importActual("@/lib/stripe");
  return {
    ...actual,
    getStripeClient: () => mockGetStripeClient(),
  };
});

vi.mock("@/lib/auth", () => ({
  getSessionMember: (...args: unknown[]) => mockGetSessionMember(...args),
}));

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  organisations: {
    id: "id",
    stripeConnectAccountId: "stripe_connect_account_id",
    stripeConnectOnboardingComplete: "stripe_connect_onboarding_complete",
    platformFeeBps: "platform_fee_bps",
  },
  transactions: {
    id: "id",
    organisationId: "organisation_id",
    memberId: "member_id",
    bookingId: "booking_id",
    type: "type",
    amountCents: "amount_cents",
    stripePaymentIntentId: "stripe_payment_intent_id",
  },
  bookings: {
    id: "id",
    bookingReference: "booking_reference",
    totalAmountCents: "total_amount_cents",
    primaryMemberId: "primary_member_id",
    status: "status",
  },
}));

import { createCheckoutSession } from "../checkout";

describe("createCheckoutSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://snowgum.site";
  });

  it("returns error if user is not authenticated", async () => {
    mockGetSessionMember.mockResolvedValue(null);

    const result = await createCheckoutSession("org-1", "txn-1", "test-slug");
    expect(result.success).toBe(false);
    expect(result.error).toContain("authenticated");
  });

  it("returns error if org has no Stripe account", async () => {
    mockGetSessionMember.mockResolvedValue({ memberId: "m1", role: "MEMBER" });
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => [{ stripeConnectAccountId: null, stripeConnectOnboardingComplete: false, platformFeeBps: 100 }],
      }),
    });

    const result = await createCheckoutSession("org-1", "txn-1", "test-slug");
    expect(result.success).toBe(false);
    expect(result.error).toContain("payments");
  });

  it("returns error if transaction already has a payment", async () => {
    mockGetSessionMember.mockResolvedValue({ memberId: "m1", role: "MEMBER" });
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => [{
          stripeConnectAccountId: "acct_123",
          stripeConnectOnboardingComplete: true,
          platformFeeBps: 100,
        }],
      }),
    });
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () => [{
            transactionId: "txn-1",
            amountCents: 84000,
            bookingId: "bkg-1",
            bookingReference: "POLS-2027-7K3M",
            memberId: "m1",
            stripePaymentIntentId: "pi_existing",
          }],
        }),
      }),
    });

    const result = await createCheckoutSession("org-1", "txn-1", "test-slug");
    expect(result.success).toBe(false);
    expect(result.error).toContain("already");
  });

  it("creates checkout session and returns URL", async () => {
    mockGetSessionMember.mockResolvedValue({ memberId: "m1", role: "MEMBER" });
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => [{
          stripeConnectAccountId: "acct_123",
          stripeConnectOnboardingComplete: true,
          platformFeeBps: 100,
        }],
      }),
    });
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () => [{
            transactionId: "txn-1",
            amountCents: 84000,
            bookingId: "bkg-1",
            bookingReference: "POLS-2027-7K3M",
            memberId: "m1",
            stripePaymentIntentId: null,
          }],
        }),
      }),
    });

    // Booking status check
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => [{ status: "CONFIRMED" }],
      }),
    });

    mockGetStripeClient.mockReturnValue({
      checkout: {
        sessions: {
          create: mockStripeCheckoutCreate.mockResolvedValue({
            url: "https://checkout.stripe.com/c/pay/test123",
          }),
        },
      },
    });

    const result = await createCheckoutSession("org-1", "txn-1", "test-slug");
    expect(result.success).toBe(true);
    expect(result.url).toBe("https://checkout.stripe.com/c/pay/test123");
  });

  it("rejects if member does not own the booking", async () => {
    mockGetSessionMember.mockResolvedValue({ memberId: "m-other", role: "MEMBER" });
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => [{
          stripeConnectAccountId: "acct_123",
          stripeConnectOnboardingComplete: true,
          platformFeeBps: 100,
        }],
      }),
    });
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () => [{
            transactionId: "txn-1",
            amountCents: 84000,
            bookingId: "bkg-1",
            bookingReference: "POLS-2027-7K3M",
            memberId: "m1",
            stripePaymentIntentId: null,
          }],
        }),
      }),
    });

    // Booking status check
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => [{ status: "CONFIRMED" }],
      }),
    });

    const result = await createCheckoutSession("org-1", "txn-1", "test-slug");
    expect(result.success).toBe(false);
    expect(result.error).toContain("permission");
  });
});
