import { applyBasisPoints } from "@/lib/currency";

export function countNights(checkIn: string, checkOut: string): number {
  const start = new Date(checkIn + "T00:00:00Z");
  const end = new Date(checkOut + "T00:00:00Z");
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Get the date string for each night of the stay.
 * A "night" is the check-in date through the day before check-out.
 */
export function getNightDates(checkIn: string, checkOut: string): string[] {
  const dates: string[] = [];
  const current = new Date(checkIn + "T00:00:00Z");
  const end = new Date(checkOut + "T00:00:00Z");

  while (current < end) {
    dates.push(current.toISOString().split("T")[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

/**
 * Check if a night (by check-in date) should be charged at the weekend rate.
 * Weekend nights are Friday and Saturday — the premium nights for accommodation.
 * This differs from calendar weekends (Sat/Sun) because we're pricing the night,
 * not the day.
 */
export function isWeekendNight(dateStr: string): boolean {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay(); // 0=Sun, 5=Fri, 6=Sat
  return day === 5 || day === 6; // Friday night and Saturday night
}

type NightBreakdown = {
  date: string;
  isWeekend: boolean;
  priceCents: number;
};

export type GuestPriceResult = {
  subtotalCents: number;
  discountAmountCents: number;
  totalCents: number;
  blendedPerNightCents: number;
  nightBreakdown: NightBreakdown[];
};

type GuestPriceInput = {
  checkInDate: string;
  checkOutDate: string;
  pricePerNightWeekdayCents: number;
  pricePerNightWeekendCents: number;
  discountFiveNightsBps: number;
  discountSevenNightsBps: number;
};

/**
 * Calculate the price for a single guest's stay.
 *
 * Per-night rate based on weekday/weekend. Multi-night discounts:
 * - 7+ nights: discountSevenNightsBps (takes priority)
 * - 5-6 nights: discountFiveNightsBps
 * All arithmetic in integer cents, no floats.
 */
export function calculateGuestPrice(input: GuestPriceInput): GuestPriceResult {
  const nights = getNightDates(input.checkInDate, input.checkOutDate);
  const nightCount = nights.length;

  const nightBreakdown: NightBreakdown[] = nights.map((date) => {
    const weekend = isWeekendNight(date);
    return {
      date,
      isWeekend: weekend,
      priceCents: weekend
        ? input.pricePerNightWeekendCents
        : input.pricePerNightWeekdayCents,
    };
  });

  const subtotalCents = nightBreakdown.reduce(
    (sum, n) => sum + n.priceCents,
    0
  );

  // Determine discount tier
  let discountBps = 0;
  if (nightCount >= 7 && input.discountSevenNightsBps > 0) {
    discountBps = input.discountSevenNightsBps;
  } else if (nightCount >= 5 && input.discountFiveNightsBps > 0) {
    discountBps = input.discountFiveNightsBps;
  }

  const discountAmountCents =
    discountBps > 0 ? applyBasisPoints(subtotalCents, discountBps) : 0;
  const totalCents = subtotalCents - discountAmountCents;

  const blendedPerNightCents =
    nightCount > 0 ? Math.floor(totalCents / nightCount) : 0;

  return {
    subtotalCents,
    discountAmountCents,
    totalCents,
    blendedPerNightCents,
    nightBreakdown,
  };
}

export type BookingPriceResult = {
  subtotalCents: number;
  discountAmountCents: number;
  totalAmountCents: number;
};

/**
 * Calculate the total booking price from guest price results.
 */
export function calculateBookingPrice(
  guestPrices: GuestPriceResult[]
): BookingPriceResult {
  const subtotalCents = guestPrices.reduce(
    (sum, g) => sum + g.subtotalCents,
    0
  );
  const discountAmountCents = guestPrices.reduce(
    (sum, g) => sum + g.discountAmountCents,
    0
  );
  const totalAmountCents = guestPrices.reduce(
    (sum, g) => sum + g.totalCents,
    0
  );

  return { subtotalCents, discountAmountCents, totalAmountCents };
}
