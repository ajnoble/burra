"use server";

import { db } from "@/db/index";
import { beds, rooms, bookingGuests, bookings, bedHolds } from "@/db/schema";
import { eq, and, sql, lt, ne, gte } from "drizzle-orm";
import { buildBedAvailabilityMap as _buildBedAvailabilityMap } from "./beds-helpers";
import type { BedWithStatus } from "./beds-helpers";

export type { BedWithStatus } from "./beds-helpers";

export type RoomWithBeds = {
  id: string;
  name: string;
  floor: string | null;
  capacity: number;
  sortOrder: number;
  beds: BedWithStatus[];
};

export async function getAvailableBeds(
  lodgeId: string,
  checkInDate: string,
  checkOutDate: string,
  currentMemberId: string
): Promise<RoomWithBeds[]> {
  // Clean up expired holds
  await db.delete(bedHolds).where(lt(bedHolds.expiresAt, new Date()));

  // Get all rooms for this lodge
  const lodgeRooms = await db
    .select({ id: rooms.id, name: rooms.name, floor: rooms.floor, capacity: rooms.capacity, sortOrder: rooms.sortOrder })
    .from(rooms)
    .where(eq(rooms.lodgeId, lodgeId))
    .orderBy(rooms.sortOrder);

  if (lodgeRooms.length === 0) return [];

  // Get all beds for these rooms
  const roomIds = lodgeRooms.map((r) => r.id);
  const allBeds = await db
    .select({ id: beds.id, label: beds.label, roomId: beds.roomId, sortOrder: beds.sortOrder })
    .from(beds)
    .where(sql`${beds.roomId} IN ${roomIds}`)
    .orderBy(beds.sortOrder);

  // Get booked bed IDs for overlapping date ranges
  const bookedRows = await db
    .select({ bedId: bookingGuests.bedId })
    .from(bookingGuests)
    .innerJoin(bookings, eq(bookings.id, bookingGuests.bookingId))
    .where(
      and(
        eq(bookings.lodgeId, lodgeId),
        sql`${bookings.status} NOT IN ('CANCELLED')`,
        lt(bookings.checkInDate, checkOutDate),
        sql`${bookings.checkOutDate} > ${checkInDate}`
      )
    );

  const bookedBedIds = new Set(
    bookedRows.filter((r) => r.bedId !== null).map((r) => r.bedId as string)
  );

  // Get held bed IDs (by other members)
  const otherHeldRows = await db
    .select({ bedId: bedHolds.bedId })
    .from(bedHolds)
    .where(
      and(
        eq(bedHolds.lodgeId, lodgeId),
        ne(bedHolds.memberId, currentMemberId),
        gte(bedHolds.expiresAt, new Date()),
        lt(bedHolds.checkInDate, checkOutDate),
        sql`${bedHolds.checkOutDate} > ${checkInDate}`
      )
    );

  const otherHeldBedIds = new Set(otherHeldRows.map((r) => r.bedId));

  // Get held bed IDs by the current member
  const myHeldRows = await db
    .select({ bedId: bedHolds.bedId })
    .from(bedHolds)
    .where(
      and(
        eq(bedHolds.lodgeId, lodgeId),
        eq(bedHolds.memberId, currentMemberId),
        gte(bedHolds.expiresAt, new Date()),
        lt(bedHolds.checkInDate, checkOutDate),
        sql`${bedHolds.checkOutDate} > ${checkInDate}`
      )
    );

  const myHeldBedIds = new Set(myHeldRows.map((r) => r.bedId));

  // Build the availability map
  const bedsWithStatus = _buildBedAvailabilityMap(allBeds, bookedBedIds, otherHeldBedIds, myHeldBedIds);

  // Group beds by room
  return lodgeRooms.map((room) => ({
    ...room,
    beds: bedsWithStatus.filter((b) => b.roomId === room.id),
  }));
}
