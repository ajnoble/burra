"use server";

import { db } from "@/db/index";
import { bookings, members, lodges, bookingGuests } from "@/db/schema";
import { and, eq, gte, lte, desc, sql, inArray } from "drizzle-orm";
import { requireSession, requireRole, authErrorToResult } from "@/lib/auth-guards";

export type BookingSummaryFilters = {
  organisationId: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  lodgeId?: string;
  memberId?: string;
  page?: number;
};

export type BookingSummaryRow = {
  bookingReference: string;
  memberFirstName: string;
  memberLastName: string;
  lodgeName: string;
  checkInDate: string;
  checkOutDate: string;
  totalNights: number;
  guestCount: number;
  totalAmountCents: number;
  status: string;
};

export type BookingSummaryResult = {
  rows: BookingSummaryRow[];
  total: number;
  page: number;
  pageSize: number;
  totalAmountCents: number;
};

const PAGE_SIZE = 50;

export async function getBookingSummary(
  filters: BookingSummaryFilters
): Promise<BookingSummaryResult | { success: false; error: string }> {
  try {
  const session = await requireSession(filters.organisationId);
  requireRole(session, "COMMITTEE");

  const {
    organisationId,
    dateFrom,
    dateTo,
    status,
    lodgeId,
    memberId,
    page = 1,
  } = filters;

  const conditions = [eq(bookings.organisationId, organisationId)];

  if (dateFrom) {
    conditions.push(gte(bookings.checkInDate, dateFrom));
  }
  if (dateTo) {
    conditions.push(lte(bookings.checkInDate, dateTo));
  }
  if (status) {
    conditions.push(eq(bookings.status, status as "PENDING" | "CONFIRMED" | "WAITLISTED" | "CANCELLED" | "COMPLETED"));
  }
  if (lodgeId) {
    conditions.push(eq(bookings.lodgeId, lodgeId));
  }
  if (memberId) {
    conditions.push(eq(bookings.primaryMemberId, memberId));
  }

  const whereClause = and(...conditions);

  const offset = (page - 1) * PAGE_SIZE;

  // Main query: bookings + members + lodges
  const dbRows = await db
    .select({
      bookingId: bookings.id,
      bookingReference: bookings.bookingReference,
      memberFirstName: members.firstName,
      memberLastName: members.lastName,
      lodgeName: lodges.name,
      checkInDate: bookings.checkInDate,
      checkOutDate: bookings.checkOutDate,
      totalNights: bookings.totalNights,
      totalAmountCents: bookings.totalAmountCents,
      status: bookings.status,
    })
    .from(bookings)
    .leftJoin(members, eq(bookings.primaryMemberId, members.id))
    .leftJoin(lodges, eq(bookings.lodgeId, lodges.id))
    .where(whereClause)
    .orderBy(desc(bookings.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  // Count query for pagination total
  const countResult = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(bookings)
    .leftJoin(members, eq(bookings.primaryMemberId, members.id))
    .leftJoin(lodges, eq(bookings.lodgeId, lodges.id))
    .where(whereClause);

  const total = Number((countResult[0] as { count: number })?.count ?? 0);

  // Guest count query: grouped by bookingId
  const bookingIds = (dbRows as Array<{ bookingId: string }>).map(
    (r) => r.bookingId
  );

  let guestCountMap = new Map<string, number>();

  if (bookingIds.length > 0) {
    const guestCounts = await db
      .select({
        bookingId: bookingGuests.bookingId,
        guestCount: sql<number>`COUNT(${bookingGuests.id})`,
      })
      .from(bookingGuests)
      .where(inArray(bookingGuests.bookingId, bookingIds))
      .groupBy(bookingGuests.bookingId);

    guestCountMap = new Map(
      (
        guestCounts as Array<{ bookingId: string; guestCount: number }>
      ).map((r) => [r.bookingId, Number(r.guestCount)])
    );
  }

  const rows: BookingSummaryRow[] = (
    dbRows as Array<{
      bookingId: string;
      bookingReference: string;
      memberFirstName: string | null;
      memberLastName: string | null;
      lodgeName: string | null;
      checkInDate: string;
      checkOutDate: string;
      totalNights: number;
      totalAmountCents: number;
      status: string;
    }>
  ).map((row) => ({
    bookingReference: row.bookingReference,
    memberFirstName: row.memberFirstName ?? "",
    memberLastName: row.memberLastName ?? "",
    lodgeName: row.lodgeName ?? "",
    checkInDate: row.checkInDate,
    checkOutDate: row.checkOutDate,
    totalNights: Number(row.totalNights),
    guestCount: guestCountMap.get(row.bookingId) ?? 0,
    totalAmountCents: Number(row.totalAmountCents),
    status: row.status,
  }));

  const totalAmountCents = rows.reduce(
    (sum, row) => sum + row.totalAmountCents,
    0
  );

  return {
    rows,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalAmountCents,
  };
  } catch (e) {
    const authResult = authErrorToResult(e);
    if (authResult) return authResult;
    throw e;
  }
}
