# Phase 7: Stripe Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Stripe Connect so clubs can accept booking payments from members via Stripe Checkout, with a 1% platform fee.

**Architecture:** Server actions for mutations (onboarding, checkout session creation), a single API route for the Stripe webhook. Invoice-first model — bookings create invoices at confirmation, members pay later via dashboard. Each club has its own Stripe Connect Express account.

**Tech Stack:** Stripe SDK (`stripe` v22), Next.js 16 App Router, Drizzle ORM, Vitest, Zod

**Spec:** `docs/superpowers/specs/2026-04-06-stripe-connect-design.md`

---

### Task 1: Schema Changes — Add New Columns

**Files:**
- Modify: `src/db/schema/organisations.ts`
- Modify: `src/db/schema/transactions.ts`

- [ ] **Step 1: Add `platformFeeBps` to organisations schema**

In `src/db/schema/organisations.ts`, add the import for `integer` and the new column:

```typescript
import { pgTable, uuid, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
```

Add after the `stripeConnectOnboardingComplete` field:

```typescript
  platformFeeBps: integer("platform_fee_bps").notNull().default(100), // 100 bps = 1%
```

- [ ] **Step 2: Add `stripeCheckoutSessionId` and `platformFeeCents` to transactions schema**

In `src/db/schema/transactions.ts`, add two new columns after `stripePaymentIntentId`:

```typescript
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  platformFeeCents: integer("platform_fee_cents"),
```

- [ ] **Step 3: Generate and apply migration**

Run:
```bash
npm run db:generate
npm run db:migrate
```

Expected: Migration file created in `drizzle/` with `ALTER TABLE` statements adding the three columns.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/organisations.ts src/db/schema/transactions.ts drizzle/
git commit -m "feat: add platform fee and checkout session schema columns for Stripe Connect"
```

---

### Task 2: Stripe Client Library

**Files:**
- Create: `src/lib/stripe.ts`
- Create: `src/lib/__tests__/stripe.test.ts`

- [ ] **Step 1: Write failing tests for Stripe helpers**

Create `src/lib/__tests__/stripe.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/stripe.test.ts`
Expected: FAIL — module `../stripe` not found

- [ ] **Step 3: Implement `src/lib/stripe.ts`**

```typescript
import Stripe from "stripe";
import { applyBasisPoints } from "./currency";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  stripeClient = new Stripe(key);
  return stripeClient;
}

export type CheckoutSessionInput = {
  connectedAccountId: string;
  transactionId: string;
  bookingId: string;
  organisationId: string;
  bookingReference: string;
  amountCents: number;
  platformFeeBps: number;
  successUrl: string;
  cancelUrl: string;
};

