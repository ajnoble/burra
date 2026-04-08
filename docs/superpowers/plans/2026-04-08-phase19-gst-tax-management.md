# Phase 19 — GST/Tax Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-organisation GST support with inclusive pricing, receipt breakdowns, Xero-compatible CSV export, and a BAS-ready GST summary report.

**Architecture:** GST fields added to existing financial tables (organisations, transactions, charges, subscriptions, bookings, checkoutLineItems). A new `calculateGst()` utility extracts the GST component from inclusive amounts. Webhook handlers store GST at payment time. A new GST summary report page aggregates GST by period and category.

**Tech Stack:** Next.js, Drizzle ORM (PostgreSQL), Stripe Connect, React Email, Vitest, Zod

---

### Task 1: GST Calculation Utility

**Files:**
- Modify: `src/lib/currency.ts`
- Test: `src/lib/__tests__/currency.test.ts`

- [ ] **Step 1: Write failing tests for `calculateGst`**

Add to `src/lib/__tests__/currency.test.ts`:

```typescript
describe("calculateGst", () => {
  it("calculates GST for a standard 10% inclusive amount", () => {
    // $110 inclusive → $10 GST
    expect(calculateGst(11000, 1000)).toBe(1000);
  });

  it("calculates GST for $0", () => {
    expect(calculateGst(0, 1000)).toBe(0);
  });

  it("calculates GST for 1 cent", () => {
    // 1 cent * 1000 / 11000 = 0.0909 → rounds to 0
    expect(calculateGst(1, 1000)).toBe(0);
  });

  it("calculates GST for 11 cents", () => {
    // 11 * 1000 / 11000 = 1
    expect(calculateGst(11, 1000)).toBe(1);
  });

  it("rounds correctly for odd amounts", () => {
    // $84.00 → 8400 * 1000 / 11000 = 763.636... → 764
    expect(calculateGst(8400, 1000)).toBe(764);
  });

  it("handles large amounts", () => {
    // $1,000,000 → 100000000 * 1000 / 11000 = 9090909.09... → 9090909
    expect(calculateGst(100000000, 1000)).toBe(9090909);
  });

  it("returns 0 for 0 basis points rate", () => {
    expect(calculateGst(11000, 0)).toBe(0);
  });

  it("works with non-standard rate (5% = 500bps)", () => {
    // 10500 * 500 / 10500 = 500
    expect(calculateGst(10500, 500)).toBe(500);
  });
});
```

Update the import at the top of the test file:

```typescript
import { formatCurrency, applyBasisPoints, calculateGst } from "../currency";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /opt/snowgum && npx vitest run src/lib/__tests__/currency.test.ts`
Expected: FAIL — `calculateGst` is not exported

- [ ] **Step 3: Implement `calculateGst`**

Add to `src/lib/currency.ts`:

```typescript
/**
 * Extract the GST component from a GST-inclusive amount.
 * Formula: amountCents * gstRateBps / (10000 + gstRateBps)
 * For 10% GST (1000 bps): amountCents * 1000 / 11000
 */
export function calculateGst(amountCents: number, gstRateBps: number): number {
  if (gstRateBps === 0) return 0;
  return Math.round((amountCents * gstRateBps) / (10000 + gstRateBps));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /opt/snowgum && npx vitest run src/lib/__tests__/currency.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd /opt/snowgum && git add src/lib/currency.ts src/lib/__tests__/currency.test.ts
git commit -m "feat(gst): add calculateGst utility for GST-inclusive extraction"
```

---

### Task 2: ABN Validation Utility

**Files:**
- Create: `src/lib/abn.ts`
- Create: `src/lib/__tests__/abn.test.ts`

- [ ] **Step 1: Write failing tests for ABN validation**

Create `src/lib/__tests__/abn.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { validateAbn, formatAbn } from "../abn";

describe("validateAbn", () => {
  it("accepts a valid 11-digit ABN without spaces", () => {
    expect(validateAbn("51824753556")).toBe(true);
  });

  it("accepts a valid ABN with standard spacing", () => {
    expect(validateAbn("51 824 753 556")).toBe(true);
  });

  it("rejects ABN with wrong number of digits", () => {
    expect(validateAbn("1234567890")).toBe(false);
  });

  it("rejects ABN with letters", () => {
    expect(validateAbn("51824753abc")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validateAbn("")).toBe(false);
  });

  it("accepts ABN with varied spacing", () => {
    expect(validateAbn("51  824  753  556")).toBe(true);
  });
});

describe("formatAbn", () => {
  it("formats 11 digits into XX XXX XXX XXX", () => {
    expect(formatAbn("51824753556")).toBe("51 824 753 556");
  });

  it("reformats already-spaced ABN", () => {
    expect(formatAbn("51 824 753 556")).toBe("51 824 753 556");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /opt/snowgum && npx vitest run src/lib/__tests__/abn.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ABN validation**

Create `src/lib/abn.ts`:

```typescript
/**
 * Validate an Australian Business Number (ABN).
 * Must contain exactly 11 digits (spaces allowed).
 */
export function validateAbn(abn: string): boolean {
  const digits = abn.replace(/\s/g, "");
  return /^\d{11}$/.test(digits);
}

/**
 * Format an ABN string as "XX XXX XXX XXX".
 */
export function formatAbn(abn: string): string {
  const digits = abn.replace(/\s/g, "");
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 11)}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /opt/snowgum && npx vitest run src/lib/__tests__/abn.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd /opt/snowgum && git add src/lib/abn.ts src/lib/__tests__/abn.test.ts
git commit -m "feat(gst): add ABN validation and formatting utility"
```

---

### Task 3: Database Schema Changes

**Files:**
- Modify: `src/db/schema/organisations.ts`
- Modify: `src/db/schema/transactions.ts`
- Modify: `src/db/schema/charges.ts`
- Modify: `src/db/schema/bookings.ts`

- [ ] **Step 1: Add GST fields to organisations schema**

In `src/db/schema/organisations.ts`, add after the `smsPaymentReminderEnabled` field (line 28):

```typescript
  gstEnabled: boolean("gst_enabled").notNull().default(false),
  gstRateBps: integer("gst_rate_bps").notNull().default(1000), // 1000 bps = 10%
  abnNumber: text("abn_number"),
```

- [ ] **Step 2: Add `gstAmountCents` to transactions schema**

In `src/db/schema/transactions.ts`, add after the `platformFeeCents` field (line 38):

```typescript
  gstAmountCents: integer("gst_amount_cents").notNull().default(0),
```

- [ ] **Step 3: Add `gstAmountCents` to subscriptions schema**

In `src/db/schema/transactions.ts`, add after the `waivedReason` field in the subscriptions table (line 66):

```typescript
  gstAmountCents: integer("gst_amount_cents").notNull().default(0),
```

- [ ] **Step 4: Add `gstAmountCents` to oneOffCharges schema**

In `src/db/schema/charges.ts`, add after the `reminderSentAt` field in the oneOffCharges table (line 61):

```typescript
  gstAmountCents: integer("gst_amount_cents").notNull().default(0),
```

- [ ] **Step 5: Add `gstAmountCents` to checkoutLineItems schema**

In `src/db/schema/charges.ts`, add after the `amountCents` field in the checkoutLineItems table (line 82):

```typescript
  gstAmountCents: integer("gst_amount_cents").notNull().default(0),
```

- [ ] **Step 6: Add `gstAmountCents` to bookings schema**

In `src/db/schema/bookings.ts`, add after the `totalAmountCents` field (line 48):

```typescript
  gstAmountCents: integer("gst_amount_cents").notNull().default(0),
