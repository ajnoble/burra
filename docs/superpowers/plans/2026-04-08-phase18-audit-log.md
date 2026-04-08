# Phase 18: Audit Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrument all major server actions with audit logging and build a filterable audit log viewer for admins.

**Architecture:** Centralized `createAuditLog()` helper with fire-and-forget calls in each server action. Changed-fields-only tracking via `diffChanges()` utility. Server-rendered admin viewer page with filters, expandable row diffs, entity links, pagination, and CSV export.

**Tech Stack:** Next.js 16, Drizzle ORM, TypeScript, Vitest, Playwright, shadcn/ui

**Important:** Read `AGENTS.md` before writing any Next.js code — this version has breaking changes.

---

## Task 1: Audit Log Helper & Diff Utility

**Files:**
- Create: `src/lib/audit-log.ts`
- Create: `src/lib/__tests__/audit-log.test.ts`

- [ ] **Step 1: Write failing tests for `diffChanges`**

```ts
// src/lib/__tests__/audit-log.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db/index", () => ({
  db: { insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }) },
}));
vi.mock("@/db/schema", () => ({
  auditLog: { id: "id" },
}));

import { diffChanges } from "../audit-log";

describe("diffChanges", () => {
  it("returns only changed fields", () => {
    const prev = { role: "MEMBER", name: "John" };
    const curr = { role: "ADMIN", name: "John" };
    const result = diffChanges(prev, curr);
    expect(result).toEqual({
      previousValue: { role: "MEMBER" },
      newValue: { role: "ADMIN" },
    });
  });

  it("returns empty objects when nothing changed", () => {
    const obj = { a: 1, b: "x" };
    const result = diffChanges(obj, obj);
    expect(result).toEqual({ previousValue: {}, newValue: {} });
  });

  it("detects added fields", () => {
    const prev = { a: 1 };
    const curr = { a: 1, b: 2 };
    const result = diffChanges(prev, curr);
    expect(result).toEqual({
      previousValue: { b: undefined },
      newValue: { b: 2 },
    });
  });

  it("detects removed fields", () => {
    const prev = { a: 1, b: 2 };
    const curr = { a: 1 };
    const result = diffChanges(prev, curr);
    expect(result).toEqual({
      previousValue: { b: 2 },
      newValue: { b: undefined },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/audit-log.test.ts`
Expected: FAIL — `diffChanges` not found

- [ ] **Step 3: Write failing tests for `createAuditLog`**

Add to the same test file:

```ts
import { createAuditLog } from "../audit-log";
import { db } from "@/db/index";

describe("createAuditLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts an audit log entry", async () => {
    await createAuditLog({
      organisationId: "org-1",
      actorMemberId: "member-1",
      action: "BOOKING_APPROVED",
      entityType: "booking",
      entityId: "booking-1",
      previousValue: { status: "PENDING" },
      newValue: { status: "CONFIRMED" },
    });

    expect(db.insert).toHaveBeenCalled();
  });

  it("does not throw on db error", async () => {
    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error("DB error")),
    });
    (db as unknown as { insert: typeof mockInsert }).insert = mockInsert;

    // Should not throw
    await createAuditLog({
      organisationId: "org-1",
      actorMemberId: "member-1",
      action: "TEST",
      entityType: "test",
      entityId: "test-1",
      previousValue: null,
      newValue: null,
    });
  });
});
```

- [ ] **Step 4: Write failing tests for `formatChangeSummary`**

Add to the same test file:

```ts
import { formatChangeSummary } from "../audit-log";

describe("formatChangeSummary", () => {
  it("formats field changes as arrows", () => {
    const result = formatChangeSummary(
      "MEMBER_ROLE_CHANGED",
      { role: "MEMBER" },
      { role: "ADMIN" }
    );
    expect(result).toBe("role: MEMBER → ADMIN");
  });

  it("formats multiple field changes", () => {
    const result = formatChangeSummary(
      "MEMBER_UPDATED",
      { firstName: "Old", email: "old@x.com" },
      { firstName: "New", email: "new@x.com" }
    );
    expect(result).toContain("firstName: Old → New");
    expect(result).toContain("email: old@x.com → new@x.com");
  });

  it("returns action description for create actions with null previous", () => {
    const result = formatChangeSummary(
      "BOOKING_CREATED",
      null,
      { status: "PENDING", totalAmountCents: 5000 }
    );
    expect(result).toBe("Created");
  });

  it("returns action description for delete actions with null new", () => {
    const result = formatChangeSummary(
      "DOCUMENT_DELETED",
      { title: "Bylaws" },
      null
    );
    expect(result).toBe("Deleted");
  });

  it("returns empty string for no changes", () => {
    const result = formatChangeSummary("TEST", {}, {});
    expect(result).toBe("");
  });
});
```

- [ ] **Step 5: Write failing test for `getEntityUrl`**

Add to the same test file:

```ts
import { getEntityUrl } from "../audit-log";

describe("getEntityUrl", () => {
  it("returns member detail URL", () => {
    expect(getEntityUrl("polski", "member", "m-1")).toBe("/polski/admin/members/m-1");
  });

  it("returns booking detail URL", () => {
    expect(getEntityUrl("polski", "booking", "b-1")).toBe("/polski/admin/bookings/b-1");
  });

  it("returns documents list URL for document type", () => {
    expect(getEntityUrl("polski", "document", "d-1")).toBe("/polski/admin/documents");
  });

  it("returns charges list URL", () => {
    expect(getEntityUrl("polski", "charge", "c-1")).toBe("/polski/admin/charges");
  });

  it("returns subscriptions list URL", () => {
    expect(getEntityUrl("polski", "subscription", "s-1")).toBe("/polski/admin/subscriptions");
  });

  it("returns waitlist list URL", () => {
    expect(getEntityUrl("polski", "waitlistEntry", "w-1")).toBe("/polski/admin/waitlist");
  });

  it("returns communications list URL", () => {
    expect(getEntityUrl("polski", "communication", "c-1")).toBe("/polski/admin/communications");
  });

  it("returns settings URL for organisation type", () => {
    expect(getEntityUrl("polski", "organisation", "o-1")).toBe("/polski/admin/settings");
  });

  it("returns null for unknown entity type", () => {
    expect(getEntityUrl("polski", "unknown", "x-1")).toBeNull();
  });
});
```

