"use server";

import { db } from "@/db/index";
import {
  members,
  membershipClasses,
  subscriptions,
  seasons,
} from "@/db/schema";
import { eq, and, asc, desc, count } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SubscriptionListItem = {
  id: string;
  memberId: string;
  memberName: string;
  memberEmail: string;
  membershipClassName: string;
  amountCents: number;
  dueDate: string;
  status: string;
  paidAt: Date | null;
};

export type SubscriptionFilters = {
  organisationId: string;
  seasonId: string;
  status?: string;
  membershipClassId?: string;
  page?: number;
  pageSize?: number;
};

export type SubscriptionSummary = {
  totalExpected: number;
  totalCollected: number;
  totalOutstanding: number;
  totalWaived: number;
};

// ---------------------------------------------------------------------------
// Pure function — no DB, no "use server" semantics
// ---------------------------------------------------------------------------

export function getSubscriptionSummary(
  subs: { status: string; amountCents: number }[]
): SubscriptionSummary {
  let totalExpected = 0;
  let totalCollected = 0;
  let totalOutstanding = 0;
  let totalWaived = 0;

  for (const sub of subs) {
    totalExpected += sub.amountCents;
    if (sub.status === "PAID") {
      totalCollected += sub.amountCents;
    } else if (sub.status === "UNPAID") {
      totalOutstanding += sub.amountCents;
    } else if (sub.status === "WAIVED") {
      totalWaived += sub.amountCents;
    }
  }

  return { totalExpected, totalCollected, totalOutstanding, totalWaived };
}

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

export async function getSubscriptionList(filters: SubscriptionFilters): Promise<{
  subscriptions: SubscriptionListItem[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const {
    organisationId,
    seasonId,
    status,
    membershipClassId,
    page = 1,
    pageSize = 20,
  } = filters;

  const offset = (page - 1) * pageSize;

  const conditions = [
    eq(subscriptions.organisationId, organisationId),
    eq(subscriptions.seasonId, seasonId),
    ...(status ? [eq(subscriptions.status, status as "UNPAID" | "PAID" | "WAIVED")] : []),
    ...(membershipClassId ? [eq(members.membershipClassId, membershipClassId)] : []),
  ];

  const whereClause = and(...conditions);

  const rows = await db
    .select({
      id: subscriptions.id,
      memberId: subscriptions.memberId,
      firstName: members.firstName,
      lastName: members.lastName,
      email: members.email,
      membershipClassName: membershipClasses.name,
      amountCents: subscriptions.amountCents,
      dueDate: subscriptions.dueDate,
      status: subscriptions.status,
      paidAt: subscriptions.paidAt,
    })
    .from(subscriptions)
    .innerJoin(members, eq(members.id, subscriptions.memberId))
    .innerJoin(membershipClasses, eq(membershipClasses.id, members.membershipClassId))
    .where(whereClause)
    .orderBy(asc(members.lastName), asc(members.firstName))
    .limit(pageSize)
    .offset(offset);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(subscriptions)
    .innerJoin(members, eq(members.id, subscriptions.memberId))
    .where(whereClause);

  return {
    subscriptions: rows.map((row) => ({
      id: row.id,
      memberId: row.memberId,
      memberName: `${row.firstName} ${row.lastName}`,
      memberEmail: row.email,
      membershipClassName: row.membershipClassName,
      amountCents: row.amountCents,
      dueDate: row.dueDate,
      status: row.status,
      paidAt: row.paidAt,
    })),
    total,
    page,
    pageSize,
  };
}

export async function getSubscriptionSummaryForSeason(
  organisationId: string,
  seasonId: string
): Promise<SubscriptionSummary> {
  const rows = await db
    .select({
      status: subscriptions.status,
      amountCents: subscriptions.amountCents,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organisationId, organisationId),
        eq(subscriptions.seasonId, seasonId)
      )
    );

  return getSubscriptionSummary(rows);
}

export async function getActiveSeasonForOrg(
  organisationId: string
): Promise<{ id: string; name: string } | null> {
  const [season] = await db
    .select({ id: seasons.id, name: seasons.name })
    .from(seasons)
    .where(
      and(
        eq(seasons.organisationId, organisationId),
        eq(seasons.isActive, true)
      )
    );

  return season ?? null;
}

export async function getSeasonsForOrg(
  organisationId: string
): Promise<{ id: string; name: string; startDate: string; endDate: string; isActive: boolean }[]> {
  return db
    .select({
      id: seasons.id,
      name: seasons.name,
      startDate: seasons.startDate,
      endDate: seasons.endDate,
      isActive: seasons.isActive,
    })
    .from(seasons)
    .where(eq(seasons.organisationId, organisationId))
    .orderBy(desc(seasons.startDate));
}

export async function getMemberSubscription(
  organisationId: string,
  memberId: string,
  seasonId: string
): Promise<SubscriptionListItem | null> {
  const [row] = await db
    .select({
      id: subscriptions.id,
      memberId: subscriptions.memberId,
      firstName: members.firstName,
      lastName: members.lastName,
      email: members.email,
      membershipClassName: membershipClasses.name,
      amountCents: subscriptions.amountCents,
      dueDate: subscriptions.dueDate,
      status: subscriptions.status,
      paidAt: subscriptions.paidAt,
    })
    .from(subscriptions)
    .innerJoin(members, eq(members.id, subscriptions.memberId))
    .innerJoin(membershipClasses, eq(membershipClasses.id, members.membershipClassId))
    .where(
      and(
        eq(subscriptions.organisationId, organisationId),
        eq(subscriptions.memberId, memberId),
        eq(subscriptions.seasonId, seasonId)
      )
    );

  if (!row) return null;

  return {
    id: row.id,
    memberId: row.memberId,
    memberName: `${row.firstName} ${row.lastName}`,
    memberEmail: row.email,
    membershipClassName: row.membershipClassName,
    amountCents: row.amountCents,
    dueDate: row.dueDate,
    status: row.status,
    paidAt: row.paidAt,
  };
}
