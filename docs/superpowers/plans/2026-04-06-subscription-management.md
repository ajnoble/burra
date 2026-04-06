# Phase 10: Subscription Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable clubs to generate, track, and collect annual membership fees per season through the existing Stripe Checkout flow, with automated reminders and grace period enforcement.

**Architecture:** Add `annualFeeCents` to membership classes and `subscriptionGraceDays` to organisations. Subscription records (already in schema) are generated when an admin triggers generation for a season. Members pay via Stripe Checkout (reusing existing flow). A daily cron handles reminders and grace period expiry.

**Tech Stack:** Next.js 16 (App Router), Drizzle ORM, Stripe Checkout, Resend email, Vitest

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/actions/subscriptions/generate.ts` | Generate subscription records for a season |
| `src/actions/subscriptions/admin-actions.ts` | Waive, adjust amount, record offline payment |
| `src/actions/subscriptions/queries.ts` | List subscriptions with filters, summary stats |
| `src/actions/subscriptions/send-reminder.ts` | Send renewal reminder email to one or many members |
| `src/actions/subscriptions/checkout.ts` | Create Stripe Checkout session for a subscription |
| `src/actions/subscriptions/__tests__/generate.test.ts` | Tests for generation logic |
| `src/actions/subscriptions/__tests__/admin-actions.test.ts` | Tests for waive/adjust/record |
| `src/actions/subscriptions/__tests__/queries.test.ts` | Tests for list/summary queries |
| `src/actions/subscriptions/__tests__/send-reminder.test.ts` | Tests for reminder sending |
| `src/actions/subscriptions/__tests__/checkout.test.ts` | Tests for subscription checkout |
| `src/app/[slug]/admin/subscriptions/page.tsx` | Admin subscription list page (server component) |
| `src/app/[slug]/admin/subscriptions/subscription-filters.tsx` | Client component: season, status, class filters |
| `src/app/[slug]/admin/subscriptions/subscription-table.tsx` | Client component: table with row actions |
| `src/app/[slug]/admin/subscriptions/summary-bar.tsx` | Client component: revenue summary |
| `src/app/[slug]/dashboard/subscription-card.tsx` | Client component: subscription status + pay button |
| `src/app/api/cron/subscriptions/route.ts` | Daily cron: reminders + grace period expiry |
| `src/actions/subscriptions/__tests__/cron.test.ts` | Tests for cron logic |

### Modified files

| File | Change |
|------|--------|
| `src/db/schema/members.ts` | Add `annualFeeCents` to `membershipClasses` |
| `src/db/schema/transactions.ts` | Add `reminderSentAt` to `subscriptions` |
| `src/db/schema/organisations.ts` | Add `subscriptionGraceDays` |
| `src/lib/stripe.ts` | Add `buildSubscriptionCheckoutParams` helper |
| `src/actions/stripe/webhook-handlers.ts` | Handle `subscriptionId` in checkout metadata |
| `src/actions/stripe/__tests__/webhook-handlers.test.ts` | Add subscription payment test |
| `src/app/[slug]/dashboard/page.tsx` | Add subscription card + include sub in outstanding balance |
| `src/app/[slug]/admin/settings/page.tsx` | Add grace days field to org settings |
| `src/app/[slug]/admin/settings/org-settings-form.tsx` | Add grace days input |
| `src/actions/organisations/update.ts` | Accept `subscriptionGraceDays` |
| `src/app/[slug]/admin/settings/membership-class-manager.tsx` | Add annual fee field |
| `src/actions/membership-classes/index.ts` | Accept `annualFeeCents` in create/update |
| `drizzle/` | New migration SQL file |

---

## Task 1: Schema Migration

**Files:**
- Modify: `src/db/schema/members.ts`
- Modify: `src/db/schema/organisations.ts`
- Modify: `src/db/schema/transactions.ts`
- Create: `drizzle/XXXX_add_subscription_fields.sql` (via drizzle-kit generate)

- [ ] **Step 1: Add `annualFeeCents` to `membershipClasses` in schema**

In `src/db/schema/members.ts`, add after the `isActive` column:

```typescript
annualFeeCents: integer("annual_fee_cents"), // null = no fee for this class
```

- [ ] **Step 2: Add `subscriptionGraceDays` to `organisations` in schema**

In `src/db/schema/organisations.ts`, add after `defaultApprovalNote`:

```typescript
subscriptionGraceDays: integer("subscription_grace_days").notNull().default(14),
```

- [ ] **Step 3: Add `reminderSentAt` to `subscriptions` in schema**

In `src/db/schema/transactions.ts`, add after `waivedReason`:

```typescript
reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
```

- [ ] **Step 4: Generate and apply migration**

Run:
```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

Expected: Migration SQL file created in `drizzle/` folder and applied.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/members.ts src/db/schema/organisations.ts src/db/schema/transactions.ts drizzle/
git commit -m "schema: add annualFeeCents, subscriptionGraceDays, reminderSentAt columns"
```

---

## Task 2: Membership Class Fee — Update Actions and UI

**Files:**
- Modify: `src/actions/membership-classes/index.ts`
- Modify: `src/app/[slug]/admin/settings/membership-class-manager.tsx`

- [ ] **Step 1: Update `classSchema` in membership-classes action to include `annualFeeCents`**

In `src/actions/membership-classes/index.ts`, update the schema:

```typescript
const classSchema = z.object({
  organisationId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional().or(z.literal("")),
  sortOrder: z.number().int().default(0),
  annualFeeCents: z.number().int().nonnegative().nullable().optional(),
});
```

Update `createMembershipClass` to include `annualFeeCents` in the insert values:

```typescript
annualFeeCents: data.annualFeeCents ?? null,
```

Update `updateMembershipClass` to include `annualFeeCents` in the set:

```typescript
annualFeeCents: data.annualFeeCents ?? null,
```

- [ ] **Step 2: Add annual fee input to membership class manager UI**

In `src/app/[slug]/admin/settings/membership-class-manager.tsx`, add an input field for annual fee (in dollars, converted to/from cents on save/load). Use the existing `formatCurrency` for display and parse dollars to cents on submit:

```typescript
// In the form, after description input:
<div>
  <label className="text-sm font-medium">Annual Fee (AUD)</label>
  <input
    type="number"
    step="0.01"
    min="0"
    placeholder="No fee"
    value={annualFeeDollars}
    onChange={(e) => setAnnualFeeDollars(e.target.value)}
    className="..."
  />
  <p className="text-xs text-muted-foreground">Leave empty for no annual fee (e.g. honorary members)</p>
</div>
```

Convert: `annualFeeCents: annualFeeDollars ? Math.round(parseFloat(annualFeeDollars) * 100) : null`

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`
Navigate to `/{slug}/admin/settings`, verify annual fee field appears on membership classes and saves correctly.

- [ ] **Step 4: Commit**

```bash
git add src/actions/membership-classes/index.ts src/app/[slug]/admin/settings/membership-class-manager.tsx
git commit -m "feat: add annual fee field to membership classes"
```

---

## Task 3: Organisation Settings — Grace Days

**Files:**
- Modify: `src/app/[slug]/admin/settings/page.tsx`
- Modify: `src/app/[slug]/admin/settings/org-settings-form.tsx`
- Modify: `src/actions/organisations/update.ts`

- [ ] **Step 1: Update org update action to accept `subscriptionGraceDays`**

In `src/actions/organisations/update.ts`, add `subscriptionGraceDays` to the validation schema and update query. Use `z.number().int().min(0).max(90)` for validation.

- [ ] **Step 2: Add grace days input to org settings form**

In `src/app/[slug]/admin/settings/org-settings-form.tsx`, add a number input for "Subscription Grace Period (days)" after the existing org settings fields. Default value from the org's `subscriptionGraceDays`.

- [ ] **Step 3: Pass `subscriptionGraceDays` from settings page to form**

In `src/app/[slug]/admin/settings/page.tsx`, ensure `subscriptionGraceDays` is fetched and passed to the form component.