- [ ] **Step 6: Run all tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/audit-log.test.ts`
Expected: FAIL — functions not found

- [ ] **Step 7: Implement `src/lib/audit-log.ts`**

```ts
import { db } from "@/db/index";
import { auditLog } from "@/db/schema";

type AuditLogInput = {
  organisationId: string;
  actorMemberId: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
};

export async function createAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await db.insert(auditLog).values({
      organisationId: input.organisationId,
      actorMemberId: input.actorMemberId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      previousValue: input.previousValue,
      newValue: input.newValue,
    });
  } catch (error) {
    console.error("Audit log write failed:", error);
  }
}

export function diffChanges(
  previous: Record<string, unknown>,
  current: Record<string, unknown>
): { previousValue: Record<string, unknown>; newValue: Record<string, unknown> } {
  const allKeys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  const previousValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};

  for (const key of allKeys) {
    const oldVal = previous[key];
    const newVal = current[key];
    if (oldVal !== newVal) {
      previousValue[key] = oldVal;
      newValue[key] = newVal;
    }
  }

  return { previousValue, newValue };
}

export function formatChangeSummary(
  action: string,
  previousValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null
): string {
  if (!previousValue || Object.keys(previousValue).length === 0) {
    if (!newValue || Object.keys(newValue).length === 0) return "";
    return "Created";
  }
  if (!newValue || Object.keys(newValue).length === 0) {
    return "Deleted";
  }

  const changes: string[] = [];
  const allKeys = new Set([...Object.keys(previousValue), ...Object.keys(newValue)]);
  for (const key of allKeys) {
    const oldVal = previousValue[key];
    const newVal = newValue[key];
    if (oldVal !== newVal) {
      changes.push(`${key}: ${oldVal ?? "—"} → ${newVal ?? "—"}`);
    }
  }
  return changes.join(", ");
}

export function getEntityUrl(
  slug: string,
  entityType: string,
  entityId: string
): string | null {
  switch (entityType) {
    case "booking":
      return `/${slug}/admin/bookings/${entityId}`;
    case "member":
      return `/${slug}/admin/members/${entityId}`;
    case "subscription":
      return `/${slug}/admin/subscriptions`;
    case "charge":
      return `/${slug}/admin/charges`;
    case "document":
      return `/${slug}/admin/documents`;
    case "documentCategory":
      return `/${slug}/admin/documents`;
    case "communication":
      return `/${slug}/admin/communications`;
    case "waitlistEntry":
      return `/${slug}/admin/waitlist`;
    case "organisation":
      return `/${slug}/admin/settings`;
    default:
      return null;
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/audit-log.test.ts`
Expected: All PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/audit-log.ts src/lib/__tests__/audit-log.test.ts
git commit -m "feat: add audit log helper, diffChanges, formatChangeSummary, getEntityUrl"
```

---

## Task 2: Instrument Booking Actions

**Files:**
- Modify: `src/actions/bookings/create.ts`
- Modify: `src/actions/bookings/approve.ts`
- Modify: `src/actions/bookings/cancel.ts`

For each file: add `import { createAuditLog } from "@/lib/audit-log"` and a fire-and-forget `createAuditLog(...).catch(console.error)` call after the successful DB operation.

**Key pattern:** These actions all have `session.memberId` or explicit actor IDs available. The `createBooking` runs inside a `db.transaction()`, so the audit log call goes after the transaction completes.

- [ ] **Step 1: Instrument `create.ts`**

Add import at top:
```ts
import { createAuditLog } from "@/lib/audit-log";
```

After the transaction block (after line ~317 where `return { bookingReference, bookingId, ... }` from the transaction), add before the email sending section:

```ts
    createAuditLog({
      organisationId: data.organisationId,
      actorMemberId: session.memberId,
      action: "BOOKING_CREATED",
      entityType: "booking",
      entityId: result.bookingId,
      previousValue: null,
      newValue: {
        bookingReference: result.bookingReference,
        status: result.status,
        totalAmountCents: result.totalAmountCents,
      },
    }).catch(console.error);
```

Note: The transaction result is stored in a variable (e.g. `result`). The code currently does `const result = await db.transaction(...)` — add the audit log call right after this, before the email sending block.

- [ ] **Step 2: Instrument `approve.ts`**

Add import at top:
```ts
import { createAuditLog } from "@/lib/audit-log";
```

After the `db.update(bookings).set(...)` at line 67-76, before the email section:

```ts
  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: input.approverMemberId,
    action: "BOOKING_APPROVED",
    entityType: "booking",
    entityId: input.bookingId,
    previousValue: { status: "PENDING" },
    newValue: { status: "CONFIRMED" },
  }).catch(console.error);
```

- [ ] **Step 3: Instrument `cancel.ts`**

Add import at top:
```ts
import { createAuditLog } from "@/lib/audit-log";
```

After the `db.transaction(...)` block (after line ~141), before the Stripe refund:

```ts
  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: input.cancelledByMemberId,
    action: "BOOKING_CANCELLED",
    entityType: "booking",
    entityId: input.bookingId,
    previousValue: { status: booking.status },
    newValue: {
      status: "CANCELLED",
      cancellationReason: input.reason,
      refundAmountCents: refundAmountCents > 0 ? refundAmountCents : null,
    },
  }).catch(console.error);
```

- [ ] **Step 4: Run existing booking tests to verify no regression**

Run: `npx vitest run src/actions/bookings/__tests__/`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/bookings/create.ts src/actions/bookings/approve.ts src/actions/bookings/cancel.ts
git commit -m "feat: instrument booking actions with audit logging"
```

---

## Task 3: Instrument Member Actions

**Files:**
- Modify: `src/actions/members/role.ts`
- Modify: `src/actions/members/financial.ts`
- Modify: `src/actions/members/update.ts`

**Key challenge:** `role.ts` and `update.ts` don't have a session — they lack `getSessionMember()`. We need to add it for the actor ID. Both already have `organisationId` in input.

- [ ] **Step 1: Instrument `role.ts`**

Add imports:
```ts
import { getSessionMember } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit-log";
```

The action uses `.returning()` which gives us `updated` with the previous data already gone. We need to capture the old role before the update. Add before the `db.update()` call:

```ts
  // Fetch current role for audit
  const [current] = await db
    .select({ role: organisationMembers.role })
    .from(organisationMembers)
    .where(
      and(
        eq(organisationMembers.memberId, input.memberId),
        eq(organisationMembers.organisationId, input.organisationId)
      )
    );
```

After the `if (!updated)` check, before `revalidatePath`:

```ts
  const session = await getSessionMember(input.organisationId);
  if (session) {
    createAuditLog({
      organisationId: input.organisationId,
      actorMemberId: session.memberId,
      action: "MEMBER_ROLE_CHANGED",
      entityType: "member",
      entityId: input.memberId,
      previousValue: { role: current?.role ?? null },
      newValue: { role: parsed.data.role },
    }).catch(console.error);
  }
```

- [ ] **Step 2: Instrument `financial.ts`**

Add import:
```ts
import { createAuditLog } from "@/lib/audit-log";
```

After the `db.insert(financialStatusChanges)` call and before the email section:

```ts
  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: input.changedByMemberId,
    action: "MEMBER_FINANCIAL_STATUS_CHANGED",
    entityType: "member",
    entityId: input.memberId,
    previousValue: { isFinancial: !parsed.data.isFinancial },
    newValue: { isFinancial: parsed.data.isFinancial, reason: parsed.data.reason },
  }).catch(console.error);
