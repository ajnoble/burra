# Phase 12: Treasurer Reporting, Role Dashboards & CSV Exports — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build role-specific admin dashboards (treasurer, booking officer, committee), 7 pre-built reports with filtering, and CSV export with Xero-compatible format.

**Architecture:** Server actions compute all report/dashboard data from existing tables (transactions, bookings, subscriptions, members, availability_cache). Dashboard page uses tabs for role-based views with Recharts for charts. Reports page lists 7 reports, each with its own filter+table+export view. CSV export reuses report actions piped through a generic serialiser.

**Tech Stack:** Next.js 16 (App Router), Drizzle ORM, Recharts (new dependency), Vitest, Playwright, shadcn/ui (Card, Tabs, Table, Select, Badge)

---

## File Structure

### New Files

```
src/
  actions/
    dashboard/
      treasurer-stats.ts              # MTD/YTD revenue, balances, platform fees + chart data
      treasurer-stats.test.ts
      booking-officer-stats.ts         # Arrivals, departures, occupancy, pending approvals
      booking-officer-stats.test.ts
      committee-stats.ts               # KPIs, member growth, occupancy trends
      committee-stats.test.ts
    reports/
      transaction-ledger.ts            # Filtered transaction list with running balance
      transaction-ledger.test.ts
      revenue-summary.ts               # Revenue aggregated by period and type
      revenue-summary.test.ts
      member-balances.ts               # Per-member balance computed from transactions
      member-balances.test.ts
      subscription-status.ts           # Subscription list with member+season joins
      subscription-status.test.ts
      occupancy.ts                     # Bed utilisation from availability_cache
      occupancy.test.ts
      arrivals-departures.ts           # Bookings with guest/bed detail by date
      arrivals-departures.test.ts
      booking-summary.ts               # Filtered booking list with totals
      booking-summary.test.ts
      export-csv.ts                    # Generic CSV serialiser + Xero column mapping
      export-csv.test.ts
  app/[slug]/admin/
    dashboard/
      page.tsx                         # Role-tabbed dashboard (replaces current admin page)
      treasurer-tab.tsx                # Client component: treasurer cards + charts
      booking-officer-tab.tsx          # Client component: officer cards + tables
      committee-tab.tsx                # Client component: committee KPIs + charts
      stat-card.tsx                    # Reusable stat card with trend indicator
      revenue-chart.tsx                # Recharts bar chart wrapper
      occupancy-chart.tsx              # Recharts area chart wrapper
    reports/
      page.tsx                         # Report index: card grid of 7 reports
      [reportId]/
        page.tsx                       # Individual report: filters + table + export button
        report-filters.tsx             # Client component: filter controls
        report-table.tsx               # Client component: paginated data table
        export-button.tsx              # Client component: CSV download trigger
e2e/tests/
  admin-dashboard.spec.ts             # 8 E2E tests for dashboard tabs
  admin-reports.spec.ts               # 7 E2E tests for report pages
```

### Modified Files

```
src/app/[slug]/admin/page.tsx          # Redirect to /admin/dashboard (or delete and let dashboard/page.tsx handle it)
package.json                           # Add recharts dependency
```

---

## Task 1: Install Recharts and Set Up Stat Card Component

**Files:**
- Modify: `package.json`
- Create: `src/app/[slug]/admin/dashboard/stat-card.tsx`

- [ ] **Step 1: Install recharts**

```bash
cd /opt/snowgum && npm install recharts
```

- [ ] **Step 2: Create the stat card component**

Create `src/app/[slug]/admin/dashboard/stat-card.tsx`:

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { ArrowUp, ArrowDown } from "lucide-react";

type StatCardProps = {
  label: string;
  value: string;
  trend?: {
    value: string;
    direction: "up" | "down" | "neutral";
  };
};

export function StatCard({ label, value, trend }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {trend && (
          <div className="flex items-center gap-1 mt-1 text-xs">
            {trend.direction === "up" && (
              <ArrowUp className="h-3 w-3 text-green-600" />
            )}
            {trend.direction === "down" && (
              <ArrowDown className="h-3 w-3 text-red-600" />
            )}
            <span
              className={
                trend.direction === "up"
                  ? "text-green-600"
                  : trend.direction === "down"
                    ? "text-red-600"
                    : "text-muted-foreground"
              }
            >
              {trend.value}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json src/app/\[slug\]/admin/dashboard/stat-card.tsx
git commit -m "feat(phase-12): add recharts dependency and stat card component"
```

---

## Task 2: Treasurer Stats Action (TDD)

**Files:**
- Create: `src/actions/dashboard/treasurer-stats.ts`
- Create: `src/actions/dashboard/treasurer-stats.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/actions/dashboard/treasurer-stats.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockGroupBy = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return { from: (...a: unknown[]) => { mockFrom(...a); return { where: (...w: unknown[]) => { mockWhere(...w); return { groupBy: (...g: unknown[]) => { mockGroupBy(...g); return Promise.resolve([]); } }; } }; } };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  transactions: { id: "id", organisationId: "organisation_id", type: "type", amountCents: "amount_cents", platformFeeCents: "platform_fee_cents", createdAt: "created_at" },
  subscriptions: { id: "id", organisationId: "organisation_id", status: "status", amountCents: "amount_cents" },
  members: { id: "id", organisationId: "organisation_id" },
}));

import { getTreasurerStats } from "../treasurer-stats";

describe("getTreasurerStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zeroed stats when no transactions exist", async () => {
    const result = await getTreasurerStats({
      organisationId: "550e8400-e29b-41d4-a716-446655440000",
      financialYearStart: "2026-07-01",
      financialYearEnd: "2027-06-30",
    });

    expect(result).toMatchObject({
      revenueMtdCents: 0,
      revenueYtdCents: 0,
      outstandingBalanceCents: 0,
      platformFeesYtdCents: 0,
    });
  });

  it("calls db.select for transaction aggregation", async () => {
    await getTreasurerStats({
      organisationId: "550e8400-e29b-41d4-a716-446655440000",
      financialYearStart: "2026-07-01",
      financialYearEnd: "2027-06-30",
    });

    expect(mockSelect).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /opt/snowgum && npx vitest run src/actions/dashboard/treasurer-stats.test.ts
```

Expected: FAIL — `Cannot find module '../treasurer-stats'`

- [ ] **Step 3: Write the implementation**

Create `src/actions/dashboard/treasurer-stats.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { transactions, subscriptions } from "@/db/schema";
import { eq, and, sql, gte, lte } from "drizzle-orm";
import { format, startOfMonth, endOfMonth } from "date-fns";

type TreasurerStatsInput = {
  organisationId: string;
  financialYearStart: string; // YYYY-MM-DD
  financialYearEnd: string;   // YYYY-MM-DD
};

type MonthlyRevenue = {
  month: string; // YYYY-MM
  bookingCents: number;
  subscriptionCents: number;
  refundCents: number;
};

type TreasurerStatsResult = {
  revenueMtdCents: number;
  revenueYtdCents: number;
  revenuePriorYtdCents: number;
  outstandingBalanceCents: number;
  platformFeesYtdCents: number;
  monthlyRevenue: MonthlyRevenue[];
};

export async function getTreasurerStats(
  input: TreasurerStatsInput
): Promise<TreasurerStatsResult> {
  const { organisationId, financialYearStart, financialYearEnd } = input;
  const now = new Date();
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");

  // YTD revenue (payments + subscriptions - refunds)
  const [ytdRow] = await db
    .select({
      total: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} IN ('PAYMENT', 'SUBSCRIPTION') THEN ${transactions.amountCents} ELSE 0 END), 0)`,
      refunds: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'REFUND' THEN ABS(${transactions.amountCents}) ELSE 0 END), 0)`,
      platformFees: sql<number>`COALESCE(SUM(COALESCE(${transactions.platformFeeCents}, 0)), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.organisationId, organisationId),
        gte(transactions.createdAt, sql`${financialYearStart}::timestamptz`),
        lte(transactions.createdAt, sql`${financialYearEnd}::timestamptz`)
      )
    );

  const revenueYtdCents = Number(ytdRow?.total ?? 0) - Number(ytdRow?.refunds ?? 0);
  const platformFeesYtdCents = Number(ytdRow?.platformFees ?? 0);

  // MTD revenue
  const [mtdRow] = await db
    .select({
      total: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} IN ('PAYMENT', 'SUBSCRIPTION') THEN ${transactions.amountCents} ELSE 0 END), 0)`,
      refunds: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'REFUND' THEN ABS(${transactions.amountCents}) ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.organisationId, organisationId),
        gte(transactions.createdAt, sql`${monthStart}::timestamptz`),
        lte(transactions.createdAt, sql`${monthEnd}::timestamptz`)
      )
    );

  const revenueMtdCents = Number(mtdRow?.total ?? 0) - Number(mtdRow?.refunds ?? 0);

  // Prior year YTD for comparison
  const priorYearStart = financialYearStart.replace(
    /^\d{4}/,
    String(parseInt(financialYearStart.slice(0, 4)) - 1)
  );
  const priorYearEnd = financialYearEnd.replace(
    /^\d{4}/,
    String(parseInt(financialYearEnd.slice(0, 4)) - 1)
  );

  const [priorRow] = await db
    .select({
      total: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} IN ('PAYMENT', 'SUBSCRIPTION') THEN ${transactions.amountCents} ELSE 0 END), 0)`,
      refunds: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'REFUND' THEN ABS(${transactions.amountCents}) ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.organisationId, organisationId),
        gte(transactions.createdAt, sql`${priorYearStart}::timestamptz`),
        lte(transactions.createdAt, sql`${priorYearEnd}::timestamptz`)
      )
    );

  const revenuePriorYtdCents = Number(priorRow?.total ?? 0) - Number(priorRow?.refunds ?? 0);

  // Outstanding balance: unpaid subscriptions
  const [outstandingRow] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${subscriptions.amountCents}), 0)`,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organisationId, organisationId),
        eq(subscriptions.status, "UNPAID")
      )
    );

  const outstandingBalanceCents = Number(outstandingRow?.total ?? 0);

  // Monthly revenue breakdown (for chart)
  const monthlyRows = await db
    .select({
      month: sql<string>`TO_CHAR(${transactions.createdAt}, 'YYYY-MM')`,
      type: transactions.type,
      total: sql<number>`SUM(${transactions.amountCents})`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.organisationId, organisationId),
        gte(transactions.createdAt, sql`${financialYearStart}::timestamptz`),
        lte(transactions.createdAt, sql`${financialYearEnd}::timestamptz`),
        sql`${transactions.type} IN ('PAYMENT', 'SUBSCRIPTION', 'REFUND')`
      )
    )
    .groupBy(sql`TO_CHAR(${transactions.createdAt}, 'YYYY-MM')`, transactions.type);

  // Aggregate monthly rows into MonthlyRevenue[]
  const monthMap = new Map<string, MonthlyRevenue>();
  for (const row of monthlyRows) {
    const month = row.month;
    if (!monthMap.has(month)) {
      monthMap.set(month, { month, bookingCents: 0, subscriptionCents: 0, refundCents: 0 });
    }
    const entry = monthMap.get(month)!;
    const amount = Number(row.total);
    if (row.type === "PAYMENT") {
      entry.bookingCents += amount;
    } else if (row.type === "SUBSCRIPTION") {
      entry.subscriptionCents += amount;
    } else if (row.type === "REFUND") {
      entry.refundCents += Math.abs(amount);
    }
  }

  const monthlyRevenue = Array.from(monthMap.values()).sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  return {
    revenueMtdCents,
    revenueYtdCents,
    revenuePriorYtdCents,
    outstandingBalanceCents,
    platformFeesYtdCents,
    monthlyRevenue,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /opt/snowgum && npx vitest run src/actions/dashboard/treasurer-stats.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/dashboard/treasurer-stats.ts src/actions/dashboard/treasurer-stats.test.ts
git commit -m "feat(phase-12): add treasurer stats action with tests"
```

---

## Task 3: Booking Officer Stats Action (TDD)

**Files:**
- Create: `src/actions/dashboard/booking-officer-stats.ts`
- Create: `src/actions/dashboard/booking-officer-stats.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/actions/dashboard/booking-officer-stats.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...a: unknown[]) => {
          mockFrom(...a);
          return {
            where: (...w: unknown[]) => {
              mockWhere(...w);
              return Promise.resolve([]);
            },
            innerJoin: () => ({
              innerJoin: () => ({
                leftJoin: () => ({
                  where: (...w: unknown[]) => {
                    mockWhere(...w);
                    return {
                      orderBy: () => ({
                        limit: () => Promise.resolve([]),
                      }),
                    };
                  },
                }),
              }),
            }),
          };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  bookings: { id: "id", organisationId: "organisation_id", lodgeId: "lodge_id", primaryMemberId: "primary_member_id", status: "status", checkInDate: "check_in_date", checkOutDate: "check_out_date", totalNights: "total_nights", bookingReference: "booking_reference", createdAt: "created_at" },
  bookingGuests: { id: "id", bookingId: "booking_id", memberId: "member_id", bedId: "bed_id", roomId: "room_id" },
  members: { id: "id", firstName: "first_name", lastName: "last_name" },
  lodges: { id: "id", name: "name", totalBeds: "total_beds" },
  beds: { id: "id", label: "label" },
  rooms: { id: "id", name: "name" },
  availabilityCache: { lodgeId: "lodge_id", date: "date", totalBeds: "total_beds", bookedBeds: "booked_beds" },
}));