- [ ] **Step 4: Verify in browser**

Navigate to `/{slug}/admin/settings`, verify grace days field appears, saves, and persists on reload.

- [ ] **Step 5: Commit**

```bash
git add src/actions/organisations/update.ts src/app/[slug]/admin/settings/org-settings-form.tsx src/app/[slug]/admin/settings/page.tsx
git commit -m "feat: add subscription grace days to org settings"
```

---

## Task 4: Subscription Generation Logic

**Files:**
- Create: `src/actions/subscriptions/generate.ts`
- Create: `src/actions/subscriptions/__tests__/generate.test.ts`

- [ ] **Step 1: Write failing tests for `generateSubscriptions`**

Create `src/actions/subscriptions/__tests__/generate.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn(),
      };
    },
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockValues(...vArgs);
          return { returning: () => [] };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  members: { id: "id", organisationId: "organisation_id", membershipClassId: "membership_class_id" },
  membershipClasses: { id: "id", annualFeeCents: "annual_fee_cents", isActive: "is_active" },
  organisationMembers: { memberId: "member_id", organisationId: "organisation_id", isActive: "is_active" },
  subscriptions: { id: "id", memberId: "member_id", seasonId: "season_id", organisationId: "organisation_id" },
  seasons: { id: "id", startDate: "start_date" },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { generateSubscriptions } from "../generate";

describe("generateSubscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when season not found", async () => {
    // Mock season lookup returning empty
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => [] }),
    }));

    const result = await generateSubscriptions({
      organisationId: "org-1",
      seasonId: "bad-season",
      slug: "demo",
    });

    expect(result).toEqual({ success: false, error: "Season not found" });
  });

  it("generates subscriptions for members with fee-bearing classes", async () => {
    // Mock season lookup
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({
        where: () => [{ id: "season-1", startDate: "2026-06-01" }],
      }),
    }));

    // Mock eligible members query (members with fees, without existing subs)
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            leftJoin: () => ({
              where: () => [
                { memberId: "m1", annualFeeCents: 55000 },
                { memberId: "m2", annualFeeCents: 30000 },
              ],
            }),
          }),
        }),
      }),
    }));

    const result = await generateSubscriptions({
      organisationId: "org-1",
      seasonId: "season-1",
      slug: "demo",
    });

    expect(result.success).toBe(true);
    expect(result.generated).toBe(2);
    expect(mockInsert).toHaveBeenCalled();
  });

  it("skips members who already have a subscription (idempotent)", async () => {
    // Mock season lookup
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({
        where: () => [{ id: "season-1", startDate: "2026-06-01" }],
      }),
    }));

    // Mock eligible members query — empty (all have subs already)
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            leftJoin: () => ({
              where: () => [],
            }),
          }),
        }),
      }),
    }));

    const result = await generateSubscriptions({
      organisationId: "org-1",
      seasonId: "season-1",
      slug: "demo",
    });

    expect(result.success).toBe(true);
    expect(result.generated).toBe(0);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/subscriptions/__tests__/generate.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `generateSubscriptions`**

Create `src/actions/subscriptions/generate.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import {
  members,
  membershipClasses,
  organisationMembers,
  subscriptions,
  seasons,
} from "@/db/schema";
import { eq, and, isNull, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type GenerateInput = {
  organisationId: string;
  seasonId: string;
  slug: string;
};

type GenerateResult = {
  success: boolean;
  generated?: number;
  error?: string;
};

export async function generateSubscriptions(
  input: GenerateInput
): Promise<GenerateResult> {
  // 1. Validate season exists
  const [season] = await db
    .select({ id: seasons.id, startDate: seasons.startDate })
    .from(seasons)
    .where(eq(seasons.id, input.seasonId));

  if (!season) {
    return { success: false, error: "Season not found" };
  }

  // 2. Find eligible members:
  //    - active org membership
  //    - membership class has non-null annualFeeCents
  //    - no existing subscription for this season
  const eligible = await db
    .select({
      memberId: members.id,
      annualFeeCents: membershipClasses.annualFeeCents,
    })
    .from(members)
    .innerJoin(
      organisationMembers,
      and(
        eq(organisationMembers.memberId, members.id),
        eq(organisationMembers.organisationId, input.organisationId),
        eq(organisationMembers.isActive, true)
      )
    )
    .innerJoin(
      membershipClasses,
      and(
        eq(membershipClasses.id, members.membershipClassId),
        isNotNull(membershipClasses.annualFeeCents)
      )
    )
    .leftJoin(
      subscriptions,
      and(
        eq(subscriptions.memberId, members.id),
        eq(subscriptions.seasonId, input.seasonId)
      )
    )
    .where(
      and(
        eq(members.organisationId, input.organisationId),
        isNull(subscriptions.id) // no existing subscription
      )
    );

  if (eligible.length === 0) {
    return { success: true, generated: 0 };
  }

  // 3. Bulk insert subscriptions
  const values = eligible.map((m) => ({
    organisationId: input.organisationId,
    memberId: m.memberId,
    seasonId: input.seasonId,
    amountCents: m.annualFeeCents!,
    dueDate: season.startDate,
    status: "UNPAID" as const,
  }));

  await db.insert(subscriptions).values(values);

  revalidatePath(`/${input.slug}/admin/subscriptions`);
  return { success: true, generated: eligible.length };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/subscriptions/__tests__/generate.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/actions/subscriptions/generate.ts src/actions/subscriptions/__tests__/generate.test.ts
git commit -m "feat: add subscription generation logic with tests"
```

---

## Task 5: Subscription Queries

**Files:**
- Create: `src/actions/subscriptions/queries.ts`
- Create: `src/actions/subscriptions/__tests__/queries.test.ts`

- [ ] **Step 1: Write failing tests for subscription queries**

Create `src/actions/subscriptions/__tests__/queries.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn(),
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  subscriptions: {
    id: "id", organisationId: "organisation_id", seasonId: "season_id",
    memberId: "member_id", amountCents: "amount_cents", dueDate: "due_date",
    status: "status", paidAt: "paid_at",
  },
  members: { id: "id", firstName: "first_name", lastName: "last_name", email: "email" },
  membershipClasses: { id: "id", name: "name" },
  seasons: { id: "id", name: "name", isActive: "is_active" },
}));

import { getSubscriptionSummary } from "../queries";

