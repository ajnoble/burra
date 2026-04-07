"use server";

import { db } from "@/db/index";
import { transactions, members } from "@/db/schema";
import { eq, and, desc, gte, lte, SQL } from "drizzle-orm";
import { format } from "date-fns";

export type LedgerRow = {
  id: string;
  date: Date;
  memberFirstName: string;
  memberLastName: string;
  type: "PAYMENT" | "REFUND" | "CREDIT" | "SUBSCRIPTION" | "ADJUSTMENT" | "INVOICE";
  amountCents: number;
  description: string;
  stripeRef: string | null;
};

export type LedgerResult = {
  rows: LedgerRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type LedgerFilters = {
  organisationId: string;
  dateFrom?: string;
  dateTo?: string;
  type?: string;
  memberId?: string;
  page?: number;
};

export type XeroRow = {
  date: string;
  amount: string;
  payee: string;
  description: string;
  reference: string;
};

const PAGE_SIZE = 50;

export async function getTransactionLedger(
  filters: LedgerFilters
): Promise<LedgerResult> {
  const page = filters.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  const conditions: SQL[] = [eq(transactions.organisationId, filters.organisationId)];

  if (filters.dateFrom) {
    conditions.push(gte(transactions.createdAt, new Date(filters.dateFrom)));
  }
  if (filters.dateTo) {
    conditions.push(lte(transactions.createdAt, new Date(filters.dateTo)));
  }
  if (filters.type) {
    conditions.push(
      eq(
        transactions.type,
        filters.type as LedgerRow["type"]
      )
    );
  }
  if (filters.memberId) {
    conditions.push(eq(transactions.memberId, filters.memberId));
  }

  const whereClause = and(...conditions);

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
    .where(whereClause)
    .orderBy(desc(transactions.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  return {
    rows: rows as LedgerRow[],
    total: rows.length,
    page,
    pageSize: PAGE_SIZE,
  };
}

export async function formatLedgerForXero(rows: LedgerRow[]): Promise<XeroRow[]> {
  return rows.map((row) => ({
    date: format(row.date, "dd/MM/yyyy"),
    amount: (row.amountCents / 100).toFixed(2),
    payee: `${row.memberFirstName} ${row.memberLastName}`,
    description: row.description,
    reference: row.stripeRef ?? "",
  }));
}
