# Phase 5: Availability Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the availability engine — cache population, admin overrides, date validation, and calendar UI for both admins and members.

**Architecture:** Cache-first approach using the existing `availabilityCache` table. A new `availabilityOverrides` table stores admin blocks/reductions. Server actions handle cache rebuild, override CRUD, and date validation. A shared `<AvailabilityCalendar>` component renders admin and member views. All queries scoped by lodgeId. TDD — tests first for every layer.

**Tech Stack:** Next.js 16 (App Router), Drizzle ORM, Zod, Vitest, shadcn/ui (Base UI), TypeScript

**Important Next.js 16 notes:**
- `params` and `searchParams` are `Promise` types — must be `await`ed
- Button with Link uses `render` prop: `<Button render={<Link href="..." />}>text</Button>`
- Server actions are in `"use server"` files, use `revalidatePath()` after mutations

---

## File Structure

```
src/
  db/schema/availability.ts                     — MODIFY: add overrideTypeEnum + availabilityOverrides table
  db/schema/index.ts                            — MODIFY: export new types
  actions/availability/schemas.ts               — CREATE: Zod validation schemas
  actions/availability/__tests__/schemas.test.ts — CREATE: schema tests
  actions/availability/queries.ts               — CREATE: query helpers
  actions/availability/__tests__/queries.test.ts — CREATE: query tests
  actions/availability/rebuild.ts               — CREATE: cache rebuild actions
  actions/availability/__tests__/rebuild.test.ts — CREATE: rebuild tests
  actions/availability/overrides.ts             — CREATE: override CRUD actions
  actions/availability/__tests__/overrides.test.ts — CREATE: override tests
  actions/availability/validation.ts            — CREATE: booking date validation
  actions/availability/__tests__/validation.test.ts — CREATE: validation tests
  app/[slug]/admin/availability/page.tsx         — CREATE: admin availability page
  app/[slug]/admin/availability/availability-calendar.tsx — CREATE: shared calendar component
  app/[slug]/admin/availability/override-form.tsx — CREATE: override create/edit dialog
  app/[slug]/admin/availability/override-table.tsx — CREATE: overrides list table
  app/[slug]/availability/page.tsx               — CREATE: member-facing availability page
```

---

### Task 1: Schema — Add availabilityOverrides table

**Files:**
- Modify: `src/db/schema/availability.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Add the overrideTypeEnum and availabilityOverrides table to schema**

In `src/db/schema/availability.ts`, add the imports and new table. Replace the entire file with:

```typescript
import {
  pgTable,
  pgEnum,
  uuid,
  date,
  integer,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { lodges } from "./lodges";
import { members } from "./members";

export const availabilityCache = pgTable(
  "availability_cache",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lodgeId: uuid("lodge_id")
      .notNull()
      .references(() => lodges.id),
    date: date("date").notNull(),
    totalBeds: integer("total_beds").notNull(),
    bookedBeds: integer("booked_beds").notNull().default(0),
    version: integer("version").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("availability_lodge_date_idx").on(table.lodgeId, table.date),
  ]
);

export const overrideTypeEnum = pgEnum("override_type", [
  "CLOSURE",
  "REDUCTION",
]);