```

- [ ] **Step 3: Instrument `update.ts`**

Add imports:
```ts
import { getSessionMember } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit-log";
import { diffChanges } from "@/lib/audit-log";
```

Before the `db.update(members)` call, fetch current values:

```ts
  // Fetch current member for audit diff
  const [currentMember] = await db
    .select({
      firstName: members.firstName,
      lastName: members.lastName,
      email: members.email,
      phone: members.phone,
      dateOfBirth: members.dateOfBirth,
      memberNumber: members.memberNumber,
      membershipClassId: members.membershipClassId,
      notes: members.notes,
    })
    .from(members)
    .where(and(eq(members.id, memberId), eq(members.organisationId, organisationId)));
```

After the `if (!updated)` check, before `revalidatePath`:

```ts
  const session = await getSessionMember(organisationId);
  if (session && currentMember) {
    const updatedFields: Record<string, unknown> = {};
    if (data.firstName !== undefined) updatedFields.firstName = data.firstName;
    if (data.lastName !== undefined) updatedFields.lastName = data.lastName;
    if (data.email !== undefined) updatedFields.email = data.email;
    if (data.phone !== undefined) updatedFields.phone = data.phone || null;
    if (data.dateOfBirth !== undefined) updatedFields.dateOfBirth = data.dateOfBirth || null;
    if (data.memberNumber !== undefined) updatedFields.memberNumber = data.memberNumber || null;
    if (data.notes !== undefined) updatedFields.notes = data.notes || null;
    if (input.membershipClassId !== undefined) updatedFields.membershipClassId = input.membershipClassId;

    const diff = diffChanges(currentMember as Record<string, unknown>, {
      ...currentMember as Record<string, unknown>,
      ...updatedFields,
    });

    if (Object.keys(diff.newValue).length > 0) {
      createAuditLog({
        organisationId,
        actorMemberId: session.memberId,
        action: "MEMBER_UPDATED",
        entityType: "member",
        entityId: memberId,
        previousValue: diff.previousValue,
        newValue: diff.newValue,
      }).catch(console.error);
    }
  }
```

- [ ] **Step 4: Run existing member tests**

Run: `npx vitest run src/actions/members/__tests__/`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/members/role.ts src/actions/members/financial.ts src/actions/members/update.ts
git commit -m "feat: instrument member actions with audit logging"
```

---

## Task 4: Instrument Subscription Actions

**Files:**
- Modify: `src/actions/subscriptions/admin-actions.ts`

This file has 3 exported functions. Each uses `requireAdmin()` which gets a session but doesn't return it. We need the session for actorMemberId.

- [ ] **Step 1: Update `requireAdmin` to return session**

Change the function signature and return type:

```ts
import { createAuditLog } from "@/lib/audit-log";

async function requireAdmin(organisationId: string): Promise<{ error: ActionResult } | { session: SessionMember }> {
  const session = await getSessionMember(organisationId);
  if (!session || !canAccessAdmin(session.role)) {
    return { error: { success: false, error: "Not authorised" } };
  }
  return { session };
}
```

Also add to imports:
```ts
import type { SessionMember } from "@/lib/auth";
```

Update each caller pattern from:
```ts
const authError = await requireAdmin(input.organisationId);
if (authError) return authError;
```
To:
```ts
const auth = await requireAdmin(input.organisationId);
if ("error" in auth) return auth.error;
const { session } = auth;
```

- [ ] **Step 2: Instrument `waiveSubscription`**

After the `db.update(subscriptions).set(...)` and `if (!updated)` check:

```ts
  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: session.memberId,
    action: "SUBSCRIPTION_WAIVED",
    entityType: "subscription",
    entityId: input.subscriptionId,
    previousValue: { status: updated.status },
    newValue: { status: "WAIVED", waivedReason: reason },
  }).catch(console.error);
```

Note: `.returning()` gives the updated row. We need to capture the old status. Add a select before the update:

```ts
  const [existing] = await db
    .select({ status: subscriptions.status })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.id, input.subscriptionId),
        eq(subscriptions.organisationId, input.organisationId)
      )
    );
```

Then use `existing.status` as previousValue.

- [ ] **Step 3: Instrument `adjustSubscriptionAmount`**

Before the update, fetch current amount:

```ts
  const [existing] = await db
    .select({ amountCents: subscriptions.amountCents })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.id, input.subscriptionId),
        eq(subscriptions.organisationId, input.organisationId)
      )
    );
```

After the update and `if (!updated)` check:

```ts
  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: session.memberId,
    action: "SUBSCRIPTION_AMOUNT_ADJUSTED",
    entityType: "subscription",
    entityId: input.subscriptionId,
    previousValue: { amountCents: existing?.amountCents ?? null },
    newValue: { amountCents: input.amountCents },
  }).catch(console.error);
```

- [ ] **Step 4: Instrument `recordOfflinePayment`**

After the `db.transaction(...)` block:

```ts
  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: session.memberId,
    action: "SUBSCRIPTION_PAID_OFFLINE",
    entityType: "subscription",
    entityId: input.subscriptionId,
    previousValue: { status: sub.status },
    newValue: { status: "PAID", adminName: input.adminName },
  }).catch(console.error);
```

- [ ] **Step 5: Run existing subscription tests**

