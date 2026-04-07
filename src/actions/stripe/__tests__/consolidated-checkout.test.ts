import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStripeCheckoutCreate = vi.fn();
const mockGetStripeClient = vi.fn();
const mockGetSessionMember = vi.fn();
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();

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
    insert: (...args: unknown[]) => mockDbInsert(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  organisations: {
    id: "id",
    stripeConnectAccountId: "stripe_connect_account_id",
    stripeConnectOnboardingComplete: "stripe_connect_onboarding_complete",
    platformFeeBps: "platform_fee_bps",
  },
  oneOffCharges: {
    id: "id",
    memberId: "member_id",
    amountCents: "amount_cents",
    categoryId: "category_id",
    description: "description",
    organisationId: "organisation_id",
    status: "status",
  },
  subscriptions: {
    id: "id",
    memberId: "member_id",
    amountCents: "amount_cents",
    organisationId: "organisation_id",
    status: "status",
  },
  transactions: {
    id: "id",
    memberId: "member_id",
    amountCents: "amount_cents",
    bookingId: "booking_id",
    organisationId: "organisation_id",
    type: "type",
  },
  bookings: {
    id: "id",
    bookingReference: "booking_reference",
  },
  chargeCategories: {
    id: "id",
    name: "name",
  },
  checkoutLineItems: {
    id: "id",
    stripeCheckoutSessionId: "stripe_checkout_session_id",
    chargeType: "charge_type",
    chargeId: "charge_id",
    amountCents: "amount_cents",
    memberId: "member_id",
  },
}));

import { createConsolidatedCheckoutSession } from "../consolidated-checkout";

describe("createConsolidatedCheckoutSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://snowgum.site";
  });

  it("returns error if user is not authenticated", async () => {
    mockGetSessionMember.mockResolvedValue(null);

    const result = await createConsolidatedCheckoutSession({
      organisationId: "org-1",
      slug: "test-club",
      chargeIds: ["charge-1"],
      subscriptionIds: [],
      invoiceTransactionIds: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("authenticated");
  });

  it("returns error if org has no Stripe connected", async () => {
    mockGetSessionMember.mockResolvedValue({ memberId: "m1", role: "MEMBER" });
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => [{ stripeConnectAccountId: null, stripeConnectOnboardingComplete: false, platformFeeBps: 100 }],
      }),
    });

    const result = await createConsolidatedCheckoutSession({
      organisationId: "org-1",
      slug: "test-club",
      chargeIds: ["charge-1"],
      subscriptionIds: [],
      invoiceTransactionIds: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("payments");
  });

  it("returns error if org has Stripe account but onboarding is incomplete", async () => {
    mockGetSessionMember.mockResolvedValue({ memberId: "m1", role: "MEMBER" });
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => [{
          stripeConnectAccountId: "acct_123",
          stripeConnectOnboardingComplete: false,
          platformFeeBps: 100,
        }],
      }),
    });

    const result = await createConsolidatedCheckoutSession({
      organisationId: "org-1",
      slug: "test-club",
      chargeIds: [],
      subscriptionIds: [],
      invoiceTransactionIds: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("payments");
  });

  it("returns error when no items selected (all arrays empty)", async () => {
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

    const result = await createConsolidatedCheckoutSession({
      organisationId: "org-1",
      slug: "test-club",
      chargeIds: [],
      subscriptionIds: [],
      invoiceTransactionIds: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("No items");
  });

  it("returns error when provided charge IDs resolve to no UNPAID items", async () => {
    mockGetSessionMember.mockResolvedValue({ memberId: "m1", role: "MEMBER" });
    // org lookup
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => [{
          stripeConnectAccountId: "acct_123",
          stripeConnectOnboardingComplete: true,
          platformFeeBps: 100,
        }],
      }),
    });
    // one-off charges query returns empty (already paid or not found)
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () => [],
        }),
      }),
    });

    const result = await createConsolidatedCheckoutSession({
      organisationId: "org-1",
      slug: "test-club",
      chargeIds: ["charge-already-paid"],
      subscriptionIds: [],
      invoiceTransactionIds: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("No items");
  });

  it("creates checkout session and returns URL with one-off charges", async () => {
    mockGetSessionMember.mockResolvedValue({ memberId: "m1", role: "MEMBER" });
    // org lookup
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => [{
          stripeConnectAccountId: "acct_123",
          stripeConnectOnboardingComplete: true,
          platformFeeBps: 100,
        }],
      }),
    });
    // one-off charges query
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () => [{
            id: "charge-1",
            memberId: "m1",
            amountCents: 5000,
            categoryName: "Equipment Fee",
            description: "Helmet",
          }],
        }),
      }),
    });

    mockGetStripeClient.mockReturnValue({
      checkout: {
        sessions: {
          create: mockStripeCheckoutCreate.mockResolvedValue({
            id: "cs_test_123",
            url: "https://checkout.stripe.com/c/pay/test123",
          }),
        },
      },
    });

    mockDbInsert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    const result = await createConsolidatedCheckoutSession({
      organisationId: "org-1",
      slug: "test-club",
      chargeIds: ["charge-1"],
      subscriptionIds: [],
      invoiceTransactionIds: [],
    });

    expect(result.success).toBe(true);
    expect(result.url).toBe("https://checkout.stripe.com/c/pay/test123");
    expect(mockStripeCheckoutCreate).toHaveBeenCalledOnce();
    expect(mockDbInsert).toHaveBeenCalledOnce();
  });

  it("creates checkout session with mixed item types", async () => {
    mockGetSessionMember.mockResolvedValue({ memberId: "m1", role: "MEMBER" });
    // org lookup
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => [{
          stripeConnectAccountId: "acct_123",
          stripeConnectOnboardingComplete: true,
          platformFeeBps: 100,
        }],
      }),
    });
    // one-off charges
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () => [{
            id: "charge-1",
            memberId: "m1",
            amountCents: 5000,
            categoryName: "Equipment Fee",
            description: null,
          }],
        }),
      }),
    });
    // subscriptions
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => [{
          id: "sub-1",
          memberId: "m1",
          amountCents: 20000,
        }],
      }),
    });

    mockGetStripeClient.mockReturnValue({
      checkout: {
        sessions: {
          create: mockStripeCheckoutCreate.mockResolvedValue({
            id: "cs_test_456",
            url: "https://checkout.stripe.com/c/pay/test456",
          }),
        },
      },
    });

    mockDbInsert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    const result = await createConsolidatedCheckoutSession({
      organisationId: "org-1",
      slug: "test-club",
      chargeIds: ["charge-1"],
      subscriptionIds: ["sub-1"],
      invoiceTransactionIds: [],
    });

    expect(result.success).toBe(true);
    expect(result.url).toBe("https://checkout.stripe.com/c/pay/test456");
    // Two line items inserted
    expect(mockDbInsert).toHaveBeenCalledTimes(2);

    // Verify line_items passed to Stripe contain both items
    const stripeParams = mockStripeCheckoutCreate.mock.calls[0][0];
    expect(stripeParams.line_items).toHaveLength(2);
    expect(stripeParams.line_items[0].price_data.product_data.name).toBe("Equipment Fee");
    expect(stripeParams.line_items[1].price_data.product_data.name).toBe("Membership Subscription");
  });
});
