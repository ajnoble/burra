"use server";

import { db } from "@/db/index";
import {
  rooms,
  beds,
  bookings,
  bookingGuests,
  members,
  availabilityOverrides,
  bedHolds,
} from "@/db/schema";
import { eq, and, sql, lt, gte } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export type MatrixBed = {
  id: string;
  label: string;
  sortOrder: number;
};

export type MatrixRoom = {
  id: string;
  name: string;
  floor: string | null;
  capacity: number;
  sortOrder: number;
  beds: MatrixBed[];
};

export type MatrixGuest = {
  id: string;
  memberId: string | null;
  firstName: string | null;
  lastName: string | null;
  bedId: string | null;
};

export type MatrixBooking = {
  id: string;
  bookingReference: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  primaryMemberId: string | null;
  guests: MatrixGuest[];
};

export type MatrixOverride = {
  id: string;
  startDate: string;
  endDate: string;
  type: string;
  reason: string | null;
  bedReduction: number | null;
};

export type MatrixHold = {
  id: string;
  bedId: string;
  memberId: string;
  checkInDate: string;
  checkOutDate: string;
  expiresAt: Date;
};

export type MatrixData = {
  rooms: MatrixRoom[];
  bookings: MatrixBooking[];
  overrides: MatrixOverride[];
  holds: MatrixHold[];
};

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

/**
 * Fetches all data needed to render the booking matrix for a given lodge and
 * date window. No auth guard — callers (page-level server components) handle
 * authentication.
 */
export async function getMatrixData(
  lodgeId: string,
  startDate: string,
  endDate: string
): Promise<MatrixData> {
  // 1. Rooms + beds
  const lodgeRooms = await db
    .select({
      id: rooms.id,
      name: rooms.name,
      floor: rooms.floor,
      capacity: rooms.capacity,
      sortOrder: rooms.sortOrder,
    })
    .from(rooms)
    .where(eq(rooms.lodgeId, lodgeId))
    .orderBy(rooms.sortOrder);

  const matrixRooms: MatrixRoom[] = [];

  for (const room of lodgeRooms) {
    const roomBeds = await db
      .select({
        id: beds.id,
        label: beds.label,
        sortOrder: beds.sortOrder,
      })
      .from(beds)
      .where(eq(beds.roomId, room.id))
      .orderBy(beds.sortOrder);

    matrixRooms.push({ ...room, beds: roomBeds });
  }

  // 2. Bookings overlapping [startDate, endDate) — half-open interval
  //    Overlap condition: checkInDate < endDate AND checkOutDate > startDate
  const overlappingBookings = await db
    .select({
      id: bookings.id,
      bookingReference: bookings.bookingReference,
      checkInDate: bookings.checkInDate,
      checkOutDate: bookings.checkOutDate,
      status: bookings.status,
      primaryMemberId: bookings.primaryMemberId,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.lodgeId, lodgeId),
        sql`${bookings.status} NOT IN ('CANCELLED')`,
        lt(bookings.checkInDate, endDate),
        sql`${bookings.checkOutDate} > ${startDate}`
      )
    );

  // 3. For each booking, fetch guests with member names
  const matrixBookings: MatrixBooking[] = [];

  for (const booking of overlappingBookings) {
    const guestRows = await db
      .select({
        id: bookingGuests.id,
        memberId: bookingGuests.memberId,
        bedId: bookingGuests.bedId,
        firstName: members.firstName,
        lastName: members.lastName,
      })
      .from(bookingGuests)
      .leftJoin(members, eq(members.id, bookingGuests.memberId))
      .where(eq(bookingGuests.bookingId, booking.id));

    matrixBookings.push({
      ...booking,
      guests: guestRows.map((g) => ({
        id: g.id,
        memberId: g.memberId,
        firstName: g.firstName,
        lastName: g.lastName,
        bedId: g.bedId,
      })),
    });
  }

  // 4. Availability overrides overlapping the window
  //    Override overlap: startDate < endDate AND endDate > startDate
  const overrideRows = await db
    .select({
      id: availabilityOverrides.id,
      startDate: availabilityOverrides.startDate,
      endDate: availabilityOverrides.endDate,
      type: availabilityOverrides.type,
      reason: availabilityOverrides.reason,
      bedReduction: availabilityOverrides.bedReduction,
    })
    .from(availabilityOverrides)
    .where(
      and(
        eq(availabilityOverrides.lodgeId, lodgeId),
        lt(availabilityOverrides.startDate, endDate),
        sql`${availabilityOverrides.endDate} > ${startDate}`
      )
    );

  // 5. Active (non-expired) bed holds for this lodge
  const holdRows = await db
    .select({
      id: bedHolds.id,
      bedId: bedHolds.bedId,
      memberId: bedHolds.memberId,
      checkInDate: bedHolds.checkInDate,
      checkOutDate: bedHolds.checkOutDate,
      expiresAt: bedHolds.expiresAt,
    })
    .from(bedHolds)
    .where(
      and(
        eq(bedHolds.lodgeId, lodgeId),
        gte(bedHolds.expiresAt, new Date())
      )
    );

  return {
    rooms: matrixRooms,
    bookings: matrixBookings,
    overrides: overrideRows,
    holds: holdRows,
  };
}
