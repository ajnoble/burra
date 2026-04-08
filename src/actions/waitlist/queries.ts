"use server";

import { db } from "@/db/index";
import { waitlistEntries, members, lodges } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";

const PAGE_SIZE = 25;

type ListFilters = {
  status?: string;
  lodgeId?: string;
  page?: number;
};

export async function listWaitlistEntries(orgId: string, filters?: ListFilters) {
  const page = filters?.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  const conditions = [eq(lodges.organisationId, orgId)];

  if (filters?.status) {
    conditions.push(
      eq(
        waitlistEntries.status,
        filters.status as "WAITING" | "NOTIFIED" | "CONVERTED" | "EXPIRED"
      )
    );
  }

  if (filters?.lodgeId) {
    conditions.push(eq(waitlistEntries.lodgeId, filters.lodgeId));
  }

  const entries = await db
    .select()
    .from(waitlistEntries)
    .leftJoin(members, eq(members.id, waitlistEntries.memberId))
    .leftJoin(lodges, eq(lodges.id, waitlistEntries.lodgeId))
    .where(and(...conditions))
    .orderBy(asc(waitlistEntries.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  return {
    success: true,
    entries,
    page,
    pageSize: PAGE_SIZE,
  };
}

export async function getWaitlistEntry(entryId: string, orgId: string) {
  const [result] = await db
    .select()
    .from(waitlistEntries)
    .leftJoin(lodges, eq(lodges.id, waitlistEntries.lodgeId))
    .where(
      and(
        eq(waitlistEntries.id, entryId),
        eq(lodges.organisationId, orgId)
      )
    );

  return result ?? null;
}
