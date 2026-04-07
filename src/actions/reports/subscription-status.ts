"use server";

import { db } from "@/db/index";
import { subscriptions, members, seasons, membershipClasses } from "@/db/schema";
import { and, eq, lte, sql } from "drizzle-orm";

export type SubscriptionStatusFilters = {
  organisationId: string;
  seasonId?: string;
  status?: "UNPAID" | "PAID" | "WAIVED";
  overdueOnly?: boolean;
  page?: number;
};

export type SubscriptionStatusRow = {
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

export type SubscriptionStatusResult = {
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

const PAGE_SIZE = 50;

export async function getSubscriptionStatus(
  filters: SubscriptionStatusFilters
): Promise<SubscriptionStatusResult> {
  const { organisationId, seasonId, status, overdueOnly, page = 1 } = filters;

  const conditions = [eq(subscriptions.organisationId, organisationId)];

  if (seasonId !== undefined) {
    conditions.push(eq(subscriptions.seasonId, seasonId));
  }

  if (status !== undefined) {
    conditions.push(eq(subscriptions.status, status));
  }

  if (overdueOnly) {
    // UNPAID and dueDate <= CURRENT_DATE
    conditions.push(eq(subscriptions.status, "UNPAID"));
    conditions.push(lte(subscriptions.dueDate, sql`CURRENT_DATE`));
  }

  const whereClause = and(...conditions);

  // Summary + total count query
  const [summaryRow] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      paidCount: sql<number>`COUNT(*) FILTER (WHERE ${subscriptions.status} = 'PAID')`,
      paidAmountCents: sql<number>`COALESCE(SUM(${subscriptions.amountCents}) FILTER (WHERE ${subscriptions.status} = 'PAID'), 0)`,
      unpaidCount: sql<number>`COUNT(*) FILTER (WHERE ${subscriptions.status} = 'UNPAID')`,
      unpaidAmountCents: sql<number>`COALESCE(SUM(${subscriptions.amountCents}) FILTER (WHERE ${subscriptions.status} = 'UNPAID'), 0)`,
      waivedCount: sql<number>`COUNT(*) FILTER (WHERE ${subscriptions.status} = 'WAIVED')`,
    })
    .from(subscriptions)
    .innerJoin(members, eq(members.id, subscriptions.memberId))
    .innerJoin(seasons, eq(seasons.id, subscriptions.seasonId))
    .leftJoin(membershipClasses, eq(membershipClasses.id, members.membershipClassId))
    .where(whereClause);

  const offset = (page - 1) * PAGE_SIZE;

  // Data rows query
  const rawRows = await db
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
    .where(whereClause)
    .orderBy(subscriptions.dueDate)
    .limit(PAGE_SIZE)
    .offset(offset);

  return {
    rows: rawRows as SubscriptionStatusRow[],
    total: Number(summaryRow?.total ?? 0),
    page,
    pageSize: PAGE_SIZE,
    summary: {
      paidCount: Number(summaryRow?.paidCount ?? 0),
      paidAmountCents: Number(summaryRow?.paidAmountCents ?? 0),
      unpaidCount: Number(summaryRow?.unpaidCount ?? 0),
      unpaidAmountCents: Number(summaryRow?.unpaidAmountCents ?? 0),
      waivedCount: Number(summaryRow?.waivedCount ?? 0),
    },
  };
}