describe("getSubscriptionSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes totals correctly", () => {
    const subs = [
      { status: "PAID", amountCents: 55000 },
      { status: "PAID", amountCents: 55000 },
      { status: "UNPAID", amountCents: 55000 },
      { status: "WAIVED", amountCents: 30000 },
    ];

    const summary = getSubscriptionSummary(subs);

    expect(summary.totalExpected).toBe(195000);
    expect(summary.totalCollected).toBe(110000);
    expect(summary.totalOutstanding).toBe(55000);
    expect(summary.totalWaived).toBe(30000);
  });

  it("returns zeros for empty list", () => {
    const summary = getSubscriptionSummary([]);

    expect(summary.totalExpected).toBe(0);
    expect(summary.totalCollected).toBe(0);
    expect(summary.totalOutstanding).toBe(0);
    expect(summary.totalWaived).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/subscriptions/__tests__/queries.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement queries**

Create `src/actions/subscriptions/queries.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import {
  subscriptions,
  members,
  membershipClasses,
  seasons,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export type SubscriptionListItem = {
  id: string;
  memberId: string;
  memberName: string;
  memberEmail: string;
  membershipClassName: string;
  amountCents: number;
  dueDate: string;
  status: string;
  paidAt: Date | null;
};

export type SubscriptionFilters = {
  organisationId: string;
  seasonId: string;
  status?: string;
  membershipClassId?: string;
  page?: number;
  pageSize?: number;
};

export async function getSubscriptionList(
  filters: SubscriptionFilters
): Promise<{ subscriptions: SubscriptionListItem[]; total: number; page: number; pageSize: number }> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;

  const conditions = [
    eq(subscriptions.organisationId, filters.organisationId),
    eq(subscriptions.seasonId, filters.seasonId),
  ];

  if (filters.status) {
    conditions.push(eq(subscriptions.status, filters.status as "UNPAID" | "PAID" | "WAIVED"));
  }

  if (filters.membershipClassId) {
    conditions.push(eq(members.membershipClassId, filters.membershipClassId));
  }

  const rows = await db
    .select({
      id: subscriptions.id,
      memberId: subscriptions.memberId,
      memberFirstName: members.firstName,
      memberLastName: members.lastName,
      memberEmail: members.email,
      membershipClassName: membershipClasses.name,
      amountCents: subscriptions.amountCents,
      dueDate: subscriptions.dueDate,
      status: subscriptions.status,
      paidAt: subscriptions.paidAt,
    })
    .from(subscriptions)
    .innerJoin(members, eq(members.id, subscriptions.memberId))
    .innerJoin(membershipClasses, eq(membershipClasses.id, members.membershipClassId))
    .where(and(...conditions))
    .orderBy(members.lastName, members.firstName)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const items: SubscriptionListItem[] = rows.map((r) => ({
    id: r.id,
    memberId: r.memberId,
    memberName: `${r.memberFirstName} ${r.memberLastName}`,
    memberEmail: r.memberEmail,
    membershipClassName: r.membershipClassName,
    amountCents: r.amountCents,
    dueDate: r.dueDate,
    status: r.status,
    paidAt: r.paidAt,
  }));

  // For total count, do a separate count query
  const allRows = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .innerJoin(members, eq(members.id, subscriptions.memberId))
    .where(and(...conditions));

  return { subscriptions: items, total: allRows.length, page, pageSize };
}

export type SubscriptionSummary = {
  totalExpected: number;
  totalCollected: number;
  totalOutstanding: number;
  totalWaived: number;
};

export function getSubscriptionSummary(
  subs: { status: string; amountCents: number }[]
): SubscriptionSummary {
  let totalExpected = 0;
  let totalCollected = 0;
  let totalOutstanding = 0;
  let totalWaived = 0;

  for (const s of subs) {
    totalExpected += s.amountCents;
    if (s.status === "PAID") totalCollected += s.amountCents;
    if (s.status === "UNPAID") totalOutstanding += s.amountCents;
    if (s.status === "WAIVED") totalWaived += s.amountCents;
  }

  return { totalExpected, totalCollected, totalOutstanding, totalWaived };
}

export async function getActiveSeasonForOrg(
  organisationId: string
): Promise<{ id: string; name: string } | null> {
  const [season] = await db
    .select({ id: seasons.id, name: seasons.name })
    .from(seasons)
    .where(
      and(
        eq(seasons.organisationId, organisationId),
        eq(seasons.isActive, true)
      )
    );
  return season ?? null;
}

export async function getSeasonsForOrg(
  organisationId: string
): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: seasons.id, name: seasons.name })
    .from(seasons)
    .where(eq(seasons.organisationId, organisationId))
    .orderBy(desc(seasons.startDate));
}

export async function getSubscriptionSummaryForSeason(
  organisationId: string,
  seasonId: string
): Promise<SubscriptionSummary> {
  const rows = await db
    .select({
      status: subscriptions.status,
      amountCents: subscriptions.amountCents,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organisationId, organisationId),
        eq(subscriptions.seasonId, seasonId)
      )
    );

  return getSubscriptionSummary(rows);
}

export async function getMemberSubscription(
  organisationId: string,
  memberId: string,
  seasonId: string
) {
  const [sub] = await db
    .select({
      id: subscriptions.id,
      amountCents: subscriptions.amountCents,
      dueDate: subscriptions.dueDate,
      status: subscriptions.status,
      paidAt: subscriptions.paidAt,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organisationId, organisationId),
        eq(subscriptions.memberId, memberId),
        eq(subscriptions.seasonId, seasonId)
      )
    );
  return sub ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/subscriptions/__tests__/queries.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/subscriptions/queries.ts src/actions/subscriptions/__tests__/queries.test.ts
git commit -m "feat: add subscription list and summary queries"
```

---

## Task 6: Admin Actions — Waive, Adjust, Record Offline Payment

**Files:**
- Create: `src/actions/subscriptions/admin-actions.ts`
- Create: `src/actions/subscriptions/__tests__/admin-actions.test.ts`

- [ ] **Step 1: Write failing tests for admin actions**

Create `src/actions/subscriptions/__tests__/admin-actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockSelect = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: () => ({
          where: () => ({
            returning: () => [{ id: "sub-1", status: "WAIVED", memberId: "m1" }],
          }),
        }),
      };
    },
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: () => ({ returning: () => [{ id: "txn-1" }] }),
      };
    },
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: () => ({
          where: () => [{ id: "sub-1", organisationId: "org-1", memberId: "m1", amountCents: 55000, seasonId: "s1" }],
        }),
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  subscriptions: { id: "id", organisationId: "organisation_id", status: "status" },
  transactions: { id: "id" },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { waiveSubscription, adjustSubscriptionAmount, recordOfflinePayment } from "../admin-actions";

describe("waiveSubscription", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets status to WAIVED with reason", async () => {
    const result = await waiveSubscription({
      subscriptionId: "sub-1",
      organisationId: "org-1",
      reason: "Honorary member",
      slug: "demo",
    });

    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("requires a reason", async () => {
    const result = await waiveSubscription({
      subscriptionId: "sub-1",
      organisationId: "org-1",
      reason: "",
      slug: "demo",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Reason");
  });
});

describe("adjustSubscriptionAmount", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates amount", async () => {
    const result = await adjustSubscriptionAmount({
      subscriptionId: "sub-1",
      organisationId: "org-1",
      amountCents: 27500,
      slug: "demo",
    });

    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("rejects negative amounts", async () => {
    const result = await adjustSubscriptionAmount({
      subscriptionId: "sub-1",
      organisationId: "org-1",
      amountCents: -100,
      slug: "demo",
    });

    expect(result.success).toBe(false);
  });
});

describe("recordOfflinePayment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks as PAID and creates transaction", async () => {
    const result = await recordOfflinePayment({
      subscriptionId: "sub-1",
      organisationId: "org-1",
      adminName: "Jane Admin",
      slug: "demo",
    });

    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/subscriptions/__tests__/admin-actions.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement admin actions**

Create `src/actions/subscriptions/admin-actions.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { subscriptions, transactions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type ActionResult = { success: boolean; error?: string };

export async function waiveSubscription(input: {
  subscriptionId: string;
  organisationId: string;
  reason: string;
  slug: string;
}): Promise<ActionResult> {
  if (!input.reason.trim()) {
    return { success: false, error: "Reason is required" };
  }

  const [updated] = await db
    .update(subscriptions)
    .set({
      status: "WAIVED",
      waivedReason: input.reason.trim(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(subscriptions.id, input.subscriptionId),
        eq(subscriptions.organisationId, input.organisationId)
      )
    )
    .returning();

  if (!updated) {
    return { success: false, error: "Subscription not found" };
  }

  revalidatePath(`/${input.slug}/admin/subscriptions`);
  return { success: true };
}

export async function adjustSubscriptionAmount(input: {
  subscriptionId: string;
  organisationId: string;
  amountCents: number;
  slug: string;
}): Promise<ActionResult> {
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) {
    return { success: false, error: "Amount must be a non-negative whole number (cents)" };
  }

  const [updated] = await db
    .update(subscriptions)
    .set({
      amountCents: input.amountCents,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(subscriptions.id, input.subscriptionId),
        eq(subscriptions.organisationId, input.organisationId)
      )
    )
    .returning();

  if (!updated) {
    return { success: false, error: "Subscription not found" };
  }

  revalidatePath(`/${input.slug}/admin/subscriptions`);
  return { success: true };
}

export async function recordOfflinePayment(input: {
  subscriptionId: string;
  organisationId: string;
  adminName: string;
  slug: string;
}): Promise<ActionResult> {
  // Get the subscription first for member/amount info
  const [sub] = await db
    .select({
      id: subscriptions.id,
      organisationId: subscriptions.organisationId,
      memberId: subscriptions.memberId,
      amountCents: subscriptions.amountCents,
      seasonId: subscriptions.seasonId,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.id, input.subscriptionId),
        eq(subscriptions.organisationId, input.organisationId)
      )
    );

  if (!sub) {
    return { success: false, error: "Subscription not found" };
  }

  // Mark as paid
  await db
    .update(subscriptions)
    .set({
      status: "PAID",
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, sub.id));

  // Create transaction record
  await db.insert(transactions).values({
    organisationId: sub.organisationId,
    memberId: sub.memberId,
    type: "SUBSCRIPTION",
    amountCents: sub.amountCents,
    description: `Offline payment recorded by ${input.adminName}`,
  });

  revalidatePath(`/${input.slug}/admin/subscriptions`);
  return { success: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/subscriptions/__tests__/admin-actions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/subscriptions/admin-actions.ts src/actions/subscriptions/__tests__/admin-actions.test.ts
git commit -m "feat: add subscription admin actions (waive, adjust, record offline)"
```

---

## Task 7: Send Reminder Action

**Files:**
- Create: `src/actions/subscriptions/send-reminder.ts`
- Create: `src/actions/subscriptions/__tests__/send-reminder.test.ts`

- [ ] **Step 1: Write failing tests for send reminder**

Create `src/actions/subscriptions/__tests__/send-reminder.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockSendEmail = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn(),
      };
    },
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: () => ({ where: () => ({ returning: () => [] }) }),
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  subscriptions: { id: "id", memberId: "member_id", seasonId: "season_id", organisationId: "organisation_id" },
  members: { id: "id", email: "email" },
  seasons: { id: "id", name: "name" },
  organisations: { id: "id", name: "name", slug: "slug", contactEmail: "contact_email", logoUrl: "logo_url" },
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock("react", () => ({
  default: { createElement: vi.fn(() => "mock-element") },
  createElement: vi.fn(() => "mock-element"),
}));

vi.mock("@/lib/email/templates/membership-renewal-due", () => ({
  MembershipRenewalDueEmail: vi.fn(),
}));

import { sendSubscriptionReminder } from "../send-reminder";

describe("sendSubscriptionReminder", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends email and updates reminderSentAt", async () => {
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            innerJoin: () => ({
              where: () => [{
                subscriptionId: "sub-1",
                email: "jan@example.com",
                amountCents: 55000,
                dueDate: "2026-06-01",
                seasonName: "Winter 2026",
                orgName: "Alpine Club",
                orgSlug: "alpine",
                contactEmail: "admin@alpine.com",
                logoUrl: null,
              }],
            }),
          }),
        }),
      }),
    }));

    const result = await sendSubscriptionReminder({ subscriptionId: "sub-1", organisationId: "org-1" });

    expect(result.success).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("returns error for unknown subscription", async () => {
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            innerJoin: () => ({
              where: () => [],
            }),
          }),
        }),
      }),
    }));

    const result = await sendSubscriptionReminder({ subscriptionId: "bad", organisationId: "org-1" });

    expect(result.success).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/subscriptions/__tests__/send-reminder.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement send reminder**

