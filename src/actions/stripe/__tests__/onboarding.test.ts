import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStripeAccountsCreate = vi.fn();
const mockStripeAccountLinksCreate = vi.fn();
const mockStripeAccountsRetrieve = vi.fn();
const mockGetStripeClient = vi.fn();
const mockGetSessionMember = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbSelect = vi.fn();

vi.mock("@/lib/stripe", () => ({
  getStripeClient: () => mockGetStripeClient(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: (...args: unknown[]) => mockGetSessionMember(...args),
}));

vi.mock("@/db/index", () => ({
  db: {
    update: (...args: unknown[]) => mockDbUpdate(...args),
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  organisations: {
    id: "id",
    slug: "slug",
    stripeConnectAccountId: "stripe_connect_account_id",
    stripeConnectOnboardingComplete: "stripe_connect_onboarding_complete",
    updatedAt: "updated_at",
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  createConnectAccount,
  verifyOnboardingStatus,
} from "../onboarding";

describe("createConnectAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error if user is not an admin", async () => {
    mockGetSessionMember.mockResolvedValue({ role: "MEMBER" });

    const result = await createConnectAccount("org-1", "test-slug");
    expect(result.success).toBe(false);
    expect(result.error).toContain("permission");
  });

  it("returns error if org already has a Stripe account", async () => {
    mockGetSessionMember.mockResolvedValue({ role: "ADMIN" });
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [{ stripeConnectAccountId: "acct_existing" }],
      }),
    });

    const result = await createConnectAccount("org-1", "test-slug");
    expect(result.success).toBe(false);
    expect(result.error).toContain("already");
  });

  it("creates account and returns onboarding URL", async () => {
    mockGetSessionMember.mockResolvedValue({ role: "ADMIN" });
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [{ stripeConnectAccountId: null }],
      }),
    });

    mockGetStripeClient.mockReturnValue({
      accounts: {
        create: mockStripeAccountsCreate.mockResolvedValue({
          id: "acct_new123",
        }),
      },
      accountLinks: {
        create: mockStripeAccountLinksCreate.mockResolvedValue({
          url: "https://connect.stripe.com/setup/s/test123",
        }),
      },
    });

    mockDbUpdate.mockReturnValue({
      set: () => ({
        where: () => ({ returning: () => [{ slug: "test-slug" }] }),
      }),
    });

    const result = await createConnectAccount("org-1", "test-slug");
    expect(result.success).toBe(true);
    expect(result.url).toBe("https://connect.stripe.com/setup/s/test123");
    expect(mockStripeAccountsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: "express" })
    );
  });
});

describe("verifyOnboardingStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns not_started if no Stripe account ID", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [{ stripeConnectAccountId: null, stripeConnectOnboardingComplete: false }],
      }),
    });

    const result = await verifyOnboardingStatus("org-1");
    expect(result.status).toBe("not_started");
  });

  it("returns complete if charges_enabled is true", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [{ stripeConnectAccountId: "acct_123", stripeConnectOnboardingComplete: false }],
      }),
    });

    mockGetStripeClient.mockReturnValue({
      accounts: {
        retrieve: mockStripeAccountsRetrieve.mockResolvedValue({
          charges_enabled: true,
        }),
      },
    });

    mockDbUpdate.mockReturnValue({
      set: () => ({
        where: () => ({ returning: () => [{ slug: "test-slug" }] }),
      }),
    });

    const result = await verifyOnboardingStatus("org-1");
    expect(result.status).toBe("complete");
  });

  it("returns pending if charges_enabled is false", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => [{ stripeConnectAccountId: "acct_123", stripeConnectOnboardingComplete: false }],
      }),
    });

    mockGetStripeClient.mockReturnValue({
      accounts: {
        retrieve: mockStripeAccountsRetrieve.mockResolvedValue({
          charges_enabled: false,
        }),
      },
    });

    const result = await verifyOnboardingStatus("org-1");
    expect(result.status).toBe("pending");
  });
});
