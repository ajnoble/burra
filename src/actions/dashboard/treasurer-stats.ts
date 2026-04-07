"use server";

import { db } from "@/db/index";
import { transactions, subscriptions } from "@/db/schema";
import { and, eq, gte, lte, sql, inArray } from "drizzle-orm";
import { startOfMonth, endOfMonth, subYears } from "date-fns";

export type MonthlyRevenue = {
  month: string; // YYYY-MM
  bookingCents: number;
  subscriptionCents: number;
  refundCents: number;
};

export type TreasurerStatsResult = {
  revenueMtdCents: number;
  revenueYtdCents: number;
  revenuePriorYtdCents: number;
  outstandingBalanceCents: number;
  platformFeesYtdCents: number;
  monthlyRevenue: MonthlyRevenue[];
};

type TreasurerStatsInput = {
  organisationId: string;
  financialYearStart: string; // YYYY-MM-DD
  financialYearEnd: string; // YYYY-MM-DD
};

const REVENUE_TYPES = ["PAYMENT", "SUBSCRIPTION"] as const;
const REFUND_TYPES = ["REFUND"] as const;
const ALL_RELEVANT_TYPES = [...REVENUE_TYPES, ...REFUND_TYPES];

async function fetchAggregate(
  organisationId: string,
  fromDate: Date,
  toDate: Date
): Promise<{
  totalRevenueCents: number;
  totalRefundCents: number;
  totalPlatformFeesCents: number;
}> {
  const rows = await db
    .select({
      totalRevenueCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} IN ('PAYMENT', 'SUBSCRIPTION') THEN ${transactions.amountCents} ELSE 0 END), 0)`,
      totalRefundCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'REFUND' THEN ABS(${transactions.amountCents}) ELSE 0 END), 0)`,
      totalPlatformFeesCents: sql<number>`COALESCE(SUM(${transactions.platformFeeCents}), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.organisationId, organisationId),
        gte(transactions.createdAt, fromDate),
        lte(transactions.createdAt, toDate),
        inArray(transactions.type, ALL_RELEVANT_TYPES)
      )
    );

  const row = rows[0];
  return {
    totalRevenueCents: Number(row?.totalRevenueCents ?? 0),
    totalRefundCents: Number(row?.totalRefundCents ?? 0),
    totalPlatformFeesCents: Number(row?.totalPlatformFeesCents ?? 0),
  };
}

export async function getTreasurerStats(
  input: TreasurerStatsInput
): Promise<TreasurerStatsResult> {
  const { organisationId, financialYearStart, financialYearEnd } = input;

  const fyStart = new Date(financialYearStart);
  const fyEnd = new Date(financialYearEnd);

  // Current month range
  const now = new Date();
  const mtdStart = startOfMonth(now);
  const mtdEnd = endOfMonth(now);

  // Prior year range (same FY dates, minus 1 year)
  const priorFyStart = subYears(fyStart, 1);
  const priorFyEnd = subYears(fyEnd, 1);

  // 1. YTD aggregate
  const ytd = await fetchAggregate(organisationId, fyStart, fyEnd);

  // 2. MTD aggregate
  const mtd = await fetchAggregate(organisationId, mtdStart, mtdEnd);

  // 3. Prior year YTD aggregate
  const priorYtd = await fetchAggregate(organisationId, priorFyStart, priorFyEnd);

  // 4. Outstanding subscriptions
  const outstandingRows = await db
    .select({
      totalOutstandingCents: sql<number>`COALESCE(SUM(${subscriptions.amountCents}), 0)`,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organisationId, organisationId),
        eq(subscriptions.status, "UNPAID")
      )
    );

  const outstandingBalanceCents = Number(
    outstandingRows[0]?.totalOutstandingCents ?? 0
  );

  // 5. Monthly breakdown (GROUP BY month and type)
  const monthlyRows = await db
    .select({
      month: sql<string>`TO_CHAR(${transactions.createdAt}, 'YYYY-MM')`,
      type: transactions.type,
      totalCents: sql<number>`COALESCE(SUM(ABS(${transactions.amountCents})), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.organisationId, organisationId),
        gte(transactions.createdAt, fyStart),
        lte(transactions.createdAt, fyEnd),
        inArray(transactions.type, ALL_RELEVANT_TYPES)
      )
    )
    .groupBy(
      sql`TO_CHAR(${transactions.createdAt}, 'YYYY-MM')`,
      transactions.type
    );

  // Group monthly rows into MonthlyRevenue[]
  const monthMap = new Map<string, MonthlyRevenue>();

  for (const row of monthlyRows as Array<{
    month: string;
    type: string;
    totalCents: number;
  }>) {
    const { month, type, totalCents } = row;
    if (!monthMap.has(month)) {
      monthMap.set(month, {
        month,
        bookingCents: 0,
        subscriptionCents: 0,
        refundCents: 0,
      });
    }
    const entry = monthMap.get(month)!;
    const cents = Number(totalCents);
    if (type === "PAYMENT") {
      entry.bookingCents += cents;
    } else if (type === "SUBSCRIPTION") {
      entry.subscriptionCents += cents;
    } else if (type === "REFUND") {
      entry.refundCents += cents;
    }
  }

  const monthlyRevenue = Array.from(monthMap.values()).sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  return {
    revenueYtdCents: ytd.totalRevenueCents - ytd.totalRefundCents,
    revenueMtdCents: mtd.totalRevenueCents - mtd.totalRefundCents,
    revenuePriorYtdCents: priorYtd.totalRevenueCents - priorYtd.totalRefundCents,
    outstandingBalanceCents,
    platformFeesYtdCents: ytd.totalPlatformFeesCents,
    monthlyRevenue,
  };
}
