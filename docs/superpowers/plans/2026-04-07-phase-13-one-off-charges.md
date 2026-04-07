# Phase 13 — One-Off Charges & Family Fee Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable admins to create ad-hoc charges against members with configurable categories, and allow primary family members to pay all outstanding charges across their family in a single Stripe Checkout session.

**Architecture:** New `charge_categories`, `one_off_charges`, and `checkout_line_items` tables extend the existing schema. Server actions follow the established pattern (return `{success, error?}`, auth via `getSessionMember`). The consolidated checkout creates a single Stripe session with metadata linking to `checkout_line_items`, and the webhook handler iterates those line items to update each source record. Email notifications use existing React Email + Resend patterns.

**Tech Stack:** Next.js 16, Drizzle ORM, Stripe Checkout (Connected Accounts), React Email + Resend, Vitest, shadcn/ui, Zod

---

### Task 1: Schema — charge_categories and one_off_charges tables

**Files:**
- Modify: `src/db/schema/index.ts`
- Create: `src/db/schema/charges.ts`

- [ ] **Step 1: Write the schema file**

Create `src/db/schema/charges.ts`:

```typescript
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  date,
} from "drizzle-orm/pg-core";
import { organisations } from "./organisations";
import { members } from "./members";
import { transactions } from "./transactions";

export const chargeCategories = pgTable("charge_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const oneOffChargeStatusEnum = pgEnum("one_off_charge_status", [
  "UNPAID",
  "PAID",
  "WAIVED",
  "CANCELLED",
]);

export const oneOffCharges = pgTable("one_off_charges", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => chargeCategories.id),
  description: text("description"),
  amountCents: integer("amount_cents").notNull(),
  dueDate: date("due_date"),
  status: oneOffChargeStatusEnum("status").notNull().default("UNPAID"),
  waivedReason: text("waived_reason"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  transactionId: uuid("transaction_id").references(() => transactions.id),
  createdByMemberId: uuid("created_by_member_id")
    .notNull()
    .references(() => members.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const checkoutChargeTypeEnum = pgEnum("checkout_charge_type", [
  "ONE_OFF_CHARGE",
  "SUBSCRIPTION",
  "BOOKING_INVOICE",
]);

export const checkoutLineItems = pgTable("checkout_line_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  stripeCheckoutSessionId: text("stripe_checkout_session_id").notNull(),
  chargeType: checkoutChargeTypeEnum("charge_type").notNull(),
  chargeId: uuid("charge_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
```

- [ ] **Step 2: Export from schema index**

Add to `src/db/schema/index.ts`:

```typescript
export {
  chargeCategories,
  oneOffChargeStatusEnum,
  oneOffCharges,
  checkoutChargeTypeEnum,
  checkoutLineItems,
} from "./charges";
```

- [ ] **Step 3: Generate and apply migration**

Run:
```bash
npm run db:generate
npm run db:migrate
```

Expected: New migration file created in `drizzle/` with CREATE TYPE and CREATE TABLE statements for the three new tables.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/charges.ts src/db/schema/index.ts drizzle/
git commit -m "feat(phase-13): add schema for charge_categories, one_off_charges, and checkout_line_items"
```

---

### Task 2: Server actions — charge categories CRUD

**Files:**
- Create: `src/actions/charge-categories/index.ts`
- Create: `src/actions/charge-categories/__tests__/index.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/actions/charge-categories/__tests__/index.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockValues(...vArgs);
          return {
            returning: () => {
              mockReturning();
              return [{ id: "cat-1", name: "Locker Fee", organisationId: "org-1", description: null, sortOrder: 0, isActive: true, createdAt: new Date(), updatedAt: new Date() }];
            },
          };
        },
      };
    },
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: (...sArgs: unknown[]) => {
          mockSet(...sArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs);
              return {
                returning: () => {
                  mockReturning();
                  return [{ id: "cat-1", name: "Updated Fee", organisationId: "org-1", description: "desc", sortOrder: 1, isActive: true, createdAt: new Date(), updatedAt: new Date() }];
                },
              };
            },
          };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  chargeCategories: { id: "id", organisationId: "organisation_id", name: "name" },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { createChargeCategory, updateChargeCategory, toggleChargeCategory } from "../index";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createChargeCategory", () => {
  it("creates a category and returns it", async () => {
    const result = await createChargeCategory({
      organisationId: "org-1",
      name: "Locker Fee",
      description: "",
      sortOrder: 0,
      slug: "demo",
    });

    expect(result.id).toBe("cat-1");
    expect(result.name).toBe("Locker Fee");
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Locker Fee" })
    );
  });

  it("rejects empty name", async () => {
    await expect(
      createChargeCategory({
        organisationId: "org-1",
        name: "",
        description: "",
        sortOrder: 0,
        slug: "demo",
      })
    ).rejects.toThrow();
  });
});

describe("updateChargeCategory", () => {
  it("updates category fields", async () => {
    const result = await updateChargeCategory({
      id: "cat-1",
      organisationId: "org-1",
      name: "Updated Fee",
      description: "desc",
      sortOrder: 1,
      slug: "demo",
    });

    expect(result.name).toBe("Updated Fee");
    expect(mockUpdate).toHaveBeenCalled();
  });
});

