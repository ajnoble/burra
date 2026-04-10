"use server";

import { db } from "@/db/index";
import { transactions, bookings } from "@/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { requireSession, requireRole, authErrorToResult } from "@/lib/auth-guards";

export type RevenueSummaryFilters = {
  organisationId: string;
  dateFrom: string;
  dateTo: string;
  granularity: "monthly" | "quarterly" | "annual";
  lodgeId?: string;
};

export type RevenueSummaryRow = {
  period: string;
  bookingRevenueCents: number;
  subscriptionRevenueCents: number;
  refundsCents: number;
  netRevenueCents: number;
  gstCollectedCents: number;
  platformFeesCents: number;
};

export type RevenueSummaryResult = {
  rows: RevenueSummaryRow[];
  totalNetRevenueCents: number;
  totalGstCollectedCents: number;
  totalPlatformFeesCents: number;
};

const GRANULARITY_MAP = {
  monthly: { truncUnit: "month", toCharFormat: "YYYY-MM" },
  quarterly: { truncUnit: "quarter", toCharFormat: 'YYYY-"Q"Q' },
  annual: { truncUnit: "year", toCharFormat: "YYYY" },
} as const;

export async function getRevenueSummary(
  filters: RevenueSummaryFilters
): Promise<RevenueSummaryResult | { success: false; error: string }> {
  try {
  const session = await requireSession(filters.organisationId);
  requireRole(session, "COMMITTEE");

  const { organisationId, dateFrom, dateTo, granularity, lodgeId } = filters;

  const { truncUnit, toCharFormat } = GRANULARITY_MAP[granularity];

  const fromDate = new Date(dateFrom);
  const toDate = new Date(dateTo);

  const periodExpr = sql<string>`TO_CHAR(DATE_TRUNC(${sql.raw(`'${truncUnit}'`)}, ${transactions.createdAt}), ${sql.raw(`'${toCharFormat}'`)})`;

  const baseConditions = and(
    eq(transactions.organisationId, organisationId),
    gte(transactions.createdAt, fromDate),
    lte(transactions.createdAt, toDate)
  );

  let query;

  if (lodgeId) {
    query = db
      .select({
        period: periodExpr,
        bookingRevenueCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'PAYMENT' THEN ${transactions.amountCents} ELSE 0 END), 0)`,
        subscriptionRevenueCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'SUBSCRIPTION' THEN ${transactions.amountCents} ELSE 0 END), 0)`,
        refundsCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'REFUND' THEN ABS(${transactions.amountCents}) ELSE 0 END), 0)`,
        gstCollectedCents: sql<number>`COALESCE(SUM(${transactions.gstAmountCents}), 0)`,
        platformFeesCents: sql<number>`COALESCE(SUM(${transactions.platformFeeCents}), 0)`,
      })
      .from(transactions)
      .leftJoin(bookings, eq(transactions.bookingId, bookings.id))
      .where(and(baseConditions, eq(bookings.lodgeId, lodgeId)))
      .groupBy(periodExpr)
      .orderBy(periodExpr);
  } else {
    query = db
      .select({
        period: periodExpr,
        bookingRevenueCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'PAYMENT' THEN ${transactions.amountCents} ELSE 0 END), 0)`,
        subscriptionRevenueCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'SUBSCRIPTION' THEN ${transactions.amountCents} ELSE 0 END), 0)`,
        refundsCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'REFUND' THEN ABS(${transactions.amountCents}) ELSE 0 END), 0)`,
        gstCollectedCents: sql<number>`COALESCE(SUM(${transactions.gstAmountCents}), 0)`,
        platformFeesCents: sql<number>`COALESCE(SUM(${transactions.platformFeeCents}), 0)`,
      })
      .from(transactions)
      .where(baseConditions)
      .groupBy(periodExpr)
      .orderBy(periodExpr);
  }

  const dbRows = await query;

  const rows: RevenueSummaryRow[] = (
    dbRows as Array<{
      period: string;
      bookingRevenueCents: number;
      subscriptionRevenueCents: number;
      refundsCents: number;
      gstCollectedCents: number;
      platformFeesCents: number;
    }>
  ).map((row) => {
    const bookingRevenueCents = Number(row.bookingRevenueCents);
    const subscriptionRevenueCents = Number(row.subscriptionRevenueCents);
    const refundsCents = Number(row.refundsCents);
    const gstCollectedCents = Number(row.gstCollectedCents);
    const platformFeesCents = Number(row.platformFeesCents);
    const netRevenueCents =
      bookingRevenueCents + subscriptionRevenueCents - refundsCents;
    return {
      period: row.period,
      bookingRevenueCents,
      subscriptionRevenueCents,
      refundsCents,
      netRevenueCents,
      gstCollectedCents,
      platformFeesCents,
    };
  });

  const totalNetRevenueCents = rows.reduce(
    (sum, row) => sum + row.netRevenueCents,
    0
  );
  const totalGstCollectedCents = rows.reduce(
    (sum, row) => sum + row.gstCollectedCents,
    0
  );
  const totalPlatformFeesCents = rows.reduce(
    (sum, row) => sum + row.platformFeesCents,
    0
  );

  return { rows, totalNetRevenueCents, totalGstCollectedCents, totalPlatformFeesCents };
  } catch (e) {
    const authResult = authErrorToResult(e);
    if (authResult) return authResult;
    throw e;
  }
}
