"use server";

import { db } from "@/db/index";
import {
  bookings,
  bookingGuests,
  transactions,
  bedHolds,
  availabilityCache,
  members,
  tariffs,
  seasons,
  bookingRounds,
} from "@/db/schema";
import { eq, and, sql, lt } from "drizzle-orm";
import { getSessionMember } from "@/lib/auth";
import { createBookingSchema, type CreateBookingInput } from "./schemas";
import { generateBookingReference } from "./reference";
import {
  calculateGuestPrice,
  calculateBookingPrice,
  countNights,
  getNightDates,
  type GuestPriceResult,
} from "./pricing";
import { validateBookingDates } from "@/actions/availability/validation";
import { revalidatePath } from "next/cache";

type CreateBookingResult = {
  success: boolean;
  error?: string;
  bookingReference?: string;
  bookingId?: string;
};

/**
 * Validate the booking input against the Zod schema.
 * Exported for testing.
 */
export function validateCreateBookingInput(input: unknown): {
  valid: boolean;
  errors: string[];
  data?: CreateBookingInput;
} {
  const parsed = createBookingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((i) => i.message),
    };
  }
  return { valid: true, errors: [], data: parsed.data };
}

/**
 * Create a booking with full concurrency handling.
 *
 * 1. Auth + eligibility check
 * 2. BEGIN TRANSACTION
 * 3. SELECT FOR UPDATE on availability_cache rows
 * 4. Verify beds still available
 * 5. Re-validate booking rules
 * 6. Calculate final pricing
 * 7. Insert booking, guests, transaction
 * 8. Update availability_cache
 * 9. Delete bed holds
 * 10. COMMIT
 */
