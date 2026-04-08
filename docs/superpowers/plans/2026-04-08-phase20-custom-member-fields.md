# Phase 20 — Custom Member Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to define custom fields per organisation and store values per member, with CSV import/export support.

**Architecture:** Two new tables (`custom_fields`, `custom_field_values`) with CRUD server actions. Admin manages field definitions in Settings. Values are edited on the member profile form and displayed on the member detail page. CSV import/export extended to include custom field columns.

**Tech Stack:** Drizzle ORM, Next.js 16 server actions, shadcn/ui, Vitest, Zod

---

### Task 1: Database Schema

**Files:**
- Create: `src/db/schema/custom-fields.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Create the schema file**

```typescript
// src/db/schema/custom-fields.ts
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { organisations } from "./organisations";
import { members } from "./members";

export const customFieldTypeEnum = pgEnum("custom_field_type", [
  "text",
  "number",
  "date",
  "dropdown",
  "checkbox",
]);

export const customFields = pgTable("custom_fields", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  name: text("name").notNull(),
  key: text("key").notNull(),
  type: customFieldTypeEnum("type").notNull(),
  options: text("options"), // comma-separated for dropdown
  sortOrder: integer("sort_order").notNull().default(0),
  isRequired: boolean("is_required").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const customFieldValues = pgTable("custom_field_values", {
  id: uuid("id").defaultRandom().primaryKey(),
  customFieldId: uuid("custom_field_id")
    .notNull()
    .references(() => customFields.id),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id),
  value: text("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
```

- [ ] **Step 2: Export from schema index**

Add to `src/db/schema/index.ts`:

```typescript
export { customFieldTypeEnum, customFields, customFieldValues } from "./custom-fields";
```

- [ ] **Step 3: Generate and apply migration**

```bash
npm run db:generate
npm run db:migrate
```

Verify: migration SQL creates `custom_field_type` enum, `custom_fields` table, and `custom_field_values` table. Add unique constraints via the migration SQL if Drizzle doesn't generate them:
- `custom_fields`: unique on `(organisation_id, key)`
- `custom_field_values`: unique on `(custom_field_id, member_id)`

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/custom-fields.ts src/db/schema/index.ts drizzle/
git commit -m "feat(phase20): add custom_fields and custom_field_values schema"
```

---

### Task 2: Validation Schemas

**Files:**
- Create: `src/lib/validation-custom-fields.ts`
- Create: `src/lib/__tests__/custom-field-validation.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/__tests__/custom-field-validation.test.ts
import { describe, it, expect } from "vitest";
import {
  createCustomFieldSchema,
  updateCustomFieldSchema,
  validateCustomFieldValue,
} from "../validation-custom-fields";

describe("createCustomFieldSchema", () => {
  it("accepts valid text field", () => {
    const result = createCustomFieldSchema.parse({
      name: "Emergency Contact",
      key: "emergency_contact",
      type: "text",
    });
    expect(result.name).toBe("Emergency Contact");
    expect(result.key).toBe("emergency_contact");
    expect(result.type).toBe("text");
    expect(result.isRequired).toBe(false);
  });

  it("accepts valid dropdown with options", () => {
    const result = createCustomFieldSchema.parse({
      name: "Dietary Requirements",
      key: "dietary_requirements",
      type: "dropdown",
      options: "Vegetarian, Vegan, Gluten-free",
    });
    expect(result.options).toBe("Vegetarian, Vegan, Gluten-free");
  });

  it("rejects dropdown without options", () => {
    expect(() =>
      createCustomFieldSchema.parse({
        name: "Diet",
        key: "diet",
        type: "dropdown",
      })
    ).toThrow();
  });

  it("rejects empty name", () => {
    expect(() =>
      createCustomFieldSchema.parse({
        name: "",
        key: "test",
        type: "text",
      })
    ).toThrow();
  });

  it("rejects invalid key format", () => {
    expect(() =>
      createCustomFieldSchema.parse({
        name: "Test",
        key: "Invalid Key!",
        type: "text",
      })
    ).toThrow();
  });

  it("rejects invalid type", () => {
    expect(() =>
      createCustomFieldSchema.parse({
        name: "Test",
        key: "test",
        type: "invalid",
      })
    ).toThrow();
  });
});

describe("updateCustomFieldSchema", () => {
  it("accepts partial update with just name", () => {
    const result = updateCustomFieldSchema.parse({ name: "Updated" });
    expect(result.name).toBe("Updated");
  });

  it("accepts empty object", () => {
    const result = updateCustomFieldSchema.parse({});
    expect(result).toEqual({});
  });
});

describe("validateCustomFieldValue", () => {
  it("accepts any string for text type", () => {
    expect(validateCustomFieldValue("text", "hello", null)).toEqual({
      valid: true,
    });
  });

  it("accepts valid number", () => {
    expect(validateCustomFieldValue("number", "42", null)).toEqual({
      valid: true,
    });
  });

  it("accepts decimal number", () => {
    expect(validateCustomFieldValue("number", "3.14", null)).toEqual({
      valid: true,
    });
  });

  it("rejects non-numeric for number type", () => {
    expect(validateCustomFieldValue("number", "abc", null)).toEqual({
      valid: false,
      error: "Must be a valid number",
    });
  });

  it("accepts valid date", () => {
    expect(validateCustomFieldValue("date", "2026-01-15", null)).toEqual({
      valid: true,
    });
  });

  it("rejects invalid date", () => {
    expect(validateCustomFieldValue("date", "not-a-date", null)).toEqual({
      valid: false,
      error: "Must be a valid date (YYYY-MM-DD)",
    });
  });

  it("accepts valid dropdown option", () => {
    expect(
      validateCustomFieldValue("dropdown", "Vegan", "Vegetarian, Vegan, Gluten-free")
    ).toEqual({ valid: true });
  });

  it("accepts dropdown option case-insensitively", () => {
    expect(
      validateCustomFieldValue("dropdown", "vegan", "Vegetarian, Vegan, Gluten-free")
    ).toEqual({ valid: true });
  });

  it("rejects invalid dropdown option", () => {
    expect(
      validateCustomFieldValue("dropdown", "Paleo", "Vegetarian, Vegan, Gluten-free")
    ).toEqual({
      valid: false,
      error: 'Must be one of: Vegetarian, Vegan, Gluten-free',
    });
  });

  it("accepts true/false for checkbox", () => {
    expect(validateCustomFieldValue("checkbox", "true", null)).toEqual({
      valid: true,
    });
    expect(validateCustomFieldValue("checkbox", "false", null)).toEqual({
      valid: true,
    });
  });

  it("accepts yes/no for checkbox", () => {
    expect(validateCustomFieldValue("checkbox", "yes", null)).toEqual({
      valid: true,
    });
    expect(validateCustomFieldValue("checkbox", "no", null)).toEqual({
      valid: true,
    });
  });

  it("accepts 1/0 for checkbox", () => {
    expect(validateCustomFieldValue("checkbox", "1", null)).toEqual({
      valid: true,
    });
    expect(validateCustomFieldValue("checkbox", "0", null)).toEqual({
      valid: true,
    });
  });

  it("rejects invalid checkbox value", () => {
    expect(validateCustomFieldValue("checkbox", "maybe", null)).toEqual({
      valid: false,
      error: "Must be true/false, yes/no, or 1/0",
    });
  });

  it("accepts empty string for any type", () => {
    expect(validateCustomFieldValue("text", "", null)).toEqual({ valid: true });
    expect(validateCustomFieldValue("number", "", null)).toEqual({ valid: true });
    expect(validateCustomFieldValue("date", "", null)).toEqual({ valid: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/__tests__/custom-field-validation.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement validation schemas**

```typescript
// src/lib/validation-custom-fields.ts
import { z } from "zod";

const FIELD_TYPES = ["text", "number", "date", "dropdown", "checkbox"] as const;

export const createCustomFieldSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    key: z
      .string()
      .trim()
      .min(1, "Key is required")
      .regex(/^[a-z][a-z0-9_]*$/, "Key must be lowercase letters, numbers, and underscores"),
    type: z.enum(FIELD_TYPES),
    options: z.string().trim().optional(),
    isRequired: z.boolean().default(false),
  })
  .refine(
    (data) => {
      if (data.type === "dropdown") {
        return !!data.options && data.options.trim().length > 0;
      }
      return true;
    },
    { message: "Dropdown fields must have options", path: ["options"] }
  );

export const updateCustomFieldSchema = z.object({
  name: z.string().trim().min(1, "Name is required").optional(),
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]*$/, "Key must be lowercase letters, numbers, and underscores")
    .optional(),
  type: z.enum(FIELD_TYPES).optional(),
  options: z.string().trim().optional(),
  isRequired: z.boolean().optional(),
});