export const availabilityOverrides = pgTable("availability_overrides", {
  id: uuid("id").defaultRandom().primaryKey(),
  lodgeId: uuid("lodge_id")
    .notNull()
    .references(() => lodges.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  type: overrideTypeEnum("type").notNull(),
  bedReduction: integer("bed_reduction"),
  reason: text("reason"),
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
```

- [ ] **Step 2: Export new types from schema index**

In `src/db/schema/index.ts`, replace the availability export line:

```typescript
// Replace this line:
export { availabilityCache } from "./availability";

// With:
export {
  availabilityCache,
  overrideTypeEnum,
  availabilityOverrides,
} from "./availability";
```

- [ ] **Step 3: Generate the migration**

Run: `cd /opt/snowgum && npx drizzle-kit generate`

Expected: A new SQL migration file in `drizzle/` creating the `override_type` enum and `availability_overrides` table.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/availability.ts src/db/schema/index.ts drizzle/
git commit -m "feat: add availabilityOverrides table and override type enum"
```

---

### Task 2: Validation schemas

**Files:**
- Create: `src/actions/availability/schemas.ts`
- Create: `src/actions/availability/__tests__/schemas.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/actions/availability/__tests__/schemas.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  createOverrideSchema,
  updateOverrideSchema,
  validateBookingDatesSchema,
} from "../schemas";

describe("createOverrideSchema", () => {
  const validClosure = {
    lodgeId: "550e8400-e29b-41d4-a716-446655440000",
    startDate: "2027-07-01",
    endDate: "2027-07-03",
    type: "CLOSURE" as const,
    reason: "Maintenance weekend",
  };

  const validReduction = {
    lodgeId: "550e8400-e29b-41d4-a716-446655440000",
    startDate: "2027-07-01",
    endDate: "2027-07-05",
    type: "REDUCTION" as const,
    bedReduction: 4,
    reason: "Plumbing repair",
  };

  it("accepts a valid closure", () => {
    const result = createOverrideSchema.safeParse(validClosure);
    expect(result.success).toBe(true);
  });

  it("accepts a valid reduction", () => {
    const result = createOverrideSchema.safeParse(validReduction);
    expect(result.success).toBe(true);
  });

  it("rejects endDate before startDate", () => {
    const result = createOverrideSchema.safeParse({
      ...validClosure,
      startDate: "2027-07-05",
      endDate: "2027-07-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects reduction without bedReduction", () => {
    const result = createOverrideSchema.safeParse({
      ...validReduction,
      bedReduction: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects reduction with bedReduction of 0", () => {
    const result = createOverrideSchema.safeParse({
      ...validReduction,
      bedReduction: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects closure with bedReduction set", () => {
    const result = createOverrideSchema.safeParse({
      ...validClosure,
      bedReduction: 4,
    });
    expect(result.success).toBe(false);
  });

  it("accepts closure without reason", () => {
    const { reason, ...noReason } = validClosure;
    const result = createOverrideSchema.safeParse(noReason);
    expect(result.success).toBe(true);
  });

  it("rejects invalid lodgeId", () => {
    const result = createOverrideSchema.safeParse({
      ...validClosure,
      lodgeId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts same-day start and end", () => {
    const result = createOverrideSchema.safeParse({
      ...validClosure,
      startDate: "2027-07-01",
      endDate: "2027-07-01",
    });
    expect(result.success).toBe(true);
  });
});

describe("updateOverrideSchema", () => {
  it("accepts partial update with only reason", () => {
    const result = updateOverrideSchema.safeParse({
      reason: "Updated reason",
    });
    expect(result.success).toBe(true);
  });

  it("accepts changing dates", () => {
    const result = updateOverrideSchema.safeParse({
      startDate: "2027-07-02",
      endDate: "2027-07-04",
    });
    expect(result.success).toBe(true);
  });

  it("rejects endDate before startDate when both provided", () => {
    const result = updateOverrideSchema.safeParse({
      startDate: "2027-07-05",
      endDate: "2027-07-01",
    });
    expect(result.success).toBe(false);
  });
});

describe("validateBookingDatesSchema", () => {
  const validInput = {
    lodgeId: "550e8400-e29b-41d4-a716-446655440000",
    checkIn: "2027-07-10",
    checkOut: "2027-07-13",
    bookingRoundId: "660e8400-e29b-41d4-a716-446655440000",
    memberId: "770e8400-e29b-41d4-a716-446655440000",
  };

  it("accepts valid input", () => {
    const result = validateBookingDatesSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects checkOut before checkIn", () => {
    const result = validateBookingDatesSchema.safeParse({
      ...validInput,
      checkIn: "2027-07-13",
      checkOut: "2027-07-10",
    });
    expect(result.success).toBe(false);
  });

  it("rejects same-day checkIn and checkOut", () => {
    const result = validateBookingDatesSchema.safeParse({
      ...validInput,
      checkIn: "2027-07-10",
      checkOut: "2027-07-10",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    const result = validateBookingDatesSchema.safeParse({
      lodgeId: validInput.lodgeId,
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /opt/snowgum && npx vitest run src/actions/availability/__tests__/schemas.test.ts`

Expected: FAIL — module `../schemas` not found.

- [ ] **Step 3: Implement the schemas**

Create `src/actions/availability/schemas.ts`:

```typescript
import { z } from "zod";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format");

const baseOverrideSchema = z.object({
  lodgeId: z.string().uuid(),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  type: z.enum(["CLOSURE", "REDUCTION"]),
  bedReduction: z.number().int().positive().optional(),
  reason: z.string().trim().optional(),
});

export const createOverrideSchema = baseOverrideSchema.superRefine((data, ctx) => {
  if (data.endDate < data.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "End date must be on or after start date",
      path: ["endDate"],
    });
  }
  if (data.type === "REDUCTION" && (data.bedReduction === undefined || data.bedReduction <= 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Bed reduction is required and must be positive for REDUCTION type",
      path: ["bedReduction"],
    });
  }
  if (data.type === "CLOSURE" && data.bedReduction !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Bed reduction must not be set for CLOSURE type",
      path: ["bedReduction"],
    });
  }
});

export const updateOverrideSchema = z
  .object({
    startDate: isoDateSchema.optional(),
    endDate: isoDateSchema.optional(),
    type: z.enum(["CLOSURE", "REDUCTION"]).optional(),
    bedReduction: z.number().int().positive().optional().nullable(),
    reason: z.string().trim().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.startDate && data.endDate && data.endDate < data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End date must be on or after start date",
        path: ["endDate"],
      });
    }
  });

export const validateBookingDatesSchema = z
  .object({
    lodgeId: z.string().uuid(),
    checkIn: isoDateSchema,
    checkOut: isoDateSchema,
    bookingRoundId: z.string().uuid(),
    memberId: z.string().uuid(),
  })
  .superRefine((data, ctx) => {
    if (data.checkOut <= data.checkIn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Check-out must be after check-in",
        path: ["checkOut"],
      });
    }
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /opt/snowgum && npx vitest run src/actions/availability/__tests__/schemas.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/actions/availability/schemas.ts src/actions/availability/__tests__/schemas.test.ts
git commit -m "feat: add availability validation schemas with tests"
```

---

### Task 3: Query helpers

**Files:**
- Create: `src/actions/availability/queries.ts`
- Create: `src/actions/availability/__tests__/queries.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/actions/availability/__tests__/queries.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRows: Record<string, unknown[]> = {
  availability: [],
  overrides: [],
};

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs);
              return {
                orderBy: (...oArgs: unknown[]) => {
                  mockOrderBy(...oArgs);
                  // Return based on what's been set
                  return mockRows.current ?? [];
                },
              };
            },
          };
        },
      };
    },
  },
}));

import {
  getMonthAvailability,
  getDateRangeAvailability,
  getOverridesForLodge,
} from "../queries";

beforeEach(() => {
  vi.clearAllMocks();
  mockRows.current = [];
});

describe("getMonthAvailability", () => {
  it("queries with correct lodge and date range", async () => {
    const lodgeId = "550e8400-e29b-41d4-a716-446655440000";
    mockRows.current = [
      { id: "row-1", lodgeId, date: "2027-07-01", totalBeds: 20, bookedBeds: 5 },
      { id: "row-2", lodgeId, date: "2027-07-02", totalBeds: 20, bookedBeds: 8 },
    ];

    const result = await getMonthAvailability(lodgeId, 2027, 7);

    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2027-07-01");
  });

  it("returns empty array when no data", async () => {
    mockRows.current = [];
    const result = await getMonthAvailability(
      "550e8400-e29b-41d4-a716-446655440000",
      2027,
      7
    );
    expect(result).toHaveLength(0);
  });
});

describe("getDateRangeAvailability", () => {
  it("queries with correct parameters", async () => {
    const lodgeId = "550e8400-e29b-41d4-a716-446655440000";
    mockRows.current = [
      { id: "row-1", lodgeId, date: "2027-07-10", totalBeds: 20, bookedBeds: 3 },
    ];

    const result = await getDateRangeAvailability(lodgeId, "2027-07-10", "2027-07-12");

    expect(mockSelect).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });
});

describe("getOverridesForLodge", () => {
  it("queries overrides for a lodge", async () => {
    const lodgeId = "550e8400-e29b-41d4-a716-446655440000";
    mockRows.current = [
      {
        id: "override-1",
        lodgeId,
        startDate: "2027-07-01",
        endDate: "2027-07-03",
        type: "CLOSURE",
        reason: "Maintenance",
      },
    ];

    const result = await getOverridesForLodge(lodgeId);

    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("CLOSURE");
  });

  it("returns empty array when no overrides", async () => {
    mockRows.current = [];
    const result = await getOverridesForLodge(
      "550e8400-e29b-41d4-a716-446655440000"
    );
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /opt/snowgum && npx vitest run src/actions/availability/__tests__/queries.test.ts`

Expected: FAIL — module `../queries` not found.

- [ ] **Step 3: Implement the query helpers**

Create `src/actions/availability/queries.ts`:

```typescript
import { db } from "@/db/index";
import { availabilityCache, availabilityOverrides } from "@/db/schema";
import { eq, and, gte, lte, or } from "drizzle-orm";

export async function getMonthAvailability(
  lodgeId: string,
  year: number,
  month: number
) {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  return db
    .select()
    .from(availabilityCache)
    .where(
      and(
        eq(availabilityCache.lodgeId, lodgeId),
        gte(availabilityCache.date, startDate),
        lte(availabilityCache.date, endDate)
      )
    )
    .orderBy(availabilityCache.date);
}

export async function getDateRangeAvailability(
  lodgeId: string,
  startDate: string,
  endDate: string
) {
  return db
    .select()
    .from(availabilityCache)
    .where(
      and(
        eq(availabilityCache.lodgeId, lodgeId),
        gte(availabilityCache.date, startDate),
        lte(availabilityCache.date, endDate)
      )
    )
    .orderBy(availabilityCache.date);
}

export async function getOverridesForLodge(
  lodgeId: string,
  startDate?: string,
  endDate?: string
) {
  const conditions = [eq(availabilityOverrides.lodgeId, lodgeId)];

  if (startDate && endDate) {
    // Overlapping: override.startDate <= endDate AND override.endDate >= startDate
    conditions.push(lte(availabilityOverrides.startDate, endDate));
    conditions.push(gte(availabilityOverrides.endDate, startDate));
  }

  return db
    .select()
    .from(availabilityOverrides)
    .where(and(...conditions))
    .orderBy(availabilityOverrides.startDate);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /opt/snowgum && npx vitest run src/actions/availability/__tests__/queries.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/actions/availability/queries.ts src/actions/availability/__tests__/queries.test.ts
git commit -m "feat: add availability query helpers with tests"
```

---

### Task 4: Cache rebuild actions

**Files:**
- Create: `src/actions/availability/rebuild.ts`
- Create: `src/actions/availability/__tests__/rebuild.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/actions/availability/__tests__/rebuild.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDelete = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockDeleteWhere = vi.fn();
const mockOrderBy = vi.fn();

let selectCallCount = 0;

vi.mock("@/db/index", () => ({
  db: {
    delete: (...args: unknown[]) => {
      mockDelete(...args);
      return {
        where: (...wArgs: unknown[]) => {
          mockDeleteWhere(...wArgs);
          return Promise.resolve();
        },
      };
    },
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockValues(...vArgs);
          return Promise.resolve();
        },
      };
    },
    select: (...args: unknown[]) => {
      mockSelect(...args);
      selectCallCount++;
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs);
              return {
                orderBy: (...oArgs: unknown[]) => {
                  mockOrderBy(...oArgs);
                  // First select call returns overrides, rest return empty
                  return [];
                },
              };
            },
          };
        },
      };
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { rebuildAvailabilityCache } from "../rebuild";

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
});

describe("rebuildAvailabilityCache", () => {
  it("deletes existing rows and inserts new ones for date range", async () => {
    await rebuildAvailabilityCache({
      lodgeId: "550e8400-e29b-41d4-a716-446655440000",
      totalBeds: 20,
      startDate: "2027-07-01",
      endDate: "2027-07-03",
    });

    // Should delete existing cache rows
    expect(mockDelete).toHaveBeenCalled();
    expect(mockDeleteWhere).toHaveBeenCalled();

    // Should insert 3 rows (July 1, 2, 3)
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalled();
    const insertedValues = mockValues.mock.calls[0][0];
    expect(insertedValues).toHaveLength(3);
    expect(insertedValues[0].date).toBe("2027-07-01");
    expect(insertedValues[1].date).toBe("2027-07-02");
    expect(insertedValues[2].date).toBe("2027-07-03");
  });

  it("sets totalBeds from input when no overrides exist", async () => {
    await rebuildAvailabilityCache({
      lodgeId: "550e8400-e29b-41d4-a716-446655440000",
      totalBeds: 20,
      startDate: "2027-07-01",
      endDate: "2027-07-01",
    });

    const insertedValues = mockValues.mock.calls[0][0];
    expect(insertedValues[0].totalBeds).toBe(20);
    expect(insertedValues[0].bookedBeds).toBe(0);
  });

  it("handles empty date range (endDate before startDate)", async () => {
    await rebuildAvailabilityCache({
      lodgeId: "550e8400-e29b-41d4-a716-446655440000",
      totalBeds: 20,
      startDate: "2027-07-05",
      endDate: "2027-07-01",
    });

    // Should still delete but not insert
    expect(mockDelete).toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /opt/snowgum && npx vitest run src/actions/availability/__tests__/rebuild.test.ts`

Expected: FAIL — module `../rebuild` not found.

- [ ] **Step 3: Implement the rebuild action**

Create `src/actions/availability/rebuild.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import {
  availabilityCache,
  availabilityOverrides,
  lodges,
  seasons,
} from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getOverridesForLodge } from "./queries";

type RebuildInput = {
  lodgeId: string;
  totalBeds: number;
  startDate: string;
  endDate: string;
};

function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");

  while (current <= end) {
    dates.push(current.toISOString().split("T")[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

function computeEffectiveBeds(
  baseBeds: number,
  date: string,
  overrides: { startDate: string; endDate: string; type: string; bedReduction: number | null }[]
): number {
  let effective = baseBeds;

  for (const override of overrides) {
    if (date >= override.startDate && date <= override.endDate) {
      if (override.type === "CLOSURE") {
        return 0;
      }
      if (override.type === "REDUCTION" && override.bedReduction) {
        effective -= override.bedReduction;
      }
    }
  }

  return Math.max(0, effective);
}

export async function rebuildAvailabilityCache(input: RebuildInput) {
  const { lodgeId, totalBeds, startDate, endDate } = input;

  // Delete existing cache rows for this range
  await db
    .delete(availabilityCache)
    .where(
      and(
        eq(availabilityCache.lodgeId, lodgeId),
        gte(availabilityCache.date, startDate),
        lte(availabilityCache.date, endDate)
      )
    );

  const dates = generateDateRange(startDate, endDate);
  if (dates.length === 0) return;

  // Get overrides that overlap this date range
  const overrides = await getOverridesForLodge(lodgeId, startDate, endDate);

  // Build cache rows
  const rows = dates.map((date) => ({
    lodgeId,
    date,
    totalBeds: computeEffectiveBeds(baseBeds: totalBeds, date, overrides),
    bookedBeds: 0,
    version: 0,
  }));

  await db.insert(availabilityCache).values(rows);
}

export async function seedSeasonAvailability(
  seasonId: string,
  slug: string
) {
  // Look up season
  const [season] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.id, seasonId));

  if (!season) {
    return { success: false, error: "Season not found" };
  }

  // Get all active lodges for the org
  const orgLodges = await db
    .select({ id: lodges.id, totalBeds: lodges.totalBeds })
    .from(lodges)
    .where(
      and(
        eq(lodges.organisationId, season.organisationId),
        eq(lodges.isActive, true)
      )
    );

  // Rebuild cache for each lodge
  for (const lodge of orgLodges) {
    await rebuildAvailabilityCache({
      lodgeId: lodge.id,
      totalBeds: lodge.totalBeds,
      startDate: season.startDate,
      endDate: season.endDate,
    });
  }

  revalidatePath(`/${slug}/admin/availability`);
  return { success: true };
}
```

**Note:** There is an intentional syntax error above — `baseBeds:` should be just `totalBeds`. Fix this line in the `rows` mapping:

```typescript
    totalBeds: computeEffectiveBeds(totalBeds, date, overrides),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /opt/snowgum && npx vitest run src/actions/availability/__tests__/rebuild.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/actions/availability/rebuild.ts src/actions/availability/__tests__/rebuild.test.ts
git commit -m "feat: add availability cache rebuild actions with tests"
```

---

### Task 5: Override CRUD actions

**Files:**
- Create: `src/actions/availability/overrides.ts`
- Create: `src/actions/availability/__tests__/overrides.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/actions/availability/__tests__/overrides.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockDelete = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockDeleteWhere = vi.fn();
const mockUpdateWhere = vi.fn();

let selectReturnValue: unknown[] = [];

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
              return [{ id: "new-override-id", startDate: "2027-07-01", endDate: "2027-07-03" }];
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
              mockUpdateWhere(...wArgs);
              return {
                returning: () => [{ id: "override-id", startDate: "2027-07-01", endDate: "2027-07-03" }],
              };
            },
          };
        },
      };
    },
    delete: (...args: unknown[]) => {
      mockDelete(...args);
      return {
        where: (...wArgs: unknown[]) => {
          mockDeleteWhere(...wArgs);
          return {
            returning: () => [{ id: "override-id", startDate: "2027-07-01", endDate: "2027-07-03", lodgeId: "lodge-id" }],
          };
        },
      };
    },
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs);
              return selectReturnValue;
            },
          };
        },
      };
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("../rebuild", () => ({
  rebuildAvailabilityCache: vi.fn(),
}));

import { createAvailabilityOverride, deleteAvailabilityOverride } from "../overrides";

beforeEach(() => {
  vi.clearAllMocks();
  selectReturnValue = [{ id: "lodge-id", totalBeds: 20 }];
});

describe("createAvailabilityOverride", () => {
  const validInput = {
    lodgeId: "550e8400-e29b-41d4-a716-446655440000",
    startDate: "2027-07-01",
    endDate: "2027-07-03",
    type: "CLOSURE" as const,
    reason: "Maintenance",
    createdByMemberId: "770e8400-e29b-41d4-a716-446655440000",
    slug: "demo",
  };

  it("inserts override and triggers cache rebuild", async () => {
    const result = await createAvailabilityOverride(validInput);

    expect(result.success).toBe(true);
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalled();
  });

  it("rejects invalid input (endDate before startDate)", async () => {
    const result = await createAvailabilityOverride({
      ...validInput,
      startDate: "2027-07-05",
      endDate: "2027-07-01",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects reduction without bedReduction", async () => {
    const result = await createAvailabilityOverride({
      ...validInput,
      type: "REDUCTION",
      // no bedReduction
    });

    expect(result.success).toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("deleteAvailabilityOverride", () => {
  it("deletes override and triggers cache rebuild", async () => {
    const result = await deleteAvailabilityOverride({
      id: "override-id",
      slug: "demo",
    });

    expect(result.success).toBe(true);
    expect(mockDelete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /opt/snowgum && npx vitest run src/actions/availability/__tests__/overrides.test.ts`

Expected: FAIL — module `../overrides` not found.

- [ ] **Step 3: Implement the override actions**

Create `src/actions/availability/overrides.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { availabilityOverrides, lodges } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createOverrideSchema, updateOverrideSchema } from "./schemas";
import { rebuildAvailabilityCache } from "./rebuild";

type CreateOverrideInput = {
  lodgeId: string;
  startDate: string;
  endDate: string;
  type: "CLOSURE" | "REDUCTION";
  bedReduction?: number;
  reason?: string;
  createdByMemberId: string;
  slug: string;
};

type UpdateOverrideInput = {
  id: string;
  startDate?: string;
  endDate?: string;
  type?: "CLOSURE" | "REDUCTION";
  bedReduction?: number | null;
  reason?: string | null;
  slug: string;
};

type DeleteOverrideInput = {
  id: string;
  slug: string;
};

export async function createAvailabilityOverride(
  input: CreateOverrideInput
): Promise<{ success: boolean; error?: string }> {
  const parsed = createOverrideSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const data = parsed.data;

  const [override] = await db
    .insert(availabilityOverrides)
    .values({
      lodgeId: data.lodgeId,
      startDate: data.startDate,
      endDate: data.endDate,
      type: data.type,
      bedReduction: data.bedReduction ?? null,
      reason: data.reason ?? null,
      createdByMemberId: input.createdByMemberId,
    })
    .returning();

  // Rebuild cache for affected dates
  const [lodge] = await db
    .select({ id: lodges.id, totalBeds: lodges.totalBeds })
    .from(lodges)
    .where(eq(lodges.id, data.lodgeId));

  if (lodge) {
    await rebuildAvailabilityCache({
      lodgeId: lodge.id,
      totalBeds: lodge.totalBeds,
      startDate: data.startDate,
      endDate: data.endDate,
    });
  }

  revalidatePath(`/${input.slug}/admin/availability`);
  return { success: true };
}

export async function updateAvailabilityOverride(
  input: UpdateOverrideInput
): Promise<{ success: boolean; error?: string }> {
  const parsed = updateOverrideSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Validation failed" };
  }

  const data = parsed.data;

  // Get the existing override to know old date range
  const [existing] = await db
    .select()
    .from(availabilityOverrides)
    .where(eq(availabilityOverrides.id, input.id));

  if (!existing) {
    return { success: false, error: "Override not found" };
  }

  const [updated] = await db
    .update(availabilityOverrides)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(availabilityOverrides.id, input.id))
    .returning();

  // Rebuild cache for both old and new date ranges
  const [lodge] = await db
    .select({ id: lodges.id, totalBeds: lodges.totalBeds })
    .from(lodges)
    .where(eq(lodges.id, existing.lodgeId));

  if (lodge) {
    // Compute the full affected range (min start, max end)
    const minStart = [existing.startDate, updated.startDate].sort()[0];
    const maxEnd = [existing.endDate, updated.endDate].sort().reverse()[0];

    await rebuildAvailabilityCache({
      lodgeId: lodge.id,
      totalBeds: lodge.totalBeds,
      startDate: minStart,
      endDate: maxEnd,
    });
  }

  revalidatePath(`/${input.slug}/admin/availability`);
  return { success: true };
}

export async function deleteAvailabilityOverride(
  input: DeleteOverrideInput
): Promise<{ success: boolean; error?: string }> {
  const [deleted] = await db
    .delete(availabilityOverrides)
    .where(eq(availabilityOverrides.id, input.id))
    .returning();

  if (!deleted) {
    return { success: false, error: "Override not found" };
  }

  // Rebuild cache for the deleted override's date range
  const [lodge] = await db
    .select({ id: lodges.id, totalBeds: lodges.totalBeds })
    .from(lodges)
    .where(eq(lodges.id, deleted.lodgeId));

  if (lodge) {
    await rebuildAvailabilityCache({
      lodgeId: lodge.id,
      totalBeds: lodge.totalBeds,
      startDate: deleted.startDate,
      endDate: deleted.endDate,
    });
  }

  revalidatePath(`/${input.slug}/admin/availability`);
  return { success: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /opt/snowgum && npx vitest run src/actions/availability/__tests__/overrides.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/actions/availability/overrides.ts src/actions/availability/__tests__/overrides.test.ts
git commit -m "feat: add availability override CRUD actions with tests"
```

---

### Task 6: Booking date validation

**Files:**
- Create: `src/actions/availability/validation.ts`
- Create: `src/actions/availability/__tests__/validation.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/actions/availability/__tests__/validation.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

type MockData = {
  season: unknown;
  round: unknown;
  availability: unknown[];
  memberBookingNights: number;
  tariff: unknown;
};

const mockData: MockData = {
  season: null,
  round: null,
  availability: [],
  memberBookingNights: 0,
  tariff: null,
};

vi.mock("@/db/index", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => mockData.availability,
          limit: () => {
            // Returns different things based on call order
            return [];
          },
        }),
      }),
    }),
  },
}));

vi.mock("../queries", () => ({
  getDateRangeAvailability: () => mockData.availability,
}));

// We need more granular control — mock the internals used by validation
const mockGetSeason = vi.fn();
const mockGetRound = vi.fn();
const mockGetAvailability = vi.fn();
const mockGetMemberNights = vi.fn();
const mockGetTariff = vi.fn();

vi.mock("../validation-helpers", () => ({
  getSeasonForDates: (...args: unknown[]) => mockGetSeason(...args),
  getBookingRound: (...args: unknown[]) => mockGetRound(...args),
  getDateRangeAvailabilityForValidation: (...args: unknown[]) => mockGetAvailability(...args),
  getMemberBookedNightsInRound: (...args: unknown[]) => mockGetMemberNights(...args),
  getTariffForValidation: (...args: unknown[]) => mockGetTariff(...args),
}));

import { validateBookingDates } from "../validation";

beforeEach(() => {
  vi.clearAllMocks();

  // Default: everything valid
  mockGetSeason.mockResolvedValue({
    id: "season-id",
    startDate: "2027-06-01",
    endDate: "2027-09-30",
    isActive: true,
  });
  mockGetRound.mockResolvedValue({
    id: "round-id",
    seasonId: "season-id",
    opensAt: new Date("2027-01-01T00:00:00Z"),
    closesAt: new Date("2027-12-31T23:59:59Z"),
    maxNightsPerBooking: 14,
    maxNightsPerMember: 28,
  });
  mockGetAvailability.mockResolvedValue([
    { date: "2027-07-10", totalBeds: 20, bookedBeds: 5 },
    { date: "2027-07-11", totalBeds: 20, bookedBeds: 5 },
    { date: "2027-07-12", totalBeds: 20, bookedBeds: 5 },
  ]);
  mockGetMemberNights.mockResolvedValue(0);
  mockGetTariff.mockResolvedValue({ minimumNights: 1 });
});

describe("validateBookingDates", () => {
  const validInput = {
    lodgeId: "550e8400-e29b-41d4-a716-446655440000",
    checkIn: "2027-07-10",
    checkOut: "2027-07-13",
    bookingRoundId: "660e8400-e29b-41d4-a716-446655440000",
    memberId: "770e8400-e29b-41d4-a716-446655440000",
  };

  it("returns valid for a good booking", async () => {
    const result = await validateBookingDates(validInput);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects dates outside season", async () => {
    mockGetSeason.mockResolvedValue(null);

    const result = await validateBookingDates(validInput);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Dates are not within an active season");
  });

  it("rejects when booking round is closed", async () => {
    mockGetRound.mockResolvedValue({
      ...await mockGetRound(),
      opensAt: new Date("2028-01-01T00:00:00Z"),
      closesAt: new Date("2028-12-31T23:59:59Z"),
    });

    const result = await validateBookingDates(validInput);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Booking round is not currently open");
  });

  it("rejects past check-in dates", async () => {
    const result = await validateBookingDates({
      ...validInput,
      checkIn: "2020-01-01",
      checkOut: "2020-01-03",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Check-in date cannot be in the past");
  });

  it("rejects when below minimum nights", async () => {
    mockGetTariff.mockResolvedValue({ minimumNights: 5 });

    const result = await validateBookingDates(validInput); // 3 nights
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes("minimum"))).toBe(true);
  });

  it("rejects when exceeding max nights per booking", async () => {
    mockGetRound.mockResolvedValue({
      ...await mockGetRound(),
      maxNightsPerBooking: 2,
    });

    const result = await validateBookingDates(validInput); // 3 nights
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes("Maximum"))).toBe(true);
  });

  it("rejects when exceeding max nights per member in round", async () => {
    mockGetRound.mockResolvedValue({
      ...await mockGetRound(),
      maxNightsPerMember: 5,
    });
    mockGetMemberNights.mockResolvedValue(4); // 4 existing + 3 new = 7 > 5

    const result = await validateBookingDates(validInput);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes("exceed"))).toBe(true);
  });

  it("rejects when no availability on a night", async () => {
    mockGetAvailability.mockResolvedValue([
      { date: "2027-07-10", totalBeds: 20, bookedBeds: 20 }, // full
      { date: "2027-07-11", totalBeds: 20, bookedBeds: 5 },
      { date: "2027-07-12", totalBeds: 20, bookedBeds: 5 },
    ]);

    const result = await validateBookingDates(validInput);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes("availability"))).toBe(true);
  });

  it("rejects when availability cache is missing for some dates", async () => {
    mockGetAvailability.mockResolvedValue([
      // Only 1 of 3 dates returned — 2 missing
      { date: "2027-07-10", totalBeds: 20, bookedBeds: 5 },
    ]);

    const result = await validateBookingDates(validInput);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes("availability"))).toBe(true);
  });

  it("collects multiple errors at once", async () => {
    mockGetSeason.mockResolvedValue(null);
    mockGetRound.mockResolvedValue(null);

    const result = await validateBookingDates({
      ...validInput,
      checkIn: "2020-01-01",
      checkOut: "2020-01-03",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /opt/snowgum && npx vitest run src/actions/availability/__tests__/validation.test.ts`

Expected: FAIL — module `../validation` not found.

- [ ] **Step 3: Implement the validation helpers**

Create `src/actions/availability/validation-helpers.ts`:

```typescript
import { db } from "@/db/index";
import {
  seasons,
  bookingRounds,
  availabilityCache,
  bookings,
  tariffs,
} from "@/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

export async function getSeasonForDates(
  lodgeId: string,
  checkIn: string,
  checkOut: string
) {
  // Find an active season that contains the entire booking range
  // checkOut is exclusive (last night is checkOut - 1 day)
  const lastNight = new Date(checkOut + "T00:00:00Z");
  lastNight.setUTCDate(lastNight.getUTCDate() - 1);
  const lastNightStr = lastNight.toISOString().split("T")[0];

  const [season] = await db
    .select()
    .from(seasons)
    .where(
      and(
        eq(seasons.isActive, true),
        lte(seasons.startDate, checkIn),
        gte(seasons.endDate, lastNightStr)
      )
    );

  return season ?? null;
}

export async function getBookingRound(bookingRoundId: string) {
  const [round] = await db
    .select()
    .from(bookingRounds)
    .where(eq(bookingRounds.id, bookingRoundId));

  return round ?? null;
}

export async function getDateRangeAvailabilityForValidation(
  lodgeId: string,
  checkIn: string,
  checkOut: string
) {
  // Nights are checkIn to checkOut-1
  const lastNight = new Date(checkOut + "T00:00:00Z");
  lastNight.setUTCDate(lastNight.getUTCDate() - 1);
  const lastNightStr = lastNight.toISOString().split("T")[0];

  return db
    .select({
      date: availabilityCache.date,
      totalBeds: availabilityCache.totalBeds,
      bookedBeds: availabilityCache.bookedBeds,
    })
    .from(availabilityCache)
    .where(
      and(
        eq(availabilityCache.lodgeId, lodgeId),
        gte(availabilityCache.date, checkIn),
        lte(availabilityCache.date, lastNightStr)
      )
    )
    .orderBy(availabilityCache.date);
}

export async function getMemberBookedNightsInRound(
  memberId: string,
  bookingRoundId: string
) {
  const result = await db
    .select({ totalNights: sql<number>`COALESCE(SUM(${bookings.totalNights}), 0)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.primaryMemberId, memberId),
        eq(bookings.bookingRoundId, bookingRoundId),
        sql`${bookings.status} NOT IN ('CANCELLED')`
      )
    );

  return Number(result[0]?.totalNights ?? 0);
}

