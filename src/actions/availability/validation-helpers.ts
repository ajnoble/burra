import { db } from "@/db/index";
import {
  seasons,
  bookingRounds,
  availabilityCache,
  bookings,
  bookingGuests,
  tariffs,
} from "@/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

export async function getSeasonForDates(
  lodgeId: string,
  checkIn: string,
  checkOut: string
) {
  const lastNight = new Date(checkOut + "T00:00:00Z");
  lastNight.setUTCDate(lastNight.getUTCDate() - 1);
  const lastNightStr = lastNight.toISOString().split("T")[0];

  const [season] = await db
    .select()
    .from(seasons)
    .where(
      and(
        eq(seasons.isActive, true),
        lte(seasons.startDate, checkIn),
        gte(seasons.endDate, lastNightStr)
      )
    );

  return season ?? null;
}

export async function getBookingRound(bookingRoundId: string) {
  const [round] = await db
    .select()
    .from(bookingRounds)
    .where(eq(bookingRounds.id, bookingRoundId));

  return round ?? null;
}

export async function getDateRangeAvailabilityForValidation(
  lodgeId: string,
  checkIn: string,
  checkOut: string
) {
  const lastNight = new Date(checkOut + "T00:00:00Z");
  lastNight.setUTCDate(lastNight.getUTCDate() - 1);
  const lastNightStr = lastNight.toISOString().split("T")[0];

  return db
    .select({
      date: availabilityCache.date,
      totalBeds: availabilityCache.totalBeds,
      bookedBeds: availabilityCache.bookedBeds,
    })
    .from(availabilityCache)
    .where(
      and(
        eq(availabilityCache.lodgeId, lodgeId),
        gte(availabilityCache.date, checkIn),
        lte(availabilityCache.date, lastNightStr)
      )
    )
    .orderBy(availabilityCache.date);
}

export async function getMemberBookedNightsInRound(
  memberId: string,
  bookingRoundId: string,
  excludeBookingId?: string
) {
  const result = await db
    .select({ totalNights: sql<number>`COALESCE(SUM(${bookings.totalNights}), 0)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.primaryMemberId, memberId),
        eq(bookings.bookingRoundId, bookingRoundId),
        sql`${bookings.status} NOT IN ('CANCELLED')`,
        ...(excludeBookingId ? [sql`${bookings.id} != ${excludeBookingId}`] : [])
      )
    );

  return Number(result[0]?.totalNights ?? 0);
}

export async function getTariffForValidation(
  lodgeId: string,
  seasonId: string
) {
  const result = await db
    .select({ minimumNights: tariffs.minimumNights })
    .from(tariffs)
    .where(
      and(eq(tariffs.lodgeId, lodgeId), eq(tariffs.seasonId, seasonId))
    );

  if (result.length === 0) return { minimumNights: 1 };

  const maxMinNights = Math.max(...result.map((r) => r.minimumNights));
  return { minimumNights: maxMinNights };
}

/**
 * Get availability for a date range, subtracting the guest count of an excluded booking
 * from bookedBeds for dates that overlap with the excluded booking.
 */
export async function getAvailabilityExcludingBooking(
  lodgeId: string,
  checkIn: string,
  checkOut: string,
  excludeBookingId: string
) {
  // Get the excluded booking's date range and guest count
  const [excludedBooking] = await db
    .select({
      checkInDate: bookings.checkInDate,
      checkOutDate: bookings.checkOutDate,
    })
    .from(bookings)
    .where(eq(bookings.id, excludeBookingId));

  const excludedGuestCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(bookingGuests)
    .where(eq(bookingGuests.bookingId, excludeBookingId));

  const guestCount = Number(excludedGuestCount[0]?.count ?? 0);

  // Get base availability
  const availability = await getDateRangeAvailabilityForValidation(
    lodgeId,
    checkIn,
    checkOut
  );

  if (!excludedBooking || guestCount === 0) return availability;

  // Subtract excluded booking's beds from overlapping dates
  return availability.map((day) => {
    const dayOverlaps =
      day.date >= excludedBooking.checkInDate &&
      day.date < excludedBooking.checkOutDate;

    return {
      ...day,
      bookedBeds: dayOverlaps
        ? Math.max(day.bookedBeds - guestCount, 0)
        : day.bookedBeds,
    };
  });
}
