"use server";

import { db } from "@/db/index";
import { bookings, bookingGuests, beds, rooms } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireSession, requireRole, authErrorToResult } from "@/lib/auth-guards";

type Assignment = { bookingGuestId: string; bedId: string };

type ReassignInput = {
  bookingId: string;
  organisationId: string;
  assignments: Assignment[];
  slug: string;
};

type ReassignResult = { success: boolean; error?: string };

export async function reassignBeds(input: ReassignInput): Promise<ReassignResult> {
  try {
    const session = await requireSession(input.organisationId);
    requireRole(session, "BOOKING_OFFICER");

  const [booking] = await db
    .select({
      id: bookings.id,
      lodgeId: bookings.lodgeId,
      checkInDate: bookings.checkInDate,
      checkOutDate: bookings.checkOutDate,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.id, input.bookingId),
        eq(bookings.organisationId, input.organisationId)
      )
    );

  if (!booking) {
    return { success: false, error: "Booking not found" };
  }

  for (const assignment of input.assignments) {
    const [bed] = await db
      .select({ id: beds.id, roomId: beds.roomId, lodgeId: rooms.lodgeId })
      .from(beds)
      .innerJoin(rooms, eq(rooms.id, beds.roomId))
      .where(eq(beds.id, assignment.bedId));

    if (!bed || bed.lodgeId !== booking.lodgeId) {
      return { success: false, error: "Bed does not belong to this lodge" };
    }

    const conflicting = await db.execute(
      sql`SELECT bg.bed_id FROM booking_guests bg
          JOIN bookings b ON b.id = bg.booking_id
          WHERE bg.bed_id = ${assignment.bedId}
          AND b.id != ${input.bookingId}
          AND b.lodge_id = ${booking.lodgeId}
          AND b.status NOT IN ('CANCELLED')
          AND b.check_in_date < ${booking.checkOutDate}
          AND b.check_out_date > ${booking.checkInDate}`
    );

    if (conflicting && (conflicting as unknown[]).length > 0) {
      return { success: false, error: "Bed is booked by another guest for these dates" };
    }

    await db
      .update(bookingGuests)
      .set({ bedId: assignment.bedId, roomId: bed.roomId })
      .where(eq(bookingGuests.id, assignment.bookingGuestId));
  }

  revalidatePath(`/${input.slug}/admin/bookings/${input.bookingId}`);
  return { success: true };
  } catch (e) {
    const authResult = authErrorToResult(e);
    if (authResult) return authResult;
    throw e;
  }
}