Run: `npx vitest run src/actions/subscriptions/__tests__/`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/actions/subscriptions/admin-actions.ts
git commit -m "feat: instrument subscription actions with audit logging"
```

---

## Task 5: Instrument Charge Actions

**Files:**
- Modify: `src/actions/charges/create.ts`
- Modify: `src/actions/charges/update-status.ts`

- [ ] **Step 1: Instrument `create.ts`**

Add import:
```ts
import { createAuditLog } from "@/lib/audit-log";
```

After the `db.insert(oneOffCharges)` and before `revalidatePath`:

```ts
  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: input.createdByMemberId,
    action: "CHARGE_CREATED",
    entityType: "charge",
    entityId: charge.id,
    previousValue: null,
    newValue: {
      memberId: input.memberId,
      amountCents: input.amountCents,
      description: input.description ?? null,
      categoryId: input.categoryId,
    },
  }).catch(console.error);
```

- [ ] **Step 2: Instrument `update-status.ts` — all 3 functions**

Add import:
```ts
import { createAuditLog } from "@/lib/audit-log";
```

In `waiveCharge`, after the `db.update()`:

```ts
  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: session.memberId,
    action: "CHARGE_WAIVED",
    entityType: "charge",
    entityId: input.chargeId,
    previousValue: { status: "UNPAID" },
    newValue: { status: "WAIVED", waivedReason: input.reason },
  }).catch(console.error);
```

In `cancelCharge`, after the `db.update()`:

```ts
  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: session.memberId,
    action: "CHARGE_CANCELLED",
    entityType: "charge",
    entityId: input.chargeId,
    previousValue: { status: "UNPAID" },
    newValue: { status: "CANCELLED" },
  }).catch(console.error);
```

In `markChargeAsPaid`, after the `db.update()`:

```ts
  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: session.memberId,
    action: "CHARGE_PAID",
    entityType: "charge",
    entityId: input.chargeId,
    previousValue: { status: "UNPAID" },
    newValue: { status: "PAID" },
  }).catch(console.error);
```

- [ ] **Step 3: Run existing charge tests**

Run: `npx vitest run src/actions/charges/__tests__/`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/actions/charges/create.ts src/actions/charges/update-status.ts
git commit -m "feat: instrument charge actions with audit logging"
```

---

## Task 6: Instrument Document Actions

**Files:**
- Modify: `src/actions/documents/upload.ts`
- Modify: `src/actions/documents/update.ts`
- Modify: `src/actions/documents/delete.ts`
- Modify: `src/actions/documents/categories.ts`

- [ ] **Step 1: Instrument `upload.ts`**

Add import:
```ts
import { createAuditLog } from "@/lib/audit-log";
```

After the `db.insert(documents)` and before `revalidatePath`:

```ts
  createAuditLog({
    organisationId,
    actorMemberId: session.memberId,
    action: "DOCUMENT_UPLOADED",
    entityType: "document",
    entityId: doc.id,
    previousValue: null,
    newValue: { title, accessLevel, categoryId },
  }).catch(console.error);
```

- [ ] **Step 2: Instrument `update.ts` — both functions**

Add import:
```ts
import { createAuditLog } from "@/lib/audit-log";
```

In `updateDocument`, after the `db.update()` and before `revalidatePath`:

```ts
  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: session.memberId,
    action: "DOCUMENT_UPDATED",
    entityType: "document",
    entityId: input.documentId,
    previousValue: null,
    newValue: Object.fromEntries(
      Object.entries(setValues).filter(([_, v]) => v !== undefined)
    ),
  }).catch(console.error);
```

In `replaceFile`, after the `db.update()` and before `revalidatePath`:

```ts
  createAuditLog({
    organisationId,
    actorMemberId: session.memberId,
    action: "DOCUMENT_FILE_REPLACED",
    entityType: "document",
    entityId: documentId,
    previousValue: null,
    newValue: { fileName: file.name, fileSizeBytes: file.size },
  }).catch(console.error);
```

- [ ] **Step 3: Instrument `delete.ts`**

Add import:
```ts
import { createAuditLog } from "@/lib/audit-log";
```

After the `db.delete(documents)` and before `revalidatePath`:

```ts
  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: session.memberId,
    action: "DOCUMENT_DELETED",
    entityType: "document",
    entityId: input.documentId,
    previousValue: { fileUrl: existing.fileUrl },
    newValue: null,
  }).catch(console.error);
```

- [ ] **Step 4: Instrument `categories.ts` — create, update, delete**

Add import:
```ts
import { createAuditLog } from "@/lib/audit-log";
```

In `createDocumentCategory`, after `db.insert()`:

```ts
  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: session.memberId,
    action: "DOCUMENT_CATEGORY_CREATED",
    entityType: "documentCategory",
    entityId: category.id,
    previousValue: null,
    newValue: { name: parsed.data.name },
  }).catch(console.error);
```

In `updateDocumentCategory`, after `db.update()`:

```ts
  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: session.memberId,
    action: "DOCUMENT_CATEGORY_UPDATED",
    entityType: "documentCategory",
    entityId: input.id,
    previousValue: null,
    newValue: { name: parsed.data.name },
  }).catch(console.error);
```

In `deleteDocumentCategory`, after `db.delete()`:

```ts
  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: session.memberId,
    action: "DOCUMENT_CATEGORY_DELETED",
    entityType: "documentCategory",
    entityId: input.id,
    previousValue: null,
    newValue: null,
  }).catch(console.error);
```

- [ ] **Step 5: Run existing document tests**

Run: `npx vitest run src/actions/documents/`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/actions/documents/upload.ts src/actions/documents/update.ts src/actions/documents/delete.ts src/actions/documents/categories.ts
git commit -m "feat: instrument document actions with audit logging"
```

---

## Task 7: Instrument Communication, Waitlist, and Settings Actions

**Files:**
- Modify: `src/actions/communications/send.ts`
- Modify: `src/actions/communications/settings.ts`
- Modify: `src/actions/waitlist/join.ts`
- Modify: `src/actions/waitlist/notify.ts`
- Modify: `src/actions/waitlist/remove.ts`
- Modify: `src/actions/organisations/update.ts`

- [ ] **Step 1: Instrument `communications/send.ts`**

Add import:
```ts
import { createAuditLog } from "@/lib/audit-log";
```

After the final `db.update(communications).set({ status: finalStatus, ... })` at line ~285-293, before `revalidatePath`:

```ts
  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: session.memberId,
    action: "COMMUNICATION_SENT",
    entityType: "communication",
    entityId: input.communicationId,
    previousValue: { status: "DRAFT" },
    newValue: { status: finalStatus, sentCount, failedCount },
  }).catch(console.error);