export function buildCheckoutSessionParams(input: CheckoutSessionInput): Stripe.Checkout.SessionCreateParams {
  const platformFeeCents = applyBasisPoints(input.amountCents, input.platformFeeBps);

  return {
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "aud",
          product_data: { name: `Booking ${input.bookingReference}` },
          unit_amount: input.amountCents,
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: platformFeeCents,
    },
    metadata: {
      transactionId: input.transactionId,
      bookingId: input.bookingId,
      organisationId: input.organisationId,
    },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/stripe.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/stripe.ts src/lib/__tests__/stripe.test.ts
git commit -m "feat: add Stripe client singleton and checkout session param builder"
```

---

### Task 3: Stripe Connect Onboarding — Server Actions

**Files:**
- Create: `src/actions/stripe/onboarding.ts`
- Create: `src/actions/stripe/__tests__/onboarding.test.ts`

- [ ] **Step 1: Write failing tests for onboarding actions**

Create `src/actions/stripe/__tests__/onboarding.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/stripe/__tests__/onboarding.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/actions/stripe/onboarding.ts`**

```typescript
"use server";

import { db } from "@/db/index";
import { organisations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getStripeClient } from "@/lib/stripe";
import { getSessionMember } from "@/lib/auth";
import { revalidatePath } from "next/cache";

type OnboardingResult = {
  success: boolean;
  url?: string;
  error?: string;
};

export async function createConnectAccount(
  organisationId: string,
  slug: string
): Promise<OnboardingResult> {
  const session = await getSessionMember(organisationId);
  if (!session || session.role !== "ADMIN") {
    return { success: false, error: "You do not have permission to manage payments" };
  }

  const [org] = await db
    .select({
      stripeConnectAccountId: organisations.stripeConnectAccountId,
    })
    .from(organisations)
    .where(eq(organisations.id, organisationId));

  if (org?.stripeConnectAccountId) {
    return { success: false, error: "This organisation already has a Stripe account connected" };
  }

  const stripe = getStripeClient();

  const account = await stripe.accounts.create({
    type: "express",
    country: "AU",
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });

  await db
    .update(organisations)
    .set({
      stripeConnectAccountId: account.id,
      updatedAt: new Date(),
    })
    .where(eq(organisations.id, organisationId));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${appUrl}/${slug}/admin/settings/stripe/refresh`,
    return_url: `${appUrl}/${slug}/admin/settings/stripe/return`,
    type: "account_onboarding",
  });

  revalidatePath(`/${slug}/admin/settings`);

  return { success: true, url: accountLink.url };
}

export async function generateOnboardingLink(
  organisationId: string,
  slug: string
): Promise<OnboardingResult> {
  const session = await getSessionMember(organisationId);
  if (!session || session.role !== "ADMIN") {
    return { success: false, error: "You do not have permission to manage payments" };
  }

  const [org] = await db
    .select({
      stripeConnectAccountId: organisations.stripeConnectAccountId,
    })
    .from(organisations)
    .where(eq(organisations.id, organisationId));

  if (!org?.stripeConnectAccountId) {
    return { success: false, error: "No Stripe account found. Please connect first." };
  }

  const stripe = getStripeClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const accountLink = await stripe.accountLinks.create({
    account: org.stripeConnectAccountId,
    refresh_url: `${appUrl}/${slug}/admin/settings/stripe/refresh`,
    return_url: `${appUrl}/${slug}/admin/settings/stripe/return`,
    type: "account_onboarding",
  });

  return { success: true, url: accountLink.url };
}

type OnboardingStatus = {
  status: "not_started" | "pending" | "complete";
  accountId?: string;
};

export async function verifyOnboardingStatus(
  organisationId: string
): Promise<OnboardingStatus> {
  const [org] = await db
    .select({
      stripeConnectAccountId: organisations.stripeConnectAccountId,
      stripeConnectOnboardingComplete: organisations.stripeConnectOnboardingComplete,
    })
    .from(organisations)
    .where(eq(organisations.id, organisationId));

  if (!org?.stripeConnectAccountId) {
    return { status: "not_started" };
  }

  if (org.stripeConnectOnboardingComplete) {
    return { status: "complete", accountId: org.stripeConnectAccountId };
  }

  const stripe = getStripeClient();
  const account = await stripe.accounts.retrieve(org.stripeConnectAccountId);

  if (account.charges_enabled) {
    await db
      .update(organisations)
      .set({
        stripeConnectOnboardingComplete: true,
        updatedAt: new Date(),
      })
      .where(eq(organisations.id, organisationId));

    return { status: "complete", accountId: org.stripeConnectAccountId };
  }

  return { status: "pending", accountId: org.stripeConnectAccountId };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/stripe/__tests__/onboarding.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/stripe/onboarding.ts src/actions/stripe/__tests__/onboarding.test.ts
git commit -m "feat: add Stripe Connect onboarding server actions"
```

---

### Task 4: Checkout Session — Server Action

**Files:**
- Create: `src/actions/stripe/checkout.ts`
- Create: `src/actions/stripe/__tests__/checkout.test.ts`

- [ ] **Step 1: Write failing tests for checkout action**

Create `src/actions/stripe/__tests__/checkout.test.ts`:

```typescript
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
    // Org query
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => [{
          stripeConnectAccountId: "acct_123",
          stripeConnectOnboardingComplete: true,
          platformFeeBps: 100,
        }],
      }),
    });
    // Transaction query — already has payment intent
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
    // Org query
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => [{
          stripeConnectAccountId: "acct_123",
          stripeConnectOnboardingComplete: true,
          platformFeeBps: 100,
        }],
      }),
    });
    // Transaction query
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
    // Org query
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => [{
          stripeConnectAccountId: "acct_123",
          stripeConnectOnboardingComplete: true,
          platformFeeBps: 100,
        }],
      }),
    });
    // Transaction query — different member
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

    const result = await createCheckoutSession("org-1", "txn-1", "test-slug");
    expect(result.success).toBe(false);
    expect(result.error).toContain("permission");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/stripe/__tests__/checkout.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/actions/stripe/checkout.ts`**

```typescript
"use server";

import { db } from "@/db/index";
import { organisations, transactions, bookings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getStripeClient, buildCheckoutSessionParams } from "@/lib/stripe";
import { getSessionMember } from "@/lib/auth";

type CheckoutResult = {
  success: boolean;
  url?: string;
  error?: string;
};

export async function createCheckoutSession(
  organisationId: string,
  transactionId: string,
  slug: string
): Promise<CheckoutResult> {
  const session = await getSessionMember(organisationId);
  if (!session) {
    return { success: false, error: "You must be authenticated to make a payment" };
  }

  // Check org has Stripe connected
  const [org] = await db
    .select({
      stripeConnectAccountId: organisations.stripeConnectAccountId,
      stripeConnectOnboardingComplete: organisations.stripeConnectOnboardingComplete,
      platformFeeBps: organisations.platformFeeBps,
    })
    .from(organisations)
    .where(eq(organisations.id, organisationId));

  if (!org?.stripeConnectAccountId || !org.stripeConnectOnboardingComplete) {
    return { success: false, error: "This organisation has not set up payments yet" };
  }

  // Get the invoice transaction with booking details
  const [txn] = await db
    .select({
      transactionId: transactions.id,
      amountCents: transactions.amountCents,
      bookingId: transactions.bookingId,
      bookingReference: bookings.bookingReference,
      memberId: transactions.memberId,
      stripePaymentIntentId: transactions.stripePaymentIntentId,
    })
    .from(transactions)
    .innerJoin(bookings, eq(bookings.id, transactions.bookingId))
    .where(
      and(
        eq(transactions.id, transactionId),
        eq(transactions.organisationId, organisationId),
        eq(transactions.type, "INVOICE")
      )
    );

  if (!txn) {
    return { success: false, error: "Invoice not found" };
  }

  if (txn.stripePaymentIntentId) {
    return { success: false, error: "This invoice has already been paid" };
  }

  if (txn.memberId !== session.memberId) {
    return { success: false, error: "You do not have permission to pay this invoice" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const stripe = getStripeClient();
  const params = buildCheckoutSessionParams({
    connectedAccountId: org.stripeConnectAccountId,
    transactionId: txn.transactionId,
    bookingId: txn.bookingId!,
    organisationId,
    bookingReference: txn.bookingReference,
    amountCents: txn.amountCents,
    platformFeeBps: org.platformFeeBps,
    successUrl: `${appUrl}/${slug}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl}/${slug}/payment/cancelled`,
  });

  const checkoutSession = await stripe.checkout.sessions.create(params, {
    stripeAccount: org.stripeConnectAccountId,
  });

  if (!checkoutSession.url) {
    return { success: false, error: "Failed to create payment session" };
  }

  return { success: true, url: checkoutSession.url };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/stripe/__tests__/checkout.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/stripe/checkout.ts src/actions/stripe/__tests__/checkout.test.ts
git commit -m "feat: add checkout session creation server action"
```

---

### Task 5: Stripe Webhook Handler

**Files:**
- Create: `src/app/api/webhooks/stripe/route.ts`
- Create: `src/actions/stripe/webhook-handlers.ts`
- Create: `src/actions/stripe/__tests__/webhook-handlers.test.ts`

- [ ] **Step 1: Write failing tests for webhook handler logic**

Create `src/actions/stripe/__tests__/webhook-handlers.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

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

    await handleCheckoutSessionCompleted(session as any);

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

    await handleCheckoutSessionCompleted(session as any);

    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/stripe/__tests__/webhook-handlers.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/actions/stripe/webhook-handlers.ts`**

```typescript
import { db } from "@/db/index";
import { transactions, bookings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type Stripe from "stripe";
import { applyBasisPoints } from "@/lib/currency";

export async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  if (!paymentIntentId) return;

  const { transactionId, bookingId, organisationId } = session.metadata ?? {};
  if (!transactionId || !bookingId || !organisationId) return;

  // Idempotency check: skip if we already recorded this payment
  const [existing] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.stripePaymentIntentId, paymentIntentId),
        eq(transactions.type, "PAYMENT")
      )
    );

  if (existing) return;

  // Get the invoice transaction for member/amount info
  const [invoice] = await db
    .select({
      id: transactions.id,
      organisationId: transactions.organisationId,
      memberId: transactions.memberId,
      bookingId: transactions.bookingId,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .where(eq(transactions.id, transactionId));

  if (!invoice) return;

  const amountCents = session.amount_total ?? invoice.amountCents;
  const platformFeeCents = applyBasisPoints(amountCents, 100);

  // Create PAYMENT transaction
  await db.insert(transactions).values({
    organisationId: invoice.organisationId,
    memberId: invoice.memberId,
    bookingId: invoice.bookingId,
    type: "PAYMENT",
    amountCents: amountCents,
    stripePaymentIntentId: paymentIntentId,
    stripeCheckoutSessionId: session.id,
    platformFeeCents,
    description: `Payment received for invoice ${invoice.id}`,
  });

  // Update booking payment timestamp
  await db
    .update(bookings)
    .set({
      balancePaidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, bookingId));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/stripe/__tests__/webhook-handlers.test.ts`
Expected: All 2 tests PASS

- [ ] **Step 5: Implement the API route**

Create `src/app/api/webhooks/stripe/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { handleCheckoutSessionCompleted } from "@/actions/stripe/webhook-handlers";
import type Stripe from "stripe";

export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Webhook signature verification failed: ${message}`);
    return new Response(`Webhook Error: ${message}`, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutSessionCompleted(session);
      break;
    }
    case "checkout.session.expired":
      console.log(`Checkout session expired: ${event.data.object.id}`);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return new Response("OK", { status: 200 });
}
```

- [ ] **Step 6: Commit**

```bash
git add src/actions/stripe/webhook-handlers.ts src/actions/stripe/__tests__/webhook-handlers.test.ts src/app/api/webhooks/stripe/route.ts
git commit -m "feat: add Stripe webhook handler with idempotent payment processing"
```

---

### Task 6: Stripe Connect Card — Admin Settings UI

**Files:**
- Create: `src/app/[slug]/admin/settings/stripe-connect-card.tsx`
- Modify: `src/app/[slug]/admin/settings/page.tsx`

- [ ] **Step 1: Create the StripeConnectCard component**

Create `src/app/[slug]/admin/settings/stripe-connect-card.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createConnectAccount, generateOnboardingLink } from "@/actions/stripe/onboarding";