Create `src/actions/subscriptions/send-reminder.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { subscriptions, members, seasons, organisations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { MembershipRenewalDueEmail } from "@/lib/email/templates/membership-renewal-due";

type ReminderResult = { success: boolean; error?: string };

export async function sendSubscriptionReminder(input: {
  subscriptionId: string;
  organisationId: string;
}): Promise<ReminderResult> {
  const [data] = await db
    .select({
      subscriptionId: subscriptions.id,
      email: members.email,
      amountCents: subscriptions.amountCents,
      dueDate: subscriptions.dueDate,
      seasonName: seasons.name,
      orgName: organisations.name,
      orgSlug: organisations.slug,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
    })
    .from(subscriptions)
    .innerJoin(members, eq(members.id, subscriptions.memberId))
    .innerJoin(seasons, eq(seasons.id, subscriptions.seasonId))
    .innerJoin(organisations, eq(organisations.id, subscriptions.organisationId))
    .where(
      and(
        eq(subscriptions.id, input.subscriptionId),
        eq(subscriptions.organisationId, input.organisationId)
      )
    );

  if (!data) {
    return { success: false, error: "Subscription not found" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  sendEmail({
    to: data.email,
    subject: `Membership renewal due — ${data.seasonName}`,
    template: React.createElement(MembershipRenewalDueEmail, {
      orgName: data.orgName,
      seasonName: data.seasonName,
      amountCents: data.amountCents,
      dueDate: data.dueDate,
      payUrl: `${appUrl}/${data.orgSlug}/dashboard`,
      logoUrl: data.logoUrl || undefined,
    }),
    replyTo: data.contactEmail || undefined,
    orgName: data.orgName,
  });

  // Track that reminder was sent
  await db
    .update(subscriptions)
    .set({ reminderSentAt: new Date(), updatedAt: new Date() })
    .where(eq(subscriptions.id, data.subscriptionId));

  return { success: true };
}

export async function sendBulkReminders(input: {
  organisationId: string;
  seasonId: string;
}): Promise<{ success: boolean; sent: number }> {
  const unpaid = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organisationId, input.organisationId),
        eq(subscriptions.seasonId, input.seasonId),
        eq(subscriptions.status, "UNPAID")
      )
    );

  let sent = 0;
  for (const sub of unpaid) {
    const result = await sendSubscriptionReminder({
      subscriptionId: sub.id,
      organisationId: input.organisationId,
    });
    if (result.success) sent++;
  }

  return { success: true, sent };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/subscriptions/__tests__/send-reminder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/subscriptions/send-reminder.ts src/actions/subscriptions/__tests__/send-reminder.test.ts
git commit -m "feat: add subscription reminder email sending"
```

---

## Task 8: Subscription Checkout (Stripe)

**Files:**
- Create: `src/actions/subscriptions/checkout.ts`
- Create: `src/actions/subscriptions/__tests__/checkout.test.ts`
- Modify: `src/lib/stripe.ts`

- [ ] **Step 1: Add `buildSubscriptionCheckoutParams` to stripe helper**

In `src/lib/stripe.ts`, add after the existing `buildCheckoutSessionParams`:

```typescript
export type SubscriptionCheckoutInput = {
  connectedAccountId: string;
  subscriptionId: string;
  organisationId: string;
  seasonName: string;
  amountCents: number;
  platformFeeBps: number;
  successUrl: string;
  cancelUrl: string;
};

export function buildSubscriptionCheckoutParams(input: SubscriptionCheckoutInput) {
  const platformFeeCents = applyBasisPoints(input.amountCents, input.platformFeeBps);

  return {
    mode: "payment" as const,
    line_items: [
      {
        price_data: {
          currency: "aud",
          product_data: { name: `Membership Fee — ${input.seasonName}` },
          unit_amount: input.amountCents,
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: platformFeeCents,
    },
    metadata: {
      subscriptionId: input.subscriptionId,
      organisationId: input.organisationId,
    },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  };
}
```

- [ ] **Step 2: Write failing tests for subscription checkout**

Create `src/actions/subscriptions/__tests__/checkout.test.ts`:

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
  organisations: { id: "id", stripeConnectAccountId: "sca", stripeConnectOnboardingComplete: "scoc", platformFeeBps: "pfb", slug: "slug" },
  subscriptions: { id: "id", organisationId: "oid", memberId: "mid", amountCents: "ac", status: "status", stripePaymentIntentId: "spi" },
  seasons: { id: "id", name: "name" },
}));

import { createSubscriptionCheckoutSession } from "../checkout";

describe("createSubscriptionCheckoutSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionMember.mockResolvedValue({ memberId: "m1" });
  });

  it("returns error when not authenticated", async () => {
    mockGetSessionMember.mockResolvedValue(null);

    const result = await createSubscriptionCheckoutSession("org-1", "sub-1", "demo");

    expect(result.success).toBe(false);
    expect(result.error).toContain("authenticated");
  });

  it("returns error when Stripe not connected", async () => {
    mockDbSelect.mockImplementationOnce(() => ({
      from: () => ({
        where: () => [{ stripeConnectAccountId: null, stripeConnectOnboardingComplete: false, platformFeeBps: 100 }],
      }),
    }));

    const result = await createSubscriptionCheckoutSession("org-1", "sub-1", "demo");

    expect(result.success).toBe(false);
    expect(result.error).toContain("payments");
  });

  it("creates checkout session and returns URL", async () => {
    // Org lookup
    mockDbSelect.mockImplementationOnce(() => ({
      from: () => ({
        where: () => [{ stripeConnectAccountId: "acct_123", stripeConnectOnboardingComplete: true, platformFeeBps: 100 }],
      }),
    }));
    // Subscription lookup
    mockDbSelect.mockImplementationOnce(() => ({
      from: () => ({
        innerJoin: () => ({
          where: () => [{
            subscriptionId: "sub-1",
            amountCents: 55000,
            memberId: "m1",
            seasonName: "Winter 2026",
            stripePaymentIntentId: null,
            status: "UNPAID",
          }],
        }),
      }),
    }));

    mockStripeCheckoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/xxx" });
    mockGetStripeClient.mockReturnValue({
      checkout: { sessions: { create: mockStripeCheckoutCreate } },
    });

    const result = await createSubscriptionCheckoutSession("org-1", "sub-1", "demo");

    expect(result.success).toBe(true);
    expect(result.url).toBe("https://checkout.stripe.com/xxx");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/actions/subscriptions/__tests__/checkout.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement subscription checkout**

Create `src/actions/subscriptions/checkout.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { organisations, subscriptions, seasons } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getStripeClient, buildSubscriptionCheckoutParams } from "@/lib/stripe";
import { getSessionMember } from "@/lib/auth";

type CheckoutResult = {
  success: boolean;
  url?: string;
  error?: string;
};

export async function createSubscriptionCheckoutSession(
  organisationId: string,
  subscriptionId: string,
  slug: string
): Promise<CheckoutResult> {
  const session = await getSessionMember(organisationId);
  if (!session) {
    return { success: false, error: "You must be authenticated to make a payment" };
  }

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

  const [sub] = await db
    .select({
      subscriptionId: subscriptions.id,
      amountCents: subscriptions.amountCents,
      memberId: subscriptions.memberId,
      seasonName: seasons.name,
      stripePaymentIntentId: subscriptions.stripePaymentIntentId,
      status: subscriptions.status,
    })
    .from(subscriptions)
    .innerJoin(seasons, eq(seasons.id, subscriptions.seasonId))
    .where(
      and(
        eq(subscriptions.id, subscriptionId),
        eq(subscriptions.organisationId, organisationId)
      )
    );

  if (!sub) {
    return { success: false, error: "Subscription not found" };
  }

  if (sub.stripePaymentIntentId) {
    return { success: false, error: "This subscription has already been paid" };
  }

  if (sub.status !== "UNPAID") {
    return { success: false, error: "This subscription is not payable" };
  }

  if (sub.memberId !== session.memberId) {
    return { success: false, error: "You do not have permission to pay this subscription" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const stripe = getStripeClient();
  const params = buildSubscriptionCheckoutParams({
    connectedAccountId: org.stripeConnectAccountId,
    subscriptionId: sub.subscriptionId,
    organisationId,
    seasonName: sub.seasonName,
    amountCents: sub.amountCents,
    platformFeeBps: org.platformFeeBps,
    successUrl: `${appUrl}/${slug}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl}/${slug}/dashboard`,
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

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/actions/subscriptions/__tests__/checkout.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/stripe.ts src/actions/subscriptions/checkout.ts src/actions/subscriptions/__tests__/checkout.test.ts
git commit -m "feat: add subscription Stripe Checkout flow"
```

---

## Task 9: Webhook Handler — Subscription Payments

**Files:**
- Modify: `src/actions/stripe/webhook-handlers.ts`
- Modify: `src/actions/stripe/__tests__/webhook-handlers.test.ts`

- [ ] **Step 1: Write failing test for subscription payment webhook**

Add to `src/actions/stripe/__tests__/webhook-handlers.test.ts`:

```typescript
describe("handleCheckoutSessionCompleted — subscription payment", () => {
  it("marks subscription as PAID and creates transaction when subscriptionId in metadata", async () => {
    const session = {
      id: "cs_123",
      payment_intent: "pi_sub_123",
      amount_total: 55000,
      metadata: {
        subscriptionId: "sub-1",
        organisationId: "org-1",
      },
    } as unknown as Stripe.Checkout.Session;

    await handleCheckoutSessionCompleted(session);

    // Verify subscription was updated
    expect(mockUpdate).toHaveBeenCalled();
    // Verify transaction was created
    expect(mockInsert).toHaveBeenCalled();
  });
});
```

Adjust the existing mocks at the top of the file to also handle subscription-related DB operations. The key check: when `session.metadata.subscriptionId` is present (and `transactionId`/`bookingId` are absent), the handler should update the subscription and create a SUBSCRIPTION transaction.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/actions/stripe/__tests__/webhook-handlers.test.ts`
Expected: FAIL — the new test case fails because the handler doesn't check for `subscriptionId` yet

- [ ] **Step 3: Extend `handleCheckoutSessionCompleted` for subscriptions**

In `src/actions/stripe/webhook-handlers.ts`, add subscription handling at the top of the function, before the existing booking payment logic:

```typescript
// Add imports at top:
import { subscriptions } from "@/db/schema";

// Inside handleCheckoutSessionCompleted, after extracting paymentIntentId:
const { subscriptionId } = session.metadata ?? {};

if (subscriptionId) {
  // This is a subscription payment, not a booking payment
  const [existingSub] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.stripePaymentIntentId, paymentIntentId),
        eq(transactions.type, "SUBSCRIPTION")
      )
    );

  if (existingSub) return; // idempotency

  const organisationId = session.metadata?.organisationId;
  if (!organisationId) return;

  // Get subscription details
  const [sub] = await db
    .select({
      id: subscriptions.id,
      memberId: subscriptions.memberId,
      amountCents: subscriptions.amountCents,
      organisationId: subscriptions.organisationId,
    })
    .from(subscriptions)
    .where(eq(subscriptions.id, subscriptionId));

  if (!sub) return;

  const amountCents = session.amount_total ?? sub.amountCents;
  const platformFeeCents = applyBasisPoints(amountCents, 100);

  // Create SUBSCRIPTION transaction
  await db.insert(transactions).values({
    organisationId: sub.organisationId,
    memberId: sub.memberId,
    type: "SUBSCRIPTION",
    amountCents,
    stripePaymentIntentId: paymentIntentId,
    stripeCheckoutSessionId: session.id,
    platformFeeCents,
    description: `Subscription payment for ${subscriptionId}`,
  });

  // Update subscription status
  await db
    .update(subscriptions)
    .set({
      status: "PAID",
      paidAt: new Date(),
      stripePaymentIntentId: paymentIntentId,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, subscriptionId));

  // Send payment received email
  const [emailData] = await db
    .select({
      email: members.email,
      orgName: organisations.name,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
    })
    .from(members)
    .innerJoin(organisations, eq(organisations.id, sub.organisationId))
    .where(eq(members.id, sub.memberId));

  if (emailData) {
    sendEmail({
      to: emailData.email,
      subject: `Payment received — membership subscription`,
      template: React.createElement(PaymentReceivedEmail, {
        orgName: emailData.orgName,
        bookingReference: "Membership Subscription",
        amountCents,
        paidDate: new Date().toISOString().split("T")[0],
        logoUrl: emailData.logoUrl || undefined,
      }),
      replyTo: emailData.contactEmail || undefined,
      orgName: emailData.orgName,
    });
  }

  return; // Don't fall through to booking payment logic
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/stripe/__tests__/webhook-handlers.test.ts`
Expected: ALL PASS (existing + new)

- [ ] **Step 5: Commit**

```bash
git add src/actions/stripe/webhook-handlers.ts src/actions/stripe/__tests__/webhook-handlers.test.ts
git commit -m "feat: handle subscription payments in Stripe webhook"
```

---

## Task 10: Cron Endpoint — Reminders and Grace Period

**Files:**
- Create: `src/app/api/cron/subscriptions/route.ts`
- Create: `src/actions/subscriptions/__tests__/cron.test.ts`

- [ ] **Step 1: Write failing tests for cron logic**

Create `src/actions/subscriptions/__tests__/cron.test.ts`. Extract the cron logic into a testable function `processSubscriptionCron` that can be imported and tested independently of the route handler:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockSendEmail = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn(),
      };
    },
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: () => ({ where: () => ({ returning: () => [{ id: "m1", email: "jan@example.com", firstName: "Jan" }] }) }),
      };
    },
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: () => ({ returning: () => [{ id: "change-1" }] }),
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  subscriptions: { id: "id", organisationId: "oid", memberId: "mid", dueDate: "due_date", status: "status", reminderSentAt: "rsa", seasonId: "sid" },
  members: { id: "id", email: "email", firstName: "first_name", isFinancial: "is_financial" },
  organisations: { id: "id", name: "name", slug: "slug", contactEmail: "ce", logoUrl: "lu", subscriptionGraceDays: "sgd" },
  seasons: { id: "id", name: "name" },
  financialStatusChanges: { id: "id" },
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock("react", () => ({
  default: { createElement: vi.fn(() => "mock-element") },
  createElement: vi.fn(() => "mock-element"),
}));

vi.mock("@/lib/email/templates/membership-renewal-due", () => ({
  MembershipRenewalDueEmail: vi.fn(),
}));

vi.mock("@/lib/email/templates/financial-status-changed", () => ({
  FinancialStatusChangedEmail: vi.fn(),
}));

import { processSubscriptionCron } from "../../subscriptions/cron";

describe("processSubscriptionCron", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends reminders for due unpaid subscriptions", async () => {
    // Mock: find unpaid subs due today with no reminder sent
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            innerJoin: () => ({
              where: () => [{
                subscriptionId: "sub-1",
                email: "jan@example.com",
                amountCents: 55000,
                dueDate: "2026-06-01",
                seasonName: "Winter 2026",
                orgName: "Alpine Club",
                orgSlug: "alpine",
                contactEmail: "admin@alpine.com",
                logoUrl: null,
              }],
            }),
          }),
        }),
      }),
    }));

    // Mock: no grace period expired subs
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            innerJoin: () => ({
              where: () => [],
            }),
          }),
        }),
      }),
    }));

    const result = await processSubscriptionCron();

    expect(result.remindersSent).toBe(1);
    expect(result.financialStatusChanged).toBe(0);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it("flips financial status for grace-period-expired subscriptions", async () => {
    // Mock: no reminders to send
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            innerJoin: () => ({
              where: () => [],
            }),
          }),
        }),
      }),
    }));

    // Mock: one grace period expired sub
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            innerJoin: () => ({
              where: () => [{
                subscriptionId: "sub-2",
                memberId: "m2",
                organisationId: "org-1",
                email: "piotr@example.com",
                firstName: "Piotr",
                orgName: "Alpine Club",
                orgSlug: "alpine",
                contactEmail: "admin@alpine.com",
                logoUrl: null,
              }],
            }),
          }),
        }),
      }),
    }));

    const result = await processSubscriptionCron();

    expect(result.remindersSent).toBe(0);
    expect(result.financialStatusChanged).toBe(1);
    expect(mockUpdate).toHaveBeenCalled(); // member isFinancial set to false
    expect(mockInsert).toHaveBeenCalled(); // financialStatusChanges record
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/subscriptions/__tests__/cron.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement cron logic**

Create `src/actions/subscriptions/cron.ts`:

```typescript
import { db } from "@/db/index";
import {
  subscriptions,
  members,
  organisations,
  seasons,
  financialStatusChanges,
} from "@/db/schema";
import { eq, and, lte, isNull } from "drizzle-orm";
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { MembershipRenewalDueEmail } from "@/lib/email/templates/membership-renewal-due";
import { FinancialStatusChangedEmail } from "@/lib/email/templates/financial-status-changed";
import { sql } from "drizzle-orm";

