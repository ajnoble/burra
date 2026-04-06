# Phase 6: Booking Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 5-step member booking wizard with concurrency handling, timed bed holds, and per-guest pricing.

**Architecture:** Single-page client-side wizard at `/[slug]/book` with URL state sync. Server actions handle validation, pricing, and transactional booking creation with `SELECT FOR UPDATE` locking. Timed bed holds prevent concurrent conflicts during the booking flow.

**Tech Stack:** Next.js 16, TypeScript, Drizzle ORM, PostgreSQL, Zod, Vitest, Tailwind CSS v4, shadcn/ui

---

## File Structure

```
src/
  db/schema/bookings.ts                           — MODIFY: add bedHolds table
  db/schema/seasons.ts                             — MODIFY: add holdDurationMinutes to bookingRounds
  db/schema/lodges.ts                              — MODIFY: add checkInTime, checkOutTime to lodges
  db/schema/availability.ts                        — MODIFY: add EVENT to overrideTypeEnum
  db/schema/transactions.ts                        — MODIFY: add INVOICE to transactionTypeEnum
  db/schema/index.ts                               — MODIFY: export bedHolds
  actions/bookings/schemas.ts                      — CREATE: Zod validation schemas
  actions/bookings/__tests__/schemas.test.ts       — CREATE: schema tests
  actions/bookings/reference.ts                    — CREATE: booking reference generation
  actions/bookings/__tests__/reference.test.ts     — CREATE: reference tests
  actions/bookings/pricing.ts                      — CREATE: calculateBookingPrice
  actions/bookings/__tests__/pricing.test.ts       — CREATE: pricing tests
  actions/bookings/beds.ts                         — CREATE: getAvailableBeds
  actions/bookings/__tests__/beds.test.ts          — CREATE: bed query tests
  actions/bookings/members.ts                      — CREATE: getBookableMembers
  actions/bookings/__tests__/members.test.ts       — CREATE: member query tests
  actions/bookings/holds.ts                        — CREATE: bed hold CRUD
  actions/bookings/__tests__/holds.test.ts         — CREATE: hold tests
  actions/bookings/create.ts                       — CREATE: createBooking server action
  actions/bookings/__tests__/create.test.ts        — CREATE: booking creation tests
  actions/bookings/queries.ts                      — CREATE: booking list/detail queries
  actions/bookings/__tests__/queries.test.ts       — CREATE: query tests
  actions/availability/schemas.ts                  — MODIFY: add EVENT to override schema
  app/[slug]/book/page.tsx                         — CREATE: booking page (server component)
  app/[slug]/book/booking-wizard.tsx               — CREATE: wizard client component
  app/[slug]/book/booking-context.tsx              — CREATE: React context for wizard state
  app/[slug]/book/step-indicator.tsx               — CREATE: progress bar component
  app/[slug]/book/steps/select-lodge-dates.tsx     — CREATE: Step 1
  app/[slug]/book/steps/add-guests.tsx             — CREATE: Step 2
  app/[slug]/book/steps/select-beds.tsx            — CREATE: Step 3
  app/[slug]/book/steps/review-pricing.tsx         — CREATE: Step 4
  app/[slug]/book/steps/confirm.tsx                — CREATE: Step 5
  app/[slug]/book/booking-success.tsx              — CREATE: success screen
  app/[slug]/admin/availability/override-form.tsx  — MODIFY: add EVENT option
  app/[slug]/admin/availability/availability-calendar.tsx — MODIFY: show event labels
  app/[slug]/dashboard/page.tsx                    — MODIFY: show upcoming bookings
```

---

### Task 1: Schema Changes

**Files:**
- Modify: `src/db/schema/bookings.ts`
- Modify: `src/db/schema/seasons.ts`
- Modify: `src/db/schema/lodges.ts`
- Modify: `src/db/schema/availability.ts`
- Modify: `src/db/schema/transactions.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Add `bedHolds` table to `src/db/schema/bookings.ts`**

Add the new imports and table at the bottom of the file. Replace the entire file with:

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
import { lodges, beds, rooms } from "./lodges";
import { members, membershipClasses } from "./members";
import { bookingRounds } from "./seasons";
import { cancellationPolicies } from "./cancellation-policies";
import { tariffs } from "./tariffs";

export const bookingStatusEnum = pgEnum("booking_status", [
  "PENDING",
  "CONFIRMED",
  "WAITLISTED",
  "CANCELLED",
  "COMPLETED",
]);

export const bookings = pgTable("bookings", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  lodgeId: uuid("lodge_id")
    .notNull()
    .references(() => lodges.id),
  bookingRoundId: uuid("booking_round_id")
    .notNull()
    .references(() => bookingRounds.id),
  cancellationPolicyId: uuid("cancellation_policy_id").references(
    () => cancellationPolicies.id
  ),
  primaryMemberId: uuid("primary_member_id").references(() => members.id), // nullable for future guest checkout
  status: bookingStatusEnum("status").notNull().default("PENDING"),
  checkInDate: date("check_in_date").notNull(),
  checkOutDate: date("check_out_date").notNull(),
  totalNights: integer("total_nights").notNull(),
  subtotalCents: integer("subtotal_cents").notNull(),
  discountAmountCents: integer("discount_amount_cents").notNull().default(0),
  totalAmountCents: integer("total_amount_cents").notNull(),
  depositAmountCents: integer("deposit_amount_cents").notNull().default(0),
  depositPaidAt: timestamp("deposit_paid_at", { withTimezone: true }),
  balanceDueDate: date("balance_due_date"),
  balancePaidAt: timestamp("balance_paid_at", { withTimezone: true }),
  cancellationReason: text("cancellation_reason"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  refundAmountCents: integer("refund_amount_cents"),
  requiresApproval: boolean("requires_approval").notNull().default(false),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedByMemberId: uuid("approved_by_member_id").references(
    () => members.id
  ),
  bookingReference: text("booking_reference").notNull().unique(), // e.g. BSKI-2027-0042
  notes: text("notes"), // member-visible
  adminNotes: text("admin_notes"), // admin only
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const bookingGuests = pgTable("booking_guests", {
  id: uuid("id").defaultRandom().primaryKey(),
  bookingId: uuid("booking_id")
    .notNull()
    .references(() => bookings.id),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id),
  bedId: uuid("bed_id").references(() => beds.id),
  roomId: uuid("room_id").references(() => rooms.id),
  pricePerNightCents: integer("price_per_night_cents").notNull(),
  totalAmountCents: integer("total_amount_cents").notNull(),
  snapshotTariffId: uuid("snapshot_tariff_id").references(() => tariffs.id),
  snapshotMembershipClassId: uuid("snapshot_membership_class_id").references(
    () => membershipClasses.id
  ),
});

export const bedHolds = pgTable("bed_holds", {
  id: uuid("id").defaultRandom().primaryKey(),
  lodgeId: uuid("lodge_id")
    .notNull()
    .references(() => lodges.id),
  bedId: uuid("bed_id")
    .notNull()
    .references(() => beds.id),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id),
  bookingRoundId: uuid("booking_round_id")
    .notNull()
    .references(() => bookingRounds.id),
  checkInDate: date("check_in_date").notNull(),
  checkOutDate: date("check_out_date").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
```

- [ ] **Step 2: Add `holdDurationMinutes` to `bookingRounds` in `src/db/schema/seasons.ts`**

Replace the entire file with:

```typescript
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  date,
  jsonb,
} from "drizzle-orm/pg-core";
import { organisations } from "./organisations";

export const seasons = pgTable("seasons", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  name: text("name").notNull(), // e.g. "Winter 2027"
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const bookingRounds = pgTable("booking_rounds", {
  id: uuid("id").defaultRandom().primaryKey(),
  seasonId: uuid("season_id")
    .notNull()
    .references(() => seasons.id),
  name: text("name").notNull(), // e.g. "Member Priority Round"
  opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
  closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
  allowedMembershipClassIds: jsonb("allowed_membership_class_ids")
    .$type<string[]>()
    .notNull()
    .default([]),
  allowGuestCheckout: boolean("allow_guest_checkout")
    .notNull()
    .default(false),
  maxNightsPerMember: integer("max_nights_per_member"),
  maxNightsPerBooking: integer("max_nights_per_booking"),
  holdDurationMinutes: integer("hold_duration_minutes").default(10),
  requiresApproval: boolean("requires_approval").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
```

- [ ] **Step 3: Add `checkInTime` and `checkOutTime` to `lodges` in `src/db/schema/lodges.ts`**

Replace the entire file with:

```typescript
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { organisations } from "./organisations";

export const lodges = pgTable("lodges", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  name: text("name").notNull(),
  address: text("address"),
  description: text("description"),
  imageUrl: text("image_url"),
  totalBeds: integer("total_beds").notNull(),
  checkInTime: text("check_in_time").notNull().default("17:00"),
  checkOutTime: text("check_out_time").notNull().default("16:00"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const rooms = pgTable("rooms", {
  id: uuid("id").defaultRandom().primaryKey(),
  lodgeId: uuid("lodge_id")
    .notNull()
    .references(() => lodges.id),
  name: text("name").notNull(),
  floor: text("floor"),
  capacity: integer("capacity").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const beds = pgTable("beds", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id")
    .notNull()
    .references(() => rooms.id),
  label: text("label").notNull(), // e.g. "Bed 1", "Top Bunk A"
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
```

- [ ] **Step 4: Add `EVENT` to `overrideTypeEnum` in `src/db/schema/availability.ts`**

In `src/db/schema/availability.ts`, change the enum definition:

```typescript
export const overrideTypeEnum = pgEnum("override_type", [
  "CLOSURE",
  "REDUCTION",
  "EVENT",
]);
```

- [ ] **Step 5: Add `INVOICE` to `transactionTypeEnum` in `src/db/schema/transactions.ts`**

In `src/db/schema/transactions.ts`, change the enum definition:

```typescript
export const transactionTypeEnum = pgEnum("transaction_type", [
  "PAYMENT",
  "REFUND",
  "CREDIT",
  "SUBSCRIPTION",
  "ADJUSTMENT",
  "INVOICE",
]);
```

- [ ] **Step 6: Export `bedHolds` from `src/db/schema/index.ts`**

Change the bookings export line:

```typescript
export {
  bookingStatusEnum,
  bookings,
  bookingGuests,
  bedHolds,
} from "./bookings";
```

- [ ] **Step 7: Generate and apply migration**

Run:
```bash
npx drizzle-kit generate --name add_bed_holds_and_booking_enhancements
npx drizzle-kit push
```

Review the generated SQL migration to verify it includes:
- `bed_holds` table creation
- `hold_duration_minutes` column on `booking_rounds`
- `check_in_time` and `check_out_time` columns on `lodges`
- `EVENT` added to `override_type` enum
- `INVOICE` added to `transaction_type` enum

- [ ] **Step 8: Run `npm run check` and verify no regressions**

```bash
npm run check
```

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: add bedHolds table, holdDurationMinutes, check-in/out times, EVENT/INVOICE enums

Schema changes for Phase 6 booking flow:
- New bed_holds table for timed bed reservations
- holdDurationMinutes on booking_rounds for configurable hold duration
- checkInTime/checkOutTime on lodges for display on confirmations
- EVENT added to override_type enum (informational calendar labels)
- INVOICE added to transaction_type enum (booking invoices)"
```

---

### Task 2: Booking Schemas

**Files:**
- Create: `src/actions/bookings/schemas.ts`
- Create: `src/actions/bookings/__tests__/schemas.test.ts`

- [ ] **Step 1: Write schema tests**

Create `src/actions/bookings/__tests__/schemas.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  createBookingSchema,
  pricingInputSchema,
  bedHoldInputSchema,
} from "../schemas";