export async function createBooking(
  input: CreateBookingInput,
  slug: string
): Promise<CreateBookingResult> {
  // 1. Validate input schema
  const validation = validateCreateBookingInput(input);
  if (!validation.valid || !validation.data) {
    return { success: false, error: validation.errors[0] };
  }

  const data = validation.data;

  // 2. Auth check
  const session = await getSessionMember(data.organisationId);
  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  // 3. Check member is financial
  const [member] = await db
    .select({
      isFinancial: members.isFinancial,
      membershipClassId: members.membershipClassId,
    })
    .from(members)
    .where(eq(members.id, session.memberId));

  if (!member?.isFinancial) {
    return {
      success: false,
      error: "Your membership is not currently financial",
    };
  }

  // 4. Re-validate booking dates server-side
  const dateValidation = await validateBookingDates({
    lodgeId: data.lodgeId,
    checkIn: data.checkInDate,
    checkOut: data.checkOutDate,
    bookingRoundId: data.bookingRoundId,
    memberId: session.memberId,
  });

  if (!dateValidation.valid) {
    return { success: false, error: dateValidation.errors[0] };
  }

  // 5. Get booking round for requiresApproval
  const [round] = await db
    .select({ requiresApproval: bookingRounds.requiresApproval })
    .from(bookingRounds)
    .where(eq(bookingRounds.id, data.bookingRoundId));

  if (!round) {
    return { success: false, error: "Booking round not found" };
  }

  const nights = countNights(data.checkInDate, data.checkOutDate);
  const nightDates = getNightDates(data.checkInDate, data.checkOutDate);

  // 6. Get season for tariff lookup
  const [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(
      and(
        eq(seasons.isActive, true),
        sql`${seasons.startDate} <= ${data.checkInDate}`,
        sql`${seasons.endDate} >= ${data.checkInDate}`
      )
    );

  if (!season) {
    return { success: false, error: "No active season found for these dates" };
  }

  // 7. Transactional booking creation
  try {
    const result = await db.transaction(async (tx) => {
      // SELECT FOR UPDATE on availability_cache rows to lock them
      const lockedRows = await tx.execute(
        sql`SELECT id, booked_beds, version FROM availability_cache
            WHERE lodge_id = ${data.lodgeId}
            AND date >= ${data.checkInDate}
            AND date < ${data.checkOutDate}
            FOR UPDATE`
      );

      // Verify each selected bed is not already booked
      for (const guest of data.guests) {
        const conflicting = await tx.execute(
          sql`SELECT bg.bed_id FROM booking_guests bg
              JOIN bookings b ON b.id = bg.booking_id
              WHERE bg.bed_id = ${guest.bedId}
              AND b.lodge_id = ${data.lodgeId}
              AND b.status NOT IN ('CANCELLED')
              AND b.check_in_date < ${data.checkOutDate}
              AND b.check_out_date > ${data.checkInDate}`
        );

        if (conflicting && (conflicting as unknown[]).length > 0) {
          throw new Error(`Bed is no longer available`);
        }
      }

      // Calculate pricing per guest
      const guestPrices: { memberId: string; bedId: string; roomId?: string; price: GuestPriceResult; tariffId: string | null; membershipClassId: string | null }[] = [];

      for (const guest of data.guests) {
        // Get guest's membership class
        const [guestMember] = await tx
          .select({ membershipClassId: members.membershipClassId })
          .from(members)
          .where(eq(members.id, guest.memberId));

        const guestClassId = guestMember?.membershipClassId ?? null;

        // Look up tariff: class-specific first, then default
        let tariff = null;
        if (guestClassId) {
          const [classTariff] = await tx
            .select()
            .from(tariffs)
            .where(
              and(
                eq(tariffs.lodgeId, data.lodgeId),
                eq(tariffs.seasonId, season.id),
                eq(tariffs.membershipClassId, guestClassId)
              )
            );
          tariff = classTariff ?? null;
        }

        if (!tariff) {
          // Fallback to default tariff (null membershipClassId)
          const [defaultTariff] = await tx
            .select()
            .from(tariffs)
            .where(
              and(
                eq(tariffs.lodgeId, data.lodgeId),
                eq(tariffs.seasonId, season.id),
                sql`${tariffs.membershipClassId} IS NULL`
              )
            );
          tariff = defaultTariff ?? null;
        }

        if (!tariff) {
          throw new Error(
            "No tariff found for this lodge and season. Contact your administrator."
          );
        }

        const price = calculateGuestPrice({
          checkInDate: data.checkInDate,
          checkOutDate: data.checkOutDate,
          pricePerNightWeekdayCents: tariff.pricePerNightWeekdayCents,
          pricePerNightWeekendCents: tariff.pricePerNightWeekendCents,
          discountFiveNightsBps: tariff.discountFiveNightsBps,
          discountSevenNightsBps: tariff.discountSevenNightsBps,
        });

        guestPrices.push({
          memberId: guest.memberId,
          bedId: guest.bedId,
          roomId: guest.roomId,
          price,
          tariffId: tariff.id,
          membershipClassId: guestClassId,
        });
      }

      const bookingTotal = calculateBookingPrice(
        guestPrices.map((g) => g.price)
      );

      // Generate reference
      const bookingReference = generateBookingReference(slug);
      const status = round.requiresApproval ? "PENDING" : "CONFIRMED";

      // Insert booking
      const [booking] = await tx
        .insert(bookings)
        .values({
          organisationId: data.organisationId,
          lodgeId: data.lodgeId,
          bookingRoundId: data.bookingRoundId,
          primaryMemberId: session.memberId,
          status,
          checkInDate: data.checkInDate,
          checkOutDate: data.checkOutDate,
          totalNights: nights,
          subtotalCents: bookingTotal.subtotalCents,
          discountAmountCents: bookingTotal.discountAmountCents,
          totalAmountCents: bookingTotal.totalAmountCents,
          requiresApproval: round.requiresApproval,
          bookingReference,
        })
        .returning();

      // Insert booking guests
      for (const gp of guestPrices) {
        await tx.insert(bookingGuests).values({
          bookingId: booking.id,
          memberId: gp.memberId,
          bedId: gp.bedId,
          roomId: gp.roomId ?? null,
          pricePerNightCents: gp.price.blendedPerNightCents,
          totalAmountCents: gp.price.totalCents,
          snapshotTariffId: gp.tariffId,
          snapshotMembershipClassId: gp.membershipClassId,
        });
      }

      // Insert transaction (invoice)
      await tx.insert(transactions).values({
        organisationId: data.organisationId,
        memberId: session.memberId,
        bookingId: booking.id,
        type: "INVOICE",
        amountCents: bookingTotal.totalAmountCents,
        description: `Booking ${bookingReference} — ${nights} nights at lodge`,
      });

      // Update availability_cache — increment bookedBeds for each night
      for (const nightDate of nightDates) {
        await tx.execute(
          sql`UPDATE availability_cache
              SET booked_beds = booked_beds + ${data.guests.length},
                  version = version + 1,
                  updated_at = NOW()
              WHERE lodge_id = ${data.lodgeId}
              AND date = ${nightDate}`
        );
      }

      // Delete bed holds for this member/round
      await tx
        .delete(bedHolds)
        .where(
          and(
            eq(bedHolds.memberId, session.memberId),
            eq(bedHolds.bookingRoundId, data.bookingRoundId)
          )
        );

      return {
        bookingReference: booking.bookingReference,
        bookingId: booking.id,
      };
    });

    revalidatePath(`/${slug}/dashboard`);
    revalidatePath(`/${slug}/book`);

    return {
      success: true,
      bookingReference: result.bookingReference,
      bookingId: result.bookingId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Booking failed";

    if (message.includes("no longer available") || message.includes("Bed")) {
      return {
        success: false,
        error: "One or more beds are no longer available. Please go back and reselect.",
      };
    }

    return { success: false, error: message };
  }
}