```

- [ ] **Step 7: Generate and apply migration**

```bash
cd /opt/snowgum && npx drizzle-kit generate --name add-gst-fields
```

Review the generated SQL file in `drizzle/` to confirm it adds the expected columns with defaults.

- [ ] **Step 8: Push migration to database**

```bash
cd /opt/snowgum && npx drizzle-kit push
```

- [ ] **Step 9: Verify schema compiles**

```bash
cd /opt/snowgum && npx tsc --noEmit
```

- [ ] **Step 10: Commit**

```bash
cd /opt/snowgum && git add src/db/schema/ drizzle/
git commit -m "feat(gst): add GST fields to organisations, transactions, charges, subscriptions, bookings, and checkoutLineItems"
```

---

### Task 4: Organisation GST Settings — Server Action

**Files:**
- Modify: `src/actions/organisations/update.ts`
- Create: `src/actions/organisations/__tests__/update-gst.test.ts`

- [ ] **Step 1: Write failing tests for GST settings update**

Create `src/actions/organisations/__tests__/update-gst.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockSelect = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    update: (...args: unknown[]) => mockUpdate(...args),
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  organisations: {
    id: "id",
    slug: "slug",
    gstEnabled: "gst_enabled",
    gstRateBps: "gst_rate_bps",
    abnNumber: "abn_number",
  },
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn().mockResolvedValue({ memberId: "admin-1", role: "ADMIN" }),
}));