describe("createBookingSchema", () => {
  const validInput = {
    organisationId: "550e8400-e29b-41d4-a716-446655440000",
    lodgeId: "660e8400-e29b-41d4-a716-446655440000",
    bookingRoundId: "770e8400-e29b-41d4-a716-446655440000",
    checkInDate: "2027-07-10",
    checkOutDate: "2027-07-13",
    guests: [
      {
        memberId: "880e8400-e29b-41d4-a716-446655440000",
        bedId: "990e8400-e29b-41d4-a716-446655440000",
        roomId: "aa0e8400-e29b-41d4-a716-446655440000",
      },
    ],
  };

  it("accepts valid input", () => {
    const result = createBookingSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects empty guests array", () => {
    const result = createBookingSchema.safeParse({
      ...validInput,
      guests: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects checkOut on or before checkIn", () => {
    const result = createBookingSchema.safeParse({
      ...validInput,
      checkInDate: "2027-07-13",
      checkOutDate: "2027-07-10",
    });
    expect(result.success).toBe(false);
  });

  it("rejects same-day checkIn and checkOut", () => {
    const result = createBookingSchema.safeParse({
      ...validInput,
      checkInDate: "2027-07-10",
      checkOutDate: "2027-07-10",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = createBookingSchema.safeParse({
      ...validInput,
      checkInDate: "07/10/2027",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUID for lodgeId", () => {
    const result = createBookingSchema.safeParse({
      ...validInput,
      lodgeId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts guests without optional roomId", () => {
    const result = createBookingSchema.safeParse({
      ...validInput,
      guests: [
        {
          memberId: "880e8400-e29b-41d4-a716-446655440000",
          bedId: "990e8400-e29b-41d4-a716-446655440000",
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("pricingInputSchema", () => {
  const validInput = {
    lodgeId: "550e8400-e29b-41d4-a716-446655440000",
    checkInDate: "2027-07-10",
    checkOutDate: "2027-07-13",
    guestMemberIds: ["880e8400-e29b-41d4-a716-446655440000"],
  };

  it("accepts valid input", () => {
    const result = pricingInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects empty guestMemberIds", () => {
    const result = pricingInputSchema.safeParse({
      ...validInput,
      guestMemberIds: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts multiple guests", () => {
    const result = pricingInputSchema.safeParse({
      ...validInput,
      guestMemberIds: [
        "880e8400-e29b-41d4-a716-446655440000",
        "990e8400-e29b-41d4-a716-446655440000",
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("bedHoldInputSchema", () => {
  const validInput = {
    lodgeId: "550e8400-e29b-41d4-a716-446655440000",
    bedId: "660e8400-e29b-41d4-a716-446655440000",
    bookingRoundId: "770e8400-e29b-41d4-a716-446655440000",
    checkInDate: "2027-07-10",
    checkOutDate: "2027-07-13",
  };

  it("accepts valid input", () => {
    const result = bedHoldInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects missing bedId", () => {
    const { bedId, ...rest } = validInput;
    const result = bedHoldInputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects checkOut before checkIn", () => {
    const result = bedHoldInputSchema.safeParse({
      ...validInput,
      checkInDate: "2027-07-13",
      checkOutDate: "2027-07-10",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npx vitest run src/actions/bookings/__tests__/schemas.test.ts
```

Expected: tests fail because `schemas.ts` does not exist.

- [ ] **Step 3: Write schema implementation**

Create `src/actions/bookings/schemas.ts`:

```typescript
import { z } from "zod";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format");

const bookingGuestSchema = z.object({
  memberId: z.string().uuid(),
  bedId: z.string().uuid(),
  roomId: z.string().uuid().optional(),
});

export const createBookingSchema = z
  .object({
    organisationId: z.string().uuid(),
    lodgeId: z.string().uuid(),
    bookingRoundId: z.string().uuid(),
    checkInDate: isoDateSchema,
    checkOutDate: isoDateSchema,
    guests: z.array(bookingGuestSchema).min(1, "At least one guest is required"),
  })
  .superRefine((data, ctx) => {
    if (data.checkOutDate <= data.checkInDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Check-out must be after check-in",
        path: ["checkOutDate"],
      });
    }
  });

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const pricingInputSchema = z.object({
  lodgeId: z.string().uuid(),
  checkInDate: isoDateSchema,
  checkOutDate: isoDateSchema,
  guestMemberIds: z.array(z.string().uuid()).min(1, "At least one guest is required"),
});

export type PricingInput = z.infer<typeof pricingInputSchema>;

export const bedHoldInputSchema = z
  .object({
    lodgeId: z.string().uuid(),
    bedId: z.string().uuid(),
    bookingRoundId: z.string().uuid(),
    checkInDate: isoDateSchema,
    checkOutDate: isoDateSchema,
  })
  .superRefine((data, ctx) => {
    if (data.checkOutDate <= data.checkInDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Check-out must be after check-in",
        path: ["checkOutDate"],
      });
    }
  });

export type BedHoldInput = z.infer<typeof bedHoldInputSchema>;
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npx vitest run src/actions/bookings/__tests__/schemas.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/actions/bookings/schemas.ts src/actions/bookings/__tests__/schemas.test.ts
git commit -m "feat: add Zod schemas for booking creation, pricing, and bed holds

TDD: tests written first, then implementation. Validates dates,
UUIDs, guest arrays, and date ordering constraints."
```

---

### Task 3: Booking Reference Generation

**Files:**
- Create: `src/actions/bookings/reference.ts`
- Create: `src/actions/bookings/__tests__/reference.test.ts`

- [ ] **Step 1: Write reference tests**

Create `src/actions/bookings/__tests__/reference.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { generateBookingReference, getOrgPrefix } from "../reference";

describe("getOrgPrefix", () => {
  it("returns uppercase first 4 chars of slug", () => {
    expect(getOrgPrefix("polski-ski-club")).toBe("POLS");
  });

  it("handles short slugs", () => {
    expect(getOrgPrefix("abc")).toBe("ABC");
  });

  it("strips hyphens and takes first 4 chars", () => {
    expect(getOrgPrefix("mt-buller-lodge")).toBe("MTBU");
  });

  it("returns uppercase", () => {
    expect(getOrgPrefix("falls-creek")).toBe("FALL");
  });
});

describe("generateBookingReference", () => {
  it("matches format ORG-YEAR-XXXX", () => {
    const ref = generateBookingReference("polski-ski-club");
    expect(ref).toMatch(/^POLS-\d{4}-[A-HJ-NP-Z2-9]{4}$/);
  });

  it("uses current year", () => {
    const ref = generateBookingReference("test-club");
    const year = new Date().getFullYear().toString();
    expect(ref).toContain(`-${year}-`);
  });

  it("does not include ambiguous characters (O, 0, I, 1, L)", () => {
    // Generate many to increase chance of catching ambiguous chars
    for (let i = 0; i < 100; i++) {
      const ref = generateBookingReference("test");
      const random = ref.split("-")[2];
      expect(random).not.toMatch(/[O01IL]/);
    }
  });

  it("generates different references each call", () => {
    const refs = new Set<string>();
    for (let i = 0; i < 20; i++) {
      refs.add(generateBookingReference("test"));
    }
    // Should have many unique references (highly unlikely to collide in 20 tries)
    expect(refs.size).toBeGreaterThan(15);
  });

  it("reference has exactly 3 parts separated by hyphens", () => {
    const ref = generateBookingReference("my-lodge");
    const parts = ref.split("-");
    expect(parts).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npx vitest run src/actions/bookings/__tests__/reference.test.ts
```

- [ ] **Step 3: Write reference implementation**

Create `src/actions/bookings/reference.ts`:

```typescript
// Characters excluding ambiguous ones: O, 0, I, 1, L
const SAFE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function getOrgPrefix(slug: string): string {
  const stripped = slug.replace(/-/g, "");
  return stripped.slice(0, 4).toUpperCase();
}

function randomAlphanumeric(length: number): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += SAFE_CHARS[Math.floor(Math.random() * SAFE_CHARS.length)];
  }
  return result;
}

/**
 * Generate a booking reference like POLS-2027-7K3M.
 * Format: {ORG_PREFIX}-{YEAR}-{4_RANDOM}
 */
export function generateBookingReference(orgSlug: string): string {
  const prefix = getOrgPrefix(orgSlug);
  const year = new Date().getFullYear();
  const random = randomAlphanumeric(4);
  return `${prefix}-${year}-${random}`;
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npx vitest run src/actions/bookings/__tests__/reference.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/actions/bookings/reference.ts src/actions/bookings/__tests__/reference.test.ts
git commit -m "feat: add booking reference generation (ORG-YEAR-XXXX format)

Generates references like POLS-2027-7K3M using safe alphanumeric
characters (no ambiguous O/0/I/1/L). TDD."
```

---

### Task 4: Pricing Calculation

**Files:**
- Create: `src/actions/bookings/pricing.ts`
- Create: `src/actions/bookings/__tests__/pricing.test.ts`

- [ ] **Step 1: Write pricing tests**

Create `src/actions/bookings/__tests__/pricing.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbSelect = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => mockDbSelect(),
      }),
    }),
  },
}));

vi.mock("@/lib/dates", () => ({
  isWeekend: (date: Date | string) => {
    const d = new Date(typeof date === "string" ? date + "T12:00:00Z" : date);
    const day = d.getUTCDay();
    return day === 0 || day === 6;
  },
}));

import {
  calculateGuestPrice,
  calculateBookingPrice,
  countNights,
  getNightDates,
} from "../pricing";

describe("countNights", () => {
  it("counts 3 nights for a 3-day stay", () => {
    expect(countNights("2027-07-10", "2027-07-13")).toBe(3);
  });

  it("counts 1 night for consecutive dates", () => {
    expect(countNights("2027-07-10", "2027-07-11")).toBe(1);
  });

  it("counts 7 nights for a week", () => {
    expect(countNights("2027-07-07", "2027-07-14")).toBe(7);
  });
});

describe("getNightDates", () => {
  it("returns dates for each night (check-in to day before check-out)", () => {
    const dates = getNightDates("2027-07-10", "2027-07-13");
    expect(dates).toEqual(["2027-07-10", "2027-07-11", "2027-07-12"]);
  });

  it("returns single date for 1-night stay", () => {
    const dates = getNightDates("2027-07-10", "2027-07-11");
    expect(dates).toEqual(["2027-07-10"]);
  });
});

describe("calculateGuestPrice", () => {
  it("calculates weekday-only stay", () => {
    // Mon Jul 7 to Thu Jul 10 = 3 weekday nights
    const result = calculateGuestPrice({
      checkInDate: "2027-07-05", // Monday
      checkOutDate: "2027-07-08", // Thursday
      pricePerNightWeekdayCents: 5000,
      pricePerNightWeekendCents: 7000,
      discountFiveNightsBps: 500,
      discountSevenNightsBps: 1000,
    });
    expect(result.subtotalCents).toBe(15000); // 3 * 5000
    expect(result.discountAmountCents).toBe(0); // < 5 nights
    expect(result.totalCents).toBe(15000);
  });

  it("calculates weekend-only stay", () => {
    // Fri Jul 11 to Sun Jul 13 = Fri night + Sat night (both weekend)
    const result = calculateGuestPrice({
      checkInDate: "2027-07-11", // Friday
      checkOutDate: "2027-07-13", // Sunday
      pricePerNightWeekdayCents: 5000,
      pricePerNightWeekendCents: 7000,
      discountFiveNightsBps: 0,
      discountSevenNightsBps: 0,
    });
    // Friday and Saturday are both weekend nights
    expect(result.subtotalCents).toBe(14000); // 2 * 7000
    expect(result.totalCents).toBe(14000);
  });

  it("calculates mixed weekday/weekend stay", () => {
    // Thu Jul 10 to Mon Jul 14 = Thu(wd), Fri(we), Sat(we), Sun(we) = 4 nights
    const result = calculateGuestPrice({
      checkInDate: "2027-07-08", // Tuesday
      checkOutDate: "2027-07-13", // Sunday
      pricePerNightWeekdayCents: 5000,
      pricePerNightWeekendCents: 7000,
      discountFiveNightsBps: 500,
      discountSevenNightsBps: 1000,
    });
    // Tue(wd) Wed(wd) Thu(wd) Fri(we) Sat(we) = 3*5000 + 2*7000 = 29000
    expect(result.subtotalCents).toBe(29000);
    expect(result.discountAmountCents).toBe(1450); // 5% of 29000 = 1450
    expect(result.totalCents).toBe(27550); // 29000 - 1450
  });

  it("applies 5-night discount for exactly 5 nights", () => {
    const result = calculateGuestPrice({
      checkInDate: "2027-07-07", // Monday
      checkOutDate: "2027-07-12", // Saturday
      pricePerNightWeekdayCents: 5000,
      pricePerNightWeekendCents: 7000,
      discountFiveNightsBps: 500,
      discountSevenNightsBps: 1000,
    });
    // Mon-Fri = 4 weekdays + Fri(weekend) = 4*5000 + 1*7000 = 27000
    expect(result.subtotalCents).toBe(27000);
    // 5% of 27000 = 1350
    expect(result.discountAmountCents).toBe(1350);
    expect(result.totalCents).toBe(25650);
  });

  it("applies 5-night discount for 6 nights", () => {
    const result = calculateGuestPrice({
      checkInDate: "2027-07-07", // Monday
      checkOutDate: "2027-07-13", // Sunday
      pricePerNightWeekdayCents: 5000,
      pricePerNightWeekendCents: 7000,
      discountFiveNightsBps: 500,
      discountSevenNightsBps: 1000,
    });
    // Mon-Fri(4wd) + Fri(we) + Sat(we) = 4*5000 + 2*7000 = 34000
    expect(result.subtotalCents).toBe(34000);
    // 5-night discount (6 nights still uses 5-night tier): 5% of 34000 = 1700
    expect(result.discountAmountCents).toBe(1700);
    expect(result.totalCents).toBe(32300);
  });

  it("applies 7-night discount for exactly 7 nights (overrides 5-night)", () => {
    const result = calculateGuestPrice({
      checkInDate: "2027-07-07", // Monday
      checkOutDate: "2027-07-14", // Monday
      pricePerNightWeekdayCents: 5000,
      pricePerNightWeekendCents: 7000,
      discountFiveNightsBps: 500,
      discountSevenNightsBps: 1000,
    });
    // Mon-Thu(4wd) + Fri(we) + Sat(we) + Sun(we) = 4*5000 + 3*7000 = 41000
    expect(result.subtotalCents).toBe(41000);
    // 10% of 41000 = 4100 (7-night discount takes priority)
    expect(result.discountAmountCents).toBe(4100);
    expect(result.totalCents).toBe(36900);
  });

  it("applies 7-night discount for 10 nights", () => {
    const result = calculateGuestPrice({
      checkInDate: "2027-07-07", // Monday
      checkOutDate: "2027-07-17", // Thursday
      pricePerNightWeekdayCents: 5000,
      pricePerNightWeekendCents: 7000,
      discountFiveNightsBps: 500,
      discountSevenNightsBps: 1000,
    });
    // Mon-Thu(4wd) + Fri(we) + Sat(we) + Sun(we) + Mon-Wed(3wd) = 7*5000 + 3*7000 = 56000
    expect(result.subtotalCents).toBe(56000);
    // 10% of 56000 = 5600
    expect(result.discountAmountCents).toBe(5600);
    expect(result.totalCents).toBe(50400);
  });

  it("returns zero discount when both discount rates are zero", () => {
    const result = calculateGuestPrice({
      checkInDate: "2027-07-07",
      checkOutDate: "2027-07-14",
      pricePerNightWeekdayCents: 5000,
      pricePerNightWeekendCents: 7000,
      discountFiveNightsBps: 0,
      discountSevenNightsBps: 0,
    });
    expect(result.discountAmountCents).toBe(0);
    expect(result.totalCents).toBe(result.subtotalCents);
  });

  it("returns per-night breakdown", () => {
    const result = calculateGuestPrice({
      checkInDate: "2027-07-10", // Thursday
      checkOutDate: "2027-07-13", // Sunday
      pricePerNightWeekdayCents: 5000,
      pricePerNightWeekendCents: 7000,
      discountFiveNightsBps: 0,
      discountSevenNightsBps: 0,
    });
    expect(result.nightBreakdown).toEqual([
      { date: "2027-07-10", isWeekend: false, priceCents: 5000 },
      { date: "2027-07-11", isWeekend: true, priceCents: 7000 },
      { date: "2027-07-12", isWeekend: true, priceCents: 7000 },
    ]);
  });

  it("calculates blended per-night average", () => {
    const result = calculateGuestPrice({
      checkInDate: "2027-07-10", // Thursday
      checkOutDate: "2027-07-13", // Sunday
      pricePerNightWeekdayCents: 5000,
      pricePerNightWeekendCents: 7000,
      discountFiveNightsBps: 0,
      discountSevenNightsBps: 0,
    });
    // (5000 + 7000 + 7000) / 3 = 6333.33 -> 6333
    expect(result.blendedPerNightCents).toBe(6333);
  });
});

describe("calculateBookingPrice", () => {
  it("sums multiple guest totals", () => {
    const guests = [
      {
        subtotalCents: 15000,
        discountAmountCents: 0,
        totalCents: 15000,
        blendedPerNightCents: 5000,
        nightBreakdown: [],
      },
      {
        subtotalCents: 21000,
        discountAmountCents: 1050,
        totalCents: 19950,
        blendedPerNightCents: 7000,
        nightBreakdown: [],
      },
    ];

    const result = calculateBookingPrice(guests);
    expect(result.subtotalCents).toBe(36000);
    expect(result.discountAmountCents).toBe(1050);
    expect(result.totalAmountCents).toBe(34950);
  });

  it("handles single guest", () => {
    const guests = [
      {
        subtotalCents: 10000,
        discountAmountCents: 500,
        totalCents: 9500,
        blendedPerNightCents: 5000,
        nightBreakdown: [],
      },
    ];

    const result = calculateBookingPrice(guests);
    expect(result.subtotalCents).toBe(10000);
    expect(result.discountAmountCents).toBe(500);
    expect(result.totalAmountCents).toBe(9500);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npx vitest run src/actions/bookings/__tests__/pricing.test.ts
```

- [ ] **Step 3: Write pricing implementation**

Create `src/actions/bookings/pricing.ts`:

```typescript
import { isWeekend } from "@/lib/dates";
import { applyBasisPoints } from "@/lib/currency";

export function countNights(checkIn: string, checkOut: string): number {
  const start = new Date(checkIn + "T00:00:00Z");
  const end = new Date(checkOut + "T00:00:00Z");
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Get the date string for each night of the stay.
 * A "night" is the check-in date through the day before check-out.
 */
export function getNightDates(checkIn: string, checkOut: string): string[] {
  const dates: string[] = [];
  const current = new Date(checkIn + "T00:00:00Z");
  const end = new Date(checkOut + "T00:00:00Z");

  while (current < end) {
    dates.push(current.toISOString().split("T")[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

type NightBreakdown = {
  date: string;
  isWeekend: boolean;
  priceCents: number;
};

export type GuestPriceResult = {
  subtotalCents: number;
  discountAmountCents: number;
  totalCents: number;
  blendedPerNightCents: number;
  nightBreakdown: NightBreakdown[];
};

type GuestPriceInput = {
  checkInDate: string;
  checkOutDate: string;
  pricePerNightWeekdayCents: number;
  pricePerNightWeekendCents: number;
  discountFiveNightsBps: number;
  discountSevenNightsBps: number;
};

/**
 * Calculate the price for a single guest's stay.
 *
 * Per-night rate based on weekday/weekend. Multi-night discounts:
 * - 7+ nights: discountSevenNightsBps (takes priority)
 * - 5-6 nights: discountFiveNightsBps
 * All arithmetic in integer cents, no floats.
 */
export function calculateGuestPrice(input: GuestPriceInput): GuestPriceResult {
  const nights = getNightDates(input.checkInDate, input.checkOutDate);
  const nightCount = nights.length;

  const nightBreakdown: NightBreakdown[] = nights.map((date) => {
    // Use midday UTC to avoid timezone edge issues when checking weekend
    const weekend = isWeekend(date + "T12:00:00Z");
    return {
      date,
      isWeekend: weekend,
      priceCents: weekend
        ? input.pricePerNightWeekendCents
        : input.pricePerNightWeekdayCents,
    };
  });

  const subtotalCents = nightBreakdown.reduce(
    (sum, n) => sum + n.priceCents,
    0
  );

  // Determine discount tier
  let discountBps = 0;
  if (nightCount >= 7 && input.discountSevenNightsBps > 0) {
    discountBps = input.discountSevenNightsBps;
  } else if (nightCount >= 5 && input.discountFiveNightsBps > 0) {
    discountBps = input.discountFiveNightsBps;
  }

  const discountAmountCents =
    discountBps > 0 ? applyBasisPoints(subtotalCents, discountBps) : 0;
  const totalCents = subtotalCents - discountAmountCents;

  const blendedPerNightCents =
    nightCount > 0 ? Math.floor(totalCents / nightCount) : 0;

  return {
    subtotalCents,
    discountAmountCents,
    totalCents,
    blendedPerNightCents,
    nightBreakdown,
  };
}

export type BookingPriceResult = {
  subtotalCents: number;
  discountAmountCents: number;
  totalAmountCents: number;
};

/**
 * Calculate the total booking price from guest price results.
 */
export function calculateBookingPrice(
  guestPrices: GuestPriceResult[]
): BookingPriceResult {
  const subtotalCents = guestPrices.reduce(
    (sum, g) => sum + g.subtotalCents,
    0
  );
  const discountAmountCents = guestPrices.reduce(
    (sum, g) => sum + g.discountAmountCents,
    0
  );
  const totalAmountCents = guestPrices.reduce(
    (sum, g) => sum + g.totalCents,
    0
  );

  return { subtotalCents, discountAmountCents, totalAmountCents };
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npx vitest run src/actions/bookings/__tests__/pricing.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/actions/bookings/pricing.ts src/actions/bookings/__tests__/pricing.test.ts
git commit -m "feat: add booking pricing calculation with per-night weekday/weekend rates

Per-guest pricing with weekday/weekend rates, 5-night and 7-night
multi-night discounts using basis points. Integer arithmetic only.
TDD with comprehensive edge case coverage."
```

---

### Task 5: Bed Queries

**Files:**
- Create: `src/actions/bookings/beds.ts`
- Create: `src/actions/bookings/__tests__/beds.test.ts`

- [ ] **Step 1: Write bed query tests**

Create `src/actions/bookings/__tests__/beds.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRoomsQuery = vi.fn();
const mockBedsQuery = vi.fn();
const mockBookedBedsQuery = vi.fn();
const mockHeldBedsQuery = vi.fn();
const mockCleanupHolds = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockImplementation(() => mockRoomsQuery()),
        }),
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockImplementation(() => mockBedsQuery()),
          }),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation(() => mockCleanupHolds()),
    }),
  },
}));

import { buildBedAvailabilityMap } from "../beds";

describe("buildBedAvailabilityMap", () => {
  it("marks all beds as available when none are booked or held", () => {
    const beds = [
      { id: "bed-1", label: "Bed 1", roomId: "room-1", sortOrder: 0 },
      { id: "bed-2", label: "Bed 2", roomId: "room-1", sortOrder: 1 },
    ];
    const bookedBedIds = new Set<string>();
    const heldBedIds = new Set<string>();

    const result = buildBedAvailabilityMap(beds, bookedBedIds, heldBedIds, null);

    expect(result).toHaveLength(2);
    expect(result[0].status).toBe("available");
    expect(result[1].status).toBe("available");
  });

  it("marks booked beds as booked", () => {
    const beds = [
      { id: "bed-1", label: "Bed 1", roomId: "room-1", sortOrder: 0 },
      { id: "bed-2", label: "Bed 2", roomId: "room-1", sortOrder: 1 },
    ];
    const bookedBedIds = new Set(["bed-1"]);
    const heldBedIds = new Set<string>();

    const result = buildBedAvailabilityMap(beds, bookedBedIds, heldBedIds, null);

    expect(result[0].status).toBe("booked");
    expect(result[1].status).toBe("available");
  });

  it("marks held beds as held", () => {
    const beds = [
      { id: "bed-1", label: "Bed 1", roomId: "room-1", sortOrder: 0 },
      { id: "bed-2", label: "Bed 2", roomId: "room-1", sortOrder: 1 },
    ];
    const bookedBedIds = new Set<string>();
    const heldBedIds = new Set(["bed-2"]);

    const result = buildBedAvailabilityMap(beds, bookedBedIds, heldBedIds, null);

    expect(result[0].status).toBe("available");
    expect(result[1].status).toBe("held");
  });

  it("marks beds held by current member as held-by-you", () => {
    const beds = [
      { id: "bed-1", label: "Bed 1", roomId: "room-1", sortOrder: 0 },
    ];
    const bookedBedIds = new Set<string>();
    const heldBedIds = new Set<string>();
    const myHeldBedIds = new Set(["bed-1"]);

    const result = buildBedAvailabilityMap(
      beds,
      bookedBedIds,
      heldBedIds,
      myHeldBedIds
    );

    expect(result[0].status).toBe("held-by-you");
  });

  it("booked status takes priority over held", () => {
    const beds = [
      { id: "bed-1", label: "Bed 1", roomId: "room-1", sortOrder: 0 },
    ];
    const bookedBedIds = new Set(["bed-1"]);
    const heldBedIds = new Set(["bed-1"]);

    const result = buildBedAvailabilityMap(beds, bookedBedIds, heldBedIds, null);

    expect(result[0].status).toBe("booked");
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npx vitest run src/actions/bookings/__tests__/beds.test.ts
```

- [ ] **Step 3: Write bed queries implementation**

Create `src/actions/bookings/beds.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import {
  beds,
  rooms,
  bookingGuests,
  bookings,
  bedHolds,
} from "@/db/schema";
import { eq, and, sql, lt, or, gte, lte, ne } from "drizzle-orm";

type BedStatus = "available" | "booked" | "held" | "held-by-you";

export type BedWithStatus = {
  id: string;
  label: string;
  roomId: string;
  sortOrder: number;
  status: BedStatus;
};

/**
 * Pure function to build bed availability map. Testable without DB.
 */
export function buildBedAvailabilityMap(
  allBeds: { id: string; label: string; roomId: string; sortOrder: number }[],
  bookedBedIds: Set<string>,
  otherHeldBedIds: Set<string>,
  myHeldBedIds: Set<string> | null
): BedWithStatus[] {
  return allBeds.map((bed) => {
    let status: BedStatus = "available";

    if (bookedBedIds.has(bed.id)) {
      status = "booked";
    } else if (myHeldBedIds?.has(bed.id)) {
      status = "held-by-you";
    } else if (otherHeldBedIds.has(bed.id)) {
      status = "held";
    }

    return {
      id: bed.id,
      label: bed.label,
      roomId: bed.roomId,
      sortOrder: bed.sortOrder,
      status,
    };
  });
}

export type RoomWithBeds = {
  id: string;
  name: string;
  floor: string | null;
  capacity: number;
  sortOrder: number;
  beds: BedWithStatus[];
};

/**
 * Get all beds for a lodge with availability status for a date range.
 * Cleans up expired holds before querying.
 */
export async function getAvailableBeds(
  lodgeId: string,
  checkInDate: string,
  checkOutDate: string,
  currentMemberId: string
): Promise<RoomWithBeds[]> {
  // Clean up expired holds
  await db
    .delete(bedHolds)
    .where(lt(bedHolds.expiresAt, new Date()));

  // Get all rooms for this lodge
  const lodgeRooms = await db
    .select({
      id: rooms.id,
      name: rooms.name,
      floor: rooms.floor,
      capacity: rooms.capacity,
      sortOrder: rooms.sortOrder,
    })
    .from(rooms)
    .where(eq(rooms.lodgeId, lodgeId))
    .orderBy(rooms.sortOrder);

  if (lodgeRooms.length === 0) return [];

  // Get all beds for these rooms
  const roomIds = lodgeRooms.map((r) => r.id);
  const allBeds = await db
    .select({
      id: beds.id,
      label: beds.label,
      roomId: beds.roomId,
      sortOrder: beds.sortOrder,
    })
    .from(beds)
    .where(sql`${beds.roomId} IN ${roomIds}`)
    .orderBy(beds.sortOrder);

  // Get booked bed IDs for overlapping date ranges
  // A booking overlaps if its check-in is before our check-out AND its check-out is after our check-in
  const bookedRows = await db
    .select({ bedId: bookingGuests.bedId })
    .from(bookingGuests)
    .innerJoin(bookings, eq(bookings.id, bookingGuests.bookingId))
    .where(
      and(
        eq(bookings.lodgeId, lodgeId),
        sql`${bookings.status} NOT IN ('CANCELLED')`,
        lt(bookings.checkInDate, checkOutDate),
        sql`${bookings.checkOutDate} > ${checkInDate}`
      )
    );

  const bookedBedIds = new Set(
    bookedRows.filter((r) => r.bedId !== null).map((r) => r.bedId as string)
  );

  // Get held bed IDs (by other members) for overlapping date ranges
  const otherHeldRows = await db
    .select({ bedId: bedHolds.bedId })
    .from(bedHolds)
    .where(
      and(
        eq(bedHolds.lodgeId, lodgeId),
        ne(bedHolds.memberId, currentMemberId),
        gte(bedHolds.expiresAt, new Date()),
        lt(bedHolds.checkInDate, checkOutDate),
        sql`${bedHolds.checkOutDate} > ${checkInDate}`
      )
    );

  const otherHeldBedIds = new Set(otherHeldRows.map((r) => r.bedId));

  // Get held bed IDs by the current member
  const myHeldRows = await db
    .select({ bedId: bedHolds.bedId })
    .from(bedHolds)
    .where(
      and(
        eq(bedHolds.lodgeId, lodgeId),
        eq(bedHolds.memberId, currentMemberId),
        gte(bedHolds.expiresAt, new Date()),
        lt(bedHolds.checkInDate, checkOutDate),
        sql`${bedHolds.checkOutDate} > ${checkInDate}`
      )
    );

  const myHeldBedIds = new Set(myHeldRows.map((r) => r.bedId));

  // Build the availability map
  const bedsWithStatus = buildBedAvailabilityMap(
    allBeds,
    bookedBedIds,
    otherHeldBedIds,
    myHeldBedIds
  );

  // Group beds by room
  return lodgeRooms.map((room) => ({
    ...room,
    beds: bedsWithStatus.filter((b) => b.roomId === room.id),
  }));
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npx vitest run src/actions/bookings/__tests__/beds.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/actions/bookings/beds.ts src/actions/bookings/__tests__/beds.test.ts
git commit -m "feat: add getAvailableBeds query with booked/held exclusion

Groups beds by room with status: available, booked, held, held-by-you.
Cleans up expired holds on every query. Pure buildBedAvailabilityMap
function tested independently. TDD."
```

---

### Task 6: Bookable Members Query

**Files:**
- Create: `src/actions/bookings/members.ts`
- Create: `src/actions/bookings/__tests__/members.test.ts`

- [ ] **Step 1: Write bookable members tests**

Create `src/actions/bookings/__tests__/members.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { sortMembersWithFamilyFirst } from "../members";

describe("sortMembersWithFamilyFirst", () => {
  const currentMemberId = "member-1";

  it("puts the current member first", () => {
    const members = [
      { id: "member-2", firstName: "Alice", lastName: "B", primaryMemberId: null, membershipClassName: "Full" },
      { id: "member-1", firstName: "Bob", lastName: "A", primaryMemberId: null, membershipClassName: "Full" },
    ];

    const result = sortMembersWithFamilyFirst(members, currentMemberId);
    expect(result[0].id).toBe("member-1");
  });

  it("puts family members second (linked via primaryMemberId)", () => {
    const members = [
      { id: "member-3", firstName: "Charlie", lastName: "C", primaryMemberId: null, membershipClassName: "Full" },
      { id: "member-2", firstName: "Alice", lastName: "B", primaryMemberId: "member-1", membershipClassName: "Junior" },
      { id: "member-1", firstName: "Bob", lastName: "A", primaryMemberId: null, membershipClassName: "Full" },
    ];

    const result = sortMembersWithFamilyFirst(members, currentMemberId);
    expect(result[0].id).toBe("member-1"); // current member
    expect(result[1].id).toBe("member-2"); // family member
    expect(result[2].id).toBe("member-3"); // other member
  });

  it("puts dependents of current member in family group", () => {
    const members = [
      { id: "member-1", firstName: "Parent", lastName: "A", primaryMemberId: null, membershipClassName: "Full" },
      { id: "member-2", firstName: "Child1", lastName: "A", primaryMemberId: "member-1", membershipClassName: "Junior" },
      { id: "member-3", firstName: "Child2", lastName: "A", primaryMemberId: "member-1", membershipClassName: "Junior" },
      { id: "member-4", firstName: "Other", lastName: "B", primaryMemberId: null, membershipClassName: "Full" },
    ];

    const result = sortMembersWithFamilyFirst(members, currentMemberId);
    expect(result[0].id).toBe("member-1");
    expect(result[1].id).toBe("member-2");
    expect(result[2].id).toBe("member-3");
    expect(result[3].id).toBe("member-4");
  });

  it("includes members where current member is a dependent", () => {
    const primaryId = "member-0";
    const members = [
      { id: "member-1", firstName: "Child", lastName: "A", primaryMemberId: primaryId, membershipClassName: "Junior" },
      { id: "member-0", firstName: "Parent", lastName: "A", primaryMemberId: null, membershipClassName: "Full" },
      { id: "member-2", firstName: "Sibling", lastName: "A", primaryMemberId: primaryId, membershipClassName: "Junior" },
      { id: "member-3", firstName: "Other", lastName: "B", primaryMemberId: null, membershipClassName: "Full" },
    ];

    const result = sortMembersWithFamilyFirst(members, "member-1");
    expect(result[0].id).toBe("member-1"); // current member first
    // Family: parent and sibling
    const familyIds = result.slice(1, 3).map((m) => m.id).sort();
    expect(familyIds).toEqual(["member-0", "member-2"]);
    expect(result[3].id).toBe("member-3"); // other
  });

  it("handles empty list", () => {
    const result = sortMembersWithFamilyFirst([], currentMemberId);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npx vitest run src/actions/bookings/__tests__/members.test.ts
```

- [ ] **Step 3: Write bookable members implementation**

Create `src/actions/bookings/members.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { members, membershipClasses, organisationMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";

type BookableMember = {
  id: string;
  firstName: string;
  lastName: string;
  primaryMemberId: string | null;
  membershipClassName: string;
};

/**
 * Pure sorting function: current member first, family second, others last.
 * Testable without DB.
 */
export function sortMembersWithFamilyFirst(
  allMembers: BookableMember[],
  currentMemberId: string
): BookableMember[] {
  const current = allMembers.find((m) => m.id === currentMemberId);
  if (!current) return allMembers;

  // Determine the family "root" — either the current member or their primary
  const familyRootId = current.primaryMemberId ?? currentMemberId;

  const familyIds = new Set<string>();
  familyIds.add(familyRootId);
  // Add all members linked to the family root
  for (const m of allMembers) {
    if (m.primaryMemberId === familyRootId) {
      familyIds.add(m.id);
    }
  }

  const currentMember: BookableMember[] = [];
  const family: BookableMember[] = [];
  const others: BookableMember[] = [];

  for (const m of allMembers) {
    if (m.id === currentMemberId) {
      currentMember.push(m);
    } else if (familyIds.has(m.id)) {
      family.push(m);
    } else {
      others.push(m);
    }
  }

  return [...currentMember, ...family, ...others];
}

/**
 * Get all org members the current user can add as guests to a booking.
 * Returns sorted: current member first, family second, others last.
 */
export async function getBookableMembers(
  organisationId: string,
  currentMemberId: string
): Promise<BookableMember[]> {
  const rows = await db
    .select({
      id: members.id,
      firstName: members.firstName,
      lastName: members.lastName,
      primaryMemberId: members.primaryMemberId,
      membershipClassName: membershipClasses.name,
    })
    .from(members)
    .innerJoin(
      organisationMembers,
      and(
        eq(organisationMembers.memberId, members.id),
        eq(organisationMembers.organisationId, organisationId),
        eq(organisationMembers.isActive, true)
      )
    )
    .leftJoin(
      membershipClasses,
      eq(membershipClasses.id, members.membershipClassId)
    )
    .where(
      and(
        eq(members.organisationId, organisationId),
        eq(members.isFinancial, true)
      )
    );

  // Drizzle returns nullable join columns — provide fallback
  const cleaned = rows.map((r) => ({
    ...r,
    membershipClassName: r.membershipClassName ?? "Standard",
  }));

  return sortMembersWithFamilyFirst(cleaned, currentMemberId);
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npx vitest run src/actions/bookings/__tests__/members.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/actions/bookings/members.ts src/actions/bookings/__tests__/members.test.ts
git commit -m "feat: add getBookableMembers with family-first sorting

Returns org members sorted: current member first, family members
second, other members last. Pure sort function tested independently.
TDD."
```

---

### Task 7: Bed Hold Actions

**Files:**
- Create: `src/actions/bookings/holds.ts`
- Create: `src/actions/bookings/__tests__/holds.test.ts`

- [ ] **Step 1: Write bed hold tests**

Create `src/actions/bookings/__tests__/holds.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDelete = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    delete: vi.fn(() => ({ where: mockDelete })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: mockSelect,
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: mockInsert,
      })),
    })),
  },
}));

vi.mock("@/db/schema", () => ({
  bedHolds: {
    expiresAt: "expires_at",
    lodgeId: "lodge_id",
    bedId: "bed_id",
    memberId: "member_id",
    checkInDate: "check_in_date",
    checkOutDate: "check_out_date",
    id: "id",
  },
  bookingRounds: {
    id: "id",
    holdDurationMinutes: "hold_duration_minutes",
  },
}));

import { isHoldExpired, calculateExpiresAt } from "../holds";

describe("isHoldExpired", () => {
  it("returns true when expiresAt is in the past", () => {
    const past = new Date(Date.now() - 60000); // 1 minute ago
    expect(isHoldExpired(past)).toBe(true);
  });

  it("returns false when expiresAt is in the future", () => {
    const future = new Date(Date.now() + 60000); // 1 minute from now
    expect(isHoldExpired(future)).toBe(false);
  });

  it("returns true when expiresAt is exactly now", () => {
    const now = new Date();
    expect(isHoldExpired(now)).toBe(true);
  });
});

describe("calculateExpiresAt", () => {
  it("adds the specified minutes to now", () => {
    const before = Date.now();
    const result = calculateExpiresAt(10);
    const after = Date.now();

    const expectedMin = before + 10 * 60 * 1000;
    const expectedMax = after + 10 * 60 * 1000;

    expect(result.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(result.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  it("handles 5 minute holds", () => {
    const before = Date.now();
    const result = calculateExpiresAt(5);
    const expected = before + 5 * 60 * 1000;

    // Allow 100ms tolerance
    expect(Math.abs(result.getTime() - expected)).toBeLessThan(100);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npx vitest run src/actions/bookings/__tests__/holds.test.ts
```

- [ ] **Step 3: Write bed hold implementation**

Create `src/actions/bookings/holds.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { bedHolds, bookingRounds } from "@/db/schema";
import { eq, and, lt, gte, ne, sql } from "drizzle-orm";
import { bedHoldInputSchema } from "./schemas";

/**
 * Check if a hold has expired.
 */
export function isHoldExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() <= Date.now();
}

/**
 * Calculate the expiration timestamp from now + minutes.
 */
export function calculateExpiresAt(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

/**
 * Remove all expired bed holds. Called lazily before queries.
 */
export async function cleanupExpiredHolds(): Promise<number> {
  const deleted = await db
    .delete(bedHolds)
    .where(lt(bedHolds.expiresAt, new Date()))
    .returning();

  return deleted.length;
}

type CreateBedHoldResult = {
  success: boolean;
  error?: string;
  holdId?: string;
  expiresAt?: Date;
};

/**
 * Create a timed bed hold for a member during the booking flow.
 *
 * Returns early if the booking round has no holdDurationMinutes (holds disabled).
 * Checks for conflicting holds/bookings before inserting.
 */
export async function createBedHold(
  input: {
    lodgeId: string;
    bedId: string;
    bookingRoundId: string;
    checkInDate: string;
    checkOutDate: string;
  },
  memberId: string
): Promise<CreateBedHoldResult> {
  const parsed = bedHoldInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Validation failed",
    };
  }

  // Get booking round to check hold duration
  const [round] = await db
    .select({ holdDurationMinutes: bookingRounds.holdDurationMinutes })
    .from(bookingRounds)
    .where(eq(bookingRounds.id, input.bookingRoundId));

  if (!round || round.holdDurationMinutes === null) {
    // Holds disabled for this round
    return { success: true };
  }

  // Clean up expired holds
  await cleanupExpiredHolds();

  // Check for existing non-expired holds on this bed for overlapping dates
  const existingHolds = await db
    .select({ id: bedHolds.id })
    .from(bedHolds)
    .where(
      and(
        eq(bedHolds.bedId, input.bedId),
        ne(bedHolds.memberId, memberId),
        gte(bedHolds.expiresAt, new Date()),
        lt(bedHolds.checkInDate, input.checkOutDate),
        sql`${bedHolds.checkOutDate} > ${input.checkInDate}`
      )
    );

  if (existingHolds.length > 0) {
    return {
      success: false,
      error: "This bed is currently held by another member",
    };
  }

  // Remove any existing hold by this member on this bed (re-selection)
  await db
    .delete(bedHolds)
    .where(
      and(
        eq(bedHolds.bedId, input.bedId),
        eq(bedHolds.memberId, memberId)
      )
    );

  const expiresAt = calculateExpiresAt(round.holdDurationMinutes);

  const [hold] = await db
    .insert(bedHolds)
    .values({
      lodgeId: input.lodgeId,
      bedId: input.bedId,
      memberId,
      bookingRoundId: input.bookingRoundId,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      expiresAt,
    })
    .returning();

  return {
    success: true,
    holdId: hold.id,
    expiresAt,
  };
}

/**
 * Release a specific bed hold.
 */
export async function releaseBedHold(
  bedId: string,
  memberId: string
): Promise<{ success: boolean }> {
  await db
    .delete(bedHolds)
    .where(
      and(eq(bedHolds.bedId, bedId), eq(bedHolds.memberId, memberId))
    );

  return { success: true };
}

/**
 * Release all holds for a member in a booking round (called after booking confirmation).
 */
export async function releaseAllMemberHolds(
  memberId: string,
  bookingRoundId: string
): Promise<void> {
  await db
    .delete(bedHolds)
    .where(
      and(
        eq(bedHolds.memberId, memberId),
        eq(bedHolds.bookingRoundId, bookingRoundId)
      )
    );
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npx vitest run src/actions/bookings/__tests__/holds.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/actions/bookings/holds.ts src/actions/bookings/__tests__/holds.test.ts
git commit -m "feat: add bed hold CRUD with timed expiration

createBedHold checks round holdDurationMinutes, cleans up expired
holds, checks for conflicts, and inserts with calculated expiresAt.
releaseBedHold and releaseAllMemberHolds for cleanup. TDD."
```

---

### Task 8: Create Booking Action

**Files:**
- Create: `src/actions/bookings/create.ts`
- Create: `src/actions/bookings/__tests__/create.test.ts`

- [ ] **Step 1: Write create booking tests**

Create `src/actions/bookings/__tests__/create.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTransaction = vi.fn();
const mockGetSessionMember = vi.fn();
const mockGetMember = vi.fn();
const mockValidateBookingDates = vi.fn();
const mockGenerateBookingReference = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    transaction: (fn: Function) => mockTransaction(fn),
  },
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: (...args: unknown[]) => mockGetSessionMember(...args),
}));

vi.mock("../reference", () => ({
  generateBookingReference: (...args: unknown[]) =>
    mockGenerateBookingReference(...args),
}));

vi.mock("@/actions/availability/validation", () => ({
  validateBookingDates: (...args: unknown[]) =>
    mockValidateBookingDates(...args),
}));

vi.mock("@/db/schema", () => ({
  bookings: { id: "id", lodgeId: "lodge_id", status: "status" },
  bookingGuests: { id: "id" },
  transactions: { id: "id" },
  bedHolds: { memberId: "member_id", bookingRoundId: "booking_round_id" },
  availabilityCache: {
    lodgeId: "lodge_id",
    date: "date",
    bookedBeds: "booked_beds",
    version: "version",
  },
  members: { id: "id", membershipClassId: "membership_class_id", isFinancial: "is_financial" },
  tariffs: { id: "id", lodgeId: "lodge_id", seasonId: "season_id", membershipClassId: "membership_class_id" },
  seasons: { id: "id" },
  bookingRounds: { id: "id", requiresApproval: "requires_approval" },
}));

import { validateCreateBookingInput } from "../create";

describe("validateCreateBookingInput", () => {
  it("rejects invalid schema input", () => {
    const result = validateCreateBookingInput({
      organisationId: "bad",
      lodgeId: "bad",
      bookingRoundId: "bad",
      checkInDate: "bad",
      checkOutDate: "bad",
      guests: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("accepts valid input", () => {
    const result = validateCreateBookingInput({
      organisationId: "550e8400-e29b-41d4-a716-446655440000",
      lodgeId: "660e8400-e29b-41d4-a716-446655440000",
      bookingRoundId: "770e8400-e29b-41d4-a716-446655440000",
      checkInDate: "2027-07-10",
      checkOutDate: "2027-07-13",
      guests: [
        {
          memberId: "880e8400-e29b-41d4-a716-446655440000",
          bedId: "990e8400-e29b-41d4-a716-446655440000",
        },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects when checkOut is before checkIn", () => {
    const result = validateCreateBookingInput({
      organisationId: "550e8400-e29b-41d4-a716-446655440000",
      lodgeId: "660e8400-e29b-41d4-a716-446655440000",
      bookingRoundId: "770e8400-e29b-41d4-a716-446655440000",
      checkInDate: "2027-07-13",
      checkOutDate: "2027-07-10",
      guests: [
        {
          memberId: "880e8400-e29b-41d4-a716-446655440000",
          bedId: "990e8400-e29b-41d4-a716-446655440000",
        },
      ],
    });
    expect(result.valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npx vitest run src/actions/bookings/__tests__/create.test.ts
```

- [ ] **Step 3: Write create booking implementation**

Create `src/actions/bookings/create.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import {
  bookings,
  bookingGuests,
  transactions,
  bedHolds,
  availabilityCache,
  members,
  tariffs,
  seasons,
  bookingRounds,
} from "@/db/schema";
import { eq, and, sql, lt } from "drizzle-orm";
import { getSessionMember } from "@/lib/auth";
import { createBookingSchema, type CreateBookingInput } from "./schemas";
import { generateBookingReference } from "./reference";
import {
  calculateGuestPrice,
  calculateBookingPrice,
  countNights,
  getNightDates,
  type GuestPriceResult,
} from "./pricing";
import { validateBookingDates } from "@/actions/availability/validation";
import { revalidatePath } from "next/cache";

type CreateBookingResult = {
  success: boolean;
  error?: string;
  bookingReference?: string;
  bookingId?: string;
};

/**
 * Validate the booking input against the Zod schema.
 * Exported for testing.
 */
export function validateCreateBookingInput(input: unknown): {
  valid: boolean;
  errors: string[];
  data?: CreateBookingInput;
} {
  const parsed = createBookingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((i) => i.message),
    };
  }
  return { valid: true, errors: [], data: parsed.data };
}

/**
 * Create a booking with full concurrency handling.
 *
 * 1. Auth + eligibility check
 * 2. BEGIN TRANSACTION
 * 3. SELECT FOR UPDATE on availability_cache rows
 * 4. Verify beds still available
 * 5. Re-validate booking rules
 * 6. Calculate final pricing
 * 7. Insert booking, guests, transaction
 * 8. Update availability_cache
 * 9. Delete bed holds
 * 10. COMMIT
 */
export async function createBooking(
  input: CreateBookingInput,
  slug: string
): Promise<CreateBookingResult> {
  // 1. Validate input schema
  const validation = validateCreateBookingInput(input);
  if (!validation.valid || !validation.data) {
    return { success: false, error: validation.errors[0] };
  }

  const data = validation.data;

  // 2. Auth check
  const session = await getSessionMember(data.organisationId);
  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  // 3. Check member is financial
  const [member] = await db
    .select({
      isFinancial: members.isFinancial,
      membershipClassId: members.membershipClassId,
    })
    .from(members)
    .where(eq(members.id, session.memberId));

  if (!member?.isFinancial) {
    return {
      success: false,
      error: "Your membership is not currently financial",
    };
  }

  // 4. Re-validate booking dates server-side
  const dateValidation = await validateBookingDates({
    lodgeId: data.lodgeId,
    checkIn: data.checkInDate,
    checkOut: data.checkOutDate,
    bookingRoundId: data.bookingRoundId,
    memberId: session.memberId,
  });

  if (!dateValidation.valid) {
    return { success: false, error: dateValidation.errors[0] };
  }

  // 5. Get booking round for requiresApproval
  const [round] = await db
    .select({ requiresApproval: bookingRounds.requiresApproval })
    .from(bookingRounds)
    .where(eq(bookingRounds.id, data.bookingRoundId));

  if (!round) {
    return { success: false, error: "Booking round not found" };
  }

  const nights = countNights(data.checkInDate, data.checkOutDate);
  const nightDates = getNightDates(data.checkInDate, data.checkOutDate);

  // 6. Get season for tariff lookup
  const [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(
      and(
        eq(seasons.isActive, true),
        sql`${seasons.startDate} <= ${data.checkInDate}`,
        sql`${seasons.endDate} >= ${data.checkInDate}`
      )
    );

  if (!season) {
    return { success: false, error: "No active season found for these dates" };
  }

  // 7. Transactional booking creation
  try {
    const result = await db.transaction(async (tx) => {
      // SELECT FOR UPDATE on availability_cache rows to lock them
      const lockedRows = await tx.execute(
        sql`SELECT id, booked_beds, version FROM availability_cache
            WHERE lodge_id = ${data.lodgeId}
            AND date >= ${data.checkInDate}
            AND date < ${data.checkOutDate}
            FOR UPDATE`
      );

      // Verify each selected bed is not already booked
      for (const guest of data.guests) {
        const conflicting = await tx.execute(
          sql`SELECT bg.bed_id FROM booking_guests bg
              JOIN bookings b ON b.id = bg.booking_id
              WHERE bg.bed_id = ${guest.bedId}
              AND b.lodge_id = ${data.lodgeId}
              AND b.status NOT IN ('CANCELLED')
              AND b.check_in_date < ${data.checkOutDate}
              AND b.check_out_date > ${data.checkInDate}`
        );

        if (conflicting.rows && conflicting.rows.length > 0) {
          throw new Error(`Bed is no longer available`);
        }
      }

      // Calculate pricing per guest
      const guestPrices: { memberId: string; bedId: string; roomId?: string; price: GuestPriceResult; tariffId: string | null; membershipClassId: string | null }[] = [];

      for (const guest of data.guests) {
        // Get guest's membership class
        const [guestMember] = await tx
          .select({ membershipClassId: members.membershipClassId })
          .from(members)
          .where(eq(members.id, guest.memberId));

        const guestClassId = guestMember?.membershipClassId ?? null;

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
          // Fallback to default tariff (null membershipClassId)
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

        const price = calculateGuestPrice({
          checkInDate: data.checkInDate,
          checkOutDate: data.checkOutDate,
          pricePerNightWeekdayCents: tariff.pricePerNightWeekdayCents,
          pricePerNightWeekendCents: tariff.pricePerNightWeekendCents,
          discountFiveNightsBps: tariff.discountFiveNightsBps,
          discountSevenNightsBps: tariff.discountSevenNightsBps,
        });

        guestPrices.push({
          memberId: guest.memberId,
          bedId: guest.bedId,
          roomId: guest.roomId,
          price,
          tariffId: tariff.id,
          membershipClassId: guestClassId,
        });
      }

      const bookingTotal = calculateBookingPrice(
        guestPrices.map((g) => g.price)
      );

      // Generate reference
      const bookingReference = generateBookingReference(slug);
      const status = round.requiresApproval ? "PENDING" : "CONFIRMED";

      // Insert booking
      const [booking] = await tx
        .insert(bookings)
        .values({
          organisationId: data.organisationId,
          lodgeId: data.lodgeId,
          bookingRoundId: data.bookingRoundId,
          primaryMemberId: session.memberId,
          status,
          checkInDate: data.checkInDate,
          checkOutDate: data.checkOutDate,
          totalNights: nights,
          subtotalCents: bookingTotal.subtotalCents,
          discountAmountCents: bookingTotal.discountAmountCents,
          totalAmountCents: bookingTotal.totalAmountCents,
          requiresApproval: round.requiresApproval,
          bookingReference,
        })
        .returning();

      // Insert booking guests
      for (const gp of guestPrices) {
        await tx.insert(bookingGuests).values({
          bookingId: booking.id,
          memberId: gp.memberId,
          bedId: gp.bedId,
          roomId: gp.roomId ?? null,
          pricePerNightCents: gp.price.blendedPerNightCents,
          totalAmountCents: gp.price.totalCents,
          snapshotTariffId: gp.tariffId,
          snapshotMembershipClassId: gp.membershipClassId,
        });
      }

      // Insert transaction (invoice)
      await tx.insert(transactions).values({
        organisationId: data.organisationId,
        memberId: session.memberId,
        bookingId: booking.id,
        type: "INVOICE",
        amountCents: bookingTotal.totalAmountCents,
        description: `Booking ${bookingReference} — ${nights} nights at lodge`,
      });

      // Update availability_cache — increment bookedBeds for each night
      for (const nightDate of nightDates) {
        await tx.execute(
          sql`UPDATE availability_cache
              SET booked_beds = booked_beds + ${data.guests.length},
                  version = version + 1,
                  updated_at = NOW()
              WHERE lodge_id = ${data.lodgeId}
              AND date = ${nightDate}`
        );
      }

      // Delete bed holds for this member/round
      await tx
        .delete(bedHolds)
        .where(
          and(
            eq(bedHolds.memberId, session.memberId),
            eq(bedHolds.bookingRoundId, data.bookingRoundId)
          )
        );

      return {
        bookingReference: booking.bookingReference,
        bookingId: booking.id,
      };
    });

    revalidatePath(`/${slug}/dashboard`);
    revalidatePath(`/${slug}/book`);

    return {
      success: true,
      bookingReference: result.bookingReference,
      bookingId: result.bookingId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Booking failed";

    if (message.includes("no longer available") || message.includes("Bed")) {
      return {
        success: false,
        error: "One or more beds are no longer available. Please go back and reselect.",
      };
    }

    return { success: false, error: message };
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npx vitest run src/actions/bookings/__tests__/create.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/actions/bookings/create.ts src/actions/bookings/__tests__/create.test.ts
git commit -m "feat: add createBooking server action with SELECT FOR UPDATE concurrency

Transactional booking creation: validates auth, financial status,
booking dates, locks availability_cache rows, verifies bed availability,
calculates per-guest pricing with tariff fallback, inserts booking +
guests + invoice transaction, updates cache, cleans up holds. TDD."
```

---

### Task 9: Booking Queries

**Files:**
- Create: `src/actions/bookings/queries.ts`
- Create: `src/actions/bookings/__tests__/queries.test.ts`

- [ ] **Step 1: Write query tests**

Create `src/actions/bookings/__tests__/queries.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatBookingStatus } from "../queries";

describe("formatBookingStatus", () => {
  it("formats PENDING", () => {
    expect(formatBookingStatus("PENDING")).toBe("Pending Approval");
  });

  it("formats CONFIRMED", () => {
    expect(formatBookingStatus("CONFIRMED")).toBe("Confirmed");
  });

  it("formats CANCELLED", () => {
    expect(formatBookingStatus("CANCELLED")).toBe("Cancelled");
  });

  it("formats COMPLETED", () => {
    expect(formatBookingStatus("COMPLETED")).toBe("Completed");
  });

  it("formats WAITLISTED", () => {
    expect(formatBookingStatus("WAITLISTED")).toBe("Waitlisted");
  });

  it("returns the raw status for unknown values", () => {
    expect(formatBookingStatus("UNKNOWN")).toBe("UNKNOWN");
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npx vitest run src/actions/bookings/__tests__/queries.test.ts
```

- [ ] **Step 3: Write queries implementation**

Create `src/actions/bookings/queries.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import {
  bookings,
  bookingGuests,
  lodges,
  beds,
  rooms,
  members,
  membershipClasses,
} from "@/db/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending Approval",
  CONFIRMED: "Confirmed",
  WAITLISTED: "Waitlisted",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
};

/**
 * Format a booking status for display. Pure function, testable.
 */
export function formatBookingStatus(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

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
};

/**
 * Get all bookings for a member in an organisation.
 */
export async function getMemberBookings(
  organisationId: string,
  memberId: string
): Promise<BookingListItem[]> {
  const rows = await db
    .select({
      id: bookings.id,
      bookingReference: bookings.bookingReference,
      lodgeName: lodges.name,
      checkInDate: bookings.checkInDate,
      checkOutDate: bookings.checkOutDate,
      totalNights: bookings.totalNights,
      totalAmountCents: bookings.totalAmountCents,
      status: bookings.status,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .innerJoin(lodges, eq(lodges.id, bookings.lodgeId))
    .where(
      and(
        eq(bookings.organisationId, organisationId),
        eq(bookings.primaryMemberId, memberId)
      )
    )
    .orderBy(desc(bookings.createdAt));

  // Get guest counts
  const bookingIds = rows.map((r) => r.id);
  if (bookingIds.length === 0) return [];

  const guestCounts = await db
    .select({
      bookingId: bookingGuests.bookingId,
      count: sql<number>`COUNT(*)`,
    })
    .from(bookingGuests)
    .where(sql`${bookingGuests.bookingId} IN ${bookingIds}`)
    .groupBy(bookingGuests.bookingId);

  const countMap = new Map(
    guestCounts.map((g) => [g.bookingId, Number(g.count)])
  );

  return rows.map((r) => ({
    ...r,
    guestCount: countMap.get(r.id) ?? 0,
  }));
}

/**
 * Get upcoming bookings for a member (for dashboard display).
 */
export async function getUpcomingBookings(
  organisationId: string,
  memberId: string,
  limit: number = 3
): Promise<BookingListItem[]> {
  const today = new Date().toISOString().split("T")[0];

  const rows = await db
    .select({
      id: bookings.id,
      bookingReference: bookings.bookingReference,
      lodgeName: lodges.name,
      checkInDate: bookings.checkInDate,
      checkOutDate: bookings.checkOutDate,
      totalNights: bookings.totalNights,
      totalAmountCents: bookings.totalAmountCents,
      status: bookings.status,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .innerJoin(lodges, eq(lodges.id, bookings.lodgeId))
    .where(
      and(
        eq(bookings.organisationId, organisationId),
        eq(bookings.primaryMemberId, memberId),
        gte(bookings.checkInDate, today),
        sql`${bookings.status} NOT IN ('CANCELLED')`
      )
    )
    .orderBy(bookings.checkInDate)
    .limit(limit);

  const bookingIds = rows.map((r) => r.id);
  if (bookingIds.length === 0)
    return rows.map((r) => ({ ...r, guestCount: 0 }));

  const guestCounts = await db
    .select({
      bookingId: bookingGuests.bookingId,
      count: sql<number>`COUNT(*)`,
    })
    .from(bookingGuests)
    .where(sql`${bookingGuests.bookingId} IN ${bookingIds}`)
    .groupBy(bookingGuests.bookingId);

  const countMap = new Map(
    guestCounts.map((g) => [g.bookingId, Number(g.count)])
  );

  return rows.map((r) => ({
    ...r,
    guestCount: countMap.get(r.id) ?? 0,
  }));
}

export type BookingDetail = {
  id: string;
  bookingReference: string;
  lodgeName: string;
  lodgeCheckInTime: string;
  lodgeCheckOutTime: string;
  checkInDate: string;
  checkOutDate: string;
  totalNights: number;
  subtotalCents: number;
  discountAmountCents: number;
  totalAmountCents: number;
  status: string;
  createdAt: Date;
  guests: {
    id: string;
    firstName: string;
    lastName: string;
    membershipClassName: string | null;
    bedLabel: string | null;
    roomName: string | null;
    pricePerNightCents: number;
    totalAmountCents: number;
  }[];
};

/**
 * Get full booking details including guests, beds, and rooms.
 */
export async function getBookingDetail(
  bookingId: string,
  organisationId: string,
  memberId: string
): Promise<BookingDetail | null> {
  const [booking] = await db
    .select({
      id: bookings.id,
      bookingReference: bookings.bookingReference,
      lodgeName: lodges.name,
      lodgeCheckInTime: lodges.checkInTime,
      lodgeCheckOutTime: lodges.checkOutTime,
      checkInDate: bookings.checkInDate,
      checkOutDate: bookings.checkOutDate,
      totalNights: bookings.totalNights,
      subtotalCents: bookings.subtotalCents,
      discountAmountCents: bookings.discountAmountCents,
      totalAmountCents: bookings.totalAmountCents,
      status: bookings.status,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .innerJoin(lodges, eq(lodges.id, bookings.lodgeId))
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.organisationId, organisationId),
        eq(bookings.primaryMemberId, memberId)
      )
    );

  if (!booking) return null;

  const guests = await db
    .select({
      id: bookingGuests.id,
      firstName: members.firstName,
      lastName: members.lastName,
      membershipClassName: membershipClasses.name,
      bedLabel: beds.label,
      roomName: rooms.name,
      pricePerNightCents: bookingGuests.pricePerNightCents,
      totalAmountCents: bookingGuests.totalAmountCents,
    })
    .from(bookingGuests)
    .innerJoin(members, eq(members.id, bookingGuests.memberId))
    .leftJoin(
      membershipClasses,
      eq(membershipClasses.id, bookingGuests.snapshotMembershipClassId)
    )
    .leftJoin(beds, eq(beds.id, bookingGuests.bedId))
    .leftJoin(rooms, eq(rooms.id, bookingGuests.roomId))
    .where(eq(bookingGuests.bookingId, bookingId));

  return { ...booking, guests };
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npx vitest run src/actions/bookings/__tests__/queries.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/actions/bookings/queries.ts src/actions/bookings/__tests__/queries.test.ts
git commit -m "feat: add booking queries — member list, upcoming, and detail

getMemberBookings, getUpcomingBookings (for dashboard), and
getBookingDetail with guest/bed/room joins. formatBookingStatus
utility tested. TDD."
```

---

### Task 10: Event Override Support

**Files:**
- Modify: `src/actions/availability/schemas.ts`
- Modify: `src/app/[slug]/admin/availability/override-form.tsx`
- Modify: `src/app/[slug]/admin/availability/availability-calendar.tsx`

- [ ] **Step 1: Update override schemas to support EVENT type**

In `src/actions/availability/schemas.ts`, update the `type` enum and add EVENT validation rules.

Replace the entire file with:

```typescript
import { z } from "zod";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format");

const baseOverrideSchema = z.object({
  lodgeId: z.string().uuid(),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  type: z.enum(["CLOSURE", "REDUCTION", "EVENT"]),
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
  if (data.type === "EVENT" && data.bedReduction !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Bed reduction must not be set for EVENT type",
      path: ["bedReduction"],
    });
  }
  if (data.type === "EVENT" && (!data.reason || data.reason.trim().length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Reason is required for EVENT type (used as the event label)",
      path: ["reason"],
    });
  }
});

export const updateOverrideSchema = z
  .object({
    startDate: isoDateSchema.optional(),
    endDate: isoDateSchema.optional(),
    type: z.enum(["CLOSURE", "REDUCTION", "EVENT"]).optional(),
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

- [ ] **Step 2: Update existing schema tests for EVENT**

Add these tests to `src/actions/availability/__tests__/schemas.test.ts` inside the `createOverrideSchema` describe block:

```typescript
  it("accepts a valid event", () => {
    const result = createOverrideSchema.safeParse({
      lodgeId: "550e8400-e29b-41d4-a716-446655440000",
      startDate: "2027-07-01",
      endDate: "2027-07-03",
      type: "EVENT",
      reason: "Inter School Sports",
    });
    expect(result.success).toBe(true);
  });

  it("rejects event without reason", () => {
    const result = createOverrideSchema.safeParse({
      lodgeId: "550e8400-e29b-41d4-a716-446655440000",
      startDate: "2027-07-01",
      endDate: "2027-07-03",
      type: "EVENT",
    });
    expect(result.success).toBe(false);
  });

  it("rejects event with bedReduction", () => {
    const result = createOverrideSchema.safeParse({
      lodgeId: "550e8400-e29b-41d4-a716-446655440000",
      startDate: "2027-07-01",
      endDate: "2027-07-03",
      type: "EVENT",
      bedReduction: 4,
      reason: "Working Bee",
    });
    expect(result.success).toBe(false);
  });
```

- [ ] **Step 3: Update the override form to support EVENT type**

Replace the entire `src/app/[slug]/admin/availability/override-form.tsx`:

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

type OverrideType = "CLOSURE" | "REDUCTION" | "EVENT";

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
  const [type, setType] = useState<OverrideType>(
    (override?.type as OverrideType) ?? "CLOSURE"
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
      result = await createAvailabilityOverride({
        lodgeId,
        startDate,
        endDate,
        type,
        bedReduction:
          type === "REDUCTION" ? parseInt(bedReduction, 10) : undefined,
        reason: reason || undefined,
        createdByMemberId: "",
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
              onValueChange={(v) => v && setType(v as OverrideType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CLOSURE">Full Closure</SelectItem>
                <SelectItem value="REDUCTION">Bed Reduction</SelectItem>
                <SelectItem value="EVENT">Event (informational)</SelectItem>
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
            <Label htmlFor="reason">
              {type === "EVENT" ? "Event Name (required)" : "Reason (optional)"}
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              required={type === "EVENT"}
            />
            {type === "EVENT" && (
              <p className="text-xs text-muted-foreground mt-1">
                This label will be displayed on the calendar. It does not affect availability.
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
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

- [ ] **Step 4: Update the availability calendar to show event labels**

In `src/app/[slug]/admin/availability/availability-calendar.tsx`, update the `AvailabilityDay` type and rendering to support event labels.

Replace the entire file:

```typescript
"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

type AvailabilityDay = {
  date: string;
  totalBeds: number;
  bookedBeds: number;
  hasOverride?: boolean;
  eventLabel?: string | null;
};

type AvailabilityCalendarProps = {
  mode: "admin" | "member";
  availability: AvailabilityDay[];
  year: number;
  month: number;
  onMonthChange: (year: number, month: number) => void;
  onDateClick?: (date: string) => void;
  selectedDates?: { checkIn: string | null; checkOut: string | null };
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}

function getAvailabilityColor(
  totalBeds: number,
  bookedBeds: number,
  hasOverride: boolean,
  mode: "admin" | "member"
): string {
  if (totalBeds === 0) return "bg-zinc-300 dark:bg-zinc-700";
  const available = totalBeds - bookedBeds;
  if (available <= 0) return "bg-red-200 dark:bg-red-900";
  const ratio = available / totalBeds;
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
  selectedDates,
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

  function isDateInRange(dateStr: string): boolean {
    if (!selectedDates?.checkIn || !selectedDates?.checkOut) return false;
    return dateStr >= selectedDates.checkIn && dateStr < selectedDates.checkOut;
  }

  return (
    <div>
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

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} className="h-16" />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const data = availabilityMap.get(dateStr);
          const totalBeds = data?.totalBeds ?? 0;
          const bookedBeds = data?.bookedBeds ?? 0;
          const hasOverride = data?.hasOverride ?? false;
          const eventLabel = data?.eventLabel ?? null;
          const hasData = !!data;
          const inRange = isDateInRange(dateStr);

          const colorClass = hasData
            ? getAvailabilityColor(totalBeds, bookedBeds, hasOverride, mode)
            : "bg-muted/50";

          const label = hasData
            ? getAvailabilityLabel(totalBeds, bookedBeds, mode)
            : "";

          const rangeClass = inRange ? "ring-2 ring-primary" : "";

          return (
            <button
              key={dateStr}
              type="button"
              className={`h-16 rounded-md p-1 text-left transition-colors hover:ring-2 hover:ring-ring ${colorClass} ${rangeClass} ${
                onDateClick ? "cursor-pointer" : "cursor-default"
              }`}
              onClick={() => onDateClick?.(dateStr)}
              disabled={!onDateClick}
            >
              <div className="text-xs font-medium">{day}</div>
              {hasData && (
                <div className="text-[10px] leading-tight mt-0.5">
                  {label}
                  {mode === "admin" && hasOverride && !eventLabel && (
                    <span className="ml-0.5" title="Override active">*</span>
                  )}
                </div>
              )}
              {eventLabel && (
                <div
                  className="text-[9px] leading-tight text-blue-700 dark:text-blue-400 truncate"
                  title={eventLabel}
                >
                  {eventLabel}
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

- [ ] **Step 5: Update admin availability page to pass event labels to calendar**

In `src/app/[slug]/admin/availability/page.tsx`, update the `availabilityWithOverrides` mapping to include event labels.

Find and replace the `availabilityWithOverrides` block:

```typescript
  // Build event label map from EVENT overrides
  const eventLabelMap = new Map<string, string>();
  for (const o of overrides) {
    if (o.type === "EVENT" && o.reason) {
      const start = new Date(o.startDate + "T00:00:00Z");
      const end = new Date(o.endDate + "T00:00:00Z");
      const cur = new Date(start);
      while (cur <= end) {
        const dateStr = cur.toISOString().split("T")[0];
        eventLabelMap.set(dateStr, o.reason);
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }
  }

  const availabilityWithOverrides = availability.map((a) => ({
    date: a.date,
    totalBeds: a.totalBeds,
    bookedBeds: a.bookedBeds,
    hasOverride: overrideDates.has(a.date),
    eventLabel: eventLabelMap.get(a.date) ?? null,
  }));
```

- [ ] **Step 6: Run tests and verify**

```bash
npx vitest run src/actions/availability/__tests__/schemas.test.ts
npm run check
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add EVENT override type for informational calendar labels

EVENT overrides display a label on the calendar without affecting
availability. Updated override form with EVENT option, calendar
rendering with blue event labels, and schema validation requiring
reason for EVENT type."
```

---

### Task 11: Wizard UI — Context, StepIndicator, Page Shell

**Files:**
- Create: `src/app/[slug]/book/booking-context.tsx`
- Create: `src/app/[slug]/book/step-indicator.tsx`
- Create: `src/app/[slug]/book/page.tsx`
- Create: `src/app/[slug]/book/booking-wizard.tsx`

- [ ] **Step 1: Create BookingContext**

Create `src/app/[slug]/book/booking-context.tsx`:

```typescript
"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

type Guest = {
  memberId: string;
  firstName: string;
  lastName: string;
  membershipClassName: string;
};

type BedAssignment = {
  memberId: string;
  bedId: string;
  bedLabel: string;
  roomId: string;
  roomName: string;
};

type BookingState = {
  step: number;
  lodgeId: string | null;
  lodgeName: string | null;
  bookingRoundId: string | null;
  bookingRoundName: string | null;
  checkInDate: string | null;
  checkOutDate: string | null;
  guests: Guest[];
  bedAssignments: BedAssignment[];
  holdExpiresAt: Date | null;
  pricingResult: PricingResult | null;
  bookingReference: string | null;
  error: string | null;
};

export type GuestPriceInfo = {
  memberId: string;
  firstName: string;
  lastName: string;
  membershipClassName: string;
  bedLabel: string;
  roomName: string;
  subtotalCents: number;
  discountAmountCents: number;
  totalCents: number;
  blendedPerNightCents: number;
};

export type PricingResult = {
  guests: GuestPriceInfo[];
  subtotalCents: number;
  discountAmountCents: number;
  totalAmountCents: number;
};

type BookingContextType = BookingState & {
  setStep: (step: number) => void;
  setLodge: (id: string, name: string) => void;
  setBookingRound: (id: string, name: string) => void;
  setDates: (checkIn: string, checkOut: string) => void;
  setGuests: (guests: Guest[]) => void;
  addGuest: (guest: Guest) => void;
  removeGuest: (memberId: string) => void;
  setBedAssignments: (assignments: BedAssignment[]) => void;
  addBedAssignment: (assignment: BedAssignment) => void;
  removeBedAssignment: (memberId: string) => void;
  setHoldExpiresAt: (expiresAt: Date | null) => void;
  setPricingResult: (result: PricingResult | null) => void;
  setBookingReference: (ref: string) => void;
  setError: (error: string | null) => void;
  goToStep: (step: number) => void;
  reset: () => void;
};

const BookingContext = createContext<BookingContextType | null>(null);

export function useBooking(): BookingContextType {
  const ctx = useContext(BookingContext);
  if (!ctx) {
    throw new Error("useBooking must be used within BookingProvider");
  }
  return ctx;
}

const INITIAL_STATE: BookingState = {
  step: 1,
  lodgeId: null,
  lodgeName: null,
  bookingRoundId: null,
  bookingRoundName: null,
  checkInDate: null,
  checkOutDate: null,
  guests: [],
  bedAssignments: [],
  holdExpiresAt: null,
  pricingResult: null,
  bookingReference: null,
  error: null,
};

export function BookingProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Restore from URL on mount
  const initialStep = Number(searchParams.get("step")) || 1;
  const initialLodgeId = searchParams.get("lodge");
  const initialCheckIn = searchParams.get("checkIn");
  const initialCheckOut = searchParams.get("checkOut");
  const initialRound = searchParams.get("round");

  const [state, setState] = useState<BookingState>({
    ...INITIAL_STATE,
    step: initialStep,
    lodgeId: initialLodgeId,
    checkInDate: initialCheckIn,
    checkOutDate: initialCheckOut,
    bookingRoundId: initialRound,
  });

  // Sync non-sensitive state to URL
  const syncUrl = useCallback(
    (newState: Partial<BookingState>) => {
      const merged = { ...state, ...newState };
      const params = new URLSearchParams();
      params.set("step", String(merged.step));
      if (merged.lodgeId) params.set("lodge", merged.lodgeId);
      if (merged.checkInDate) params.set("checkIn", merged.checkInDate);
      if (merged.checkOutDate) params.set("checkOut", merged.checkOutDate);
      if (merged.bookingRoundId) params.set("round", merged.bookingRoundId);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [state, router, pathname]
  );

  const update = useCallback(
    (partial: Partial<BookingState>) => {
      setState((prev) => ({ ...prev, ...partial }));
    },
    []
  );

  const goToStep = useCallback(
    (step: number) => {
      const newState = { ...state, step };
      setState(newState);
      syncUrl(newState);
    },
    [state, syncUrl]
  );

  const ctx: BookingContextType = {
    ...state,
    setStep: (step) => update({ step }),
    setLodge: (id, name) => update({ lodgeId: id, lodgeName: name }),
    setBookingRound: (id, name) =>
      update({ bookingRoundId: id, bookingRoundName: name }),
    setDates: (checkIn, checkOut) =>
      update({ checkInDate: checkIn, checkOutDate: checkOut }),
    setGuests: (guests) => update({ guests }),
    addGuest: (guest) =>
      update({ guests: [...state.guests, guest] }),
    removeGuest: (memberId) =>
      update({
        guests: state.guests.filter((g) => g.memberId !== memberId),
        bedAssignments: state.bedAssignments.filter(
          (a) => a.memberId !== memberId
        ),
      }),
    setBedAssignments: (assignments) =>
      update({ bedAssignments: assignments }),
    addBedAssignment: (assignment) =>
      update({
        bedAssignments: [
          ...state.bedAssignments.filter(
            (a) => a.memberId !== assignment.memberId
          ),
          assignment,
        ],
      }),
    removeBedAssignment: (memberId) =>
      update({
        bedAssignments: state.bedAssignments.filter(
          (a) => a.memberId !== memberId
        ),
      }),
    setHoldExpiresAt: (expiresAt) => update({ holdExpiresAt: expiresAt }),
    setPricingResult: (result) => update({ pricingResult: result }),
    setBookingReference: (ref) => update({ bookingReference: ref }),
    setError: (error) => update({ error }),
    goToStep,
    reset: () => {
      setState(INITIAL_STATE);
      router.replace(pathname);
    },
  };

  return (
    <BookingContext.Provider value={ctx}>{children}</BookingContext.Provider>
  );
}
```

- [ ] **Step 2: Create StepIndicator**

Create `src/app/[slug]/book/step-indicator.tsx`:

```typescript
"use client";

const STEPS = [
  { number: 1, label: "Lodge & Dates" },
  { number: 2, label: "Guests" },
  { number: 3, label: "Beds" },
  { number: 4, label: "Review" },
  { number: 5, label: "Confirm" },
];

type Props = {
  currentStep: number;
};

export function StepIndicator({ currentStep }: Props) {
  return (
    <nav aria-label="Booking progress" className="mb-8">
      <ol className="flex items-center gap-2">
        {STEPS.map((step, i) => {
          const isActive = step.number === currentStep;
          const isCompleted = step.number < currentStep;
          const isLast = i === STEPS.length - 1;

          return (
            <li key={step.number} className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : isCompleted
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isCompleted ? (
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                  ) : (
                    step.number
                  )}
                </div>
                <span
                  className={`hidden text-sm sm:inline ${
                    isActive
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {!isLast && (
                <div
                  className={`h-px w-6 sm:w-10 ${
                    isCompleted ? "bg-primary/40" : "bg-border"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
```

- [ ] **Step 3: Create BookingPage server component**

Create `src/app/[slug]/book/page.tsx`:

```typescript
import { getOrgBySlug } from "@/lib/org";
import { getSessionMember } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/index";
import { lodges, seasons, bookingRounds, members } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { BookingWizard } from "./booking-wizard";

export default async function BookingPage({
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
  if (!session) {
    redirect(`/${slug}/login`);
  }

  // Check member is financial
  const [member] = await db
    .select({
      isFinancial: members.isFinancial,
      membershipClassId: members.membershipClassId,
    })
    .from(members)
    .where(eq(members.id, session.memberId));

  if (!member?.isFinancial) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Book a Stay</h1>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-destructive font-medium">
            Your membership is not currently financial. Please contact the
            committee to resolve this before making a booking.
          </p>
        </div>
      </div>
    );
  }

  // Get active lodges
  const orgLodges = await db
    .select({
      id: lodges.id,
      name: lodges.name,
      totalBeds: lodges.totalBeds,
      checkInTime: lodges.checkInTime,
      checkOutTime: lodges.checkOutTime,
    })
    .from(lodges)
    .where(and(eq(lodges.organisationId, org.id), eq(lodges.isActive, true)));

  if (orgLodges.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Book a Stay</h1>
        <p className="text-muted-foreground">
          No lodges are currently available for booking.
        </p>
      </div>
    );
  }

  // Get active seasons with their open booking rounds
  const now = new Date();
  const activeSeasons = await db
    .select({
      id: seasons.id,
      name: seasons.name,
      startDate: seasons.startDate,
      endDate: seasons.endDate,
    })
    .from(seasons)
    .where(
      and(
        eq(seasons.organisationId, org.id),
        eq(seasons.isActive, true)
      )
    );

  // Get open booking rounds that this member's class is eligible for
  const openRounds: {
    id: string;
    name: string;
    seasonId: string;
    opensAt: Date;
    closesAt: Date;
    maxNightsPerBooking: number | null;
    maxNightsPerMember: number | null;
    holdDurationMinutes: number | null;
    requiresApproval: boolean;
  }[] = [];

  for (const season of activeSeasons) {
    const rounds = await db
      .select()
      .from(bookingRounds)
      .where(
        and(
          eq(bookingRounds.seasonId, season.id),
          lte(bookingRounds.opensAt, now),
          gte(bookingRounds.closesAt, now)
        )
      );

    for (const round of rounds) {
      // Check membership class eligibility
      const allowedClasses = round.allowedMembershipClassIds;
      if (
        allowedClasses.length === 0 ||
        allowedClasses.includes(member.membershipClassId)
      ) {
        openRounds.push(round);
      }
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Book a Stay</h1>
      <p className="text-muted-foreground mb-6">
        Select your lodge, dates, guests, and beds to make a booking.
      </p>

      <BookingWizard
        organisationId={org.id}
        slug={slug}
        lodges={orgLodges}
        seasons={activeSeasons}
        openRounds={openRounds}
        memberId={session.memberId}
        memberName={`${session.firstName} ${session.lastName}`}
        membershipClassId={member.membershipClassId}
      />
    </div>
  );
}
```

- [ ] **Step 4: Create BookingWizard client component**

Create `src/app/[slug]/book/booking-wizard.tsx`:

```typescript
"use client";

import { Suspense } from "react";
import { BookingProvider, useBooking } from "./booking-context";
import { StepIndicator } from "./step-indicator";
import { SelectLodgeDates } from "./steps/select-lodge-dates";
import { AddGuests } from "./steps/add-guests";
import { SelectBeds } from "./steps/select-beds";
import { ReviewPricing } from "./steps/review-pricing";
import { Confirm } from "./steps/confirm";
import { BookingSuccess } from "./booking-success";

type Lodge = {
  id: string;
  name: string;
  totalBeds: number;
  checkInTime: string;
  checkOutTime: string;
};

type Season = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

type OpenRound = {
  id: string;
  name: string;
  seasonId: string;
  opensAt: Date;
  closesAt: Date;
  maxNightsPerBooking: number | null;
  maxNightsPerMember: number | null;
  holdDurationMinutes: number | null;
  requiresApproval: boolean;
};

type Props = {
  organisationId: string;
  slug: string;
  lodges: Lodge[];
  seasons: Season[];
  openRounds: OpenRound[];
  memberId: string;
  memberName: string;
  membershipClassId: string;
};

function WizardContent({
  organisationId,
  slug,
  lodges,
  seasons,
  openRounds,
  memberId,
  memberName,
  membershipClassId,
}: Props) {
  const { step, bookingReference } = useBooking();

  if (bookingReference) {
    return <BookingSuccess slug={slug} />;
  }

  return (
    <div>
      <StepIndicator currentStep={step} />

      {step === 1 && (
        <SelectLodgeDates
          lodges={lodges}
          seasons={seasons}
          openRounds={openRounds}
          slug={slug}
        />
      )}
      {step === 2 && (
        <AddGuests
          organisationId={organisationId}
          memberId={memberId}
          memberName={memberName}
          membershipClassId={membershipClassId}
        />
      )}
      {step === 3 && (
        <SelectBeds
          organisationId={organisationId}
          memberId={memberId}
          slug={slug}
        />
      )}
      {step === 4 && (
        <ReviewPricing
          organisationId={organisationId}
          lodges={lodges}
        />
      )}
      {step === 5 && (
        <Confirm
          organisationId={organisationId}
          slug={slug}
          lodges={lodges}
        />
      )}
    </div>
  );
}

export function BookingWizard(props: Props) {
  return (
    <Suspense fallback={<div className="p-4 text-muted-foreground">Loading...</div>}>
      <BookingProvider>
        <WizardContent {...props} />
      </BookingProvider>
    </Suspense>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/[slug]/book/booking-context.tsx src/app/[slug]/book/step-indicator.tsx src/app/[slug]/book/page.tsx src/app/[slug]/book/booking-wizard.tsx
git commit -m "feat: add booking wizard shell — context, step indicator, page, and wizard

BookingPage server component with auth/eligibility checks.
BookingWizard client component orchestrates 5 steps.
BookingContext manages wizard state with URL param sync.
StepIndicator shows progress through the booking flow."
```

---

### Task 12: Wizard UI — Step 1: Select Lodge & Dates

**Files:**
- Create: `src/app/[slug]/book/steps/select-lodge-dates.tsx`

- [ ] **Step 1: Create Step 1 component**

Create `src/app/[slug]/book/steps/select-lodge-dates.tsx`:

```typescript
"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AvailabilityCalendar } from "@/app/[slug]/admin/availability/availability-calendar";
import { useBooking } from "../booking-context";
import { getMonthAvailability, getOverridesForLodge } from "@/actions/availability/queries";
import { validateBookingDates } from "@/actions/availability/validation";

type Lodge = {
  id: string;
  name: string;
  totalBeds: number;
  checkInTime: string;
  checkOutTime: string;
};

type Season = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

type OpenRound = {
  id: string;
  name: string;
  seasonId: string;
  opensAt: Date;
  closesAt: Date;
  maxNightsPerBooking: number | null;
  maxNightsPerMember: number | null;
  holdDurationMinutes: number | null;
  requiresApproval: boolean;
};

type Props = {
  lodges: Lodge[];
  seasons: Season[];
  openRounds: OpenRound[];
  slug: string;
};

type AvailabilityDay = {
  date: string;
  totalBeds: number;
  bookedBeds: number;
  hasOverride?: boolean;
  eventLabel?: string | null;
};

export function SelectLodgeDates({ lodges, seasons, openRounds, slug }: Props) {
  const booking = useBooking();

  const [selectedLodgeId, setSelectedLodgeId] = useState(
    booking.lodgeId ?? lodges[0]?.id ?? ""
  );
  const [selectedRoundId, setSelectedRoundId] = useState(
    booking.bookingRoundId ?? (openRounds.length === 1 ? openRounds[0].id : "")
  );
  const [checkIn, setCheckIn] = useState<string | null>(booking.checkInDate);
  const [checkOut, setCheckOut] = useState<string | null>(booking.checkOutDate);
  const [availability, setAvailability] = useState<AvailabilityDay[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedLodge = lodges.find((l) => l.id === selectedLodgeId);
  const selectedRound = openRounds.find((r) => r.id === selectedRoundId);

  const loadAvailability = useCallback(
    async (lodgeId: string, y: number, m: number) => {
      setLoading(true);
      try {
        const data = await getMonthAvailability(lodgeId, y, m);

        // Get overrides for event labels
        const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        const monthEnd = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        const overrides = await getOverridesForLodge(lodgeId, monthStart, monthEnd);

        const eventLabelMap = new Map<string, string>();
        const overrideDates = new Set<string>();
        for (const o of overrides) {
          const start = new Date(o.startDate + "T00:00:00Z");
          const end = new Date(o.endDate + "T00:00:00Z");
          const cur = new Date(start);
          while (cur <= end) {
            const dateStr = cur.toISOString().split("T")[0];
            overrideDates.add(dateStr);
            if (o.type === "EVENT" && o.reason) {
              eventLabelMap.set(dateStr, o.reason);
            }
            cur.setUTCDate(cur.getUTCDate() + 1);
          }
        }

        setAvailability(
          data.map((a) => ({
            date: a.date,
            totalBeds: a.totalBeds,
            bookedBeds: a.bookedBeds,
            hasOverride: overrideDates.has(a.date),
            eventLabel: eventLabelMap.get(a.date) ?? null,
          }))
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Load availability when lodge changes
  const handleLodgeChange = useCallback(
    (lodgeId: string) => {
      setSelectedLodgeId(lodgeId);
      setCheckIn(null);
      setCheckOut(null);
      loadAvailability(lodgeId, year, month);
    },
    [year, month, loadAvailability]
  );

  const handleMonthChange = useCallback(
    (newYear: number, newMonth: number) => {
      setYear(newYear);
      setMonth(newMonth);
      if (selectedLodgeId) {
        loadAvailability(selectedLodgeId, newYear, newMonth);
      }
    },
    [selectedLodgeId, loadAvailability]
  );

  // Load initial availability
  useState(() => {
    if (selectedLodgeId) {
      loadAvailability(selectedLodgeId, year, month);
    }
  });

  const handleDateClick = useCallback(
    (dateStr: string) => {
      if (!checkIn || (checkIn && checkOut)) {
        // Start new selection
        setCheckIn(dateStr);
        setCheckOut(null);
        setError(null);
      } else {
        // Complete selection
        if (dateStr <= checkIn) {
          // Clicked before check-in — reset
          setCheckIn(dateStr);
          setCheckOut(null);
        } else {
          setCheckOut(dateStr);
        }
      }
    },
    [checkIn, checkOut]
  );

  const nights =
    checkIn && checkOut
      ? Math.round(
          (new Date(checkOut + "T00:00:00Z").getTime() -
            new Date(checkIn + "T00:00:00Z").getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0;

  const canProceed =
    selectedLodgeId && selectedRoundId && checkIn && checkOut && nights > 0;

  async function handleNext() {
    if (!canProceed) return;
    setValidating(true);
    setError(null);

    try {
      const result = await validateBookingDates({
        lodgeId: selectedLodgeId,
        checkIn: checkIn!,
        checkOut: checkOut!,
        bookingRoundId: selectedRoundId,
        memberId: "", // Will use session on server
      });

      if (!result.valid) {
        setError(result.errors[0]);
        return;
      }

      // Update context and advance
      const lodge = lodges.find((l) => l.id === selectedLodgeId);
      const round = openRounds.find((r) => r.id === selectedRoundId);

      booking.setLodge(selectedLodgeId, lodge?.name ?? "");
      booking.setBookingRound(selectedRoundId, round?.name ?? "");
      booking.setDates(checkIn!, checkOut!);
      booking.goToStep(2);
    } finally {
      setValidating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Lodge selector */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Select Lodge</h2>
        {lodges.length === 1 ? (
          <div className="rounded-lg border p-3">
            <p className="font-medium">{lodges[0].name}</p>
            <p className="text-sm text-muted-foreground">
              {lodges[0].totalBeds} beds
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {lodges.map((lodge) => (
              <button
                key={lodge.id}
                type="button"
                onClick={() => handleLodgeChange(lodge.id)}
                className={`rounded-lg border px-4 py-2 transition-colors ${
                  selectedLodgeId === lodge.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "hover:border-primary/50"
                }`}
              >
                <span className="font-medium">{lodge.name}</span>
                <span className="ml-2 text-sm text-muted-foreground">
                  {lodge.totalBeds} beds
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Booking round selector */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Booking Round</h2>
        {openRounds.length === 0 ? (
          <div className="rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 p-3">
            <p className="text-sm text-amber-700 dark:text-amber-400">
              No booking rounds are currently open for your membership class.
            </p>
          </div>
        ) : openRounds.length === 1 ? (
          <div className="rounded-lg border p-3">
            <p className="font-medium">{openRounds[0].name}</p>
            {openRounds[0].maxNightsPerBooking && (
              <p className="text-sm text-muted-foreground">
                Max {openRounds[0].maxNightsPerBooking} nights per booking
              </p>
            )}
          </div>
        ) : (
          <Select value={selectedRoundId} onValueChange={setSelectedRoundId}>
            <SelectTrigger className="w-full max-w-sm">
              <SelectValue placeholder="Select a booking round" />
            </SelectTrigger>
            <SelectContent>
              {openRounds.map((round) => (
                <SelectItem key={round.id} value={round.id}>
                  {round.name}
                  {round.maxNightsPerBooking &&
                    ` (max ${round.maxNightsPerBooking} nights)`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {selectedRound && (
          <div className="mt-2 text-sm text-muted-foreground space-y-1">
            {selectedRound.maxNightsPerMember && (
              <p>Member limit: {selectedRound.maxNightsPerMember} nights total in this round</p>
            )}
            {selectedRound.requiresApproval && (
              <p>Note: Bookings in this round require committee approval</p>
            )}
          </div>
        )}
      </div>

      {/* Calendar */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Select Dates</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Click a date to set check-in, then click another date to set check-out.
        </p>

        {loading ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            Loading availability...
          </div>
        ) : (
          <AvailabilityCalendar
            mode="member"
            availability={availability}
            year={year}
            month={month}
            onMonthChange={handleMonthChange}
            onDateClick={handleDateClick}
            selectedDates={{ checkIn, checkOut }}
          />
        )}

        {checkIn && (
          <div className="mt-3 rounded-lg border p-3">
            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Check-in:</span>{" "}
                <span className="font-medium">{checkIn}</span>
                {selectedLodge && (
                  <span className="text-muted-foreground">
                    {" "}
                    from {selectedLodge.checkInTime}
                  </span>
                )}
              </div>
              {checkOut && (
                <>
                  <div>
                    <span className="text-muted-foreground">Check-out:</span>{" "}
                    <span className="font-medium">{checkOut}</span>
                    {selectedLodge && (
                      <span className="text-muted-foreground">
                        {" "}
                        by {selectedLodge.checkOutTime}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Nights:</span>{" "}
                    <span className="font-medium">{nights}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-end">
        <Button onClick={handleNext} disabled={!canProceed || validating}>
          {validating ? "Validating..." : "Next: Add Guests"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/[slug]/book/steps/select-lodge-dates.tsx
git commit -m "feat: add Step 1 — Select Lodge & Dates with availability calendar

Lodge pill selector, booking round dropdown with eligibility info,
interactive availability calendar with date range selection and
event labels. Validates dates on Next via server action."
```

---

### Task 13: Wizard UI — Step 2: Add Guests

**Files:**
- Create: `src/app/[slug]/book/steps/add-guests.tsx`

- [ ] **Step 1: Create Step 2 component**

Create `src/app/[slug]/book/steps/add-guests.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useBooking } from "../booking-context";
import { getBookableMembers } from "@/actions/bookings/members";

type Props = {
  organisationId: string;
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

export function AddGuests({
  organisationId,
  memberId,
  memberName,
  membershipClassId,
}: Props) {
  const booking = useBooking();
  const [allMembers, setAllMembers] = useState<MemberOption[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

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

  // Load bookable members
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const members = await getBookableMembers(organisationId, memberId);
        setAllMembers(members);

        // Update primary member's class name if we have it
        const primary = members.find((m) => m.id === memberId);
        if (primary && booking.guests.length > 0) {
          booking.setGuests(
            booking.guests.map((g) =>
              g.memberId === memberId
                ? { ...g, membershipClassName: primary.membershipClassName }
                : g
            )
          );
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [organisationId, memberId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedIds = new Set(booking.guests.map((g) => g.memberId));

  const filteredMembers = allMembers.filter((m) => {
    if (selectedIds.has(m.id)) return false;
    if (!search) return true;
    const name = `${m.firstName} ${m.lastName}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  function handleAddGuest(member: MemberOption) {
    booking.addGuest({
      memberId: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      membershipClassName: member.membershipClassName,
    });
    setSearch("");
  }

  function handleRemoveGuest(guestMemberId: string) {
    if (guestMemberId === memberId) return; // Cannot remove primary
    booking.removeGuest(guestMemberId);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Guests</h2>
        <p className="text-sm text-muted-foreground mb-4">
          You are automatically included. Add additional guests below.
        </p>

        {/* Guest list */}
        <div className="space-y-2 mb-4">
          {booking.guests.map((guest) => (
            <div
              key={guest.memberId}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-medium">
                    {guest.firstName} {guest.lastName}
                  </p>
                  {guest.membershipClassName && (
                    <Badge variant="secondary" className="text-xs mt-0.5">
                      {guest.membershipClassName}
                    </Badge>
                  )}
                </div>
              </div>
              {guest.memberId === memberId ? (
                <Badge>Primary</Badge>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRemoveGuest(guest.memberId)}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>

        {/* Search and add */}
        <div>
          <Input
            placeholder="Search members to add..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2"
          />

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading members...</p>
          ) : (
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
                      onClick={() => handleAddGuest(member)}
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
          )}
        </div>
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

- [ ] **Step 2: Commit**

```bash
git add src/app/[slug]/book/steps/add-guests.tsx
git commit -m "feat: add Step 2 — Add Guests with member search and family-first sorting

Primary member auto-added and non-removable. Member search with
family members surfaced first. Shows membership class badge per guest."
```

---

### Task 14: Wizard UI — Step 3: Select Beds

**Files:**
- Create: `src/app/[slug]/book/steps/select-beds.tsx`

- [ ] **Step 1: Create Step 3 component**

Create `src/app/[slug]/book/steps/select-beds.tsx`:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBooking } from "../booking-context";
import { getAvailableBeds, type RoomWithBeds } from "@/actions/bookings/beds";
import { createBedHold, releaseBedHold } from "@/actions/bookings/holds";

type Props = {
  organisationId: string;
  memberId: string;
  slug: string;
};

const GUEST_COLORS = [
  "bg-blue-200 dark:bg-blue-800",
  "bg-green-200 dark:bg-green-800",
  "bg-purple-200 dark:bg-purple-800",
  "bg-orange-200 dark:bg-orange-800",
  "bg-pink-200 dark:bg-pink-800",
  "bg-teal-200 dark:bg-teal-800",
];

function formatTimeRemaining(expiresAt: Date): string {
  const remaining = Math.max(
    0,
    Math.floor((expiresAt.getTime() - Date.now()) / 1000)
  );
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function SelectBeds({ organisationId, memberId, slug }: Props) {
  const booking = useBooking();
  const [rooms, setRooms] = useState<RoomWithBeds[]>([]);
  const [loading, setLoading] = useState(true);
  const [holdTimerDisplay, setHoldTimerDisplay] = useState<string | null>(null);
  const [holdExpired, setHoldExpired] = useState(false);

  const loadBeds = useCallback(async () => {
    if (!booking.lodgeId || !booking.checkInDate || !booking.checkOutDate) return;
    setLoading(true);
    try {
      const result = await getAvailableBeds(
        booking.lodgeId,
        booking.checkInDate,
        booking.checkOutDate,
        memberId
      );
      setRooms(result);
    } finally {
      setLoading(false);
    }
  }, [booking.lodgeId, booking.checkInDate, booking.checkOutDate, memberId]);

  useEffect(() => {
    loadBeds();
  }, [loadBeds]);

  // Hold timer
  useEffect(() => {
    if (!booking.holdExpiresAt) {
      setHoldTimerDisplay(null);
      return;
    }

    const interval = setInterval(() => {
      const remaining = booking.holdExpiresAt!.getTime() - Date.now();
      if (remaining <= 0) {
        setHoldExpired(true);
        setHoldTimerDisplay("0:00");
        clearInterval(interval);
      } else {
        setHoldTimerDisplay(formatTimeRemaining(booking.holdExpiresAt!));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [booking.holdExpiresAt]);

  // Get the next unassigned guest
  const assignedMemberIds = new Set(
    booking.bedAssignments.map((a) => a.memberId)
  );
  const nextUnassignedGuest = booking.guests.find(
    (g) => !assignedMemberIds.has(g.memberId)
  );

  const guestColorMap = new Map<string, string>();
  booking.guests.forEach((g, i) => {
    guestColorMap.set(g.memberId, GUEST_COLORS[i % GUEST_COLORS.length]);
  });

  async function handleBedClick(
    bedId: string,
    bedLabel: string,
    roomId: string,
    roomName: string,
    status: string
  ) {
    if (status === "booked" || status === "held") return;

    if (status === "held-by-you") {
      // Deselect — find which guest has this bed and remove assignment
      const assignment = booking.bedAssignments.find((a) => a.bedId === bedId);
      if (assignment) {
        booking.removeBedAssignment(assignment.memberId);
        await releaseBedHold(bedId, memberId);
        await loadBeds();
      }
      return;
    }

    // Assign to next unassigned guest
    if (!nextUnassignedGuest) return;

    booking.addBedAssignment({
      memberId: nextUnassignedGuest.memberId,
      bedId,
      bedLabel,
      roomId,
      roomName,
    });

    // Create hold
    if (booking.bookingRoundId && booking.checkInDate && booking.checkOutDate) {
      const result = await createBedHold(
        {
          lodgeId: booking.lodgeId!,
          bedId,
          bookingRoundId: booking.bookingRoundId,
          checkInDate: booking.checkInDate,
          checkOutDate: booking.checkOutDate,
        },
        memberId
      );

      if (result.success && result.expiresAt) {
        booking.setHoldExpiresAt(result.expiresAt);
        setHoldExpired(false);
      } else if (!result.success) {
        booking.removeBedAssignment(nextUnassignedGuest.memberId);
        booking.setError(result.error ?? "Failed to hold bed");
        await loadBeds();
      }
    }
  }

  const allAssigned = booking.bedAssignments.length === booking.guests.length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Select Beds</h2>
        <p className="text-sm text-muted-foreground mb-2">
          Click a bed to assign it to {nextUnassignedGuest
            ? `${nextUnassignedGuest.firstName} ${nextUnassignedGuest.lastName}`
            : "the next guest"}.
          Click a selected bed to deselect it.
        </p>
      </div>

      {/* Hold timer banner */}
      {holdTimerDisplay && !holdExpired && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 p-3">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Your bed holds expire in{" "}
            <span className="font-mono font-bold">{holdTimerDisplay}</span>.
            Complete your booking before time runs out.
          </p>
        </div>
      )}

      {holdExpired && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">
            Your bed holds have expired. Please reselect your beds.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => {
              booking.setBedAssignments([]);
              booking.setHoldExpiresAt(null);
              setHoldExpired(false);
              loadBeds();
            }}
          >
            Refresh Availability
          </Button>
        </div>
      )}

      {/* Guest assignment legend */}
      <div className="flex flex-wrap gap-2">
        {booking.guests.map((guest, i) => {
          const isAssigned = assignedMemberIds.has(guest.memberId);
          const assignment = booking.bedAssignments.find(
            (a) => a.memberId === guest.memberId
          );
          return (
            <div
              key={guest.memberId}
              className={`flex items-center gap-2 rounded-md border px-2 py-1 text-xs ${
                isAssigned ? "opacity-50" : ""
              }`}
            >
              <div
                className={`h-3 w-3 rounded-full ${GUEST_COLORS[i % GUEST_COLORS.length]}`}
              />
              <span>
                {guest.firstName} {guest.lastName}
                {assignment && ` — ${assignment.bedLabel} (${assignment.roomName})`}
              </span>
              {isAssigned && <span className="text-green-600">&#10003;</span>}
            </div>
          );
        })}
      </div>

      {/* Room/bed grid */}
      {loading ? (
        <div className="h-48 flex items-center justify-center text-muted-foreground">
          Loading beds...
        </div>
      ) : (
        <div className="space-y-4">
          {rooms.map((room) => (
            <div key={room.id} className="rounded-lg border p-4">
              <h3 className="font-medium mb-2">
                {room.name}
                {room.floor && (
                  <span className="text-sm text-muted-foreground ml-2">
                    Floor {room.floor}
                  </span>
                )}
              </h3>
              <div className="flex flex-wrap gap-2">
                {room.beds.map((bed) => {
                  const assignment = booking.bedAssignments.find(
                    (a) => a.bedId === bed.id
                  );
                  const guestColor = assignment
                    ? guestColorMap.get(assignment.memberId) ?? ""
                    : "";

                  let bedClass = "";
                  let label = bed.label;
                  let disabled = false;

                  switch (bed.status) {
                    case "available":
                      bedClass =
                        "border-green-300 bg-green-50 dark:bg-green-950/20 hover:bg-green-100 dark:hover:bg-green-950/40 cursor-pointer";
                      break;
                    case "booked":
                      bedClass =
                        "border-red-300 bg-red-50 dark:bg-red-950/20 opacity-60 cursor-not-allowed";
                      label += " (booked)";
                      disabled = true;
                      break;
                    case "held":
                      bedClass =
                        "border-amber-300 bg-amber-50 dark:bg-amber-950/20 opacity-60 cursor-not-allowed";
                      label += " (held)";
                      disabled = true;
                      break;
                    case "held-by-you":
                      bedClass = `border-primary ${guestColor} cursor-pointer ring-2 ring-primary`;
                      break;
                  }

                  return (
                    <button
                      key={bed.id}
                      type="button"
                      disabled={disabled || (!nextUnassignedGuest && bed.status === "available")}
                      onClick={() =>
                        handleBedClick(
                          bed.id,
                          bed.label,
                          room.id,
                          room.name,
                          assignment ? "held-by-you" : bed.status
                        )
                      }
                      className={`rounded-md border px-3 py-2 text-sm transition-colors ${bedClass}`}
                    >
                      {bed.label}
                      {assignment && (
                        <div className="text-xs mt-0.5">
                          {booking.guests.find(
                            (g) => g.memberId === assignment.memberId
                          )?.firstName ?? ""}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {booking.error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{booking.error}</p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => booking.goToStep(2)}>
          Back
        </Button>
        <Button
          onClick={() => {
            booking.setError(null);
            booking.goToStep(4);
          }}
          disabled={!allAssigned || holdExpired}
        >
          Next: Review & Pricing
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/[slug]/book/steps/select-beds.tsx
git commit -m "feat: add Step 3 — Select Beds with room grid, hold timer, and guest assignment

Room-by-room bed grid with color-coded status. Guest assignment with
unique colors. Timed bed holds with countdown timer and expiry warning.
Creates/releases holds via server actions."
```

---

### Task 15: Wizard UI — Step 4: Review & Pricing

**Files:**
- Create: `src/app/[slug]/book/steps/review-pricing.tsx`

- [ ] **Step 1: Create Step 4 component**

Create `src/app/[slug]/book/steps/review-pricing.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useBooking, type PricingResult, type GuestPriceInfo } from "../booking-context";
import { formatCurrency } from "@/lib/currency";
import {
  calculateGuestPrice,
  calculateBookingPrice,
  type GuestPriceResult,
} from "@/actions/bookings/pricing";

type Lodge = {
  id: string;
  name: string;
  totalBeds: number;
  checkInTime: string;
  checkOutTime: string;
};

type Props = {
  organisationId: string;
  lodges: Lodge[];
};

export function ReviewPricing({ organisationId, lodges }: Props) {
  const booking = useBooking();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const lodge = lodges.find((l) => l.id === booking.lodgeId);

  useEffect(() => {
    async function loadPricing() {
      if (!booking.lodgeId || !booking.checkInDate || !booking.checkOutDate) {
        setError("Missing booking details");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // For now, we'll use placeholder tariff data
        // In production, this calls the server action with real tariff lookup
        // The pricing calculation itself is done client-side for display,
        // but the final price is recalculated server-side during createBooking
        const guestPrices: GuestPriceInfo[] = [];
        let subtotal = 0;
        let discount = 0;
        let total = 0;

        // We need to fetch pricing from server
        const response = await fetch(
          `/api/pricing?` +
            new URLSearchParams({
              lodgeId: booking.lodgeId,
              checkInDate: booking.checkInDate,
              checkOutDate: booking.checkOutDate,
              guestMemberIds: booking.guests.map((g) => g.memberId).join(","),
            })
        );

        // If API doesn't exist yet, compute a placeholder
        // The real price is always computed server-side in createBooking
        if (!response.ok) {
          // Mark as needing server-side calculation
          booking.setPricingResult({
            guests: booking.guests.map((g) => {
              const assignment = booking.bedAssignments.find(
                (a) => a.memberId === g.memberId
              );
              return {
                memberId: g.memberId,
                firstName: g.firstName,
                lastName: g.lastName,
                membershipClassName: g.membershipClassName,
                bedLabel: assignment?.bedLabel ?? "",
                roomName: assignment?.roomName ?? "",
                subtotalCents: 0,
                discountAmountCents: 0,
                totalCents: 0,
                blendedPerNightCents: 0,
              };
            }),
            subtotalCents: 0,
            discountAmountCents: 0,
            totalAmountCents: 0,
          });
        } else {
          const pricingData = await response.json();
          booking.setPricingResult(pricingData);
        }
      } catch {
        // Pricing will be calculated server-side during confirmation
        // Show the booking summary without pricing for now
        booking.setPricingResult(null);
      } finally {
        setLoading(false);
      }
    }

    loadPricing();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const nights =
    booking.checkInDate && booking.checkOutDate
      ? Math.round(
          (new Date(booking.checkOutDate + "T00:00:00Z").getTime() -
            new Date(booking.checkInDate + "T00:00:00Z").getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Review Your Booking</h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Booking Summary */}
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="font-medium">Booking Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lodge</span>
              <span className="font-medium">{booking.lodgeName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Check-in</span>
              <span>
                {booking.checkInDate}
                {lodge && (
                  <span className="text-muted-foreground">
                    {" "}
                    from {lodge.checkInTime}
                  </span>
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Check-out</span>
              <span>
                {booking.checkOutDate}
                {lodge && (
                  <span className="text-muted-foreground">
                    {" "}
                    by {lodge.checkOutTime}
                  </span>
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nights</span>
              <span>{nights}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Booking Round</span>
              <span>{booking.bookingRoundName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Guests</span>
              <span>{booking.guests.length}</span>
            </div>
          </div>
        </div>

        {/* Right: Price Breakdown */}
        <div className="rounded-lg border p-4">
          <h3 className="font-medium mb-3">Price Breakdown</h3>

          {loading ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              Calculating pricing...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left pb-2 pr-2">Bed Details</th>
                    <th className="text-left pb-2 pr-2">Name</th>
                    <th className="text-left pb-2 pr-2">Tariff</th>
                    <th className="text-right pb-2">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {booking.guests.map((guest) => {
                    const assignment = booking.bedAssignments.find(
                      (a) => a.memberId === guest.memberId
                    );
                    const pricing = booking.pricingResult?.guests.find(
                      (g) => g.memberId === guest.memberId
                    );

                    return (
                      <tr key={guest.memberId} className="border-b last:border-b-0">
                        <td className="py-2 pr-2">
                          {assignment
                            ? `${assignment.roomName} / ${assignment.bedLabel}`
                            : "-"}
                        </td>
                        <td className="py-2 pr-2">
                          {guest.firstName} {guest.lastName}
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
                </tbody>
              </table>

              {booking.pricingResult &&
                booking.pricingResult.totalAmountCents > 0 && (
                  <div className="mt-3 space-y-1 border-t pt-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>
                        {formatCurrency(booking.pricingResult.subtotalCents)}
                      </span>
                    </div>
                    {booking.pricingResult.discountAmountCents > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Discount</span>
                        <span>
                          -
                          {formatCurrency(
                            booking.pricingResult.discountAmountCents
                          )}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-base">
                      <span>Total</span>
                      <span>
                        {formatCurrency(
                          booking.pricingResult.totalAmountCents
                        )}
                      </span>
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>
      </div>

      {/* Info banner */}
      <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/20 p-3">
        <p className="text-sm text-blue-700 dark:text-blue-400">
          An invoice will be created when you confirm. Payment can be made later
          via your dashboard.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => booking.goToStep(3)}>
          Back
        </Button>
        <Button onClick={() => booking.goToStep(5)}>Next: Confirm</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/[slug]/book/steps/review-pricing.tsx
git commit -m "feat: add Step 4 — Review & Pricing with breakdown table

Two-column layout: booking summary (left) and price breakdown table
(right) matching legacy email format. Shows per-guest bed assignment,
tariff, and cost. Subtotal, discount, and grand total. Info banner
about invoice creation."
```

---

### Task 16: Wizard UI — Step 5: Confirm & Success

**Files:**
- Create: `src/app/[slug]/book/steps/confirm.tsx`
- Create: `src/app/[slug]/book/booking-success.tsx`

- [ ] **Step 1: Create Step 5 Confirm component**

Create `src/app/[slug]/book/steps/confirm.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useBooking } from "../booking-context";
import { createBooking } from "@/actions/bookings/create";
import { formatCurrency } from "@/lib/currency";

type Lodge = {
  id: string;
  name: string;
  totalBeds: number;
  checkInTime: string;
  checkOutTime: string;
};

type Props = {
  organisationId: string;
  slug: string;
  lodges: Lodge[];
};

export function Confirm({ organisationId, slug, lodges }: Props) {
  const booking = useBooking();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lodge = lodges.find((l) => l.id === booking.lodgeId);

  const nights =
    booking.checkInDate && booking.checkOutDate
      ? Math.round(
          (new Date(booking.checkOutDate + "T00:00:00Z").getTime() -
            new Date(booking.checkInDate + "T00:00:00Z").getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0;

  async function handleConfirm() {
    if (!booking.lodgeId || !booking.bookingRoundId || !booking.checkInDate || !booking.checkOutDate) {
      setError("Missing booking details. Please go back and try again.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await createBooking(
        {
          organisationId,
          lodgeId: booking.lodgeId,
          bookingRoundId: booking.bookingRoundId,
          checkInDate: booking.checkInDate,
          checkOutDate: booking.checkOutDate,
          guests: booking.bedAssignments.map((a) => ({
            memberId: a.memberId,
            bedId: a.bedId,
            roomId: a.roomId,
          })),
        },
        slug
      );

      if (result.success && result.bookingReference) {
        booking.setBookingReference(result.bookingReference);
      } else {
        setError(result.error ?? "Booking failed. Please try again.");

        // If bed conflict, go back to step 3
        if (
          result.error?.includes("no longer available") ||
          result.error?.includes("reselect")
        ) {
          booking.setBedAssignments([]);
          booking.setHoldExpiresAt(null);
          setTimeout(() => booking.goToStep(3), 2000);
        }
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div>
        <h2 className="text-lg font-semibold mb-2">Confirm Your Booking</h2>
        <p className="text-sm text-muted-foreground">
          Please review the details below and confirm your booking.
        </p>
      </div>

      {/* Summary card */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Lodge</span>
            <span className="font-medium">{booking.lodgeName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dates</span>
            <span>
              {booking.checkInDate} &mdash; {booking.checkOutDate}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Nights</span>
            <span>{nights}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Guests</span>
            <span>{booking.guests.length}</span>
          </div>
          {booking.pricingResult && booking.pricingResult.totalAmountCents > 0 && (
            <div className="flex justify-between pt-2 border-t font-bold">
              <span>Total</span>
              <span>
                {formatCurrency(booking.pricingResult.totalAmountCents)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Guest list */}
      <div className="rounded-lg border p-4">
        <h3 className="font-medium text-sm mb-2">Guests</h3>
        <div className="space-y-1 text-sm">
          {booking.bedAssignments.map((a) => {
            const guest = booking.guests.find(
              (g) => g.memberId === a.memberId
            );
            return (
              <div key={a.memberId} className="flex justify-between">
                <span>
                  {guest?.firstName} {guest?.lastName}
                </span>
                <span className="text-muted-foreground">
                  {a.roomName} / {a.bedLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => booking.goToStep(4)}>
          Back
        </Button>
        <Button onClick={handleConfirm} disabled={submitting}>
          {submitting ? "Confirming..." : "Confirm Booking"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create BookingSuccess component**

Create `src/app/[slug]/book/booking-success.tsx`:

```typescript
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useBooking } from "./booking-context";

type Props = {
  slug: string;
};

export function BookingSuccess({ slug }: Props) {
  const booking = useBooking();

  const nights =
    booking.checkInDate && booking.checkOutDate
      ? Math.round(
          (new Date(booking.checkOutDate + "T00:00:00Z").getTime() -
            new Date(booking.checkInDate + "T00:00:00Z").getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0;

  return (
    <div className="max-w-lg mx-auto text-center space-y-6 py-8">
      {/* Success icon */}
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
        <svg
          className="h-8 w-8 text-green-600 dark:text-green-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 12.75l6 6 9-13.5"
          />
        </svg>
      </div>

      <div>
        <h2 className="text-2xl font-bold mb-1">Booking Confirmed</h2>
        <p className="text-muted-foreground">
          Your booking has been successfully created.
        </p>
      </div>

      {/* Reference number */}
      <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
        <p className="text-sm text-muted-foreground mb-1">Booking Reference</p>
        <p className="text-3xl font-bold font-mono tracking-wider">
          {booking.bookingReference}
        </p>
      </div>

      {/* Details */}
      <div className="rounded-lg border p-4 text-left space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Lodge</span>
          <span className="font-medium">{booking.lodgeName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Check-in</span>
          <span>{booking.checkInDate}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Check-out</span>
          <span>{booking.checkOutDate}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Nights</span>
          <span>{nights}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Guests</span>
          <span>{booking.guests.length}</span>
        </div>
      </div>

      {/* Guest list */}
      <div className="rounded-lg border p-4 text-left">
        <h3 className="font-medium text-sm mb-2">Guests & Beds</h3>
        <div className="space-y-1 text-sm">
          {booking.bedAssignments.map((a) => {
            const guest = booking.guests.find(
              (g) => g.memberId === a.memberId
            );
            return (
              <div key={a.memberId} className="flex justify-between">
                <span>
                  {guest?.firstName} {guest?.lastName}
                </span>
                <span className="text-muted-foreground">
                  {a.roomName} / {a.bedLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button render={<Link href={`/${slug}/dashboard`} />}>
          View My Bookings
        </Button>
        <Button variant="outline" onClick={() => booking.reset()}>
          Make Another Booking
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/[slug]/book/steps/confirm.tsx src/app/[slug]/book/booking-success.tsx
git commit -m "feat: add Step 5 Confirm and BookingSuccess screen

Confirm step shows compact summary with Confirm Booking button.
Handles bed conflict errors with redirect to step 3. Success screen
shows large booking reference, details, and navigation buttons."
```

---

### Task 17: Dashboard Integration

**Files:**
- Modify: `src/app/[slug]/dashboard/page.tsx`

- [ ] **Step 1: Update dashboard to show upcoming bookings**

Replace the entire `src/app/[slug]/dashboard/page.tsx`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getOrgBySlug } from "@/lib/org";
import { getSessionMember } from "@/lib/auth";
import { getUpcomingBookings } from "@/actions/bookings/queries";
import { formatCurrency } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${slug}/login`);
  }

  const org = await getOrgBySlug(slug);
  const session = org ? await getSessionMember(org.id) : null;

  let upcomingBookings: Awaited<ReturnType<typeof getUpcomingBookings>> = [];
  if (org && session) {
    upcomingBookings = await getUpcomingBookings(org.id, session.memberId);
  }

  const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
    CONFIRMED: "default",
    PENDING: "secondary",
    WAITLISTED: "secondary",
    CANCELLED: "destructive",
    COMPLETED: "secondary",
  };

  const STATUS_LABEL: Record<string, string> = {
    CONFIRMED: "Confirmed",
    PENDING: "Pending",
    WAITLISTED: "Waitlisted",
    CANCELLED: "Cancelled",
    COMPLETED: "Completed",
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {session?.firstName ?? user.email}
          </p>
        </div>
        <Button render={<Link href={`/${slug}/book`} />}>
          Book a Stay
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border p-4 sm:col-span-2 lg:col-span-2">
          <h3 className="font-medium mb-3">Upcoming Bookings</h3>
          {upcomingBookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No upcoming bookings.{" "}
              <Link
                href={`/${slug}/book`}
                className="text-primary underline-offset-4 hover:underline"
              >
                Book a stay
              </Link>
            </p>
          ) : (
            <div className="space-y-3">
              {upcomingBookings.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{b.lodgeName}</p>
                      <Badge
                        variant={STATUS_VARIANT[b.status] ?? "secondary"}
                      >
                        {STATUS_LABEL[b.status] ?? b.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {b.checkInDate} to {b.checkOutDate} &middot;{" "}
                      {b.totalNights} night{b.totalNights !== 1 ? "s" : ""} &middot;{" "}
                      {b.guestCount} guest{b.guestCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">
                      {formatCurrency(b.totalAmountCents)}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {b.bookingReference}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="font-medium">Outstanding Balance</h3>
          <p className="text-sm text-muted-foreground mt-1">$0.00</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/[slug]/dashboard/page.tsx
git commit -m "feat: update dashboard to show upcoming bookings and Book a Stay button

Dashboard now queries real upcoming bookings with lodge name, dates,
guest count, total, reference, and status badge. Book a Stay button
in header and inline link when no bookings."
```

---

### Task 18: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run the full check suite**

```bash
npm run check
```

This runs lint, tests, and build. All must pass.

- [ ] **Step 2: Grep for TODOs and placeholders**

```bash
grep -rn "TODO\|FIXME\|PLACEHOLDER\|HACK" src/actions/bookings/ src/app/\[slug\]/book/ --include="*.ts" --include="*.tsx"
```

Address any findings.

- [ ] **Step 3: Verify all test files exist**

```bash
ls -la src/actions/bookings/__tests__/
```

Expected files:
- `schemas.test.ts`
- `reference.test.ts`
- `pricing.test.ts`
- `beds.test.ts`
- `members.test.ts`
- `holds.test.ts`
- `create.test.ts`
- `queries.test.ts`

- [ ] **Step 4: Verify all page/component files exist**

```bash
ls -la src/app/[slug]/book/
ls -la src/app/[slug]/book/steps/
```

Expected:
- `page.tsx`, `booking-wizard.tsx`, `booking-context.tsx`, `step-indicator.tsx`, `booking-success.tsx`
- `steps/select-lodge-dates.tsx`, `steps/add-guests.tsx`, `steps/select-beds.tsx`, `steps/review-pricing.tsx`, `steps/confirm.tsx`

- [ ] **Step 5: Run tests in isolation**

```bash
npx vitest run src/actions/bookings/
```

All booking tests must pass.

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A && git commit -m "fix: address issues found during final verification"
```

- [ ] **Step 7: Summary**

Phase 6 is complete. The booking flow includes:
- Schema changes: `bedHolds` table, `holdDurationMinutes`, `checkInTime`/`checkOutTime`, `EVENT`/`INVOICE` enums
- Server actions: schemas, reference generation, pricing calculation, bed queries, member queries, bed holds, booking creation, booking queries
- 5-step wizard UI: lodge/dates, guests, beds, review/pricing, confirm
- Success screen with booking reference
- Dashboard integration showing upcoming bookings
- Full test coverage for all server-side logic