export type ValidateResult =
  | { valid: true }
  | { valid: false; error: string };

export function validateCustomFieldValue(
  type: string,
  value: string,
  options: string | null
): ValidateResult {
  if (value === "") return { valid: true };

  switch (type) {
    case "text":
      return { valid: true };

    case "number": {
      const num = Number(value);
      if (isNaN(num) || !isFinite(num)) {
        return { valid: false, error: "Must be a valid number" };
      }
      return { valid: true };
    }

    case "date": {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(value)) {
        return { valid: false, error: "Must be a valid date (YYYY-MM-DD)" };
      }
      const parsed = new Date(value);
      if (isNaN(parsed.getTime())) {
        return { valid: false, error: "Must be a valid date (YYYY-MM-DD)" };
      }
      return { valid: true };
    }

    case "dropdown": {
      if (!options) return { valid: false, error: "No options defined" };
      const validOptions = options.split(",").map((o) => o.trim());
      const match = validOptions.some(
        (o) => o.toLowerCase() === value.toLowerCase()
      );
      if (!match) {
        return {
          valid: false,
          error: `Must be one of: ${validOptions.join(", ")}`,
        };
      }
      return { valid: true };
    }

    case "checkbox": {
      const valid = ["true", "false", "yes", "no", "1", "0"];
      if (!valid.includes(value.toLowerCase())) {
        return { valid: false, error: "Must be true/false, yes/no, or 1/0" };
      }
      return { valid: true };
    }

    default:
      return { valid: false, error: `Unknown field type: ${type}` };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/__tests__/custom-field-validation.test.ts
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation-custom-fields.ts src/lib/__tests__/custom-field-validation.test.ts
git commit -m "feat(phase20): add custom field validation schemas"
```

---

### Task 3: Custom Field CRUD Server Actions

**Files:**
- Create: `src/actions/custom-fields/manage.ts`
- Create: `src/actions/custom-fields/__tests__/manage.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/actions/custom-fields/__tests__/manage.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockSelect = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    insert: (...args: unknown[]) => {
      const chain = {
        values: (v: unknown) => {
          mockInsert(v);
          return { returning: () => [{ id: "cf-1", organisationId: "org-1", name: "Emergency Contact", key: "emergency_contact", type: "text", options: null, sortOrder: 0, isRequired: false, isActive: true }] };
        },
      };
      return chain;
    },
    update: () => ({
      set: (v: unknown) => {
        mockUpdate(v);
        return {
          where: () => ({
            returning: () => [{ id: "cf-1", organisationId: "org-1", name: "Updated", key: "emergency_contact", type: "text", options: null, sortOrder: 0, isRequired: false, isActive: true }],
          }),
        };
      },
    }),
    select: () => {
      const rows = mockSelect();
      return {
        from: () => ({
          where: () => ({
            orderBy: () => rows ?? [],
          }),
        }),
      };
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn().mockResolvedValue({ memberId: "m-1", role: "ADMIN" }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/audit-log", () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import {
  createCustomField,
  updateCustomField,
  toggleCustomField,
  getCustomFields,
} from "../manage";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createCustomField", () => {
  it("creates a text field", async () => {
    const result = await createCustomField({
      organisationId: "org-1",
      name: "Emergency Contact",
      key: "emergency_contact",
      type: "text",
      slug: "test-club",
    });
    expect(result.id).toBe("cf-1");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organisationId: "org-1",
        name: "Emergency Contact",
        key: "emergency_contact",
        type: "text",
      })
    );
  });

  it("rejects invalid input", async () => {
    await expect(
      createCustomField({
        organisationId: "org-1",
        name: "",
        key: "test",
        type: "text",
        slug: "test-club",
      })
    ).rejects.toThrow();
  });
});

