# Phase 4: Member Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin UI and server actions for managing club members — list, create, edit, family linking, role management, and financial status tracking with history.

**Architecture:** Server components for pages, client components for interactive filters and forms. Server actions for mutations. Query helpers in a shared lib file. All queries scoped by organisationId. TDD — tests first for every layer.

**Tech Stack:** Next.js 16 (App Router), Drizzle ORM, Zod 4, Vitest, shadcn/ui (Base UI), TypeScript

**Important Next.js 16 notes:**
- `params` and `searchParams` are `Promise` types — must be `await`ed
- Button with Link uses `render` prop: `<Button render={<Link href="..." />}>text</Button>`
- Server actions are in `"use server"` files, use `revalidatePath()` after mutations

---

## File Structure

```
src/
  db/schema/members.ts              — MODIFY: add financialStatusChanges table
  db/schema/index.ts                — MODIFY: export financialStatusChanges
  lib/validation.ts                 — MODIFY: add member validation schemas
  lib/__tests__/member-validation.test.ts — CREATE: validation schema tests
  lib/members.ts                    — CREATE: query helpers
  lib/__tests__/members.test.ts     — CREATE: query helper tests
  actions/members/create.ts         — CREATE: createMember action
  actions/members/update.ts         — CREATE: updateMember action
  actions/members/role.ts           — CREATE: updateMemberRole action
  actions/members/financial.ts      — CREATE: updateFinancialStatus action
  actions/members/family.ts         — CREATE: link/unlinkFamilyMember actions
  actions/members/__tests__/create.test.ts    — CREATE
  actions/members/__tests__/update.test.ts    — CREATE
  actions/members/__tests__/role.test.ts      — CREATE
  actions/members/__tests__/financial.test.ts — CREATE
  actions/members/__tests__/family.test.ts    — CREATE
  app/[slug]/admin/members/page.tsx           — CREATE: member list page
  app/[slug]/admin/members/member-filters.tsx — CREATE: filter bar (client)
  app/[slug]/admin/members/member-table.tsx   — CREATE: table with pagination
  app/[slug]/admin/members/new/page.tsx       — CREATE: add member page
  app/[slug]/admin/members/new/member-form.tsx — CREATE: form (client)
  app/[slug]/admin/members/[memberId]/page.tsx              — CREATE: detail page
  app/[slug]/admin/members/[memberId]/member-profile-form.tsx — CREATE: profile edit form (client)
  app/[slug]/admin/members/[memberId]/family-section.tsx      — CREATE: family display + link dialog (client)
  app/[slug]/admin/members/[memberId]/family-link-dialog.tsx  — CREATE: search and link dialog (client)
  app/[slug]/admin/members/[memberId]/role-financial-section.tsx — CREATE: role + financial (client)
  app/[slug]/admin/members/[memberId]/financial-history-table.tsx — CREATE: history display
```

---

### Task 1: Schema — Add financialStatusChanges table

