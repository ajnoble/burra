"use server";

import { db } from "@/db/index";
import { bedHolds, bookingRounds } from "@/db/schema";
import { eq, and, lt, gte, ne, sql } from "drizzle-orm";
import { bedHoldInputSchema } from "./schemas";

/**
 * Check if a hold has expired.
 */
export function isHoldExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() <= Date.now();
}

/**
 * Calculate the expiration timestamp from now + minutes.
 */
export function calculateExpiresAt(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

/**
 * Remove all expired bed holds. Called lazily before queries.
 */
export async function cleanupExpiredHolds(): Promise<number> {
  const deleted = await db
    .delete(bedHolds)
    .where(lt(bedHolds.expiresAt, new Date()))
    .returning();

  return deleted.length;
}

type CreateBedHoldResult = {
  success: boolean;
  error?: string;
  holdId?: string;
  expiresAt?: Date;
};

/**
 * Create a timed bed hold for a member during the booking flow.
 *
 * Returns early if the booking round has no holdDurationMinutes (holds disabled).
 * Checks for conflicting holds/bookings before inserting.
 */
export async function createBedHold(
  input: {
    lodgeId: string;
    bedId: string;
    bookingRoundId: string;
    checkInDate: string;
    checkOutDate: string;
  },
  memberId: string
): Promise<CreateBedHoldResult> {
  const parsed = bedHoldInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Validation failed",
    };
  }

  // Get booking round to check hold duration
  const [round] = await db
    .select({ holdDurationMinutes: bookingRounds.holdDurationMinutes })
    .from(bookingRounds)
    .where(eq(bookingRounds.id, input.bookingRoundId));

  if (!round || round.holdDurationMinutes === null) {
    // Holds disabled for this round
    return { success: true };
  }

  // Clean up expired holds
  await cleanupExpiredHolds();

  // Check for existing non-expired holds on this bed for overlapping dates
  const existingHolds = await db
    .select({ id: bedHolds.id })
    .from(bedHolds)
    .where(
      and(
        eq(bedHolds.bedId, input.bedId),
        ne(bedHolds.memberId, memberId),
        gte(bedHolds.expiresAt, new Date()),
        lt(bedHolds.checkInDate, input.checkOutDate),
        sql`${bedHolds.checkOutDate} > ${input.checkInDate}`
      )
    );

  if (existingHolds.length > 0) {
    return {
      success: false,
      error: "This bed is currently held by another member",
    };
  }

  // Remove any existing hold by this member on this bed (re-selection)
  await db
    .delete(bedHolds)
    .where(
      and(
        eq(bedHolds.bedId, input.bedId),
        eq(bedHolds.memberId, memberId)
      )
    );

  const expiresAt = calculateExpiresAt(round.holdDurationMinutes);

  const [hold] = await db
    .insert(bedHolds)
    .values({
      lodgeId: input.lodgeId,
      bedId: input.bedId,
      memberId,
      bookingRoundId: input.bookingRoundId,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      expiresAt,
    })
    .returning();

  return {
    success: true,
    holdId: hold.id,
    expiresAt,
  };
}

/**
 * Release a specific bed hold.
 */
export async function releaseBedHold(
  bedId: string,
  memberId: string
): Promise<{ success: boolean }> {
  await db
    .delete(bedHolds)
    .where(
      and(eq(bedHolds.bedId, bedId), eq(bedHolds.memberId, memberId))
    );

  return { success: true };
}

/**
 * Release all holds for a member in a booking round (called after booking confirmation).
 */
export async function releaseAllMemberHolds(
  memberId: string,
  bookingRoundId: string
): Promise<void> {
  await db
    .delete(bedHolds)
    .where(
      and(
        eq(bedHolds.memberId, memberId),
        eq(bedHolds.bookingRoundId, bookingRoundId)
      )
    );
}
