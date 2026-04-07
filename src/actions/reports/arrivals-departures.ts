"use server";

import { db } from "@/db/index";
import { bookings, members, lodges } from "@/db/schema";
import { and, eq, inArray, or, gte, lte } from "drizzle-orm";

export type ArrivalsFilters = {
  organisationId: string;
  dateFrom: string;
  dateTo: string;
  lodgeId?: string;
  page?: number;
};

export type ArrivalDepartureRow = {
  bookingReference: string;
  type: "arrival" | "departure";
  date: string;
  memberFirstName: string;
  memberLastName: string;
  lodgeName: string;
  checkInDate: string;
  checkOutDate: string;
  paymentStatus: "paid" | "unpaid";
};

export type ArrivalsResult = {
  rows: ArrivalDepartureRow[];
  total: number;
  page: number;
  pageSize: number;
};

const PAGE_SIZE = 50;

export async function getArrivalsAndDepartures(
  filters: ArrivalsFilters
): Promise<ArrivalsResult> {
  const { organisationId, dateFrom, dateTo, lodgeId, page = 1 } = filters;

  const conditions = [
    eq(bookings.organisationId, organisationId),
    inArray(bookings.status, ["CONFIRMED", "COMPLETED", "PENDING"]),
    or(
      and(gte(bookings.checkInDate, dateFrom), lte(bookings.checkInDate, dateTo)),
      and(gte(bookings.checkOutDate, dateFrom), lte(bookings.checkOutDate, dateTo))
    ),
  ];

  if (lodgeId !== undefined) {
    conditions.push(eq(bookings.lodgeId, lodgeId));
  }

  const rawRows = await db
    .select({
      bookingReference: bookings.bookingReference,
      memberFirstName: members.firstName,
      memberLastName: members.lastName,
      lodgeName: lodges.name,
      checkInDate: bookings.checkInDate,
      checkOutDate: bookings.checkOutDate,
      balancePaidAt: bookings.balancePaidAt,
    })
    .from(bookings)
    .innerJoin(members, eq(members.id, bookings.primaryMemberId))
    .innerJoin(lodges, eq(lodges.id, bookings.lodgeId))
    .where(and(...conditions));

  // Expand each booking into 1-2 rows (arrival and/or departure)
  const expandedRows: ArrivalDepartureRow[] = [];

  for (const row of rawRows as Array<{
    bookingReference: string;
    memberFirstName: string;
    memberLastName: string;
    lodgeName: string;
    checkInDate: string;
    checkOutDate: string;
    balancePaidAt: Date | null;
  }>) {
    const paymentStatus: "paid" | "unpaid" = row.balancePaidAt != null ? "paid" : "unpaid";

    const checkIn = row.checkInDate;
    const checkOut = row.checkOutDate;

    if (checkIn >= dateFrom && checkIn <= dateTo) {
      expandedRows.push({
        bookingReference: row.bookingReference,
        type: "arrival",
        date: checkIn,
        memberFirstName: row.memberFirstName,
        memberLastName: row.memberLastName,
        lodgeName: row.lodgeName,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        paymentStatus,
      });
    }

    if (checkOut >= dateFrom && checkOut <= dateTo) {
      expandedRows.push({
        bookingReference: row.bookingReference,
        type: "departure",
        date: checkOut,
        memberFirstName: row.memberFirstName,
        memberLastName: row.memberLastName,
        lodgeName: row.lodgeName,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        paymentStatus,
      });
    }
  }

  // Sort by date then by type (arrival before departure)
  expandedRows.sort((a, b) => {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    // Same date: arrival before departure
    if (a.type === "arrival" && b.type === "departure") return -1;
    if (a.type === "departure" && b.type === "arrival") return 1;
    return 0;
  });

  const total = expandedRows.length;

  // Paginate
  const offset = (page - 1) * PAGE_SIZE;
  const paginatedRows = expandedRows.slice(offset, offset + PAGE_SIZE);

  return {
    rows: paginatedRows,
    total,
    page,
    pageSize: PAGE_SIZE,
  };
}