**Files:**
- Modify: `src/db/schema/members.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Add the financialStatusChanges table to schema**

In `src/db/schema/members.ts`, add after the `organisationMembers` table definition:

```typescript
export const financialStatusChanges = pgTable("financial_status_changes", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id),
  isFinancial: boolean("is_financial").notNull(),
  reason: text("reason").notNull(),
  changedByMemberId: uuid("changed_by_member_id")
    .notNull()
    .references(() => members.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
```

- [ ] **Step 2: Export from schema index**

In `src/db/schema/index.ts`, update the members export line:

```typescript
export {
  membershipClasses,
  members,
  orgMemberRoleEnum,
  organisationMembers,
  financialStatusChanges,
} from "./members";
```

- [ ] **Step 3: Generate migration**

Run: `npm run db:generate`
Expected: New migration SQL file created in `drizzle/` directory

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/members.ts src/db/schema/index.ts drizzle/
git commit -m "feat: add financialStatusChanges table schema and migration"
```

---

### Task 2: Validation schemas

**Files:**
- Create: `src/lib/__tests__/member-validation.test.ts`
- Modify: `src/lib/validation.ts`

- [ ] **Step 1: Write failing tests for member validation schemas**

Create `src/lib/__tests__/member-validation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  createMemberSchema,
  updateMemberSchema,
  financialStatusChangeSchema,
} from "../validation";

describe("createMemberSchema", () => {
  const validInput = {
    firstName: "James",
    lastName: "Mitchell",
    email: "james@example.com",
    membershipClassId: "550e8400-e29b-41d4-a716-446655440000",
  };

  it("accepts valid input with required fields only", () => {
    const result = createMemberSchema.parse(validInput);
    expect(result.firstName).toBe("James");
    expect(result.lastName).toBe("Mitchell");
    expect(result.email).toBe("james@example.com");
    expect(result.membershipClassId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(result.isFinancial).toBe(true); // default
    expect(result.role).toBe("MEMBER"); // default
  });

  it("accepts all optional fields", () => {
    const result = createMemberSchema.parse({
      ...validInput,
      phone: "0412 345 678",
      dateOfBirth: "1990-01-15",
      memberNumber: "M001",
      notes: "Committee nominee",
      role: "COMMITTEE",
      isFinancial: false,
    });
    expect(result.phone).toBe("0412 345 678");
    expect(result.dateOfBirth).toBe("1990-01-15");
    expect(result.memberNumber).toBe("M001");
    expect(result.notes).toBe("Committee nominee");
    expect(result.role).toBe("COMMITTEE");
    expect(result.isFinancial).toBe(false);
  });

  it("trims and lowercases email", () => {
    const result = createMemberSchema.parse({
      ...validInput,
      email: "  James@Example.COM  ",
    });
    expect(result.email).toBe("james@example.com");
  });

  it("trims name whitespace", () => {
    const result = createMemberSchema.parse({
      ...validInput,
      firstName: "  James  ",
      lastName: "  Mitchell  ",
    });
    expect(result.firstName).toBe("James");
    expect(result.lastName).toBe("Mitchell");
  });

  it("rejects missing firstName", () => {
    expect(() =>
      createMemberSchema.parse({ ...validInput, firstName: "" })
    ).toThrow();
  });

  it("rejects missing lastName", () => {
    expect(() =>
      createMemberSchema.parse({ ...validInput, lastName: "" })
    ).toThrow();
  });

  it("rejects invalid email", () => {
    expect(() =>
      createMemberSchema.parse({ ...validInput, email: "not-an-email" })
    ).toThrow();
  });

  it("rejects invalid membershipClassId", () => {
    expect(() =>
      createMemberSchema.parse({ ...validInput, membershipClassId: "not-a-uuid" })
    ).toThrow();
  });

  it("rejects invalid role", () => {
    expect(() =>
      createMemberSchema.parse({ ...validInput, role: "SUPERADMIN" })
    ).toThrow();
  });

  it("accepts empty optional strings", () => {
    const result = createMemberSchema.parse({
      ...validInput,
      phone: "",
      dateOfBirth: "",
      memberNumber: "",
      notes: "",
    });
    expect(result.phone).toBe("");
    expect(result.dateOfBirth).toBe("");
    expect(result.memberNumber).toBe("");
    expect(result.notes).toBe("");
  });
});

describe("updateMemberSchema", () => {
  it("accepts partial update with just firstName", () => {
    const result = updateMemberSchema.parse({ firstName: "Updated" });
    expect(result.firstName).toBe("Updated");
  });

  it("accepts partial update with just email", () => {
    const result = updateMemberSchema.parse({ email: "new@example.com" });
    expect(result.email).toBe("new@example.com");
  });

  it("rejects empty firstName when provided", () => {
    expect(() => updateMemberSchema.parse({ firstName: "" })).toThrow();
  });

  it("rejects empty lastName when provided", () => {
    expect(() => updateMemberSchema.parse({ lastName: "" })).toThrow();
  });

  it("rejects invalid email when provided", () => {
    expect(() => updateMemberSchema.parse({ email: "bad" })).toThrow();
  });

  it("accepts empty object (no updates)", () => {
    const result = updateMemberSchema.parse({});
    expect(result).toEqual({});
  });
});

describe("financialStatusChangeSchema", () => {
  it("accepts valid input", () => {
    const result = financialStatusChangeSchema.parse({
      isFinancial: false,
      reason: "Annual dues unpaid",
    });
    expect(result.isFinancial).toBe(false);
    expect(result.reason).toBe("Annual dues unpaid");
  });

  it("rejects missing reason", () => {
    expect(() =>
      financialStatusChangeSchema.parse({ isFinancial: true })
    ).toThrow();
  });

  it("rejects empty reason", () => {
    expect(() =>
      financialStatusChangeSchema.parse({ isFinancial: true, reason: "" })
    ).toThrow();
  });

  it("trims reason whitespace", () => {
    const result = financialStatusChangeSchema.parse({
      isFinancial: true,
      reason: "  Paid annual dues  ",
    });
    expect(result.reason).toBe("Paid annual dues");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/member-validation.test.ts`
Expected: FAIL — `createMemberSchema`, `updateMemberSchema`, `financialStatusChangeSchema` not found in exports

- [ ] **Step 3: Implement validation schemas**

Add to `src/lib/validation.ts`:

```typescript
export const createMemberSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: emailSchema,
  membershipClassId: z.string().uuid(),
  phone: phoneSchema,
  dateOfBirth: z.string().optional().or(z.literal("")),
  memberNumber: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  role: z
    .enum(["MEMBER", "BOOKING_OFFICER", "COMMITTEE", "ADMIN"])
    .default("MEMBER"),
  isFinancial: z.boolean().default(true),
});

export const updateMemberSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").optional(),
  lastName: z.string().trim().min(1, "Last name is required").optional(),
  email: emailSchema.optional(),
  membershipClassId: z.string().uuid().optional(),
  phone: phoneSchema,
  dateOfBirth: z.string().optional().or(z.literal("")),
  memberNumber: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

export const financialStatusChangeSchema = z.object({
  isFinancial: z.boolean(),
  reason: z.string().trim().min(1, "Reason is required"),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/member-validation.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.ts src/lib/__tests__/member-validation.test.ts
git commit -m "feat: add member validation schemas with tests"
```

---

### Task 3: Query helpers

**Files:**
- Create: `src/lib/__tests__/members.test.ts`
- Create: `src/lib/members.ts`

- [ ] **Step 1: Write failing tests for query helpers**

Create `src/lib/__tests__/members.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock drizzle before importing the module under test
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockOffset = vi.fn();
const mockOrderBy = vi.fn();
const mockInnerJoin = vi.fn();
const mockLeftJoin = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            innerJoin: (...jArgs: unknown[]) => {
              mockInnerJoin(...jArgs);
              return {
                leftJoin: (...ljArgs: unknown[]) => {
                  mockLeftJoin(...ljArgs);
                  return {
                    where: (...wArgs: unknown[]) => {
                      mockWhere(...wArgs);
                      return {
                        orderBy: (...oArgs: unknown[]) => {
                          mockOrderBy(...oArgs);
                          return {
                            limit: (...lArgs: unknown[]) => {
                              mockLimit(...lArgs);
                              return {
                                offset: (...offArgs: unknown[]) => {
                                  mockOffset(...offArgs);
                                  return [];
                                },
                              };
                            },
                          };
                        },
                        limit: (...lArgs: unknown[]) => {
                          mockLimit(...lArgs);
                          return [];
                        },
                      };
                    },
                    orderBy: (...oArgs: unknown[]) => {
                      mockOrderBy(...oArgs);
                      return {
                        limit: (...lArgs: unknown[]) => {
                          mockLimit(...lArgs);
                          return {
                            offset: (...offArgs: unknown[]) => {
                              mockOffset(...offArgs);
                              return [];
                            },
                          };
                        },
                      };
                    },
                  };
                },
                where: (...wArgs: unknown[]) => {
                  mockWhere(...wArgs);
                  return {
                    orderBy: (...oArgs: unknown[]) => {
                      mockOrderBy(...oArgs);
                      return {
                        limit: (...lArgs: unknown[]) => {
                          mockLimit(...lArgs);
                          return {
                            offset: (...offArgs: unknown[]) => {
                              mockOffset(...offArgs);
                              return [];
                            },
                          };
                        },
                      };
                    },
                    limit: (...lArgs: unknown[]) => {
                      mockLimit(...lArgs);
                      return [];
                    },
                  };
                },
              };
            },
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs);
              return {
                orderBy: (...oArgs: unknown[]) => {
                  mockOrderBy(...oArgs);
                  return [];
                },
                limit: (...lArgs: unknown[]) => {
                  mockLimit(...lArgs);
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

import {
  getMembers,
  getMemberById,
  getFamilyMembers,
  getFinancialHistory,
  searchMembers,
} from "../members";

const ORG_ID = "550e8400-e29b-41d4-a716-446655440000";
const MEMBER_ID = "660e8400-e29b-41d4-a716-446655440000";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getMembers", () => {
  it("calls db.select with default pagination", async () => {
    await getMembers(ORG_ID, {});
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledWith(25);
    expect(mockOffset).toHaveBeenCalledWith(0);
  });

  it("applies page offset correctly", async () => {
    await getMembers(ORG_ID, { page: 3 });
    expect(mockLimit).toHaveBeenCalledWith(25);
    expect(mockOffset).toHaveBeenCalledWith(50); // (3-1) * 25
  });
});

describe("getMemberById", () => {
  it("calls db.select and limits to 1", async () => {
    await getMemberById(ORG_ID, MEMBER_ID);
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledWith(1);
  });
});

describe("getFamilyMembers", () => {
  it("calls db.select", async () => {
    await getFamilyMembers(ORG_ID, MEMBER_ID);
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
  });
});

describe("getFinancialHistory", () => {
  it("calls db.select with ordering", async () => {
    await getFinancialHistory(ORG_ID, MEMBER_ID);
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
    expect(mockOrderBy).toHaveBeenCalled();
  });
});

describe("searchMembers", () => {
  it("calls db.select with limit of 10", async () => {
    await searchMembers(ORG_ID, "james");
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledWith(10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/members.test.ts`
Expected: FAIL — module `../members` not found

- [ ] **Step 3: Implement query helpers**

Create `src/lib/members.ts`:

```typescript
import { db } from "@/db/index";
import {
  members,
  organisationMembers,
  membershipClasses,
  financialStatusChanges,
} from "@/db/schema";
import { eq, and, or, ilike, desc, sql } from "drizzle-orm";

const PAGE_SIZE = 25;

export type MemberFilters = {
  search?: string;
  membershipClassId?: string;
  role?: string;
  isFinancial?: boolean;
  hasFamily?: boolean;
  joinedFrom?: string;
  joinedTo?: string;
  page?: number;
};

export async function getMembers(orgId: string, filters: MemberFilters) {
  const page = filters.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  const conditions = [eq(members.organisationId, orgId)];

  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(members.firstName, pattern),
        ilike(members.lastName, pattern),
        ilike(members.email, pattern)
      )!
    );
  }

  if (filters.membershipClassId) {
    conditions.push(eq(members.membershipClassId, filters.membershipClassId));
  }

  if (filters.isFinancial !== undefined) {
    conditions.push(eq(members.isFinancial, filters.isFinancial));
  }

  if (filters.hasFamily === true) {
    conditions.push(
      or(
        sql`${members.primaryMemberId} IS NOT NULL`,
        sql`EXISTS (SELECT 1 FROM members m2 WHERE m2.primary_member_id = ${members.id})`
      )!
    );
  } else if (filters.hasFamily === false) {
    conditions.push(
      and(
        sql`${members.primaryMemberId} IS NULL`,
        sql`NOT EXISTS (SELECT 1 FROM members m2 WHERE m2.primary_member_id = ${members.id})`
      )!
    );
  }

  if (filters.joinedFrom) {
    conditions.push(sql`${members.joinedAt} >= ${filters.joinedFrom}`);
  }
  if (filters.joinedTo) {
    conditions.push(sql`${members.joinedAt} <= ${filters.joinedTo}`);
  }

  const rows = await db
    .select({
      id: members.id,
      firstName: members.firstName,
      lastName: members.lastName,
      email: members.email,
      phone: members.phone,
      memberNumber: members.memberNumber,
      isFinancial: members.isFinancial,
      joinedAt: members.joinedAt,
      primaryMemberId: members.primaryMemberId,
      membershipClassName: membershipClasses.name,
      role: organisationMembers.role,
    })
    .from(members)
    .innerJoin(
      organisationMembers,
      and(
        eq(organisationMembers.memberId, members.id),
        eq(organisationMembers.organisationId, orgId)
      )
    )
    .leftJoin(
      membershipClasses,
      eq(membershipClasses.id, members.membershipClassId)
    )
    .where(and(...conditions))
    .orderBy(members.lastName, members.firstName)
    .limit(PAGE_SIZE)
    .offset(offset);

  if (filters.role) {
    return rows.filter((r) => r.role === filters.role);
  }

  // Get total count for pagination
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(members)
    .where(eq(members.organisationId, orgId));

  return { rows, total: Number(countResult?.count ?? 0), page, pageSize: PAGE_SIZE };
}

export async function getMemberById(orgId: string, memberId: string) {
  const [row] = await db
    .select({
      id: members.id,
      firstName: members.firstName,
      lastName: members.lastName,
      email: members.email,
      phone: members.phone,
      dateOfBirth: members.dateOfBirth,
      memberNumber: members.memberNumber,
      isFinancial: members.isFinancial,
      joinedAt: members.joinedAt,
      primaryMemberId: members.primaryMemberId,
      notes: members.notes,
      membershipClassId: members.membershipClassId,
      membershipClassName: membershipClasses.name,
      role: organisationMembers.role,
    })
    .from(members)
    .innerJoin(
      organisationMembers,
      and(
        eq(organisationMembers.memberId, members.id),
        eq(organisationMembers.organisationId, orgId)
      )
    )
    .leftJoin(
      membershipClasses,
      eq(membershipClasses.id, members.membershipClassId)
    )
    .where(and(eq(members.id, memberId), eq(members.organisationId, orgId)))
    .limit(1);

  return row ?? null;
}

export async function getFamilyMembers(orgId: string, primaryMemberId: string) {
  return db
    .select({
      id: members.id,
      firstName: members.firstName,
      lastName: members.lastName,
      email: members.email,
      membershipClassName: membershipClasses.name,
    })
    .from(members)
    .leftJoin(
      membershipClasses,
      eq(membershipClasses.id, members.membershipClassId)
    )
    .where(
      and(
        eq(members.organisationId, orgId),
        eq(members.primaryMemberId, primaryMemberId)
      )
    );
}

export async function getFinancialHistory(orgId: string, memberId: string) {
  const changerAlias = db
    .select({
      id: members.id,
      firstName: members.firstName,
      lastName: members.lastName,
    })
    .from(members)
    .as("changer");

  return db
    .select({
      id: financialStatusChanges.id,
      isFinancial: financialStatusChanges.isFinancial,
      reason: financialStatusChanges.reason,
      createdAt: financialStatusChanges.createdAt,
      changedByFirstName: changerAlias.firstName,
      changedByLastName: changerAlias.lastName,
    })
    .from(financialStatusChanges)
    .leftJoin(
      changerAlias,
      eq(changerAlias.id, financialStatusChanges.changedByMemberId)
    )
    .where(
      and(
        eq(financialStatusChanges.organisationId, orgId),
        eq(financialStatusChanges.memberId, memberId)
      )
    )
    .orderBy(desc(financialStatusChanges.createdAt));
}

export async function searchMembers(orgId: string, query: string) {
  const pattern = `%${query}%`;
  return db
    .select({
      id: members.id,
      firstName: members.firstName,
      lastName: members.lastName,
      email: members.email,
    })
    .from(members)
    .where(
      and(
        eq(members.organisationId, orgId),
        or(
          ilike(members.firstName, pattern),
          ilike(members.lastName, pattern),
          ilike(members.email, pattern)
        )
      )
    )
    .limit(10);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/members.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/members.ts src/lib/__tests__/members.test.ts
git commit -m "feat: add member query helpers with tests"
```

---

### Task 4: Server action — createMember

**Files:**
- Create: `src/actions/members/__tests__/create.test.ts`
- Create: `src/actions/members/create.ts`

- [ ] **Step 1: Write failing tests**

Create `src/actions/members/__tests__/create.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
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
              return [{ id: "new-member-id", email: "james@example.com" }];
            },
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
              return []; // no existing member with this email
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

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import { createMember } from "../create";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createMember", () => {
  const validInput = {
    organisationId: "550e8400-e29b-41d4-a716-446655440000",
    slug: "demo",
    firstName: "James",
    lastName: "Mitchell",
    email: "james@example.com",
    membershipClassId: "660e8400-e29b-41d4-a716-446655440000",
  };

  it("inserts member and org member records", async () => {
    await createMember(validInput);
    // Two inserts: members + organisationMembers
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockValues).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid email", async () => {
    const result = await createMember({
      ...validInput,
      email: "not-valid",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects missing firstName", async () => {
    const result = await createMember({
      ...validInput,
      firstName: "",
    });
    expect(result.success).toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/members/__tests__/create.test.ts`
Expected: FAIL — module `../create` not found

- [ ] **Step 3: Implement createMember action**

Create `src/actions/members/create.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { members, organisationMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createMemberSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type CreateMemberInput = {
  organisationId: string;
  slug: string;
  firstName: string;
  lastName: string;
  email: string;
  membershipClassId: string;
  phone?: string;
  dateOfBirth?: string;
  memberNumber?: string;
  notes?: string;
  role?: "MEMBER" | "BOOKING_OFFICER" | "COMMITTEE" | "ADMIN";
  isFinancial?: boolean;
};

export async function createMember(
  input: CreateMemberInput
): Promise<{ success: boolean; error?: string }> {
  const parsed = createMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Validation failed" };
  }

  const data = parsed.data;

  // Check email uniqueness within org
  const [existing] = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.organisationId, input.organisationId),
        eq(members.email, data.email)
      )
    );

  if (existing) {
    return { success: false, error: "A member with this email already exists" };
  }

  const [member] = await db
    .insert(members)
    .values({
      organisationId: input.organisationId,
      membershipClassId: data.membershipClassId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone || null,
      dateOfBirth: data.dateOfBirth || null,
      memberNumber: data.memberNumber || null,
      notes: data.notes || null,
      isFinancial: data.isFinancial,
    })
    .returning();

  await db.insert(organisationMembers).values({
    organisationId: input.organisationId,
    memberId: member.id,
    role: data.role,
  });

  revalidatePath(`/${input.slug}/admin/members`);
  redirect(`/${input.slug}/admin/members/${member.id}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/members/__tests__/create.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/members/create.ts src/actions/members/__tests__/create.test.ts
git commit -m "feat: add createMember server action with tests"
```

---

### Task 5: Server action — updateMember

**Files:**
- Create: `src/actions/members/__tests__/update.test.ts`
- Create: `src/actions/members/update.ts`

- [ ] **Step 1: Write failing tests**

Create `src/actions/members/__tests__/update.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockReturning = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
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
                  return [{ id: "member-id" }];
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

import { updateMember } from "../update";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateMember", () => {
  const baseInput = {
    memberId: "660e8400-e29b-41d4-a716-446655440000",
    organisationId: "550e8400-e29b-41d4-a716-446655440000",
    slug: "demo",
  };

  it("updates member with valid partial data", async () => {
    const result = await updateMember({
      ...baseInput,
      firstName: "Updated",
    });
    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalled();
  });

  it("rejects invalid email", async () => {
    const result = await updateMember({
      ...baseInput,
      email: "bad-email",
    });
    expect(result.success).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects empty firstName", async () => {
    const result = await updateMember({
      ...baseInput,
      firstName: "",
    });
    expect(result.success).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/members/__tests__/update.test.ts`
Expected: FAIL — module `../update` not found

- [ ] **Step 3: Implement updateMember action**

Create `src/actions/members/update.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { members } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { updateMemberSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";

type UpdateMemberInput = {
  memberId: string;
  organisationId: string;
  slug: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  memberNumber?: string;
  membershipClassId?: string;
  notes?: string;
};

export async function updateMember(
  input: UpdateMemberInput
): Promise<{ success: boolean; error?: string }> {
  const { memberId, organisationId, slug, ...fields } = input;

  const parsed = updateMemberSchema.safeParse(fields);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Validation failed" };
  }

  const data = parsed.data;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.firstName !== undefined) updates.firstName = data.firstName;
  if (data.lastName !== undefined) updates.lastName = data.lastName;
  if (data.email !== undefined) updates.email = data.email;
  if (data.phone !== undefined) updates.phone = data.phone || null;
  if (data.dateOfBirth !== undefined) updates.dateOfBirth = data.dateOfBirth || null;
  if (data.memberNumber !== undefined) updates.memberNumber = data.memberNumber || null;
  if (data.notes !== undefined) updates.notes = data.notes || null;
  if (input.membershipClassId !== undefined) updates.membershipClassId = input.membershipClassId;

  const [updated] = await db
    .update(members)
    .set(updates)
    .where(and(eq(members.id, memberId), eq(members.organisationId, organisationId)))
    .returning();

  if (!updated) {
    return { success: false, error: "Member not found" };
  }

  revalidatePath(`/${slug}/admin/members`);
  revalidatePath(`/${slug}/admin/members/${memberId}`);
  return { success: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/members/__tests__/update.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/members/update.ts src/actions/members/__tests__/update.test.ts
git commit -m "feat: add updateMember server action with tests"
```

---

### Task 6: Server action — updateMemberRole

**Files:**
- Create: `src/actions/members/__tests__/role.test.ts`
- Create: `src/actions/members/role.ts`

- [ ] **Step 1: Write failing tests**

Create `src/actions/members/__tests__/role.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockReturning = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
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
                  return [{ id: "org-member-id" }];
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

import { updateMemberRole } from "../role";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateMemberRole", () => {
  const baseInput = {
    memberId: "660e8400-e29b-41d4-a716-446655440000",
    organisationId: "550e8400-e29b-41d4-a716-446655440000",
    slug: "demo",
  };

  it("updates role with valid input", async () => {
    const result = await updateMemberRole({
      ...baseInput,
      role: "COMMITTEE",
    });
    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("rejects invalid role", async () => {
    const result = await updateMemberRole({
      ...baseInput,
      role: "SUPERADMIN" as any,
    });
    expect(result.success).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/members/__tests__/role.test.ts`
Expected: FAIL — module `../role` not found

- [ ] **Step 3: Implement updateMemberRole action**

Create `src/actions/members/role.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { organisationMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const roleSchema = z.object({
  role: z.enum(["MEMBER", "BOOKING_OFFICER", "COMMITTEE", "ADMIN"]),
});

type UpdateRoleInput = {
  memberId: string;
  organisationId: string;
  slug: string;
  role: string;
};

export async function updateMemberRole(
  input: UpdateRoleInput
): Promise<{ success: boolean; error?: string }> {
  const parsed = roleSchema.safeParse({ role: input.role });
  if (!parsed.success) {
    return { success: false, error: "Invalid role" };
  }

  const [updated] = await db
    .update(organisationMembers)
    .set({ role: parsed.data.role })
    .where(
      and(
        eq(organisationMembers.memberId, input.memberId),
        eq(organisationMembers.organisationId, input.organisationId)
      )
    )
    .returning();

  if (!updated) {
    return { success: false, error: "Member not found in organisation" };
  }

  revalidatePath(`/${input.slug}/admin/members`);
  revalidatePath(`/${input.slug}/admin/members/${input.memberId}`);
  return { success: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/members/__tests__/role.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/members/role.ts src/actions/members/__tests__/role.test.ts
git commit -m "feat: add updateMemberRole server action with tests"
```

---

### Task 7: Server action — updateFinancialStatus

**Files:**
- Create: `src/actions/members/__tests__/financial.test.ts`
- Create: `src/actions/members/financial.ts`

- [ ] **Step 1: Write failing tests**

Create `src/actions/members/__tests__/financial.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockSet = vi.fn();
const mockValues = vi.fn();
const mockWhere = vi.fn();
const mockReturning = vi.fn();

let callCount = 0;

vi.mock("@/db/index", () => ({
  db: {
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
                  return [{ id: "member-id" }];
                },
              };
            },
          };
        },
      };
    },
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockValues(...vArgs);
          return { returning: () => [{ id: "change-id" }] };
        },
      };
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { updateFinancialStatus } from "../financial";

beforeEach(() => {
  vi.clearAllMocks();
  callCount = 0;
});

describe("updateFinancialStatus", () => {
  const baseInput = {
    memberId: "660e8400-e29b-41d4-a716-446655440000",
    organisationId: "550e8400-e29b-41d4-a716-446655440000",
    changedByMemberId: "770e8400-e29b-41d4-a716-446655440000",
    slug: "demo",
  };

  it("updates member and inserts history record", async () => {
    const result = await updateFinancialStatus({
      ...baseInput,
      isFinancial: false,
      reason: "Annual dues unpaid",
    });
    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled(); // update members.isFinancial
    expect(mockInsert).toHaveBeenCalled(); // insert financialStatusChanges
  });

  it("rejects missing reason", async () => {
    const result = await updateFinancialStatus({
      ...baseInput,
      isFinancial: false,
      reason: "",
    });
    expect(result.success).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only reason", async () => {
    const result = await updateFinancialStatus({
      ...baseInput,
      isFinancial: true,
      reason: "   ",
    });
    expect(result.success).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/members/__tests__/financial.test.ts`
Expected: FAIL — module `../financial` not found

- [ ] **Step 3: Implement updateFinancialStatus action**

Create `src/actions/members/financial.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { members, financialStatusChanges } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { financialStatusChangeSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";

type UpdateFinancialInput = {
  memberId: string;
  organisationId: string;
  changedByMemberId: string;
  slug: string;
  isFinancial: boolean;
  reason: string;
};

export async function updateFinancialStatus(
  input: UpdateFinancialInput
): Promise<{ success: boolean; error?: string }> {
  const parsed = financialStatusChangeSchema.safeParse({
    isFinancial: input.isFinancial,
    reason: input.reason,
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message ?? "Validation failed" };
  }

  const [updated] = await db
    .update(members)
    .set({ isFinancial: parsed.data.isFinancial, updatedAt: new Date() })
    .where(
      and(eq(members.id, input.memberId), eq(members.organisationId, input.organisationId))
    )
    .returning();

  if (!updated) {
    return { success: false, error: "Member not found" };
  }

  await db.insert(financialStatusChanges).values({
    organisationId: input.organisationId,
    memberId: input.memberId,
    isFinancial: parsed.data.isFinancial,
    reason: parsed.data.reason,
    changedByMemberId: input.changedByMemberId,
  });

  revalidatePath(`/${input.slug}/admin/members/${input.memberId}`);
  return { success: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/members/__tests__/financial.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/members/financial.ts src/actions/members/__tests__/financial.test.ts
git commit -m "feat: add updateFinancialStatus server action with tests"
```

---

### Task 8: Server action — family linking

**Files:**
- Create: `src/actions/members/__tests__/family.test.ts`
- Create: `src/actions/members/family.ts`

- [ ] **Step 1: Write failing tests**

Create `src/actions/members/__tests__/family.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockReturning = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockSelectWhere = vi.fn();
const mockLimit = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
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
                  return [{ id: "member-id" }];
                },
              };
            },
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
              mockSelectWhere(...wArgs);
              return {
                limit: (...lArgs: unknown[]) => {
                  mockLimit(...lArgs);
                  // Return a member with no primaryMemberId (not already linked)
                  return [{ id: "dependent-id", primaryMemberId: null }];
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

import { linkFamilyMember, unlinkFamilyMember } from "../family";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("linkFamilyMember", () => {
  const baseInput = {
    organisationId: "550e8400-e29b-41d4-a716-446655440000",
    slug: "demo",
    primaryMemberId: "660e8400-e29b-41d4-a716-446655440000",
    dependentMemberId: "770e8400-e29b-41d4-a716-446655440000",
  };

  it("sets primaryMemberId on dependent", async () => {
    const result = await linkFamilyMember(baseInput);
    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("rejects self-linking", async () => {
    const result = await linkFamilyMember({
      ...baseInput,
      dependentMemberId: baseInput.primaryMemberId,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("cannot link a member to themselves");
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("unlinkFamilyMember", () => {
  it("clears primaryMemberId", async () => {
    const result = await unlinkFamilyMember({
      organisationId: "550e8400-e29b-41d4-a716-446655440000",
      slug: "demo",
      memberId: "770e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ primaryMemberId: null })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/actions/members/__tests__/family.test.ts`
Expected: FAIL — module `../family` not found

- [ ] **Step 3: Implement family linking actions**

Create `src/actions/members/family.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { members } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type LinkFamilyInput = {
  organisationId: string;
  slug: string;
  primaryMemberId: string;
  dependentMemberId: string;
};

export async function linkFamilyMember(
  input: LinkFamilyInput
): Promise<{ success: boolean; error?: string }> {
  if (input.primaryMemberId === input.dependentMemberId) {
    return { success: false, error: "You cannot link a member to themselves" };
  }

  // Check dependent exists and isn't already linked
  const [dependent] = await db
    .select({ id: members.id, primaryMemberId: members.primaryMemberId })
    .from(members)
    .where(
      and(
        eq(members.id, input.dependentMemberId),
        eq(members.organisationId, input.organisationId)
      )
    )
    .limit(1);

  if (!dependent) {
    return { success: false, error: "Dependent member not found" };
  }

  if (dependent.primaryMemberId) {
    return { success: false, error: "This member is already linked to a family group" };
  }

  // Check primary member exists and is not themselves a dependent (no chains)
  const [primary] = await db
    .select({ id: members.id, primaryMemberId: members.primaryMemberId })
    .from(members)
    .where(
      and(
        eq(members.id, input.primaryMemberId),
        eq(members.organisationId, input.organisationId)
      )
    )
    .limit(1);

  if (!primary) {
    return { success: false, error: "Primary member not found" };
  }

  if (primary.primaryMemberId) {
    return { success: false, error: "A dependent member cannot be a primary member (no chains)" };
  }

  const [updated] = await db
    .update(members)
    .set({ primaryMemberId: input.primaryMemberId, updatedAt: new Date() })
    .where(
      and(
        eq(members.id, input.dependentMemberId),
        eq(members.organisationId, input.organisationId)
      )
    )
    .returning();

  if (!updated) {
    return { success: false, error: "Failed to link member" };
  }

  revalidatePath(`/${input.slug}/admin/members/${input.primaryMemberId}`);
  revalidatePath(`/${input.slug}/admin/members/${input.dependentMemberId}`);
  return { success: true };
}

type UnlinkFamilyInput = {
  organisationId: string;
  slug: string;
  memberId: string;
};

export async function unlinkFamilyMember(
  input: UnlinkFamilyInput
): Promise<{ success: boolean; error?: string }> {
  const [updated] = await db
    .update(members)
    .set({ primaryMemberId: null, updatedAt: new Date() })
    .where(
      and(
        eq(members.id, input.memberId),
        eq(members.organisationId, input.organisationId)
      )
    )
    .returning();

  if (!updated) {
    return { success: false, error: "Member not found" };
  }

  revalidatePath(`/${input.slug}/admin/members/${input.memberId}`);
  return { success: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/actions/members/__tests__/family.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/members/family.ts src/actions/members/__tests__/family.test.ts
git commit -m "feat: add family linking server actions with tests"
```

---

### Task 9: Member list page

**Files:**
- Create: `src/app/[slug]/admin/members/page.tsx`
- Create: `src/app/[slug]/admin/members/member-filters.tsx`
- Create: `src/app/[slug]/admin/members/member-table.tsx`

- [ ] **Step 1: Create member-filters client component**

Create `src/app/[slug]/admin/members/member-filters.tsx`:

```typescript
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

type MembershipClass = { id: string; name: string };

export function MemberFilters({
  membershipClasses,
}: {
  membershipClasses: MembershipClass[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page"); // reset to page 1 on filter change
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearFilters() {
    router.push(pathname);
  }

  const hasFilters = searchParams.toString().length > 0;

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <Input
        placeholder="Search name or email..."
        defaultValue={searchParams.get("search") ?? ""}
        onChange={(e) => {
          // Debounce would be nice but keep it simple
          const value = e.target.value;
          if (value.length === 0 || value.length >= 2) {
            updateParam("search", value);
          }
        }}
        className="w-64"
      />

      <select
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        value={searchParams.get("classId") ?? ""}
        onChange={(e) => updateParam("classId", e.target.value)}
      >
        <option value="">All Classes</option>
        {membershipClasses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <select
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        value={searchParams.get("role") ?? ""}
        onChange={(e) => updateParam("role", e.target.value)}
      >
        <option value="">All Roles</option>
        <option value="MEMBER">Member</option>
        <option value="BOOKING_OFFICER">Booking Officer</option>
        <option value="COMMITTEE">Committee</option>
        <option value="ADMIN">Admin</option>
      </select>

      <select
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        value={searchParams.get("financial") ?? ""}
        onChange={(e) => updateParam("financial", e.target.value)}
      >
        <option value="">All Status</option>
        <option value="true">Financial</option>
        <option value="false">Unfinancial</option>
      </select>

      <select
        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        value={searchParams.get("family") ?? ""}
        onChange={(e) => updateParam("family", e.target.value)}
      >
        <option value="">All Members</option>
        <option value="true">Has Family</option>
        <option value="false">No Family</option>
      </select>

      <Input
        type="date"
        placeholder="Joined from"
        defaultValue={searchParams.get("joinedFrom") ?? ""}
        onChange={(e) => updateParam("joinedFrom", e.target.value)}
        className="w-40"
      />

      <Input
        type="date"
        placeholder="Joined to"
        defaultValue={searchParams.get("joinedTo") ?? ""}
        onChange={(e) => updateParam("joinedTo", e.target.value)}
        className="w-40"
      />

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          Clear filters
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create member-table component**

Create `src/app/[slug]/admin/members/member-table.tsx`:

```typescript
"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type MemberRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  membershipClassName: string | null;
  role: string;
  isFinancial: boolean;
  primaryMemberId: string | null;
  joinedAt: Date | null;
};

export function MemberTable({
  members,
  total,
  page,
  pageSize,
  slug,
}: {
  members: MemberRow[];
  total: number;
  page: number;
  pageSize: number;
  slug: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalPages = Math.ceil(total / pageSize);

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Class</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Family</TableHead>
            <TableHead>Joined</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                No members found.
              </TableCell>
            </TableRow>
          ) : (
            members.map((member) => (
              <TableRow
                key={member.id}
                className="cursor-pointer"
                onClick={() =>
                  router.push(`/${slug}/admin/members/${member.id}`)
                }
              >
                <TableCell className="font-medium">
                  {member.firstName} {member.lastName}
                </TableCell>
                <TableCell>{member.email}</TableCell>
                <TableCell>{member.membershipClassName ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline">{member.role}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={member.isFinancial ? "default" : "destructive"}>
                    {member.isFinancial ? "Financial" : "Unfinancial"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {member.primaryMemberId ? (
                    <Badge variant="outline">Family</Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>
                  {member.joinedAt
                    ? new Date(member.joinedAt).toLocaleDateString("en-AU")
                    : "—"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, total)} of {total}
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
    </div>
  );
}
```

- [ ] **Step 3: Create the member list page (server component)**

Create `src/app/[slug]/admin/members/page.tsx`:

```typescript
import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { getMembers } from "@/lib/members";
import { db } from "@/db/index";
import { membershipClasses } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MemberFilters } from "./member-filters";
import { MemberTable } from "./member-table";

export default async function MembersPage({
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

  const classes = await db
    .select({ id: membershipClasses.id, name: membershipClasses.name })
    .from(membershipClasses)
    .where(eq(membershipClasses.organisationId, org.id));

  const filters = {
    search: typeof sp.search === "string" ? sp.search : undefined,
    membershipClassId: typeof sp.classId === "string" ? sp.classId : undefined,
    role: typeof sp.role === "string" ? sp.role : undefined,
    isFinancial:
      sp.financial === "true" ? true : sp.financial === "false" ? false : undefined,
    hasFamily:
      sp.family === "true" ? true : sp.family === "false" ? false : undefined,
    joinedFrom: typeof sp.joinedFrom === "string" ? sp.joinedFrom : undefined,
    joinedTo: typeof sp.joinedTo === "string" ? sp.joinedTo : undefined,
    page: typeof sp.page === "string" ? parseInt(sp.page, 10) : 1,
  };

  const result = await getMembers(org.id, filters);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Members</h1>
          <Badge variant="outline">{result.total}</Badge>
        </div>
        <Button render={<Link href={`/${slug}/admin/members/new`} />}>
          Add Member
        </Button>
      </div>

      <MemberFilters membershipClasses={classes} />
      <MemberTable
        members={result.rows}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        slug={slug}
      />
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors (or only pre-existing ones)

- [ ] **Step 5: Commit**

```bash
git add src/app/\[slug\]/admin/members/page.tsx src/app/\[slug\]/admin/members/member-filters.tsx src/app/\[slug\]/admin/members/member-table.tsx
git commit -m "feat: add member list page with filters and pagination"
```

---

### Task 10: Add member page

**Files:**
- Create: `src/app/[slug]/admin/members/new/page.tsx`
- Create: `src/app/[slug]/admin/members/new/member-form.tsx`

- [ ] **Step 1: Create member-form client component**

Create `src/app/[slug]/admin/members/new/member-form.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createMember } from "@/actions/members/create";

type MembershipClass = { id: string; name: string };

export function MemberForm({
  organisationId,
  slug,
  membershipClasses,
}: {
  organisationId: string;
  slug: string;
  membershipClasses: MembershipClass[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(e.currentTarget);

    const result = await createMember({
      organisationId,
      slug,
      firstName: form.get("firstName") as string,
      lastName: form.get("lastName") as string,
      email: form.get("email") as string,
      membershipClassId: form.get("membershipClassId") as string,
      phone: (form.get("phone") as string) || undefined,
      dateOfBirth: (form.get("dateOfBirth") as string) || undefined,
      memberNumber: (form.get("memberNumber") as string) || undefined,
      notes: (form.get("notes") as string) || undefined,
      role: (form.get("role") as "MEMBER" | "BOOKING_OFFICER" | "COMMITTEE" | "ADMIN") || "MEMBER",
      isFinancial: form.get("isFinancial") === "on",
    });

    setPending(false);
    if (result && !result.success) {
      setError(result.error ?? "Failed to create member");
    }
    // On success, createMember redirects — no action needed here
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-xl">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">First Name *</Label>
          <Input id="firstName" name="firstName" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last Name *</Label>
          <Input id="lastName" name="lastName" required />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email *</Label>
        <Input id="email" name="email" type="email" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dateOfBirth">Date of Birth</Label>
          <Input id="dateOfBirth" name="dateOfBirth" type="date" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="memberNumber">Member Number</Label>
          <Input id="memberNumber" name="memberNumber" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="membershipClassId">Membership Class *</Label>
        <select
          id="membershipClassId"
          name="membershipClassId"
          required
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          <option value="">Select a class...</option>
          {membershipClasses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <select
          id="role"
          name="role"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          <option value="MEMBER">Member</option>
          <option value="BOOKING_OFFICER">Booking Officer</option>
          <option value="COMMITTEE">Committee</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isFinancial"
          name="isFinancial"
          defaultChecked
          className="h-4 w-4 rounded border-input"
        />
        <Label htmlFor="isFinancial">Financial (dues paid)</Label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={3} />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Creating..." : "Create Member"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Create the add member page (server component)**

Create `src/app/[slug]/admin/members/new/page.tsx`:

```typescript
import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { db } from "@/db/index";
import { membershipClasses } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MemberForm } from "./member-form";

export default async function NewMemberPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const classes = await db
    .select({ id: membershipClasses.id, name: membershipClasses.name })
    .from(membershipClasses)
    .where(eq(membershipClasses.organisationId, org.id));

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="sm"
          render={<Link href={`/${slug}/admin/members`} />}
        >
          &larr; Members
        </Button>
        <h1 className="text-2xl font-bold">Add Member</h1>
      </div>

      <MemberForm
        organisationId={org.id}
        slug={slug}
        membershipClasses={classes}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/app/\[slug\]/admin/members/new/
git commit -m "feat: add new member page with form"
```

---

### Task 11: Member detail page — profile section

**Files:**
- Create: `src/app/[slug]/admin/members/[memberId]/page.tsx`
- Create: `src/app/[slug]/admin/members/[memberId]/member-profile-form.tsx`

- [ ] **Step 1: Create member-profile-form client component**

Create `src/app/[slug]/admin/members/[memberId]/member-profile-form.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateMember } from "@/actions/members/update";

type MembershipClass = { id: string; name: string };

type MemberData = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  dateOfBirth: string | null;
  memberNumber: string | null;
  membershipClassId: string;
  notes: string | null;
};

export function MemberProfileForm({
  member,
  organisationId,
  slug,
  membershipClasses,
}: {
  member: MemberData;
  organisationId: string;
  slug: string;
  membershipClasses: MembershipClass[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setPending(true);

    const form = new FormData(e.currentTarget);

    const result = await updateMember({
      memberId: member.id,
      organisationId,
      slug,
      firstName: form.get("firstName") as string,
      lastName: form.get("lastName") as string,
      email: form.get("email") as string,
      phone: (form.get("phone") as string) || undefined,
      dateOfBirth: (form.get("dateOfBirth") as string) || undefined,
      memberNumber: (form.get("memberNumber") as string) || undefined,
      membershipClassId: form.get("membershipClassId") as string,
      notes: (form.get("notes") as string) || undefined,
    });

    setPending(false);
    if (result.success) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } else {
      setError(result.error ?? "Failed to update");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">
          Saved successfully.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">First Name</Label>
          <Input id="firstName" name="firstName" defaultValue={member.firstName} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last Name</Label>
          <Input id="lastName" name="lastName" defaultValue={member.lastName} required />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" defaultValue={member.email} required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" defaultValue={member.phone ?? ""} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dateOfBirth">Date of Birth</Label>
          <Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={member.dateOfBirth ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="memberNumber">Member Number</Label>
          <Input id="memberNumber" name="memberNumber" defaultValue={member.memberNumber ?? ""} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="membershipClassId">Membership Class</Label>
        <select
          id="membershipClassId"
          name="membershipClassId"
          defaultValue={member.membershipClassId}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          {membershipClasses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (admin only)</Label>
        <Textarea id="notes" name="notes" rows={3} defaultValue={member.notes ?? ""} />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Create the detail page server component**

Create `src/app/[slug]/admin/members/[memberId]/page.tsx`:

```typescript
import { getOrgBySlug } from "@/lib/org";
import { notFound } from "next/navigation";
import { getMemberById, getFamilyMembers, getFinancialHistory } from "@/lib/members";
import { db } from "@/db/index";
import { members, membershipClasses } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getSessionMember } from "@/lib/auth";
import { MemberProfileForm } from "./member-profile-form";
import { FamilySection } from "./family-section";
import { RoleFinancialSection } from "./role-financial-section";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ slug: string; memberId: string }>;
}) {
  const { slug, memberId } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const member = await getMemberById(org.id, memberId);
  if (!member) notFound();

  const session = await getSessionMember(org.id);
  if (!session) notFound();

  const classes = await db
    .select({ id: membershipClasses.id, name: membershipClasses.name })
    .from(membershipClasses)
    .where(eq(membershipClasses.organisationId, org.id));

  // Get family data
  const dependents = await getFamilyMembers(org.id, memberId);
  let primaryMember = null;
  if (member.primaryMemberId) {
    primaryMember = await getMemberById(org.id, member.primaryMemberId);
  }

  // Get financial history
  const financialHistory = await getFinancialHistory(org.id, memberId);

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="sm"
          render={<Link href={`/${slug}/admin/members`} />}
        >
          &larr; Members
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {member.firstName} {member.lastName}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline">{member.role}</Badge>
            <Badge variant={member.isFinancial ? "default" : "destructive"}>
              {member.isFinancial ? "Financial" : "Unfinancial"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Profile Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <MemberProfileForm
            member={{
              id: member.id,
              firstName: member.firstName,
              lastName: member.lastName,
              email: member.email,
              phone: member.phone,
              dateOfBirth: member.dateOfBirth,
              memberNumber: member.memberNumber,
              membershipClassId: member.membershipClassId,
              notes: member.notes,
            }}
            organisationId={org.id}
            slug={slug}
            membershipClasses={classes}
          />
        </CardContent>
      </Card>

      {/* Family Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Family Group</CardTitle>
        </CardHeader>
        <CardContent>
          <FamilySection
            memberId={memberId}
            organisationId={org.id}
            slug={slug}
            primaryMember={
              primaryMember
                ? {
                    id: primaryMember.id,
                    firstName: primaryMember.firstName,
                    lastName: primaryMember.lastName,
                  }
                : null
            }
            dependents={dependents}
          />
        </CardContent>
      </Card>

      {/* Role & Financial Section */}
      <Card>
        <CardHeader>
          <CardTitle>Role & Financial Status</CardTitle>
        </CardHeader>
        <CardContent>
          <RoleFinancialSection
            memberId={memberId}
            organisationId={org.id}
            slug={slug}
            currentRole={member.role}
            isFinancial={member.isFinancial}
            sessionMemberId={session.memberId}
            sessionRole={session.role}
            financialHistory={financialHistory}
          />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Verify build (will fail — missing FamilySection and RoleFinancialSection, which we create next)**

This is expected. Move to the next task.

- [ ] **Step 4: Commit profile form and page skeleton**

```bash
git add src/app/\[slug\]/admin/members/\[memberId\]/page.tsx src/app/\[slug\]/admin/members/\[memberId\]/member-profile-form.tsx
git commit -m "feat: add member detail page with profile form"
```

---

### Task 12: Member detail — family section

**Files:**
- Create: `src/app/[slug]/admin/members/[memberId]/family-section.tsx`
- Create: `src/app/[slug]/admin/members/[memberId]/family-link-dialog.tsx`

- [ ] **Step 1: Create family-link-dialog client component**

Create `src/app/[slug]/admin/members/[memberId]/family-link-dialog.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { searchMembers } from "@/lib/members";
import { linkFamilyMember } from "@/actions/members/family";

type SearchResult = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

export function FamilyLinkDialog({
  memberId,
  organisationId,
  slug,
  mode,
}: {
  memberId: string;
  organisationId: string;
  slug: string;
  mode: "link-primary" | "link-dependent";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(q: string) {
    setQuery(q);
    setError(null);
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const found = await searchMembers(organisationId, q);
    // Filter out self
    setResults(found.filter((m) => m.id !== memberId));
    setSearching(false);
  }

  async function handleLink(targetId: string) {
    setError(null);
    const primaryMemberId = mode === "link-dependent" ? memberId : targetId;
    const dependentMemberId = mode === "link-dependent" ? targetId : memberId;

    const result = await linkFamilyMember({
      organisationId,
      slug,
      primaryMemberId,
      dependentMemberId,
    });

    if (result.success) {
      setOpen(false);
      setQuery("");
      setResults([]);
    } else {
      setError(result.error ?? "Failed to link");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {mode === "link-dependent" ? "Add Dependent" : "Set Primary Member"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "link-dependent"
              ? "Link a dependent member"
              : "Link to a primary member"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <Input
            placeholder="Search by name or email..."
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {searching && (
            <p className="text-sm text-muted-foreground">Searching...</p>
          )}
          {results.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {results.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-2 rounded border hover:bg-muted cursor-pointer"
                  onClick={() => handleLink(r.id)}
                >
                  <div>
                    <p className="text-sm font-medium">
                      {r.firstName} {r.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">{r.email}</p>
                  </div>
                  <Button variant="ghost" size="sm">
                    Link
                  </Button>
                </div>
              ))}
            </div>
          )}
          {query.length >= 2 && results.length === 0 && !searching && (
            <p className="text-sm text-muted-foreground">No members found.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create family-section client component**

Create `src/app/[slug]/admin/members/[memberId]/family-section.tsx`:

```typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { unlinkFamilyMember } from "@/actions/members/family";
import { FamilyLinkDialog } from "./family-link-dialog";

type FamilyMember = {
  id: string;
  firstName: string;
  lastName: string;
};

type Dependent = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  membershipClassName: string | null;
};

export function FamilySection({
  memberId,
  organisationId,
  slug,
  primaryMember,
  dependents,
}: {
  memberId: string;
  organisationId: string;
  slug: string;
  primaryMember: FamilyMember | null;
  dependents: Dependent[];
}) {
  const [unlinking, setUnlinking] = useState<string | null>(null);

  async function handleUnlink(targetMemberId: string) {
    setUnlinking(targetMemberId);
    await unlinkFamilyMember({
      organisationId,
      slug,
      memberId: targetMemberId,
    });
    setUnlinking(null);
  }

  const isPrimary = !primaryMember && dependents.length > 0;
  const isDependent = !!primaryMember;
  const isUnlinked = !primaryMember && dependents.length === 0;

  return (
    <div className="space-y-4">
      {isDependent && (
        <div className="flex items-center justify-between p-3 rounded border">
          <div>
            <p className="text-sm text-muted-foreground">Primary Member</p>
            <Link
              href={`/${slug}/admin/members/${primaryMember.id}`}
              className="text-sm font-medium hover:underline"
            >
              {primaryMember.firstName} {primaryMember.lastName}
            </Link>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={unlinking === memberId}
            onClick={() => handleUnlink(memberId)}
          >
            {unlinking === memberId ? "Unlinking..." : "Unlink"}
          </Button>
        </div>
      )}

      {isPrimary && (
        <>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Primary Member</Badge>
            <span className="text-sm text-muted-foreground">
              {dependents.length} dependent{dependents.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="space-y-2">
            {dependents.map((dep) => (
              <div
                key={dep.id}
                className="flex items-center justify-between p-3 rounded border"
              >
                <div>
                  <Link
                    href={`/${slug}/admin/members/${dep.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {dep.firstName} {dep.lastName}
                  </Link>
                  <p className="text-xs text-muted-foreground">{dep.email}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={unlinking === dep.id}
                  onClick={() => handleUnlink(dep.id)}
                >
                  {unlinking === dep.id ? "Unlinking..." : "Unlink"}
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      {isUnlinked && (
        <p className="text-sm text-muted-foreground">
          Not part of a family group.
        </p>
      )}

      <div className="flex gap-2">
        {/* Can always add dependents (if not themselves a dependent) */}
        {!isDependent && (
          <FamilyLinkDialog
            memberId={memberId}
            organisationId={organisationId}
            slug={slug}
            mode="link-dependent"
          />
        )}
        {/* Can link to a primary if not already linked and not already a primary */}
        {isUnlinked && (
          <FamilyLinkDialog
            memberId={memberId}
            organisationId={organisationId}
            slug={slug}
            mode="link-primary"
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: May still fail due to missing RoleFinancialSection (next task)

- [ ] **Step 4: Commit**

```bash
git add src/app/\[slug\]/admin/members/\[memberId\]/family-section.tsx src/app/\[slug\]/admin/members/\[memberId\]/family-link-dialog.tsx
git commit -m "feat: add family section with linking dialog"
```

---

### Task 13: Member detail — role & financial section

**Files:**
- Create: `src/app/[slug]/admin/members/[memberId]/role-financial-section.tsx`
- Create: `src/app/[slug]/admin/members/[memberId]/financial-history-table.tsx`

- [ ] **Step 1: Create financial-history-table component**

Create `src/app/[slug]/admin/members/[memberId]/financial-history-table.tsx`:

```typescript
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type HistoryEntry = {
  id: string;
  isFinancial: boolean;
  reason: string;
  createdAt: Date;
  changedByFirstName: string | null;
  changedByLastName: string | null;
};

export function FinancialHistoryTable({
  history,
}: {
  history: HistoryEntry[];
}) {
  if (history.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No financial status changes recorded.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Changed By</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {history.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell className="text-sm">
              {new Date(entry.createdAt).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </TableCell>
            <TableCell>
              <Badge variant={entry.isFinancial ? "default" : "destructive"}>
                {entry.isFinancial ? "Financial" : "Unfinancial"}
              </Badge>
            </TableCell>
            <TableCell className="text-sm">{entry.reason}</TableCell>
            <TableCell className="text-sm">
              {entry.changedByFirstName} {entry.changedByLastName}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 2: Create role-financial-section client component**

Create `src/app/[slug]/admin/members/[memberId]/role-financial-section.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { updateMemberRole } from "@/actions/members/role";
import { updateFinancialStatus } from "@/actions/members/financial";
import { FinancialHistoryTable } from "./financial-history-table";
import { isCommitteeOrAbove } from "@/lib/auth";

type HistoryEntry = {
  id: string;
  isFinancial: boolean;
  reason: string;
  createdAt: Date;
  changedByFirstName: string | null;
  changedByLastName: string | null;
};

export function RoleFinancialSection({
  memberId,
  organisationId,
  slug,
  currentRole,
  isFinancial,
  sessionMemberId,
  sessionRole,
  financialHistory,
}: {
  memberId: string;
  organisationId: string;
  slug: string;
  currentRole: string;
  isFinancial: boolean;
  sessionMemberId: string;
  sessionRole: string;
  financialHistory: HistoryEntry[];
}) {
  const [roleError, setRoleError] = useState<string | null>(null);
  const [rolePending, setRolePending] = useState(false);
  const [showFinancialForm, setShowFinancialForm] = useState(false);
  const [financialError, setFinancialError] = useState<string | null>(null);
  const [financialPending, setFinancialPending] = useState(false);

  const canChangeRole = isCommitteeOrAbove(sessionRole);

  async function handleRoleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newRole = e.target.value;
    if (newRole === currentRole) return;

    setRoleError(null);
    setRolePending(true);

    const result = await updateMemberRole({
      memberId,
      organisationId,
      slug,
      role: newRole,
    });

    setRolePending(false);
    if (!result.success) {
      setRoleError(result.error ?? "Failed to update role");
    }
  }

  async function handleFinancialSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFinancialError(null);
    setFinancialPending(true);

    const form = new FormData(e.currentTarget);
    const reason = form.get("reason") as string;

    const result = await updateFinancialStatus({
      memberId,
      organisationId,
      changedByMemberId: sessionMemberId,
      slug,
      isFinancial: !isFinancial, // toggle
      reason,
    });

    setFinancialPending(false);
    if (result.success) {
      setShowFinancialForm(false);
    } else {
      setFinancialError(result.error ?? "Failed to update");
    }
  }

  return (
    <div className="space-y-6">
      {/* Role */}
      <div className="space-y-2">
        <Label>Role</Label>
        {canChangeRole ? (
          <div className="flex items-center gap-3">
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={currentRole}
              onChange={handleRoleChange}
              disabled={rolePending}
            >
              <option value="MEMBER">Member</option>
              <option value="BOOKING_OFFICER">Booking Officer</option>
              <option value="COMMITTEE">Committee</option>
              <option value="ADMIN">Admin</option>
            </select>
            {rolePending && (
              <span className="text-sm text-muted-foreground">Saving...</span>
            )}
          </div>
        ) : (
          <Badge variant="outline">{currentRole}</Badge>
        )}
        {roleError && (
          <p className="text-sm text-destructive">{roleError}</p>
        )}
      </div>

      <Separator />

      {/* Financial Status */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label>Financial Status</Label>
            <div className="mt-1">
              <Badge variant={isFinancial ? "default" : "destructive"}>
                {isFinancial ? "Financial" : "Unfinancial"}
              </Badge>
            </div>
          </div>
          {!showFinancialForm && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFinancialForm(true)}
            >
              Change Status
            </Button>
          )}
        </div>

        {showFinancialForm && (
          <form
            onSubmit={handleFinancialSubmit}
            className="space-y-3 p-4 rounded border bg-muted/30"
          >
            <p className="text-sm">
              Change to{" "}
              <strong>{isFinancial ? "Unfinancial" : "Financial"}</strong>
            </p>
            {financialError && (
              <p className="text-sm text-destructive">{financialError}</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="reason">Reason *</Label>
              <Input
                id="reason"
                name="reason"
                required
                placeholder="e.g. Annual dues unpaid"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={financialPending}>
                {financialPending ? "Saving..." : "Confirm"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowFinancialForm(false);
                  setFinancialError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>

      <Separator />

      {/* Financial History */}
      <div className="space-y-2">
        <Label>Financial Status History</Label>
        <FinancialHistoryTable history={financialHistory} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/app/\[slug\]/admin/members/\[memberId\]/role-financial-section.tsx src/app/\[slug\]/admin/members/\[memberId\]/financial-history-table.tsx
git commit -m "feat: add role & financial status section with history"
```

---

### Task 14: Full build verification and quality check

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Run linter**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: Run full build**

Run: `npm run build`
Expected: Build succeeds (note: may fail if DB is not connected — that's OK, check for type errors only)

- [ ] **Step 4: Run full quality check**

Run: `npm run check`
Expected: lint + test + build all pass

- [ ] **Step 5: Commit any fixes needed, then push**

```bash
git push
```

---

### Task 15: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the Completed features table in README**

In the `### Completed` table, add the Phase 4 row:

```markdown
| 4 | Member Management | Member list with search/filter, add/edit members, family linking, role management, financial status with history |
```

- [ ] **Step 2: Update the Planned features table**

Remove Phase 4 from the `### Planned` table.

- [ ] **Step 3: Update Test Coverage section**

Add to the test coverage list:

```markdown
- **Member validation** — create/update schemas, financial status change schema
- **Member queries** — paginated list, detail, family, financial history, search
- **Member actions** — create, update, role change, financial status, family linking
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update README for Phase 4 member management"
git push
```