describe("updateCustomField", () => {
  it("updates field name", async () => {
    const result = await updateCustomField({
      fieldId: "cf-1",
      organisationId: "org-1",
      name: "Updated",
      slug: "test-club",
    });
    expect(result.name).toBe("Updated");
    expect(mockUpdate).toHaveBeenCalled();
  });
});

describe("toggleCustomField", () => {
  it("deactivates a field", async () => {
    await toggleCustomField("cf-1", false, "test-club");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false })
    );
  });
});

describe("getCustomFields", () => {
  it("returns fields from db", async () => {
    mockSelect.mockReturnValue([
      { id: "cf-1", name: "Emergency Contact", key: "emergency_contact", type: "text", options: null, sortOrder: 0, isRequired: false, isActive: true },
    ]);
    const result = await getCustomFields("org-1");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Emergency Contact");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/actions/custom-fields/__tests__/manage.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement CRUD actions**

```typescript
// src/actions/custom-fields/manage.ts
"use server";

import { db } from "@/db/index";
import { customFields } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createCustomFieldSchema, updateCustomFieldSchema } from "@/lib/validation-custom-fields";
import { revalidatePath } from "next/cache";
import { getSessionMember } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit-log";

type CreateCustomFieldInput = {
  organisationId: string;
  name: string;
  key: string;
  type: string;
  options?: string;
  isRequired?: boolean;
  slug: string;
};

export async function createCustomField(input: CreateCustomFieldInput) {
  const { organisationId, slug, ...fields } = input;

  const parsed = createCustomFieldSchema.parse(fields);

  const [field] = await db
    .insert(customFields)
    .values({
      organisationId,
      name: parsed.name,
      key: parsed.key,
      type: parsed.type as "text" | "number" | "date" | "dropdown" | "checkbox",
      options: parsed.options ?? null,
      isRequired: parsed.isRequired,
    })
    .returning();

  const session = await getSessionMember(organisationId);
  if (session) {
    createAuditLog({
      organisationId,
      actorMemberId: session.memberId,
      action: "CUSTOM_FIELD_CREATED",
      entityType: "custom_field",
      entityId: field.id,
      newValue: { name: field.name, key: field.key, type: field.type },
    }).catch(console.error);
  }

  revalidatePath(`/${slug}/admin/settings`);
  return field;
}

type UpdateCustomFieldInput = {
  fieldId: string;
  organisationId: string;
  name?: string;
  key?: string;
  type?: string;
  options?: string;
  isRequired?: boolean;
  slug: string;
};

export async function updateCustomField(input: UpdateCustomFieldInput) {
  const { fieldId, organisationId, slug, ...fields } = input;

  const parsed = updateCustomFieldSchema.parse(fields);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.name !== undefined) updates.name = parsed.name;
  if (parsed.key !== undefined) updates.key = parsed.key;
  if (parsed.type !== undefined) updates.type = parsed.type;
  if (parsed.options !== undefined) updates.options = parsed.options;
  if (parsed.isRequired !== undefined) updates.isRequired = parsed.isRequired;

  const [updated] = await db
    .update(customFields)
    .set(updates)
    .where(and(eq(customFields.id, fieldId), eq(customFields.organisationId, organisationId)))
    .returning();

  if (!updated) throw new Error("Field not found");

  const session = await getSessionMember(organisationId);
  if (session) {
    createAuditLog({
      organisationId,
      actorMemberId: session.memberId,
      action: "CUSTOM_FIELD_UPDATED",
      entityType: "custom_field",
      entityId: fieldId,
      newValue: updates,
    }).catch(console.error);
  }

  revalidatePath(`/${slug}/admin/settings`);
  return updated;
}

export async function toggleCustomField(
  fieldId: string,
  isActive: boolean,
  slug: string
) {
  const [updated] = await db
    .update(customFields)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(customFields.id, fieldId))
    .returning();

  if (!updated) throw new Error("Field not found");

  revalidatePath(`/${slug}/admin/settings`);
  return updated;
}

export async function reorderCustomFields(
  organisationId: string,
  fieldIds: string[],
  slug: string
) {
  for (let i = 0; i < fieldIds.length; i++) {
    await db
      .update(customFields)
      .set({ sortOrder: i, updatedAt: new Date() })
      .where(
        and(
          eq(customFields.id, fieldIds[i]),
          eq(customFields.organisationId, organisationId)
        )
      );
  }
  revalidatePath(`/${slug}/admin/settings`);
}

export async function getCustomFields(organisationId: string) {
  return db
    .select()
    .from(customFields)
    .where(
      and(
        eq(customFields.organisationId, organisationId),
        eq(customFields.isActive, true)
      )
    )
    .orderBy(customFields.sortOrder);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/actions/custom-fields/__tests__/manage.test.ts
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/actions/custom-fields/manage.ts src/actions/custom-fields/__tests__/manage.test.ts
git commit -m "feat(phase20): add custom field CRUD server actions"
```

---

### Task 4: Custom Field Values Server Actions

**Files:**
- Create: `src/actions/custom-fields/values.ts`
- Create: `src/actions/custom-fields/__tests__/values.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/actions/custom-fields/__tests__/values.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockSelectRows: unknown[] = [];

vi.mock("@/db/index", () => ({
  db: {
    insert: () => ({
      values: (v: unknown) => {
        mockInsert(v);
        return {
          onConflictDoUpdate: () => ({
            returning: () => [{ id: "cfv-1", customFieldId: "cf-1", memberId: "m-1", value: "John's Mum" }],
          }),
        };
      },
    }),
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => mockSelectRows,
        }),
      }),
    }),
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { saveCustomFieldValues, getCustomFieldValues } from "../values";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveCustomFieldValues", () => {
  it("upserts values for a member", async () => {
    await saveCustomFieldValues({
      memberId: "m-1",
      organisationId: "org-1",
      slug: "test-club",
      values: [{ fieldId: "cf-1", value: "John's Mum" }],
    });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        customFieldId: "cf-1",
        memberId: "m-1",
        value: "John's Mum",
      })
    );
  });

  it("skips empty values array", async () => {
    await saveCustomFieldValues({
      memberId: "m-1",
      organisationId: "org-1",
      slug: "test-club",
      values: [],
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("getCustomFieldValues", () => {
  it("returns values joined with field definitions", async () => {
    mockSelectRows.push(
      {
        value: { id: "cfv-1", value: "John's Mum" },
        field: { id: "cf-1", name: "Emergency Contact", key: "emergency_contact", type: "text", options: null, isRequired: false },
      }
    );
    const result = await getCustomFieldValues("m-1", "org-1");
    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/actions/custom-fields/__tests__/values.test.ts
```

- [ ] **Step 3: Implement values actions**

```typescript
// src/actions/custom-fields/values.ts
"use server";

import { db } from "@/db/index";
import { customFields, customFieldValues } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type SaveInput = {
  memberId: string;
  organisationId: string;
  slug: string;
  values: Array<{ fieldId: string; value: string }>;
};

export async function saveCustomFieldValues(input: SaveInput) {
  const { memberId, slug, values } = input;

  for (const { fieldId, value } of values) {
    await db
      .insert(customFieldValues)
      .values({
        customFieldId: fieldId,
        memberId,
        value,
      })
      .onConflictDoUpdate({
        target: [customFieldValues.customFieldId, customFieldValues.memberId],
        set: { value, updatedAt: new Date() },
      });
  }

  if (values.length > 0) {
    revalidatePath(`/${slug}/admin/members/${memberId}`);
  }
}

export async function getCustomFieldValues(
  memberId: string,
  organisationId: string
) {
  return db
    .select({
      value: customFieldValues,
      field: {
        id: customFields.id,
        name: customFields.name,
        key: customFields.key,
        type: customFields.type,
        options: customFields.options,
        isRequired: customFields.isRequired,
        sortOrder: customFields.sortOrder,
      },
    })
    .from(customFieldValues)
    .innerJoin(customFields, eq(customFields.id, customFieldValues.customFieldId))
    .where(
      and(
        eq(customFieldValues.memberId, memberId),
        eq(customFields.organisationId, organisationId),
        eq(customFields.isActive, true)
      )
    );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/actions/custom-fields/__tests__/values.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/actions/custom-fields/values.ts src/actions/custom-fields/__tests__/values.test.ts
git commit -m "feat(phase20): add custom field values save/fetch actions"
```

---

### Task 5: Custom Field Manager UI (Settings Page)

**Files:**
- Create: `src/app/[slug]/admin/settings/custom-field-manager.tsx`
- Modify: `src/app/[slug]/admin/settings/page.tsx`

- [ ] **Step 1: Create CustomFieldManager component**

Follow the `membership-class-manager.tsx` pattern. Component receives `organisationId` and `initialFields`. Renders a list of fields with edit/toggle buttons, plus a dialog for add/edit with fields: name, key (auto-generated from name), type select, options input (shown only for dropdown), required toggle.

```typescript
// src/app/[slug]/admin/settings/custom-field-manager.tsx
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
  createCustomField,
  updateCustomField,
  toggleCustomField,
} from "@/actions/custom-fields/manage";
import { toast } from "sonner";

type CustomField = {
  id: string;
  organisationId: string;
  name: string;
  key: string;
  type: string;
  options: string | null;
  sortOrder: number;
  isRequired: boolean;
  isActive: boolean;
};

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
];

function nameToKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function CustomFieldManager({
  organisationId,
  initialFields,
}: {
  organisationId: string;
  initialFields: CustomField[];
}) {
  const params = useParams();
  const slug = params.slug as string;
  const [fields, setFields] = useState(initialFields);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomField | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedType, setSelectedType] = useState("text");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const name = form.get("name") as string;
    const key = form.get("key") as string;
    const type = form.get("type") as string;
    const options = form.get("options") as string;
    const isRequired = form.get("isRequired") === "on";

    try {
      if (editing) {
        const updated = await updateCustomField({
          fieldId: editing.id,
          organisationId,
          name,
          key,
          type,
          options: type === "dropdown" ? options : undefined,
          isRequired,
          slug,
        });
        setFields((prev) =>
          prev.map((f) => (f.id === updated.id ? { ...f, ...updated } : f))
        );
        toast.success("Field updated");
      } else {
        const created = await createCustomField({
          organisationId,
          name,
          key,
          type,
          options: type === "dropdown" ? options : undefined,
          isRequired,
          slug,
        });
        setFields((prev) => [...prev, created]);
        toast.success("Field created");
      }
      setDialogOpen(false);
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(field: CustomField) {
    try {
      await toggleCustomField(field.id, !field.isActive, slug);
      setFields((prev) =>
        prev.map((f) =>
          f.id === field.id ? { ...f, isActive: !f.isActive } : f
        )
      );
      toast.success(field.isActive ? "Field deactivated" : "Field activated");
    } catch {
      toast.error("Failed to update field");
    }
  }

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <Card key={field.id}>
          <CardContent className="flex items-center justify-between py-3 px-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{field.name}</span>
                <Badge variant="outline" className="text-xs">
                  {field.type}
                </Badge>
                {field.isRequired && (
                  <Badge variant="secondary" className="text-xs">
                    Required
                  </Badge>
                )}
                {!field.isActive && (
                  <Badge variant="outline" className="text-xs">
                    Inactive
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Key: {field.key}
                {field.options && ` · Options: ${field.options}`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(field);
                  setSelectedType(field.type);
                  setDialogOpen(true);
                }}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleToggle(field)}
              >
                {field.isActive ? "Deactivate" : "Activate"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
            setSelectedType("text");
          }
        }}
      >
        <DialogTrigger
          render={<Button variant="outline" />}
          onClick={() => {
            setEditing(null);
            setSelectedType("text");
            setDialogOpen(true);
          }}
        >
          Add Field
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit" : "New"} Custom Field
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cf-name">Name</Label>
              <Input
                id="cf-name"
                name="name"
                defaultValue={editing?.name ?? ""}
                required
                onChange={(e) => {
                  if (!editing) {
                    const keyInput = document.getElementById("cf-key") as HTMLInputElement;
                    if (keyInput) keyInput.value = nameToKey(e.target.value);
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cf-key">Key</Label>
              <Input
                id="cf-key"
                name="key"
                defaultValue={editing?.key ?? ""}
                required
                pattern="^[a-z][a-z0-9_]*$"
                title="Lowercase letters, numbers, and underscores"
              />
              <p className="text-xs text-muted-foreground">
                Used as the CSV column header
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cf-type">Type</Label>
              <select
                id="cf-type"
                name="type"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            {selectedType === "dropdown" && (
              <div className="space-y-2">
                <Label htmlFor="cf-options">Options</Label>
                <Input
                  id="cf-options"
                  name="options"
                  defaultValue={editing?.options ?? ""}
                  placeholder="Option 1, Option 2, Option 3"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated list of options
                </p>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                id="cf-required"
                name="isRequired"
                type="checkbox"
                defaultChecked={editing?.isRequired ?? false}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="cf-required">Required (soft — shows asterisk)</Label>
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

- [ ] **Step 2: Add CustomFieldManager to settings page**

In `src/app/[slug]/admin/settings/page.tsx`, add import and query for custom fields, then render the section:

Add import:
```typescript
import { CustomFieldManager } from "./custom-field-manager";
import { customFields } from "@/db/schema";
```

Add query after `categories` query:
```typescript
const orgCustomFields = await db
  .select()
  .from(customFields)
  .where(eq(customFields.organisationId, org.id))
  .orderBy(customFields.sortOrder);
```

Add section at the end of the return JSX, before the closing `</div>`:
```tsx
<Separator className="my-8" />

<h2 className="text-xl font-bold mb-4">Custom Fields</h2>
<CustomFieldManager
  organisationId={org.id}
  initialFields={orgCustomFields}
/>
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: builds without errors

- [ ] **Step 4: Commit**

```bash
git add src/app/[slug]/admin/settings/custom-field-manager.tsx src/app/[slug]/admin/settings/page.tsx
git commit -m "feat(phase20): add custom field manager UI to settings"
```

---

### Task 6: Member Profile Form — Custom Fields

**Files:**
- Modify: `src/app/[slug]/admin/members/[memberId]/member-profile-form.tsx`
- Modify: `src/app/[slug]/admin/members/[memberId]/page.tsx`
- Modify: `src/actions/members/update.ts`

- [ ] **Step 1: Update MemberProfileForm to accept and render custom fields**

Add a new prop `customFields` and `customFieldValues` to the component. After existing fields, render a "Custom Fields" section that iterates over active fields and renders the appropriate input per type.

Add types at the top of `member-profile-form.tsx`:
```typescript
type CustomFieldDef = {
  id: string;
  name: string;
  key: string;
  type: string;
  options: string | null;
  isRequired: boolean;
};

type CustomFieldValue = {
  fieldId: string;
  value: string;
};
```

Add props:
```typescript
customFields?: CustomFieldDef[];
customFieldValues?: CustomFieldValue[];
```

In `handleSubmit`, collect custom field values from the form and include them in the update call:
```typescript
const cfValues: Array<{ fieldId: string; value: string }> = [];
if (customFields) {
  for (const cf of customFields) {
    const val = cf.type === "checkbox"
      ? (form.get(`cf_${cf.id}`) ? "true" : "false")
      : (form.get(`cf_${cf.id}`) as string) || "";
    cfValues.push({ fieldId: cf.id, value: val });
  }
}

const result = await updateMember({
  // ... existing fields ...
  customFieldValues: cfValues.length > 0 ? cfValues : undefined,
});
```

Render custom fields after the Notes textarea:
```tsx
{customFields && customFields.length > 0 && (
  <>
    <div className="border-t pt-4 mt-4">
      <h3 className="text-sm font-semibold mb-3">Custom Fields</h3>
    </div>
    {customFields.map((cf) => {
      const currentValue = customFieldValues?.find(
        (v) => v.fieldId === cf.id
      )?.value ?? "";
      return (
        <div key={cf.id} className="space-y-2">
          <Label htmlFor={`cf_${cf.id}`}>
            {cf.name}
            {cf.isRequired && <span className="text-destructive"> *</span>}
          </Label>
          {cf.type === "text" && (
            <Input id={`cf_${cf.id}`} name={`cf_${cf.id}`} defaultValue={currentValue} />
          )}
          {cf.type === "number" && (
            <Input id={`cf_${cf.id}`} name={`cf_${cf.id}`} type="number" step="any" defaultValue={currentValue} />
          )}
          {cf.type === "date" && (
            <Input id={`cf_${cf.id}`} name={`cf_${cf.id}`} type="date" defaultValue={currentValue} />
          )}
          {cf.type === "dropdown" && (
            <select
              id={`cf_${cf.id}`}
              name={`cf_${cf.id}`}
              defaultValue={currentValue}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="">Select...</option>
              {cf.options?.split(",").map((opt) => (
                <option key={opt.trim()} value={opt.trim()}>
                  {opt.trim()}
                </option>
              ))}
            </select>
          )}
          {cf.type === "checkbox" && (
            <input
              id={`cf_${cf.id}`}
              name={`cf_${cf.id}`}
              type="checkbox"
              defaultChecked={currentValue === "true"}
              className="h-4 w-4 rounded border-input"
            />
          )}
        </div>
      );
    })}
  </>
)}
```

- [ ] **Step 2: Update the updateMember action to handle custom field values**

In `src/actions/members/update.ts`:

Add import:
```typescript
import { saveCustomFieldValues } from "@/actions/custom-fields/values";
```

Add `customFieldValues` to `UpdateMemberInput`:
```typescript
customFieldValues?: Array<{ fieldId: string; value: string }>;
```

After the existing update logic and audit logging, add:
```typescript
if (input.customFieldValues && input.customFieldValues.length > 0) {
  await saveCustomFieldValues({
    memberId,
    organisationId,
    slug,
    values: input.customFieldValues,
  });
}
```

- [ ] **Step 3: Update the member detail page to fetch and pass custom fields**

In `src/app/[slug]/admin/members/[memberId]/page.tsx`:

Add imports:
```typescript
import { getCustomFields } from "@/actions/custom-fields/manage";
import { getCustomFieldValues } from "@/actions/custom-fields/values";
```

After existing queries, add:
```typescript
const orgCustomFields = await getCustomFields(org.id);
const memberCustomFieldValues = await getCustomFieldValues(memberId, org.id);
```

Pass to MemberProfileForm:
```tsx
<MemberProfileForm
  member={...}
  organisationId={org.id}
  slug={slug}
  membershipClasses={classes}
  customFields={orgCustomFields.map((f) => ({
    id: f.id,
    name: f.name,
    key: f.key,
    type: f.type,
    options: f.options,
    isRequired: f.isRequired,
  }))}
  customFieldValues={memberCustomFieldValues.map((v) => ({
    fieldId: v.field.id,
    value: v.value.value,
  }))}
/>
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/[slug]/admin/members/[memberId]/member-profile-form.tsx src/app/[slug]/admin/members/[memberId]/page.tsx src/actions/members/update.ts
git commit -m "feat(phase20): render and save custom fields on member profile"
```

---

### Task 7: Member Detail — Read-Only Custom Fields Display

**Files:**
- Create: `src/app/[slug]/admin/members/[memberId]/custom-fields-section.tsx`
- Modify: `src/app/[slug]/admin/members/[memberId]/page.tsx`

- [ ] **Step 1: Create CustomFieldsSection component**

```typescript
// src/app/[slug]/admin/members/[memberId]/custom-fields-section.tsx
type CustomFieldDisplay = {
  name: string;
  type: string;
  value: string;
};

export function CustomFieldsSection({
  fields,
}: {
  fields: CustomFieldDisplay[];
}) {
  if (fields.length === 0) return null;

  function formatValue(type: string, value: string): string {
    if (!value) return "\u2014";
    if (type === "checkbox") return value === "true" ? "Yes" : "No";
    return value;
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      {fields.map((field) => (
        <div key={field.name}>
          <dt className="text-xs text-muted-foreground">{field.name}</dt>
          <dd className="text-sm">{formatValue(field.type, field.value)}</dd>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add to member detail page**

In `src/app/[slug]/admin/members/[memberId]/page.tsx`, import and render after the Profile card:

```typescript
import { CustomFieldsSection } from "./custom-fields-section";
```

Add a new Card after the Profile Card (before Family Group Card):
```tsx
{orgCustomFields.length > 0 && (
  <Card className="mb-6">
    <CardHeader>
      <CardTitle>Custom Fields</CardTitle>
    </CardHeader>
    <CardContent>
      <CustomFieldsSection
        fields={orgCustomFields.map((f) => ({
          name: f.name,
          type: f.type,
          value:
            memberCustomFieldValues.find((v) => v.field.id === f.id)?.value
              .value ?? "",
        }))}
      />
    </CardContent>
  </Card>
)}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/[slug]/admin/members/[memberId]/custom-fields-section.tsx src/app/[slug]/admin/members/[memberId]/page.tsx
git commit -m "feat(phase20): add read-only custom fields display on member detail"
```

---

### Task 8: CSV Import — Custom Field Support

**Files:**
- Modify: `src/lib/import/parse-csv.ts`
- Modify: `src/actions/members/import.ts`
- Create: `src/lib/import/__tests__/parse-csv-custom-fields.test.ts`

- [ ] **Step 1: Write failing tests for custom field CSV parsing**

```typescript
// src/lib/import/__tests__/parse-csv-custom-fields.test.ts
import { describe, it, expect } from "vitest";
import { parseCsv } from "../parse-csv";

describe("parseCsv with custom fields", () => {
  const customFieldKeys = ["emergency_contact", "dietary_requirements", "locker_number"];

  it("does not warn about columns matching custom field keys", () => {
    const csv = "first_name,last_name,email,membership_class,emergency_contact\nJohn,Doe,john@test.com,Full Member,Jane Doe";
    const result = parseCsv(csv, customFieldKeys);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]).toHaveProperty("emergency_contact", "Jane Doe");
  });

  it("still warns about truly unknown columns", () => {
    const csv = "first_name,last_name,email,membership_class,favourite_colour\nJohn,Doe,john@test.com,Full Member,Blue";
    const result = parseCsv(csv, customFieldKeys);
    expect(result.errors).toContain('Unknown column "favourite_colour" will be ignored');
  });

  it("preserves custom field values in row data", () => {
    const csv = "first_name,last_name,email,membership_class,locker_number,dietary_requirements\nJohn,Doe,john@test.com,Full Member,42,Vegan";
    const result = parseCsv(csv, customFieldKeys);
    expect(result.rows[0]).toHaveProperty("locker_number", "42");
    expect(result.rows[0]).toHaveProperty("dietary_requirements", "Vegan");
  });

  it("works without custom field keys (backwards compatible)", () => {
    const csv = "first_name,last_name,email,membership_class,emergency_contact\nJohn,Doe,john@test.com,Full Member,Jane Doe";
    const result = parseCsv(csv);
    expect(result.errors).toContain('Unknown column "emergency_contact" will be ignored');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/import/__tests__/parse-csv-custom-fields.test.ts
```

- [ ] **Step 3: Update parseCsv to accept optional custom field keys**

In `src/lib/import/parse-csv.ts`, change the function signature:

```typescript
export function parseCsv(csvText: string, customFieldKeys?: string[]): ParseResult {
```

Update the unknown header check:
```typescript
const allValidHeaders = [...VALID_HEADERS, ...(customFieldKeys ?? [])];

for (const h of headers) {
  if (!allValidHeaders.includes(h)) {
    errors.push(`Unknown column "${h}" will be ignored`);
  }
}
```

The `CsvRow` type needs to allow dynamic keys. Change to:
```typescript
export type CsvRow = {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  date_of_birth?: string;
  membership_class: string;
  member_number?: string;
  is_financial?: string;
  primary_member_email?: string;
  [key: string]: string | undefined;
};
```

- [ ] **Step 4: Update import action to save custom field values**

In `src/actions/members/import.ts`:

Add imports:
```typescript
import { customFields, customFieldValues } from "@/db/schema";
import { validateCustomFieldValue } from "@/lib/validation-custom-fields";
```

Modify `executeImport` to accept a `customFieldKeys` parameter (or fetch them):

Before the import loop, fetch custom fields:
```typescript
const orgCustomFields = await db
  .select({ id: customFields.id, key: customFields.key, type: customFields.type, options: customFields.options })
  .from(customFields)
  .where(and(eq(customFields.organisationId, organisationId), eq(customFields.isActive, true)));

const customFieldMap = new Map(orgCustomFields.map((f) => [f.key, f]));
```

Update the `parseCsv` call to pass custom field keys:
```typescript
const parsed = parseCsv(csvText, orgCustomFields.map((f) => f.key));
```

After inserting each member, save custom field values:
```typescript
// Save custom field values
for (const [cfKey, cfDef] of customFieldMap) {
  const cfValue = (row.data as Record<string, string | undefined>)[cfKey];
  if (cfValue && cfValue.trim()) {
    const validation = validateCustomFieldValue(cfDef.type, cfValue.trim(), cfDef.options);
    if (validation.valid) {
      await db.insert(customFieldValues).values({
        customFieldId: cfDef.id,
        memberId: member.id,
        value: cfValue.trim(),
      });
    }
  }
}
```

Also update `validateCsvImport` to pass custom field keys to `parseCsv`.

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/lib/import/__tests__/parse-csv-custom-fields.test.ts
npx vitest run src/lib/import/__tests__/parse-csv.test.ts
```

Expected: all pass (both new and existing tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/import/parse-csv.ts src/actions/members/import.ts src/lib/import/__tests__/parse-csv-custom-fields.test.ts
git commit -m "feat(phase20): support custom fields in CSV import"
```

---

### Task 9: CSV Export — Custom Field Columns

**Files:**
- Modify: `src/app/[slug]/admin/reports/[reportId]/page.tsx` (member-balances report)

- [ ] **Step 1: Identify how member balances report exports CSV**

The report detail page at `src/app/[slug]/admin/reports/[reportId]/page.tsx` uses `serialiseCsv` with column definitions. For the `member-balances` report, extend the column list and data rows with custom field values.

When `reportId === "member-balances"`, after fetching the report data:

1. Fetch org custom fields
2. Fetch custom field values for all members in the result set
3. Append custom field columns to the CSV column config
4. Append custom field values to each data row

Add the following logic in the member-balances section of the page:

```typescript
import { getCustomFields } from "@/actions/custom-fields/manage";
import { customFieldValues as cfvTable, customFields as cfTable } from "@/db/schema";
```

After getting member balance rows:
```typescript
const orgCustomFields = await getCustomFields(org.id);

// Build a map of memberId -> { fieldKey: value }
const memberIds = balanceData.rows.map((r) => r.memberId);
let cfValueMap = new Map<string, Record<string, string>>();

if (orgCustomFields.length > 0 && memberIds.length > 0) {
  const cfValues = await db
    .select({
      memberId: cfvTable.memberId,
      key: cfTable.key,
      type: cfTable.type,
      value: cfvTable.value,
    })
    .from(cfvTable)
    .innerJoin(cfTable, eq(cfTable.id, cfvTable.customFieldId))
    .where(
      and(
        eq(cfTable.organisationId, org.id),
        eq(cfTable.isActive, true),
        inArray(cfvTable.memberId, memberIds)
      )
    );

  for (const row of cfValues) {
    if (!cfValueMap.has(row.memberId)) cfValueMap.set(row.memberId, {});
    const formatted = row.type === "checkbox" ? (row.value === "true" ? "Yes" : "No") : row.value;
    cfValueMap.get(row.memberId)![row.key] = formatted;
  }
}
```

Extend CSV columns and data:
```typescript
const cfColumns = orgCustomFields.map((f) => ({ key: f.key, header: f.name }));
const allColumns = [...baseColumns, ...cfColumns];

const csvData = balanceData.rows.map((row) => {
  const base = { /* existing mapping */ };
  const cfValues = cfValueMap.get(row.memberId) ?? {};
  for (const cf of orgCustomFields) {
    base[cf.key] = cfValues[cf.key] ?? "";
  }
  return base;
});
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/[slug]/admin/reports/[reportId]/page.tsx
git commit -m "feat(phase20): include custom fields in member balances CSV export"
```

---

### Task 10: Update README and Roadmap

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-04-07-platform-roadmap-and-phase12-design.md`

- [ ] **Step 1: Update README completed/planned phases**

Move Phase 18 (Audit Log) and Phase 19 (GST/Tax Management) to the Completed table. Add Phase 20 (Custom Member Fields). Update the Planned section to match the current roadmap (phases 21+). Update the data model description (table count, schema file count). Update test coverage section with custom field entries.

Completed table additions:
```markdown
| 18 | Audit Log Viewer | Action/entity/date filtering, actor tracking, CSV export |
| 19 | GST/Tax Management | Configurable GST per org, tax-inclusive/exclusive pricing, BAS-ready GST report |
| 20 | Custom Member Fields | Admin-defined fields (text/number/date/dropdown/checkbox), member profile values, CSV import/export |
```

Update Planned table to match roadmap phases 21-30.

Update data model line: `### Data Model (25 tables)` → count actual tables.
Update schema file line: `schema/ # Drizzle schema (14 files, 21 tables)` → update counts.

- [ ] **Step 2: Update roadmap**

In `docs/superpowers/specs/2026-04-07-platform-roadmap-and-phase12-design.md`, move Phase 19 and Phase 20 from "High Priority (Next Up)" to the "Completed Phases" table.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/superpowers/specs/2026-04-07-platform-roadmap-and-phase12-design.md
git commit -m "docs: update README and roadmap with phases 18-20"
```

---

### Task 11: Run Full Quality Check

- [ ] **Step 1: Run lint + test + build**

```bash
npm run check
```

Expected: all pass. Fix any issues.

- [ ] **Step 2: Run E2E tests if available**

```bash
npm run test:e2e
```

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(phase20): address quality check issues"
```
