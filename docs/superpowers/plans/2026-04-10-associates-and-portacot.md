# Associates Booking & Port-a-Cot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members can book on behalf of non-member associates (saved for reuse), and rooms support port-a-cots as a lodge-level bookable resource with tariff-based pricing.

**Architecture:** New `associates` table owned by members. `bookingGuests` extended with nullable `associateId` and `portaCotRequested`. `membershipClasses` gets `isGuestClass` flag for guest tariff lookup. `lodges` gets `portaCotCount`. `tariffs` gets `portaCotPricePerNightCents`. Booking wizard step 2 extended with associate tab + inline create form + cot toggle. Step 3 skips bed selection for cot guests. Pricing calculates cot flat rate.

**Tech Stack:** Next.js, Drizzle ORM, PostgreSQL, Zod, Vitest, pglite (integration tests)

---

### Task 1: Database Schema — Associates Table

**Files:**
- Create: `src/db/schema/associates.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Create the associates schema file**

```typescript
// src/db/schema/associates.ts
import {
  pgTable,
  uuid,
  text,
  date,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { organisations } from "./organisations";
import { members } from "./members";

export const associates = pgTable("associates", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  ownerMemberId: uuid("owner_member_id")
    .notNull()
    .references(() => members.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  dateOfBirth: date("date_of_birth"),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
```

- [ ] **Step 2: Export associates from schema index**

Add to `src/db/schema/index.ts`:

```typescript
export { associates } from "./associates";
```

- [ ] **Step 3: Commit**

```bash
git add src/db/schema/associates.ts src/db/schema/index.ts
git commit -m "feat: add associates schema table"
```

---

### Task 2: Database Schema — Modify Existing Tables

**Files:**
- Modify: `src/db/schema/bookings.ts`
- Modify: `src/db/schema/members.ts`
- Modify: `src/db/schema/lodges.ts`
- Modify: `src/db/schema/tariffs.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Modify bookingGuests in bookings.ts**

In `src/db/schema/bookings.ts`, add the import for associates:

```typescript
import { associates } from "./associates";
```

Then modify `bookingGuests`:

```typescript
export const bookingGuests = pgTable("booking_guests", {
  id: uuid("id").defaultRandom().primaryKey(),
  bookingId: uuid("booking_id")
    .notNull()
    .references(() => bookings.id),
  memberId: uuid("member_id").references(() => members.id), // now nullable
  associateId: uuid("associate_id").references(() => associates.id), // new
  bedId: uuid("bed_id").references(() => beds.id),
  roomId: uuid("room_id").references(() => rooms.id),
  portaCotRequested: boolean("porta_cot_requested").notNull().default(false), // new
  pricePerNightCents: integer("price_per_night_cents").notNull(),
  totalAmountCents: integer("total_amount_cents").notNull(),
  snapshotTariffId: uuid("snapshot_tariff_id").references(() => tariffs.id),
  snapshotMembershipClassId: uuid("snapshot_membership_class_id").references(
    () => membershipClasses.id
  ),
});
```

- [ ] **Step 2: Add isGuestClass to membershipClasses in members.ts**

In `src/db/schema/members.ts`, add to the `membershipClasses` table definition:

```typescript
isGuestClass: boolean("is_guest_class").notNull().default(false),
```

Add it after the `annualFeeCents` field.

- [ ] **Step 3: Add portaCotCount to lodges in lodges.ts**

In `src/db/schema/lodges.ts`, add to the `lodges` table definition:

```typescript
portaCotCount: integer("porta_cot_count").notNull().default(0),
```

Add it after the `isActive` field.

- [ ] **Step 4: Add portaCotPricePerNightCents to tariffs in tariffs.ts**

In `src/db/schema/tariffs.ts`, add:

```typescript
portaCotPricePerNightCents: integer("porta_cot_price_per_night_cents"),
```

Add it after the `singleSupplementCents` field.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/bookings.ts src/db/schema/members.ts src/db/schema/lodges.ts src/db/schema/tariffs.ts
git commit -m "feat: extend schema for associates and port-a-cots"
```

---

### Task 3: Database Migration

**Files:**
- Create: `drizzle/0017_associates_and_portacot.sql`

- [ ] **Step 1: Generate the migration**

```bash
cd /opt/snowgum && npx drizzle-kit generate
```

Review the generated migration SQL. It should contain:
- CREATE TABLE associates
- ALTER TABLE booking_guests: make member_id nullable, add associate_id, add porta_cot_requested
- ALTER TABLE membership_classes: add is_guest_class
- ALTER TABLE lodges: add porta_cot_count
- ALTER TABLE tariffs: add porta_cot_price_per_night_cents

- [ ] **Step 2: Add check constraint to migration**

Append this to the generated migration SQL file:

```sql
ALTER TABLE "booking_guests" ADD CONSTRAINT "booking_guests_member_or_associate"
  CHECK (
    (member_id IS NOT NULL AND associate_id IS NULL) OR
    (member_id IS NULL AND associate_id IS NOT NULL)
  );
```

- [ ] **Step 3: Run migration locally to verify**

```bash
cd /opt/snowgum && npx drizzle-kit migrate
```

Expected: migration applies cleanly.

- [ ] **Step 4: Commit**

```bash
git add drizzle/
git commit -m "feat: migration for associates and port-a-cot schema"
```

---

### Task 4: Associate CRUD Server Actions

**Files:**
- Create: `src/actions/associates/index.ts`
- Create: `src/actions/associates/schemas.ts`

- [ ] **Step 1: Write unit tests for the Zod schemas**

Create `src/actions/associates/__tests__/schemas.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  createAssociateSchema,
  updateAssociateSchema,
} from "../schemas";

describe("createAssociateSchema", () => {
  it("accepts valid input", () => {
    const result = createAssociateSchema.safeParse({
      organisationId: "550e8400-e29b-41d4-a716-446655440000",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      phone: "0400000000",
      dateOfBirth: "1990-05-15",
    });
    expect(result.success).toBe(true);
  });

  it("requires firstName", () => {
    const result = createAssociateSchema.safeParse({
      organisationId: "550e8400-e29b-41d4-a716-446655440000",
      firstName: "",
      lastName: "Doe",
      email: "jane@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("requires valid email", () => {
    const result = createAssociateSchema.safeParse({
      organisationId: "550e8400-e29b-41d4-a716-446655440000",
      firstName: "Jane",
      lastName: "Doe",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("allows optional phone and dateOfBirth", () => {
    const result = createAssociateSchema.safeParse({
      organisationId: "550e8400-e29b-41d4-a716-446655440000",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
    });
    expect(result.success).toBe(true);
  });
});

describe("updateAssociateSchema", () => {
  it("accepts valid input with all fields", () => {
    const result = updateAssociateSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      firstName: "Updated",
      lastName: "Name",
      email: "updated@example.com",
      phone: "0411111111",
      dateOfBirth: "1985-01-01",
    });
    expect(result.success).toBe(true);
  });

  it("requires id", () => {
    const result = updateAssociateSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /opt/snowgum && npm test -- src/actions/associates/__tests__/schemas.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create the schemas file**

Create `src/actions/associates/schemas.ts`:

```typescript
import { z } from "zod";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format");

export const createAssociateSchema = z.object({
  organisationId: z.string().uuid(),
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Valid email is required"),
  phone: z.string().max(30).optional(),
  dateOfBirth: isoDateSchema.optional(),
});

export type CreateAssociateInput = z.infer<typeof createAssociateSchema>;

export const updateAssociateSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().max(30).optional().or(z.literal("")),
  dateOfBirth: isoDateSchema.optional().or(z.literal("")),
});

export type UpdateAssociateInput = z.infer<typeof updateAssociateSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /opt/snowgum && npm test -- src/actions/associates/__tests__/schemas.test.ts
```

Expected: PASS

- [ ] **Step 5: Create the associate CRUD server actions**

Create `src/actions/associates/index.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { associates } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  requireSession,
  authErrorToResult,
} from "@/lib/auth-guards";
import {
  createAssociateSchema,
  updateAssociateSchema,
  type CreateAssociateInput,
  type UpdateAssociateInput,
} from "./schemas";

type ActionResult = { success: true } | { success: false; error: string };

export async function createAssociate(
  input: CreateAssociateInput & { slug: string }
): Promise<ActionResult & { id?: string }> {
  try {
    const session = await requireSession(input.organisationId);
    const data = createAssociateSchema.parse(input);

    const [created] = await db
      .insert(associates)
      .values({
        organisationId: data.organisationId,
        ownerMemberId: session.memberId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone || null,
        dateOfBirth: data.dateOfBirth || null,
      })
      .returning();

    revalidatePath(`/${input.slug}/associates`);
    return { success: true, id: created.id };
  } catch (e) {
    const authResult = authErrorToResult(e);
    if (authResult) return authResult;
    throw e;
  }
}

export async function updateAssociate(
  input: UpdateAssociateInput & { organisationId: string; slug: string }
): Promise<ActionResult> {
  try {
    const session = await requireSession(input.organisationId);
    const data = updateAssociateSchema.parse(input);

    // Verify ownership
    const [existing] = await db
      .select({ ownerMemberId: associates.ownerMemberId })
      .from(associates)
      .where(
        and(
          eq(associates.id, data.id),
          eq(associates.organisationId, input.organisationId)
        )
      );

    if (!existing || existing.ownerMemberId !== session.memberId) {
      return { success: false, error: "Associate not found" };
    }

    await db
      .update(associates)
      .set({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone || null,
        dateOfBirth: data.dateOfBirth || null,
        updatedAt: new Date(),
      })
      .where(eq(associates.id, data.id));

    revalidatePath(`/${input.slug}/associates`);
    return { success: true };
  } catch (e) {
    const authResult = authErrorToResult(e);
    if (authResult) return authResult;
    throw e;
  }
}

export async function deleteAssociate(
  id: string,
  organisationId: string,
  slug: string
): Promise<ActionResult> {
  try {
    const session = await requireSession(organisationId);

    const [existing] = await db
      .select({ ownerMemberId: associates.ownerMemberId })
      .from(associates)
      .where(
        and(
          eq(associates.id, id),
          eq(associates.organisationId, organisationId)
        )
      );

    if (!existing || existing.ownerMemberId !== session.memberId) {
      return { success: false, error: "Associate not found" };
    }

    // Soft delete — preserve FK for historical bookings
    await db
      .update(associates)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(eq(associates.id, id));

    revalidatePath(`/${slug}/associates`);
    return { success: true };
  } catch (e) {
    const authResult = authErrorToResult(e);
    if (authResult) return authResult;
    throw e;
  }
}

export async function getMyAssociates(
  organisationId: string,
  memberId: string
) {
  return db
    .select({
      id: associates.id,
      firstName: associates.firstName,
      lastName: associates.lastName,
      email: associates.email,
      phone: associates.phone,
      dateOfBirth: associates.dateOfBirth,
    })
    .from(associates)
    .where(
      and(
        eq(associates.organisationId, organisationId),
        eq(associates.ownerMemberId, memberId),
        eq(associates.isDeleted, false)
      )
    );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/actions/associates/
git commit -m "feat: associate CRUD server actions with Zod schemas"
```

---

### Task 5: Associate CRUD Integration Tests

**Files:**
- Create: `src/actions/associates/__tests__/associates.integration.test.ts`

- [ ] **Step 1: Write integration tests**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Auth mock — will be set per test
let mockSession: { memberId: string; organisationId: string; role: string; firstName: string; lastName: string; email: string } | null = null;
vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn(async () => mockSession),
}));

import { getTestDb } from "@/db/test-db";
import { organisations, members, membershipClasses, organisationMembers, associates } from "@/db/schema";
import { createAssociate, updateAssociate, deleteAssociate, getMyAssociates } from "../index";

async function seedMember(opts: { slug: string; email: string; role: "MEMBER" | "ADMIN" }) {
  const db = await getTestDb();
  const [org] = await db.insert(organisations).values({ name: opts.slug, slug: opts.slug }).returning();
  const [mc] = await db.insert(membershipClasses).values({ organisationId: org.id, name: "Standard" }).returning();
  const [member] = await db.insert(members).values({
    organisationId: org.id,
    membershipClassId: mc.id,
    firstName: "Test",
    lastName: opts.email,
    email: opts.email,
  }).returning();
  await db.insert(organisationMembers).values({
    organisationId: org.id,
    memberId: member.id,
    role: opts.role,
    isActive: true,
  });
  return { orgId: org.id, memberId: member.id, slug: opts.slug };
}

function signInAs(member: { memberId: string; orgId: string; email: string }) {
  mockSession = {
    memberId: member.memberId,
    organisationId: member.orgId,
    role: "MEMBER",
    firstName: "Test",
    lastName: member.email,
    email: member.email,
  };
}

describe("associate CRUD (integration)", () => {
  beforeEach(() => {
    mockSession = null;
  });

  it("creates an associate owned by the session member", async () => {
    const m = await seedMember({ slug: "org1", email: "a@t.com", role: "MEMBER" });
    signInAs({ memberId: m.memberId, orgId: m.orgId, email: "a@t.com" });

    const result = await createAssociate({
      organisationId: m.orgId,
      firstName: "Jane",
      lastName: "Guest",
      email: "jane@guest.com",
      phone: "0400000000",
      slug: m.slug,
    });

    expect(result.success).toBe(true);
    expect("id" in result && result.id).toBeTruthy();

    const db = await getTestDb();
    const rows = await db.select().from(associates).where(eq(associates.organisationId, m.orgId));
    expect(rows).toHaveLength(1);
    expect(rows[0].firstName).toBe("Jane");
    expect(rows[0].ownerMemberId).toBe(m.memberId);
  });

  it("rejects unauthenticated create", async () => {
    mockSession = null;
    const result = await createAssociate({
      organisationId: "550e8400-e29b-41d4-a716-446655440000",
      firstName: "Jane",
      lastName: "Guest",
      email: "jane@guest.com",
      slug: "org1",
    });
    expect(result.success).toBe(false);
  });

  it("prevents updating another member's associate", async () => {
    const m1 = await seedMember({ slug: "org2", email: "m1@t.com", role: "MEMBER" });
    const m2 = await seedMember({ slug: "org3", email: "m2@t.com", role: "MEMBER" });

    signInAs({ memberId: m1.memberId, orgId: m1.orgId, email: "m1@t.com" });
    const created = await createAssociate({
      organisationId: m1.orgId,
      firstName: "Jane",
      lastName: "Guest",
      email: "jane@guest.com",
      slug: m1.slug,
    });

    // Sign in as different member, try to update
    signInAs({ memberId: m2.memberId, orgId: m2.orgId, email: "m2@t.com" });
    const updateResult = await updateAssociate({
      id: (created as { id: string }).id,
      organisationId: m2.orgId,
      firstName: "Hijacked",
      lastName: "Name",
      email: "hijack@evil.com",
      slug: m2.slug,
    });

    expect(updateResult.success).toBe(false);
    expect("error" in updateResult && updateResult.error).toMatch(/not found/i);
  });

  it("soft-deletes an associate", async () => {
    const m = await seedMember({ slug: "org4", email: "d@t.com", role: "MEMBER" });
    signInAs({ memberId: m.memberId, orgId: m.orgId, email: "d@t.com" });

    const created = await createAssociate({
      organisationId: m.orgId,
      firstName: "ToDelete",
      lastName: "Person",
      email: "del@test.com",
      slug: m.slug,
    });

    const id = (created as { id: string }).id;
    const deleteResult = await deleteAssociate(id, m.orgId, m.slug);
    expect(deleteResult.success).toBe(true);

    // getMyAssociates should NOT return soft-deleted
    const list = await getMyAssociates(m.orgId, m.memberId);
    expect(list).toHaveLength(0);

    // But row still exists in DB
    const db = await getTestDb();
    const rows = await db.select().from(associates).where(eq(associates.id, id));
    expect(rows).toHaveLength(1);
    expect(rows[0].isDeleted).toBe(true);
  });

  it("getMyAssociates only returns own associates", async () => {
    const m1 = await seedMember({ slug: "org5", email: "own1@t.com", role: "MEMBER" });
    signInAs({ memberId: m1.memberId, orgId: m1.orgId, email: "own1@t.com" });

    await createAssociate({
      organisationId: m1.orgId,
      firstName: "Mine",
      lastName: "Associate",
      email: "mine@test.com",
      slug: m1.slug,
    });

    const list = await getMyAssociates(m1.orgId, m1.memberId);
    expect(list).toHaveLength(1);
    expect(list[0].firstName).toBe("Mine");

    // Different member sees nothing
    const m2 = await seedMember({ slug: "org6", email: "own2@t.com", role: "MEMBER" });
    const list2 = await getMyAssociates(m2.orgId, m2.memberId);
    expect(list2).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run integration tests**

```bash
cd /opt/snowgum && npm run test:integration -- src/actions/associates/__tests__/associates.integration.test.ts
```

Expected: PASS (all tests green after migration applied to pglite).

- [ ] **Step 3: Commit**

```bash
git add src/actions/associates/__tests__/
git commit -m "test: integration tests for associate CRUD"
```

---

### Task 6: Port-a-Cot Availability Check

**Files:**
- Create: `src/actions/bookings/portacot.ts`
- Create: `src/actions/bookings/__tests__/portacot.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `src/actions/bookings/__tests__/portacot.integration.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let mockSession: { memberId: string; organisationId: string; role: string; firstName: string; lastName: string; email: string } | null = null;
vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn(async () => mockSession),
}));

import { getTestDb } from "@/db/test-db";
import {
  organisations,
  members,
  membershipClasses,
  organisationMembers,
  lodges,
  bookings,
  bookingGuests,
  bookingRounds,
  seasons,
  rooms,
  beds,
} from "@/db/schema";
import { getPortaCotAvailability } from "../portacot";

async function seedLodgeWithCots(cotCount: number) {
  const db = await getTestDb();
  const [org] = await db.insert(organisations).values({ name: "CotOrg", slug: "cot-org" }).returning();
  const [mc] = await db.insert(membershipClasses).values({ organisationId: org.id, name: "Standard" }).returning();
  const [member] = await db.insert(members).values({
    organisationId: org.id,
    membershipClassId: mc.id,
    firstName: "Test",
    lastName: "User",
    email: "cot@test.com",
  }).returning();
  await db.insert(organisationMembers).values({
    organisationId: org.id,
    memberId: member.id,
    role: "MEMBER",
    isActive: true,
  });
  const [lodge] = await db.insert(lodges).values({
    organisationId: org.id,
    name: "Cot Lodge",
    totalBeds: 10,
    portaCotCount: cotCount,
  }).returning();
  const [season] = await db.insert(seasons).values({
    organisationId: org.id,
    name: "Winter 2027",
    startDate: "2027-06-01",
    endDate: "2027-09-30",
    isActive: true,
  }).returning();
  const [round] = await db.insert(bookingRounds).values({
    seasonId: season.id,
    name: "Round 1",
    opensAt: new Date("2027-01-01"),
    closesAt: new Date("2027-12-01"),
    requiresApproval: false,
  }).returning();
  const [room] = await db.insert(rooms).values({
    lodgeId: lodge.id,
    name: "Room 1",
    capacity: 4,
  }).returning();
  const bedRows = [];
  for (let i = 0; i < 4; i++) {
    const [bed] = await db.insert(beds).values({
      roomId: room.id,
      label: `Bed ${i + 1}`,
      sortOrder: i,
    }).returning();
    bedRows.push(bed);
  }
  return { org, member, mc, lodge, season, round, room, beds: bedRows };
}

describe("getPortaCotAvailability", () => {
  it("returns full count when no cots are booked", async () => {
    const { lodge } = await seedLodgeWithCots(3);
    const result = await getPortaCotAvailability(lodge.id, "2027-07-10", "2027-07-15");
    expect(result).toEqual({ total: 3, booked: 0, available: 3 });
  });

  it("subtracts cots from overlapping confirmed bookings", async () => {
    const { lodge, member, mc, round, beds: bedRows, org } = await seedLodgeWithCots(2);
    const db = await getTestDb();

    // Create a booking with 1 cot guest
    const [booking] = await db.insert(bookings).values({
      organisationId: org.id,
      lodgeId: lodge.id,
      bookingRoundId: round.id,
      primaryMemberId: member.id,
      status: "CONFIRMED",
      checkInDate: "2027-07-10",
      checkOutDate: "2027-07-15",
      totalNights: 5,
      subtotalCents: 10000,
      totalAmountCents: 10000,
      bookingReference: "TEST-COT-001",
    }).returning();

    await db.insert(bookingGuests).values({
      bookingId: booking.id,
      memberId: member.id,
      bedId: bedRows[0].id,
      roomId: null,
      portaCotRequested: true,
      pricePerNightCents: 2000,
      totalAmountCents: 10000,
    });

    const result = await getPortaCotAvailability(lodge.id, "2027-07-12", "2027-07-17");
    expect(result).toEqual({ total: 2, booked: 1, available: 1 });
  });

  it("ignores cancelled bookings", async () => {
    const { lodge, member, mc, round, beds: bedRows, org } = await seedLodgeWithCots(1);
    const db = await getTestDb();

    const [booking] = await db.insert(bookings).values({
      organisationId: org.id,
      lodgeId: lodge.id,
      bookingRoundId: round.id,
      primaryMemberId: member.id,
      status: "CANCELLED",
      checkInDate: "2027-07-10",
      checkOutDate: "2027-07-15",
      totalNights: 5,
      subtotalCents: 10000,
      totalAmountCents: 10000,
      bookingReference: "TEST-COT-002",
    }).returning();

    await db.insert(bookingGuests).values({
      bookingId: booking.id,
      memberId: member.id,
      bedId: bedRows[0].id,
      portaCotRequested: true,
      pricePerNightCents: 2000,
      totalAmountCents: 10000,
    });

    const result = await getPortaCotAvailability(lodge.id, "2027-07-10", "2027-07-15");
    expect(result).toEqual({ total: 1, booked: 0, available: 1 });
  });

  it("ignores non-overlapping bookings", async () => {
    const { lodge, member, round, beds: bedRows, org } = await seedLodgeWithCots(1);
    const db = await getTestDb();

    const [booking] = await db.insert(bookings).values({
      organisationId: org.id,
      lodgeId: lodge.id,
      bookingRoundId: round.id,
      primaryMemberId: member.id,
      status: "CONFIRMED",
      checkInDate: "2027-07-01",
      checkOutDate: "2027-07-05",
      totalNights: 4,
      subtotalCents: 8000,
      totalAmountCents: 8000,
      bookingReference: "TEST-COT-003",
    }).returning();

    await db.insert(bookingGuests).values({
      bookingId: booking.id,
      memberId: member.id,
      bedId: bedRows[0].id,
      portaCotRequested: true,
      pricePerNightCents: 2000,
      totalAmountCents: 8000,
    });

    // Query dates that don't overlap
    const result = await getPortaCotAvailability(lodge.id, "2027-07-10", "2027-07-15");
    expect(result).toEqual({ total: 1, booked: 0, available: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /opt/snowgum && npm run test:integration -- src/actions/bookings/__tests__/portacot.integration.test.ts
```

Expected: FAIL — `getPortaCotAvailability` not found.

- [ ] **Step 3: Implement getPortaCotAvailability**

Create `src/actions/bookings/portacot.ts`:

```typescript
import { db } from "@/db/index";
import { lodges, bookings, bookingGuests } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

export type PortaCotAvailability = {
  total: number;
  booked: number;
  available: number;
};

/**
 * Check how many port-a-cots are available at a lodge for a date range.
 * Counts cots from confirmed/pending bookings that overlap the range.
 */
export async function getPortaCotAvailability(
  lodgeId: string,
  checkInDate: string,
  checkOutDate: string
): Promise<PortaCotAvailability> {
  const [lodge] = await db
    .select({ portaCotCount: lodges.portaCotCount })
    .from(lodges)
    .where(eq(lodges.id, lodgeId));

  if (!lodge) {
    return { total: 0, booked: 0, available: 0 };
  }

  const result = await db.execute(
    sql`SELECT COUNT(*)::int AS booked_cots
        FROM booking_guests bg
        JOIN bookings b ON b.id = bg.booking_id
        WHERE b.lodge_id = ${lodgeId}
        AND b.status NOT IN ('CANCELLED')
        AND b.check_in_date < ${checkOutDate}
        AND b.check_out_date > ${checkInDate}
        AND bg.porta_cot_requested = true`
  );

  const bookedCots = (result as unknown as { booked_cots: number }[])[0]?.booked_cots ?? 0;

  return {
    total: lodge.portaCotCount,
    booked: bookedCots,
    available: Math.max(0, lodge.portaCotCount - bookedCots),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /opt/snowgum && npm run test:integration -- src/actions/bookings/__tests__/portacot.integration.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/bookings/portacot.ts src/actions/bookings/__tests__/portacot.integration.test.ts
git commit -m "feat: port-a-cot availability check with integration tests"
```

---

### Task 7: Port-a-Cot Pricing Logic

**Files:**
- Modify: `src/actions/bookings/pricing.ts`
- Modify: `src/actions/bookings/__tests__/pricing.test.ts`

- [ ] **Step 1: Write failing unit tests for cot pricing**

Add to `src/actions/bookings/__tests__/pricing.test.ts`:

```typescript
import { calculatePortaCotPrice } from "../pricing";

describe("calculatePortaCotPrice", () => {
  it("calculates flat rate times nights", () => {
    const result = calculatePortaCotPrice({
      checkInDate: "2025-07-07",
      checkOutDate: "2025-07-10",
      portaCotPricePerNightCents: 2500,
    });
    expect(result.totalCents).toBe(7500); // 3 nights x 2500
    expect(result.nightCount).toBe(3);
    expect(result.pricePerNightCents).toBe(2500);
  });

  it("calculates single night", () => {
    const result = calculatePortaCotPrice({
      checkInDate: "2025-07-07",
      checkOutDate: "2025-07-08",
      portaCotPricePerNightCents: 3000,
    });
    expect(result.totalCents).toBe(3000);
    expect(result.nightCount).toBe(1);
  });

  it("calculates week stay", () => {
    const result = calculatePortaCotPrice({
      checkInDate: "2025-07-07",
      checkOutDate: "2025-07-14",
      portaCotPricePerNightCents: 2000,
    });
    expect(result.totalCents).toBe(14000); // 7 nights x 2000
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /opt/snowgum && npm test -- src/actions/bookings/__tests__/pricing.test.ts
```

Expected: FAIL — `calculatePortaCotPrice` not found.

- [ ] **Step 3: Implement calculatePortaCotPrice**

Add to `src/actions/bookings/pricing.ts`:

```typescript
export type PortaCotPriceResult = {
  totalCents: number;
  nightCount: number;
  pricePerNightCents: number;
};

type PortaCotPriceInput = {
  checkInDate: string;
  checkOutDate: string;
  portaCotPricePerNightCents: number;
};

/**
 * Calculate the price for a port-a-cot. Flat rate per night,
 * no weekday/weekend variation, no multi-night discounts.
 */
export function calculatePortaCotPrice(
  input: PortaCotPriceInput
): PortaCotPriceResult {
  const nightCount = countNights(input.checkInDate, input.checkOutDate);
  return {
    totalCents: nightCount * input.portaCotPricePerNightCents,
    nightCount,
    pricePerNightCents: input.portaCotPricePerNightCents,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /opt/snowgum && npm test -- src/actions/bookings/__tests__/pricing.test.ts
```

Expected: PASS (all existing + new tests)

- [ ] **Step 5: Commit**

```bash
git add src/actions/bookings/pricing.ts src/actions/bookings/__tests__/pricing.test.ts
git commit -m "feat: port-a-cot flat-rate pricing calculation"
```

---

### Task 8: Extend Booking Schemas for Associates and Cots

**Files:**
- Modify: `src/actions/bookings/schemas.ts`
- Modify: `src/actions/bookings/__tests__/schemas.test.ts`

- [ ] **Step 1: Write failing tests for extended schema**

Add to `src/actions/bookings/__tests__/schemas.test.ts`:

```typescript
import { createBookingSchema } from "../schemas";

describe("createBookingSchema — associate guests", () => {
  const base = {
    organisationId: "550e8400-e29b-41d4-a716-446655440000",
    lodgeId: "550e8400-e29b-41d4-a716-446655440001",
    bookingRoundId: "550e8400-e29b-41d4-a716-446655440002",
    checkInDate: "2027-07-10",
    checkOutDate: "2027-07-15",
  };

  it("accepts a guest with memberId and bedId", () => {
    const result = createBookingSchema.safeParse({
      ...base,
      guests: [{ memberId: "550e8400-e29b-41d4-a716-446655440003", bedId: "550e8400-e29b-41d4-a716-446655440004" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a guest with associateId and bedId", () => {
    const result = createBookingSchema.safeParse({
      ...base,
      guests: [{ associateId: "550e8400-e29b-41d4-a716-446655440005", bedId: "550e8400-e29b-41d4-a716-446655440004" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a cot guest with associateId and no bedId", () => {
    const result = createBookingSchema.safeParse({
      ...base,
      guests: [{ associateId: "550e8400-e29b-41d4-a716-446655440005", portaCotRequested: true }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects guest with neither memberId nor associateId", () => {
    const result = createBookingSchema.safeParse({
      ...base,
      guests: [{ bedId: "550e8400-e29b-41d4-a716-446655440004" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects guest with both memberId and associateId", () => {
    const result = createBookingSchema.safeParse({
      ...base,
      guests: [{
        memberId: "550e8400-e29b-41d4-a716-446655440003",
        associateId: "550e8400-e29b-41d4-a716-446655440005",
        bedId: "550e8400-e29b-41d4-a716-446655440004",
      }],
    });
    expect(result.success).toBe(false);
  });

  it("requires bedId when portaCotRequested is false or absent", () => {
    const result = createBookingSchema.safeParse({
      ...base,
      guests: [{ memberId: "550e8400-e29b-41d4-a716-446655440003" }],
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /opt/snowgum && npm test -- src/actions/bookings/__tests__/schemas.test.ts
```

Expected: FAIL — new fields not accepted/validated.

- [ ] **Step 3: Update the booking guest schema**

Replace the `bookingGuestSchema` in `src/actions/bookings/schemas.ts`:

```typescript
const bookingGuestSchema = z
  .object({
    memberId: z.string().uuid().optional(),
    associateId: z.string().uuid().optional(),
    bedId: z.string().uuid().optional(),
    roomId: z.string().uuid().optional(),
    portaCotRequested: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    // Must have exactly one of memberId or associateId
    const hasMember = !!data.memberId;
    const hasAssociate = !!data.associateId;
    if (hasMember === hasAssociate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Guest must have exactly one of memberId or associateId",
      });
    }
    // Must have bedId unless portaCotRequested
    if (!data.portaCotRequested && !data.bedId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "bedId is required unless portaCotRequested is true",
        path: ["bedId"],
      });
    }
  });
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /opt/snowgum && npm test -- src/actions/bookings/__tests__/schemas.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/bookings/schemas.ts src/actions/bookings/__tests__/schemas.test.ts
git commit -m "feat: extend booking schema for associates and port-a-cots"
```

---

### Task 9: Extend createBooking Action for Associates and Cots

**Files:**
- Modify: `src/actions/bookings/create.ts`

This is the most complex task. The `createBooking` action needs to:
1. Handle guests that have `associateId` instead of `memberId`
2. Look up the guest tariff class for associates
3. Handle `portaCotRequested` guests (skip bed conflict check, use cot pricing)
4. Validate port-a-cot availability

- [ ] **Step 1: Update imports in create.ts**

Add to the imports in `src/actions/bookings/create.ts`:

```typescript
import { associates } from "@/db/schema";
import { membershipClasses } from "@/db/schema";
import { calculatePortaCotPrice, type PortaCotPriceResult } from "./pricing";
import { getPortaCotAvailability } from "./portacot";
```

- [ ] **Step 2: Add guest tariff class lookup helper**

Add this inside `create.ts`, before the `createBooking` function:

```typescript
/**
 * Get the membership class ID to use for tariff lookup.
 * For members: their own class. For associates: the org's guest class.
 */
async function getGuestTariffClassId(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  guest: { memberId?: string; associateId?: string },
  organisationId: string
): Promise<string | null> {
  if (guest.memberId) {
    const [member] = await tx
      .select({ membershipClassId: members.membershipClassId })
      .from(members)
      .where(eq(members.id, guest.memberId));
    return member?.membershipClassId ?? null;
  }

  // Associate — use the org's guest class
  const [guestClass] = await tx
    .select({ id: membershipClasses.id })
    .from(membershipClasses)
    .where(
      and(
        eq(membershipClasses.organisationId, organisationId),
        eq(membershipClasses.isGuestClass, true)
      )
    );

  if (!guestClass) {
    throw new Error("Guest pricing not configured for this organisation. Contact your administrator.");
  }

  return guestClass.id;
}
```

- [ ] **Step 3: Modify the transaction block in createBooking**

Replace the guest pricing loop inside the transaction (the `for (const guest of data.guests)` block starting around line 153) with logic that:

1. Skips bed conflict check for cot guests (`guest.portaCotRequested`)
2. Calls `getGuestTariffClassId` instead of directly querying member class
3. For cot guests: uses `calculatePortaCotPrice` instead of `calculateGuestPrice`
4. Before the loop: validates port-a-cot availability

Add before the bed conflict check loop:

```typescript
// Validate port-a-cot availability
const cotGuests = data.guests.filter((g) => g.portaCotRequested);
if (cotGuests.length > 0) {
  const cotAvail = await getPortaCotAvailability(
    data.lodgeId,
    data.checkInDate,
    data.checkOutDate
  );
  if (cotGuests.length > cotAvail.available) {
    throw new Error(
      `Only ${cotAvail.available} port-a-cot${cotAvail.available === 1 ? "" : "s"} available for these dates.`
    );
  }
}
```

Replace the bed conflict check to skip cot guests:

```typescript
// Verify each bed-assigned guest's bed is still available
for (const guest of data.guests) {
  if (guest.portaCotRequested || !guest.bedId) continue; // cot guests skip bed check

  const conflicting = await tx.execute(
    sql`SELECT bg.bed_id FROM booking_guests bg
        JOIN bookings b ON b.id = bg.booking_id
        WHERE bg.bed_id = ${guest.bedId}
        AND b.lodge_id = ${data.lodgeId}
        AND b.status NOT IN ('CANCELLED')
        AND b.check_in_date < ${data.checkOutDate}
        AND b.check_out_date > ${data.checkInDate}`
  );

  if (conflicting && (conflicting as unknown[]).length > 0) {
    throw new Error(`Bed is no longer available`);
  }
}
```

Replace the guest pricing loop:

```typescript
const guestPrices: {
  memberId: string | null;
  associateId: string | null;
  bedId: string | null;
  roomId: string | null;
  portaCotRequested: boolean;
  price: GuestPriceResult | null;
  cotPrice: PortaCotPriceResult | null;
  tariffId: string | null;
  membershipClassId: string | null;
}[] = [];

for (const guest of data.guests) {
  const guestClassId = await getGuestTariffClassId(tx, guest, data.organisationId);

  // Look up tariff: class-specific first, then default
  let tariff = null;
  if (guestClassId) {
    const [classTariff] = await tx
      .select()
      .from(tariffs)
      .where(
        and(
          eq(tariffs.lodgeId, data.lodgeId),
          eq(tariffs.seasonId, season.id),
          eq(tariffs.membershipClassId, guestClassId)
        )
      );
    tariff = classTariff ?? null;
  }

  if (!tariff) {
    const [defaultTariff] = await tx
      .select()
      .from(tariffs)
      .where(
        and(
          eq(tariffs.lodgeId, data.lodgeId),
          eq(tariffs.seasonId, season.id),
          sql`${tariffs.membershipClassId} IS NULL`
        )
      );
    tariff = defaultTariff ?? null;
  }

  if (!tariff) {
    throw new Error(
      "No tariff found for this lodge and season. Contact your administrator."
    );
  }

  if (guest.portaCotRequested) {
    if (tariff.portaCotPricePerNightCents == null) {
      throw new Error("Port-a-cot pricing not configured for this tariff.");
    }
    const cotPrice = calculatePortaCotPrice({
      checkInDate: data.checkInDate,
      checkOutDate: data.checkOutDate,
      portaCotPricePerNightCents: tariff.portaCotPricePerNightCents,
    });
    guestPrices.push({
      memberId: guest.memberId ?? null,
      associateId: guest.associateId ?? null,
      bedId: null,
      roomId: null,
      portaCotRequested: true,
      price: null,
      cotPrice,
      tariffId: tariff.id,
      membershipClassId: guestClassId,
    });
  } else {
    const price = calculateGuestPrice({
      checkInDate: data.checkInDate,
      checkOutDate: data.checkOutDate,
      pricePerNightWeekdayCents: tariff.pricePerNightWeekdayCents,
      pricePerNightWeekendCents: tariff.pricePerNightWeekendCents,
      discountFiveNightsBps: tariff.discountFiveNightsBps,
      discountSevenNightsBps: tariff.discountSevenNightsBps,
    });
    guestPrices.push({
      memberId: guest.memberId ?? null,
      associateId: guest.associateId ?? null,
      bedId: guest.bedId ?? null,
      roomId: guest.roomId ?? null,
      portaCotRequested: false,
      price,
      cotPrice: null,
      tariffId: tariff.id,
      membershipClassId: guestClassId,
    });
  }
}
```

Update the booking total calculation:

```typescript
const bedGuestPrices = guestPrices
  .filter((g) => g.price !== null)
  .map((g) => g.price!);
const cotTotals = guestPrices
  .filter((g) => g.cotPrice !== null)
  .map((g) => g.cotPrice!.totalCents);

const bookingTotal = calculateBookingPrice(bedGuestPrices);
const cotTotal = cotTotals.reduce((sum, c) => sum + c, 0);

// Add cot total to booking total
bookingTotal.subtotalCents += cotTotal;
bookingTotal.totalAmountCents += cotTotal;
```

Update the bookingGuests insert:

```typescript
for (const gp of guestPrices) {
  const totalCents = gp.portaCotRequested
    ? gp.cotPrice!.totalCents
    : gp.price!.totalCents;
  const perNightCents = gp.portaCotRequested
    ? gp.cotPrice!.pricePerNightCents
    : gp.price!.blendedPerNightCents;

  await tx.insert(bookingGuests).values({
    bookingId: booking.id,
    memberId: gp.memberId,
    associateId: gp.associateId,
    bedId: gp.bedId,
    roomId: gp.roomId,
    portaCotRequested: gp.portaCotRequested,
    pricePerNightCents: perNightCents,
    totalAmountCents: totalCents,
    snapshotTariffId: gp.tariffId,
    snapshotMembershipClassId: gp.membershipClassId,
  });
}
```

Update the availability_cache increment to only count bed guests:

```typescript
const bedGuestCount = data.guests.filter((g) => !g.portaCotRequested).length;
if (bedGuestCount > 0) {
  for (const nightDate of nightDates) {
    await tx.execute(
      sql`UPDATE availability_cache
          SET booked_beds = booked_beds + ${bedGuestCount},
              version = version + 1,
              updated_at = NOW()
          WHERE lodge_id = ${data.lodgeId}
          AND date = ${nightDate}`
    );
  }
}
```

Update the email guest names section to include associates:

```typescript
// Get guest names for email — members
const memberGuestIds = data.guests.filter((g) => g.memberId).map((g) => g.memberId!);
const associateGuestIds = data.guests.filter((g) => g.associateId).map((g) => g.associateId!);

let guestNames: { firstName: string; lastName: string }[] = [];

if (memberGuestIds.length > 0) {
  const memberRows = await db
    .select({ firstName: members.firstName, lastName: members.lastName })
    .from(members)
    .where(sql`${members.id} IN (${sql.join(memberGuestIds.map(id => sql`${id}`), sql`, `)})`);
  guestNames.push(...memberRows);
}

if (associateGuestIds.length > 0) {
  const assocRows = await db
    .select({ firstName: associates.firstName, lastName: associates.lastName })
    .from(associates)
    .where(sql`${associates.id} IN (${sql.join(associateGuestIds.map(id => sql`${id}`), sql`, `)})`);
  guestNames.push(...assocRows);
}
```

Replace the `guestMembers` references in the email sends with `guestNames`.

- [ ] **Step 4: Commit**

```bash
git add src/actions/bookings/create.ts
git commit -m "feat: extend createBooking for associates and port-a-cots"
```

---

### Task 10: Booking Context — Extend Guest Type for Associates and Cots

**Files:**
- Modify: `src/app/[slug]/book/booking-context.tsx`

- [ ] **Step 1: Extend the Guest type**

In `src/app/[slug]/book/booking-context.tsx`, replace the `Guest` type:

```typescript
type Guest = {
  memberId?: string;
  associateId?: string;
  firstName: string;
  lastName: string;
  membershipClassName: string;
  portaCotRequested?: boolean;
};
```

Note: each guest has either `memberId` or `associateId`, never both.

- [ ] **Step 2: Extend BedAssignment to use a generic guestKey**

The BedAssignment currently uses `memberId` as the key. Since guests can now be associates, we need a stable key. Add a helper and update the type:

```typescript
type BedAssignment = {
  guestKey: string; // memberId or associateId
  bedId: string;
  bedLabel: string;
  roomId: string;
  roomName: string;
};
```

- [ ] **Step 3: Add a guestKey helper**

Add above the context:

```typescript
export function guestKey(guest: Guest): string {
  return guest.memberId ?? guest.associateId ?? "";
}
```

- [ ] **Step 4: Update context methods that use memberId**

Update `removeGuest`, `addBedAssignment`, `removeBedAssignment` to use `guestKey`:

```typescript
removeGuest: (key: string) =>
  update({
    guests: state.guests.filter((g) => guestKey(g) !== key),
    bedAssignments: state.bedAssignments.filter((a) => a.guestKey !== key),
  }),
addBedAssignment: (assignment) =>
  update({
    bedAssignments: [
      ...state.bedAssignments.filter((a) => a.guestKey !== assignment.guestKey),
      assignment,
    ],
  }),
removeBedAssignment: (key: string) =>
  update({
    bedAssignments: state.bedAssignments.filter((a) => a.guestKey !== key),
  }),
```

- [ ] **Step 5: Update GuestPriceInfo**

```typescript
export type GuestPriceInfo = {
  guestKey: string;
  firstName: string;
  lastName: string;
  membershipClassName: string;
  bedLabel: string;
  roomName: string;
  subtotalCents: number;
  discountAmountCents: number;
  totalCents: number;
  blendedPerNightCents: number;
  portaCotRequested?: boolean;
};
```

- [ ] **Step 6: Commit**

```bash
git add src/app/[slug]/book/booking-context.tsx
git commit -m "feat: extend booking context for associates and port-a-cots"
```

---

### Task 11: Add Guests Step — Associate Tab and Cot Toggle

**Files:**
- Modify: `src/app/[slug]/book/steps/add-guests.tsx`
- Create: `src/app/[slug]/book/steps/add-associate-form.tsx`

- [ ] **Step 1: Create the inline associate form component**

Create `src/app/[slug]/book/steps/add-associate-form.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { createAssociate } from "@/actions/associates";

type Props = {
  organisationId: string;
  slug: string;
  onAdded: (associate: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  }) => void;
  onCancel: () => void;
};

export function AddAssociateForm({
  organisationId,
  slug,
  onAdded,
  onCancel,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveForFuture, setSaveForFuture] = useState(true);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const firstName = form.get("firstName") as string;
    const lastName = form.get("lastName") as string;
    const email = form.get("email") as string;
    const phone = form.get("phone") as string;
    const dateOfBirth = form.get("dateOfBirth") as string;

    try {
      const result = await createAssociate({
        organisationId,
        firstName,
        lastName,
        email,
        phone: phone || undefined,
        dateOfBirth: dateOfBirth || undefined,
        slug,
      });

      if (!result.success) {
        setError("error" in result ? result.error : "Failed to add associate");
        return;
      }

      onAdded({
        id: result.id!,
        firstName,
        lastName,
        email,
      });
    } catch {
      setError("Failed to add associate");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border p-4">
      <h3 className="text-sm font-medium">Add New Associate</h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="assoc-fn">First Name</Label>
          <Input id="assoc-fn" name="firstName" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="assoc-ln">Last Name</Label>
          <Input id="assoc-ln" name="lastName" required />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="assoc-email">Email</Label>
        <Input id="assoc-email" name="email" type="email" required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="assoc-phone">Phone (optional)</Label>
          <Input id="assoc-phone" name="phone" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="assoc-dob">Date of Birth (optional)</Label>
          <Input id="assoc-dob" name="dateOfBirth" type="date" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="save-future"
          checked={saveForFuture}
          onCheckedChange={(checked) => setSaveForFuture(!!checked)}
        />
        <Label htmlFor="save-future" className="text-sm font-normal">
          Save for future bookings
        </Label>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Adding..." : "Add to Booking"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Rewrite the AddGuests component**

Replace `src/app/[slug]/book/steps/add-guests.tsx` with the updated version that adds:
- Tab switching between "Members" and "My Associates"
- "Add New Associate" button that shows the inline form
- Port-a-cot toggle per guest row
- Port-a-cot availability counter

```typescript
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useBooking, guestKey } from "../booking-context";
import { getBookableMembers } from "@/actions/bookings/members";
import { getMyAssociates } from "@/actions/associates";
import { getPortaCotAvailability } from "@/actions/bookings/portacot";
import { AddAssociateForm } from "./add-associate-form";

type Props = {
  organisationId: string;
  slug: string;
  memberId: string;
  memberName: string;
  membershipClassId: string;
};

type MemberOption = {
  id: string;
  firstName: string;
  lastName: string;
  primaryMemberId: string | null;
  membershipClassName: string;
};

type AssociateOption = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  dateOfBirth: string | null;
};

export function AddGuests({
  organisationId,
  slug,
  memberId,
  memberName,
  membershipClassId,
}: Props) {
  const booking = useBooking();
  const [allMembers, setAllMembers] = useState<MemberOption[]>([]);
  const [myAssociates, setMyAssociates] = useState<AssociateOption[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"members" | "associates">("members");
  const [showAddForm, setShowAddForm] = useState(false);
  const [cotAvailability, setCotAvailability] = useState<{
    total: number;
    available: number;
  } | null>(null);

  // Auto-add primary member on first load
  useEffect(() => {
    if (booking.guests.length === 0) {
      const [firstName, ...rest] = memberName.split(" ");
      booking.setGuests([
        {
          memberId,
          firstName,
          lastName: rest.join(" "),
          membershipClassName: "",
        },
      ]);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load bookable members + associates + cot availability
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [memberResults, associateResults] = await Promise.all([
          getBookableMembers(organisationId, memberId),
          getMyAssociates(organisationId, memberId),
        ]);
        setAllMembers(memberResults);
        setMyAssociates(associateResults);

        // Update primary member's class name if we have it
        const primary = memberResults.find((m) => m.id === memberId);
        if (primary && booking.guests.length > 0) {
          booking.setGuests(
            booking.guests.map((g) =>
              g.memberId === memberId
                ? { ...g, membershipClassName: primary.membershipClassName }
                : g
            )
          );
        }

        // Load cot availability
        if (booking.lodgeId && booking.checkInDate && booking.checkOutDate) {
          const cotResult = await getPortaCotAvailability(
            booking.lodgeId,
            booking.checkInDate,
            booking.checkOutDate
          );
          setCotAvailability({ total: cotResult.total, available: cotResult.available });
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [organisationId, memberId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedKeys = new Set(booking.guests.map((g) => guestKey(g)));

  const filteredMembers = allMembers.filter((m) => {
    if (selectedKeys.has(m.id)) return false;
    if (!search) return true;
    const name = `${m.firstName} ${m.lastName}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const filteredAssociates = myAssociates.filter((a) => {
    if (selectedKeys.has(a.id)) return false;
    if (!search) return true;
    const name = `${a.firstName} ${a.lastName}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  function handleAddMember(member: MemberOption) {
    booking.addGuest({
      memberId: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      membershipClassName: member.membershipClassName,
    });
    setSearch("");
  }

  function handleAddAssociate(assoc: AssociateOption) {
    booking.addGuest({
      associateId: assoc.id,
      firstName: assoc.firstName,
      lastName: assoc.lastName,
      membershipClassName: "Guest",
    });
    setSearch("");
  }

  function handleNewAssociateAdded(assoc: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  }) {
    booking.addGuest({
      associateId: assoc.id,
      firstName: assoc.firstName,
      lastName: assoc.lastName,
      membershipClassName: "Guest",
    });
    setShowAddForm(false);
    // Refresh associates list
    getMyAssociates(organisationId, memberId).then(setMyAssociates);
  }

  function handleRemoveGuest(key: string) {
    if (key === memberId) return; // Cannot remove primary
    booking.removeGuest(key);
  }

  function handleToggleCot(key: string) {
    booking.setGuests(
      booking.guests.map((g) =>
        guestKey(g) === key
          ? { ...g, portaCotRequested: !g.portaCotRequested }
          : g
      )
    );
  }

  const cotRequestedCount = booking.guests.filter(
    (g) => g.portaCotRequested
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Guests</h2>
        <p className="text-sm text-muted-foreground mb-4">
          You are automatically included. Add additional members or associates below.
        </p>

        {/* Guest list */}
        <div className="space-y-2 mb-4">
          {booking.guests.map((guest) => {
            const key = guestKey(guest);
            const isAssociate = !!guest.associateId;
            return (
              <div
                key={key}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-medium">
                      {guest.firstName} {guest.lastName}
                    </p>
                    <div className="flex gap-1 mt-0.5">
                      {isAssociate ? (
                        <Badge variant="outline" className="text-xs">
                          Guest
                        </Badge>
                      ) : (
                        guest.membershipClassName && (
                          <Badge variant="secondary" className="text-xs">
                            {guest.membershipClassName}
                          </Badge>
                        )
                      )}
                      {guest.portaCotRequested && (
                        <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950/20">
                          Port-a-cot
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Port-a-cot toggle */}
                  {cotAvailability && cotAvailability.total > 0 && key !== memberId && (
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <Checkbox
                        checked={!!guest.portaCotRequested}
                        onCheckedChange={() => handleToggleCot(key)}
                        disabled={
                          !guest.portaCotRequested &&
                          cotRequestedCount >= cotAvailability.available
                        }
                      />
                      Cot
                    </label>
                  )}
                  {key === memberId ? (
                    <Badge>Primary</Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveGuest(key)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Cot availability info */}
        {cotAvailability && cotAvailability.total > 0 && (
          <p className="text-xs text-muted-foreground mb-3">
            Port-a-cots: {cotAvailability.available - cotRequestedCount} of{" "}
            {cotAvailability.total} available
          </p>
        )}

        {/* Tab selector */}
        <div className="flex gap-2 mb-3">
          <Button
            variant={tab === "members" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("members")}
          >
            Members
          </Button>
          <Button
            variant={tab === "associates" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("associates")}
          >
            My Associates
          </Button>
        </div>

        {/* Search */}
        <Input
          placeholder={
            tab === "members"
              ? "Search members to add..."
              : "Search associates to add..."
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2"
        />

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : tab === "members" ? (
          search.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border">
              {filteredMembers.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  No matching members found.
                </p>
              ) : (
                filteredMembers.slice(0, 10).map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50 border-b last:border-b-0"
                    onClick={() => handleAddMember(member)}
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {member.firstName} {member.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {member.membershipClassName}
                      </p>
                    </div>
                    <span className="text-xs text-primary">+ Add</span>
                  </button>
                ))
              )}
            </div>
          )
        ) : (
          <>
            {/* Associates list */}
            {search.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border mb-3">
                {filteredAssociates.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    No matching associates found.
                  </p>
                ) : (
                  filteredAssociates.slice(0, 10).map((assoc) => (
                    <button
                      key={assoc.id}
                      type="button"
                      className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50 border-b last:border-b-0"
                      onClick={() => handleAddAssociate(assoc)}
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {assoc.firstName} {assoc.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {assoc.email}
                        </p>
                      </div>
                      <span className="text-xs text-primary">+ Add</span>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Add new associate */}
            {showAddForm ? (
              <AddAssociateForm
                organisationId={organisationId}
                slug={slug}
                onAdded={handleNewAssociateAdded}
                onCancel={() => setShowAddForm(false)}
              />
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddForm(true)}
              >
                + Add New Associate
              </Button>
            )}
          </>
        )}
      </div>

      {/* Booking info banner */}
      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <p>
          <span className="font-medium">{booking.lodgeName}</span> &middot;{" "}
          {booking.checkInDate} to {booking.checkOutDate}
        </p>
      </div>

      {/* Error */}
      {booking.error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{booking.error}</p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => booking.goToStep(1)}>
          Back
        </Button>
        <Button
          onClick={() => booking.goToStep(3)}
          disabled={booking.guests.length === 0}
        >
          Next: Select Beds
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/[slug]/book/steps/add-guests.tsx src/app/[slug]/book/steps/add-associate-form.tsx
git commit -m "feat: add associates tab and port-a-cot toggle to booking wizard"
```

---

### Task 12: Select Beds Step — Skip Cot Guests

**Files:**
- Modify: `src/app/[slug]/book/steps/select-beds.tsx`

- [ ] **Step 1: Filter out cot guests from bed assignment**

In `select-beds.tsx`, the component needs to:
1. Only require bed assignments for non-cot guests
2. Show cot guests separately as "Port-a-cot (no bed needed)"
3. Update the `allAssigned` check

Import `guestKey` from the context:

```typescript
import { useBooking, guestKey } from "../booking-context";
```

Add a computed list of bed guests vs cot guests:

```typescript
const bedGuests = booking.guests.filter((g) => !g.portaCotRequested);
const cotGuests = booking.guests.filter((g) => g.portaCotRequested);
```

Update `nextUnassignedGuest` to only consider bed guests:

```typescript
const assignedKeys = new Set(booking.bedAssignments.map((a) => a.guestKey));
const nextUnassignedGuest = bedGuests.find(
  (g) => !assignedKeys.has(guestKey(g))
);
```

Update `guestColorMap` to use `guestKey`:

```typescript
const guestColorMap = new Map<string, string>();
bedGuests.forEach((g, i) => {
  guestColorMap.set(guestKey(g), GUEST_COLORS[i % GUEST_COLORS.length]);
});
```

Update `allAssigned`:

```typescript
const allAssigned = booking.bedAssignments.length === bedGuests.length;
```

Update `handleBedClick` to use `guestKey`:

```typescript
booking.addBedAssignment({
  guestKey: guestKey(nextUnassignedGuest),
  bedId,
  bedLabel,
  roomId,
  roomName,
});
```

And for deselecting:

```typescript
const assignment = booking.bedAssignments.find((a) => a.bedId === bedId);
if (assignment) {
  booking.removeBedAssignment(assignment.guestKey);
  // ...
}
```

- [ ] **Step 2: Add cot guests section above the room grid**

After the guest assignment legend, add:

```typescript
{cotGuests.length > 0 && (
  <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/20 p-3 space-y-1">
    <p className="text-sm font-medium">Port-a-cot Guests</p>
    {cotGuests.map((guest) => (
      <p key={guestKey(guest)} className="text-sm text-muted-foreground">
        {guest.firstName} {guest.lastName} — Port-a-cot (no bed assignment needed)
      </p>
    ))}
  </div>
)}
```

- [ ] **Step 3: Update guest legend to use guestKey**

Replace `guest.memberId` references in the legend with `guestKey(guest)`, and filter to only show `bedGuests`.

- [ ] **Step 4: Commit**

```bash
git add src/app/[slug]/book/steps/select-beds.tsx
git commit -m "feat: skip bed selection for port-a-cot guests"
```

---

### Task 13: Review Pricing & Confirm Steps — Handle Associates and Cots

**Files:**
- Modify: `src/app/[slug]/book/steps/review-pricing.tsx`
- Modify: `src/app/[slug]/book/steps/confirm.tsx`

- [ ] **Step 1: Update review-pricing.tsx**

Import `guestKey`:

```typescript
import { useBooking, guestKey } from "../booking-context";
```

Update the guest table to use `guestKey` for lookups:

```typescript
{booking.guests.map((guest) => {
  const key = guestKey(guest);
  const assignment = booking.bedAssignments.find(
    (a) => a.guestKey === key
  );
  const pricing = booking.pricingResult?.guests.find(
    (g) => g.guestKey === key
  );

  return (
    <tr key={key} className="border-b last:border-b-0">
      <td className="py-2 pr-2">
        {guest.portaCotRequested
          ? "Port-a-cot"
          : assignment
            ? `${assignment.roomName} / ${assignment.bedLabel}`
            : "-"}
      </td>
      <td className="py-2 pr-2">
        {guest.firstName} {guest.lastName}
        {guest.associateId && (
          <span className="text-xs text-muted-foreground ml-1">(Guest)</span>
        )}
      </td>
      <td className="py-2 pr-2">
        {guest.membershipClassName || "Standard"}
      </td>
      <td className="py-2 text-right">
        {pricing && pricing.totalCents > 0
          ? formatCurrency(pricing.totalCents)
          : "TBD"}
      </td>
    </tr>
  );
})}
```

- [ ] **Step 2: Update confirm.tsx**

Import `guestKey`:

```typescript
import { useBooking, guestKey } from "../booking-context";
```

Update the `handleConfirm` function to build the correct guest payload:

```typescript
guests: [
  ...booking.bedAssignments.map((a) => {
    const guest = booking.guests.find((g) => guestKey(g) === a.guestKey);
    return {
      memberId: guest?.memberId,
      associateId: guest?.associateId,
      bedId: a.bedId,
      roomId: a.roomId,
    };
  }),
  ...booking.guests
    .filter((g) => g.portaCotRequested)
    .map((g) => ({
      memberId: g.memberId,
      associateId: g.associateId,
      portaCotRequested: true,
    })),
],
```

Update the guest list display in the summary:

```typescript
{booking.guests.map((g) => {
  const key = guestKey(g);
  const assignment = booking.bedAssignments.find(
    (a) => a.guestKey === key
  );
  return (
    <div key={key} className="flex justify-between">
      <span>
        {g.firstName} {g.lastName}
        {g.associateId && " (Guest)"}
      </span>
      <span className="text-muted-foreground">
        {g.portaCotRequested
          ? "Port-a-cot"
          : assignment
            ? `${assignment.roomName} / ${assignment.bedLabel}`
            : "-"}
      </span>
    </div>
  );
})}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/[slug]/book/steps/review-pricing.tsx src/app/[slug]/book/steps/confirm.tsx
git commit -m "feat: update review/confirm steps for associates and cots"
```

---

### Task 14: Admin Lodge Page — Port-a-Cot Count

**Files:**
- Modify: `src/app/[slug]/admin/lodges/[lodgeId]/page.tsx`
- Modify: `src/app/[slug]/admin/lodges/[lodgeId]/room-manager.tsx`

- [ ] **Step 1: Add portaCotCount to the lodge detail page data fetch**

In `src/app/[slug]/admin/lodges/[lodgeId]/page.tsx`, ensure the lodge query includes `portaCotCount` in the select fields. Pass it to the room manager or add a separate display component.

- [ ] **Step 2: Add port-a-cot count editor to room-manager.tsx**

Add above the rooms list in `room-manager.tsx`:

```typescript
{/* Port-a-cot configuration */}
<div className="rounded-lg border p-4 flex items-center justify-between">
  <div>
    <p className="font-medium text-sm">Port-a-Cots</p>
    <p className="text-xs text-muted-foreground">
      Total portable cots available at this lodge
    </p>
  </div>
  <div className="flex items-center gap-2">
    <Input
      type="number"
      min={0}
      className="w-20"
      defaultValue={portaCotCount}
      onBlur={async (e) => {
        const value = parseInt(e.target.value, 10);
        if (!isNaN(value) && value >= 0) {
          await updateLodge({
            id: lodgeId,
            organisationId,
            name: lodgeName,
            totalBeds,
            portaCotCount: value,
            slug,
          });
          toast.success("Port-a-cot count updated");
        }
      }}
    />
  </div>
</div>
```

The `RoomManager` component props need to be extended:

```typescript
export function RoomManager({
  lodgeId,
  organisationId,
  lodgeName,
  totalBeds,
  portaCotCount,
  initialRooms,
}: {
  lodgeId: string;
  organisationId: string;
  lodgeName: string;
  totalBeds: number;
  portaCotCount: number;
  initialRooms: Room[];
}) {
```

- [ ] **Step 3: Update the updateLodge action to support portaCotCount**

In `src/actions/lodges/index.ts`, add `portaCotCount` to the `lodgeSchema`:

```typescript
portaCotCount: z.number().int().min(0).default(0),
```

And include it in the `updateLodge` set:

```typescript
portaCotCount: data.portaCotCount,
```

- [ ] **Step 4: Commit**

```bash
git add src/app/[slug]/admin/lodges/ src/actions/lodges/index.ts
git commit -m "feat: admin port-a-cot count configuration on lodge page"
```

---

### Task 15: Admin Tariff — Port-a-Cot Price Column

**Files:**
- Modify: wherever tariff management UI exists (likely in admin settings or season config)

- [ ] **Step 1: Locate and update the tariff management UI**

Find the existing tariff editor in the admin UI. Add a "Port-a-Cot $/Night" column/field. This is a simple integer input (cents) added alongside the existing weekday/weekend fields.

If no tariff UI exists (the research suggests there isn't one), the `portaCotPricePerNightCents` field can be set through the same mechanism tariffs are currently managed (likely direct DB or seed scripts). Document this in the commit.

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add port-a-cot price field to tariff configuration"
```

---

### Task 16: Member Associates Dashboard Page

**Files:**
- Create: `src/app/[slug]/associates/page.tsx`
- Create: `src/app/[slug]/associates/associate-list.tsx`

- [ ] **Step 1: Create the associates page**

Create `src/app/[slug]/associates/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { db } from "@/db/index";
import { organisations, associates, members, organisationMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionMember } from "@/lib/auth";
import { AssociateList } from "./associate-list";

export default async function AssociatesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [org] = await db
    .select({ id: organisations.id })
    .from(organisations)
    .where(eq(organisations.slug, slug));

  if (!org) redirect("/");

  const session = await getSessionMember(org.id);
  if (!session) redirect(`/${slug}/login`);

  const myAssociates = await db
    .select({
      id: associates.id,
      firstName: associates.firstName,
      lastName: associates.lastName,
      email: associates.email,
      phone: associates.phone,
      dateOfBirth: associates.dateOfBirth,
    })
    .from(associates)
    .where(
      and(
        eq(associates.organisationId, org.id),
        eq(associates.ownerMemberId, session.memberId),
        eq(associates.isDeleted, false)
      )
    );

  return (
    <div className="container max-w-2xl py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Associates</h1>
        <p className="text-muted-foreground">
          Manage people you regularly book on behalf of.
        </p>
      </div>
      <AssociateList
        organisationId={org.id}
        slug={slug}
        initialAssociates={myAssociates}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create the associate list client component**

Create `src/app/[slug]/associates/associate-list.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createAssociate, updateAssociate, deleteAssociate } from "@/actions/associates";
import { toast } from "sonner";

type Associate = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  dateOfBirth: string | null;
};

type Props = {
  organisationId: string;
  slug: string;
  initialAssociates: Associate[];
};

export function AssociateList({ organisationId, slug, initialAssociates }: Props) {
  const [list, setList] = useState(initialAssociates);
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);

    try {
      const result = await createAssociate({
        organisationId,
        firstName: form.get("firstName") as string,
        lastName: form.get("lastName") as string,
        email: form.get("email") as string,
        phone: (form.get("phone") as string) || undefined,
        dateOfBirth: (form.get("dateOfBirth") as string) || undefined,
        slug,
      });

      if (result.success && result.id) {
        setList((prev) => [
          ...prev,
          {
            id: result.id!,
            firstName: form.get("firstName") as string,
            lastName: form.get("lastName") as string,
            email: form.get("email") as string,
            phone: (form.get("phone") as string) || null,
            dateOfBirth: (form.get("dateOfBirth") as string) || null,
          },
        ]);
        setAddOpen(false);
        toast.success("Associate added");
      } else {
        toast.error("error" in result ? result.error : "Failed to add");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editId) return;
    setSaving(true);
    const form = new FormData(e.currentTarget);

    try {
      const result = await updateAssociate({
        id: editId,
        organisationId,
        firstName: form.get("firstName") as string,
        lastName: form.get("lastName") as string,
        email: form.get("email") as string,
        phone: (form.get("phone") as string) || undefined,
        dateOfBirth: (form.get("dateOfBirth") as string) || undefined,
        slug,
      });

      if (result.success) {
        setList((prev) =>
          prev.map((a) =>
            a.id === editId
              ? {
                  ...a,
                  firstName: form.get("firstName") as string,
                  lastName: form.get("lastName") as string,
                  email: form.get("email") as string,
                  phone: (form.get("phone") as string) || null,
                  dateOfBirth: (form.get("dateOfBirth") as string) || null,
                }
              : a
          )
        );
        setEditId(null);
        toast.success("Associate updated");
      } else {
        toast.error("error" in result ? result.error : "Failed to update");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remove "${name}" from your associates?`)) return;

    const result = await deleteAssociate(id, organisationId, slug);
    if (result.success) {
      setList((prev) => prev.filter((a) => a.id !== id));
      toast.success("Associate removed");
    } else {
      toast.error("error" in result ? result.error : "Failed to remove");
    }
  }

  function AssociateForm({
    defaults,
    onSubmit,
  }: {
    defaults?: Associate;
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  }) {
    return (
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="fn">First Name</Label>
            <Input id="fn" name="firstName" defaultValue={defaults?.firstName} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ln">Last Name</Label>
            <Input id="ln" name="lastName" defaultValue={defaults?.lastName} required />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="em">Email</Label>
          <Input id="em" name="email" type="email" defaultValue={defaults?.email} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="ph">Phone</Label>
            <Input id="ph" name="phone" defaultValue={defaults?.phone ?? ""} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dob">Date of Birth</Label>
            <Input id="dob" name="dateOfBirth" type="date" defaultValue={defaults?.dateOfBirth ?? ""} />
          </div>
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : defaults ? "Update" : "Add Associate"}
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogTrigger render={<Button />}>Add Associate</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Associate</DialogTitle>
          </DialogHeader>
          <AssociateForm onSubmit={handleCreate} />
        </DialogContent>
      </Dialog>

      {list.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No associates yet. Add someone you regularly book for.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((assoc) => (
            <Card key={assoc.id}>
              <CardContent className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {assoc.firstName} {assoc.lastName}
                  </p>
                  <p className="text-sm text-muted-foreground">{assoc.email}</p>
                  {assoc.phone && (
                    <p className="text-xs text-muted-foreground">{assoc.phone}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Dialog
                    open={editId === assoc.id}
                    onOpenChange={(open) => setEditId(open ? assoc.id : null)}
                  >
                    <DialogTrigger render={<Button variant="outline" size="sm" />}>
                      Edit
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Edit Associate</DialogTitle>
                      </DialogHeader>
                      <AssociateForm defaults={assoc} onSubmit={handleUpdate} />
                    </DialogContent>
                  </Dialog>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() =>
                      handleDelete(assoc.id, `${assoc.firstName} ${assoc.lastName}`)
                    }
                  >
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/[slug]/associates/
git commit -m "feat: member associates dashboard page with CRUD"
```

---

### Task 17: Admin Guest Membership Class Setup

**Files:**
- This depends on where membership class management lives. The admin needs a way to mark one class as `isGuestClass`.

- [ ] **Step 1: Find the membership class management UI**

Search for where membership classes are managed in admin. Add a toggle/checkbox for "Guest Class" on the class editor.

If managed through a table or settings page, add the `isGuestClass` toggle. Enforce single-guest-class constraint: when one class is marked as guest, unmark the previous one.

- [ ] **Step 2: Create server action for toggling guest class**

Add to the membership class actions (or create a new one):

```typescript
export async function setGuestClass(
  organisationId: string,
  membershipClassId: string,
  slug: string
): Promise<ActionResult> {
  try {
    const session = await requireSession(organisationId);
    requireRole(session, "ADMIN");

    // Unset any existing guest class for this org
    await db
      .update(membershipClasses)
      .set({ isGuestClass: false })
      .where(
        and(
          eq(membershipClasses.organisationId, organisationId),
          eq(membershipClasses.isGuestClass, true)
        )
      );

    // Set the new one
    await db
      .update(membershipClasses)
      .set({ isGuestClass: true, updatedAt: new Date() })
      .where(
        and(
          eq(membershipClasses.id, membershipClassId),
          eq(membershipClasses.organisationId, organisationId)
        )
      );

    revalidatePath(`/${slug}/admin`);
    return { success: true };
  } catch (e) {
    const authResult = authErrorToResult(e);
    if (authResult) return authResult;
    throw e;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: admin guest membership class toggle"
```

---

### Task 18: Final Integration — Wire Everything Together

**Files:**
- Modify: `src/app/[slug]/book/booking-wizard.tsx` (pass slug to AddGuests)

- [ ] **Step 1: Pass slug prop to AddGuests**

In `booking-wizard.tsx`, the `AddGuests` component now needs the `slug` prop for creating associates during booking:

```typescript
{step === 2 && (
  <AddGuests
    organisationId={organisationId}
    slug={slug}
    memberId={memberId}
    memberName={memberName}
    membershipClassId={membershipClassId}
  />
)}
```

- [ ] **Step 2: Verify the full booking flow compiles**

```bash
cd /opt/snowgum && npx next build
```

Fix any type errors.

- [ ] **Step 3: Run all tests**

```bash
cd /opt/snowgum && npm test && npm run test:integration
```

Fix any failures.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: wire up associates and port-a-cot flow end-to-end"
```

---

### Task 19: Verify and Cleanup

- [ ] **Step 1: Run full test suite**

```bash
cd /opt/snowgum && npm test && npm run test:integration
```

All tests must pass.

- [ ] **Step 2: Build check**

```bash
cd /opt/snowgum && npx next build
```

Must succeed with no errors.

- [ ] **Step 3: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: cleanup after associates and port-a-cot feature"
```