vi.mock("@/lib/audit-log", () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { updateGstSettings } from "../update-gst";

describe("updateGstSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "org-1", slug: "test-club" }]),
        }),
      }),
    });
  });

  it("rejects enabling GST without ABN", async () => {
    const result = await updateGstSettings({
      organisationId: "org-1",
      gstEnabled: true,
      abnNumber: "",
      slug: "test-club",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("ABN");
  });

  it("accepts enabling GST with valid ABN", async () => {
    const result = await updateGstSettings({
      organisationId: "org-1",
      gstEnabled: true,
      abnNumber: "51 824 753 556",
      slug: "test-club",
    });

    expect(result.success).toBe(true);
  });

  it("allows disabling GST without ABN", async () => {
    const result = await updateGstSettings({
      organisationId: "org-1",
      gstEnabled: false,
      abnNumber: "",
      slug: "test-club",
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid ABN format", async () => {
    const result = await updateGstSettings({
      organisationId: "org-1",
      gstEnabled: true,
      abnNumber: "1234",
      slug: "test-club",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("ABN");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /opt/snowgum && npx vitest run src/actions/organisations/__tests__/update-gst.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `updateGstSettings` server action**

Create `src/actions/organisations/update-gst.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { organisations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionMember, canAccessAdmin } from "@/lib/auth";
import { validateAbn, formatAbn } from "@/lib/abn";
import { createAuditLog } from "@/lib/audit-log";

type UpdateGstInput = {
  organisationId: string;
  gstEnabled: boolean;
  abnNumber: string;
  slug: string;
};

type UpdateGstResult = {
  success: boolean;
  error?: string;
};

export async function updateGstSettings(
  input: UpdateGstInput
): Promise<UpdateGstResult> {
  const session = await getSessionMember(input.organisationId);
  if (!session || !canAccessAdmin(session.role)) {
    return { success: false, error: "Unauthorized" };
  }

  if (input.gstEnabled) {
    if (!input.abnNumber || !validateAbn(input.abnNumber)) {
      return { success: false, error: "A valid ABN is required when GST is enabled" };
    }
  }

  const abnFormatted = input.gstEnabled && input.abnNumber
    ? formatAbn(input.abnNumber)
    : null;

  const [updated] = await db
    .update(organisations)
    .set({
      gstEnabled: input.gstEnabled,
      abnNumber: abnFormatted,
      updatedAt: new Date(),
    })
    .where(eq(organisations.id, input.organisationId))
    .returning();

  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: session.memberId,
    action: "ORGANISATION_UPDATED",
    entityType: "organisation",
    entityId: input.organisationId,
    previousValue: null,
    newValue: { gstEnabled: input.gstEnabled, abnNumber: abnFormatted },
  }).catch(console.error);

  revalidatePath(`/${input.slug}/admin/settings`);

  return { success: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /opt/snowgum && npx vitest run src/actions/organisations/__tests__/update-gst.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd /opt/snowgum && git add src/actions/organisations/update-gst.ts src/actions/organisations/__tests__/update-gst.test.ts
git commit -m "feat(gst): add updateGstSettings server action with ABN validation"
```

---

### Task 5: Organisation GST Settings — UI Component

**Files:**
- Create: `src/app/[slug]/admin/settings/gst-settings-form.tsx`
- Modify: `src/app/[slug]/admin/settings/page.tsx`

- [ ] **Step 1: Create the GST settings form component**

Create `src/app/[slug]/admin/settings/gst-settings-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { updateGstSettings } from "@/actions/organisations/update-gst";
import { toast } from "sonner";

type GstSettingsFormProps = {
  organisationId: string;
  slug: string;
  gstEnabled: boolean;
  gstRateBps: number;
  abnNumber: string | null;
};

export function GstSettingsForm({
  organisationId,
  slug,
  gstEnabled: initialGstEnabled,
  gstRateBps,
  abnNumber: initialAbn,
}: GstSettingsFormProps) {
  const [saving, setSaving] = useState(false);
  const [gstEnabled, setGstEnabled] = useState(initialGstEnabled);
  const [abnNumber, setAbnNumber] = useState(initialAbn ?? "");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    try {
      const result = await updateGstSettings({
        organisationId,
        gstEnabled,
        abnNumber,
        slug,
      });

      if (result.success) {
        toast.success("GST settings saved");
      } else {
        toast.error(result.error ?? "Failed to save GST settings");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save GST settings"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>GST / Tax</CardTitle>
        <CardDescription>
          Configure GST for your organisation. All prices are treated as GST-inclusive.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              id="gstEnabled"
              checked={gstEnabled}
              onCheckedChange={setGstEnabled}
            />
            <Label htmlFor="gstEnabled">Enable GST</Label>
          </div>
          {gstEnabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="abnNumber">ABN</Label>
                <Input
                  id="abnNumber"
                  value={abnNumber}
                  onChange={(e) => setAbnNumber(e.target.value)}
                  placeholder="51 824 753 556"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Your Australian Business Number (11 digits)
                </p>
              </div>
              <div className="space-y-2">
                <Label>GST Rate</Label>
                <Input
                  value={`${gstRateBps / 100}%`}
                  disabled
                />
                <p className="text-xs text-muted-foreground">
                  Standard Australian GST rate
                </p>
              </div>
            </>
          )}
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save GST Settings"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Add the GST settings form to the settings page**

In `src/app/[slug]/admin/settings/page.tsx`, add the import at the top (after the existing imports):

```typescript
import { GstSettingsForm } from "./gst-settings-form";
```

Then add the GST section after the StripeConnectCard section. Find the block:

```tsx
      <Separator className="my-8" />

      <h2 className="text-xl font-bold mb-4">Membership Classes</h2>
```

Insert before it:

```tsx
      <GstSettingsForm
        organisationId={org.id}
        slug={slug}
        gstEnabled={org.gstEnabled}
        gstRateBps={org.gstRateBps}
        abnNumber={org.abnNumber}
      />

      <Separator className="my-8" />

      <h2 className="text-xl font-bold mb-4">Membership Classes</h2>
```

Remove the duplicate `<Separator>` and `<h2>` line so you end up with one transition from GST to Membership Classes.

- [ ] **Step 3: Verify the page compiles**

```bash
cd /opt/snowgum && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd /opt/snowgum && git add src/app/[slug]/admin/settings/gst-settings-form.tsx src/app/[slug]/admin/settings/page.tsx
git commit -m "feat(gst): add GST settings UI to admin settings page"
```

---

### Task 6: GST on Charge Creation

**Files:**
- Modify: `src/actions/charges/create.ts`
- Modify: `src/actions/charges/bulk-create.ts`
- Modify: `src/actions/charges/__tests__/create.test.ts`

- [ ] **Step 1: Write failing test for GST on charge creation**

Add a new test to `src/actions/charges/__tests__/create.test.ts`. The test should verify that when creating a charge for an org with `gstEnabled: true` and `gstRateBps: 1000`, the charge is inserted with the correct `gstAmountCents`. This requires the mock `db.select` chain to return org data with GST fields.

Add this test case to the existing describe block:

```typescript
it("sets gstAmountCents when org has GST enabled", async () => {
  // Mock auth
  // ... (use existing auth mock pattern from the test file)
  
  // Mock org lookup returns gstEnabled: true, gstRateBps: 1000
  // Mock charge insert
  // Assert mockValues was called with gstAmountCents: 455 (for 5000 cents: 5000 * 1000 / 11000 = 454.5 → 455)
});
```

The exact mock setup should follow the pattern already established in the test file (lines 1-50 of `src/actions/charges/__tests__/create.test.ts`).

- [ ] **Step 2: Run tests to verify it fails**

Run: `cd /opt/snowgum && npx vitest run src/actions/charges/__tests__/create.test.ts`
Expected: FAIL

- [ ] **Step 3: Modify `createCharge` to look up org GST and store `gstAmountCents`**

In `src/actions/charges/create.ts`:

Add import at top:

```typescript
import { calculateGst } from "@/lib/currency";
```

After the auth check and before the `db.insert(oneOffCharges)` call (around line 42), look up the org's GST settings:

```typescript
  const [org] = await db
    .select({
      gstEnabled: organisations.gstEnabled,
      gstRateBps: organisations.gstRateBps,
    })
    .from(organisations)
    .where(eq(organisations.id, input.organisationId));

  const gstAmountCents = org?.gstEnabled
    ? calculateGst(input.amountCents, org.gstRateBps)
    : 0;
```

Then add `gstAmountCents` to the `.values()` call in the insert:

```typescript
  const [charge] = await db
    .insert(oneOffCharges)
    .values({
      organisationId: input.organisationId,
      memberId: input.memberId,
      categoryId: input.categoryId,
      description: input.description || null,
      amountCents: input.amountCents,
      dueDate: input.dueDate || null,
      createdByMemberId: input.createdByMemberId,
      gstAmountCents,
    })
    .returning();
```

- [ ] **Step 4: Modify `bulkCreateCharges` the same way**

In `src/actions/charges/bulk-create.ts`:

Add import:

```typescript
import { calculateGst } from "@/lib/currency";
```

After the auth check and input validation, look up GST settings (before the `values` mapping around line 45):

```typescript
  const [orgGst] = await db
    .select({
      gstEnabled: organisations.gstEnabled,
      gstRateBps: organisations.gstRateBps,
    })
    .from(organisations)
    .where(eq(organisations.id, input.organisationId));

  const gstAmountCents = orgGst?.gstEnabled
    ? calculateGst(input.amountCents, orgGst.gstRateBps)
    : 0;
```

Add `gstAmountCents` to each value in the map:

```typescript
  const values = input.memberIds.map((memberId) => ({
    organisationId: input.organisationId,
    memberId,
    categoryId: input.categoryId,
    description: input.description || null,
    amountCents: input.amountCents,
    dueDate: input.dueDate || null,
    createdByMemberId: input.createdByMemberId,
    gstAmountCents,
  }));
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /opt/snowgum && npx vitest run src/actions/charges/__tests__/create.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
cd /opt/snowgum && git add src/actions/charges/create.ts src/actions/charges/bulk-create.ts src/actions/charges/__tests__/create.test.ts
git commit -m "feat(gst): store gstAmountCents when creating one-off charges"
```

---

### Task 7: GST on Subscription Generation

**Files:**
- Modify: `src/actions/subscriptions/generate.ts`

- [ ] **Step 1: Modify `generateSubscriptions` to store GST**

In `src/actions/subscriptions/generate.ts`:

Add import:

```typescript
import { organisations } from "@/db/schema";
import { calculateGst } from "@/lib/currency";
```

Note: `organisations` may already be available via the existing schema imports. If not, add it to the import from `@/db/schema`.

After the season lookup (around line 43), look up org GST settings:

```typescript
  const [orgGst] = await db
    .select({
      gstEnabled: organisations.gstEnabled,
      gstRateBps: organisations.gstRateBps,
    })
    .from(organisations)
    .where(eq(organisations.id, organisationId));
```

Modify the bulk insert values to include `gstAmountCents`:

```typescript
  await db.insert(subscriptions).values(
    eligible.map((row) => ({
      organisationId,
      memberId: row.memberId,
      seasonId,
      amountCents: row.amountCents as number,
      dueDate: season.startDate,
      status: "UNPAID" as const,
      gstAmountCents: orgGst?.gstEnabled
        ? calculateGst(row.amountCents as number, orgGst.gstRateBps)
        : 0,
    }))
  );
```

- [ ] **Step 2: Verify compilation**

```bash
cd /opt/snowgum && npx tsc --noEmit
```

- [ ] **Step 3: Run existing subscription tests**

```bash
cd /opt/snowgum && npx vitest run --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|subscription)" | head -20
```

- [ ] **Step 4: Commit**

```bash
cd /opt/snowgum && git add src/actions/subscriptions/generate.ts
git commit -m "feat(gst): store gstAmountCents when generating subscriptions"
```

---

### Task 8: GST on Booking Creation

**Files:**
- Modify: `src/actions/bookings/create.ts`

- [ ] **Step 1: Modify booking creation to store GST**

In `src/actions/bookings/create.ts`:

Add import (if `organisations` is not already imported):

```typescript
import { calculateGst } from "@/lib/currency";
```

Inside the `db.transaction` block, after the booking price is calculated and before the booking is inserted, look up the org's GST settings. The `data.organisationId` is available. Add the lookup inside the transaction:

```typescript
      const [orgGst] = await tx
        .select({
          gstEnabled: organisations.gstEnabled,
          gstRateBps: organisations.gstRateBps,
        })
        .from(organisations)
        .where(eq(organisations.id, data.organisationId));

      const bookingGstAmountCents = orgGst?.gstEnabled
        ? calculateGst(bookingPrice.totalAmountCents, orgGst.gstRateBps)
        : 0;
```

Add `gstAmountCents: bookingGstAmountCents` to the booking insert values.

Find the `tx.insert(bookings).values({...})` call and add the field.

- [ ] **Step 2: Verify compilation**

```bash
cd /opt/snowgum && npx tsc --noEmit
```

- [ ] **Step 3: Run existing booking tests**

```bash
cd /opt/snowgum && npx vitest run --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|booking)" | head -20
```

- [ ] **Step 4: Commit**

```bash
cd /opt/snowgum && git add src/actions/bookings/create.ts
git commit -m "feat(gst): store gstAmountCents when creating bookings"
```

---

### Task 9: GST in Webhook Handlers (Payment Completion)

**Files:**
- Modify: `src/actions/stripe/webhook-handlers.ts`
- Modify: `src/actions/stripe/__tests__/webhook-handlers.test.ts`

- [ ] **Step 1: Write failing test for GST on payment transaction**

Add to `src/actions/stripe/__tests__/webhook-handlers.test.ts`.

Update the schema mock to include `gstAmountCents` fields and `gstEnabled`/`gstRateBps` on organisations:

```typescript
// In the vi.mock("@/db/schema") block, add to organisations:
gstEnabled: "gst_enabled",
gstRateBps: "gst_rate_bps",
// Add to transactions:
gstAmountCents: "gst_amount_cents",
```

Add a test case:

```typescript
it("stores gstAmountCents on PAYMENT transaction when org has GST enabled", async () => {
  // Setup: org lookup returns gstEnabled: true, gstRateBps: 1000, platformFeeBps: 100
  // Mock idempotency check returns empty (no existing txn)
  // Mock invoice lookup returns amountCents: 11000
  // Mock insert returns transaction with id
  // Mock booking update
  // Mock email data lookup
  
  // Call handleCheckoutSessionCompleted with session metadata
  
  // Assert: the transaction insert values include gstAmountCents: 1000
  // (11000 * 1000 / 11000 = 1000)
});
```

- [ ] **Step 2: Run tests to verify it fails**

Run: `cd /opt/snowgum && npx vitest run src/actions/stripe/__tests__/webhook-handlers.test.ts`
Expected: FAIL

- [ ] **Step 3: Modify webhook handlers to store GST**

In `src/actions/stripe/webhook-handlers.ts`:

Add import:

```typescript
import { calculateGst } from "@/lib/currency";
```

**For the consolidated checkout path** (around line 44-48), update the org data query to also fetch GST fields:

```typescript
    const [orgData] = await db
      .select({
        platformFeeBps: organisations.platformFeeBps,
        gstEnabled: organisations.gstEnabled,
        gstRateBps: organisations.gstRateBps,
      })
      .from(organisations)
      .where(eq(organisations.id, organisationId));
```

In the loop that creates PAYMENT transactions for each line item (around line 68-80), add GST calculation:

```typescript
      const gstAmountCents = orgData?.gstEnabled
        ? calculateGst(item.amountCents, orgData.gstRateBps)
        : 0;
```

Add `gstAmountCents` to the `db.insert(transactions).values({...})` call.

**For the subscription payment path** (around line 198-210), look up org GST after fetching the subscription:

```typescript
    const [orgGst] = await db
      .select({
        gstEnabled: organisations.gstEnabled,
        gstRateBps: organisations.gstRateBps,
      })
      .from(organisations)
      .where(eq(organisations.id, sub.organisationId));

    const gstAmountCents = orgGst?.gstEnabled
      ? calculateGst(amountCents, orgGst.gstRateBps)
      : 0;
```

Add `gstAmountCents` to the subscription PAYMENT transaction insert.

**For the single booking payment path** (around line 283-297), look up org GST:

```typescript
    const [orgGst] = await db
      .select({
        gstEnabled: organisations.gstEnabled,
        gstRateBps: organisations.gstRateBps,
      })
      .from(organisations)
      .where(eq(organisations.id, invoice.organisationId));

    const gstAmountCents = orgGst?.gstEnabled
      ? calculateGst(amountCents, orgGst.gstRateBps)
      : 0;
```

Add `gstAmountCents` to the PAYMENT transaction insert.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /opt/snowgum && npx vitest run src/actions/stripe/__tests__/webhook-handlers.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd /opt/snowgum && git add src/actions/stripe/webhook-handlers.ts src/actions/stripe/__tests__/webhook-handlers.test.ts
git commit -m "feat(gst): store gstAmountCents on transactions in webhook handlers"
```

---

### Task 10: GST in Stripe Checkout Line Item Names

**Files:**
- Modify: `src/lib/stripe.ts`
- Modify: `src/lib/__tests__/stripe.test.ts`

- [ ] **Step 1: Write failing test for GST label in checkout params**

Add to `src/lib/__tests__/stripe.test.ts`:

```typescript
describe("buildCheckoutSessionParams with GST", () => {
  it("appends (incl. GST) to product name when gstEnabled is true", async () => {
    const { buildCheckoutSessionParams } = await import("../stripe");

    const params = buildCheckoutSessionParams({
      connectedAccountId: "acct_test123",
      transactionId: "txn-uuid-1",
      bookingId: "bkg-uuid-1",
      organisationId: "org-uuid-1",
      bookingReference: "POLS-2027-7K3M",
      amountCents: 84000,
      platformFeeBps: 100,
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      gstEnabled: true,
    });

    expect(params.line_items[0].price_data.product_data.name).toBe(
      "Booking POLS-2027-7K3M (incl. GST)"
    );
  });

  it("does not append (incl. GST) when gstEnabled is false", async () => {
    const { buildCheckoutSessionParams } = await import("../stripe");

    const params = buildCheckoutSessionParams({
      connectedAccountId: "acct_test123",
      transactionId: "txn-uuid-1",
      bookingId: "bkg-uuid-1",
      organisationId: "org-uuid-1",
      bookingReference: "POLS-2027-7K3M",
      amountCents: 84000,
      platformFeeBps: 100,
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      gstEnabled: false,
    });

    expect(params.line_items[0].price_data.product_data.name).toBe(
      "Booking POLS-2027-7K3M"
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /opt/snowgum && npx vitest run src/lib/__tests__/stripe.test.ts`
Expected: FAIL — `gstEnabled` not in type

- [ ] **Step 3: Add `gstEnabled` to checkout param builders**

In `src/lib/stripe.ts`:

Add `gstEnabled?: boolean` to `CheckoutSessionInput` type (line 14-24):

```typescript
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
  gstEnabled?: boolean;
};
```

In `buildCheckoutSessionParams`, update the product name:

```typescript
const gstSuffix = input.gstEnabled ? " (incl. GST)" : "";
```

Use it in the line item:

```typescript
product_data: { name: `Booking ${input.bookingReference}${gstSuffix}` },
```

Do the same for `ConsolidatedCheckoutInput` — add `gstEnabled?: boolean`:

```typescript
export type ConsolidatedCheckoutInput = {
  connectedAccountId: string;
  organisationId: string;
  lineItems: Array<{
    name: string;
    amountCents: number;
  }>;
  totalAmountCents: number;
  platformFeeBps: number;
  successUrl: string;
  cancelUrl: string;
  gstEnabled?: boolean;
};
```

In `buildConsolidatedCheckoutParams`, append suffix to each line item name:

```typescript
const gstSuffix = input.gstEnabled ? " (incl. GST)" : "";
// ... in the map:
product_data: { name: `${item.name}${gstSuffix}` },
```

Do the same for `SubscriptionCheckoutInput` and `buildSubscriptionCheckoutParams`:

Add `gstEnabled?: boolean` to `SubscriptionCheckoutInput`.

In `buildSubscriptionCheckoutParams`:

```typescript
const gstSuffix = input.gstEnabled ? " (incl. GST)" : "";
product_data: { name: `Membership Fee — ${input.seasonName}${gstSuffix}` },
```

- [ ] **Step 4: Update checkout callers to pass `gstEnabled`**

In `src/actions/stripe/checkout.ts`, update the org query to also select `gstEnabled`:

```typescript
  const [org] = await db
    .select({
      stripeConnectAccountId: organisations.stripeConnectAccountId,
      stripeConnectOnboardingComplete: organisations.stripeConnectOnboardingComplete,
      platformFeeBps: organisations.platformFeeBps,
      gstEnabled: organisations.gstEnabled,
    })
    .from(organisations)
    .where(eq(organisations.id, organisationId));
```

Pass `gstEnabled: org.gstEnabled` to `buildCheckoutSessionParams`.

In `src/actions/stripe/consolidated-checkout.ts`, same pattern — add `gstEnabled` to the org query and pass to `buildConsolidatedCheckoutParams`.

In `src/actions/subscriptions/checkout.ts`, same pattern — add `gstEnabled` to the org query and pass to `buildSubscriptionCheckoutParams`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /opt/snowgum && npx vitest run src/lib/__tests__/stripe.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Verify full compilation**

```bash
cd /opt/snowgum && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
cd /opt/snowgum && git add src/lib/stripe.ts src/lib/__tests__/stripe.test.ts src/actions/stripe/checkout.ts src/actions/stripe/consolidated-checkout.ts src/actions/subscriptions/checkout.ts
git commit -m "feat(gst): add (incl. GST) label to Stripe checkout line items"
```

---

### Task 11: GST in Payment Receipt Email Templates

**Files:**
- Modify: `src/lib/email/templates/payment-received.tsx`
- Modify: `src/lib/email/templates/consolidated-payment-received.tsx`
- Modify: `src/lib/email/__tests__/payment-received.test.ts`
- Create: `src/lib/email/__tests__/consolidated-payment-received.test.ts`

- [ ] **Step 1: Write failing tests for GST in payment-received email**

Update `src/lib/email/__tests__/payment-received.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { PaymentReceivedEmail } from "../templates/payment-received";

describe("PaymentReceivedEmail", () => {
  const baseProps = {
    orgName: "Bogong Ski Club",
    bookingReference: "BK-2024-006",
    amountCents: 84000,
    paidDate: "2024-05-15",
  };

  it("renders booking reference", async () => {
    const html = await render(React.createElement(PaymentReceivedEmail, baseProps));
    expect(html).toContain("BK-2024-006");
  });

  it("renders formatted amount", async () => {
    const html = await render(React.createElement(PaymentReceivedEmail, baseProps));
    expect(html).toContain("$840.00");
  });

  it("renders paid date", async () => {
    const html = await render(React.createElement(PaymentReceivedEmail, baseProps));
    expect(html).toContain("2024");
  });

  it("renders GST breakdown when gstEnabled", async () => {
    const html = await render(
      React.createElement(PaymentReceivedEmail, {
        ...baseProps,
        gstEnabled: true,
        gstAmountCents: 7636,
        abnNumber: "51 824 753 556",
      })
    );
    expect(html).toContain("GST");
    expect(html).toContain("$76.36");
    expect(html).toContain("51 824 753 556");
  });

  it("does not render GST when gstEnabled is false", async () => {
    const html = await render(
      React.createElement(PaymentReceivedEmail, {
        ...baseProps,
        gstEnabled: false,
      })
    );
    expect(html).not.toContain("GST");
    expect(html).not.toContain("ABN");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /opt/snowgum && npx vitest run src/lib/email/__tests__/payment-received.test.ts`
Expected: FAIL — new props not accepted

- [ ] **Step 3: Update `PaymentReceivedEmail` template**

In `src/lib/email/templates/payment-received.tsx`:

Update the props type:

```typescript
type PaymentReceivedEmailProps = {
  orgName: string;
  bookingReference: string;
  amountCents: number;
  paidDate: string;
  logoUrl?: string;
  gstEnabled?: boolean;
  gstAmountCents?: number;
  abnNumber?: string;
};
```

Update the component to destructure new props:

```typescript
export function PaymentReceivedEmail({
  orgName,
  bookingReference,
  amountCents,
  paidDate,
  logoUrl,
  gstEnabled,
  gstAmountCents,
  abnNumber,
}: PaymentReceivedEmailProps) {
```

Replace the "Amount paid" block inside `<Section style={detailsBox}>` with conditional GST rendering:

```tsx
      <Section style={detailsBox}>
        <Text style={paragraph}>
          <strong>Booking reference:</strong> {bookingReference}
        </Text>
        {gstEnabled && gstAmountCents ? (
          <>
            <Text style={paragraph}>
              <strong>Subtotal (excl. GST):</strong>{" "}
              {formatCurrency(amountCents - gstAmountCents)}
            </Text>
            <Text style={paragraph}>
              <strong>GST (10%):</strong> {formatCurrency(gstAmountCents)}
            </Text>
            <Text style={paragraph}>
              <strong>Total:</strong> {formatCurrency(amountCents)}
            </Text>
          </>
        ) : (
          <Text style={paragraph}>
            <strong>Amount paid:</strong> {formatCurrency(amountCents)}
          </Text>
        )}
        <Text style={paragraph}>
          <strong>Payment date:</strong> {formatDate(paidDate)}
        </Text>
        {gstEnabled && abnNumber && (
          <Text style={paragraph}>
            <strong>ABN:</strong> {abnNumber}
          </Text>
        )}
      </Section>
```

- [ ] **Step 4: Write and run tests for consolidated payment receipt**

Create `src/lib/email/__tests__/consolidated-payment-received.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { ConsolidatedPaymentReceivedEmail } from "../templates/consolidated-payment-received";

describe("ConsolidatedPaymentReceivedEmail", () => {
  const baseProps = {
    orgName: "Bogong Ski Club",
    lineItems: [
      { description: "Membership", memberName: "Jane Doe", amountCents: 11000 },
      { description: "Locker Fee", memberName: "Jane Doe", amountCents: 5500 },
    ],
    totalAmountCents: 16500,
    paidDate: "2024-05-15",
  };

  it("renders GST breakdown when gstEnabled", async () => {
    const html = await render(
      React.createElement(ConsolidatedPaymentReceivedEmail, {
        ...baseProps,
        gstEnabled: true,
        totalGstAmountCents: 1500,
        abnNumber: "51 824 753 556",
      })
    );
    expect(html).toContain("GST");
    expect(html).toContain("$15.00");
    expect(html).toContain("51 824 753 556");
  });

  it("does not render GST when gstEnabled is false", async () => {
    const html = await render(
      React.createElement(ConsolidatedPaymentReceivedEmail, baseProps)
    );
    expect(html).not.toContain("GST");
    expect(html).not.toContain("ABN");
  });
});
```

- [ ] **Step 5: Update `ConsolidatedPaymentReceivedEmail` template**

In `src/lib/email/templates/consolidated-payment-received.tsx`:

Update the props type:

```typescript
type ConsolidatedPaymentReceivedEmailProps = {
  orgName: string;
  lineItems: LineItem[];
  totalAmountCents: number;
  paidDate: string;
  logoUrl?: string;
  gstEnabled?: boolean;
  totalGstAmountCents?: number;
  abnNumber?: string;
};
```

Add after `<Hr />` and the Total section, before the payment date:

```tsx
        {gstEnabled && totalGstAmountCents ? (
          <>
            <Text style={paragraph}>
              <strong>Subtotal (excl. GST):</strong>{" "}
              {formatCurrency(totalAmountCents - totalGstAmountCents)}
            </Text>
            <Text style={paragraph}>
              <strong>GST (10%):</strong> {formatCurrency(totalGstAmountCents)}
            </Text>
            <Text style={paragraph}>
              <strong>Total:</strong> {formatCurrency(totalAmountCents)}
            </Text>
          </>
        ) : (
          <Text style={paragraph}>
            <strong>Total paid:</strong> {formatCurrency(totalAmountCents)}
          </Text>
        )}
        <Text style={paragraph}>
          <strong>Payment date:</strong> {formatDate(paidDate)}
        </Text>
        {gstEnabled && abnNumber && (
          <Text style={paragraph}>
            <strong>ABN:</strong> {abnNumber}
          </Text>
        )}
```

Remove the existing `<Text>Total paid:</Text>` and `<Text>Payment date:</Text>` lines that this replaces.

- [ ] **Step 6: Update webhook handlers to pass GST data to email templates**

In `src/actions/stripe/webhook-handlers.ts`:

For all three email-sending paths, update the org data query to also fetch `gstEnabled`, `gstRateBps`, and `abnNumber`, then pass them to the email template `React.createElement` calls.

**Consolidated receipt** (around line 134-158): Update the emailData query to include `gstEnabled`, `abnNumber` from `organisations`. Calculate totalGstAmountCents from the line items. Pass `gstEnabled`, `totalGstAmountCents`, `abnNumber` to `ConsolidatedPaymentReceivedEmail`.

**Subscription receipt** (around line 235-249): Pass `gstEnabled`, `gstAmountCents`, `abnNumber` to `PaymentReceivedEmail`.

**Single booking receipt** (around line 322-336): Pass `gstEnabled`, `gstAmountCents`, `abnNumber` to `PaymentReceivedEmail`.

- [ ] **Step 7: Run all email tests**

Run: `cd /opt/snowgum && npx vitest run src/lib/email/__tests__/`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
cd /opt/snowgum && git add src/lib/email/templates/payment-received.tsx src/lib/email/templates/consolidated-payment-received.tsx src/lib/email/__tests__/payment-received.test.ts src/lib/email/__tests__/consolidated-payment-received.test.ts src/actions/stripe/webhook-handlers.ts
git commit -m "feat(gst): add GST breakdown and ABN to payment receipt emails"
```

---

### Task 12: GST Label in Payment Reminder Email Templates

**Files:**
- Modify: `src/lib/email/templates/booking-payment-reminder.tsx`
- Modify: `src/lib/email/templates/charge-created.tsx`
- Modify: `src/lib/email/templates/charge-due-reminder.tsx`
- Modify: `src/lib/email/templates/membership-renewal-due.tsx`

- [ ] **Step 1: Write failing test for "(incl. GST)" label**

Create `src/lib/email/__tests__/gst-reminder-labels.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { render } from "@react-email/components";
import React from "react";
import { BookingPaymentReminderEmail } from "../templates/booking-payment-reminder";
import { ChargeCreatedEmail } from "../templates/charge-created";
import { ChargeDueReminderEmail } from "../templates/charge-due-reminder";
import { MembershipRenewalDueEmail } from "../templates/membership-renewal-due";

describe("GST labels on reminder emails", () => {
  it("BookingPaymentReminderEmail shows (incl. GST) when gstEnabled", async () => {
    const html = await render(
      React.createElement(BookingPaymentReminderEmail, {
        orgName: "Test Club",
        bookingReference: "BK-001",
        lodgeName: "Test Lodge",
        checkInDate: "2024-07-01",
        checkOutDate: "2024-07-05",
        totalAmountCents: 44000,
        balanceDueDate: "2024-06-15",
        daysRemaining: 7,
        payUrl: "https://example.com/pay",
        gstEnabled: true,
      })
    );
    expect(html).toContain("incl. GST");
  });

  it("ChargeCreatedEmail shows (incl. GST) when gstEnabled", async () => {
    const html = await render(
      React.createElement(ChargeCreatedEmail, {
        orgName: "Test Club",
        categoryName: "Locker Fee",
        amountCents: 5500,
        payUrl: "https://example.com/pay",
        gstEnabled: true,
      })
    );
    expect(html).toContain("incl. GST");
  });

  it("ChargeDueReminderEmail shows (incl. GST) when gstEnabled", async () => {
    const html = await render(
      React.createElement(ChargeDueReminderEmail, {
        orgName: "Test Club",
        categoryName: "Locker Fee",
        amountCents: 5500,
        dueDate: "2024-06-15",
        payUrl: "https://example.com/pay",
        gstEnabled: true,
      })
    );
    expect(html).toContain("incl. GST");
  });

  it("MembershipRenewalDueEmail shows (incl. GST) when gstEnabled", async () => {
    const html = await render(
      React.createElement(MembershipRenewalDueEmail, {
        orgName: "Test Club",
        seasonName: "Winter 2027",
        amountCents: 30000,
        dueDate: "2024-06-01",
        payUrl: "https://example.com/pay",
        gstEnabled: true,
      })
    );
    expect(html).toContain("incl. GST");
  });

  it("does not show (incl. GST) when gstEnabled is false", async () => {
    const html = await render(
      React.createElement(ChargeCreatedEmail, {
        orgName: "Test Club",
        categoryName: "Locker Fee",
        amountCents: 5500,
        payUrl: "https://example.com/pay",
        gstEnabled: false,
      })
    );
    expect(html).not.toContain("incl. GST");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /opt/snowgum && npx vitest run src/lib/email/__tests__/gst-reminder-labels.test.ts`
Expected: FAIL

- [ ] **Step 3: Update all four reminder templates**

For each template, the pattern is the same:

1. Add `gstEnabled?: boolean` to the props type
2. Destructure it in the component
3. Change the amount display line from:
   ```tsx
   <strong>Amount due:</strong> {formatCurrency(amountCents)}
   ```
   to:
   ```tsx
   <strong>Amount due:</strong> {formatCurrency(amountCents)}{gstEnabled ? " (incl. GST)" : ""}
   ```

**`booking-payment-reminder.tsx`:** Two places show the amount — the paragraph text (line 36) and the details box (line 53). Update both.

Line 36 area: Change `{formatCurrency(totalAmountCents)} due on` to `{formatCurrency(totalAmountCents)}{gstEnabled ? " (incl. GST)" : ""} due on`

Line 53 area: Change `{formatCurrency(totalAmountCents)}` to `{formatCurrency(totalAmountCents)}{gstEnabled ? " (incl. GST)" : ""}`

**`charge-created.tsx`:** Update the "Amount due" line (line 42).

**`charge-due-reminder.tsx`:** Update the "Amount due" line (line 42).

**`membership-renewal-due.tsx`:** Update the "Amount due" line (line 38).

- [ ] **Step 4: Update callers to pass `gstEnabled` to reminder templates**

The callers that send these emails need to look up the org's `gstEnabled` and pass it to the template. Key files:

- `src/actions/bookings/cron.ts` (sends booking payment reminders)
- `src/actions/charges/create.ts` (sends charge created email — already looks up org, add `gstEnabled`)
- `src/actions/charges/bulk-create.ts` (sends charge created email — already looks up org, add `gstEnabled`)
- `src/actions/charges/cron.ts` (sends charge due reminders)
- `src/actions/subscriptions/send-reminder.ts` (sends membership renewal due)

For each, ensure the org query includes `gstEnabled` and it gets passed to the template's `React.createElement` call.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /opt/snowgum && npx vitest run src/lib/email/__tests__/gst-reminder-labels.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Run full test suite**

```bash
cd /opt/snowgum && npx vitest run
```

- [ ] **Step 7: Commit**

```bash
cd /opt/snowgum && git add src/lib/email/templates/ src/lib/email/__tests__/ src/actions/bookings/cron.ts src/actions/charges/create.ts src/actions/charges/bulk-create.ts src/actions/charges/cron.ts src/actions/subscriptions/send-reminder.ts
git commit -m "feat(gst): add (incl. GST) label to payment reminder emails"
```

---

### Task 13: Transaction Ledger — GST Column and Updated Xero Export

**Files:**
- Modify: `src/actions/reports/transaction-ledger.ts`
- Modify: `src/actions/reports/export-csv.ts`
- Modify: `src/app/[slug]/admin/reports/[reportId]/page.tsx`

- [ ] **Step 1: Write failing test for GST in ledger**

Create `src/actions/reports/__tests__/transaction-ledger-gst.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatLedgerForXero } from "../transaction-ledger";
import type { LedgerRow } from "../transaction-ledger";

describe("formatLedgerForXero with GST", () => {
  const row: LedgerRow = {
    id: "txn-1",
    date: new Date("2027-01-15T10:00:00Z"),
    memberFirstName: "Jane",
    memberLastName: "Doe",
    type: "PAYMENT",
    amountCents: 11000,
    gstAmountCents: 1000,
    description: "Booking payment",
    stripeRef: "pi_test123",
  };

  it("includes Tax Amount column", async () => {
    const result = await formatLedgerForXero([row], true);
    expect(result[0].taxAmount).toBe("10.00");
  });

  it("uses 'GST on Income' as Tax Type when GST enabled", async () => {
    const result = await formatLedgerForXero([row], true);
    expect(result[0].taxType).toBe("GST on Income");
  });

  it("uses 'No GST' as Tax Type when GST disabled", async () => {
    const result = await formatLedgerForXero([row], false);
    expect(result[0].taxType).toBe("No GST");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /opt/snowgum && npx vitest run src/actions/reports/__tests__/transaction-ledger-gst.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `LedgerRow` type and queries**

In `src/actions/reports/transaction-ledger.ts`:

Add `gstAmountCents` to the `LedgerRow` type:

```typescript
export type LedgerRow = {
  id: string;
  date: Date;
  memberFirstName: string;
  memberLastName: string;
  type: "PAYMENT" | "REFUND" | "CREDIT" | "SUBSCRIPTION" | "ADJUSTMENT" | "INVOICE";
  amountCents: number;
  gstAmountCents: number;
  description: string;
  stripeRef: string | null;
};
```

Update the `db.select()` in `getTransactionLedger` to also select `gstAmountCents`:

```typescript
    .select({
      id: transactions.id,
      date: transactions.createdAt,
      memberFirstName: members.firstName,
      memberLastName: members.lastName,
      type: transactions.type,
      amountCents: transactions.amountCents,
      gstAmountCents: transactions.gstAmountCents,
      description: transactions.description,
      stripeRef: transactions.stripePaymentIntentId,
    })
```

Update `XeroRow` type:

```typescript
export type XeroRow = {
  date: string;
  amount: string;
  taxAmount: string;
  taxType: string;
  payee: string;
  description: string;
  reference: string;
};
```

Update `formatLedgerForXero` to accept `gstEnabled` parameter and include tax fields:

```typescript
export async function formatLedgerForXero(rows: LedgerRow[], gstEnabled: boolean): Promise<XeroRow[]> {
  return rows.map((row) => ({
    date: format(row.date, "dd/MM/yyyy"),
    amount: (row.amountCents / 100).toFixed(2),
    taxAmount: (row.gstAmountCents / 100).toFixed(2),
    taxType: gstEnabled ? "GST on Income" : "No GST",
    payee: `${row.memberFirstName} ${row.memberLastName}`,
    description: row.description,
    reference: row.stripeRef ?? "",
  }));
}
```

- [ ] **Step 4: Update `XERO_COLUMN_MAP` in export-csv.ts**

In `src/actions/reports/export-csv.ts`:

```typescript
export const XERO_COLUMN_MAP: CsvColumn[] = [
  { key: "date", header: "Date" },
  { key: "amount", header: "Amount" },
  { key: "taxAmount", header: "Tax Amount" },
  { key: "taxType", header: "Tax Type" },
  { key: "payee", header: "Payee" },
  { key: "description", header: "Description" },
  { key: "reference", header: "Reference" },
];
```

- [ ] **Step 5: Update report page for transaction ledger**

In `src/app/[slug]/admin/reports/[reportId]/page.tsx`:

In the `transaction-ledger` block, add a GST column to the display:

```typescript
    columns = [
      { key: "date", header: "Date" },
      { key: "member", header: "Member" },
      { key: "type", header: "Type" },
      { key: "description", header: "Description" },
      { key: "amount", header: "Amount", align: "right" },
      { key: "gst", header: "GST", align: "right" },
      { key: "stripeRef", header: "Stripe Ref" },
    ];
```

Update `displayRows` mapping to include GST:

```typescript
    displayRows = result.rows.map((row) => ({
      date: formatOrgDate(row.date),
      member: `${row.memberFirstName} ${row.memberLastName}`,
      type: row.type,
      description: row.description,
      amount: formatCurrency(row.amountCents),
      gst: formatCurrency(row.gstAmountCents),
      stripeRef: row.stripeRef ?? "",
    }));
```

Update the Xero export call to pass `gstEnabled`:

```typescript
    const xeroRows = await formatLedgerForXero(result.rows, org.gstEnabled);
```

Update `exportData` to include the new fields:

```typescript
    exportData = xeroRows.map((r) => ({
      date: r.date,
      amount: r.amount,
      taxAmount: r.taxAmount,
      taxType: r.taxType,
      payee: r.payee,
      description: r.description,
      reference: r.reference,
    }));
```

- [ ] **Step 6: Run tests**

Run: `cd /opt/snowgum && npx vitest run src/actions/reports/__tests__/transaction-ledger-gst.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Verify compilation**

```bash
cd /opt/snowgum && npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
cd /opt/snowgum && git add src/actions/reports/transaction-ledger.ts src/actions/reports/export-csv.ts src/actions/reports/__tests__/transaction-ledger-gst.test.ts src/app/[slug]/admin/reports/[reportId]/page.tsx
git commit -m "feat(gst): add GST column to transaction ledger and Xero export"
```

---

### Task 14: Revenue Summary — GST Column

**Files:**
- Modify: `src/actions/reports/revenue-summary.ts`
- Modify: `src/app/[slug]/admin/reports/[reportId]/page.tsx`

- [ ] **Step 1: Add `gstCollectedCents` to `RevenueSummaryRow`**

In `src/actions/reports/revenue-summary.ts`:

Update the type:

```typescript
export type RevenueSummaryRow = {
  period: string;
  bookingRevenueCents: number;
  subscriptionRevenueCents: number;
  refundsCents: number;
  netRevenueCents: number;
  platformFeesCents: number;
  gstCollectedCents: number;
};
```

Update the result type:

```typescript
export type RevenueSummaryResult = {
  rows: RevenueSummaryRow[];
  totalNetRevenueCents: number;
  totalPlatformFeesCents: number;
  totalGstCollectedCents: number;
};
```

Add to both the `lodgeId` and non-`lodgeId` query select blocks:

```typescript
        gstCollectedCents: sql<number>`COALESCE(SUM(${transactions.gstAmountCents}), 0)`,
```

Update the row mapping to include:

```typescript
    const gstCollectedCents = Number(row.gstCollectedCents);
    return {
      // ... existing fields
      gstCollectedCents,
    };
```

Add total calculation:

```typescript
  const totalGstCollectedCents = rows.reduce(
    (sum, row) => sum + row.gstCollectedCents,
    0
  );

  return { rows, totalNetRevenueCents, totalPlatformFeesCents, totalGstCollectedCents };
```

- [ ] **Step 2: Update revenue summary display in report page**

In `src/app/[slug]/admin/reports/[reportId]/page.tsx`, in the `revenue-summary` block:

Add GST column:

```typescript
    columns = [
      { key: "period", header: "Period" },
      { key: "bookingRevenue", header: "Booking Revenue", align: "right" },
      { key: "subscriptionRevenue", header: "Subscription Revenue", align: "right" },
      { key: "refunds", header: "Refunds", align: "right" },
      { key: "netRevenue", header: "Net Revenue", align: "right" },
      { key: "gstCollected", header: "GST Collected", align: "right" },
      { key: "platformFees", header: "Platform Fees", align: "right" },
    ];
```

Update `displayRows`:

```typescript
    displayRows = result.rows.map((row) => ({
      period: row.period,
      bookingRevenue: formatCurrency(row.bookingRevenueCents),
      subscriptionRevenue: formatCurrency(row.subscriptionRevenueCents),
      refunds: formatCurrency(row.refundsCents),
      netRevenue: formatCurrency(row.netRevenueCents),
      gstCollected: formatCurrency(row.gstCollectedCents),
      platformFees: formatCurrency(row.platformFeesCents),
    }));
```

Update `exportColumns` and `exportData` similarly.

- [ ] **Step 3: Verify compilation and run tests**

```bash
cd /opt/snowgum && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 4: Commit**

```bash
cd /opt/snowgum && git add src/actions/reports/revenue-summary.ts src/app/[slug]/admin/reports/[reportId]/page.tsx
git commit -m "feat(gst): add GST Collected column to revenue summary report"
```

---

### Task 15: GST Summary Report

**Files:**
- Create: `src/actions/reports/gst-summary.ts`
- Create: `src/actions/reports/__tests__/gst-summary.test.ts`
- Modify: `src/app/[slug]/admin/reports/page.tsx`
- Modify: `src/app/[slug]/admin/reports/[reportId]/page.tsx`

- [ ] **Step 1: Write failing test for GST summary report**

Create `src/actions/reports/__tests__/gst-summary.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  transactions: {
    organisationId: "organisation_id",
    type: "type",
    gstAmountCents: "gst_amount_cents",
    createdAt: "created_at",
  },
}));

import { getGstSummary } from "../gst-summary";

describe("getGstSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns rows grouped by period with GST by category", async () => {
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          groupBy: () => ({
            orderBy: () => [
              {
                period: "2027-01",
                bookingGstCents: 4500,
                subscriptionGstCents: 12000,
                chargeGstCents: 850,
              },
              {
                period: "2027-02",
                bookingGstCents: 5200,
                subscriptionGstCents: 11500,
                chargeGstCents: 1200,
              },
            ],
          }),
        }),
      }),
    });

    const result = await getGstSummary({
      organisationId: "org-1",
      dateFrom: "2027-01-01",
      dateTo: "2027-03-01",
      granularity: "monthly",
    });

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].period).toBe("2027-01");
    expect(result.rows[0].bookingGstCents).toBe(4500);
    expect(result.rows[0].totalGstCents).toBe(17350);
    expect(result.totalGstCollectedCents).toBe(
      4500 + 12000 + 850 + 5200 + 11500 + 1200
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /opt/snowgum && npx vitest run src/actions/reports/__tests__/gst-summary.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `getGstSummary`**

Create `src/actions/reports/gst-summary.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { transactions } from "@/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";

export type GstSummaryFilters = {
  organisationId: string;
  dateFrom: string;
  dateTo: string;
  granularity: "monthly" | "quarterly";
};

export type GstSummaryRow = {
  period: string;
  bookingGstCents: number;
  subscriptionGstCents: number;
  chargeGstCents: number;
  totalGstCents: number;
};

export type GstSummaryResult = {
  rows: GstSummaryRow[];
  totalGstCollectedCents: number;
};

const GRANULARITY_MAP = {
  monthly: { truncUnit: "month", toCharFormat: "YYYY-MM" },
  quarterly: { truncUnit: "quarter", toCharFormat: 'YYYY-"Q"Q' },
} as const;

export async function getGstSummary(
  filters: GstSummaryFilters
): Promise<GstSummaryResult> {
  const { organisationId, dateFrom, dateTo, granularity } = filters;
  const { truncUnit, toCharFormat } = GRANULARITY_MAP[granularity];

  const fromDate = new Date(dateFrom);
  const toDate = new Date(dateTo);

  const periodExpr = sql<string>`TO_CHAR(DATE_TRUNC(${truncUnit}, ${transactions.createdAt}), ${toCharFormat})`;

  const dbRows = await db
    .select({
      period: periodExpr,
      bookingGstCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'PAYMENT' THEN ${transactions.gstAmountCents} ELSE 0 END), 0)`,
      subscriptionGstCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'SUBSCRIPTION' THEN ${transactions.gstAmountCents} ELSE 0 END), 0)`,
      chargeGstCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} NOT IN ('PAYMENT', 'SUBSCRIPTION', 'REFUND', 'INVOICE') THEN ${transactions.gstAmountCents} ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.organisationId, organisationId),
        gte(transactions.createdAt, fromDate),
        lte(transactions.createdAt, toDate)
      )
    )
    .groupBy(periodExpr)
    .orderBy(periodExpr);

  const rows: GstSummaryRow[] = (
    dbRows as Array<{
      period: string;
      bookingGstCents: number;
      subscriptionGstCents: number;
      chargeGstCents: number;
    }>
  ).map((row) => {
    const bookingGstCents = Number(row.bookingGstCents);
    const subscriptionGstCents = Number(row.subscriptionGstCents);
    const chargeGstCents = Number(row.chargeGstCents);
    return {
      period: row.period,
      bookingGstCents,
      subscriptionGstCents,
      chargeGstCents,
      totalGstCents: bookingGstCents + subscriptionGstCents + chargeGstCents,
    };
  });

  const totalGstCollectedCents = rows.reduce(
    (sum, row) => sum + row.totalGstCents,
    0
  );

  return { rows, totalGstCollectedCents };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /opt/snowgum && npx vitest run src/actions/reports/__tests__/gst-summary.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Add GST summary to the reports list**

In `src/app/[slug]/admin/reports/page.tsx`:

Add to the `REPORTS` array:

```typescript
  { id: "gst-summary", title: "GST Summary", description: "GST collected by period and category — BAS-ready for ATO reporting." },
```

- [ ] **Step 6: Add GST summary report handler to the report detail page**

In `src/app/[slug]/admin/reports/[reportId]/page.tsx`:

Add import at top:

```typescript
import { getGstSummary } from "@/actions/reports/gst-summary";
```

Add to `REPORT_TITLES`:

```typescript
  "gst-summary": "GST Summary",
```

Add handler block before the closing of the if/else chain (before `const title = REPORT_TITLES[reportId]`):

```typescript
  } else if (reportId === "gst-summary") {
    // Only show for GST-enabled orgs
    if (!org.gstEnabled) {
      return (
        <div className="p-6">
          <nav className="text-sm text-muted-foreground mb-4">
            <Link href={`/${slug}/admin/reports`} className="hover:underline">
              Reports
            </Link>
            {" /"}
          </nav>
          <h1 className="text-2xl font-bold mb-4">GST Summary</h1>
          <p className="text-muted-foreground">
            GST is not enabled for this organisation. Enable GST in{" "}
            <Link href={`/${slug}/admin/settings`} className="underline">
              Settings
            </Link>{" "}
            to use this report.
          </p>
        </div>
      );
    }

    filterFields = [
      { key: "dateFrom", label: "From", type: "date" },
      { key: "dateTo", label: "To", type: "date" },
      {
        key: "granularity",
        label: "Period",
        type: "select",
        options: [
          { value: "monthly", label: "Monthly" },
          { value: "quarterly", label: "Quarterly" },
        ],
      },
    ];
    columns = [
      { key: "period", header: "Period" },
      { key: "bookingGst", header: "Bookings GST", align: "right" },
      { key: "subscriptionGst", header: "Subscriptions GST", align: "right" },
      { key: "chargeGst", header: "Charges GST", align: "right" },
      { key: "totalGst", header: "Total GST Collected", align: "right" },
    ];

    const granularity =
      sp_str("granularity") === "quarterly" ? "quarterly" : "monthly";

    // Default to current quarter
    const now = new Date();
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const quarterEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0);

    const result = await getGstSummary({
      organisationId: org.id,
      dateFrom: sp_str("dateFrom") ?? format(quarterStart, "yyyy-MM-dd"),
      dateTo: sp_str("dateTo") ?? format(quarterEnd, "yyyy-MM-dd"),
      granularity,
    });

    displayRows = result.rows.map((row) => ({
      period: row.period,
      bookingGst: formatCurrency(row.bookingGstCents),
      subscriptionGst: formatCurrency(row.subscriptionGstCents),
      chargeGst: formatCurrency(row.chargeGstCents),
      totalGst: formatCurrency(row.totalGstCents),
    }));

    exportColumns = [
      { key: "period", header: "Period" },
      { key: "bookingGst", header: "Bookings GST" },
      { key: "subscriptionGst", header: "Subscriptions GST" },
      { key: "chargeGst", header: "Charges GST" },
      { key: "totalGst", header: "Total GST Collected" },
    ];
    exportData = result.rows.map((row) => ({
      period: row.period,
      bookingGst: (row.bookingGstCents / 100).toFixed(2),
      subscriptionGst: (row.subscriptionGstCents / 100).toFixed(2),
      chargeGst: (row.chargeGstCents / 100).toFixed(2),
      totalGst: (row.totalGstCents / 100).toFixed(2),
    }));
    exportFilename = `gst-summary-${today}.csv`;
  }
```

- [ ] **Step 7: Verify compilation**

```bash
cd /opt/snowgum && npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
cd /opt/snowgum && git add src/actions/reports/gst-summary.ts src/actions/reports/__tests__/gst-summary.test.ts src/app/[slug]/admin/reports/page.tsx src/app/[slug]/admin/reports/[reportId]/page.tsx
git commit -m "feat(gst): add GST Summary report with BAS-ready period breakdown"
```

---

### Task 16: Final Integration — Run Full Test Suite

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

```bash
cd /opt/snowgum && npx vitest run
```

Expected: All tests PASS

- [ ] **Step 2: Run TypeScript compilation check**

```bash
cd /opt/snowgum && npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Fix any failures**

If any tests fail or TypeScript errors exist, fix them before proceeding.

- [ ] **Step 4: Verify the dev server starts**

```bash
cd /opt/snowgum && npx next build 2>&1 | tail -20
```

Expected: Build succeeds

- [ ] **Step 5: Commit any fixes**

```bash
cd /opt/snowgum && git add -A && git status
# Only commit if there are changes
git commit -m "fix(gst): resolve integration issues from Phase 19"
```