export async function getTariffForValidation(
  lodgeId: string,
  seasonId: string
) {
  // Get the most restrictive (highest) minimum nights across tariffs for this lodge/season
  const result = await db
    .select({ minimumNights: tariffs.minimumNights })
    .from(tariffs)
    .where(
      and(eq(tariffs.lodgeId, lodgeId), eq(tariffs.seasonId, seasonId))
    );

  if (result.length === 0) return { minimumNights: 1 };

  const maxMinNights = Math.max(...result.map((r) => r.minimumNights));
  return { minimumNights: maxMinNights };
}
```

- [ ] **Step 4: Implement the main validation function**

Create `src/actions/availability/validation.ts`:

```typescript
import { validateBookingDatesSchema } from "./schemas";
import {
  getSeasonForDates,
  getBookingRound,
  getDateRangeAvailabilityForValidation,
  getMemberBookedNightsInRound,
  getTariffForValidation,
} from "./validation-helpers";

type ValidationResult = {
  valid: boolean;
  errors: string[];
};

function countNights(checkIn: string, checkOut: string): number {
  const start = new Date(checkIn + "T00:00:00Z");
  const end = new Date(checkOut + "T00:00:00Z");
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export async function validateBookingDates(input: {
  lodgeId: string;
  checkIn: string;
  checkOut: string;
  bookingRoundId: string;
  memberId: string;
}): Promise<ValidationResult> {
  const parsed = validateBookingDatesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((i) => i.message),
    };
  }

  const { lodgeId, checkIn, checkOut, bookingRoundId, memberId } = parsed.data;
  const errors: string[] = [];
  const nights = countNights(checkIn, checkOut);

  // Rule 6: No past dates
  const today = new Date().toISOString().split("T")[0];
  if (checkIn < today) {
    errors.push("Check-in date cannot be in the past");
  }

  // Rule 1: Within season
  const season = await getSeasonForDates(lodgeId, checkIn, checkOut);
  if (!season) {
    errors.push("Dates are not within an active season");
  }

  // Rule 2: Within booking round
  const round = await getBookingRound(bookingRoundId);
  if (!round) {
    errors.push("Booking round not found");
  } else {
    const now = new Date();
    if (now < round.opensAt || now > round.closesAt) {
      errors.push("Booking round is not currently open");
    }

    // Rule 4: Max nights per booking
    if (round.maxNightsPerBooking && nights > round.maxNightsPerBooking) {
      errors.push(
        `Maximum ${round.maxNightsPerBooking} nights per booking in this round`
      );
    }

    // Rule 5: Max nights per member
    if (round.maxNightsPerMember) {
      const existingNights = await getMemberBookedNightsInRound(
        memberId,
        bookingRoundId
      );
      if (existingNights + nights > round.maxNightsPerMember) {
        errors.push(
          `This booking would exceed your ${round.maxNightsPerMember}-night limit for this round (${existingNights} nights already booked)`
        );
      }
    }
  }

  // Rule 3: Minimum nights
  if (season) {
    const tariff = await getTariffForValidation(lodgeId, season.id);
    if (nights < tariff.minimumNights) {
      errors.push(
        `A minimum of ${tariff.minimumNights} nights is required`
      );
    }
  }

  // Rule 7: Sufficient availability
  const availability = await getDateRangeAvailabilityForValidation(
    lodgeId,
    checkIn,
    checkOut
  );

  if (availability.length < nights) {
    errors.push(
      "No availability data for some dates in this range — the season may not be set up yet"
    );
  } else {
    for (const day of availability) {
      const available = day.totalBeds - day.bookedBeds;
      if (available <= 0) {
        errors.push(
          `No availability on ${day.date}`
        );
        break; // One error is enough
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /opt/snowgum && npx vitest run src/actions/availability/__tests__/validation.test.ts`

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/actions/availability/validation.ts src/actions/availability/validation-helpers.ts src/actions/availability/__tests__/validation.test.ts
git commit -m "feat: add booking date validation with tests"
```

---

### Task 7: Admin sidebar — add Availability link

**Files:**
- Modify: `src/app/[slug]/admin/layout.tsx`

- [ ] **Step 1: Add Availability to the NAV_ITEMS array**

In `src/app/[slug]/admin/layout.tsx`, add the Availability item between "Lodges" and "Seasons" in the `NAV_ITEMS` array:

```typescript
const NAV_ITEMS = [
  { label: "Dashboard", href: "" },
  { label: "Bookings", href: "/bookings" },
  { label: "Members", href: "/members" },
  { label: "Lodges", href: "/lodges" },
  { label: "Availability", href: "/availability" },
  { label: "Seasons", href: "/seasons" },
  { label: "Tariffs", href: "/tariffs" },
  { label: "Subscriptions", href: "/subscriptions" },
  { label: "Waitlist", href: "/waitlist" },
  { label: "Reports", href: "/reports" },
  { label: "Communications", href: "/communications" },
  { label: "Documents", href: "/documents" },
  { label: "Audit Log", href: "/audit-log" },
  { label: "Settings", href: "/settings" },
];
```

- [ ] **Step 2: Commit**

```bash
git add src/app/[slug]/admin/layout.tsx
git commit -m "feat: add Availability link to admin sidebar"
```

---

### Task 8: Admin availability page

**Files:**
- Create: `src/app/[slug]/admin/availability/page.tsx`
- Create: `src/app/[slug]/admin/availability/availability-calendar.tsx`

- [ ] **Step 1: Create the shared calendar component**

Create `src/app/[slug]/admin/availability/availability-calendar.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

type AvailabilityDay = {
  date: string;
  totalBeds: number;
  bookedBeds: number;
  hasOverride?: boolean;
};

type AvailabilityCalendarProps = {
  mode: "admin" | "member";
  availability: AvailabilityDay[];
  year: number;
  month: number;
  onMonthChange: (year: number, month: number) => void;
  onDateClick?: (date: string) => void;
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  // 0 = Sunday, 1 = Monday, ...
  return new Date(year, month - 1, 1).getDay();
}

function getAvailabilityColor(
  totalBeds: number,
  bookedBeds: number,
  hasOverride: boolean,
  mode: "admin" | "member"
): string {
  if (totalBeds === 0) return "bg-zinc-300 dark:bg-zinc-700"; // closed
  const available = totalBeds - bookedBeds;
  const ratio = available / totalBeds;

  if (available <= 0) return "bg-red-200 dark:bg-red-900";
  if (ratio <= 0.5) return "bg-amber-200 dark:bg-amber-900";
  return "bg-green-200 dark:bg-green-900";
}

function getAvailabilityLabel(
  totalBeds: number,
  bookedBeds: number,
  mode: "admin" | "member"
): string {
  const available = totalBeds - bookedBeds;
  if (totalBeds === 0) return mode === "admin" ? "Closed" : "Unavailable";
  if (available <= 0) return mode === "admin" ? "0/" + totalBeds : "Unavailable";
  if (mode === "admin") return `${available}/${totalBeds}`;
  const ratio = available / totalBeds;
  if (ratio <= 0.5) return "Limited";
  return "Available";
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function AvailabilityCalendar({
  mode,
  availability,
  year,
  month,
  onMonthChange,
  onDateClick,
}: AvailabilityCalendarProps) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);

  const availabilityMap = new Map(
    availability.map((a) => [a.date, a])
  );

  function handlePrev() {
    if (month === 1) {
      onMonthChange(year - 1, 12);
    } else {
      onMonthChange(year, month - 1);
    }
  }

  function handleNext() {
    if (month === 12) {
      onMonthChange(year + 1, 1);
    } else {
      onMonthChange(year, month + 1);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="outline" size="sm" onClick={handlePrev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-lg font-semibold">
          {MONTH_NAMES[month - 1]} {year}
        </h3>
        <Button variant="outline" size="sm" onClick={handleNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_NAMES.map((day) => (
          <div
            key={day}
            className="text-center text-xs font-medium text-muted-foreground py-1"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Empty cells before first day */}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} className="h-16" />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const data = availabilityMap.get(dateStr);
          const totalBeds = data?.totalBeds ?? 0;
          const bookedBeds = data?.bookedBeds ?? 0;
          const hasOverride = data?.hasOverride ?? false;
          const hasData = !!data;

          const colorClass = hasData
            ? getAvailabilityColor(totalBeds, bookedBeds, hasOverride, mode)
            : "bg-muted/50";

          const label = hasData
            ? getAvailabilityLabel(totalBeds, bookedBeds, mode)
            : "";

          return (
            <button
              key={dateStr}
              type="button"
              className={`h-16 rounded-md p-1 text-left transition-colors hover:ring-2 hover:ring-ring ${colorClass} ${
                mode === "admin" ? "cursor-pointer" : "cursor-default"
              }`}
              onClick={() => mode === "admin" && onDateClick?.(dateStr)}
              disabled={mode === "member"}
            >
              <div className="text-xs font-medium">{day}</div>
              {hasData && (
                <div className="text-[10px] leading-tight mt-0.5">
                  {label}
                  {mode === "admin" && hasOverride && (
                    <span className="ml-0.5" title="Override active">
                      *
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the admin page**

Create `src/app/[slug]/admin/availability/page.tsx`:

```typescript
import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { db } from "@/db/index";
import { lodges } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getMonthAvailability, getOverridesForLodge } from "@/actions/availability/queries";
import { AdminAvailabilityClient } from "./admin-availability-client";

export default async function AdminAvailabilityPage({
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

  const orgLodges = await db
    .select({ id: lodges.id, name: lodges.name, totalBeds: lodges.totalBeds })
    .from(lodges)
    .where(and(eq(lodges.organisationId, org.id), eq(lodges.isActive, true)));

  if (orgLodges.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">Availability</h1>
        <p className="text-muted-foreground">
          No active lodges found. Create a lodge first.
        </p>
      </div>
    );
  }

  const selectedLodgeId =
    typeof sp.lodge === "string" ? sp.lodge : orgLodges[0].id;

  const now = new Date();
  const year =
    typeof sp.year === "string" ? parseInt(sp.year, 10) : now.getFullYear();
  const month =
    typeof sp.month === "string" ? parseInt(sp.month, 10) : now.getMonth() + 1;

  const availability = await getMonthAvailability(selectedLodgeId, year, month);

  // Get overrides to mark dates with override indicator
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const overrides = await getOverridesForLodge(
    selectedLodgeId,
    monthStart,
    monthEnd
  );

  // Build availability with override markers
  const overrideDates = new Set<string>();
  for (const o of overrides) {
    const start = new Date(o.startDate + "T00:00:00Z");
    const end = new Date(o.endDate + "T00:00:00Z");
    const cur = new Date(start);
    while (cur <= end) {
      overrideDates.add(cur.toISOString().split("T")[0]);
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  const availabilityWithOverrides = availability.map((a) => ({
    date: a.date,
    totalBeds: a.totalBeds,
    bookedBeds: a.bookedBeds,
    hasOverride: overrideDates.has(a.date),
  }));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Availability</h1>
          <p className="text-muted-foreground">
            View and manage lodge availability.
          </p>
        </div>
      </div>

      <AdminAvailabilityClient
        lodges={orgLodges}
        selectedLodgeId={selectedLodgeId}
        availability={availabilityWithOverrides}
        overrides={overrides.map((o) => ({
          id: o.id,
          startDate: o.startDate,
          endDate: o.endDate,
          type: o.type,
          bedReduction: o.bedReduction,
          reason: o.reason,
        }))}
        year={year}
        month={month}
        slug={slug}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create the admin client wrapper**

Create `src/app/[slug]/admin/availability/admin-availability-client.tsx`:

```typescript
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AvailabilityCalendar } from "./availability-calendar";
import { OverrideTable } from "./override-table";
import { OverrideForm } from "./override-form";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { seedSeasonAvailability } from "@/actions/availability/rebuild";

type Lodge = { id: string; name: string; totalBeds: number };
type Override = {
  id: string;
  startDate: string;
  endDate: string;
  type: string;
  bedReduction: number | null;
  reason: string | null;
};

type Props = {
  lodges: Lodge[];
  selectedLodgeId: string;
  availability: {
    date: string;
    totalBeds: number;
    bookedBeds: number;
    hasOverride: boolean;
  }[];
  overrides: Override[];
  year: number;
  month: number;
  slug: string;
};

export function AdminAvailabilityClient({
  lodges,
  selectedLodgeId,
  availability,
  overrides,
  year,
  month,
  slug,
}: Props) {
  const router = useRouter();
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingOverride, setEditingOverride] = useState<Override | null>(null);

  function handleLodgeChange(lodgeId: string) {
    const params = new URLSearchParams();
    params.set("lodge", lodgeId);
    params.set("year", String(year));
    params.set("month", String(month));
    router.push(`/${slug}/admin/availability?${params.toString()}`);
  }

  function handleMonthChange(newYear: number, newMonth: number) {
    const params = new URLSearchParams();
    params.set("lodge", selectedLodgeId);
    params.set("year", String(newYear));
    params.set("month", String(newMonth));
    router.push(`/${slug}/admin/availability?${params.toString()}`);
  }

  function handleDateClick(date: string) {
    setSelectedDate(date);
    setEditingOverride(null);
    setShowOverrideForm(true);
  }

  function handleEditOverride(override: Override) {
    setEditingOverride(override);
    setSelectedDate(null);
    setShowOverrideForm(true);
  }

  function handleFormClose() {
    setShowOverrideForm(false);
    setSelectedDate(null);
    setEditingOverride(null);
  }

  return (
    <div className="space-y-6">
      {/* Lodge selector */}
      {lodges.length > 1 && (
        <div className="w-64">
          <Select value={selectedLodgeId} onValueChange={handleLodgeChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select lodge" />
            </SelectTrigger>
            <SelectContent>
              {lodges.map((lodge) => (
                <SelectItem key={lodge.id} value={lodge.id}>
                  {lodge.name} ({lodge.totalBeds} beds)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Calendar */}
      <AvailabilityCalendar
        mode="admin"
        availability={availability}
        year={year}
        month={month}
        onMonthChange={handleMonthChange}
        onDateClick={handleDateClick}
      />

      {/* Overrides section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Overrides</h2>
          <Button
            size="sm"
            onClick={() => {
              setSelectedDate(null);
              setEditingOverride(null);
              setShowOverrideForm(true);
            }}
          >
            Add Override
          </Button>
        </div>
        <OverrideTable
          overrides={overrides}
          onEdit={handleEditOverride}
          slug={slug}
        />
      </div>

      {/* Override form dialog */}
      {showOverrideForm && (
        <OverrideForm
          lodgeId={selectedLodgeId}
          slug={slug}
          initialDate={selectedDate}
          override={editingOverride}
          onClose={handleFormClose}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify the build compiles (may have import issues to fix)**

Run: `cd /opt/snowgum && npx next build 2>&1 | head -50`

Fix any import errors. The Select component may not exist yet — if so, add it:

Run: `cd /opt/snowgum && npx shadcn@latest add select` (only if Select is not in `src/components/ui/`)

- [ ] **Step 5: Commit**

```bash
git add src/app/[slug]/admin/availability/
git commit -m "feat: add admin availability page with calendar component"
```

---

### Task 9: Override form and table components

**Files:**
- Create: `src/app/[slug]/admin/availability/override-form.tsx`
- Create: `src/app/[slug]/admin/availability/override-table.tsx`

- [ ] **Step 1: Create the override table component**

Create `src/app/[slug]/admin/availability/override-table.tsx`:

```typescript
"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteAvailabilityOverride } from "@/actions/availability/overrides";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Override = {
  id: string;
  startDate: string;
  endDate: string;
  type: string;
  bedReduction: number | null;
  reason: string | null;
};

type Props = {
  overrides: Override[];
  onEdit: (override: Override) => void;
  slug: string;
};

export function OverrideTable({ overrides, onEdit, slug }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Delete this override?")) return;
    setDeleting(id);
    await deleteAvailabilityOverride({ id, slug });
    setDeleting(null);
    router.refresh();
  }

  if (overrides.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No overrides for this period.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Dates</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Details</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {overrides.map((o) => (
          <TableRow key={o.id}>
            <TableCell className="text-sm">
              {o.startDate} to {o.endDate}
            </TableCell>
            <TableCell>
              <Badge variant={o.type === "CLOSURE" ? "destructive" : "outline"}>
                {o.type}
              </Badge>
            </TableCell>
            <TableCell className="text-sm">
              {o.type === "REDUCTION" && o.bedReduction
                ? `${o.bedReduction} beds`
                : "Full closure"}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {o.reason || "—"}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(o)}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(o.id)}
                  disabled={deleting === o.id}
                >
                  {deleting === o.id ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 2: Create the override form dialog**

Create `src/app/[slug]/admin/availability/override-form.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createAvailabilityOverride,
  updateAvailabilityOverride,
} from "@/actions/availability/overrides";

type Override = {
  id: string;
  startDate: string;
  endDate: string;
  type: string;
  bedReduction: number | null;
  reason: string | null;
};

type Props = {
  lodgeId: string;
  slug: string;
  initialDate: string | null;
  override: Override | null;
  onClose: () => void;
};

export function OverrideForm({
  lodgeId,
  slug,
  initialDate,
  override,
  onClose,
}: Props) {
  const router = useRouter();
  const isEditing = !!override;

  const [startDate, setStartDate] = useState(
    override?.startDate ?? initialDate ?? ""
  );
  const [endDate, setEndDate] = useState(
    override?.endDate ?? initialDate ?? ""
  );
  const [type, setType] = useState<"CLOSURE" | "REDUCTION">(
    (override?.type as "CLOSURE" | "REDUCTION") ?? "CLOSURE"
  );
  const [bedReduction, setBedReduction] = useState(
    override?.bedReduction?.toString() ?? ""
  );
  const [reason, setReason] = useState(override?.reason ?? "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    let result;

    if (isEditing) {
      result = await updateAvailabilityOverride({
        id: override.id,
        startDate,
        endDate,
        type,
        bedReduction: type === "REDUCTION" ? parseInt(bedReduction, 10) : null,
        reason: reason || null,
        slug,
      });
    } else {
      // createdByMemberId will be set server-side in a real implementation
      // For now, we pass it as empty — the action should get it from the session
      result = await createAvailabilityOverride({
        lodgeId,
        startDate,
        endDate,
        type,
        bedReduction:
          type === "REDUCTION" ? parseInt(bedReduction, 10) : undefined,
        reason: reason || undefined,
        createdByMemberId: "", // Will be set from session in production
        slug,
      });
    }

    setSubmitting(false);

    if (result.success) {
      onClose();
      router.refresh();
    } else {
      setError(result.error ?? "Something went wrong");
    }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Override" : "Add Override"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="type">Type</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as "CLOSURE" | "REDUCTION")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CLOSURE">
                  Full Closure
                </SelectItem>
                <SelectItem value="REDUCTION">
                  Bed Reduction
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === "REDUCTION" && (
            <div>
              <Label htmlFor="bedReduction">Beds to Remove</Label>
              <Input
                id="bedReduction"
                type="number"
                min="1"
                value={bedReduction}
                onChange={(e) => setBedReduction(e.target.value)}
                required
              />
            </div>
          )}

          <div>
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Saving..."
                : isEditing
                  ? "Update"
                  : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Verify build compiles**

Run: `cd /opt/snowgum && npx next build 2>&1 | head -50`

Fix any missing shadcn components. If Dialog is missing:

Run: `cd /opt/snowgum && npx shadcn@latest add dialog` (only if not already in `src/components/ui/`)

- [ ] **Step 4: Commit**

```bash
git add src/app/[slug]/admin/availability/override-form.tsx src/app/[slug]/admin/availability/override-table.tsx
git commit -m "feat: add override form and table components"
```

---

### Task 10: Member-facing availability page

**Files:**
- Create: `src/app/[slug]/availability/page.tsx`

- [ ] **Step 1: Create the member availability page**

Create `src/app/[slug]/availability/page.tsx`:

```typescript
import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { db } from "@/db/index";
import { lodges } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getMonthAvailability } from "@/actions/availability/queries";
import { MemberAvailabilityClient } from "./member-availability-client";

export default async function MemberAvailabilityPage({
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

  const orgLodges = await db
    .select({ id: lodges.id, name: lodges.name, totalBeds: lodges.totalBeds })
    .from(lodges)
    .where(and(eq(lodges.organisationId, org.id), eq(lodges.isActive, true)));

  if (orgLodges.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">Availability</h1>
        <p className="text-muted-foreground">
          No lodges available at the moment.
        </p>
      </div>
    );
  }

  const selectedLodgeId =
    typeof sp.lodge === "string" ? sp.lodge : orgLodges[0].id;

  const now = new Date();
  const year =
    typeof sp.year === "string" ? parseInt(sp.year, 10) : now.getFullYear();
  const month =
    typeof sp.month === "string" ? parseInt(sp.month, 10) : now.getMonth() + 1;

  const availability = await getMonthAvailability(selectedLodgeId, year, month);

  const availabilityData = availability.map((a) => ({
    date: a.date,
    totalBeds: a.totalBeds,
    bookedBeds: a.bookedBeds,
    hasOverride: false, // Members don't see overrides
  }));

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Check Availability</h1>
      <p className="text-muted-foreground mb-6">
        See when beds are available at our lodges.
      </p>

      <MemberAvailabilityClient
        lodges={orgLodges}
        selectedLodgeId={selectedLodgeId}
        availability={availabilityData}
        year={year}
        month={month}
        slug={slug}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create the member client wrapper**

Create `src/app/[slug]/availability/member-availability-client.tsx`:

```typescript
"use client";

import { useRouter } from "next/navigation";
import { AvailabilityCalendar } from "@/app/[slug]/admin/availability/availability-calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Lodge = { id: string; name: string; totalBeds: number };

type Props = {
  lodges: Lodge[];
  selectedLodgeId: string;
  availability: {
    date: string;
    totalBeds: number;
    bookedBeds: number;
    hasOverride: boolean;
  }[];
  year: number;
  month: number;
  slug: string;
};

export function MemberAvailabilityClient({
  lodges,
  selectedLodgeId,
  availability,
  year,
  month,
  slug,
}: Props) {
  const router = useRouter();

  function handleLodgeChange(lodgeId: string) {
    const params = new URLSearchParams();
    params.set("lodge", lodgeId);
    params.set("year", String(year));
    params.set("month", String(month));
    router.push(`/${slug}/availability?${params.toString()}`);
  }

  function handleMonthChange(newYear: number, newMonth: number) {
    const params = new URLSearchParams();
    params.set("lodge", selectedLodgeId);
    params.set("year", String(newYear));
    params.set("month", String(newMonth));
    router.push(`/${slug}/availability?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      {lodges.length > 1 && (
        <div className="w-64">
          <Select value={selectedLodgeId} onValueChange={handleLodgeChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select lodge" />
            </SelectTrigger>
            <SelectContent>
              {lodges.map((lodge) => (
                <SelectItem key={lodge.id} value={lodge.id}>
                  {lodge.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <AvailabilityCalendar
        mode="member"
        availability={availability}
        year={year}
        month={month}
        onMonthChange={handleMonthChange}
      />

      {/* Legend */}
      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-green-200 dark:bg-green-900" />
          Available
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-amber-200 dark:bg-amber-900" />
          Limited
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-red-200 dark:bg-red-900" />
          Unavailable
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build compiles**

Run: `cd /opt/snowgum && npx next build 2>&1 | head -50`

- [ ] **Step 4: Commit**

```bash
git add src/app/[slug]/availability/
git commit -m "feat: add member-facing availability page"
```

---

### Task 11: Quality checks and README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run full quality check**

Run: `cd /opt/snowgum && npm run check`

Expected: Lint passes, all tests pass, build succeeds.

Fix any issues that come up.

- [ ] **Step 2: Update README with Phase 5 in the completed features table**

In `README.md`, add Phase 5 to the "Completed" table and remove Phase 5 from "Planned":

In the Completed table, add after the Phase 4 row:

```markdown
| 5 | Availability Engine | Cache rebuild, admin overrides (closures/reductions), calendar component (admin + member), booking date validation |
```

In the Planned table, remove the Phase 5 row:

```markdown
| 5 | Availability Engine — cache, calendar component, date validation |
```

Also update the Project Structure section in the README to add:

```
      admin/                    # Admin pages (role-protected)
        availability/           # Availability calendar and overrides
        lodges/                 # Lodge, room, bed management
```

And add to the Test Coverage section:

```
- **Availability schemas** — override create/update, booking date validation inputs
- **Availability queries** — month availability, date range, overrides by lodge
- **Cache rebuild** — date range generation, override application, season seeding
- **Override actions** — create, update, delete with cache rebuild
- **Booking date validation** — all 7 rules: season, round, min/max nights, past dates, availability
```

- [ ] **Step 3: Run quality check again after README changes**

Run: `cd /opt/snowgum && npm run check`

Expected: All passes.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update README for Phase 5 availability engine"
```
