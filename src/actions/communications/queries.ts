"use server";

import { db } from "@/db/index";
import {
  communications,
  communicationRecipients,
  members,
} from "@/db/schema";
import { eq, and, desc, count } from "drizzle-orm";

const PAGE_SIZE = 25;

type ListFilters = {
  status?: string;
  page?: number;
};

export async function listCommunications(
  orgId: string,
  filters?: ListFilters
) {
  const page = filters?.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  const conditions = [eq(communications.organisationId, orgId)];

  if (filters?.status) {
    conditions.push(
      eq(
        communications.status,
        filters.status as
          | "DRAFT"
          | "SENDING"
          | "SENT"
          | "PARTIAL_FAILURE"
          | "FAILED"
      )
    );
  }

  const results = await db
    .select()
    .from(communications)
    .leftJoin(members, eq(members.id, communications.createdByMemberId))
    .where(and(...conditions))
    .orderBy(desc(communications.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  return {
    success: true,
    communications: results,
    page,
    pageSize: PAGE_SIZE,
  };
}

export async function getCommunication(
  communicationId: string,
  orgId: string
) {
  const [result] = await db
    .select()
    .from(communications)
    .where(
      and(
        eq(communications.id, communicationId),
        eq(communications.organisationId, orgId)
      )
    );

  return result ?? null;
}

export async function getRecipientStats(communicationId: string) {
  const results = await db
    .select({
      status: communicationRecipients.status,
      count: count(),
    })
    .from(communicationRecipients)
    .where(eq(communicationRecipients.communicationId, communicationId))
    .groupBy(communicationRecipients.status);

  const stats: Record<string, number> = {};
  for (const row of results) {
    stats[row.status] = Number(row.count);
  }
  return stats;
}

export async function getRecipients(communicationId: string, page?: number) {
  const currentPage = page ?? 1;
  const offset = (currentPage - 1) * PAGE_SIZE;

  const results = await db
    .select()
    .from(communicationRecipients)
    .leftJoin(members, eq(members.id, communicationRecipients.memberId))
    .where(eq(communicationRecipients.communicationId, communicationId))
    .orderBy(communicationRecipients.id)
    .limit(PAGE_SIZE)
    .offset(offset);

  return {
    success: true,
    recipients: results,
    page: currentPage,
    pageSize: PAGE_SIZE,
  };
}
