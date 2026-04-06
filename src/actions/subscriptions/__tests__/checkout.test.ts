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
  subscriptions: {
    id: "id",
    organisationId: "organisation_id",
    memberId: "member_id",
    seasonId: "season_id",
    amountCents: "amount_cents",
    status: "status",
    stripePaymentIntentId: "stripe_payment_intent_id",
  },
  seasons: {
    id: "id",
    name: "name",
  },
}));

import { createSubscriptionCheckoutSession } from "../checkout";

describe("createSubscriptionCheckoutSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://snowgum.site";
  });

  it("returns error if user is not authenticated", async () => {
    mockGetSessionMember.mockResolvedValue(null);

    const result = await createSubscriptionCheckoutSession("org-1", "sub-1", "test-slug");
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

    const result = await createSubscriptionCheckoutSession("org-1", "sub-1", "test-slug");
    expect(result.success).toBe(false);
    expect(result.error).toContain("payments");
  });

  it("returns error if subscription not found", async () => {
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
          where: () => [],
        }),
      }),
    });

    const result = await createSubscriptionCheckoutSession("org-1", "sub-1", "test-slug");
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("returns error if subscription is not UNPAID", async () => {
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
            subscriptionId: "sub-1",
            amountCents: 15000,
            memberId: "m1",
            seasonName: "Winter 2027",
            status: "PAID",
            stripePaymentIntentId: null,
          }],
        }),
      }),
    });

    const result = await createSubscriptionCheckoutSession("org-1", "sub-1", "test-slug");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not payable");
  });

  it("returns error if subscription belongs to a different member", async () => {
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
            subscriptionId: "sub-1",
            amountCents: 15000,
            memberId: "m1",
            seasonName: "Winter 2027",
            status: "UNPAID",
            stripePaymentIntentId: null,
          }],
        }),
      }),
    });

    const result = await createSubscriptionCheckoutSession("org-1", "sub-1", "test-slug");
    expect(result.success).toBe(false);
    expect(result.error).toContain("permission");
  });

  it("creates checkout session and returns URL on success", async () => {
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
            subscriptionId: "sub-1",
            amountCents: 15000,
            memberId: "m1",
            seasonName: "Winter 2027",
            status: "UNPAID",
            stripePaymentIntentId: null,
          }],
        }),
      }),
    });

    mockGetStripeClient.mockReturnValue({
      checkout: {
        sessions: {
          create: mockStripeCheckoutCreate.mockResolvedValue({
            url: "https://checkout.stripe.com/c/pay/test456",
          }),
        },
      },
    });

    const result = await createSubscriptionCheckoutSession("org-1", "sub-1", "test-slug");
    expect(result.success).toBe(true);
    expect(result.url).toBe("https://checkout.stripe.com/c/pay/test456");
  });
});