```

- [ ] **Step 2: Instrument `communications/settings.ts`**

Add import:
```ts
import { createAuditLog } from "@/lib/audit-log";
```

After the `db.update(organisations)` and before `revalidatePath`:

```ts
  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: session.memberId,
    action: "SMS_SETTINGS_UPDATED",
    entityType: "organisation",
    entityId: input.organisationId,
    previousValue: null,
    newValue: {
      smsPreArrivalEnabled: input.smsPreArrivalEnabled,
      smsPreArrivalHours: input.smsPreArrivalHours,
      smsPaymentReminderEnabled: input.smsPaymentReminderEnabled,
    },
  }).catch(console.error);
```

- [ ] **Step 3: Instrument `waitlist/join.ts`**

Add import:
```ts
import { createAuditLog } from "@/lib/audit-log";
```

After the `db.insert(waitlistEntries)` (after line ~166), before the email section:

```ts
  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: session.memberId,
    action: "WAITLIST_JOINED",
    entityType: "waitlistEntry",
    entityId: entry.id,
    previousValue: null,
    newValue: {
      lodgeId: input.lodgeId,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      numberOfGuests: input.numberOfGuests,
    },
  }).catch(console.error);
```

- [ ] **Step 4: Instrument `waitlist/notify.ts`**

Add import:
```ts
import { createAuditLog } from "@/lib/audit-log";
```

After the `db.update(waitlistEntries)` (after line ~75), before the member fetch:

```ts
  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: session.memberId,
    action: "WAITLIST_NOTIFIED",
    entityType: "waitlistEntry",
    entityId: input.waitlistEntryId,
    previousValue: { status: "WAITING" },
    newValue: { status: "NOTIFIED", expiresAt: expiresAt.toISOString() },
  }).catch(console.error);
```

- [ ] **Step 5: Instrument `waitlist/remove.ts`**

Add import:
```ts
import { createAuditLog } from "@/lib/audit-log";
```

After the `db.delete(waitlistEntries)` (after line ~47), before `revalidatePath`:

```ts
  createAuditLog({
    organisationId: input.organisationId,
    actorMemberId: session.memberId,
    action: "WAITLIST_REMOVED",
    entityType: "waitlistEntry",
    entityId: input.waitlistEntryId,
    previousValue: { status: entry.waitlist_entries.status },
    newValue: null,
  }).catch(console.error);
```

- [ ] **Step 6: Instrument `organisations/update.ts`**

This action lacks a session. Add imports:
```ts
import { getSessionMember } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit-log";
```

After the `db.update(organisations)` and before `revalidatePath`:

```ts
  const session = await getSessionMember(data.id);
  if (session) {
    createAuditLog({
      organisationId: data.id,
      actorMemberId: session.memberId,
      action: "ORGANISATION_UPDATED",
      entityType: "organisation",
      entityId: data.id,
      previousValue: null,
      newValue: {
        name: data.name,
        contactEmail: data.contactEmail ?? null,
        timezone: data.timezone,
      },
    }).catch(console.error);
  }
```

- [ ] **Step 7: Run all unit tests to verify no regressions**

Run: `npx vitest run`
Expected: All PASS (582+ tests)

- [ ] **Step 8: Commit**

```bash
git add src/actions/communications/send.ts src/actions/communications/settings.ts src/actions/waitlist/join.ts src/actions/waitlist/notify.ts src/actions/waitlist/remove.ts src/actions/organisations/update.ts
git commit -m "feat: instrument communication, waitlist, and org settings with audit logging"
```

---

## Task 8: Audit Log Queries (Server Action)

**Files:**
- Create: `src/actions/audit-log/queries.ts`
- Create: `src/actions/audit-log/queries.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/actions/audit-log/queries.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db/index", () => {
  const mockSelect = vi.fn();
  const mockFrom = vi.fn();
  const mockLeftJoin = vi.fn();
  const mockWhere = vi.fn();
  const mockOrderBy = vi.fn();
  const mockLimit = vi.fn();
  const mockOffset = vi.fn();

  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ leftJoin: mockLeftJoin });
  mockLeftJoin.mockReturnValue({ where: mockWhere });
  mockWhere.mockReturnValue({ orderBy: mockOrderBy });
  mockOrderBy.mockReturnValue({ limit: mockLimit });
  mockLimit.mockReturnValue({ offset: mockOffset });
  mockOffset.mockResolvedValue([]);

  return {
    db: {
      select: mockSelect,
      $count: vi.fn().mockResolvedValue(0),
    },
  };
});

vi.mock("@/db/schema", () => ({
  auditLog: {
    id: "id",
    organisationId: "organisation_id",
    actorMemberId: "actor_member_id",
    action: "action",
    entityType: "entity_type",
    entityId: "entity_id",
    previousValue: "previous_value",
    newValue: "new_value",
    createdAt: "created_at",
  },
  members: {
    id: "id",
    firstName: "first_name",
    lastName: "last_name",
  },
}));

import { getAuditLogEntries, type AuditLogFilters } from "./queries";