type StripeConnectCardProps = {
  organisationId: string;
  slug: string;
  status: "not_started" | "pending" | "complete";
  accountId?: string | null;
  platformFeeBps: number;
};

export function StripeConnectCard({
  organisationId,
  slug,
  status,
  accountId,
  platformFeeBps,
}: StripeConnectCardProps) {
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    setLoading(true);
    try {
      const result = await createConnectAccount(organisationId, slug);
      if (result.success && result.url) {
        window.location.href = result.url;
      } else {
        toast.error(result.error || "Failed to start Stripe onboarding");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  async function handleContinueSetup() {
    setLoading(true);
    try {
      const result = await generateOnboardingLink(organisationId, slug);
      if (result.success && result.url) {
        window.location.href = result.url;
      } else {
        toast.error(result.error || "Failed to generate onboarding link");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  const feePercent = (platformFeeBps / 100).toFixed(platformFeeBps % 100 === 0 ? 0 : 1);

  return (
    <div className="rounded-lg border p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-medium">Payment Processing</h3>
          <p className="text-sm text-muted-foreground">
            {status === "complete"
              ? "Stripe Connect is active for your organisation"
              : "Connect your Stripe account to accept booking payments"}
          </p>
        </div>
        <span
          className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
            status === "complete"
              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
              : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
          }`}
        >
          {status === "complete"
            ? "Connected"
            : status === "pending"
              ? "Pending"
              : "Not connected"}
        </span>
      </div>

      {status === "not_started" && (
        <>
          <div className="rounded-md bg-muted p-4 mb-4">
            <p className="text-sm text-muted-foreground">
              Stripe Connect lets your club accept credit card payments for
              bookings. Members will be able to pay invoices directly from their
              dashboard. A {feePercent}% platform fee applies to each transaction.
            </p>
          </div>
          <Button onClick={handleConnect} disabled={loading}>
            {loading ? "Connecting..." : "Connect with Stripe →"}
          </Button>
        </>
      )}

      {status === "pending" && (
        <>
          <div className="rounded-md bg-muted p-4 mb-4">
            <p className="text-sm text-muted-foreground">
              Your Stripe account has been created but onboarding is not yet
              complete. Click below to continue the setup process.
            </p>
          </div>
          <Button onClick={handleContinueSetup} disabled={loading}>
            {loading ? "Loading..." : "Continue Setup →"}
          </Button>
        </>
      )}

      {status === "complete" && accountId && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Account ID</span>
            <span className="font-mono">
              {accountId.slice(0, 9)}...{accountId.slice(-4)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Status</span>
            <span className="text-green-600 dark:text-green-400">Charges enabled</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Platform fee</span>
            <span>{feePercent}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update the settings page to include the card**

In `src/app/[slug]/admin/settings/page.tsx`, add the import and render the card. Replace the entire file:

```typescript
import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { OrgSettingsForm } from "./org-settings-form";
import { MembershipClassManager } from "./membership-class-manager";
import { StripeConnectCard } from "./stripe-connect-card";
import { Separator } from "@/components/ui/separator";
import { db } from "@/db/index";
import { membershipClasses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyOnboardingStatus } from "@/actions/stripe/onboarding";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const classes = await db
    .select()
    .from(membershipClasses)
    .where(eq(membershipClasses.organisationId, org.id))
    .orderBy(membershipClasses.sortOrder);

  const onboarding = await verifyOnboardingStatus(org.id);

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Organisation Settings</h1>

      <OrgSettingsForm org={org} />

      <Separator className="my-8" />

      <h2 className="text-xl font-bold mb-4">Payments</h2>
      <StripeConnectCard
        organisationId={org.id}
        slug={slug}
        status={onboarding.status}
        accountId={onboarding.accountId}
        platformFeeBps={org.platformFeeBps}
      />

      <Separator className="my-8" />

      <h2 className="text-xl font-bold mb-4">Membership Classes</h2>
      <MembershipClassManager
        organisationId={org.id}
        initialClasses={classes}
      />
    </div>
  );
}
```

- [ ] **Step 3: Run lint and build to verify**

Run: `npm run lint && npm run build`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/[slug]/admin/settings/stripe-connect-card.tsx src/app/[slug]/admin/settings/page.tsx
git commit -m "feat: add Stripe Connect onboarding card to admin settings"
```

---

### Task 7: Onboarding Return & Refresh Pages

**Files:**
- Create: `src/app/[slug]/admin/settings/stripe/return/page.tsx`
- Create: `src/app/[slug]/admin/settings/stripe/refresh/page.tsx`

- [ ] **Step 1: Create the return page**

Create `src/app/[slug]/admin/settings/stripe/return/page.tsx`:

```typescript
import { getOrgBySlug } from "@/lib/org";
import { notFound, redirect } from "next/navigation";
import { verifyOnboardingStatus } from "@/actions/stripe/onboarding";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function StripeReturnPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const onboarding = await verifyOnboardingStatus(org.id);

  if (onboarding.status === "complete") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
          <span className="text-green-600 dark:text-green-400 text-2xl">✓</span>
        </div>
        <h1 className="text-2xl font-bold">Stripe Connected</h1>
        <p className="text-muted-foreground text-center max-w-md">
          Your Stripe account is now connected. Members can pay booking invoices
          directly from their dashboard.
        </p>
        <Button render={<Link href={`/${slug}/admin/settings`} />}>
          Back to Settings
        </Button>
      </div>
    );
  }

  // Onboarding not yet complete
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="w-12 h-12 rounded-full bg-yellow-100 dark:bg-yellow-900 flex items-center justify-center">
        <span className="text-yellow-600 dark:text-yellow-400 text-2xl">!</span>
      </div>
      <h1 className="text-2xl font-bold">Setup Incomplete</h1>
      <p className="text-muted-foreground text-center max-w-md">
        Your Stripe account setup is not yet complete. Please return to settings
        to continue the onboarding process.
      </p>
      <Button render={<Link href={`/${slug}/admin/settings`} />}>
        Back to Settings
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Create the refresh page**

Create `src/app/[slug]/admin/settings/stripe/refresh/page.tsx`:

```typescript
import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { generateOnboardingLink } from "@/actions/stripe/onboarding";
import { redirect } from "next/navigation";

export default async function StripeRefreshPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  // Try to generate a fresh onboarding link
  const result = await generateOnboardingLink(org.id, slug);

  if (result.success && result.url) {
    redirect(result.url);
  }

  // Fallback: send back to settings
  redirect(`/${slug}/admin/settings`);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/[slug]/admin/settings/stripe/
git commit -m "feat: add Stripe onboarding return and refresh pages"
```

---

### Task 8: Payment Button & Dashboard Integration

**Files:**
- Create: `src/app/[slug]/dashboard/payment-button.tsx`
- Modify: `src/app/[slug]/dashboard/page.tsx`
- Modify: `src/actions/bookings/queries.ts`

- [ ] **Step 1: Add payment status to BookingListItem type and query**

In `src/actions/bookings/queries.ts`, update the `BookingListItem` type to include payment info. Add to the type:

```typescript
export type BookingListItem = {
  id: string;
  bookingReference: string;
  lodgeName: string;
  checkInDate: string;
  checkOutDate: string;
  totalNights: number;
  totalAmountCents: number;
  status: string;
  guestCount: number;
  createdAt: Date;
  invoiceTransactionId: string | null;
  balancePaidAt: Date | null;
};
```

Update the `getUpcomingBookings` function to include `balancePaidAt` in the select:

Add `balancePaidAt: bookings.balancePaidAt` to the `.select()` call in `getUpcomingBookings`.

Then after the guest count query, add a query for invoice transaction IDs:

```typescript
  // Get invoice transaction IDs for unpaid bookings
  const invoiceTxns = bookingIds.length > 0
    ? await db
        .select({
          bookingId: transactions.bookingId,
          transactionId: transactions.id,
        })
        .from(transactions)
        .where(
          and(
            sql`${transactions.bookingId} IN ${bookingIds}`,
            eq(transactions.type, "INVOICE")
          )
        )
    : [];

  const invoiceMap = new Map(
    invoiceTxns.map((t) => [t.bookingId, t.transactionId])
  );
```

Update the return statement to include the new fields:

```typescript
  return rows.map((r) => ({
    ...r,
    guestCount: countMap.get(r.id) ?? 0,
    invoiceTransactionId: invoiceMap.get(r.id) ?? null,
  }));
```

Add the missing import at the top of the file:

```typescript
import { transactions } from "@/db/schema";
```

And add `and` to the drizzle-orm imports if not already there.

- [ ] **Step 2: Create the PaymentButton component**

Create `src/app/[slug]/dashboard/payment-button.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createCheckoutSession } from "@/actions/stripe/checkout";

type PaymentButtonProps = {
  organisationId: string;
  transactionId: string;
  slug: string;
  amountCents: number;
};

export function PaymentButton({
  organisationId,
  transactionId,
  slug,
  amountCents,
}: PaymentButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handlePay() {
    setLoading(true);
    try {
      const result = await createCheckoutSession(organisationId, transactionId, slug);
      if (result.success && result.url) {
        window.location.href = result.url;
      } else {
        toast.error(result.error || "Failed to create payment session");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  const formatted = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(amountCents / 100);

  return (
    <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 mt-2">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-yellow-500" />
        <span className="text-sm text-yellow-600 dark:text-yellow-400">
          Payment outstanding — {formatted}
        </span>
      </div>
      <Button
        size="sm"
        onClick={handlePay}
        disabled={loading}
        className="bg-green-600 hover:bg-green-700 text-white"
      >
        {loading ? "Loading..." : "Pay Now"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Update the dashboard page**

In `src/app/[slug]/dashboard/page.tsx`, add the payment status to booking cards.

Add imports at the top:

```typescript
import { PaymentButton } from "./payment-button";
```

Update the booking card rendering to show payment status. After the closing `</div>` of the price/reference section (around line 104), and before the closing `</div>` of the booking card (line 106), add:

```typescript
                  {b.balancePaidAt ? (
                    <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-md bg-muted">
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      <span className="text-sm text-green-600 dark:text-green-400">
                        Paid
                      </span>
                    </div>
                  ) : b.invoiceTransactionId && org?.stripeConnectOnboardingComplete ? (
                    <PaymentButton
                      organisationId={org.id}
                      transactionId={b.invoiceTransactionId}
                      slug={slug}
                      amountCents={b.totalAmountCents}
                    />
                  ) : null}
```

Also update the "Outstanding Balance" section to show actual balance. Replace the hardcoded `$0.00`:

```typescript
          <p className="text-sm text-muted-foreground mt-1">
            {formatCurrency(
              upcomingBookings
                .filter((b) => !b.balancePaidAt)
                .reduce((sum, b) => sum + b.totalAmountCents, 0)
            )}
          </p>
```

- [ ] **Step 4: Run lint and build to verify**

Run: `npm run lint && npm run build`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/app/[slug]/dashboard/payment-button.tsx src/app/[slug]/dashboard/page.tsx src/actions/bookings/queries.ts
git commit -m "feat: add Pay Now button and payment status to member dashboard"
```

---

### Task 9: Payment Return Pages

**Files:**
- Create: `src/app/[slug]/payment/success/page.tsx`
- Create: `src/app/[slug]/payment/cancelled/page.tsx`

- [ ] **Step 1: Create the success page**

Create `src/app/[slug]/payment/success/page.tsx`:

```typescript
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function PaymentSuccessPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
        <span className="text-green-600 dark:text-green-400 text-2xl">✓</span>
      </div>
      <h1 className="text-2xl font-bold">Payment Received</h1>
      <p className="text-muted-foreground text-center max-w-md">
        Your payment has been processed successfully. You will receive a
        confirmation shortly.
      </p>
      <Button render={<Link href={`/${slug}/dashboard`} />}>
        Back to Dashboard
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Create the cancelled page**

Create `src/app/[slug]/payment/cancelled/page.tsx`:

```typescript
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function PaymentCancelledPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
        <span className="text-muted-foreground text-2xl">←</span>
      </div>
      <h1 className="text-2xl font-bold">Payment Cancelled</h1>
      <p className="text-muted-foreground text-center max-w-md">
        No charge was made. You can pay anytime from your dashboard.
      </p>
      <Button render={<Link href={`/${slug}/dashboard`} />}>
        Back to Dashboard
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/[slug]/payment/
git commit -m "feat: add payment success and cancelled return pages"
```

---

### Task 10: Run Full Quality Check & Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass (existing 210 + new ~12 = ~222 tests)

- [ ] **Step 2: Run full quality check**

Run: `npm run check`
Expected: lint + test + build all pass

- [ ] **Step 3: Update README**

In `README.md`, update the "Completed" table to include Phase 6 and Phase 7. Add after the Phase 5 row:

```markdown
| 6 | Booking Flow | 5-step member booking wizard, concurrency handling with SELECT FOR UPDATE, timed bed holds, per-guest pricing |
| 7 | Stripe Connect | Express account onboarding, Stripe Checkout payments, webhook processing, 1% platform fee |
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update README with Phase 6 and Phase 7 features"
```

- [ ] **Step 5: Push to remote**

```bash
git push origin main
```

Expected: Auto-deploy pipeline triggers on push to main.
