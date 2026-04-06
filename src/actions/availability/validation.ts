import { validateBookingDatesSchema } from "./schemas";
import {
  getSeasonForDates,
  getBookingRound,
  getDateRangeAvailabilityForValidation,
  getMemberBookedNightsInRound,
  getTariffForValidation,
} from "./validation-helpers";

type ValidationResult = {
  valid: boolean;
  errors: string[];
};

function countNights(checkIn: string, checkOut: string): number {
  const start = new Date(checkIn + "T00:00:00Z");
  const end = new Date(checkOut + "T00:00:00Z");
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export async function validateBookingDates(input: {
  lodgeId: string;
  checkIn: string;
  checkOut: string;
  bookingRoundId: string;
  memberId: string;
}): Promise<ValidationResult> {
  const parsed = validateBookingDatesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((i) => i.message),
    };
  }

  const { lodgeId, checkIn, checkOut, bookingRoundId, memberId } = parsed.data;
  const errors: string[] = [];
  const nights = countNights(checkIn, checkOut);

  // Rule 6: No past dates
  const today = new Date().toISOString().split("T")[0];
  if (checkIn < today) {
    errors.push("Check-in date cannot be in the past");
  }

  // Rule 1: Within season
  const season = await getSeasonForDates(lodgeId, checkIn, checkOut);
  if (!season) {
    errors.push("Dates are not within an active season");
  }

  // Rule 2: Within booking round
  const round = await getBookingRound(bookingRoundId);
  if (!round) {
    errors.push("Booking round not found");
  } else {
    const checkInDate = new Date(checkIn + "T00:00:00Z");
    if (checkInDate < round.opensAt || checkInDate > round.closesAt) {
      errors.push("Booking round is not currently open");
    }

    // Rule 4: Max nights per booking
    if (round.maxNightsPerBooking && nights > round.maxNightsPerBooking) {
      errors.push(
        `Maximum ${round.maxNightsPerBooking} nights per booking in this round`
      );
    }

    // Rule 5: Max nights per member
    if (round.maxNightsPerMember) {
      const existingNights = await getMemberBookedNightsInRound(
        memberId,
        bookingRoundId
      );
      if (existingNights + nights > round.maxNightsPerMember) {
        errors.push(
          `This booking would exceed your ${round.maxNightsPerMember}-night limit for this round (${existingNights} nights already booked)`
        );
      }
    }
  }

  // Rule 3: Minimum nights
  if (season) {
    const tariff = await getTariffForValidation(lodgeId, season.id);
    if (nights < tariff.minimumNights) {
      errors.push(
        `A minimum of ${tariff.minimumNights} nights is required`
      );
    }
  }

  // Rule 7: Sufficient availability
  const availability = await getDateRangeAvailabilityForValidation(
    lodgeId,
    checkIn,
    checkOut
  );

  if (availability.length < nights) {
    errors.push(
      "No availability data for some dates in this range — the season may not be set up yet"
    );
  } else {
    for (const day of availability) {
      const available = day.totalBeds - day.bookedBeds;
      if (available <= 0) {
        errors.push(`No availability on ${day.date}`);
        break;
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
