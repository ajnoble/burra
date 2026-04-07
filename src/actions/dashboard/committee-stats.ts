"use server";

import { db } from "@/db/index";
import {
  members,
  membershipClasses,
  organisationMembers,
  transactions,
  availabilityCache,
} from "@/db/schema";
import { and, eq, gte, lte, inArray, sql } from "drizzle-orm";
import { subYears } from "date-fns";

export type MemberClassBreakdown = {
  className: string;
  count: number;
  financialCount: number;
};

export type MonthlyOccupancy = {
  month: string;
  averagePercent: number;
};

export type CommitteeStatsResult = {
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

type CommitteeStatsInput = {
  organisationId: string;
  financialYearStart: string; // YYYY-MM-DD
  financialYearEnd: string; // YYYY-MM-DD
};

const REVENUE_TYPES = ["PAYMENT", "SUBSCRIPTION"] as const;
const REFUND_TYPES = ["REFUND"] as const;
const ALL_RELEVANT_TYPES = [...REVENUE_TYPES, ...REFUND_TYPES];

export async function getCommitteeStats(
  input: CommitteeStatsInput
): Promise<CommitteeStatsResult> {
  const { organisationId, financialYearStart, financialYearEnd } = input;

  const fyStart = new Date(financialYearStart);
  const fyEnd = new Date(financialYearEnd);

  const priorFyStart = subYears(fyStart, 1);
  const priorFyEnd = subYears(fyEnd, 1);

  // 1. Total active members from organisationMembers
  const activeMembersRows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(organisationMembers)
    .where(
      and(
        eq(organisationMembers.organisationId, organisationId),
        eq(organisationMembers.isActive, true)
      )
    );
  const totalActiveMembers = Number(activeMembersRows[0]?.count ?? 0);

  // 2. Financial / non-financial member counts
  const financialRows = await db
    .select({
      financialCount: sql<number>`COALESCE(SUM(CASE WHEN ${members.isFinancial} = true THEN 1 ELSE 0 END), 0)`,
      nonFinancialCount: sql<number>`COALESCE(SUM(CASE WHEN ${members.isFinancial} = false THEN 1 ELSE 0 END), 0)`,
    })
    .from(members)
    .where(eq(members.organisationId, organisationId));

  const financialMemberCount = Number(financialRows[0]?.financialCount ?? 0);
  const nonFinancialMemberCount = Number(
    financialRows[0]?.nonFinancialCount ?? 0
  );

  // 3. Prior year member count: members who joined on or before prior FY end
  const priorYearMembersRows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(members)
    .where(
      and(
        eq(members.organisationId, organisationId),
        lte(members.joinedAt, priorFyEnd)
      )
    );
  const totalActiveMembersPriorYear = Number(
    priorYearMembersRows[0]?.count ?? 0
  );

  // 4. Members by class: GROUP BY membershipClasses.name
  const membersByClassRows = await db
    .select({
      className: membershipClasses.name,
      count: sql<number>`COUNT(${members.id})`,
      financialCount: sql<number>`COALESCE(SUM(CASE WHEN ${members.isFinancial} = true THEN 1 ELSE 0 END), 0)`,
    })
    .from(members)
    .innerJoin(
      membershipClasses,
      eq(members.membershipClassId, membershipClasses.id)
    )
    .where(eq(members.organisationId, organisationId))
    .groupBy(membershipClasses.name);

  const membersByClass: MemberClassBreakdown[] = (
    membersByClassRows as Array<{
      className: string;
      count: number;
      financialCount: number;
    }>
  ).map((row) => ({
    className: row.className,
    count: Number(row.count),
    financialCount: Number(row.financialCount),
  }));

  // 5. YTD revenue
  const ytdRows = await db
    .select({
      totalRevenueCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} IN ('PAYMENT', 'SUBSCRIPTION') THEN ${transactions.amountCents} ELSE 0 END), 0)`,
      totalRefundCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'REFUND' THEN ABS(${transactions.amountCents}) ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.organisationId, organisationId),
        gte(transactions.createdAt, fyStart),
        lte(transactions.createdAt, fyEnd),
        inArray(transactions.type, ALL_RELEVANT_TYPES)
      )
    );
  const revenueYtdCents =
    Number(ytdRows[0]?.totalRevenueCents ?? 0) -
    Number(ytdRows[0]?.totalRefundCents ?? 0);

  // 6. Prior year revenue
  const priorYtdRows = await db
    .select({
      totalRevenueCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} IN ('PAYMENT', 'SUBSCRIPTION') THEN ${transactions.amountCents} ELSE 0 END), 0)`,
      totalRefundCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'REFUND' THEN ABS(${transactions.amountCents}) ELSE 0 END), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.organisationId, organisationId),
        gte(transactions.createdAt, priorFyStart),
        lte(transactions.createdAt, priorFyEnd),
        inArray(transactions.type, ALL_RELEVANT_TYPES)
      )
    );
  const revenuePriorYtdCents =
    Number(priorYtdRows[0]?.totalRevenueCents ?? 0) -
    Number(priorYtdRows[0]?.totalRefundCents ?? 0);

  // 7. Season occupancy: AVG((bookedBeds / totalBeds) * 100) over FY date range
  const seasonOccupancyRows = await db
    .select({
      averagePercent: sql<string | null>`AVG(CASE WHEN ${availabilityCache.totalBeds} > 0 THEN (${availabilityCache.bookedBeds}::numeric / ${availabilityCache.totalBeds}::numeric) * 100 ELSE NULL END)`,
    })
    .from(availabilityCache)
    .where(
      and(
        gte(availabilityCache.date, financialYearStart),
        lte(availabilityCache.date, financialYearEnd)
      )
    );
  const rawSeasonPercent = seasonOccupancyRows[0]?.averagePercent;
  const occupancySeasonPercent =
    rawSeasonPercent != null ? Math.round(Number(rawSeasonPercent) * 10) / 10 : 0;

  // 8. Monthly occupancy: GROUP BY TO_CHAR(date, 'YYYY-MM')
  const monthlyOccupancyRows = await db
    .select({
      month: sql<string>`TO_CHAR(${availabilityCache.date}, 'YYYY-MM')`,
      averagePercent: sql<string>`AVG(CASE WHEN ${availabilityCache.totalBeds} > 0 THEN (${availabilityCache.bookedBeds}::numeric / ${availabilityCache.totalBeds}::numeric) * 100 ELSE NULL END)`,
    })
    .from(availabilityCache)
    .where(
      and(
        gte(availabilityCache.date, financialYearStart),
        lte(availabilityCache.date, financialYearEnd)
      )
    )
    .groupBy(sql`TO_CHAR(${availabilityCache.date}, 'YYYY-MM')`);

  const monthlyOccupancy: MonthlyOccupancy[] = (
    monthlyOccupancyRows as Array<{ month: string; averagePercent: string }>
  ).map((row) => ({
    month: row.month,
    averagePercent: Math.round(Number(row.averagePercent) * 10) / 10,
  }));

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