describe("toggleChargeCategory", () => {
  it("toggles isActive", async () => {
    await toggleChargeCategory("cat-1", false, "demo");
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/charge-categories/__tests__/index.test.ts`
Expected: FAIL — module `../index` not found

- [ ] **Step 3: Write the implementation**

Create `src/actions/charge-categories/index.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { chargeCategories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const categorySchema = z.object({
  organisationId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional().or(z.literal("")),
  sortOrder: z.number().int().default(0),
});

export async function createChargeCategory(
  input: z.infer<typeof categorySchema> & { slug: string }
) {
  const data = categorySchema.parse(input);

  const [created] = await db
    .insert(chargeCategories)
    .values({
      organisationId: data.organisationId,
      name: data.name,
      description: data.description || null,
      sortOrder: data.sortOrder,
    })
    .returning();

  revalidatePath(`/${input.slug}/admin/settings`);
  return created;
}

export async function updateChargeCategory(
  input: { id: string; slug: string } & z.infer<typeof categorySchema>
) {
  const data = categorySchema.parse(input);

  const [updated] = await db
    .update(chargeCategories)
    .set({
      name: data.name,
      description: data.description || null,
      sortOrder: data.sortOrder,
      updatedAt: new Date(),
    })
    .where(eq(chargeCategories.id, input.id))
    .returning();

  revalidatePath(`/${input.slug}/admin/settings`);
  return updated;
}

export async function toggleChargeCategory(
  id: string,
  isActive: boolean,
  slug: string
) {
  await db
    .update(chargeCategories)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(chargeCategories.id, id));

  revalidatePath(`/${slug}/admin/settings`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/charge-categories/__tests__/index.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/charge-categories/
git commit -m "feat(phase-13): add charge categories CRUD server actions with tests"
```

---

### Task 3: Settings UI — charge category manager

**Files:**
- Create: `src/app/[slug]/admin/settings/charge-category-manager.tsx`
- Modify: `src/app/[slug]/admin/settings/page.tsx`

- [ ] **Step 1: Create the charge category manager component**

Create `src/app/[slug]/admin/settings/charge-category-manager.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createChargeCategory,
  updateChargeCategory,
  toggleChargeCategory,
} from "@/actions/charge-categories";
import { toast } from "sonner";

type ChargeCategory = {
  id: string;
  organisationId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

export function ChargeCategoryManager({
  organisationId,
  initialCategories,
}: {
  organisationId: string;
  initialCategories: ChargeCategory[];
}) {
  const params = useParams();
  const slug = params.slug as string;
  const [categories, setCategories] = useState(initialCategories);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ChargeCategory | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const name = form.get("name") as string;
    const description = form.get("description") as string;

    try {
      if (editing) {
        const updated = await updateChargeCategory({
          id: editing.id,
          organisationId,
          name,
          description,
          sortOrder: editing.sortOrder,
          slug,
        });
        setCategories((prev) =>
          prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
        );
        toast.success("Category updated");
      } else {
        const created = await createChargeCategory({
          organisationId,
          name,
          description,
          sortOrder: categories.length,
          slug,
        });
        setCategories((prev) => [...prev, created]);
        toast.success("Category created");
      }
      setDialogOpen(false);
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(cat: ChargeCategory) {
    try {
      await toggleChargeCategory(cat.id, !cat.isActive, slug);
      setCategories((prev) =>
        prev.map((c) =>
          c.id === cat.id ? { ...c, isActive: !c.isActive } : c
        )
      );
      toast.success(cat.isActive ? "Category deactivated" : "Category activated");
    } catch {
      toast.error("Failed to update category");
    }
  }

  return (
    <div className="space-y-3">
      {categories.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No charge categories yet. Add one to start creating charges.
        </p>
      )}
      {categories.map((cat) => (
        <Card key={cat.id}>
          <CardContent className="flex items-center justify-between py-3 px-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{cat.name}</span>
                {!cat.isActive && (
                  <Badge variant="outline" className="text-xs">
                    Inactive
                  </Badge>
                )}
              </div>
              {cat.description && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {cat.description}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(cat);
                  setDialogOpen(true);
                }}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleToggle(cat)}
              >
                {cat.isActive ? "Deactivate" : "Activate"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
      >
        <DialogTrigger
          render={<Button variant="outline" />}
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          Add Category
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit" : "New"} Charge Category
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cc-name">Name</Label>
              <Input
                id="cc-name"
                name="name"
                defaultValue={editing?.name ?? ""}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cc-desc">Description (optional)</Label>
              <Input
                id="cc-desc"
                name="description"
                defaultValue={editing?.description ?? ""}
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : editing ? "Update" : "Create"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Add charge categories section to settings page**

In `src/app/[slug]/admin/settings/page.tsx`, add the import and a new section after the Cancellation Policy section:

Import:
```typescript
import { ChargeCategoryManager } from "./charge-category-manager";
import { chargeCategories } from "@/db/schema";
```

Fetch query (after existing `policies` query):
```typescript
const categories = await db
  .select()
  .from(chargeCategories)
  .where(eq(chargeCategories.organisationId, org.id))
  .orderBy(chargeCategories.sortOrder);
```

JSX (after the Cancellation Policy section):
```tsx
<Separator className="my-8" />

<h2 className="text-xl font-bold mb-4">Charge Categories</h2>
<ChargeCategoryManager
  organisationId={org.id}
  initialCategories={categories}
/>
```

- [ ] **Step 3: Verify the build compiles**

Run: `npx next build 2>&1 | tail -20` (or `npm run build`)
Expected: Build succeeds without errors

- [ ] **Step 4: Commit**

```bash
git add src/app/[slug]/admin/settings/charge-category-manager.tsx src/app/[slug]/admin/settings/page.tsx
git commit -m "feat(phase-13): add charge categories manager to settings page"
```

---

### Task 4: Server actions — one-off charges CRUD

**Files:**
- Create: `src/actions/charges/create.ts`
- Create: `src/actions/charges/update-status.ts`
- Create: `src/actions/charges/queries.ts`
- Create: `src/actions/charges/__tests__/create.test.ts`
- Create: `src/actions/charges/__tests__/update-status.test.ts`

- [ ] **Step 1: Write the failing test for createCharge**

Create `src/actions/charges/__tests__/create.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockValues(...vArgs);
          return {
            returning: () => {
              mockReturning();
              return [{
                id: "charge-1",
                organisationId: "org-1",
                memberId: "member-1",
                categoryId: "cat-1",
                description: "Locker #12",
                amountCents: 5000,
                dueDate: null,
                status: "UNPAID",
                createdByMemberId: "admin-1",
                createdAt: new Date(),
                updatedAt: new Date(),
              }];
            },
          };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  oneOffCharges: { id: "id", organisationId: "organisation_id" },
  transactions: { id: "id" },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(),
}));

import { createCharge } from "../create";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createCharge", () => {
  it("creates a charge with valid input", async () => {
    const result = await createCharge({
      organisationId: "org-1",
      memberId: "member-1",
      categoryId: "cat-1",
      description: "Locker #12",
      amountCents: 5000,
      createdByMemberId: "admin-1",
      slug: "demo",
    });

    expect(result.success).toBe(true);
    expect(result.charge?.id).toBe("charge-1");
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: "member-1",
        amountCents: 5000,
      })
    );
  });

  it("rejects zero amount", async () => {
    const result = await createCharge({
      organisationId: "org-1",
      memberId: "member-1",
      categoryId: "cat-1",
      amountCents: 0,
      createdByMemberId: "admin-1",
      slug: "demo",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects negative amount", async () => {
    const result = await createCharge({
      organisationId: "org-1",
      memberId: "member-1",
      categoryId: "cat-1",
      amountCents: -100,
      createdByMemberId: "admin-1",
      slug: "demo",
    });

    expect(result.success).toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/actions/charges/__tests__/create.test.ts`
Expected: FAIL — module `../create` not found

- [ ] **Step 3: Write the createCharge implementation**

Create `src/actions/charges/create.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { oneOffCharges } from "@/db/schema";
import { revalidatePath } from "next/cache";

type CreateChargeInput = {
  organisationId: string;
  memberId: string;
  categoryId: string;
  description?: string;
  amountCents: number;
  dueDate?: string;
  createdByMemberId: string;
  slug: string;
};

type CreateChargeResult = {
  success: boolean;
  charge?: typeof oneOffCharges.$inferSelect;
  error?: string;
};

export async function createCharge(
  input: CreateChargeInput
): Promise<CreateChargeResult> {
  if (input.amountCents <= 0) {
    return { success: false, error: "Amount must be greater than zero" };
  }

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
    })
    .returning();

  revalidatePath(`/${input.slug}/admin/members/${input.memberId}`);
  revalidatePath(`/${input.slug}/admin/charges`);

  return { success: true, charge };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/actions/charges/__tests__/create.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Write the failing test for updateChargeStatus**

Create `src/actions/charges/__tests__/update-status.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

let selectResult: unknown[] = [];
let updateResult: unknown[] = [];
let insertResult: unknown[] = [];

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: () => ({
          where: () => selectResult,
        }),
      };
    },
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: () => ({
          where: () => ({
            returning: () => updateResult,
          }),
        }),
      };
    },
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: () => ({
          returning: () => insertResult,
        }),
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  oneOffCharges: { id: "id", organisationId: "organisation_id", status: "status" },
  transactions: { id: "id" },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { waiveCharge, cancelCharge, markChargeAsPaid } from "../update-status";

beforeEach(() => {
  vi.clearAllMocks();
  selectResult = [{ id: "charge-1", status: "UNPAID", organisationId: "org-1", memberId: "member-1", amountCents: 5000, categoryId: "cat-1" }];
  updateResult = [{ id: "charge-1", status: "WAIVED" }];
  insertResult = [{ id: "txn-1" }];
});

describe("waiveCharge", () => {
  it("waives an unpaid charge with reason", async () => {
    const result = await waiveCharge({
      chargeId: "charge-1",
      organisationId: "org-1",
      reason: "Comp for volunteer work",
      slug: "demo",
    });

    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("rejects waiving a non-UNPAID charge", async () => {
    selectResult = [{ id: "charge-1", status: "PAID" }];

    const result = await waiveCharge({
      chargeId: "charge-1",
      organisationId: "org-1",
      reason: "test",
      slug: "demo",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Only unpaid");
  });
});

describe("cancelCharge", () => {
  it("cancels an unpaid charge", async () => {
    const result = await cancelCharge({
      chargeId: "charge-1",
      organisationId: "org-1",
      slug: "demo",
    });

    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
  });
});

describe("markChargeAsPaid", () => {
  it("marks charge as paid and creates transaction", async () => {
    const result = await markChargeAsPaid({
      chargeId: "charge-1",
      organisationId: "org-1",
      slug: "demo",
    });

    expect(result.success).toBe(true);
    expect(mockInsert).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/actions/charges/__tests__/update-status.test.ts`
Expected: FAIL — module `../update-status` not found

- [ ] **Step 7: Write the updateChargeStatus implementation**

Create `src/actions/charges/update-status.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { oneOffCharges, transactions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type StatusResult = { success: boolean; error?: string };

export async function waiveCharge(input: {
  chargeId: string;
  organisationId: string;
  reason: string;
  slug: string;
}): Promise<StatusResult> {
  const [charge] = await db
    .select({ id: oneOffCharges.id, status: oneOffCharges.status })
    .from(oneOffCharges)
    .where(
      and(
        eq(oneOffCharges.id, input.chargeId),
        eq(oneOffCharges.organisationId, input.organisationId)
      )
    );

  if (!charge) return { success: false, error: "Charge not found" };
  if (charge.status !== "UNPAID") {
    return { success: false, error: "Only unpaid charges can be waived" };
  }

  await db
    .update(oneOffCharges)
    .set({
      status: "WAIVED",
      waivedReason: input.reason,
      updatedAt: new Date(),
    })
    .where(eq(oneOffCharges.id, input.chargeId));

  revalidatePath(`/${input.slug}/admin/charges`);
  return { success: true };
}

export async function cancelCharge(input: {
  chargeId: string;
  organisationId: string;
  slug: string;
}): Promise<StatusResult> {
  const [charge] = await db
    .select({ id: oneOffCharges.id, status: oneOffCharges.status })
    .from(oneOffCharges)
    .where(
      and(
        eq(oneOffCharges.id, input.chargeId),
        eq(oneOffCharges.organisationId, input.organisationId)
      )
    );

  if (!charge) return { success: false, error: "Charge not found" };
  if (charge.status !== "UNPAID") {
    return { success: false, error: "Only unpaid charges can be cancelled" };
  }

  await db
    .update(oneOffCharges)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(eq(oneOffCharges.id, input.chargeId));

  revalidatePath(`/${input.slug}/admin/charges`);
  return { success: true };
}

export async function markChargeAsPaid(input: {
  chargeId: string;
  organisationId: string;
  slug: string;
}): Promise<StatusResult> {
  const [charge] = await db
    .select({
      id: oneOffCharges.id,
      status: oneOffCharges.status,
      organisationId: oneOffCharges.organisationId,
      memberId: oneOffCharges.memberId,
      amountCents: oneOffCharges.amountCents,
      categoryId: oneOffCharges.categoryId,
    })
    .from(oneOffCharges)
    .where(
      and(
        eq(oneOffCharges.id, input.chargeId),
        eq(oneOffCharges.organisationId, input.organisationId)
      )
    );

  if (!charge) return { success: false, error: "Charge not found" };
  if (charge.status !== "UNPAID") {
    return { success: false, error: "Only unpaid charges can be marked as paid" };
  }

  const [txn] = await db
    .insert(transactions)
    .values({
      organisationId: charge.organisationId,
      memberId: charge.memberId,
      type: "PAYMENT",
      amountCents: charge.amountCents,
      description: "Manual payment (cash/bank transfer)",
    })
    .returning();

  await db
    .update(oneOffCharges)
    .set({
      status: "PAID",
      paidAt: new Date(),
      transactionId: txn.id,
      updatedAt: new Date(),
    })
    .where(eq(oneOffCharges.id, input.chargeId));

  revalidatePath(`/${input.slug}/admin/charges`);
  return { success: true };
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/actions/charges/__tests__/update-status.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 9: Write the queries file**

Create `src/actions/charges/queries.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { oneOffCharges, chargeCategories, members } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";

export type ChargeWithDetails = {
  id: string;
  memberId: string;
  memberFirstName: string;
  memberLastName: string;
  categoryId: string;
  categoryName: string;
  description: string | null;
  amountCents: number;
  dueDate: string | null;
  status: string;
  waivedReason: string | null;
  paidAt: Date | null;
  createdAt: Date;
};

export async function getChargesForMember(
  organisationId: string,
  memberId: string
): Promise<ChargeWithDetails[]> {
  const rows = await db
    .select({
      id: oneOffCharges.id,
      memberId: oneOffCharges.memberId,
      memberFirstName: members.firstName,
      memberLastName: members.lastName,
      categoryId: oneOffCharges.categoryId,
      categoryName: chargeCategories.name,
      description: oneOffCharges.description,
      amountCents: oneOffCharges.amountCents,
      dueDate: oneOffCharges.dueDate,
      status: oneOffCharges.status,
      waivedReason: oneOffCharges.waivedReason,
      paidAt: oneOffCharges.paidAt,
      createdAt: oneOffCharges.createdAt,
    })
    .from(oneOffCharges)
    .innerJoin(chargeCategories, eq(chargeCategories.id, oneOffCharges.categoryId))
    .innerJoin(members, eq(members.id, oneOffCharges.memberId))
    .where(
      and(
        eq(oneOffCharges.organisationId, organisationId),
        eq(oneOffCharges.memberId, memberId)
      )
    )
    .orderBy(desc(oneOffCharges.createdAt));

  return rows;
}

export async function getChargesForOrganisation(
  organisationId: string,
  filters?: {
    status?: string;
    categoryId?: string;
    memberId?: string;
  }
): Promise<ChargeWithDetails[]> {
  const conditions = [eq(oneOffCharges.organisationId, organisationId)];

  if (filters?.status) {
    conditions.push(eq(oneOffCharges.status, filters.status as "UNPAID" | "PAID" | "WAIVED" | "CANCELLED"));
  }
  if (filters?.categoryId) {
    conditions.push(eq(oneOffCharges.categoryId, filters.categoryId));
  }
  if (filters?.memberId) {
    conditions.push(eq(oneOffCharges.memberId, filters.memberId));
  }

  const rows = await db
    .select({
      id: oneOffCharges.id,
      memberId: oneOffCharges.memberId,
      memberFirstName: members.firstName,
      memberLastName: members.lastName,
      categoryId: oneOffCharges.categoryId,
      categoryName: chargeCategories.name,
      description: oneOffCharges.description,
      amountCents: oneOffCharges.amountCents,
      dueDate: oneOffCharges.dueDate,
      status: oneOffCharges.status,
      waivedReason: oneOffCharges.waivedReason,
      paidAt: oneOffCharges.paidAt,
      createdAt: oneOffCharges.createdAt,
    })
    .from(oneOffCharges)
    .innerJoin(chargeCategories, eq(chargeCategories.id, oneOffCharges.categoryId))
    .innerJoin(members, eq(members.id, oneOffCharges.memberId))
    .where(and(...conditions))
    .orderBy(desc(oneOffCharges.createdAt));

  return rows;
}

export async function getChargesForFamily(
  organisationId: string,
  primaryMemberId: string
): Promise<ChargeWithDetails[]> {
  const familyMembers = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.organisationId, organisationId),
        eq(members.primaryMemberId, primaryMemberId)
      )
    );

  const memberIds = [primaryMemberId, ...familyMembers.map((m) => m.id)];

  const allCharges: ChargeWithDetails[] = [];
  for (const mid of memberIds) {
    const charges = await getChargesForMember(organisationId, mid);
    allCharges.push(...charges);
  }

  return allCharges.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}
```

- [ ] **Step 10: Run all charge tests**

Run: `npx vitest run src/actions/charges/`
Expected: All tests PASS

- [ ] **Step 11: Commit**

```bash
git add src/actions/charges/
git commit -m "feat(phase-13): add one-off charges CRUD actions, status updates, and query functions with tests"
```

---

### Task 5: Email templates — charge notifications

**Files:**
- Create: `src/lib/email/templates/charge-created.tsx`
- Create: `src/lib/email/templates/charge-due-reminder.tsx`
- Create: `src/lib/email/templates/consolidated-payment-received.tsx`

- [ ] **Step 1: Create charge-created email template**

Create `src/lib/email/templates/charge-created.tsx`:

```typescript
import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./layout";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "../format";

type ChargeCreatedEmailProps = {
  orgName: string;
  categoryName: string;
  description?: string;
  amountCents: number;
  dueDate?: string;
  payUrl: string;
  logoUrl?: string;
};

export function ChargeCreatedEmail({
  orgName,
  categoryName,
  description,
  amountCents,
  dueDate,
  payUrl,
  logoUrl,
}: ChargeCreatedEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>New Charge</Text>
      <Text style={paragraph}>
        A new charge has been added to your account. Please review the details below.
      </Text>
      <Section style={detailsBox}>
        <Text style={paragraph}>
          <strong>Category:</strong> {categoryName}
        </Text>
        {description && (
          <Text style={paragraph}>
            <strong>Description:</strong> {description}
          </Text>
        )}
        <Text style={paragraph}>
          <strong>Amount:</strong> {formatCurrency(amountCents)}
        </Text>
        {dueDate && (
          <Text style={paragraph}>
            <strong>Due date:</strong> {formatDate(dueDate)}
          </Text>
        )}
      </Section>
      <Section style={{ textAlign: "center" as const, marginTop: "24px" }}>
        <Link href={payUrl} style={button}>
          Pay now
        </Link>
      </Section>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "20px",
  fontWeight: "bold" as const,
  margin: "0 0 16px",
};

const paragraph = {
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 12px",
};

const detailsBox = {
  backgroundColor: "#f9f9f9",
  borderRadius: "8px",
  padding: "16px",
  margin: "16px 0",
};

const button = {
  backgroundColor: "#111111",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "6px",
  textDecoration: "none",
  fontWeight: "bold" as const,
  fontSize: "14px",
};
```

- [ ] **Step 2: Create charge due reminder email template**

Create `src/lib/email/templates/charge-due-reminder.tsx`:

```typescript
import { Text, Link, Section } from "@react-email/components";
import { EmailLayout } from "./layout";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "../format";

type ChargeDueReminderEmailProps = {
  orgName: string;
  categoryName: string;
  description?: string;
  amountCents: number;
  dueDate: string;
  payUrl: string;
  logoUrl?: string;
};

export function ChargeDueReminderEmail({
  orgName,
  categoryName,
  description,
  amountCents,
  dueDate,
  payUrl,
  logoUrl,
}: ChargeDueReminderEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>Payment Reminder</Text>
      <Text style={paragraph}>
        This is a reminder that you have an outstanding charge approaching its due date.
      </Text>
      <Section style={detailsBox}>
        <Text style={paragraph}>
          <strong>Category:</strong> {categoryName}
        </Text>
        {description && (
          <Text style={paragraph}>
            <strong>Description:</strong> {description}
          </Text>
        )}
        <Text style={paragraph}>
          <strong>Amount:</strong> {formatCurrency(amountCents)}
        </Text>
        <Text style={paragraph}>
          <strong>Due date:</strong> {formatDate(dueDate)}
        </Text>
      </Section>
      <Section style={{ textAlign: "center" as const, marginTop: "24px" }}>
        <Link href={payUrl} style={button}>
          Pay now
        </Link>
      </Section>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "20px",
  fontWeight: "bold" as const,
  margin: "0 0 16px",
};

const paragraph = {
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 12px",
};

const detailsBox = {
  backgroundColor: "#f9f9f9",
  borderRadius: "8px",
  padding: "16px",
  margin: "16px 0",
};

const button = {
  backgroundColor: "#111111",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "6px",
  textDecoration: "none",
  fontWeight: "bold" as const,
  fontSize: "14px",
};
```

- [ ] **Step 3: Create consolidated payment received email template**

Create `src/lib/email/templates/consolidated-payment-received.tsx`:

```typescript
import { Text, Section, Hr } from "@react-email/components";
import { EmailLayout } from "./layout";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "../format";

type LineItem = {
  description: string;
  memberName: string;
  amountCents: number;
};

type ConsolidatedPaymentReceivedEmailProps = {
  orgName: string;
  lineItems: LineItem[];
  totalAmountCents: number;
  paidDate: string;
  logoUrl?: string;
};

export function ConsolidatedPaymentReceivedEmail({
  orgName,
  lineItems,
  totalAmountCents,
  paidDate,
  logoUrl,
}: ConsolidatedPaymentReceivedEmailProps) {
  return (
    <EmailLayout orgName={orgName} logoUrl={logoUrl}>
      <Text style={heading}>Payment Received</Text>
      <Text style={paragraph}>
        Thank you! We have received your payment. Here is your receipt.
      </Text>
      <Section style={detailsBox}>
        {lineItems.map((item, i) => (
          <Text key={i} style={paragraph}>
            {item.description} ({item.memberName}) — {formatCurrency(item.amountCents)}
          </Text>
        ))}
        <Hr style={{ margin: "12px 0" }} />
        <Text style={{ ...paragraph, fontWeight: "bold" as const }}>
          Total: {formatCurrency(totalAmountCents)}
        </Text>
        <Text style={paragraph}>
          <strong>Payment date:</strong> {formatDate(paidDate)}
        </Text>
      </Section>
      <Text style={paragraph}>
        Please keep this email as your receipt. If you have any questions, contact your club administrator.
      </Text>
    </EmailLayout>
  );
}

const heading = {
  fontSize: "20px",
  fontWeight: "bold" as const,
  margin: "0 0 16px",
};

const paragraph = {
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 12px",
};

const detailsBox = {
  backgroundColor: "#f9f9f9",
  borderRadius: "8px",
  padding: "16px",
  margin: "16px 0",
};
```

- [ ] **Step 4: Add email sending to createCharge action**

Update `src/actions/charges/create.ts` — after the `returning()` call, add email sending:

```typescript
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { ChargeCreatedEmail } from "@/lib/email/templates/charge-created";
import { db } from "@/db/index";
import { members, chargeCategories, organisations } from "@/db/schema";
import { eq } from "drizzle-orm";
```

After the charge is created:

```typescript
// Send notification email
const [emailData] = await db
  .select({
    email: members.email,
    categoryName: chargeCategories.name,
    orgName: organisations.name,
    orgSlug: organisations.slug,
    contactEmail: organisations.contactEmail,
    logoUrl: organisations.logoUrl,
  })
  .from(members)
  .innerJoin(organisations, eq(organisations.id, input.organisationId))
  .innerJoin(chargeCategories, eq(chargeCategories.id, input.categoryId))
  .where(eq(members.id, input.memberId));

if (emailData) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  sendEmail({
    to: emailData.email,
    subject: `New charge — ${emailData.categoryName}`,
    template: React.createElement(ChargeCreatedEmail, {
      orgName: emailData.orgName,
      categoryName: emailData.categoryName,
      description: input.description,
      amountCents: input.amountCents,
      dueDate: input.dueDate,
      payUrl: `${appUrl}/${emailData.orgSlug}/dashboard`,
      logoUrl: emailData.logoUrl || undefined,
    }),
    replyTo: emailData.contactEmail || undefined,
    orgName: emailData.orgName,
  });
}
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run src/actions/charges/`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/email/templates/charge-created.tsx src/lib/email/templates/charge-due-reminder.tsx src/lib/email/templates/consolidated-payment-received.tsx src/actions/charges/create.ts
git commit -m "feat(phase-13): add email templates for charge notifications and wire up charge-created email"
```

---

### Task 6: Cron job — charge due date reminders

**Files:**
- Create: `src/actions/charges/cron.ts`
- Create: `src/actions/charges/__tests__/cron.test.ts`
- Create: `src/app/api/cron/charges/route.ts`

- [ ] **Step 1: Write the failing test**

Create `src/actions/charges/__tests__/cron.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

let selectResult: unknown[] = [];
const mockSelect = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: () => ({
          innerJoin: () => ({
            innerJoin: () => ({
              innerJoin: () => ({
                where: () => selectResult,
              }),
            }),
          }),
        }),
      };
    },
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: () => ({
          where: () => ({}),
        }),
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  oneOffCharges: { id: "id", status: "status", dueDate: "due_date", reminderSentAt: "reminder_sent_at" },
  members: { id: "id", email: "email" },
  chargeCategories: { id: "id", name: "name" },
  organisations: { id: "id", name: "name" },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  isNull: vi.fn((a: unknown) => ({ isNull: a })),
  lte: vi.fn((a: unknown, b: unknown) => ({ lte: [a, b] })),
  gte: vi.fn((a: unknown, b: unknown) => ({ gte: [a, b] })),
  sql: Object.assign(vi.fn(), { raw: vi.fn() }),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(),
}));

import { processChargeDueReminders } from "../cron";
import { sendEmail } from "@/lib/email/send";

beforeEach(() => {
  vi.clearAllMocks();
  selectResult = [];
});

describe("processChargeDueReminders", () => {
  it("returns zero when no charges are due", async () => {
    selectResult = [];
    const result = await processChargeDueReminders();
    expect(result.remindersSent).toBe(0);
  });

  it("sends reminders for charges due within 7 days", async () => {
    selectResult = [{
      chargeId: "charge-1",
      email: "test@example.com",
      firstName: "Test",
      categoryName: "Locker Fee",
      description: "Locker #5",
      amountCents: 5000,
      dueDate: "2026-04-14",
      orgName: "Test Club",
      orgSlug: "test-club",
      contactEmail: "admin@test.com",
      logoUrl: null,
    }];

    const result = await processChargeDueReminders();
    expect(result.remindersSent).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/actions/charges/__tests__/cron.test.ts`
Expected: FAIL — module `../cron` not found

- [ ] **Step 3: Write the cron implementation**

Create `src/actions/charges/cron.ts`:

```typescript
import { db } from "@/db/index";
import { oneOffCharges, members, chargeCategories, organisations } from "@/db/schema";
import { and, eq, isNull, lte, gte } from "drizzle-orm";
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { ChargeDueReminderEmail } from "@/lib/email/templates/charge-due-reminder";

export async function processChargeDueReminders(): Promise<{
  remindersSent: number;
}> {
  const today = new Date();
  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  const todayStr = today.toISOString().split("T")[0];
  const futureStr = sevenDaysFromNow.toISOString().split("T")[0];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Find UNPAID charges with dueDate within 7 days and no reminder sent yet
  const dueCharges = await db
    .select({
      chargeId: oneOffCharges.id,
      email: members.email,
      firstName: members.firstName,
      categoryName: chargeCategories.name,
      description: oneOffCharges.description,
      amountCents: oneOffCharges.amountCents,
      dueDate: oneOffCharges.dueDate,
      orgName: organisations.name,
      orgSlug: organisations.slug,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
    })
    .from(oneOffCharges)
    .innerJoin(members, eq(members.id, oneOffCharges.memberId))
    .innerJoin(chargeCategories, eq(chargeCategories.id, oneOffCharges.categoryId))
    .innerJoin(organisations, eq(organisations.id, oneOffCharges.organisationId))
    .where(
      and(
        eq(oneOffCharges.status, "UNPAID"),
        lte(oneOffCharges.dueDate, futureStr),
        gte(oneOffCharges.dueDate, todayStr),
        isNull(oneOffCharges.reminderSentAt)
      )
    );

  let remindersSent = 0;

  for (const charge of dueCharges) {
    sendEmail({
      to: charge.email,
      subject: `Payment reminder — ${charge.categoryName}`,
      template: React.createElement(ChargeDueReminderEmail, {
        orgName: charge.orgName,
        categoryName: charge.categoryName,
        description: charge.description || undefined,
        amountCents: charge.amountCents,
        dueDate: charge.dueDate!,
        payUrl: `${appUrl}/${charge.orgSlug}/dashboard`,
        logoUrl: charge.logoUrl || undefined,
      }),
      replyTo: charge.contactEmail || undefined,
      orgName: charge.orgName,
    });

    await db
      .update(oneOffCharges)
      .set({ reminderSentAt: new Date(), updatedAt: new Date() })
      .where(eq(oneOffCharges.id, charge.chargeId));

    remindersSent++;
  }

  return { remindersSent };
}
```

Note: this requires adding `reminderSentAt` to the `one_off_charges` schema. Update `src/db/schema/charges.ts` — add to the `oneOffCharges` table:

```typescript
reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
```

- [ ] **Step 4: Create the cron API route**

Create `src/app/api/cron/charges/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { processChargeDueReminders } from "@/actions/charges/cron";

export async function POST(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await processChargeDueReminders();

  return Response.json({
    ok: true,
    remindersSent: result.remindersSent,
  });
}
```

- [ ] **Step 5: Generate migration for reminderSentAt column**

Run:
```bash
npm run db:generate
npm run db:migrate
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/actions/charges/__tests__/cron.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/db/schema/charges.ts src/actions/charges/cron.ts src/actions/charges/__tests__/cron.test.ts src/app/api/cron/charges/route.ts drizzle/
git commit -m "feat(phase-13): add charge due date reminder cron job with email notifications"
```

---

### Task 7: Admin UI — charges page

**Files:**
- Create: `src/app/[slug]/admin/charges/page.tsx`
- Create: `src/app/[slug]/admin/charges/charges-table.tsx`
- Create: `src/app/[slug]/admin/charges/new-charge-dialog.tsx`
- Modify: `src/app/[slug]/admin/layout.tsx`

- [ ] **Step 1: Add "Charges" to the admin nav**

In `src/app/[slug]/admin/layout.tsx`, add to NAV_ITEMS after the "Subscriptions" entry:

```typescript
{ label: "Charges", href: "/charges", committeeOnly: true },
```

- [ ] **Step 2: Create the new charge dialog component**

Create `src/app/[slug]/admin/charges/new-charge-dialog.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createCharge } from "@/actions/charges/create";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type Category = { id: string; name: string };
type Member = { id: string; firstName: string; lastName: string };

export function NewChargeDialog({
  organisationId,
  slug,
  categories,
  members,
  preselectedMemberId,
  sessionMemberId,
}: {
  organisationId: string;
  slug: string;
  categories: Category[];
  members: Member[];
  preselectedMemberId?: string;
  sessionMemberId: string;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState(preselectedMemberId || "");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const form = new FormData(e.currentTarget);
    const amountDollars = parseFloat(form.get("amount") as string);
    const description = form.get("description") as string;
    const dueDate = form.get("dueDate") as string;

    if (!selectedMemberId || !selectedCategoryId || isNaN(amountDollars) || amountDollars <= 0) {
      toast.error("Please fill in all required fields");
      setSaving(false);
      return;
    }

    const result = await createCharge({
      organisationId,
      memberId: selectedMemberId,
      categoryId: selectedCategoryId,
      description,
      amountCents: Math.round(amountDollars * 100),
      dueDate: dueDate || undefined,
      createdByMemberId: sessionMemberId,
      slug,
    });

    if (result.success) {
      toast.success("Charge created");
      setOpen(false);
      setSelectedMemberId(preselectedMemberId || "");
      setSelectedCategoryId("");
      router.refresh();
    } else {
      toast.error(result.error || "Failed to create charge");
    }

    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        New Charge
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Charge</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!preselectedMemberId && (
            <div className="space-y-2">
              <Label>Member</Label>
              <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a member" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.firstName} {m.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="charge-amount">Amount (AUD)</Label>
            <Input
              id="charge-amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="charge-desc">Description (optional)</Label>
            <Input id="charge-desc" name="description" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="charge-due">Due Date (optional)</Label>
            <Input id="charge-due" name="dueDate" type="date" />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? "Creating..." : "Create Charge"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Create the charges table component**

Create `src/app/[slug]/admin/charges/charges-table.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/currency";
import { waiveCharge, cancelCharge, markChargeAsPaid } from "@/actions/charges/update-status";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { ChargeWithDetails } from "@/actions/charges/queries";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  UNPAID: "destructive",
  PAID: "default",
  WAIVED: "secondary",
  CANCELLED: "outline",
};

export function ChargesTable({
  charges,
  organisationId,
  slug,
  showMemberName,
}: {
  charges: ChargeWithDetails[];
  organisationId: string;
  slug: string;
  showMemberName?: boolean;
}) {
  const router = useRouter();
  const [waiveDialogOpen, setWaiveDialogOpen] = useState(false);
  const [waiveChargeId, setWaiveChargeId] = useState("");
  const [waiveReason, setWaiveReason] = useState("");
  const [acting, setActing] = useState(false);

  async function handleWaive() {
    setActing(true);
    const result = await waiveCharge({
      chargeId: waiveChargeId,
      organisationId,
      reason: waiveReason,
      slug,
    });
    if (result.success) {
      toast.success("Charge waived");
      setWaiveDialogOpen(false);
      setWaiveReason("");
      router.refresh();
    } else {
      toast.error(result.error || "Failed to waive charge");
    }
    setActing(false);
  }

  async function handleCancel(chargeId: string) {
    setActing(true);
    const result = await cancelCharge({ chargeId, organisationId, slug });
    if (result.success) {
      toast.success("Charge cancelled");
      router.refresh();
    } else {
      toast.error(result.error || "Failed to cancel charge");
    }
    setActing(false);
  }

  async function handleMarkPaid(chargeId: string) {
    setActing(true);
    const result = await markChargeAsPaid({ chargeId, organisationId, slug });
    if (result.success) {
      toast.success("Charge marked as paid");
      router.refresh();
    } else {
      toast.error(result.error || "Failed to mark charge as paid");
    }
    setActing(false);
  }

  if (charges.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No charges found.</p>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {showMemberName && <th className="px-4 py-2 text-left font-medium">Member</th>}
              <th className="px-4 py-2 text-left font-medium">Category</th>
              <th className="px-4 py-2 text-left font-medium">Description</th>
              <th className="px-4 py-2 text-right font-medium">Amount</th>
              <th className="px-4 py-2 text-left font-medium">Due Date</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {charges.map((charge) => (
              <tr key={charge.id} className="border-b">
                {showMemberName && (
                  <td className="px-4 py-2">
                    {charge.memberFirstName} {charge.memberLastName}
                  </td>
                )}
                <td className="px-4 py-2">{charge.categoryName}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {charge.description || "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  {formatCurrency(charge.amountCents)}
                </td>
                <td className="px-4 py-2">
                  {charge.dueDate || "—"}
                </td>
                <td className="px-4 py-2">
                  <Badge variant={STATUS_VARIANT[charge.status] ?? "secondary"}>
                    {charge.status}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-right">
                  {charge.status === "UNPAID" && (
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={acting}
                        onClick={() => handleMarkPaid(charge.id)}
                      >
                        Mark Paid
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={acting}
                        onClick={() => {
                          setWaiveChargeId(charge.id);
                          setWaiveDialogOpen(true);
                        }}
                      >
                        Waive
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={acting}
                        onClick={() => handleCancel(charge.id)}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={waiveDialogOpen} onOpenChange={setWaiveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Waive Charge</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="waive-reason">Reason</Label>
              <Input
                id="waive-reason"
                value={waiveReason}
                onChange={(e) => setWaiveReason(e.target.value)}
                placeholder="e.g. Comp for volunteer work"
                required
              />
            </div>
            <Button onClick={handleWaive} disabled={acting || !waiveReason}>
              {acting ? "Waiving..." : "Waive Charge"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 4: Create the admin charges page**

Create `src/app/[slug]/admin/charges/page.tsx`:

```typescript
import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { getSessionMember } from "@/lib/auth";
import { getChargesForOrganisation } from "@/actions/charges/queries";
import { db } from "@/db/index";
import { chargeCategories, members } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { ChargesTable } from "./charges-table";
import { NewChargeDialog } from "./new-charge-dialog";

export default async function AdminChargesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string; categoryId?: string; memberId?: string }>;
}) {
  const { slug } = await params;
  const filters = await searchParams;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const session = await getSessionMember(org.id);
  if (!session) notFound();

  const charges = await getChargesForOrganisation(org.id, {
    status: filters.status,
    categoryId: filters.categoryId,
    memberId: filters.memberId,
  });

  const categories = await db
    .select({ id: chargeCategories.id, name: chargeCategories.name })
    .from(chargeCategories)
    .where(
      and(
        eq(chargeCategories.organisationId, org.id),
        eq(chargeCategories.isActive, true)
      )
    )
    .orderBy(chargeCategories.sortOrder);

  const allMembers = await db
    .select({
      id: members.id,
      firstName: members.firstName,
      lastName: members.lastName,
    })
    .from(members)
    .where(eq(members.organisationId, org.id))
    .orderBy(members.lastName);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Charges</h1>
        <NewChargeDialog
          organisationId={org.id}
          slug={slug}
          categories={categories}
          members={allMembers}
          sessionMemberId={session.memberId}
        />
      </div>

      <ChargesTable
        charges={charges}
        organisationId={org.id}
        slug={slug}
        showMemberName
      />
    </div>
  );
}
```

- [ ] **Step 5: Verify the build compiles**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/app/[slug]/admin/charges/ src/app/[slug]/admin/layout.tsx
git commit -m "feat(phase-13): add admin charges page with table, filters, and new charge dialog"
```

---

### Task 8: Admin UI — member detail charges tab

**Files:**
- Create: `src/app/[slug]/admin/members/[memberId]/member-charges-section.tsx`
- Modify: `src/app/[slug]/admin/members/[memberId]/page.tsx`

- [ ] **Step 1: Create the member charges section component**

Create `src/app/[slug]/admin/members/[memberId]/member-charges-section.tsx`:

```typescript
"use client";

import { ChargesTable } from "@/app/[slug]/admin/charges/charges-table";
import { NewChargeDialog } from "@/app/[slug]/admin/charges/new-charge-dialog";
import type { ChargeWithDetails } from "@/actions/charges/queries";

type Category = { id: string; name: string };

export function MemberChargesSection({
  charges,
  organisationId,
  slug,
  memberId,
  categories,
  sessionMemberId,
}: {
  charges: ChargeWithDetails[];
  organisationId: string;
  slug: string;
  memberId: string;
  categories: Category[];
  sessionMemberId: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <NewChargeDialog
          organisationId={organisationId}
          slug={slug}
          categories={categories}
          members={[]}
          preselectedMemberId={memberId}
          sessionMemberId={sessionMemberId}
        />
      </div>
      <ChargesTable
        charges={charges}
        organisationId={organisationId}
        slug={slug}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add charges section to member detail page**

In `src/app/[slug]/admin/members/[memberId]/page.tsx`:

Add imports:
```typescript
import { MemberChargesSection } from "./member-charges-section";
import { getChargesForMember, getChargesForFamily } from "@/actions/charges/queries";
import { chargeCategories } from "@/db/schema";
import { and } from "drizzle-orm";
```

Add data fetch (after the existing `financialHistory` fetch):
```typescript
const memberCharges = member.primaryMemberId
  ? await getChargesForMember(org.id, memberId)
  : await getChargesForFamily(org.id, memberId).catch(() => getChargesForMember(org.id, memberId));

const categories = await db
  .select({ id: chargeCategories.id, name: chargeCategories.name })
  .from(chargeCategories)
  .where(
    and(
      eq(chargeCategories.organisationId, org.id),
      eq(chargeCategories.isActive, true)
    )
  )
  .orderBy(chargeCategories.sortOrder);
```

Add JSX after the "Role & Financial Status" Card:
```tsx
<Card className="mt-6">
  <CardHeader>
    <CardTitle>Charges</CardTitle>
  </CardHeader>
  <CardContent>
    <MemberChargesSection
      charges={memberCharges}
      organisationId={org.id}
      slug={slug}
      memberId={memberId}
      categories={categories}
      sessionMemberId={session.memberId}
    />
  </CardContent>
</Card>
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/app/[slug]/admin/members/[memberId]/member-charges-section.tsx src/app/[slug]/admin/members/[memberId]/page.tsx
git commit -m "feat(phase-13): add charges section to admin member detail page"
```

---

### Task 9: Consolidated checkout — server action

**Files:**
- Create: `src/actions/stripe/consolidated-checkout.ts`
- Create: `src/actions/stripe/__tests__/consolidated-checkout.test.ts`
- Modify: `src/lib/stripe.ts`

- [ ] **Step 1: Add consolidated checkout params builder to stripe lib**

In `src/lib/stripe.ts`, add:

```typescript
export type ConsolidatedCheckoutInput = {
  connectedAccountId: string;
  organisationId: string;
  checkoutSessionId: string;
  lineItems: Array<{
    name: string;
    amountCents: number;
  }>;
  totalAmountCents: number;
  platformFeeBps: number;
  successUrl: string;
  cancelUrl: string;
};

export function buildConsolidatedCheckoutParams(input: ConsolidatedCheckoutInput) {
  const platformFeeCents = applyBasisPoints(input.totalAmountCents, input.platformFeeBps);

  return {
    mode: "payment" as const,
    line_items: input.lineItems.map((item) => ({
      price_data: {
        currency: "aud",
        product_data: { name: item.name },
        unit_amount: item.amountCents,
      },
      quantity: 1,
    })),
    payment_intent_data: {
      application_fee_amount: platformFeeCents,
    },
    metadata: {
      consolidatedCheckoutId: input.checkoutSessionId,
      organisationId: input.organisationId,
    },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  };
}
```

- [ ] **Step 2: Write the failing test for consolidated checkout**

Create `src/actions/stripe/__tests__/consolidated-checkout.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

let selectResults: unknown[][] = [];
let selectCallCount = 0;

const mockInsert = vi.fn();
const mockSelect = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      const idx = selectCallCount++;
      const result = selectResults[idx] || [];
      return {
        from: () => ({
          where: () => result,
          innerJoin: () => ({
            where: () => result,
          }),
        }),
      };
    },
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: () => ({
          returning: () => [{ id: "line-1" }],
        }),
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  organisations: { id: "id", stripeConnectAccountId: "stripe_connect_account_id" },
  oneOffCharges: { id: "id", status: "status", memberId: "member_id" },
  subscriptions: { id: "id", status: "status", memberId: "member_id" },
  transactions: { id: "id", type: "type", memberId: "member_id" },
  bookings: { id: "id" },
  chargeCategories: { id: "id", name: "name" },
  checkoutLineItems: { id: "id" },
  members: { id: "id", primaryMemberId: "primary_member_id" },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  inArray: vi.fn((a: unknown, b: unknown) => ({ inArray: [a, b] })),
}));

vi.mock("@/lib/stripe", () => ({
  getStripeClient: () => ({
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: "cs_test_123",
          url: "https://checkout.stripe.com/test",
        }),
      },
    },
  }),
  buildConsolidatedCheckoutParams: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn().mockResolvedValue({ memberId: "member-1" }),
}));

import { createConsolidatedCheckoutSession } from "../consolidated-checkout";

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
  selectResults = [];
});

describe("createConsolidatedCheckoutSession", () => {
  it("returns error when org has no Stripe connected", async () => {
    selectResults = [
      [{ stripeConnectAccountId: null, stripeConnectOnboardingComplete: false, platformFeeBps: 100 }],
    ];

    const result = await createConsolidatedCheckoutSession({
      organisationId: "org-1",
      slug: "demo",
      chargeIds: ["charge-1"],
      subscriptionIds: [],
      invoiceTransactionIds: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not set up payments");
  });

  it("returns error when no items selected", async () => {
    selectResults = [
      [{ stripeConnectAccountId: "acct_123", stripeConnectOnboardingComplete: true, platformFeeBps: 100 }],
    ];

    const result = await createConsolidatedCheckoutSession({
      organisationId: "org-1",
      slug: "demo",
      chargeIds: [],
      subscriptionIds: [],
      invoiceTransactionIds: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("No items");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/actions/stripe/__tests__/consolidated-checkout.test.ts`
Expected: FAIL — module `../consolidated-checkout` not found

- [ ] **Step 4: Write the consolidated checkout implementation**

Create `src/actions/stripe/consolidated-checkout.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import {
  organisations,
  oneOffCharges,
  subscriptions,
  transactions,
  bookings,
  chargeCategories,
  checkoutLineItems,
  members,
} from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getStripeClient, buildConsolidatedCheckoutParams } from "@/lib/stripe";
import { getSessionMember } from "@/lib/auth";

type ConsolidatedCheckoutInput = {
  organisationId: string;
  slug: string;
  chargeIds: string[];
  subscriptionIds: string[];
  invoiceTransactionIds: string[];
};

type ConsolidatedCheckoutResult = {
  success: boolean;
  url?: string;
  error?: string;
};

export async function createConsolidatedCheckoutSession(
  input: ConsolidatedCheckoutInput
): Promise<ConsolidatedCheckoutResult> {
  const session = await getSessionMember(input.organisationId);
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
    .where(eq(organisations.id, input.organisationId));

  if (!org?.stripeConnectAccountId || !org.stripeConnectOnboardingComplete) {
    return { success: false, error: "This organisation has not set up payments yet" };
  }

  // Gather all items
  type LineItemData = {
    chargeType: "ONE_OFF_CHARGE" | "SUBSCRIPTION" | "BOOKING_INVOICE";
    chargeId: string;
    memberId: string;
    amountCents: number;
    name: string;
  };

  const items: LineItemData[] = [];

  // One-off charges
  if (input.chargeIds.length > 0) {
    const charges = await db
      .select({
        id: oneOffCharges.id,
        memberId: oneOffCharges.memberId,
        amountCents: oneOffCharges.amountCents,
        categoryName: chargeCategories.name,
        description: oneOffCharges.description,
      })
      .from(oneOffCharges)
      .innerJoin(chargeCategories, eq(chargeCategories.id, oneOffCharges.categoryId))
      .where(
        and(
          inArray(oneOffCharges.id, input.chargeIds),
          eq(oneOffCharges.organisationId, input.organisationId),
          eq(oneOffCharges.status, "UNPAID")
        )
      );

    for (const c of charges) {
      items.push({
        chargeType: "ONE_OFF_CHARGE",
        chargeId: c.id,
        memberId: c.memberId,
        amountCents: c.amountCents,
        name: c.description ? `${c.categoryName} — ${c.description}` : c.categoryName,
      });
    }
  }

  // Subscriptions
  if (input.subscriptionIds.length > 0) {
    const subs = await db
      .select({
        id: subscriptions.id,
        memberId: subscriptions.memberId,
        amountCents: subscriptions.amountCents,
      })
      .from(subscriptions)
      .where(
        and(
          inArray(subscriptions.id, input.subscriptionIds),
          eq(subscriptions.organisationId, input.organisationId),
          eq(subscriptions.status, "UNPAID")
        )
      );

    for (const s of subs) {
      items.push({
        chargeType: "SUBSCRIPTION",
        chargeId: s.id,
        memberId: s.memberId,
        amountCents: s.amountCents,
        name: "Membership Subscription",
      });
    }
  }

  // Booking invoices
  if (input.invoiceTransactionIds.length > 0) {
    const invoices = await db
      .select({
        id: transactions.id,
        memberId: transactions.memberId,
        amountCents: transactions.amountCents,
        bookingReference: bookings.bookingReference,
      })
      .from(transactions)
      .innerJoin(bookings, eq(bookings.id, transactions.bookingId))
      .where(
        and(
          inArray(transactions.id, input.invoiceTransactionIds),
          eq(transactions.organisationId, input.organisationId),
          eq(transactions.type, "INVOICE")
        )
      );

    for (const inv of invoices) {
      items.push({
        chargeType: "BOOKING_INVOICE",
        chargeId: inv.id,
        memberId: inv.memberId,
        amountCents: inv.amountCents,
        name: `Booking ${inv.bookingReference}`,
      });
    }
  }

  if (items.length === 0) {
    return { success: false, error: "No items to pay" };
  }

  const totalAmountCents = items.reduce((sum, i) => sum + i.amountCents, 0);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const stripe = getStripeClient();
  const params = buildConsolidatedCheckoutParams({
    connectedAccountId: org.stripeConnectAccountId,
    organisationId: input.organisationId,
    checkoutSessionId: "", // Will be set after creation
    lineItems: items.map((i) => ({ name: i.name, amountCents: i.amountCents })),
    totalAmountCents,
    platformFeeBps: org.platformFeeBps,
    successUrl: `${appUrl}/${input.slug}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl}/${input.slug}/payment/cancelled`,
  });

  const checkoutSession = await stripe.checkout.sessions.create(params, {
    stripeAccount: org.stripeConnectAccountId,
  });

  if (!checkoutSession.url) {
    return { success: false, error: "Failed to create payment session" };
  }

  // Store line items for webhook processing
  for (const item of items) {
    await db.insert(checkoutLineItems).values({
      stripeCheckoutSessionId: checkoutSession.id,
      chargeType: item.chargeType,
      chargeId: item.chargeId,
      amountCents: item.amountCents,
      memberId: item.memberId,
    });
  }

  return { success: true, url: checkoutSession.url };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/actions/stripe/__tests__/consolidated-checkout.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/stripe.ts src/actions/stripe/consolidated-checkout.ts src/actions/stripe/__tests__/consolidated-checkout.test.ts
git commit -m "feat(phase-13): add consolidated checkout session action with line item tracking"
```

---

### Task 10: Webhook handler — consolidated checkout completion

**Files:**
- Modify: `src/actions/stripe/webhook-handlers.ts`

- [ ] **Step 1: Update the webhook handler to support consolidated checkouts**

In `src/actions/stripe/webhook-handlers.ts`, add imports:

```typescript
import { oneOffCharges, checkoutLineItems } from "@/db/schema";
import { sendEmail } from "@/lib/email/send";
import { ConsolidatedPaymentReceivedEmail } from "@/lib/email/templates/consolidated-payment-received";
```

At the beginning of `handleCheckoutSessionCompleted`, after extracting `paymentIntentId`, add a check for consolidated checkout (before the existing subscription/booking logic):

```typescript
const { consolidatedCheckoutId } = session.metadata ?? {};

if (consolidatedCheckoutId !== undefined) {
  // Consolidated checkout — process each line item
  const lineItems = await db
    .select({
      id: checkoutLineItems.id,
      chargeType: checkoutLineItems.chargeType,
      chargeId: checkoutLineItems.chargeId,
      amountCents: checkoutLineItems.amountCents,
      memberId: checkoutLineItems.memberId,
    })
    .from(checkoutLineItems)
    .where(eq(checkoutLineItems.stripeCheckoutSessionId, session.id));

  if (lineItems.length === 0) return;

  const { organisationId } = session.metadata ?? {};
  if (!organisationId) return;

  // Idempotency: check if we already processed this session
  const [existingTxn] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.stripeCheckoutSessionId, session.id),
        eq(transactions.type, "PAYMENT")
      )
    );
  if (existingTxn) return;

  const emailLineItems: Array<{ description: string; memberName: string; amountCents: number }> = [];

  for (const item of lineItems) {
    // Create PAYMENT transaction for each line item
    const [txn] = await db
      .insert(transactions)
      .values({
        organisationId,
        memberId: item.memberId,
        type: "PAYMENT",
        amountCents: item.amountCents,
        stripePaymentIntentId: paymentIntentId,
        stripeCheckoutSessionId: session.id,
        platformFeeCents: applyBasisPoints(item.amountCents, 100),
        description: `Consolidated payment — ${item.chargeType}`,
      })
      .returning();

    // Update source record based on charge type
    if (item.chargeType === "ONE_OFF_CHARGE") {
      await db
        .update(oneOffCharges)
        .set({
          status: "PAID",
          paidAt: new Date(),
          stripePaymentIntentId: paymentIntentId,
          transactionId: txn.id,
          updatedAt: new Date(),
        })
        .where(eq(oneOffCharges.id, item.chargeId));
    } else if (item.chargeType === "SUBSCRIPTION") {
      await db
        .update(subscriptions)
        .set({
          status: "PAID",
          paidAt: new Date(),
          stripePaymentIntentId: paymentIntentId,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, item.chargeId));
    } else if (item.chargeType === "BOOKING_INVOICE") {
      // Find the booking from the transaction
      const [invoiceTxn] = await db
        .select({ bookingId: transactions.bookingId })
        .from(transactions)
        .where(eq(transactions.id, item.chargeId));

      if (invoiceTxn?.bookingId) {
        await db
          .update(bookings)
          .set({ balancePaidAt: new Date(), updatedAt: new Date() })
          .where(eq(bookings.id, invoiceTxn.bookingId));
      }
    }

    // Get member name for receipt email
    const [memberData] = await db
      .select({ firstName: members.firstName, lastName: members.lastName })
      .from(members)
      .where(eq(members.id, item.memberId));

    emailLineItems.push({
      description: `${item.chargeType.replace(/_/g, " ").toLowerCase()}`,
      memberName: memberData ? `${memberData.firstName} ${memberData.lastName}` : "Unknown",
      amountCents: item.amountCents,
    });
  }

  // Send consolidated receipt email to the payer
  const payerMemberId = lineItems[0].memberId;
  const [emailData] = await db
    .select({
      email: members.email,
      orgName: organisations.name,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
    })
    .from(members)
    .innerJoin(organisations, eq(organisations.id, organisationId))
    .where(eq(members.id, payerMemberId));

  if (emailData) {
    const totalAmount = lineItems.reduce((sum, i) => sum + i.amountCents, 0);
    sendEmail({
      to: emailData.email,
      subject: `Payment received — ${emailLineItems.length} item${emailLineItems.length > 1 ? "s" : ""}`,
      template: React.createElement(ConsolidatedPaymentReceivedEmail, {
        orgName: emailData.orgName,
        lineItems: emailLineItems,
        totalAmountCents: totalAmount,
        paidDate: new Date().toISOString().split("T")[0],
        logoUrl: emailData.logoUrl || undefined,
      }),
      replyTo: emailData.contactEmail || undefined,
      orgName: emailData.orgName,
    });
  }

  return;
}
```

- [ ] **Step 2: Run existing webhook tests to ensure no regressions**

Run: `npx vitest run src/actions/stripe/__tests__/`
Expected: All existing tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/actions/stripe/webhook-handlers.ts
git commit -m "feat(phase-13): add consolidated checkout webhook handler with per-item processing and receipt email"
```

---

### Task 11: Member dashboard — family charges and consolidated payment

**Files:**
- Create: `src/app/[slug]/dashboard/family-charges-section.tsx`
- Modify: `src/app/[slug]/dashboard/page.tsx`

- [ ] **Step 1: Create the family charges section component**

Create `src/app/[slug]/dashboard/family-charges-section.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency } from "@/lib/currency";
import { createConsolidatedCheckoutSession } from "@/actions/stripe/consolidated-checkout";
import { toast } from "sonner";
import type { ChargeWithDetails } from "@/actions/charges/queries";

type OutstandingItem = {
  type: "ONE_OFF_CHARGE" | "SUBSCRIPTION" | "BOOKING_INVOICE";
  id: string;
  description: string;
  memberName: string;
  amountCents: number;
  dueDate?: string | null;
};

export function FamilyChargesSection({
  items,
  organisationId,
  slug,
}: {
  items: OutstandingItem[];
  organisationId: string;
  slug: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(items.map((i) => `${i.type}:${i.id}`))
  );
  const [paying, setPaying] = useState(false);

  const unpaidItems = items.filter((i) => true); // all items passed are unpaid
  const selectedTotal = unpaidItems
    .filter((i) => selected.has(`${i.type}:${i.id}`))
    .reduce((sum, i) => sum + i.amountCents, 0);

  function toggleItem(type: string, id: string) {
    const key = `${type}:${id}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(unpaidItems.map((i) => `${i.type}:${i.id}`)));
  }

  function selectNone() {
    setSelected(new Set());
  }

  async function handlePay() {
    setPaying(true);

    const chargeIds: string[] = [];
    const subscriptionIds: string[] = [];
    const invoiceTransactionIds: string[] = [];

    for (const item of unpaidItems) {
      const key = `${item.type}:${item.id}`;
      if (!selected.has(key)) continue;

      if (item.type === "ONE_OFF_CHARGE") chargeIds.push(item.id);
      else if (item.type === "SUBSCRIPTION") subscriptionIds.push(item.id);
      else if (item.type === "BOOKING_INVOICE") invoiceTransactionIds.push(item.id);
    }

    const result = await createConsolidatedCheckoutSession({
      organisationId,
      slug,
      chargeIds,
      subscriptionIds,
      invoiceTransactionIds,
    });

    if (result.success && result.url) {
      window.location.href = result.url;
    } else {
      toast.error(result.error || "Failed to create payment session");
      setPaying(false);
    }
  }

  if (unpaidItems.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium">Outstanding Charges</h3>
        <div className="flex gap-2 text-xs">
          <button onClick={selectAll} className="text-primary hover:underline">Select all</button>
          <button onClick={selectNone} className="text-muted-foreground hover:underline">Clear</button>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {unpaidItems.map((item) => {
          const key = `${item.type}:${item.id}`;
          return (
            <label
              key={key}
              className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50"
            >
              <Checkbox
                checked={selected.has(key)}
                onCheckedChange={() => toggleItem(item.type, item.id)}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{item.description}</span>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {item.memberName}
                  </Badge>
                </div>
                {item.dueDate && (
                  <p className="text-xs text-muted-foreground">Due: {item.dueDate}</p>
                )}
              </div>
              <span className="text-sm font-medium shrink-0">
                {formatCurrency(item.amountCents)}
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t pt-3">
        <div>
          <p className="text-sm font-medium">
            Total: {formatCurrency(selectedTotal)}
          </p>
          <p className="text-xs text-muted-foreground">
            {selected.size} of {unpaidItems.length} items selected
          </p>
        </div>
        <Button
          onClick={handlePay}
          disabled={paying || selected.size === 0}
        >
          {paying ? "Processing..." : `Pay ${formatCurrency(selectedTotal)}`}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update dashboard page to include family charges**

In `src/app/[slug]/dashboard/page.tsx`:

Add imports:
```typescript
import { getChargesForFamily, getChargesForMember } from "@/actions/charges/queries";
import { FamilyChargesSection } from "./family-charges-section";
import { members as membersTable } from "@/db/schema";
```

Add data fetch (after `memberSubscription`):
```typescript
// Get family charges for consolidated view
let outstandingItems: Array<{
  type: "ONE_OFF_CHARGE" | "SUBSCRIPTION" | "BOOKING_INVOICE";
  id: string;
  description: string;
  memberName: string;
  amountCents: number;
  dueDate?: string | null;
}> = [];

if (org && session) {
  // Check if this member is a primary member (has dependents)
  const dependents = await db
    .select({ id: membersTable.id })
    .from(membersTable)
    .where(
      and(
        eq(membersTable.organisationId, org.id),
        eq(membersTable.primaryMemberId, session.memberId)
      )
    );

  const isPrimary = dependents.length > 0;
  const memberName = `${session.firstName} ${session.lastName}`;

  // Get one-off charges
  const charges = isPrimary
    ? await getChargesForFamily(org.id, session.memberId)
    : await getChargesForMember(org.id, session.memberId);

  for (const c of charges) {
    if (c.status === "UNPAID") {
      outstandingItems.push({
        type: "ONE_OFF_CHARGE",
        id: c.id,
        description: c.categoryName + (c.description ? ` — ${c.description}` : ""),
        memberName: `${c.memberFirstName} ${c.memberLastName}`,
        amountCents: c.amountCents,
        dueDate: c.dueDate,
      });
    }
  }

  // Add unpaid bookings
  for (const b of upcomingBookings) {
    if (!b.balancePaidAt && b.invoiceTransactionId) {
      outstandingItems.push({
        type: "BOOKING_INVOICE",
        id: b.invoiceTransactionId,
        description: `Booking ${b.bookingReference}`,
        memberName,
        amountCents: b.totalAmountCents,
      });
    }
  }

  // Add unpaid subscription
  if (memberSubscription && memberSubscription.status === "UNPAID") {
    outstandingItems.push({
      type: "SUBSCRIPTION",
      id: memberSubscription.id,
      description: "Membership Subscription",
      memberName,
      amountCents: memberSubscription.amountCents,
    });
  }
}
```

Add JSX — replace the existing "Outstanding Balance" div with the FamilyChargesSection:
```tsx
{outstandingItems.length > 0 && org && (
  <FamilyChargesSection
    items={outstandingItems}
    organisationId={org.id}
    slug={slug}
  />
)}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/app/[slug]/dashboard/family-charges-section.tsx src/app/[slug]/dashboard/page.tsx
git commit -m "feat(phase-13): add family charges section with consolidated payment to member dashboard"
```

---

### Task 12: Update member balances report to include one-off charges

**Files:**
- Modify: `src/actions/reports/member-balances.ts`
- Modify: `src/actions/reports/member-balances.test.ts`

- [ ] **Step 1: Update the member balances query**

In `src/actions/reports/member-balances.ts`:

Add import:
```typescript
import { oneOffCharges } from "@/db/schema";
```

Add a subquery for unpaid one-off charges to the select. Add after the `totalInvoicedCents` field:

```typescript
totalUnpaidChargesCents: sql<number>`COALESCE((
  SELECT SUM(${oneOffCharges.amountCents})
  FROM ${oneOffCharges}
  WHERE ${oneOffCharges.memberId} = ${members.id}
    AND ${oneOffCharges.organisationId} = ${members.organisationId}
    AND ${oneOffCharges.status} = 'UNPAID'
), 0)`,
```

Update the outstanding balance calculation in the map function:

```typescript
const outstanding =
  Number(row.totalInvoicedCents) -
  Number(row.totalPaidCents) +
  Number(row.totalRefundedCents) +
  Number(row.totalUnpaidChargesCents);
```

Update the type assertion to include `totalUnpaidChargesCents: number`.

- [ ] **Step 2: Update the test**

In `src/actions/reports/member-balances.test.ts`, ensure mock data includes the new `totalUnpaidChargesCents` field in the returned rows.

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/actions/reports/member-balances.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/actions/reports/member-balances.ts src/actions/reports/member-balances.test.ts
git commit -m "feat(phase-13): include unpaid one-off charges in member balances report"
```

---

### Task 13: Bulk charge creation

**Files:**
- Create: `src/actions/charges/bulk-create.ts`
- Create: `src/actions/charges/__tests__/bulk-create.test.ts`
- Create: `src/app/[slug]/admin/charges/bulk-charge-dialog.tsx`
- Modify: `src/app/[slug]/admin/charges/page.tsx`

- [ ] **Step 1: Write the failing test for bulk create**

Create `src/actions/charges/__tests__/bulk-create.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockValues = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockValues(...vArgs);
          return {
            returning: () => vArgs[0].map((_: unknown, i: number) => ({ id: `charge-${i}` })),
          };
        },
      };
    },
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => [],
          }),
        }),
        where: () => [],
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  oneOffCharges: { id: "id" },
  members: { id: "id" },
  chargeCategories: { id: "id" },
  organisations: { id: "id" },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(),
}));

import { bulkCreateCharges } from "../bulk-create";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("bulkCreateCharges", () => {
  it("creates charges for multiple members", async () => {
    const result = await bulkCreateCharges({
      organisationId: "org-1",
      memberIds: ["member-1", "member-2", "member-3"],
      categoryId: "cat-1",
      amountCents: 5000,
      description: "Locker fee 2026",
      createdByMemberId: "admin-1",
      slug: "demo",
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(3);
    expect(mockInsert).toHaveBeenCalled();
  });

  it("rejects empty member list", async () => {
    const result = await bulkCreateCharges({
      organisationId: "org-1",
      memberIds: [],
      categoryId: "cat-1",
      amountCents: 5000,
      createdByMemberId: "admin-1",
      slug: "demo",
    });

    expect(result.success).toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/actions/charges/__tests__/bulk-create.test.ts`
Expected: FAIL — module `../bulk-create` not found

- [ ] **Step 3: Write the bulk create implementation**

Create `src/actions/charges/bulk-create.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { oneOffCharges, members, chargeCategories, organisations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/email/send";
import React from "react";
import { ChargeCreatedEmail } from "@/lib/email/templates/charge-created";

type BulkCreateInput = {
  organisationId: string;
  memberIds: string[];
  categoryId: string;
  amountCents: number;
  description?: string;
  dueDate?: string;
  createdByMemberId: string;
  slug: string;
};

type BulkCreateResult = {
  success: boolean;
  count?: number;
  error?: string;
};

export async function bulkCreateCharges(
  input: BulkCreateInput
): Promise<BulkCreateResult> {
  if (input.memberIds.length === 0) {
    return { success: false, error: "No members selected" };
  }

  if (input.amountCents <= 0) {
    return { success: false, error: "Amount must be greater than zero" };
  }

  const values = input.memberIds.map((memberId) => ({
    organisationId: input.organisationId,
    memberId,
    categoryId: input.categoryId,
    description: input.description || null,
    amountCents: input.amountCents,
    dueDate: input.dueDate || null,
    createdByMemberId: input.createdByMemberId,
  }));

  const created = await db.insert(oneOffCharges).values(values).returning();

  // Send notification emails
  const memberRows = await db
    .select({
      id: members.id,
      email: members.email,
    })
    .from(members)
    .where(eq(members.organisationId, input.organisationId));

  const memberEmailMap = new Map(memberRows.map((m) => [m.id, m.email]));

  const [catData] = await db
    .select({ name: chargeCategories.name })
    .from(chargeCategories)
    .where(eq(chargeCategories.id, input.categoryId));

  const [orgData] = await db
    .select({
      name: organisations.name,
      slug: organisations.slug,
      contactEmail: organisations.contactEmail,
      logoUrl: organisations.logoUrl,
    })
    .from(organisations)
    .where(eq(organisations.id, input.organisationId));

  if (catData && orgData) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    for (const memberId of input.memberIds) {
      const email = memberEmailMap.get(memberId);
      if (email) {
        sendEmail({
          to: email,
          subject: `New charge — ${catData.name}`,
          template: React.createElement(ChargeCreatedEmail, {
            orgName: orgData.name,
            categoryName: catData.name,
            description: input.description,
            amountCents: input.amountCents,
            dueDate: input.dueDate,
            payUrl: `${appUrl}/${orgData.slug}/dashboard`,
            logoUrl: orgData.logoUrl || undefined,
          }),
          replyTo: orgData.contactEmail || undefined,
          orgName: orgData.name,
        });
      }
    }
  }

  revalidatePath(`/${input.slug}/admin/charges`);

  return { success: true, count: created.length };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/charges/__tests__/bulk-create.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Create the bulk charge dialog component**

Create `src/app/[slug]/admin/charges/bulk-charge-dialog.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bulkCreateCharges } from "@/actions/charges/bulk-create";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type Category = { id: string; name: string };
type Member = { id: string; firstName: string; lastName: string };

export function BulkChargeDialog({
  organisationId,
  slug,
  categories,
  members,
  sessionMemberId,
}: {
  organisationId: string;
  slug: string;
  categories: Category[];
  members: Member[];
  sessionMemberId: string;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const router = useRouter();

  function toggleMember(id: string) {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllMembers() {
    setSelectedMembers(new Set(members.map((m) => m.id)));
  }

  function clearMembers() {
    setSelectedMembers(new Set());
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const form = new FormData(e.currentTarget);
    const amountDollars = parseFloat(form.get("amount") as string);
    const description = form.get("description") as string;
    const dueDate = form.get("dueDate") as string;

    if (selectedMembers.size === 0 || !selectedCategoryId || isNaN(amountDollars) || amountDollars <= 0) {
      toast.error("Please fill in all required fields and select at least one member");
      setSaving(false);
      return;
    }

    const result = await bulkCreateCharges({
      organisationId,
      memberIds: Array.from(selectedMembers),
      categoryId: selectedCategoryId,
      amountCents: Math.round(amountDollars * 100),
      description,
      dueDate: dueDate || undefined,
      createdByMemberId: sessionMemberId,
      slug,
    });

    if (result.success) {
      toast.success(`${result.count} charges created`);
      setOpen(false);
      setSelectedMembers(new Set());
      setSelectedCategoryId("");
      router.refresh();
    } else {
      toast.error(result.error || "Failed to create charges");
    }

    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        Bulk Charge
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Bulk Charges</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bulk-amount">Amount (AUD)</Label>
            <Input
              id="bulk-amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bulk-desc">Description (optional)</Label>
            <Input id="bulk-desc" name="description" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bulk-due">Due Date (optional)</Label>
            <Input id="bulk-due" name="dueDate" type="date" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Members ({selectedMembers.size} selected)</Label>
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={selectAllMembers} className="text-primary hover:underline">
                  All
                </button>
                <button type="button" onClick={clearMembers} className="text-muted-foreground hover:underline">
                  None
                </button>
              </div>
            </div>
            <div className="border rounded-md max-h-48 overflow-y-auto p-2 space-y-1">
              {members.map((m) => (
                <label
                  key={m.id}
                  className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm"
                >
                  <Checkbox
                    checked={selectedMembers.has(m.id)}
                    onCheckedChange={() => toggleMember(m.id)}
                  />
                  {m.firstName} {m.lastName}
                </label>
              ))}
            </div>
          </div>

          <Button type="submit" disabled={saving}>
            {saving ? "Creating..." : `Create ${selectedMembers.size} Charges`}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Add bulk charge dialog to charges page**

In `src/app/[slug]/admin/charges/page.tsx`, add import:

```typescript
import { BulkChargeDialog } from "./bulk-charge-dialog";
```

Add the BulkChargeDialog next to the NewChargeDialog in the header:

```tsx
<div className="flex items-center justify-between mb-6">
  <h1 className="text-2xl font-bold">Charges</h1>
  <div className="flex gap-2">
    <BulkChargeDialog
      organisationId={org.id}
      slug={slug}
      categories={categories}
      members={allMembers}
      sessionMemberId={session.memberId}
    />
    <NewChargeDialog
      organisationId={org.id}
      slug={slug}
      categories={categories}
      members={allMembers}
      sessionMemberId={session.memberId}
    />
  </div>
</div>
```

- [ ] **Step 7: Verify the build compiles**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add src/actions/charges/bulk-create.ts src/actions/charges/__tests__/bulk-create.test.ts src/app/[slug]/admin/charges/bulk-charge-dialog.tsx src/app/[slug]/admin/charges/page.tsx
git commit -m "feat(phase-13): add bulk charge creation with member selection and email notifications"
```

---

### Task 14: Run full test suite and verify build

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All tests PASS (existing + new)

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Fix any failures**

Address any test failures or build errors discovered.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(phase-13): address test and build issues"
```

---

### Task 15: Seed data for development

**Files:**
- Modify: `src/db/seed.ts`

- [ ] **Step 1: Add charge categories and sample charges to seed**

In `src/db/seed.ts`, add seed data for:
- 4 charge categories: "Locker Fee", "Cleaning Fee", "Key Deposit", "Event Fee"
- Sample one-off charges across members with various statuses (UNPAID, PAID, WAIVED)
- Some charges with due dates, some without

Follow the existing seed file patterns for inserting data. Use the existing member IDs from the seed.

- [ ] **Step 2: Run the seed to verify it works**

Run: `npm run db:seed` (if running against a dev database)

- [ ] **Step 3: Commit**

```bash
git add src/db/seed.ts
git commit -m "feat(phase-13): add charge categories and sample charges to seed data"
```
