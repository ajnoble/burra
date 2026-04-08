"use server";

import { db } from "@/db/index";
import { transactions } from "@/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";

export type GstSummaryFilters = {
  organisationId: string;
  dateFrom: string;
  dateTo: string;
  granularity: "monthly" | "quarterly";
};

export type GstSummaryRow = {
  period: string;
  bookingGstCents: number;
  subscriptionGstCents: number;
  chargeGstCents: number;
  totalGstCents: number;
};

export type GstSummaryResult = {
  rows: GstSummaryRow[];
  totalGstCollectedCents: number;
};

const GRANULARITY_MAP = {
  monthly: { truncUnit: "month", toCharFormat: "YYYY-MM" },
  quarterly: { truncUnit: "quarter", toCharFormat: 'YYYY-"Q"Q' },
} as const;

export async function getGstSummary(
  filters: GstSummaryFilters
): Promise<GstSummaryResult> {
  const { organisationId, dateFrom, dateTo, granularity } = filters;
  const { truncUnit, toCharFormat } = GRANULARITY_MAP[granularity];

  const fromDate = new Date(dateFrom);
  const toDate = new Date(dateTo);

  const periodExpr = sql<string>`TO_CHAR(DATE_TRUNC(${truncUnit}, ${transactions.createdAt}), ${toCharFormat})`;

  const dbRows = await db
    .select({
      period: periodExpr,
      bookingGstCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'PAYMENT' THEN ${transactions.gstAmountCents} ELSE 0 END), 0)`,
      subscriptionGstCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'SUBSCRIPTION' THEN ${transactions.gstAmountCents} ELSE 0 END), 0)`,
      chargeGstCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} NOT IN ('PAYMENT', 'SUBSCRIPTION', 'REFUND', 'INVOICE') THEN ${transactions.gstAmountCents} ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.organisationId, organisationId),
        gte(transactions.createdAt, fromDate),
        lte(transactions.createdAt, toDate)
      )
    )
    .groupBy(periodExpr)
    .orderBy(periodExpr);

  const rows: GstSummaryRow[] = (
    dbRows as Array<{
      period: string;
      bookingGstCents: number;
      subscriptionGstCents: number;
      chargeGstCents: number;
    }>
  ).map((row) => {
    const bookingGstCents = Number(row.bookingGstCents);
    const subscriptionGstCents = Number(row.subscriptionGstCents);
    const chargeGstCents = Number(row.chargeGstCents);
    return {
      period: row.period,
      bookingGstCents,
      subscriptionGstCents,
      chargeGstCents,
      totalGstCents: bookingGstCents + subscriptionGstCents + chargeGstCents,
    };
  });

  const totalGstCollectedCents = rows.reduce(
    (sum, row) => sum + row.totalGstCents,
    0
  );

  return { rows, totalGstCollectedCents };
}