describe("getAuditLogEntries", () => {
  it("returns rows and total count", async () => {
    const result = await getAuditLogEntries({
      organisationId: "org-1",
    });

    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
  });

  it("accepts filter parameters without error", async () => {
    const filters: AuditLogFilters = {
      organisationId: "org-1",
      action: "BOOKING_APPROVED",
      entityType: "booking",
      actorMemberId: "member-1",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      page: 2,
    };

    const result = await getAuditLogEntries(filters);
    expect(result.page).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/audit-log/queries.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement queries**

```ts
// src/actions/audit-log/queries.ts
"use server";

import { db } from "@/db/index";
import { auditLog, members } from "@/db/schema";
import { eq, and, gte, lte, desc, type SQL } from "drizzle-orm";

const DEFAULT_PAGE_SIZE = 25;

export type AuditLogFilters = {
  organisationId: string;
  action?: string;
  entityType?: string;
  actorMemberId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

export type AuditLogRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue: unknown;
  newValue: unknown;
  createdAt: Date;
  actorFirstName: string | null;
  actorLastName: string | null;
  actorMemberId: string;
};

export async function getAuditLogEntries(
  filters: AuditLogFilters
): Promise<{ rows: AuditLogRow[]; total: number; page: number; pageSize: number }> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  const conditions: SQL[] = [eq(auditLog.organisationId, filters.organisationId)];

  if (filters.action) {
    conditions.push(eq(auditLog.action, filters.action));
  }
  if (filters.entityType) {
    conditions.push(eq(auditLog.entityType, filters.entityType));
  }
  if (filters.actorMemberId) {
    conditions.push(eq(auditLog.actorMemberId, filters.actorMemberId));
  }
  if (filters.dateFrom) {
    conditions.push(gte(auditLog.createdAt, new Date(filters.dateFrom)));
  }
  if (filters.dateTo) {
    conditions.push(lte(auditLog.createdAt, new Date(filters.dateTo + "T23:59:59")));
  }

  const whereClause = and(...conditions)!;

  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      previousValue: auditLog.previousValue,
      newValue: auditLog.newValue,
      createdAt: auditLog.createdAt,
      actorFirstName: members.firstName,
      actorLastName: members.lastName,
      actorMemberId: auditLog.actorMemberId,
    })
    .from(auditLog)
    .leftJoin(members, eq(members.id, auditLog.actorMemberId))
    .where(whereClause)
    .orderBy(desc(auditLog.createdAt))
    .limit(pageSize)
    .offset(offset);

  const total = await db.$count(auditLog, whereClause);

  return { rows, total, page, pageSize };
}

export async function getDistinctActions(organisationId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ action: auditLog.action })
    .from(auditLog)
    .where(eq(auditLog.organisationId, organisationId))
    .orderBy(auditLog.action);

  return rows.map((r) => r.action);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/audit-log/queries.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/audit-log/queries.ts src/actions/audit-log/queries.test.ts
git commit -m "feat: add audit log query action with filtering and pagination"
```

---

## Task 9: Audit Log CSV Export

**Files:**
- Create: `src/actions/audit-log/export-csv.ts`
- Create: `src/actions/audit-log/export-csv.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/actions/audit-log/export-csv.test.ts
import { describe, it, expect } from "vitest";
import { serialiseAuditLogCsv } from "./export-csv";

describe("serialiseAuditLogCsv", () => {
  it("produces CSV with headers", () => {
    const csv = serialiseAuditLogCsv([]);
    expect(csv).toBe("Date,Actor,Action,Entity Type,Entity ID,Changes");
  });

  it("formats rows correctly", () => {
    const csv = serialiseAuditLogCsv([
      {
        id: "1",
        action: "BOOKING_APPROVED",
        entityType: "booking",
        entityId: "b-1",
        previousValue: { status: "PENDING" },
        newValue: { status: "CONFIRMED" },
        createdAt: new Date("2026-04-08T10:00:00Z"),
        actorFirstName: "Marek",
        actorLastName: "Kowalski",
        actorMemberId: "m-1",
      },
    ]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("08/04/2026");
    expect(lines[1]).toContain("Marek Kowalski");
    expect(lines[1]).toContain("BOOKING_APPROVED");
    expect(lines[1]).toContain("booking");
    expect(lines[1]).toContain("status: PENDING → CONFIRMED");
  });

  it("handles null previous/new values", () => {
    const csv = serialiseAuditLogCsv([
      {
        id: "1",
        action: "BOOKING_CREATED",
        entityType: "booking",
        entityId: "b-1",
        previousValue: null,
        newValue: { status: "PENDING" },
        createdAt: new Date("2026-04-08T10:00:00Z"),
        actorFirstName: "Marek",
        actorLastName: "Kowalski",
        actorMemberId: "m-1",
      },
    ]);
    const lines = csv.split("\n");
    expect(lines[1]).toContain("Created");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/audit-log/export-csv.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement CSV export**

```ts
// src/actions/audit-log/export-csv.ts
import { serialiseCsv, type CsvColumn } from "@/actions/reports/export-csv";
import { formatChangeSummary } from "@/lib/audit-log";
import type { AuditLogRow } from "./queries";

const AUDIT_LOG_COLUMNS: CsvColumn[] = [
  { key: "date", header: "Date" },
  { key: "actor", header: "Actor" },
  { key: "action", header: "Action" },
  { key: "entityType", header: "Entity Type" },
  { key: "entityId", header: "Entity ID" },
  { key: "changes", header: "Changes" },
];

function formatDate(date: Date): string {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function serialiseAuditLogCsv(rows: AuditLogRow[]): string {
  const data = rows.map((row) => ({
    date: formatDate(row.createdAt),
    actor: [row.actorFirstName, row.actorLastName].filter(Boolean).join(" ") || "Unknown",
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    changes: formatChangeSummary(
      row.action,
      row.previousValue as Record<string, unknown> | null,
      row.newValue as Record<string, unknown> | null
    ),
  }));

  return serialiseCsv(AUDIT_LOG_COLUMNS, data);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/audit-log/export-csv.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/audit-log/export-csv.ts src/actions/audit-log/export-csv.test.ts
git commit -m "feat: add audit log CSV export"
```

---

## Task 10: Audit Log Viewer Page

**Files:**
- Create: `src/app/[slug]/admin/audit-log/page.tsx`
- Create: `src/app/[slug]/admin/audit-log/audit-log-filters.tsx`
- Create: `src/app/[slug]/admin/audit-log/audit-log-table.tsx`
- Create: `src/app/[slug]/admin/audit-log/audit-log-export.tsx`

**Important:** Read `node_modules/next/dist/docs/` for any Next.js 16 breaking changes before writing page components. Follow existing admin page patterns in the codebase.

- [ ] **Step 1: Create the server page component**

```tsx
// src/app/[slug]/admin/audit-log/page.tsx
import { notFound } from "next/navigation";
import { getOrgBySlug } from "@/actions/organisations/queries";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { getAuditLogEntries, getDistinctActions } from "@/actions/audit-log/queries";
import { Badge } from "@/components/ui/badge";
import { AuditLogFilters } from "./audit-log-filters";
import { AuditLogTable } from "./audit-log-table";
import { AuditLogExport } from "./audit-log-export";
import { getMembers } from "@/lib/members";

const ENTITY_TYPES = [
  { value: "booking", label: "Booking" },
  { value: "member", label: "Member" },
  { value: "subscription", label: "Subscription" },
  { value: "charge", label: "Charge" },
  { value: "document", label: "Document" },
  { value: "documentCategory", label: "Document Category" },
  { value: "communication", label: "Communication" },
  { value: "waitlistEntry", label: "Waitlist" },
  { value: "organisation", label: "Organisation" },
];

export default async function AuditLogPage({
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

  const session = await getSessionMember(org.id);
  if (!session || !isCommitteeOrAbove(session.role)) notFound();

  const filters = {
    organisationId: org.id,
    action: typeof sp.action === "string" ? sp.action : undefined,
    entityType: typeof sp.entityType === "string" ? sp.entityType : undefined,
    actorMemberId: typeof sp.actorMemberId === "string" ? sp.actorMemberId : undefined,
    dateFrom: typeof sp.dateFrom === "string" ? sp.dateFrom : undefined,
    dateTo: typeof sp.dateTo === "string" ? sp.dateTo : undefined,
    page: typeof sp.page === "string" ? parseInt(sp.page, 10) : 1,
  };

  const [data, actions, membersResult] = await Promise.all([
    getAuditLogEntries(filters),
    getDistinctActions(org.id),
    getMembers(org.id, {}),
  ]);
  const orgMembers = membersResult.rows;

  const basePath = `/${slug}/admin/audit-log`;

  const actionOptions = actions.map((a) => ({ value: a, label: a }));
  const memberOptions = orgMembers.map((m) => ({
    value: m.id,
    label: `${m.firstName} ${m.lastName}`,
  }));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <Badge variant="outline">{data.total}</Badge>
        </div>
        <AuditLogExport filters={filters} />
      </div>

      <AuditLogFilters
        basePath={basePath}
        actionOptions={actionOptions}
        entityTypeOptions={ENTITY_TYPES}
        memberOptions={memberOptions}
      />

      <AuditLogTable
        rows={data.rows}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        basePath={basePath}
        slug={slug}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create the filters component**

```tsx
// src/app/[slug]/admin/audit-log/audit-log-filters.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Option = { value: string; label: string };

interface AuditLogFiltersProps {
  basePath: string;
  actionOptions: Option[];
  entityTypeOptions: Option[];
  memberOptions: Option[];
}

export function AuditLogFilters({
  basePath,
  actionOptions,
  entityTypeOptions,
  memberOptions,
}: AuditLogFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["action", "entityType", "actorMemberId", "dateFrom", "dateTo"]) {
      const value = formData.get(key);
      if (typeof value === "string" && value !== "") {
        params.set(key, value);
      }
    }
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function handleClear() {
    router.push(basePath);
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div className="flex flex-col gap-1">
          <Label htmlFor="action" className="text-xs text-muted-foreground">Action</Label>
          <select
            id="action"
            name="action"
            defaultValue={searchParams.get("action") ?? ""}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All</option>
            {actionOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="entityType" className="text-xs text-muted-foreground">Entity Type</Label>
          <select
            id="entityType"
            name="entityType"
            defaultValue={searchParams.get("entityType") ?? ""}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All</option>
            {entityTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="actorMemberId" className="text-xs text-muted-foreground">Actor</Label>
          <select
            id="actorMemberId"
            name="actorMemberId"
            defaultValue={searchParams.get("actorMemberId") ?? ""}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All</option>
            {memberOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="dateFrom" className="text-xs text-muted-foreground">From</Label>
          <Input
            id="dateFrom"
            name="dateFrom"
            type="date"
            defaultValue={searchParams.get("dateFrom") ?? ""}
            className="w-40"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="dateTo" className="text-xs text-muted-foreground">To</Label>
          <Input
            id="dateTo"
            name="dateTo"
            type="date"
            defaultValue={searchParams.get("dateTo") ?? ""}
            className="w-40"
          />
        </div>

        <div className="flex gap-2">
          <Button type="submit" size="sm">Filter</Button>
          <Button type="button" variant="outline" size="sm" onClick={handleClear}>Clear</Button>
        </div>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Create the table component with row expansion**

```tsx
// src/app/[slug]/admin/audit-log/audit-log-table.tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatChangeSummary, getEntityUrl } from "@/lib/audit-log";
import type { AuditLogRow } from "@/actions/audit-log/queries";
import Link from "next/link";

interface AuditLogTableProps {
  rows: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
  basePath: string;
  slug: string;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ChangesDiff({
  previousValue,
  newValue,
}: {
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
}) {
  if (!previousValue && !newValue) return <p className="text-sm text-muted-foreground">No data recorded</p>;

  const prev = previousValue ?? {};
  const next = newValue ?? {};
  const allKeys = [...new Set([...Object.keys(prev), ...Object.keys(next)])];

  if (allKeys.length === 0) return <p className="text-sm text-muted-foreground">No changes recorded</p>;

  return (
    <div className="space-y-1">
      {allKeys.map((key) => (
        <div key={key} className="flex gap-2 text-sm">
          <span className="font-medium min-w-[120px]">{key}:</span>
          {prev[key] !== undefined && (
            <span className="text-red-600 line-through">{String(prev[key] ?? "—")}</span>
          )}
          {next[key] !== undefined && (
            <span className="text-green-600">{String(next[key] ?? "—")}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function AuditLogTable({ rows, total, page, pageSize, basePath, slug }: AuditLogTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const totalPages = Math.ceil(total / pageSize);

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    router.push(`${basePath}?${params.toString()}`);
  }

  if (rows.length === 0) {
    return (
      <div className="border rounded-md p-8 text-center text-sm text-muted-foreground">
        No audit log entries found.
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="px-4 py-2 font-medium text-muted-foreground text-left">Date</th>
              <th className="px-4 py-2 font-medium text-muted-foreground text-left">Actor</th>
              <th className="px-4 py-2 font-medium text-muted-foreground text-left">Action</th>
              <th className="px-4 py-2 font-medium text-muted-foreground text-left">Entity</th>
              <th className="px-4 py-2 font-medium text-muted-foreground text-left">Changes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isExpanded = expandedId === row.id;
              const entityUrl = getEntityUrl(slug, row.entityType, row.entityId);
              const summary = formatChangeSummary(
                row.action,
                row.previousValue as Record<string, unknown> | null,
                row.newValue as Record<string, unknown> | null
              );

              return (
                <>
                  <tr
                    key={row.id}
                    className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : row.id)}
                  >
                    <td className="px-4 py-2 whitespace-nowrap">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-2">
                      {row.actorFirstName} {row.actorLastName}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant="outline">{row.action}</Badge>
                    </td>
                    <td className="px-4 py-2">{row.entityType}</td>
                    <td className="px-4 py-2 max-w-xs truncate">{summary}</td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${row.id}-detail`} className="bg-muted/20">
                      <td colSpan={5} className="px-6 py-4">
                        <ChangesDiff
                          previousValue={row.previousValue as Record<string, unknown> | null}
                          newValue={row.newValue as Record<string, unknown> | null}
                        />
                        {entityUrl && (
                          <Link href={entityUrl}>
                            <Button variant="outline" size="sm" className="mt-3">
                              View {row.entityType}
                            </Button>
                          </Link>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {rows.map((row) => {
          const isExpanded = expandedId === row.id;
          const entityUrl = getEntityUrl(slug, row.entityType, row.entityId);
          const summary = formatChangeSummary(
            row.action,
            row.previousValue as Record<string, unknown> | null,
            row.newValue as Record<string, unknown> | null
          );

          return (
            <div
              key={row.id}
              className="rounded-lg border p-4 space-y-1 cursor-pointer"
              onClick={() => setExpandedId(isExpanded ? null : row.id)}
            >
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Date</span>
                <span>{formatDate(row.createdAt)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Actor</span>
                <span>{row.actorFirstName} {row.actorLastName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Action</span>
                <Badge variant="outline">{row.action}</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Entity</span>
                <span>{row.entityType}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Changes</span>
                <span className="text-right max-w-[200px] truncate">{summary}</span>
              </div>
              {isExpanded && (
                <div className="pt-3 border-t mt-2">
                  <ChangesDiff
                    previousValue={row.previousValue as Record<string, unknown> | null}
                    newValue={row.newValue as Record<string, unknown> | null}
                  />
                  {entityUrl && (
                    <Link href={entityUrl}>
                      <Button variant="outline" size="sm" className="mt-3">
                        View {row.entityType}
                      </Button>
                    </Link>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({total} entries)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Create the export component**

```tsx
// src/app/[slug]/admin/audit-log/audit-log-export.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getAuditLogEntries, type AuditLogFilters } from "@/actions/audit-log/queries";
import { serialiseAuditLogCsv } from "@/actions/audit-log/export-csv";

interface AuditLogExportProps {
  filters: AuditLogFilters;
}

export function AuditLogExport({ filters }: AuditLogExportProps) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      // Fetch all rows for export (up to 10000)
      const data = await getAuditLogEntries({ ...filters, page: 1, pageSize: 10000 });
      const csv = serialiseAuditLogCsv(data.rows);

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
      {exporting ? "Exporting..." : "Export CSV"}
    </Button>
  );
}
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 6: Commit**

```bash
git add src/app/\[slug\]/admin/audit-log/
git commit -m "feat: add audit log viewer page with filters, table, expansion, and CSV export"
```

---

## Task 11: E2E Tests

**Files:**
- Create: `e2e/tests/admin-audit-log.spec.ts`

**Pre-requisite:** The app must be rebuilt and deployed to the Docker container before running E2E tests. Run `npm run build && docker compose build && docker compose up -d` and wait for the app to be ready.

- [ ] **Step 1: Write E2E tests**

```ts
// e2e/tests/admin-audit-log.spec.ts
import { test, expect } from "../fixtures/auth";

test.describe("Admin audit log", () => {
  test("audit log page loads with heading and filters", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/audit-log");
    await expect(
      adminPage.getByRole("heading", { name: "Audit Log" })
    ).toBeVisible();
    await expect(adminPage.locator("#action")).toBeVisible();
    await expect(adminPage.locator("#entityType")).toBeVisible();
    await expect(adminPage.locator("#dateFrom")).toBeVisible();
    await expect(adminPage.locator("#dateTo")).toBeVisible();
  });

  test("filter by entity type narrows results", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/audit-log");
    await adminPage.locator("#entityType").selectOption("booking");
    await adminPage.getByRole("button", { name: "Filter" }).click();
    await expect(adminPage).toHaveURL(/entityType=booking/);
  });

  test("filter by date range works", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/audit-log");
    await adminPage.locator("#dateFrom").fill("2026-01-01");
    await adminPage.locator("#dateTo").fill("2026-12-31");
    await adminPage.getByRole("button", { name: "Filter" }).click();
    await expect(adminPage).toHaveURL(/dateFrom=2026-01-01/);
    await expect(adminPage).toHaveURL(/dateTo=2026-12-31/);
  });

  test("clear button resets filters", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/audit-log?entityType=booking");
    await adminPage.getByRole("button", { name: "Clear" }).click();
    await expect(adminPage).toHaveURL(/\/polski\/admin\/audit-log$/);
  });

  test("export CSV triggers download", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/audit-log");
    const downloadPromise = adminPage.waitForEvent("download");
    await adminPage.getByRole("button", { name: "Export CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain("audit-log");
  });

  test("booking officer cannot access audit log", async ({ officerPage }) => {
    await officerPage.goto("/polski/admin/audit-log");
    await expect(
      officerPage.getByRole("heading", { name: "Audit Log" })
    ).not.toBeVisible();
  });
});
```

- [ ] **Step 2: Build and deploy to Docker**

```bash
npm run build && docker compose build && docker compose up -d
```

Wait ~5 seconds for the app to start.

- [ ] **Step 3: Run E2E tests**

Run: `npx playwright test --config e2e/playwright.config.ts e2e/tests/admin-audit-log.spec.ts`
Expected: All PASS

- [ ] **Step 4: Run full E2E suite to verify no regressions**

Run: `npx playwright test --config e2e/playwright.config.ts`
Expected: All PASS (59+ tests)

- [ ] **Step 5: Commit**

```bash
git add e2e/tests/admin-audit-log.spec.ts
git commit -m "test: add E2E tests for audit log viewer"
```

---

## Task 12: Final Verification & Cleanup

- [ ] **Step 1: Run full unit test suite**

Run: `npx vitest run`
Expected: All PASS (590+ tests)

- [ ] **Step 2: Run full E2E suite**

Run: `npx playwright test --config e2e/playwright.config.ts`
Expected: All PASS (65+ tests)

- [ ] **Step 3: Verify audit log entries are being created**

After running the E2E tests, some actions will have created audit log entries. Open the audit log viewer in the browser at `http://172.20.0.2:3010/polski/admin/audit-log` and verify entries appear.

If no entries appear (because the E2E tests don't trigger instrumented actions), manually trigger an action via the admin UI and verify the audit log entry appears.

- [ ] **Step 4: Commit any final adjustments**

If any fixes were needed during verification, commit them:

```bash
git add -A
git commit -m "fix: audit log final adjustments"
```
