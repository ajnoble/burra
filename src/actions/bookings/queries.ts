"use server";

import { db } from "@/db/index";
import {
  bookings,
  bookingGuests,
  lodges,
  beds,
  rooms,
  members,
  membershipClasses,
  transactions,
} from "@/db/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending Approval",
  CONFIRMED: "Confirmed",
  WAITLISTED: "Waitlisted",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
};

/**
 * Format a booking status for display. Pure function, testable.
 */
export async function formatBookingStatus(status: string): Promise<string> {
  return STATUS_LABELS[status] ?? status;
}

export type BookingListItem = {
  id: string;
  bookingReference: string;
  lodgeName: string;
  checkInDate: string;
  checkOutDate: string;
  totalNights: number;
  totalAmountCents: number;
  status: string;
  guestCount: number;
  createdAt: Date;
  invoiceTransactionId: string | null;
  balancePaidAt: Date | null;
};

/**
 * Get all bookings for a member in an organisation.
 */
export async function getMemberBookings(
  organisationId: string,
  memberId: string
): Promise<BookingListItem[]> {
  const rows = await db
    .select({
      id: bookings.id,
      bookingReference: bookings.bookingReference,
      lodgeName: lodges.name,
      checkInDate: bookings.checkInDate,
      checkOutDate: bookings.checkOutDate,
      totalNights: bookings.totalNights,
      totalAmountCents: bookings.totalAmountCents,
      status: bookings.status,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .innerJoin(lodges, eq(lodges.id, bookings.lodgeId))
    .where(
      and(
        eq(bookings.organisationId, organisationId),
        eq(bookings.primaryMemberId, memberId)
      )
    )
    .orderBy(desc(bookings.createdAt));

  // Get guest counts
  const bookingIds = rows.map((r) => r.id);
  if (bookingIds.length === 0) return [];

  const guestCounts = await db
    .select({
      bookingId: bookingGuests.bookingId,
      count: sql<number>`COUNT(*)`,
    })
    .from(bookingGuests)
    .where(sql`${bookingGuests.bookingId} IN ${bookingIds}`)
    .groupBy(bookingGuests.bookingId);

  const countMap = new Map(
    guestCounts.map((g) => [g.bookingId, Number(g.count)])
  );

  return rows.map((r) => ({
    ...r,
    guestCount: countMap.get(r.id) ?? 0,
  }));
}

/**
 * Get upcoming bookings for a member (for dashboard display).
 */
export async function getUpcomingBookings(
  organisationId: string,
  memberId: string,
  limit: number = 3
): Promise<BookingListItem[]> {
  const today = new Date().toISOString().split("T")[0];

  const rows = await db
    .select({
      id: bookings.id,
      bookingReference: bookings.bookingReference,
      lodgeName: lodges.name,
      checkInDate: bookings.checkInDate,
      checkOutDate: bookings.checkOutDate,
      totalNights: bookings.totalNights,
      totalAmountCents: bookings.totalAmountCents,
      status: bookings.status,
      createdAt: bookings.createdAt,
      balancePaidAt: bookings.balancePaidAt,
    })
    .from(bookings)
    .innerJoin(lodges, eq(lodges.id, bookings.lodgeId))
    .where(
      and(
        eq(bookings.organisationId, organisationId),
        eq(bookings.primaryMemberId, memberId),
        gte(bookings.checkInDate, today),
        sql`${bookings.status} NOT IN ('CANCELLED')`
      )
    )
    .orderBy(bookings.checkInDate)
    .limit(limit);

  const bookingIds = rows.map((r) => r.id);
  if (bookingIds.length === 0)
    return rows.map((r) => ({ ...r, guestCount: 0, invoiceTransactionId: null }));

  const guestCounts = await db
    .select({
      bookingId: bookingGuests.bookingId,
      count: sql<number>`COUNT(*)`,
    })
    .from(bookingGuests)
    .where(sql`${bookingGuests.bookingId} IN ${bookingIds}`)
    .groupBy(bookingGuests.bookingId);

  const countMap = new Map(
    guestCounts.map((g) => [g.bookingId, Number(g.count)])
  );

  const invoiceTxns = bookingIds.length > 0
    ? await db
        .select({
          bookingId: transactions.bookingId,
          transactionId: transactions.id,
        })
        .from(transactions)
        .where(
          and(
            sql`${transactions.bookingId} IN ${bookingIds}`,
            eq(transactions.type, "INVOICE")
          )
        )
    : [];

  const invoiceMap = new Map(
    invoiceTxns.map((t) => [t.bookingId, t.transactionId])
  );

  return rows.map((r) => ({
    ...r,
    guestCount: countMap.get(r.id) ?? 0,
    invoiceTransactionId: invoiceMap.get(r.id) ?? null,
  }));
}

export type BookingDetail = {
  id: string;
  bookingReference: string;
  lodgeName: string;
  lodgeCheckInTime: string;
  lodgeCheckOutTime: string;
  checkInDate: string;
  checkOutDate: string;
  totalNights: number;
  subtotalCents: number;
  discountAmountCents: number;
  totalAmountCents: number;
  status: string;
  createdAt: Date;
  guests: {
    id: string;
    firstName: string;
    lastName: string;
    membershipClassName: string | null;
    bedLabel: string | null;
    roomName: string | null;
    pricePerNightCents: number;
    totalAmountCents: number;
  }[];
};

/**
 * Get full booking details including guests, beds, and rooms.
 */
export async function getBookingDetail(
  bookingId: string,
  organisationId: string,
  memberId: string
): Promise<BookingDetail | null> {
  const [booking] = await db
    .select({
      id: bookings.id,
      bookingReference: bookings.bookingReference,
      lodgeName: lodges.name,
      lodgeCheckInTime: lodges.checkInTime,
      lodgeCheckOutTime: lodges.checkOutTime,
      checkInDate: bookings.checkInDate,
      checkOutDate: bookings.checkOutDate,
      totalNights: bookings.totalNights,
      subtotalCents: bookings.subtotalCents,
      discountAmountCents: bookings.discountAmountCents,
      totalAmountCents: bookings.totalAmountCents,
      status: bookings.status,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .innerJoin(lodges, eq(lodges.id, bookings.lodgeId))
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.organisationId, organisationId),
        eq(bookings.primaryMemberId, memberId)
      )
    );

  if (!booking) return null;

  const guests = await db
    .select({
      id: bookingGuests.id,
      firstName: members.firstName,
      lastName: members.lastName,
      membershipClassName: membershipClasses.name,
      bedLabel: beds.label,
      roomName: rooms.name,
      pricePerNightCents: bookingGuests.pricePerNightCents,
      totalAmountCents: bookingGuests.totalAmountCents,
    })
    .from(bookingGuests)
    .innerJoin(members, eq(members.id, bookingGuests.memberId))
    .leftJoin(
      membershipClasses,
      eq(membershipClasses.id, bookingGuests.snapshotMembershipClassId)
    )
    .leftJoin(beds, eq(beds.id, bookingGuests.bedId))
    .leftJoin(rooms, eq(rooms.id, bookingGuests.roomId))
    .where(eq(bookingGuests.bookingId, bookingId));

  return { ...booking, guests };
}