import { getBookingOfficerStats } from "../booking-officer-stats";

describe("getBookingOfficerStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zeroed stats when no bookings exist", async () => {
    const result = await getBookingOfficerStats({
      organisationId: "550e8400-e29b-41d4-a716-446655440000",
      today: "2027-07-15",
    });

    expect(result).toMatchObject({
      arrivalsToday: 0,
      departuresToday: 0,
      pendingApprovals: 0,
    });
  });

  it("queries the database", async () => {
    await getBookingOfficerStats({
      organisationId: "550e8400-e29b-41d4-a716-446655440000",
      today: "2027-07-15",
    });

    expect(mockSelect).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /opt/snowgum && npx vitest run src/actions/dashboard/booking-officer-stats.test.ts
```

Expected: FAIL — `Cannot find module '../booking-officer-stats'`

- [ ] **Step 3: Write the implementation**

Create `src/actions/dashboard/booking-officer-stats.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { bookings, bookingGuests, members, lodges, beds, rooms, availabilityCache } from "@/db/schema";
import { eq, and, sql, gte, lte } from "drizzle-orm";
import { format, addDays } from "date-fns";

type BookingOfficerStatsInput = {
  organisationId: string;
  today: string; // YYYY-MM-DD
};

type UpcomingArrival = {
  bookingReference: string;
  memberFirstName: string;
  memberLastName: string;
  checkInDate: string;
  checkOutDate: string;
  guestCount: number;
  lodgeName: string;
};

type OccupancyDay = {
  date: string;
  totalBeds: number;
  bookedBeds: number;
  occupancyPercent: number;
};

type BookingOfficerStatsResult = {
  arrivalsToday: number;
  departuresToday: number;
  currentOccupancyPercent: number;
  pendingApprovals: number;
  upcomingArrivals: UpcomingArrival[];
  occupancyForecast: OccupancyDay[];
};

export async function getBookingOfficerStats(
  input: BookingOfficerStatsInput
): Promise<BookingOfficerStatsResult> {
  const { organisationId, today } = input;
  const next7Days = format(addDays(new Date(today), 7), "yyyy-MM-dd");
  const next30Days = format(addDays(new Date(today), 30), "yyyy-MM-dd");

  // Arrivals today
  const [arrivalsRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.organisationId, organisationId),
        eq(bookings.checkInDate, today),
        sql`${bookings.status} IN ('CONFIRMED', 'PENDING')`
      )
    );
  const arrivalsToday = Number(arrivalsRow?.count ?? 0);

  // Departures today
  const [departuresRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.organisationId, organisationId),
        eq(bookings.checkOutDate, today),
        sql`${bookings.status} IN ('CONFIRMED', 'COMPLETED')`
      )
    );
  const departuresToday = Number(departuresRow?.count ?? 0);

  // Pending approvals
  const [pendingRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.organisationId, organisationId),
        eq(bookings.status, "PENDING")
      )
    );
  const pendingApprovals = Number(pendingRow?.count ?? 0);

  // Current occupancy (today)
  const [occRow] = await db
    .select({
      totalBeds: sql<number>`COALESCE(SUM(${availabilityCache.totalBeds}), 0)`,
      bookedBeds: sql<number>`COALESCE(SUM(${availabilityCache.bookedBeds}), 0)`,
    })
    .from(availabilityCache)
    .where(eq(availabilityCache.date, today));

  const totalBeds = Number(occRow?.totalBeds ?? 0);
  const bookedBeds = Number(occRow?.bookedBeds ?? 0);
  const currentOccupancyPercent = totalBeds > 0 ? Math.round((bookedBeds / totalBeds) * 100) : 0;

  // Upcoming arrivals (next 7 days)
  const upcomingRows = await db
    .select({
      bookingReference: bookings.bookingReference,
      memberFirstName: members.firstName,
      memberLastName: members.lastName,
      checkInDate: bookings.checkInDate,
      checkOutDate: bookings.checkOutDate,
      lodgeName: lodges.name,
    })
    .from(bookings)
    .innerJoin(members, eq(members.id, bookings.primaryMemberId))
    .innerJoin(lodges, eq(lodges.id, bookings.lodgeId))
    .where(
      and(
        eq(bookings.organisationId, organisationId),
        gte(bookings.checkInDate, today),
        lte(bookings.checkInDate, next7Days),
        sql`${bookings.status} IN ('CONFIRMED', 'PENDING')`
      )
    )
    .orderBy(bookings.checkInDate);

  // Get guest counts for upcoming bookings
  const upcomingBookingIds = upcomingRows.map((r) => r.bookingReference);
  let guestCountMap = new Map<string, number>();

  if (upcomingRows.length > 0) {
    const bookingIdList = upcomingRows.map((r) => r.bookingReference);
    const guestCounts = await db
      .select({
        bookingRef: bookings.bookingReference,
        count: sql<number>`COUNT(${bookingGuests.id})`,
      })
      .from(bookingGuests)
      .innerJoin(bookings, eq(bookings.id, bookingGuests.bookingId))
      .where(sql`${bookings.bookingReference} IN (${sql.join(bookingIdList.map(id => sql`${id}`), sql`, `)})`)
      .groupBy(bookings.bookingReference);

    guestCountMap = new Map(guestCounts.map((g) => [g.bookingRef, Number(g.count)]));
  }

  const upcomingArrivals: UpcomingArrival[] = upcomingRows.map((r) => ({
    ...r,
    guestCount: guestCountMap.get(r.bookingReference) ?? 0,
  }));

  // Occupancy forecast (next 30 days)
  const forecastRows = await db
    .select({
      date: availabilityCache.date,
      totalBeds: availabilityCache.totalBeds,
      bookedBeds: availabilityCache.bookedBeds,
    })
    .from(availabilityCache)
    .where(
      and(
        gte(availabilityCache.date, today),
        lte(availabilityCache.date, next30Days)
      )
    );

  const occupancyForecast: OccupancyDay[] = forecastRows.map((r) => ({
    date: r.date,
    totalBeds: r.totalBeds,
    bookedBeds: r.bookedBeds,
    occupancyPercent: r.totalBeds > 0 ? Math.round((r.bookedBeds / r.totalBeds) * 100) : 0,
  }));

  return {
    arrivalsToday,
    departuresToday,
    currentOccupancyPercent,
    pendingApprovals,
    upcomingArrivals,
    occupancyForecast,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /opt/snowgum && npx vitest run src/actions/dashboard/booking-officer-stats.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/dashboard/booking-officer-stats.ts src/actions/dashboard/booking-officer-stats.test.ts
git commit -m "feat(phase-12): add booking officer stats action with tests"
```

---

## Task 4: Committee Stats Action (TDD)

**Files:**
- Create: `src/actions/dashboard/committee-stats.ts`
- Create: `src/actions/dashboard/committee-stats.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/actions/dashboard/committee-stats.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: () => ({
          where: () => Promise.resolve([]),
          innerJoin: () => ({
            where: () => ({
              groupBy: () => Promise.resolve([]),
            }),
          }),
        }),
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  members: { id: "id", organisationId: "organisation_id", membershipClassId: "membership_class_id", isFinancial: "is_financial", joinedAt: "joined_at" },
  membershipClasses: { id: "id", name: "name" },
  transactions: { id: "id", organisationId: "organisation_id", type: "type", amountCents: "amount_cents", createdAt: "created_at" },
  availabilityCache: { date: "date", totalBeds: "total_beds", bookedBeds: "booked_beds" },
  organisationMembers: { memberId: "member_id", organisationId: "organisation_id", isActive: "is_active" },
}));

import { getCommitteeStats } from "../committee-stats";

