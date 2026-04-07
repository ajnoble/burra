import { db } from "@/db/index";
import {
  bookings,
  bookingGuests,
  lodges,
  members,
  membershipClasses,
  beds,
  rooms,
  transactions,
} from "@/db/schema";
import { eq, and, or, ilike, gte, lte, desc, sql } from "drizzle-orm";

const PAGE_SIZE = 20;

export type AdminBookingFilters = {
  search?: string;
  status?: string;
  lodgeId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
};

export type AdminBookingListItem = {
  id: string;
  bookingReference: string;
  memberFirstName: string;
  memberLastName: string;
  lodgeName: string;
  checkInDate: string;
  checkOutDate: string;
  totalNights: number;
  totalAmountCents: number;
  status: string;
  guestCount: number;
  createdAt: Date;
  balancePaidAt: Date | null;
};

export async function getAdminBookings(
  filters: AdminBookingFilters & { organisationId: string }
) {
  const page = filters.page ?? 1;
  const offset = (page - 1) * PAGE_SIZE;

  const conditions = [eq(bookings.organisationId, filters.organisationId)];

  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(bookings.bookingReference, pattern),
        ilike(members.firstName, pattern),
        ilike(members.lastName, pattern)
      )!
    );
  }

  if (filters.status) {
    conditions.push(
      eq(
        bookings.status,
        filters.status as
          | "PENDING"
          | "CONFIRMED"
          | "WAITLISTED"
          | "CANCELLED"
          | "COMPLETED"
      )
    );
  }

  if (filters.lodgeId) {
    conditions.push(eq(bookings.lodgeId, filters.lodgeId));
  }

  if (filters.dateFrom) {
    conditions.push(gte(bookings.checkInDate, filters.dateFrom));
  }

  if (filters.dateTo) {
    conditions.push(lte(bookings.checkInDate, filters.dateTo));
  }

  const rows = await db
    .select({
      id: bookings.id,
      bookingReference: bookings.bookingReference,
      memberFirstName: members.firstName,
      memberLastName: members.lastName,
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
    .innerJoin(members, eq(members.id, bookings.primaryMemberId))
    .where(and(...conditions))
    .orderBy(desc(bookings.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  // Total count
  const [countResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(bookings)
    .innerJoin(lodges, eq(lodges.id, bookings.lodgeId))
    .innerJoin(members, eq(members.id, bookings.primaryMemberId))
    .where(and(...conditions));

  const total = Number(countResult?.count ?? 0);

  // Guest counts
  const bookingIds = rows.map((r) => r.id);
  let guestCountMap = new Map<string, number>();

  if (bookingIds.length > 0) {
    const guestCounts = await db
      .select({
        bookingId: bookingGuests.bookingId,
        count: sql<number>`COUNT(*)`,
      })
      .from(bookingGuests)
      .where(sql`${bookingGuests.bookingId} IN ${bookingIds}`)
      .groupBy(bookingGuests.bookingId);

    guestCountMap = new Map(
      guestCounts.map((g) => [g.bookingId, Number(g.count)])
    );
  }

  return {
    bookings: rows.map((r) => ({
      ...r,
      guestCount: guestCountMap.get(r.id) ?? 0,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
  };
}

export type AdminBookingDetail = {
  id: string;
  bookingReference: string;
  lodgeId: string;
  lodgeName: string;
  checkInDate: string;
  checkOutDate: string;
  totalNights: number;
  subtotalCents: number;
  discountAmountCents: number;
  totalAmountCents: number;
  status: string;
  requiresApproval: boolean;
  approvedAt: Date | null;
  approverFirstName: string | null;
  approverLastName: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  refundAmountCents: number | null;
  balancePaidAt: Date | null;
  balanceDueDate: string | null;
  paymentRemindersSentAt: Record<string, string> | null;
  adminNotes: string | null;
  notes: string | null;
  createdAt: Date;
  primaryMemberId: string;
  memberFirstName: string;
  memberLastName: string;
  memberEmail: string;
  memberNumber: string | null;
  membershipClassName: string | null;
  cancellationPolicyId: string | null;
  guests: {
    id: string;
    memberId: string;
    firstName: string;
    lastName: string;
    membershipClassName: string | null;
    bedId: string | null;
    bedLabel: string | null;
    roomId: string | null;
    roomName: string | null;
    pricePerNightCents: number;
    totalAmountCents: number;
  }[];
  transactions: {
    id: string;
    type: string;
    amountCents: number;
    stripePaymentIntentId: string | null;
    description: string;
    createdAt: Date;
  }[];
};

export async function getAdminBookingDetail(
  bookingId: string,
  organisationId: string
): Promise<AdminBookingDetail | null> {
  const [booking] = await db
    .select({
      id: bookings.id,
      bookingReference: bookings.bookingReference,
      lodgeId: bookings.lodgeId,
      lodgeName: lodges.name,
      checkInDate: bookings.checkInDate,
      checkOutDate: bookings.checkOutDate,
      totalNights: bookings.totalNights,
      subtotalCents: bookings.subtotalCents,
      discountAmountCents: bookings.discountAmountCents,
      totalAmountCents: bookings.totalAmountCents,
      status: bookings.status,
      requiresApproval: bookings.requiresApproval,
      approvedAt: bookings.approvedAt,
      cancelledAt: bookings.cancelledAt,
      cancellationReason: bookings.cancellationReason,
      refundAmountCents: bookings.refundAmountCents,
      balancePaidAt: bookings.balancePaidAt,
      balanceDueDate: bookings.balanceDueDate,
      paymentRemindersSentAt: bookings.paymentRemindersSentAt,
      adminNotes: bookings.adminNotes,
      notes: bookings.notes,
      createdAt: bookings.createdAt,
      primaryMemberId: bookings.primaryMemberId,
      memberFirstName: members.firstName,
      memberLastName: members.lastName,
      memberEmail: members.email,
      memberNumber: members.memberNumber,
      membershipClassName: membershipClasses.name,
      cancellationPolicyId: bookings.cancellationPolicyId,
    })
    .from(bookings)
    .innerJoin(lodges, eq(lodges.id, bookings.lodgeId))
    .innerJoin(members, eq(members.id, bookings.primaryMemberId))
    .leftJoin(
      membershipClasses,
      eq(membershipClasses.id, members.membershipClassId)
    )
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.organisationId, organisationId)
      )
    );

  if (!booking) return null;

  // Get approver name if approved
  let approverFirstName: string | null = null;
  let approverLastName: string | null = null;
  if (booking.approvedAt) {
    const [approverRow] = await db
      .select({ firstName: members.firstName, lastName: members.lastName })
      .from(bookings)
      .innerJoin(members, eq(members.id, bookings.approvedByMemberId))
      .where(eq(bookings.id, bookingId));
    approverFirstName = approverRow?.firstName ?? null;
    approverLastName = approverRow?.lastName ?? null;
  }

  const guests = await db
    .select({
      id: bookingGuests.id,
      memberId: bookingGuests.memberId,
      firstName: members.firstName,
      lastName: members.lastName,
      membershipClassName: membershipClasses.name,
      bedId: bookingGuests.bedId,
      bedLabel: beds.label,
      roomId: bookingGuests.roomId,
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

  const txns = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amountCents: transactions.amountCents,
      stripePaymentIntentId: transactions.stripePaymentIntentId,
      description: transactions.description,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .where(eq(transactions.bookingId, bookingId))
    .orderBy(desc(transactions.createdAt));

  return {
    ...booking,
    primaryMemberId: booking.primaryMemberId!,
    approverFirstName,
    approverLastName,
    guests,
    transactions: txns,
  };
}

export async function getPendingApprovalCount(
  organisationId: string
): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.organisationId, organisationId),
        eq(bookings.status, "PENDING")
      )
    );
  return Number(result?.count ?? 0);
}

export async function getAvailableBeds(
  lodgeId: string,
  checkInDate: string,
  checkOutDate: string,
  excludeBookingId?: string
) {
  // Get all beds in the lodge
  const allBeds = await db
    .select({
      bedId: beds.id,
      bedLabel: beds.label,
      roomId: rooms.id,
      roomName: rooms.name,
    })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(eq(rooms.lodgeId, lodgeId))
    .orderBy(rooms.name, beds.label);

  // Get beds that are booked during this date range (excluding the current booking)
  const excludeCondition = excludeBookingId
    ? sql`AND b.id != ${excludeBookingId}`
    : sql``;

  const bookedBeds = await db.execute(
    sql`SELECT DISTINCT bg.bed_id FROM booking_guests bg
        JOIN bookings b ON b.id = bg.booking_id
        WHERE b.lodge_id = ${lodgeId}
        AND b.status NOT IN ('CANCELLED')
        AND b.check_in_date < ${checkOutDate}
        AND b.check_out_date > ${checkInDate}
        ${excludeCondition}`
  );

  const bookedBedIds = new Set(
    (bookedBeds as unknown as { bed_id: string }[]).map((r) => r.bed_id)
  );

  // Group by room, filter out booked beds
  const roomMap = new Map<
    string,
    { roomId: string; roomName: string; beds: { bedId: string; bedLabel: string }[] }
  >();

  for (const bed of allBeds) {
    if (bookedBedIds.has(bed.bedId)) continue;

    if (!roomMap.has(bed.roomId)) {
      roomMap.set(bed.roomId, {
        roomId: bed.roomId,
        roomName: bed.roomName,
        beds: [],
      });
    }
    roomMap.get(bed.roomId)!.beds.push({
      bedId: bed.bedId,
      bedLabel: bed.bedLabel,
    });
  }

  return Array.from(roomMap.values());
}