type CronResult = {
  remindersSent: number;
  financialStatusChanged: number;
};

export async function processSubscriptionCron(): Promise<CronResult> {
  const today = new Date().toISOString().split("T")[0];
  let remindersSent = 0;
  let financialStatusChanged = 0;

  // Pass 1: Send reminders for UNPAID subscriptions due today or earlier, not yet reminded
  const dueForReminder = await db
    .select({
      subscriptionId: subscriptions.id,
      email: members.email,
      amountCents: subscriptions.amountCents,
      dueDate: subscriptions.dueDate,
      seasonName: seasons.name,
      orgName: organisations.name,
      orgSlug: organisations.slug,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
    })
    .from(subscriptions)
    .innerJoin(members, eq(members.id, subscriptions.memberId))
    .innerJoin(seasons, eq(seasons.id, subscriptions.seasonId))
    .innerJoin(organisations, eq(organisations.id, subscriptions.organisationId))
    .where(
      and(
        eq(subscriptions.status, "UNPAID"),
        lte(subscriptions.dueDate, today),
        isNull(subscriptions.reminderSentAt)
      )
    );

  for (const sub of dueForReminder) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    sendEmail({
      to: sub.email,
      subject: `Membership renewal due — ${sub.seasonName}`,
      template: React.createElement(MembershipRenewalDueEmail, {
        orgName: sub.orgName,
        seasonName: sub.seasonName,
        amountCents: sub.amountCents,
        dueDate: sub.dueDate,
        payUrl: `${appUrl}/${sub.orgSlug}/dashboard`,
        logoUrl: sub.logoUrl || undefined,
      }),
      replyTo: sub.contactEmail || undefined,
      orgName: sub.orgName,
    });

    await db
      .update(subscriptions)
      .set({ reminderSentAt: new Date(), updatedAt: new Date() })
      .where(eq(subscriptions.id, sub.subscriptionId));

    remindersSent++;
  }

  // Pass 2: Grace period expiry — UNPAID subs where dueDate + graceDays has passed
  const graceExpired = await db
    .select({
      subscriptionId: subscriptions.id,
      memberId: subscriptions.memberId,
      organisationId: subscriptions.organisationId,
      email: members.email,
      firstName: members.firstName,
      orgName: organisations.name,
      orgSlug: organisations.slug,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
    })
    .from(subscriptions)
    .innerJoin(members, and(
      eq(members.id, subscriptions.memberId),
      eq(members.isFinancial, true) // only flip those still marked financial
    ))
    .innerJoin(organisations, eq(organisations.id, subscriptions.organisationId))
    .innerJoin(seasons, eq(seasons.id, subscriptions.seasonId))
    .where(
      and(
        eq(subscriptions.status, "UNPAID"),
        sql`${subscriptions.dueDate}::date + ${organisations.subscriptionGraceDays} * interval '1 day' <= ${today}::date`
      )
    );

  for (const sub of graceExpired) {
    // Set member non-financial
    await db
      .update(members)
      .set({ isFinancial: false, updatedAt: new Date() })
      .where(eq(members.id, sub.memberId));

    // Record the change
    await db.insert(financialStatusChanges).values({
      organisationId: sub.organisationId,
      memberId: sub.memberId,
      isFinancial: false,
      reason: "Subscription unpaid — grace period expired",
      changedByMemberId: sub.memberId, // system action, attributed to the member
    });

    // Send notification
    sendEmail({
      to: sub.email,
      subject: `Membership status updated — ${sub.orgName}`,
      template: React.createElement(FinancialStatusChangedEmail, {
        orgName: sub.orgName,
        firstName: sub.firstName,
        isFinancial: false,
        reason: "Subscription unpaid — grace period expired",
        logoUrl: sub.logoUrl || undefined,
      }),
      replyTo: sub.contactEmail || undefined,
      orgName: sub.orgName,
    });

    financialStatusChanged++;
  }

  return { remindersSent, financialStatusChanged };
}
```

- [ ] **Step 4: Create the cron API route**

Create `src/app/api/cron/subscriptions/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { processSubscriptionCron } from "@/actions/subscriptions/cron";