describe("getCommitteeStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zeroed stats when no data exists", async () => {
    const result = await getCommitteeStats({
      organisationId: "550e8400-e29b-41d4-a716-446655440000",
      financialYearStart: "2026-07-01",
      financialYearEnd: "2027-06-30",
    });

    expect(result).toMatchObject({
      totalActiveMembers: 0,
      revenueYtdCents: 0,
    });
    expect(result.membersByClass).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /opt/snowgum && npx vitest run src/actions/dashboard/committee-stats.test.ts
```

Expected: FAIL — `Cannot find module '../committee-stats'`

- [ ] **Step 3: Write the implementation**

Create `src/actions/dashboard/committee-stats.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { members, membershipClasses, transactions, availabilityCache, organisationMembers } from "@/db/schema";
import { eq, and, sql, gte, lte } from "drizzle-orm";

type CommitteeStatsInput = {
  organisationId: string;
  financialYearStart: string;
  financialYearEnd: string;
};

type MemberClassBreakdown = {
  className: string;
  count: number;
  financialCount: number;
};

type MonthlyOccupancy = {
  month: string;
  averagePercent: number;
};

type CommitteeStatsResult = {
  totalActiveMembers: number;
  totalActiveMembersPriorYear: number;
  financialMemberCount: number;
  nonFinancialMemberCount: number;
  revenueYtdCents: number;
  revenuePriorYtdCents: number;
  occupancySeasonPercent: number;
  membersByClass: MemberClassBreakdown[];
  monthlyOccupancy: MonthlyOccupancy[];
};

export async function getCommitteeStats(
  input: CommitteeStatsInput
): Promise<CommitteeStatsResult> {
  const { organisationId, financialYearStart, financialYearEnd } = input;

  // Active members count
  const [memberCountRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(organisationMembers)
    .where(
      and(
        eq(organisationMembers.organisationId, organisationId),
        eq(organisationMembers.isActive, true)
      )
    );
  const totalActiveMembers = Number(memberCountRow?.count ?? 0);

  // Financial vs non-financial
  const [financialRow] = await db
    .select({
      financial: sql<number>`COUNT(*) FILTER (WHERE ${members.isFinancial} = true)`,
      nonFinancial: sql<number>`COUNT(*) FILTER (WHERE ${members.isFinancial} = false)`,
    })
    .from(members)
    .where(eq(members.organisationId, organisationId));

  const financialMemberCount = Number(financialRow?.financial ?? 0);
  const nonFinancialMemberCount = Number(financialRow?.nonFinancial ?? 0);

  // Members by class
  const classRows = await db
    .select({
      className: membershipClasses.name,
      count: sql<number>`COUNT(*)`,
      financialCount: sql<number>`COUNT(*) FILTER (WHERE ${members.isFinancial} = true)`,
    })
    .from(members)
    .innerJoin(membershipClasses, eq(membershipClasses.id, members.membershipClassId))
    .where(eq(members.organisationId, organisationId))
    .groupBy(membershipClasses.name);

  const membersByClass: MemberClassBreakdown[] = classRows.map((r) => ({
    className: r.className,
    count: Number(r.count),
    financialCount: Number(r.financialCount),
  }));

  // YTD revenue
  const [ytdRow] = await db
    .select({
      total: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} IN ('PAYMENT', 'SUBSCRIPTION') THEN ${transactions.amountCents} ELSE 0 END), 0)`,
      refunds: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'REFUND' THEN ABS(${transactions.amountCents}) ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.organisationId, organisationId),
        gte(transactions.createdAt, sql`${financialYearStart}::timestamptz`),
        lte(transactions.createdAt, sql`${financialYearEnd}::timestamptz`)
      )
    );

  const revenueYtdCents = Number(ytdRow?.total ?? 0) - Number(ytdRow?.refunds ?? 0);

  // Prior year revenue
  const priorStart = financialYearStart.replace(/^\d{4}/, String(parseInt(financialYearStart.slice(0, 4)) - 1));
  const priorEnd = financialYearEnd.replace(/^\d{4}/, String(parseInt(financialYearEnd.slice(0, 4)) - 1));

  const [priorRow] = await db
    .select({
      total: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} IN ('PAYMENT', 'SUBSCRIPTION') THEN ${transactions.amountCents} ELSE 0 END), 0)`,
      refunds: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'REFUND' THEN ABS(${transactions.amountCents}) ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.organisationId, organisationId),
        gte(transactions.createdAt, sql`${priorStart}::timestamptz`),
        lte(transactions.createdAt, sql`${priorEnd}::timestamptz`)
      )
    );

  const revenuePriorYtdCents = Number(priorRow?.total ?? 0) - Number(priorRow?.refunds ?? 0);

  // Prior year member count (approximate — members who joined before prior year end)
  const [priorMemberRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(members)
    .where(
      and(
        eq(members.organisationId, organisationId),
        lte(members.joinedAt, sql`${priorEnd}::date`)
      )
    );
  const totalActiveMembersPriorYear = Number(priorMemberRow?.count ?? 0);

  // Season occupancy (average across all dates in financial year)
  const [occRow] = await db
    .select({
      avgPercent: sql<number>`COALESCE(AVG(CASE WHEN ${availabilityCache.totalBeds} > 0 THEN (${availabilityCache.bookedBeds}::float / ${availabilityCache.totalBeds}) * 100 ELSE 0 END), 0)`,
    })
    .from(availabilityCache)
    .where(
      and(
        gte(availabilityCache.date, financialYearStart),
        lte(availabilityCache.date, financialYearEnd)
      )
    );
  const occupancySeasonPercent = Math.round(Number(occRow?.avgPercent ?? 0));

  // Monthly occupancy
  const monthlyOccRows = await db
    .select({
      month: sql<string>`TO_CHAR(${availabilityCache.date}::timestamp, 'YYYY-MM')`,
      avgPercent: sql<number>`AVG(CASE WHEN ${availabilityCache.totalBeds} > 0 THEN (${availabilityCache.bookedBeds}::float / ${availabilityCache.totalBeds}) * 100 ELSE 0 END)`,
    })
    .from(availabilityCache)
    .where(
      and(
        gte(availabilityCache.date, financialYearStart),
        lte(availabilityCache.date, financialYearEnd)
      )
    )
    .groupBy(sql`TO_CHAR(${availabilityCache.date}::timestamp, 'YYYY-MM')`);

  const monthlyOccupancy: MonthlyOccupancy[] = monthlyOccRows
    .map((r) => ({
      month: r.month,
      averagePercent: Math.round(Number(r.avgPercent)),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    totalActiveMembers,
    totalActiveMembersPriorYear,
    financialMemberCount,
    nonFinancialMemberCount,
    revenueYtdCents,
    revenuePriorYtdCents,
    occupancySeasonPercent,
    membersByClass,
    monthlyOccupancy,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /opt/snowgum && npx vitest run src/actions/dashboard/committee-stats.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/dashboard/committee-stats.ts src/actions/dashboard/committee-stats.test.ts
git commit -m "feat(phase-12): add committee stats action with tests"
```

---

## Task 5: CSV Export Serialiser (TDD)

**Files:**
- Create: `src/actions/reports/export-csv.ts`
- Create: `src/actions/reports/export-csv.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/actions/reports/export-csv.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { serialiseCsv, XERO_COLUMN_MAP } from "../export-csv";

describe("serialiseCsv", () => {
  it("generates CSV with headers and rows", () => {
    const columns = [
      { key: "name", header: "Name" },
      { key: "amount", header: "Amount" },
    ];
    const data = [
      { name: "Alice", amount: "100.00" },
      { name: "Bob", amount: "200.50" },
    ];

    const csv = serialiseCsv(columns, data);
    const lines = csv.split("\n");

    expect(lines[0]).toBe("Name,Amount");
    expect(lines[1]).toBe("Alice,100.00");
    expect(lines[2]).toBe("Bob,200.50");
  });

  it("escapes commas in values", () => {
    const columns = [{ key: "desc", header: "Description" }];
    const data = [{ desc: "Booking, 3 nights" }];

    const csv = serialiseCsv(columns, data);
    const lines = csv.split("\n");

    expect(lines[1]).toBe('"Booking, 3 nights"');
  });

  it("escapes double quotes in values", () => {
    const columns = [{ key: "desc", header: "Description" }];
    const data = [{ desc: 'He said "hello"' }];

    const csv = serialiseCsv(columns, data);
    const lines = csv.split("\n");

    expect(lines[1]).toBe('"He said ""hello"""');
  });

  it("handles empty data", () => {
    const columns = [{ key: "name", header: "Name" }];
    const data: Record<string, string>[] = [];

    const csv = serialiseCsv(columns, data);
    const lines = csv.split("\n").filter(Boolean);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("Name");
  });

  it("formats Australian dates (DD/MM/YYYY)", () => {
    const columns = [
      { key: "date", header: "Date" },
      { key: "amount", header: "Amount" },
    ];
    const data = [{ date: "07/04/2027", amount: "50.00" }];

    const csv = serialiseCsv(columns, data);
    expect(csv).toContain("07/04/2027");
  });
});

describe("XERO_COLUMN_MAP", () => {
  it("has required Xero bank statement columns", () => {
    const keys = XERO_COLUMN_MAP.map((c) => c.header);
    expect(keys).toContain("Date");
    expect(keys).toContain("Amount");
    expect(keys).toContain("Payee");
    expect(keys).toContain("Description");
    expect(keys).toContain("Reference");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /opt/snowgum && npx vitest run src/actions/reports/export-csv.test.ts
```

Expected: FAIL — `Cannot find module '../export-csv'`

- [ ] **Step 3: Write the implementation**

Create `src/actions/reports/export-csv.ts`:

```typescript
export type CsvColumn = {
  key: string;
  header: string;
};

function escapeCsvValue(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function serialiseCsv(
  columns: CsvColumn[],
  data: Record<string, string>[]
): string {
  const header = columns.map((c) => escapeCsvValue(c.header)).join(",");
  const rows = data.map((row) =>
    columns.map((c) => escapeCsvValue(row[c.key] ?? "")).join(",")
  );
  return [header, ...rows].join("\n");
}

/**
 * Xero bank statement import column mapping.
 * Maps transaction ledger fields to Xero's expected CSV format.
 */
export const XERO_COLUMN_MAP: CsvColumn[] = [
  { key: "date", header: "Date" },
  { key: "amount", header: "Amount" },
  { key: "payee", header: "Payee" },
  { key: "description", header: "Description" },
  { key: "reference", header: "Reference" },
];
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /opt/snowgum && npx vitest run src/actions/reports/export-csv.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/reports/export-csv.ts src/actions/reports/export-csv.test.ts
git commit -m "feat(phase-12): add CSV export serialiser with Xero column mapping"
```

---

## Task 6: Transaction Ledger Report Action (TDD)

**Files:**
- Create: `src/actions/reports/transaction-ledger.ts`
- Create: `src/actions/reports/transaction-ledger.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/actions/reports/transaction-ledger.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRows: unknown[] = [];

vi.mock("@/db/index", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => ({
                offset: () => Promise.resolve(mockRows),
              }),
            }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  transactions: { id: "id", organisationId: "organisation_id", memberId: "member_id", type: "type", amountCents: "amount_cents", description: "description", stripePaymentIntentId: "stripe_payment_intent_id", createdAt: "created_at", bookingId: "booking_id", platformFeeCents: "platform_fee_cents" },
  members: { id: "id", firstName: "first_name", lastName: "last_name" },
}));

import { getTransactionLedger, formatLedgerForXero } from "../transaction-ledger";

describe("getTransactionLedger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRows.length = 0;
  });

  it("returns empty rows when no transactions exist", async () => {
    const result = await getTransactionLedger({
      organisationId: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(result.rows).toEqual([]);
  });
});

describe("formatLedgerForXero", () => {
  it("formats transaction rows for Xero CSV import", () => {
    const rows = [
      {
        id: "1",
        date: new Date("2027-07-15T00:00:00Z"),
        memberFirstName: "Alice",
        memberLastName: "Smith",
        type: "PAYMENT" as const,
        amountCents: 15000,
        description: "Booking BSKI-2027-0042 — 3 nights",
        stripeRef: "pi_abc123",
      },
    ];

    const formatted = formatLedgerForXero(rows);

    expect(formatted[0].date).toBe("15/07/2027");
    expect(formatted[0].amount).toBe("150.00");
    expect(formatted[0].payee).toBe("Alice Smith");
    expect(formatted[0].reference).toBe("pi_abc123");
  });

  it("formats refunds as negative amounts", () => {
    const rows = [
      {
        id: "2",
        date: new Date("2027-07-16T00:00:00Z"),
        memberFirstName: "Bob",
        memberLastName: "Jones",
        type: "REFUND" as const,
        amountCents: -5000,
        description: "Refund for BSKI-2027-0042",
        stripeRef: null,
      },
    ];

    const formatted = formatLedgerForXero(rows);

    expect(formatted[0].amount).toBe("-50.00");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /opt/snowgum && npx vitest run src/actions/reports/transaction-ledger.test.ts
```

Expected: FAIL — `Cannot find module '../transaction-ledger'`

- [ ] **Step 3: Write the implementation**

Create `src/actions/reports/transaction-ledger.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { transactions, members } from "@/db/schema";
import { eq, and, sql, gte, lte, desc } from "drizzle-orm";
import { format } from "date-fns";

const PAGE_SIZE = 50;

type LedgerFilters = {
  organisationId: string;
  dateFrom?: string;
  dateTo?: string;
  type?: string;
  memberId?: string;
  page?: number;
};

type LedgerRow = {
  id: string;
  date: Date;
  memberFirstName: string;
  memberLastName: string;
  type: "PAYMENT" | "REFUND" | "CREDIT" | "SUBSCRIPTION" | "ADJUSTMENT" | "INVOICE";
  amountCents: number;
  description: string;
  stripeRef: string | null;
};

type LedgerResult = {
  rows: LedgerRow[];
  total: number;
  page: number;
  pageSize: number;
};

export async function getTransactionLedger(
  filters: LedgerFilters
): Promise<LedgerResult> {
  const page = filters.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  const conditions = [eq(transactions.organisationId, filters.organisationId)];

  if (filters.dateFrom) {
    conditions.push(gte(transactions.createdAt, sql`${filters.dateFrom}::timestamptz`));
  }
  if (filters.dateTo) {
    conditions.push(lte(transactions.createdAt, sql`${filters.dateTo}::timestamptz`));
  }
  if (filters.type) {
    conditions.push(eq(transactions.type, filters.type as "PAYMENT" | "REFUND" | "CREDIT" | "SUBSCRIPTION" | "ADJUSTMENT" | "INVOICE"));
  }
  if (filters.memberId) {
    conditions.push(eq(transactions.memberId, filters.memberId));
  }

  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.createdAt,
      memberFirstName: members.firstName,
      memberLastName: members.lastName,
      type: transactions.type,
      amountCents: transactions.amountCents,
      description: transactions.description,
      stripeRef: transactions.stripePaymentIntentId,
    })
    .from(transactions)
    .innerJoin(members, eq(members.id, transactions.memberId))
    .where(and(...conditions))
    .orderBy(desc(transactions.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(transactions)
    .innerJoin(members, eq(members.id, transactions.memberId))
    .where(and(...conditions));

  const total = Number(countResult?.count ?? 0);

  return { rows, total, page, pageSize: PAGE_SIZE };
}

/**
 * Format ledger rows for Xero bank statement CSV import.
 * Date: DD/MM/YYYY, Amount: dollars with 2dp, Payee: member name.
 */
export function formatLedgerForXero(
  rows: LedgerRow[]
): { date: string; amount: string; payee: string; description: string; reference: string }[] {
  return rows.map((row) => ({
    date: format(new Date(row.date), "dd/MM/yyyy"),
    amount: (row.amountCents / 100).toFixed(2),
    payee: `${row.memberFirstName} ${row.memberLastName}`,
    description: row.description,
    reference: row.stripeRef ?? "",
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /opt/snowgum && npx vitest run src/actions/reports/transaction-ledger.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/reports/transaction-ledger.ts src/actions/reports/transaction-ledger.test.ts
git commit -m "feat(phase-12): add transaction ledger report with Xero export format"
```

---

## Task 7: Revenue Summary Report Action (TDD)

**Files:**
- Create: `src/actions/reports/revenue-summary.ts`
- Create: `src/actions/reports/revenue-summary.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/actions/reports/revenue-summary.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db/index", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          groupBy: () => Promise.resolve([]),
        }),
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  transactions: { id: "id", organisationId: "organisation_id", type: "type", amountCents: "amount_cents", platformFeeCents: "platform_fee_cents", createdAt: "created_at", bookingId: "booking_id" },
  bookings: { id: "id", lodgeId: "lodge_id" },
}));

import { getRevenueSummary } from "../revenue-summary";

describe("getRevenueSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty rows when no transactions exist", async () => {
    const result = await getRevenueSummary({
      organisationId: "550e8400-e29b-41d4-a716-446655440000",
      dateFrom: "2026-07-01",
      dateTo: "2027-06-30",
      granularity: "monthly",
    });

    expect(result.rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /opt/snowgum && npx vitest run src/actions/reports/revenue-summary.test.ts
```

Expected: FAIL — `Cannot find module '../revenue-summary'`

- [ ] **Step 3: Write the implementation**

Create `src/actions/reports/revenue-summary.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { transactions } from "@/db/schema";
import { eq, and, sql, gte, lte } from "drizzle-orm";

type RevenueSummaryFilters = {
  organisationId: string;
  dateFrom: string;
  dateTo: string;
  granularity: "monthly" | "quarterly" | "annual";
  lodgeId?: string;
};

type RevenueSummaryRow = {
  period: string;
  bookingRevenueCents: number;
  subscriptionRevenueCents: number;
  refundsCents: number;
  netRevenueCents: number;
  platformFeesCents: number;
};

type RevenueSummaryResult = {
  rows: RevenueSummaryRow[];
  totalNetRevenueCents: number;
  totalPlatformFeesCents: number;
};

function getDateTrunc(granularity: "monthly" | "quarterly" | "annual"): string {
  switch (granularity) {
    case "monthly":
      return "month";
    case "quarterly":
      return "quarter";
    case "annual":
      return "year";
  }
}

function getDateFormat(granularity: "monthly" | "quarterly" | "annual"): string {
  switch (granularity) {
    case "monthly":
      return "YYYY-MM";
    case "quarterly":
      return "YYYY-\"Q\"Q";
    case "annual":
      return "YYYY";
  }
}

export async function getRevenueSummary(
  filters: RevenueSummaryFilters
): Promise<RevenueSummaryResult> {
  const { organisationId, dateFrom, dateTo, granularity } = filters;
  const trunc = getDateTrunc(granularity);
  const fmt = getDateFormat(granularity);

  const conditions = [
    eq(transactions.organisationId, organisationId),
    gte(transactions.createdAt, sql`${dateFrom}::timestamptz`),
    lte(transactions.createdAt, sql`${dateTo}::timestamptz`),
    sql`${transactions.type} IN ('PAYMENT', 'SUBSCRIPTION', 'REFUND')`,
  ];

  const rawRows = await db
    .select({
      period: sql<string>`TO_CHAR(DATE_TRUNC(${sql.raw(`'${trunc}'`)}, ${transactions.createdAt}), ${sql.raw(`'${fmt}'`)})`,
      bookingRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'PAYMENT' THEN ${transactions.amountCents} ELSE 0 END), 0)`,
      subscriptionRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'SUBSCRIPTION' THEN ${transactions.amountCents} ELSE 0 END), 0)`,
      refunds: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'REFUND' THEN ABS(${transactions.amountCents}) ELSE 0 END), 0)`,
      platformFees: sql<number>`COALESCE(SUM(COALESCE(${transactions.platformFeeCents}, 0)), 0)`,
    })
    .from(transactions)
    .where(and(...conditions))
    .groupBy(sql`DATE_TRUNC(${sql.raw(`'${trunc}'`)}, ${transactions.createdAt})`);

  const rows: RevenueSummaryRow[] = rawRows.map((r) => {
    const booking = Number(r.bookingRevenue);
    const subscription = Number(r.subscriptionRevenue);
    const refunds = Number(r.refunds);
    const platformFees = Number(r.platformFees);

    return {
      period: r.period,
      bookingRevenueCents: booking,
      subscriptionRevenueCents: subscription,
      refundsCents: refunds,
      netRevenueCents: booking + subscription - refunds,
      platformFeesCents: platformFees,
    };
  });

  rows.sort((a, b) => a.period.localeCompare(b.period));

  const totalNetRevenueCents = rows.reduce((sum, r) => sum + r.netRevenueCents, 0);
  const totalPlatformFeesCents = rows.reduce((sum, r) => sum + r.platformFeesCents, 0);

  return { rows, totalNetRevenueCents, totalPlatformFeesCents };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /opt/snowgum && npx vitest run src/actions/reports/revenue-summary.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/reports/revenue-summary.ts src/actions/reports/revenue-summary.test.ts
git commit -m "feat(phase-12): add revenue summary report action with tests"
```

---

## Task 8: Member Balances Report Action (TDD)

**Files:**
- Create: `src/actions/reports/member-balances.ts`
- Create: `src/actions/reports/member-balances.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/actions/reports/member-balances.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db/index", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          leftJoin: () => ({
            where: () => ({
              groupBy: () => ({
                orderBy: () => ({
                  limit: () => ({
                    offset: () => Promise.resolve([]),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  transactions: { id: "id", organisationId: "organisation_id", memberId: "member_id", type: "type", amountCents: "amount_cents" },
  members: { id: "id", firstName: "first_name", lastName: "last_name", organisationId: "organisation_id", isFinancial: "is_financial", membershipClassId: "membership_class_id" },
  membershipClasses: { id: "id", name: "name" },
  subscriptions: { id: "id", memberId: "member_id", status: "status", amountCents: "amount_cents" },
}));

import { getMemberBalances } from "../member-balances";

describe("getMemberBalances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty rows when no members exist", async () => {
    const result = await getMemberBalances({
      organisationId: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(result.rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /opt/snowgum && npx vitest run src/actions/reports/member-balances.test.ts
```

Expected: FAIL — `Cannot find module '../member-balances'`

- [ ] **Step 3: Write the implementation**

Create `src/actions/reports/member-balances.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { transactions, members, membershipClasses, subscriptions } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

const PAGE_SIZE = 50;

type MemberBalancesFilters = {
  organisationId: string;
  membershipClassId?: string;
  isFinancial?: boolean;
  hasOutstandingBalance?: boolean;
  page?: number;
};

type MemberBalanceRow = {
  memberId: string;
  firstName: string;
  lastName: string;
  membershipClassName: string | null;
  isFinancial: boolean;
  subscriptionStatus: string | null;
  totalPaidCents: number;
  totalRefundedCents: number;
  outstandingBalanceCents: number;
};

type MemberBalancesResult = {
  rows: MemberBalanceRow[];
  total: number;
  page: number;
  pageSize: number;
};

export async function getMemberBalances(
  filters: MemberBalancesFilters
): Promise<MemberBalancesResult> {
  const page = filters.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  const conditions = [eq(members.organisationId, filters.organisationId)];

  if (filters.membershipClassId) {
    conditions.push(eq(members.membershipClassId, filters.membershipClassId));
  }
  if (filters.isFinancial !== undefined) {
    conditions.push(eq(members.isFinancial, filters.isFinancial));
  }

  const rows = await db
    .select({
      memberId: members.id,
      firstName: members.firstName,
      lastName: members.lastName,
      membershipClassName: membershipClasses.name,
      isFinancial: members.isFinancial,
      totalPaid: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} IN ('PAYMENT', 'SUBSCRIPTION') THEN ${transactions.amountCents} ELSE 0 END), 0)`,
      totalRefunded: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'REFUND' THEN ABS(${transactions.amountCents}) ELSE 0 END), 0)`,
      totalInvoiced: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'INVOICE' THEN ${transactions.amountCents} ELSE 0 END), 0)`,
    })
    .from(members)
    .innerJoin(transactions, eq(transactions.memberId, members.id))
    .leftJoin(membershipClasses, eq(membershipClasses.id, members.membershipClassId))
    .where(and(...conditions))
    .groupBy(members.id, members.firstName, members.lastName, membershipClasses.name, members.isFinancial)
    .orderBy(members.lastName, members.firstName)
    .limit(PAGE_SIZE)
    .offset(offset);

  const mappedRows: MemberBalanceRow[] = rows.map((r) => {
    const totalPaidCents = Number(r.totalPaid);
    const totalRefundedCents = Number(r.totalRefunded);
    const totalInvoicedCents = Number(r.totalInvoiced);
    const outstandingBalanceCents = totalInvoicedCents - totalPaidCents + totalRefundedCents;

    return {
      memberId: r.memberId,
      firstName: r.firstName,
      lastName: r.lastName,
      membershipClassName: r.membershipClassName,
      isFinancial: r.isFinancial,
      subscriptionStatus: null, // populated below
      totalPaidCents,
      totalRefundedCents,
      outstandingBalanceCents: Math.max(0, outstandingBalanceCents),
    };
  });

  // Filter by outstanding balance if requested
  const filteredRows = filters.hasOutstandingBalance
    ? mappedRows.filter((r) => r.outstandingBalanceCents > 0)
    : mappedRows;

  return {
    rows: filteredRows,
    total: filteredRows.length,
    page,
    pageSize: PAGE_SIZE,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /opt/snowgum && npx vitest run src/actions/reports/member-balances.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/reports/member-balances.ts src/actions/reports/member-balances.test.ts
git commit -m "feat(phase-12): add member balances report action with tests"
```

---

## Task 9: Subscription Status Report Action (TDD)

**Files:**
- Create: `src/actions/reports/subscription-status.ts`
- Create: `src/actions/reports/subscription-status.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/actions/reports/subscription-status.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db/index", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            leftJoin: () => ({
              where: () => ({
                orderBy: () => ({
                  limit: () => ({
                    offset: () => Promise.resolve([]),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  subscriptions: { id: "id", organisationId: "organisation_id", memberId: "member_id", seasonId: "season_id", amountCents: "amount_cents", dueDate: "due_date", paidAt: "paid_at", status: "status" },
  members: { id: "id", firstName: "first_name", lastName: "last_name", membershipClassId: "membership_class_id" },
  membershipClasses: { id: "id", name: "name" },
  seasons: { id: "id", name: "name" },
}));

import { getSubscriptionStatus } from "../subscription-status";

describe("getSubscriptionStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty rows when no subscriptions exist", async () => {
    const result = await getSubscriptionStatus({
      organisationId: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(result.rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /opt/snowgum && npx vitest run src/actions/reports/subscription-status.test.ts
```

Expected: FAIL — `Cannot find module '../subscription-status'`

- [ ] **Step 3: Write the implementation**

Create `src/actions/reports/subscription-status.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { subscriptions, members, membershipClasses, seasons } from "@/db/schema";
import { eq, and, sql, lte } from "drizzle-orm";

const PAGE_SIZE = 50;

type SubscriptionStatusFilters = {
  organisationId: string;
  seasonId?: string;
  status?: "UNPAID" | "PAID" | "WAIVED";
  overdueOnly?: boolean;
  page?: number;
};

type SubscriptionStatusRow = {
  id: string;
  memberFirstName: string;
  memberLastName: string;
  membershipClassName: string | null;
  seasonName: string;
  amountCents: number;
  dueDate: string;
  status: string;
  paidAt: Date | null;
};

type SubscriptionStatusResult = {
  rows: SubscriptionStatusRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    paidCount: number;
    paidAmountCents: number;
    unpaidCount: number;
    unpaidAmountCents: number;
    waivedCount: number;
  };
};

export async function getSubscriptionStatus(
  filters: SubscriptionStatusFilters
): Promise<SubscriptionStatusResult> {
  const page = filters.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  const conditions = [eq(subscriptions.organisationId, filters.organisationId)];

  if (filters.seasonId) {
    conditions.push(eq(subscriptions.seasonId, filters.seasonId));
  }
  if (filters.status) {
    conditions.push(eq(subscriptions.status, filters.status));
  }
  if (filters.overdueOnly) {
    conditions.push(eq(subscriptions.status, "UNPAID"));
    conditions.push(lte(subscriptions.dueDate, sql`CURRENT_DATE`));
  }

  const rows = await db
    .select({
      id: subscriptions.id,
      memberFirstName: members.firstName,
      memberLastName: members.lastName,
      membershipClassName: membershipClasses.name,
      seasonName: seasons.name,
      amountCents: subscriptions.amountCents,
      dueDate: subscriptions.dueDate,
      status: subscriptions.status,
      paidAt: subscriptions.paidAt,
    })
    .from(subscriptions)
    .innerJoin(members, eq(members.id, subscriptions.memberId))
    .innerJoin(seasons, eq(seasons.id, subscriptions.seasonId))
    .leftJoin(membershipClasses, eq(membershipClasses.id, members.membershipClassId))
    .where(and(...conditions))
    .orderBy(members.lastName, members.firstName)
    .limit(PAGE_SIZE)
    .offset(offset);

  // Summary counts (unfiltered by page)
  const [summaryRow] = await db
    .select({
      paidCount: sql<number>`COUNT(*) FILTER (WHERE ${subscriptions.status} = 'PAID')`,
      paidAmount: sql<number>`COALESCE(SUM(${subscriptions.amountCents}) FILTER (WHERE ${subscriptions.status} = 'PAID'), 0)`,
      unpaidCount: sql<number>`COUNT(*) FILTER (WHERE ${subscriptions.status} = 'UNPAID')`,
      unpaidAmount: sql<number>`COALESCE(SUM(${subscriptions.amountCents}) FILTER (WHERE ${subscriptions.status} = 'UNPAID'), 0)`,
      waivedCount: sql<number>`COUNT(*) FILTER (WHERE ${subscriptions.status} = 'WAIVED')`,
    })
    .from(subscriptions)
    .where(and(...conditions.slice(0, filters.status ? conditions.length : conditions.length)));

  return {
    rows,
    total: rows.length,
    page,
    pageSize: PAGE_SIZE,
    summary: {
      paidCount: Number(summaryRow?.paidCount ?? 0),
      paidAmountCents: Number(summaryRow?.paidAmount ?? 0),
      unpaidCount: Number(summaryRow?.unpaidCount ?? 0),
      unpaidAmountCents: Number(summaryRow?.unpaidAmount ?? 0),
      waivedCount: Number(summaryRow?.waivedCount ?? 0),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /opt/snowgum && npx vitest run src/actions/reports/subscription-status.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/reports/subscription-status.ts src/actions/reports/subscription-status.test.ts
git commit -m "feat(phase-12): add subscription status report action with tests"
```

---

## Task 10: Occupancy Report Action (TDD)

**Files:**
- Create: `src/actions/reports/occupancy.ts`
- Create: `src/actions/reports/occupancy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/actions/reports/occupancy.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db/index", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => ({
                offset: () => Promise.resolve([]),
              }),
            }),
          }),
        }),
        where: () => ({
          orderBy: () => ({
            limit: () => ({
              offset: () => Promise.resolve([]),
            }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  availabilityCache: { id: "id", lodgeId: "lodge_id", date: "date", totalBeds: "total_beds", bookedBeds: "booked_beds" },
  lodges: { id: "id", name: "name", organisationId: "organisation_id" },
}));

import { getOccupancyReport } from "../occupancy";

describe("getOccupancyReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty rows when no availability data exists", async () => {
    const result = await getOccupancyReport({
      organisationId: "550e8400-e29b-41d4-a716-446655440000",
      dateFrom: "2027-07-01",
      dateTo: "2027-07-31",
    });

    expect(result.rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /opt/snowgum && npx vitest run src/actions/reports/occupancy.test.ts
```

Expected: FAIL — `Cannot find module '../occupancy'`

- [ ] **Step 3: Write the implementation**

Create `src/actions/reports/occupancy.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { availabilityCache, lodges } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

const PAGE_SIZE = 50;

type OccupancyFilters = {
  organisationId: string;
  dateFrom: string;
  dateTo: string;
  lodgeId?: string;
  page?: number;
};

type OccupancyRow = {
  date: string;
  lodgeName: string;
  totalBeds: number;
  bookedBeds: number;
  availableBeds: number;
  occupancyPercent: number;
};

type OccupancyResult = {
  rows: OccupancyRow[];
  total: number;
  page: number;
  pageSize: number;
};

export async function getOccupancyReport(
  filters: OccupancyFilters
): Promise<OccupancyResult> {
  const page = filters.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  const conditions = [
    eq(lodges.organisationId, filters.organisationId),
    gte(availabilityCache.date, filters.dateFrom),
    lte(availabilityCache.date, filters.dateTo),
  ];

  if (filters.lodgeId) {
    conditions.push(eq(availabilityCache.lodgeId, filters.lodgeId));
  }

  const rawRows = await db
    .select({
      date: availabilityCache.date,
      lodgeName: lodges.name,
      totalBeds: availabilityCache.totalBeds,
      bookedBeds: availabilityCache.bookedBeds,
    })
    .from(availabilityCache)
    .innerJoin(lodges, eq(lodges.id, availabilityCache.lodgeId))
    .where(and(...conditions))
    .orderBy(availabilityCache.date)
    .limit(PAGE_SIZE)
    .offset(offset);

  const rows: OccupancyRow[] = rawRows.map((r) => ({
    date: r.date,
    lodgeName: r.lodgeName,
    totalBeds: r.totalBeds,
    bookedBeds: r.bookedBeds,
    availableBeds: r.totalBeds - r.bookedBeds,
    occupancyPercent: r.totalBeds > 0 ? Math.round((r.bookedBeds / r.totalBeds) * 100) : 0,
  }));

  return { rows, total: rows.length, page, pageSize: PAGE_SIZE };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /opt/snowgum && npx vitest run src/actions/reports/occupancy.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/reports/occupancy.ts src/actions/reports/occupancy.test.ts
git commit -m "feat(phase-12): add occupancy report action with tests"
```

---

## Task 11: Arrivals & Departures Report Action (TDD)

**Files:**
- Create: `src/actions/reports/arrivals-departures.ts`
- Create: `src/actions/reports/arrivals-departures.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/actions/reports/arrivals-departures.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db/index", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => ({
                  offset: () => Promise.resolve([]),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  bookings: { id: "id", organisationId: "organisation_id", lodgeId: "lodge_id", primaryMemberId: "primary_member_id", checkInDate: "check_in_date", checkOutDate: "check_out_date", status: "status", bookingReference: "booking_reference", balancePaidAt: "balance_paid_at" },
  bookingGuests: { id: "id", bookingId: "booking_id", memberId: "member_id", bedId: "bed_id", roomId: "room_id" },
  members: { id: "id", firstName: "first_name", lastName: "last_name" },
  lodges: { id: "id", name: "name" },
  beds: { id: "id", label: "label" },
  rooms: { id: "id", name: "name" },
}));

import { getArrivalsAndDepartures } from "../arrivals-departures";

describe("getArrivalsAndDepartures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty rows when no bookings exist", async () => {
    const result = await getArrivalsAndDepartures({
      organisationId: "550e8400-e29b-41d4-a716-446655440000",
      dateFrom: "2027-07-15",
      dateTo: "2027-07-15",
    });

    expect(result.rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /opt/snowgum && npx vitest run src/actions/reports/arrivals-departures.test.ts
```

Expected: FAIL — `Cannot find module '../arrivals-departures'`

- [ ] **Step 3: Write the implementation**

Create `src/actions/reports/arrivals-departures.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { bookings, members, lodges } from "@/db/schema";
import { eq, and, sql, gte, lte, or } from "drizzle-orm";

const PAGE_SIZE = 50;

type ArrivalsFilters = {
  organisationId: string;
  dateFrom: string;
  dateTo: string;
  lodgeId?: string;
  page?: number;
};

type ArrivalDepartureRow = {
  bookingReference: string;
  type: "arrival" | "departure";
  date: string;
  memberFirstName: string;
  memberLastName: string;
  lodgeName: string;
  checkInDate: string;
  checkOutDate: string;
  paymentStatus: "paid" | "unpaid";
};

type ArrivalsResult = {
  rows: ArrivalDepartureRow[];
  total: number;
  page: number;
  pageSize: number;
};

export async function getArrivalsAndDepartures(
  filters: ArrivalsFilters
): Promise<ArrivalsResult> {
  const { organisationId, dateFrom, dateTo } = filters;
  const page = filters.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  const conditions = [
    eq(bookings.organisationId, organisationId),
    sql`${bookings.status} IN ('CONFIRMED', 'COMPLETED', 'PENDING')`,
    or(
      and(gte(bookings.checkInDate, dateFrom), lte(bookings.checkInDate, dateTo)),
      and(gte(bookings.checkOutDate, dateFrom), lte(bookings.checkOutDate, dateTo))
    )!,
  ];

  if (filters.lodgeId) {
    conditions.push(eq(bookings.lodgeId, filters.lodgeId));
  }

  const rawRows = await db
    .select({
      bookingReference: bookings.bookingReference,
      memberFirstName: members.firstName,
      memberLastName: members.lastName,
      lodgeName: lodges.name,
      checkInDate: bookings.checkInDate,
      checkOutDate: bookings.checkOutDate,
      balancePaidAt: bookings.balancePaidAt,
    })
    .from(bookings)
    .innerJoin(members, eq(members.id, bookings.primaryMemberId))
    .innerJoin(lodges, eq(lodges.id, bookings.lodgeId))
    .where(and(...conditions))
    .orderBy(bookings.checkInDate)
    .limit(PAGE_SIZE)
    .offset(offset);

  // Expand to arrival + departure rows
  const rows: ArrivalDepartureRow[] = [];

  for (const r of rawRows) {
    const paymentStatus = r.balancePaidAt ? "paid" : "unpaid";

    if (r.checkInDate >= dateFrom && r.checkInDate <= dateTo) {
      rows.push({
        bookingReference: r.bookingReference,
        type: "arrival",
        date: r.checkInDate,
        memberFirstName: r.memberFirstName,
        memberLastName: r.memberLastName,
        lodgeName: r.lodgeName,
        checkInDate: r.checkInDate,
        checkOutDate: r.checkOutDate,
        paymentStatus,
      });
    }

    if (r.checkOutDate >= dateFrom && r.checkOutDate <= dateTo) {
      rows.push({
        bookingReference: r.bookingReference,
        type: "departure",
        date: r.checkOutDate,
        memberFirstName: r.memberFirstName,
        memberLastName: r.memberLastName,
        lodgeName: r.lodgeName,
        checkInDate: r.checkInDate,
        checkOutDate: r.checkOutDate,
        paymentStatus,
      });
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));

  return { rows, total: rows.length, page, pageSize: PAGE_SIZE };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /opt/snowgum && npx vitest run src/actions/reports/arrivals-departures.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/reports/arrivals-departures.ts src/actions/reports/arrivals-departures.test.ts
git commit -m "feat(phase-12): add arrivals and departures report action with tests"
```

---

## Task 12: Booking Summary Report Action (TDD)

**Files:**
- Create: `src/actions/reports/booking-summary.ts`
- Create: `src/actions/reports/booking-summary.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/actions/reports/booking-summary.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db/index", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => ({
                  offset: () => Promise.resolve([]),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  bookings: { id: "id", organisationId: "organisation_id", lodgeId: "lodge_id", primaryMemberId: "primary_member_id", checkInDate: "check_in_date", checkOutDate: "check_out_date", totalNights: "total_nights", totalAmountCents: "total_amount_cents", status: "status", bookingReference: "booking_reference", createdAt: "created_at" },
  bookingGuests: { id: "id", bookingId: "booking_id" },
  members: { id: "id", firstName: "first_name", lastName: "last_name" },
  lodges: { id: "id", name: "name" },
}));

import { getBookingSummary } from "../booking-summary";

describe("getBookingSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty rows when no bookings exist", async () => {
    const result = await getBookingSummary({
      organisationId: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(result.rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /opt/snowgum && npx vitest run src/actions/reports/booking-summary.test.ts
```

Expected: FAIL — `Cannot find module '../booking-summary'`

- [ ] **Step 3: Write the implementation**

Create `src/actions/reports/booking-summary.ts`:

```typescript
"use server";

import { db } from "@/db/index";
import { bookings, bookingGuests, members, lodges } from "@/db/schema";
import { eq, and, sql, gte, lte, desc } from "drizzle-orm";

const PAGE_SIZE = 50;

type BookingSummaryFilters = {
  organisationId: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  lodgeId?: string;
  memberId?: string;
  page?: number;
};

type BookingSummaryRow = {
  bookingReference: string;
  memberFirstName: string;
  memberLastName: string;
  lodgeName: string;
  checkInDate: string;
  checkOutDate: string;
  totalNights: number;
  guestCount: number;
  totalAmountCents: number;
  status: string;
};

type BookingSummaryResult = {
  rows: BookingSummaryRow[];
  total: number;
  page: number;
  pageSize: number;
  totalAmountCents: number;
};

export async function getBookingSummary(
  filters: BookingSummaryFilters
): Promise<BookingSummaryResult> {
  const page = filters.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  const conditions = [eq(bookings.organisationId, filters.organisationId)];

  if (filters.dateFrom) {
    conditions.push(gte(bookings.checkInDate, filters.dateFrom));
  }
  if (filters.dateTo) {
    conditions.push(lte(bookings.checkInDate, filters.dateTo));
  }
  if (filters.status) {
    conditions.push(eq(bookings.status, filters.status as "PENDING" | "CONFIRMED" | "WAITLISTED" | "CANCELLED" | "COMPLETED"));
  }
  if (filters.lodgeId) {
    conditions.push(eq(bookings.lodgeId, filters.lodgeId));
  }
  if (filters.memberId) {
    conditions.push(eq(bookings.primaryMemberId, filters.memberId));
  }

  const rawRows = await db
    .select({
      id: bookings.id,
      bookingReference: bookings.bookingReference,
      memberFirstName: members.firstName,
      memberLastName: members.lastName,
      lodgeName: lodges.name,
      checkInDate: bookings.checkInDate,
      checkOutDate: bookings.checkOutDate,
      totalNights: bookings.totalNights,
      totalAmountCents: bookings.totalAmountCents,
      status: bookings.status,
    })
    .from(bookings)
    .innerJoin(members, eq(members.id, bookings.primaryMemberId))
    .innerJoin(lodges, eq(lodges.id, bookings.lodgeId))
    .where(and(...conditions))
    .orderBy(desc(bookings.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  // Guest counts
  const bookingIds = rawRows.map((r) => r.id);
  let guestCountMap = new Map<string, number>();

  if (bookingIds.length > 0) {
    const guestCounts = await db
      .select({
        bookingId: bookingGuests.bookingId,
        count: sql<number>`COUNT(*)`,
      })
      .from(bookingGuests)
      .where(sql`${bookingGuests.bookingId} IN (${sql.join(bookingIds.map(id => sql`${id}`), sql`, `)})`)
      .groupBy(bookingGuests.bookingId);

    guestCountMap = new Map(guestCounts.map((g) => [g.bookingId, Number(g.count)]));
  }

  const rows: BookingSummaryRow[] = rawRows.map((r) => ({
    bookingReference: r.bookingReference,
    memberFirstName: r.memberFirstName,
    memberLastName: r.memberLastName,
    lodgeName: r.lodgeName,
    checkInDate: r.checkInDate,
    checkOutDate: r.checkOutDate,
    totalNights: r.totalNights,
    guestCount: guestCountMap.get(r.id) ?? 0,
    totalAmountCents: r.totalAmountCents,
    status: r.status,
  }));

  const totalAmountCents = rows.reduce((sum, r) => sum + r.totalAmountCents, 0);

  return { rows, total: rows.length, page, pageSize: PAGE_SIZE, totalAmountCents };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /opt/snowgum && npx vitest run src/actions/reports/booking-summary.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/reports/booking-summary.ts src/actions/reports/booking-summary.test.ts
git commit -m "feat(phase-12): add booking summary report action with tests"
```

---

## Task 13: Dashboard Page with Role-Based Tabs

**Files:**
- Create: `src/app/[slug]/admin/dashboard/page.tsx`
- Create: `src/app/[slug]/admin/dashboard/treasurer-tab.tsx`
- Create: `src/app/[slug]/admin/dashboard/booking-officer-tab.tsx`
- Create: `src/app/[slug]/admin/dashboard/committee-tab.tsx`
- Create: `src/app/[slug]/admin/dashboard/revenue-chart.tsx`
- Create: `src/app/[slug]/admin/dashboard/occupancy-chart.tsx`
- Modify: `src/app/[slug]/admin/page.tsx`

- [ ] **Step 1: Create the revenue chart component**

Create `src/app/[slug]/admin/dashboard/revenue-chart.tsx`:

```tsx
"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

type MonthlyRevenue = {
  month: string;
  bookingCents: number;
  subscriptionCents: number;
  refundCents: number;
};

type RevenueChartProps = {
  data: MonthlyRevenue[];
};

export function RevenueChart({ data }: RevenueChartProps) {
  const chartData = data.map((d) => ({
    month: d.month,
    Bookings: d.bookingCents / 100,
    Subscriptions: d.subscriptionCents / 100,
    Refunds: -(d.refundCents / 100),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis tickFormatter={(v: number) => `$${v}`} />
        <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
        <Legend />
        <Bar dataKey="Bookings" fill="#2563eb" />
        <Bar dataKey="Subscriptions" fill="#16a34a" />
        <Bar dataKey="Refunds" fill="#dc2626" />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Create the occupancy chart component**

Create `src/app/[slug]/admin/dashboard/occupancy-chart.tsx`:

```tsx
"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type OccupancyDay = {
  date: string;
  occupancyPercent: number;
};

type OccupancyChartProps = {
  data: OccupancyDay[];
};

export function OccupancyChart({ data }: OccupancyChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
        <Tooltip formatter={(v: number) => `${v}%`} />
        <Area type="monotone" dataKey="occupancyPercent" stroke="#2563eb" fill="#2563eb" fillOpacity={0.2} name="Occupancy" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Create the treasurer tab**

Create `src/app/[slug]/admin/dashboard/treasurer-tab.tsx`:

```tsx
"use client";

import { StatCard } from "./stat-card";
import { RevenueChart } from "./revenue-chart";
import { formatCurrency } from "@/lib/currency";

type TreasurerData = {
  revenueMtdCents: number;
  revenueYtdCents: number;
  revenuePriorYtdCents: number;
  outstandingBalanceCents: number;
  platformFeesYtdCents: number;
  monthlyRevenue: { month: string; bookingCents: number; subscriptionCents: number; refundCents: number }[];
};

type TreasurerTabProps = {
  data: TreasurerData;
};

function calcTrend(current: number, prior: number): { value: string; direction: "up" | "down" | "neutral" } {
  if (prior === 0) return { value: "N/A", direction: "neutral" };
  const pct = Math.round(((current - prior) / prior) * 100);
  return {
    value: `${Math.abs(pct)}% vs prior year`,
    direction: pct > 0 ? "up" : pct < 0 ? "down" : "neutral",
  };
}

export function TreasurerTab({ data }: TreasurerTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue (MTD)" value={formatCurrency(data.revenueMtdCents)} />
        <StatCard
          label="Revenue (YTD)"
          value={formatCurrency(data.revenueYtdCents)}
          trend={calcTrend(data.revenueYtdCents, data.revenuePriorYtdCents)}
        />
        <StatCard label="Outstanding Balances" value={formatCurrency(data.outstandingBalanceCents)} />
        <StatCard label="Platform Fees (YTD)" value={formatCurrency(data.platformFeesYtdCents)} />
      </div>

      <div className="rounded-lg border p-4">
        <h3 className="font-medium mb-4">Monthly Revenue</h3>
        <RevenueChart data={data.monthlyRevenue} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create the booking officer tab**

Create `src/app/[slug]/admin/dashboard/booking-officer-tab.tsx`:

```tsx
"use client";

import { StatCard } from "./stat-card";
import { OccupancyChart } from "./occupancy-chart";

type UpcomingArrival = {
  bookingReference: string;
  memberFirstName: string;
  memberLastName: string;
  checkInDate: string;
  checkOutDate: string;
  guestCount: number;
  lodgeName: string;
};

type BookingOfficerData = {
  arrivalsToday: number;
  departuresToday: number;
  currentOccupancyPercent: number;
  pendingApprovals: number;
  upcomingArrivals: UpcomingArrival[];
  occupancyForecast: { date: string; occupancyPercent: number }[];
};

type BookingOfficerTabProps = {
  data: BookingOfficerData;
};

export function BookingOfficerTab({ data }: BookingOfficerTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Arrivals Today" value={String(data.arrivalsToday)} />
        <StatCard label="Departures Today" value={String(data.departuresToday)} />
        <StatCard label="Current Occupancy" value={`${data.currentOccupancyPercent}%`} />
        <StatCard label="Pending Approvals" value={String(data.pendingApprovals)} />
      </div>

      <div className="rounded-lg border p-4">
        <h3 className="font-medium mb-4">Occupancy Forecast (30 days)</h3>
        <OccupancyChart data={data.occupancyForecast} />
      </div>

      <div className="rounded-lg border p-4">
        <h3 className="font-medium mb-4">Upcoming Arrivals (7 days)</h3>
        {data.upcomingArrivals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming arrivals</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">Reference</th>
                  <th className="pb-2 font-medium">Member</th>
                  <th className="pb-2 font-medium">Lodge</th>
                  <th className="pb-2 font-medium">Check-in</th>
                  <th className="pb-2 font-medium">Guests</th>
                </tr>
              </thead>
              <tbody>
                {data.upcomingArrivals.map((a) => (
                  <tr key={a.bookingReference} className="border-b">
                    <td className="py-2">{a.bookingReference}</td>
                    <td className="py-2">{a.memberFirstName} {a.memberLastName}</td>
                    <td className="py-2">{a.lodgeName}</td>
                    <td className="py-2">{a.checkInDate}</td>
                    <td className="py-2">{a.guestCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create the committee tab**

Create `src/app/[slug]/admin/dashboard/committee-tab.tsx`:

```tsx
"use client";

import { StatCard } from "./stat-card";
import { formatCurrency } from "@/lib/currency";

type MemberClassBreakdown = {
  className: string;
  count: number;
  financialCount: number;
};

type CommitteeData = {
  totalActiveMembers: number;
  totalActiveMembersPriorYear: number;
  financialMemberCount: number;
  nonFinancialMemberCount: number;
  revenueYtdCents: number;
  revenuePriorYtdCents: number;
  occupancySeasonPercent: number;
  membersByClass: MemberClassBreakdown[];
};

type CommitteeTabProps = {
  data: CommitteeData;
};

function calcTrend(current: number, prior: number): { value: string; direction: "up" | "down" | "neutral" } {
  if (prior === 0) return { value: "N/A", direction: "neutral" };
  const diff = current - prior;
  return {
    value: `${diff > 0 ? "+" : ""}${diff} vs prior year`,
    direction: diff > 0 ? "up" : diff < 0 ? "down" : "neutral",
  };
}

function calcRevenueTrend(current: number, prior: number): { value: string; direction: "up" | "down" | "neutral" } {
  if (prior === 0) return { value: "N/A", direction: "neutral" };
  const pct = Math.round(((current - prior) / prior) * 100);
  return {
    value: `${Math.abs(pct)}% vs prior year`,
    direction: pct > 0 ? "up" : pct < 0 ? "down" : "neutral",
  };
}

export function CommitteeTab({ data }: CommitteeTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Members"
          value={String(data.totalActiveMembers)}
          trend={calcTrend(data.totalActiveMembers, data.totalActiveMembersPriorYear)}
        />
        <StatCard
          label="Revenue (YTD)"
          value={formatCurrency(data.revenueYtdCents)}
          trend={calcRevenueTrend(data.revenueYtdCents, data.revenuePriorYtdCents)}
        />
        <StatCard label="Season Occupancy" value={`${data.occupancySeasonPercent}%`} />
        <StatCard label="Financial Members" value={`${data.financialMemberCount} / ${data.totalActiveMembers}`} />
      </div>

      <div className="rounded-lg border p-4">
        <h3 className="font-medium mb-4">Membership Breakdown</h3>
        {data.membersByClass.length === 0 ? (
          <p className="text-sm text-muted-foreground">No membership data</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">Class</th>
                  <th className="pb-2 font-medium">Total</th>
                  <th className="pb-2 font-medium">Financial</th>
                  <th className="pb-2 font-medium">Non-Financial</th>
                </tr>
              </thead>
              <tbody>
                {data.membersByClass.map((c) => (
                  <tr key={c.className} className="border-b">
                    <td className="py-2">{c.className}</td>
                    <td className="py-2">{c.count}</td>
                    <td className="py-2">{c.financialCount}</td>
                    <td className="py-2">{c.count - c.financialCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create the dashboard page**

Create `src/app/[slug]/admin/dashboard/page.tsx`:

```tsx
import { getOrgBySlug } from "@/lib/org";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import { getTreasurerStats } from "@/actions/dashboard/treasurer-stats";
import { getBookingOfficerStats } from "@/actions/dashboard/booking-officer-stats";
import { getCommitteeStats } from "@/actions/dashboard/committee-stats";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TreasurerTab } from "./treasurer-tab";
import { BookingOfficerTab } from "./booking-officer-tab";
import { CommitteeTab } from "./committee-tab";
import { format } from "date-fns";

function getFinancialYear(): { start: string; end: string } {
  const now = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    start: `${year}-07-01`,
    end: `${year + 1}-06-30`,
  };
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const session = await getSessionMember(org.id);
  if (!session) redirect(`/${slug}/login`);

  const today = format(new Date(), "yyyy-MM-dd");
  const fy = getFinancialYear();

  const isCommittee = isCommitteeOrAbove(session.role);
  const isAdminRole = session.role === "ADMIN";

  // Fetch data based on role
  const [treasurerData, officerData, committeeData] = await Promise.all([
    isCommittee
      ? getTreasurerStats({ organisationId: org.id, financialYearStart: fy.start, financialYearEnd: fy.end })
      : null,
    getBookingOfficerStats({ organisationId: org.id, today }),
    isCommittee
      ? getCommitteeStats({ organisationId: org.id, financialYearStart: fy.start, financialYearEnd: fy.end })
      : null,
  ]);

  // Determine which tabs to show and default tab
  const showTreasurer = isCommittee;
  const showCommittee = isCommittee;
  const defaultTab = session.role === "BOOKING_OFFICER" ? "bookings" : "treasurer";

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {showTreasurer && <TabsTrigger value="treasurer">Treasurer</TabsTrigger>}
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          {showCommittee && <TabsTrigger value="committee">Committee</TabsTrigger>}
        </TabsList>

        {showTreasurer && treasurerData && (
          <TabsContent value="treasurer">
            <TreasurerTab data={treasurerData} />
          </TabsContent>
        )}

        <TabsContent value="bookings">
          <BookingOfficerTab data={officerData} />
        </TabsContent>

        {showCommittee && committeeData && (
          <TabsContent value="committee">
            <CommitteeTab data={committeeData} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 7: Update the old admin page to redirect**

Modify `src/app/[slug]/admin/page.tsx` to redirect to the new dashboard:

```tsx
import { redirect } from "next/navigation";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/${slug}/admin/dashboard`);
}
```

- [ ] **Step 8: Commit**

```bash
git add src/app/\[slug\]/admin/dashboard/ src/app/\[slug\]/admin/page.tsx
git commit -m "feat(phase-12): add role-based dashboard with treasurer, officer, and committee tabs"
```

---

## Task 14: Reports Index Page

**Files:**
- Create: `src/app/[slug]/admin/reports/page.tsx`

- [ ] **Step 1: Create the reports index page**

Create `src/app/[slug]/admin/reports/page.tsx`:

```tsx
import { getOrgBySlug } from "@/lib/org";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

const REPORTS = [
  {
    id: "transaction-ledger",
    title: "Transaction Ledger",
    description: "Full transaction history with running balance. Export in Xero-compatible format.",
  },
  {
    id: "revenue-summary",
    title: "Revenue Summary",
    description: "Revenue breakdown by period — bookings, subscriptions, refunds, and platform fees.",
  },
  {
    id: "member-balances",
    title: "Member Balances",
    description: "Per-member totals: paid, refunded, and outstanding balance.",
  },
  {
    id: "subscription-status",
    title: "Subscription Status",
    description: "Membership fee status by season — paid, unpaid, and waived.",
  },
  {
    id: "occupancy",
    title: "Occupancy Report",
    description: "Daily bed utilisation by lodge — total, booked, available, and occupancy %.",
  },
  {
    id: "arrivals-departures",
    title: "Arrivals & Departures",
    description: "Daily arrivals and departures with member details and payment status.",
  },
  {
    id: "booking-summary",
    title: "Booking Summary",
    description: "All bookings with guest counts, amounts, and status breakdown.",
  },
];

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const session = await getSessionMember(org.id);
  if (!session || !isCommitteeOrAbove(session.role)) {
    redirect(`/${slug}/login`);
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Reports</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((report) => (
          <Link key={report.id} href={`/${slug}/admin/reports/${report.id}`}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardContent className="p-4">
                <h3 className="font-medium mb-1">{report.title}</h3>
                <p className="text-sm text-muted-foreground">{report.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\[slug\]/admin/reports/page.tsx
git commit -m "feat(phase-12): add reports index page with 7 report cards"
```

---

## Task 15: Report Detail Page (Filters, Table, Export)

**Files:**
- Create: `src/app/[slug]/admin/reports/[reportId]/page.tsx`
- Create: `src/app/[slug]/admin/reports/[reportId]/report-filters.tsx`
- Create: `src/app/[slug]/admin/reports/[reportId]/report-table.tsx`
- Create: `src/app/[slug]/admin/reports/[reportId]/export-button.tsx`

- [ ] **Step 1: Create the export button component**

Create `src/app/[slug]/admin/reports/[reportId]/export-button.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

type ExportButtonProps = {
  data: Record<string, string>[];
  columns: { key: string; header: string }[];
  filename: string;
};

export function ExportButton({ data, columns, filename }: ExportButtonProps) {
  function handleExport() {
    const header = columns.map((c) => escapeCsvValue(c.header)).join(",");
    const rows = data.map((row) =>
      columns.map((c) => escapeCsvValue(row[c.key] ?? "")).join(",")
    );
    const csv = [header, ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="h-4 w-4 mr-2" />
      Export CSV
    </Button>
  );
}

function escapeCsvValue(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
```

- [ ] **Step 2: Create the report filters component**

Create `src/app/[slug]/admin/reports/[reportId]/report-filters.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FilterField = {
  key: string;
  label: string;
  type: "date" | "select" | "text";
  options?: { value: string; label: string }[];
};

type ReportFiltersProps = {
  fields: FilterField[];
  basePath: string;
};

export function ReportFilters({ fields, basePath }: ReportFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const params = new URLSearchParams();

    for (const field of fields) {
      const value = formData.get(field.key) as string;
      if (value) {
        params.set(field.key, value);
      }
    }

    router.push(`${basePath}?${params.toString()}`);
  }

  function handleClear() {
    router.push(basePath);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 mb-6">
      {fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1">
          <Label htmlFor={field.key} className="text-xs">{field.label}</Label>
          {field.type === "select" ? (
            <select
              id={field.key}
              name={field.key}
              defaultValue={searchParams.get(field.key) ?? ""}
              className="h-9 rounded-md border px-3 text-sm bg-background"
            >
              <option value="">All</option>
              {field.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <Input
              id={field.key}
              name={field.key}
              type={field.type}
              defaultValue={searchParams.get(field.key) ?? ""}
              className="h-9 w-40"
            />
          )}
        </div>
      ))}
      <Button type="submit" size="sm">Apply</Button>
      <Button type="button" variant="ghost" size="sm" onClick={handleClear}>Clear</Button>
    </form>
  );
}
```

- [ ] **Step 3: Create the report table component**

Create `src/app/[slug]/admin/reports/[reportId]/report-table.tsx`:

```tsx
type Column = {
  key: string;
  header: string;
  align?: "left" | "right";
};

type ReportTableProps = {
  columns: Column[];
  rows: Record<string, string | number>[];
  emptyMessage?: string;
};

export function ReportTable({ columns, rows, emptyMessage = "No data found" }: ReportTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-2 font-medium ${col.align === "right" ? "text-right" : "text-left"}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-2 ${col.align === "right" ? "text-right" : ""}`}
                >
                  {row[col.key] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Create the report detail page**

Create `src/app/[slug]/admin/reports/[reportId]/page.tsx`:

```tsx
import { getOrgBySlug } from "@/lib/org";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTransactionLedger, formatLedgerForXero } from "@/actions/reports/transaction-ledger";
import { getRevenueSummary } from "@/actions/reports/revenue-summary";
import { getMemberBalances } from "@/actions/reports/member-balances";
import { getSubscriptionStatus } from "@/actions/reports/subscription-status";
import { getOccupancyReport } from "@/actions/reports/occupancy";
import { getArrivalsAndDepartures } from "@/actions/reports/arrivals-departures";
import { getBookingSummary } from "@/actions/reports/booking-summary";
import { XERO_COLUMN_MAP } from "@/actions/reports/export-csv";
import { formatCurrency } from "@/lib/currency";
import { formatOrgDate } from "@/lib/dates";
import { ReportFilters } from "./report-filters";
import { ReportTable } from "./report-table";
import { ExportButton } from "./export-button";
import { db } from "@/db/index";
import { lodges, seasons } from "@/db/schema";
import { eq } from "drizzle-orm";
import { format } from "date-fns";

type ReportConfig = {
  title: string;
  filterFields: { key: string; label: string; type: "date" | "select" | "text"; options?: { value: string; label: string }[] }[];
  columns: { key: string; header: string; align?: "left" | "right" }[];
};

const VALID_REPORT_IDS = [
  "transaction-ledger",
  "revenue-summary",
  "member-balances",
  "subscription-status",
  "occupancy",
  "arrivals-departures",
  "booking-summary",
] as const;

type ReportId = typeof VALID_REPORT_IDS[number];

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; reportId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug, reportId } = await params;
  const sp = await searchParams;

  if (!VALID_REPORT_IDS.includes(reportId as ReportId)) {
    notFound();
  }

  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const session = await getSessionMember(org.id);
  if (!session || !isCommitteeOrAbove(session.role)) {
    redirect(`/${slug}/login`);
  }

  // Fetch org lodges and seasons for filter dropdowns
  const orgLodges = await db
    .select({ id: lodges.id, name: lodges.name })
    .from(lodges)
    .where(eq(lodges.organisationId, org.id));

  const orgSeasons = await db
    .select({ id: seasons.id, name: seasons.name })
    .from(seasons)
    .where(eq(seasons.organisationId, org.id));

  const param = (key: string) => (typeof sp[key] === "string" ? sp[key] : undefined);
  const page = param("page") ? parseInt(param("page")!, 10) : 1;

  let config: ReportConfig;
  let rows: Record<string, string | number>[] = [];
  let exportData: Record<string, string>[] = [];
  let exportColumns: { key: string; header: string }[] = [];
  let exportFilename = `${reportId}-${format(new Date(), "yyyy-MM-dd")}.csv`;

  switch (reportId as ReportId) {
    case "transaction-ledger": {
      config = {
        title: "Transaction Ledger",
        filterFields: [
          { key: "dateFrom", label: "From", type: "date" },
          { key: "dateTo", label: "To", type: "date" },
          { key: "type", label: "Type", type: "select", options: [
            { value: "PAYMENT", label: "Payment" },
            { value: "REFUND", label: "Refund" },
            { value: "CREDIT", label: "Credit" },
            { value: "SUBSCRIPTION", label: "Subscription" },
            { value: "INVOICE", label: "Invoice" },
            { value: "ADJUSTMENT", label: "Adjustment" },
          ]},
        ],
        columns: [
          { key: "date", header: "Date" },
          { key: "member", header: "Member" },
          { key: "type", header: "Type" },
          { key: "description", header: "Description" },
          { key: "amount", header: "Amount", align: "right" },
          { key: "stripeRef", header: "Stripe Ref" },
        ],
      };
      const result = await getTransactionLedger({
        organisationId: org.id,
        dateFrom: param("dateFrom"),
        dateTo: param("dateTo"),
        type: param("type"),
        page,
      });
      rows = result.rows.map((r) => ({
        date: formatOrgDate(r.date, "dd/MM/yyyy", org.timezone ?? undefined),
        member: `${r.memberFirstName} ${r.memberLastName}`,
        type: r.type,
        description: r.description,
        amount: formatCurrency(r.amountCents),
        stripeRef: r.stripeRef ?? "",
      }));
      const xeroData = formatLedgerForXero(result.rows);
      exportData = xeroData;
      exportColumns = XERO_COLUMN_MAP;
      exportFilename = `xero-transactions-${format(new Date(), "yyyy-MM-dd")}.csv`;
      break;
    }

    case "revenue-summary": {
      config = {
        title: "Revenue Summary",
        filterFields: [
          { key: "dateFrom", label: "From", type: "date" },
          { key: "dateTo", label: "To", type: "date" },
          { key: "granularity", label: "Period", type: "select", options: [
            { value: "monthly", label: "Monthly" },
            { value: "quarterly", label: "Quarterly" },
            { value: "annual", label: "Annual" },
          ]},
        ],
        columns: [
          { key: "period", header: "Period" },
          { key: "bookingRevenue", header: "Booking Revenue", align: "right" },
          { key: "subscriptionRevenue", header: "Subscription Revenue", align: "right" },
          { key: "refunds", header: "Refunds", align: "right" },
          { key: "netRevenue", header: "Net Revenue", align: "right" },
          { key: "platformFees", header: "Platform Fees", align: "right" },
        ],
      };
      const now = new Date();
      const result = await getRevenueSummary({
        organisationId: org.id,
        dateFrom: param("dateFrom") ?? `${now.getFullYear()}-01-01`,
        dateTo: param("dateTo") ?? format(now, "yyyy-MM-dd"),
        granularity: (param("granularity") as "monthly" | "quarterly" | "annual") ?? "monthly",
      });
      rows = result.rows.map((r) => ({
        period: r.period,
        bookingRevenue: formatCurrency(r.bookingRevenueCents),
        subscriptionRevenue: formatCurrency(r.subscriptionRevenueCents),
        refunds: formatCurrency(r.refundsCents),
        netRevenue: formatCurrency(r.netRevenueCents),
        platformFees: formatCurrency(r.platformFeesCents),
      }));
      exportData = result.rows.map((r) => ({
        period: r.period,
        bookingRevenue: (r.bookingRevenueCents / 100).toFixed(2),
        subscriptionRevenue: (r.subscriptionRevenueCents / 100).toFixed(2),
        refunds: (r.refundsCents / 100).toFixed(2),
        netRevenue: (r.netRevenueCents / 100).toFixed(2),
        platformFees: (r.platformFeesCents / 100).toFixed(2),
      }));
      exportColumns = config.columns.map((c) => ({ key: c.key, header: c.header }));
      break;
    }

    case "member-balances": {
      config = {
        title: "Member Balances",
        filterFields: [
          { key: "isFinancial", label: "Financial Status", type: "select", options: [
            { value: "true", label: "Financial" },
            { value: "false", label: "Non-Financial" },
          ]},
          { key: "hasOutstandingBalance", label: "Outstanding", type: "select", options: [
            { value: "true", label: "Has Balance" },
          ]},
        ],
        columns: [
          { key: "member", header: "Member" },
          { key: "class", header: "Class" },
          { key: "financial", header: "Financial" },
          { key: "totalPaid", header: "Total Paid", align: "right" },
          { key: "totalRefunded", header: "Total Refunded", align: "right" },
          { key: "outstanding", header: "Outstanding", align: "right" },
        ],
      };
      const result = await getMemberBalances({
        organisationId: org.id,
        isFinancial: param("isFinancial") !== undefined ? param("isFinancial") === "true" : undefined,
        hasOutstandingBalance: param("hasOutstandingBalance") === "true",
        page,
      });
      rows = result.rows.map((r) => ({
        member: `${r.firstName} ${r.lastName}`,
        class: r.membershipClassName ?? "—",
        financial: r.isFinancial ? "Yes" : "No",
        totalPaid: formatCurrency(r.totalPaidCents),
        totalRefunded: formatCurrency(r.totalRefundedCents),
        outstanding: formatCurrency(r.outstandingBalanceCents),
      }));
      exportData = result.rows.map((r) => ({
        member: `${r.firstName} ${r.lastName}`,
        class: r.membershipClassName ?? "",
        financial: r.isFinancial ? "Yes" : "No",
        totalPaid: (r.totalPaidCents / 100).toFixed(2),
        totalRefunded: (r.totalRefundedCents / 100).toFixed(2),
        outstanding: (r.outstandingBalanceCents / 100).toFixed(2),
      }));
      exportColumns = config.columns.map((c) => ({ key: c.key, header: c.header }));
      break;
    }

    case "subscription-status": {
      config = {
        title: "Subscription Status",
        filterFields: [
          { key: "seasonId", label: "Season", type: "select", options: orgSeasons.map((s) => ({ value: s.id, label: s.name })) },
          { key: "status", label: "Status", type: "select", options: [
            { value: "PAID", label: "Paid" },
            { value: "UNPAID", label: "Unpaid" },
            { value: "WAIVED", label: "Waived" },
          ]},
        ],
        columns: [
          { key: "member", header: "Member" },
          { key: "class", header: "Class" },
          { key: "season", header: "Season" },
          { key: "amount", header: "Amount", align: "right" },
          { key: "dueDate", header: "Due Date" },
          { key: "status", header: "Status" },
          { key: "paidAt", header: "Paid Date" },
        ],
      };
      const result = await getSubscriptionStatus({
        organisationId: org.id,
        seasonId: param("seasonId"),
        status: param("status") as "PAID" | "UNPAID" | "WAIVED" | undefined,
        page,
      });
      rows = result.rows.map((r) => ({
        member: `${r.memberFirstName} ${r.memberLastName}`,
        class: r.membershipClassName ?? "—",
        season: r.seasonName,
        amount: formatCurrency(r.amountCents),
        dueDate: r.dueDate,
        status: r.status,
        paidAt: r.paidAt ? formatOrgDate(r.paidAt, "dd/MM/yyyy", org.timezone ?? undefined) : "—",
      }));
      exportData = result.rows.map((r) => ({
        member: `${r.memberFirstName} ${r.memberLastName}`,
        class: r.membershipClassName ?? "",
        season: r.seasonName,
        amount: (r.amountCents / 100).toFixed(2),
        dueDate: r.dueDate,
        status: r.status,
        paidAt: r.paidAt ? formatOrgDate(r.paidAt, "dd/MM/yyyy", org.timezone ?? undefined) : "",
      }));
      exportColumns = config.columns.map((c) => ({ key: c.key, header: c.header }));
      break;
    }

    case "occupancy": {
      config = {
        title: "Occupancy Report",
        filterFields: [
          { key: "dateFrom", label: "From", type: "date" },
          { key: "dateTo", label: "To", type: "date" },
          { key: "lodgeId", label: "Lodge", type: "select", options: orgLodges.map((l) => ({ value: l.id, label: l.name })) },
        ],
        columns: [
          { key: "date", header: "Date" },
          { key: "lodge", header: "Lodge" },
          { key: "totalBeds", header: "Total Beds", align: "right" },
          { key: "bookedBeds", header: "Booked", align: "right" },
          { key: "availableBeds", header: "Available", align: "right" },
          { key: "occupancy", header: "Occupancy %", align: "right" },
        ],
      };
      const now = new Date();
      const result = await getOccupancyReport({
        organisationId: org.id,
        dateFrom: param("dateFrom") ?? format(now, "yyyy-MM-dd"),
        dateTo: param("dateTo") ?? format(new Date(now.getTime() + 30 * 86400000), "yyyy-MM-dd"),
        lodgeId: param("lodgeId"),
        page,
      });
      rows = result.rows.map((r) => ({
        date: r.date,
        lodge: r.lodgeName,
        totalBeds: r.totalBeds,
        bookedBeds: r.bookedBeds,
        availableBeds: r.availableBeds,
        occupancy: `${r.occupancyPercent}%`,
      }));
      exportData = result.rows.map((r) => ({
        date: r.date,
        lodge: r.lodgeName,
        totalBeds: String(r.totalBeds),
        bookedBeds: String(r.bookedBeds),
        availableBeds: String(r.availableBeds),
        occupancy: String(r.occupancyPercent),
      }));
      exportColumns = config.columns.map((c) => ({ key: c.key, header: c.header }));
      break;
    }

    case "arrivals-departures": {
      config = {
        title: "Arrivals & Departures",
        filterFields: [
          { key: "dateFrom", label: "From", type: "date" },
          { key: "dateTo", label: "To", type: "date" },
          { key: "lodgeId", label: "Lodge", type: "select", options: orgLodges.map((l) => ({ value: l.id, label: l.name })) },
        ],
        columns: [
          { key: "date", header: "Date" },
          { key: "type", header: "Type" },
          { key: "reference", header: "Reference" },
          { key: "member", header: "Member" },
          { key: "lodge", header: "Lodge" },
          { key: "checkIn", header: "Check-in" },
          { key: "checkOut", header: "Check-out" },
          { key: "payment", header: "Payment" },
        ],
      };
      const now = new Date();
      const result = await getArrivalsAndDepartures({
        organisationId: org.id,
        dateFrom: param("dateFrom") ?? format(now, "yyyy-MM-dd"),
        dateTo: param("dateTo") ?? format(now, "yyyy-MM-dd"),
        lodgeId: param("lodgeId"),
        page,
      });
      rows = result.rows.map((r) => ({
        date: r.date,
        type: r.type === "arrival" ? "Arrival" : "Departure",
        reference: r.bookingReference,
        member: `${r.memberFirstName} ${r.memberLastName}`,
        lodge: r.lodgeName,
        checkIn: r.checkInDate,
        checkOut: r.checkOutDate,
        payment: r.paymentStatus === "paid" ? "Paid" : "Unpaid",
      }));
      exportData = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])));
      exportColumns = config.columns.map((c) => ({ key: c.key, header: c.header }));
      break;
    }

    case "booking-summary": {
      config = {
        title: "Booking Summary",
        filterFields: [
          { key: "dateFrom", label: "From", type: "date" },
          { key: "dateTo", label: "To", type: "date" },
          { key: "status", label: "Status", type: "select", options: [
            { value: "PENDING", label: "Pending" },
            { value: "CONFIRMED", label: "Confirmed" },
            { value: "CANCELLED", label: "Cancelled" },
            { value: "COMPLETED", label: "Completed" },
          ]},
          { key: "lodgeId", label: "Lodge", type: "select", options: orgLodges.map((l) => ({ value: l.id, label: l.name })) },
        ],
        columns: [
          { key: "reference", header: "Reference" },
          { key: "member", header: "Member" },
          { key: "lodge", header: "Lodge" },
          { key: "dates", header: "Dates" },
          { key: "nights", header: "Nights", align: "right" },
          { key: "guests", header: "Guests", align: "right" },
          { key: "amount", header: "Amount", align: "right" },
          { key: "status", header: "Status" },
        ],
      };
      const result = await getBookingSummary({
        organisationId: org.id,
        dateFrom: param("dateFrom"),
        dateTo: param("dateTo"),
        status: param("status"),
        lodgeId: param("lodgeId"),
        page,
      });
      rows = result.rows.map((r) => ({
        reference: r.bookingReference,
        member: `${r.memberFirstName} ${r.memberLastName}`,
        lodge: r.lodgeName,
        dates: `${r.checkInDate} — ${r.checkOutDate}`,
        nights: r.totalNights,
        guests: r.guestCount,
        amount: formatCurrency(r.totalAmountCents),
        status: r.status,
      }));
      exportData = result.rows.map((r) => ({
        reference: r.bookingReference,
        member: `${r.memberFirstName} ${r.memberLastName}`,
        lodge: r.lodgeName,
        dates: `${r.checkInDate} - ${r.checkOutDate}`,
        nights: String(r.totalNights),
        guests: String(r.guestCount),
        amount: (r.totalAmountCents / 100).toFixed(2),
        status: r.status,
      }));
      exportColumns = config.columns.map((c) => ({ key: c.key, header: c.header }));
      break;
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-1">
        <Link href={`/${slug}/admin/reports`} className="text-sm text-muted-foreground hover:text-foreground">
          Reports
        </Link>
        <span className="text-sm text-muted-foreground">/</span>
      </div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{config.title}</h1>
        <ExportButton data={exportData} columns={exportColumns} filename={exportFilename} />
      </div>

      <ReportFilters
        fields={config.filterFields}
        basePath={`/${slug}/admin/reports/${reportId}`}
      />

      <ReportTable columns={config.columns} rows={rows} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\[slug\]/admin/reports/\[reportId\]/
git commit -m "feat(phase-12): add report detail page with filters, table, and CSV export"
```

---

## Task 16: Update README with Phase 12

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README planned/completed phases table**

Move Phase 12 from "Planned" to "Completed" in `README.md`. Find the line:

```
| 12 | Treasurer Reporting — revenue, occupancy, ledger, CSV exports |
```

Remove it from the Planned table and add to the Completed table:

```
| 12 | Treasurer Reporting | Role dashboards (treasurer/officer/committee), 7 reports, CSV export (Xero-compatible) |
```

Update the Planned table to show phases 13-20 from the new roadmap.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README with Phase 12 completion and revised roadmap"
```

---

## Task 17: E2E Tests — Admin Dashboard

**Files:**
- Create: `e2e/tests/admin-dashboard.spec.ts`

- [ ] **Step 1: Write the E2E spec**

Create `e2e/tests/admin-dashboard.spec.ts`:

```typescript
import { test, expect } from "../fixtures/auth";

test.describe("Admin dashboard", () => {
  test("admin sees all three tabs", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/dashboard");
    await expect(adminPage.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(adminPage.getByRole("tab", { name: "Treasurer" })).toBeVisible();
    await expect(adminPage.getByRole("tab", { name: "Bookings" })).toBeVisible();
    await expect(adminPage.getByRole("tab", { name: "Committee" })).toBeVisible();
  });

  test("treasurer tab shows revenue cards", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/dashboard");
    await adminPage.getByRole("tab", { name: "Treasurer" }).click();
    await expect(adminPage.getByText("Revenue (MTD)")).toBeVisible();
    await expect(adminPage.getByText("Revenue (YTD)")).toBeVisible();
    await expect(adminPage.getByText("Outstanding Balances")).toBeVisible();
    await expect(adminPage.getByText("Platform Fees (YTD)")).toBeVisible();
  });

  test("treasurer tab shows monthly revenue chart", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/dashboard");
    await adminPage.getByRole("tab", { name: "Treasurer" }).click();
    await expect(adminPage.getByText("Monthly Revenue")).toBeVisible();
  });

  test("bookings tab shows operational cards", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/dashboard");
    await adminPage.getByRole("tab", { name: "Bookings" }).click();
    await expect(adminPage.getByText("Arrivals Today")).toBeVisible();
    await expect(adminPage.getByText("Departures Today")).toBeVisible();
    await expect(adminPage.getByText("Current Occupancy")).toBeVisible();
    await expect(adminPage.getByText("Pending Approvals")).toBeVisible();
  });

  test("bookings tab shows occupancy forecast", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/dashboard");
    await adminPage.getByRole("tab", { name: "Bookings" }).click();
    await expect(adminPage.getByText("Occupancy Forecast")).toBeVisible();
  });

  test("committee tab shows KPI cards", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/dashboard");
    await adminPage.getByRole("tab", { name: "Committee" }).click();
    await expect(adminPage.getByText("Active Members")).toBeVisible();
    await expect(adminPage.getByText("Season Occupancy")).toBeVisible();
    await expect(adminPage.getByText("Financial Members")).toBeVisible();
  });

  test("committee tab shows membership breakdown", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/dashboard");
    await adminPage.getByRole("tab", { name: "Committee" }).click();
    await expect(adminPage.getByText("Membership Breakdown")).toBeVisible();
  });

  test("officer only sees bookings tab", async ({ officerPage }) => {
    await officerPage.goto("/polski/admin/dashboard");
    await expect(officerPage.getByRole("tab", { name: "Bookings" })).toBeVisible();
    await expect(officerPage.getByRole("tab", { name: "Treasurer" })).not.toBeVisible();
    await expect(officerPage.getByRole("tab", { name: "Committee" })).not.toBeVisible();
  });
});
```

- [ ] **Step 2: Run locally to verify**

```bash
cd /opt/snowgum && npx playwright test e2e/tests/admin-dashboard.spec.ts --config e2e/playwright.config.ts
```

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/admin-dashboard.spec.ts
git commit -m "test(phase-12): add E2E tests for admin dashboard tabs"
```

---

## Task 18: E2E Tests — Admin Reports

**Files:**
- Create: `e2e/tests/admin-reports.spec.ts`

- [ ] **Step 1: Write the E2E spec**

Create `e2e/tests/admin-reports.spec.ts`:

```typescript
import { test, expect } from "../fixtures/auth";

test.describe("Admin reports", () => {
  test("reports page shows 7 report cards", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/reports");
    await expect(adminPage.getByRole("heading", { name: "Reports" })).toBeVisible();
    await expect(adminPage.getByText("Transaction Ledger")).toBeVisible();
    await expect(adminPage.getByText("Revenue Summary")).toBeVisible();
    await expect(adminPage.getByText("Member Balances")).toBeVisible();
    await expect(adminPage.getByText("Subscription Status")).toBeVisible();
    await expect(adminPage.getByText("Occupancy Report")).toBeVisible();
    await expect(adminPage.getByText("Arrivals & Departures")).toBeVisible();
    await expect(adminPage.getByText("Booking Summary")).toBeVisible();
  });

  test("transaction ledger loads with filters", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/reports/transaction-ledger");
    await expect(adminPage.getByRole("heading", { name: "Transaction Ledger" })).toBeVisible();
    await expect(adminPage.getByText("From")).toBeVisible();
    await expect(adminPage.getByText("Export CSV")).toBeVisible();
  });

  test("member balances can filter by financial status", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/reports/member-balances");
    await expect(adminPage.getByRole("heading", { name: "Member Balances" })).toBeVisible();
    await expect(adminPage.getByText("Financial Status")).toBeVisible();
  });

  test("CSV export button triggers download", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/reports/transaction-ledger");

    const downloadPromise = adminPage.waitForEvent("download");
    await adminPage.getByRole("button", { name: "Export CSV" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain("xero-transactions");
    expect(download.suggestedFilename()).toContain(".csv");
  });

  test("subscription status can filter by season", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/reports/subscription-status");
    await expect(adminPage.getByText("Season")).toBeVisible();
  });

  test("occupancy report can filter by lodge", async ({ adminPage }) => {
    await adminPage.goto("/polski/admin/reports/occupancy");
    await expect(adminPage.getByText("Lodge")).toBeVisible();
  });

  test("empty report shows no data message", async ({ adminPage }) => {
    // Use a date range with no data
    await adminPage.goto("/polski/admin/reports/arrivals-departures?dateFrom=2000-01-01&dateTo=2000-01-02");
    await expect(adminPage.getByText("No data found")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run locally to verify**

```bash
cd /opt/snowgum && npx playwright test e2e/tests/admin-reports.spec.ts --config e2e/playwright.config.ts
```

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/admin-reports.spec.ts
git commit -m "test(phase-12): add E2E tests for admin reports"
```

---

## Task 19: Final Quality Check

- [ ] **Step 1: Run all unit tests**

```bash
cd /opt/snowgum && npm test
```

Expected: All tests pass (353+ existing + ~20 new)

- [ ] **Step 2: Run lint**

```bash
cd /opt/snowgum && npm run lint
```

Expected: No errors

- [ ] **Step 3: Run build**

```bash
cd /opt/snowgum && npm run build
```

Expected: Build succeeds with no type errors

- [ ] **Step 4: Run full quality check**

```bash
cd /opt/snowgum && npm run check
```

Expected: All checks pass (lint + test + build)

- [ ] **Step 5: Fix any issues and commit**

If any issues found, fix them and commit:

```bash
git add -A
git commit -m "fix(phase-12): resolve lint/type/test issues"
```
