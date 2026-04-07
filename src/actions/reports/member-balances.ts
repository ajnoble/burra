"use server";

import { db } from "@/db/index";
import { members, membershipClasses, transactions, subscriptions, oneOffCharges } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

export type MemberBalancesFilters = {
  organisationId: string;
  membershipClassId?: string;
  isFinancial?: boolean;
  hasOutstandingBalance?: boolean;
  page?: number;
};

export type MemberBalanceRow = {
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

export type MemberBalancesResult = {
  rows: MemberBalanceRow[];
  total: number;
  page: number;
  pageSize: number;
};

const PAGE_SIZE = 50;

export async function getMemberBalances(
  filters: MemberBalancesFilters
): Promise<MemberBalancesResult> {
  const {
    organisationId,
    membershipClassId,
    isFinancial,
    hasOutstandingBalance,
    page = 1,
  } = filters;

  const conditions = [eq(members.organisationId, organisationId)];

  if (membershipClassId !== undefined) {
    conditions.push(eq(members.membershipClassId, membershipClassId));
  }

  if (isFinancial !== undefined) {
    conditions.push(eq(members.isFinancial, isFinancial));
  }

  const whereClause = and(...conditions);

  const rawRows = await db
    .select({
      memberId: members.id,
      firstName: members.firstName,
      lastName: members.lastName,
      membershipClassName: membershipClasses.name,
      isFinancial: members.isFinancial,
      subscriptionStatus: sql<string | null>`(
        SELECT ${subscriptions.status}
        FROM ${subscriptions}
        WHERE ${subscriptions.memberId} = ${members.id}
          AND ${subscriptions.organisationId} = ${members.organisationId}
        ORDER BY ${subscriptions.createdAt} DESC
        LIMIT 1
      )`,
      totalPaidCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'PAYMENT' THEN ${transactions.amountCents} ELSE 0 END), 0)`,
      totalRefundedCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'REFUND' THEN ABS(${transactions.amountCents}) ELSE 0 END), 0)`,
      totalInvoicedCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactions.type} = 'INVOICE' THEN ${transactions.amountCents} ELSE 0 END), 0)`,
      totalUnpaidChargesCents: sql<number>`COALESCE((
  SELECT SUM(${oneOffCharges.amountCents})
  FROM ${oneOffCharges}
  WHERE ${oneOffCharges.memberId} = ${members.id}
    AND ${oneOffCharges.organisationId} = ${members.organisationId}
    AND ${oneOffCharges.status} = 'UNPAID'
), 0)`,
    })
    .from(members)
    .leftJoin(membershipClasses, eq(membershipClasses.id, members.membershipClassId))
    .leftJoin(
      transactions,
      and(
        eq(transactions.memberId, members.id),
        eq(transactions.organisationId, members.organisationId)
      )
    )
    .where(whereClause)
    .groupBy(
      members.id,
      members.firstName,
      members.lastName,
      members.isFinancial,
      members.organisationId,
      membershipClasses.name
    );

  // Map rows and compute outstanding balance
  let mappedRows: MemberBalanceRow[] = (
    rawRows as Array<{
      memberId: string;
      firstName: string;
      lastName: string;
      membershipClassName: string | null;
      isFinancial: boolean;
      subscriptionStatus: string | null;
      totalPaidCents: number;
      totalRefundedCents: number;
      totalInvoicedCents: number;
      totalUnpaidChargesCents: number;
    }>
  ).map((row) => {
    const outstanding =
      Number(row.totalInvoicedCents) -
      Number(row.totalPaidCents) +
      Number(row.totalRefundedCents) +
      Number(row.totalUnpaidChargesCents);
    return {
      memberId: row.memberId,
      firstName: row.firstName,
      lastName: row.lastName,
      membershipClassName: row.membershipClassName,
      isFinancial: row.isFinancial,
      subscriptionStatus: row.subscriptionStatus,
      totalPaidCents: Number(row.totalPaidCents),
      totalRefundedCents: Number(row.totalRefundedCents),
      outstandingBalanceCents: Math.max(0, outstanding),
    };
  });

  // Post-filter by hasOutstandingBalance if set
  if (hasOutstandingBalance !== undefined) {
    mappedRows = mappedRows.filter((row) =>
      hasOutstandingBalance
        ? row.outstandingBalanceCents > 0
        : row.outstandingBalanceCents === 0
    );
  }

  const total = mappedRows.length;

  // Paginate
  const offset = (page - 1) * PAGE_SIZE;
  const paginatedRows = mappedRows.slice(offset, offset + PAGE_SIZE);

  return {
    rows: paginatedRows,
    total,
    page,
    pageSize: PAGE_SIZE,
  };
}