export async function POST(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await processSubscriptionCron();

  return Response.json({
    ok: true,
    remindersSent: result.remindersSent,
    financialStatusChanged: result.financialStatusChanged,
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/actions/subscriptions/__tests__/cron.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/actions/subscriptions/cron.ts src/actions/subscriptions/__tests__/cron.test.ts src/app/api/cron/subscriptions/route.ts
git commit -m "feat: add subscription cron for reminders and grace period expiry"
```

---

## Task 11: Admin Subscriptions Page — UI

**Files:**
- Create: `src/app/[slug]/admin/subscriptions/page.tsx`
- Create: `src/app/[slug]/admin/subscriptions/subscription-filters.tsx`
- Create: `src/app/[slug]/admin/subscriptions/subscription-table.tsx`
- Create: `src/app/[slug]/admin/subscriptions/summary-bar.tsx`

- [ ] **Step 1: Create summary bar component**

Create `src/app/[slug]/admin/subscriptions/summary-bar.tsx`:

```typescript
"use client";

import { formatCurrency } from "@/lib/currency";

type SummaryBarProps = {
  totalExpected: number;
  totalCollected: number;
  totalOutstanding: number;
  totalWaived: number;
};

export function SummaryBar({ totalExpected, totalCollected, totalOutstanding, totalWaived }: SummaryBarProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-4 mb-6">
      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">Expected</p>
        <p className="text-xl font-bold">{formatCurrency(totalExpected)}</p>
      </div>
      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">Collected</p>
        <p className="text-xl font-bold text-green-600">{formatCurrency(totalCollected)}</p>
      </div>
      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">Outstanding</p>
        <p className="text-xl font-bold text-amber-600">{formatCurrency(totalOutstanding)}</p>
      </div>
      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">Waived</p>
        <p className="text-xl font-bold text-muted-foreground">{formatCurrency(totalWaived)}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create subscription filters component**

Create `src/app/[slug]/admin/subscriptions/subscription-filters.tsx`:

```typescript
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

type FiltersProps = {
  seasons: { id: string; name: string }[];
  membershipClasses: { id: string; name: string }[];
  activeSeasonId: string | null;
  organisationId: string;
  slug: string;
};

export function SubscriptionFilters({
  seasons,
  membershipClasses,
  activeSeasonId,
  organisationId,
  slug,
}: FiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const currentSeason = searchParams.get("seasonId") || activeSeasonId || "";
  const currentStatus = searchParams.get("status") || "";
  const currentClass = searchParams.get("classId") || "";

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  async function handleGenerateMissing() {
    if (!currentSeason) return;
    const { generateSubscriptions } = await import("@/actions/subscriptions/generate");
    const result = await generateSubscriptions({
      organisationId,
      seasonId: currentSeason,
      slug,
    });
    if (result.success) {
      router.refresh();
    }
  }

  async function handleSendReminders() {
    if (!currentSeason) return;
    const { sendBulkReminders } = await import("@/actions/subscriptions/send-reminder");
    await sendBulkReminders({
      organisationId,
      seasonId: currentSeason,
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <select
        value={currentSeason}
        onChange={(e) => updateParam("seasonId", e.target.value)}
        className="rounded-md border px-3 py-2 text-sm"
      >
        {seasons.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <select
        value={currentStatus}
        onChange={(e) => updateParam("status", e.target.value)}
        className="rounded-md border px-3 py-2 text-sm"
      >
        <option value="">All statuses</option>
        <option value="UNPAID">Unpaid</option>
        <option value="PAID">Paid</option>
        <option value="WAIVED">Waived</option>
      </select>

      <select
        value={currentClass}
        onChange={(e) => updateParam("classId", e.target.value)}
        className="rounded-md border px-3 py-2 text-sm"
      >
        <option value="">All classes</option>
        {membershipClasses.map((mc) => (
          <option key={mc.id} value={mc.id}>
            {mc.name}
          </option>
        ))}
      </select>

      <div className="ml-auto flex gap-2">
        <Button variant="outline" onClick={handleGenerateMissing}>
          Generate Missing
        </Button>
        <Button variant="outline" onClick={handleSendReminders}>
          Send Reminders to Unpaid
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create subscription table component**

Create `src/app/[slug]/admin/subscriptions/subscription-table.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";
import type { SubscriptionListItem } from "@/actions/subscriptions/queries";

type TableProps = {
  subscriptions: SubscriptionListItem[];
  total: number;
  page: number;
  pageSize: number;
  slug: string;
  organisationId: string;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  PAID: "default",
  UNPAID: "secondary",
  WAIVED: "secondary",
};

export function SubscriptionTable({
  subscriptions,
  total,
  page,
  pageSize,
  slug,
  organisationId,
}: TableProps) {
  const router = useRouter();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function handleWaive(subId: string) {
    const reason = prompt("Waive reason:");
    if (!reason) return;
    setActionLoading(subId);
    const { waiveSubscription } = await import("@/actions/subscriptions/admin-actions");
    await waiveSubscription({ subscriptionId: subId, organisationId, reason, slug });
    setActionLoading(null);
    router.refresh();
  }

  async function handleAdjust(subId: string, currentCents: number) {
    const dollars = prompt("New amount (AUD):", (currentCents / 100).toFixed(2));
    if (!dollars) return;
    const cents = Math.round(parseFloat(dollars) * 100);
    if (isNaN(cents) || cents < 0) return;
    setActionLoading(subId);
    const { adjustSubscriptionAmount } = await import("@/actions/subscriptions/admin-actions");
    await adjustSubscriptionAmount({ subscriptionId: subId, organisationId, amountCents: cents, slug });
    setActionLoading(null);
    router.refresh();
  }

  async function handleRecordPayment(subId: string) {
    setActionLoading(subId);
    const { recordOfflinePayment } = await import("@/actions/subscriptions/admin-actions");
    await recordOfflinePayment({ subscriptionId: subId, organisationId, adminName: "Admin", slug });
    setActionLoading(null);
    router.refresh();
  }

  async function handleSendReminder(subId: string) {
    setActionLoading(subId);
    const { sendSubscriptionReminder } = await import("@/actions/subscriptions/send-reminder");
    await sendSubscriptionReminder({ subscriptionId: subId, organisationId });
    setActionLoading(null);
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Member</th>
              <th className="text-left p-3 font-medium">Class</th>
              <th className="text-right p-3 font-medium">Amount</th>
              <th className="text-left p-3 font-medium">Due Date</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium">Paid</th>
              <th className="text-right p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.map((sub) => (
              <tr key={sub.id} className="border-b">
                <td className="p-3">{sub.memberName}</td>
                <td className="p-3">{sub.membershipClassName}</td>
                <td className="p-3 text-right">{formatCurrency(sub.amountCents)}</td>
                <td className="p-3">{sub.dueDate}</td>
                <td className="p-3">
                  <Badge variant={STATUS_VARIANT[sub.status] ?? "secondary"}>
                    {sub.status}
                  </Badge>
                </td>
                <td className="p-3 text-sm text-muted-foreground">
                  {sub.paidAt ? new Date(sub.paidAt).toLocaleDateString() : "—"}
                </td>
                <td className="p-3 text-right">
                  {sub.status === "UNPAID" && (
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={actionLoading === sub.id}
                        onClick={() => handleWaive(sub.id)}
                      >
                        Waive
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={actionLoading === sub.id}
                        onClick={() => handleAdjust(sub.id, sub.amountCents)}
                      >
                        Adjust
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={actionLoading === sub.id}
                        onClick={() => handleRecordPayment(sub.id)}
                      >
                        Record Payment
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={actionLoading === sub.id}
                        onClick={() => handleSendReminder(sub.id)}
                      >
                        Remind
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Button
              key={p}
              variant={p === page ? "default" : "outline"}
              size="sm"
              onClick={() => {
                const params = new URLSearchParams(window.location.search);
                params.set("page", String(p));
                router.push(`?${params.toString()}`);
              }}
            >
              {p}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create the admin subscriptions page**

Create `src/app/[slug]/admin/subscriptions/page.tsx`:

```typescript
import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { db } from "@/db/index";
import { membershipClasses } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  getSubscriptionList,
  getSubscriptionSummaryForSeason,
  getActiveSeasonForOrg,
  getSeasonsForOrg,
} from "@/actions/subscriptions/queries";
import { SummaryBar } from "./summary-bar";
import { SubscriptionFilters } from "./subscription-filters";
import { SubscriptionTable } from "./subscription-table";
import { Badge } from "@/components/ui/badge";

export default async function AdminSubscriptionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const seasons = await getSeasonsForOrg(org.id);
  const activeSeason = await getActiveSeasonForOrg(org.id);

  const seasonId =
    typeof sp.seasonId === "string" ? sp.seasonId : activeSeason?.id;

  if (!seasonId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Subscriptions</h1>
        <p className="text-muted-foreground">No seasons configured. Create a season first.</p>
      </div>
    );
  }

  const classes = await db
    .select({ id: membershipClasses.id, name: membershipClasses.name })
    .from(membershipClasses)
    .where(eq(membershipClasses.organisationId, org.id));

  const filters = {
    organisationId: org.id,
    seasonId,
    status: typeof sp.status === "string" ? sp.status : undefined,
    membershipClassId: typeof sp.classId === "string" ? sp.classId : undefined,
    page: typeof sp.page === "string" ? parseInt(sp.page, 10) : 1,
  };

  const result = await getSubscriptionList(filters);
  const summary = await getSubscriptionSummaryForSeason(org.id, seasonId);

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Subscriptions</h1>
        <Badge variant="outline">{result.total}</Badge>
      </div>

      <SummaryBar {...summary} />

      <SubscriptionFilters
        seasons={seasons}
        membershipClasses={classes}
        activeSeasonId={activeSeason?.id ?? null}
        organisationId={org.id}
        slug={slug}
      />

      <SubscriptionTable
        subscriptions={result.subscriptions}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        slug={slug}
        organisationId={org.id}
      />
    </div>
  );
}
```

- [ ] **Step 5: Verify in browser**

Run: `npm run dev`
Navigate to `/{slug}/admin/subscriptions`. Verify the page renders (may show "No seasons configured" if no active season, or an empty table).

- [ ] **Step 6: Commit**

```bash
git add src/app/[slug]/admin/subscriptions/
git commit -m "feat: add admin subscriptions page with filters, summary, and actions"
```

---

## Task 12: Member Dashboard — Subscription Card

**Files:**
- Create: `src/app/[slug]/dashboard/subscription-card.tsx`
- Modify: `src/app/[slug]/dashboard/page.tsx`

- [ ] **Step 1: Create subscription card component**

Create `src/app/[slug]/dashboard/subscription-card.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/currency";

type SubscriptionCardProps = {
  subscription: {
    id: string;
    amountCents: number;
    dueDate: string;
    status: string;
    paidAt: Date | null;
  };
  organisationId: string;
  slug: string;
  stripeConnected: boolean;
};

export function SubscriptionCard({
  subscription,
  organisationId,
  slug,
  stripeConnected,
}: SubscriptionCardProps) {
  const [loading, setLoading] = useState(false);

  async function handlePay() {
    setLoading(true);
    const { createSubscriptionCheckoutSession } = await import(
      "@/actions/subscriptions/checkout"
    );
    const result = await createSubscriptionCheckoutSession(
      organisationId,
      subscription.id,
      slug
    );
    if (result.success && result.url) {
      window.location.href = result.url;
    }
    setLoading(false);
  }

  return (
    <div className="rounded-lg border p-4">
      <h3 className="font-medium mb-3">Membership Subscription</h3>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-bold">{formatCurrency(subscription.amountCents)}</p>
          <p className="text-sm text-muted-foreground">Due: {subscription.dueDate}</p>
        </div>
        <div>
          {subscription.status === "PAID" && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm text-green-600 dark:text-green-400">
                Paid {subscription.paidAt ? new Date(subscription.paidAt).toLocaleDateString() : ""}
              </span>
            </div>
          )}
          {subscription.status === "WAIVED" && (
            <Badge variant="secondary">Waived</Badge>
          )}
          {subscription.status === "UNPAID" && stripeConnected && (
            <Button onClick={handlePay} disabled={loading}>
              {loading ? "Redirecting..." : "Pay Subscription"}
            </Button>
          )}
          {subscription.status === "UNPAID" && !stripeConnected && (
            <Badge variant="secondary">Unpaid</Badge>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Integrate subscription card into dashboard page**

In `src/app/[slug]/dashboard/page.tsx`, add imports and fetch the member's subscription for the active season:

Add imports at top:
```typescript
import { getActiveSeasonForOrg, getMemberSubscription } from "@/actions/subscriptions/queries";
import { SubscriptionCard } from "./subscription-card";
```

After fetching `upcomingBookings` and before the return statement, add:
```typescript
const activeSeason = org ? await getActiveSeasonForOrg(org.id) : null;
const memberSubscription =
  org && session && activeSeason
    ? await getMemberSubscription(org.id, session.memberId, activeSeason.id)
    : null;
```

In the JSX, add the subscription card in the grid (after the "Upcoming Bookings" section, before the "Outstanding Balance" card):

```tsx
{memberSubscription && (
  <SubscriptionCard
    subscription={memberSubscription}
    organisationId={org!.id}
    slug={slug}
    stripeConnected={!!org?.stripeConnectOnboardingComplete}
  />
)}
```

Update the outstanding balance to include unpaid subscription:
```typescript
const unpaidBookingsCents = upcomingBookings
  .filter((b) => !b.balancePaidAt)
  .reduce((sum, b) => sum + b.totalAmountCents, 0);
const unpaidSubCents =
  memberSubscription && memberSubscription.status === "UNPAID"
    ? memberSubscription.amountCents
    : 0;
const totalOutstanding = unpaidBookingsCents + unpaidSubCents;
```

Replace the existing outstanding balance value with `{formatCurrency(totalOutstanding)}`.

- [ ] **Step 3: Verify in browser**

Navigate to `/{slug}/dashboard`. Verify the subscription card appears when a subscription exists for the active season. Verify outstanding balance includes subscription amount.

- [ ] **Step 4: Commit**

```bash
git add src/app/[slug]/dashboard/subscription-card.tsx src/app/[slug]/dashboard/page.tsx
git commit -m "feat: add subscription card to member dashboard"
```

---

## Task 13: Run Full Test Suite and Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS. Note the new test count (should be ~310+).

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Run linter**

Run: `npx eslint src/`
Expected: No errors.

- [ ] **Step 4: Test dev server**

Run: `npm run dev`
Verify:
- Admin subscriptions page loads at `/{slug}/admin/subscriptions`
- Summary bar shows correct totals
- Generate Missing Subscriptions button works
- Waive/Adjust/Record Payment/Send Reminder actions work
- Dashboard subscription card shows for members with a subscription
- Pay Subscription button redirects to Stripe Checkout

- [ ] **Step 5: Update README**

Add Phase 10 to the "Completed" table in README.md:
```markdown
| 10 | Subscription Management | Annual fees per membership class, Stripe Checkout payment, admin waive/adjust/record, daily cron for reminders and grace period |
```

Remove Phase 10 from the "Planned" table.

- [ ] **Step 6: Final commit**

```bash
git add README.md
git commit -m "feat: complete Phase 10 — Subscription Management"
```
