import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbSelect = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => mockDbSelect(),
      }),
    }),
  },
}));

import {
  calculateGuestPrice,
  calculateBookingPrice,
  calculatePortaCotPrice,
  countNights,
  getNightDates,
  isWeekendNight,
} from "../pricing";

describe("isWeekendNight", () => {
  it("returns true for Friday", () => {
    expect(isWeekendNight("2025-07-11")).toBe(true); // Friday
  });

  it("returns true for Saturday", () => {
    expect(isWeekendNight("2025-07-12")).toBe(true); // Saturday
  });

  it("returns false for Sunday", () => {
    expect(isWeekendNight("2025-07-13")).toBe(false); // Sunday
  });

  it("returns false for Monday", () => {
    expect(isWeekendNight("2025-07-07")).toBe(false); // Monday
  });

  it("returns false for Thursday", () => {
    expect(isWeekendNight("2025-07-10")).toBe(false); // Thursday
  });
});

describe("countNights", () => {
  it("counts 3 nights for a 3-day stay", () => {
    expect(countNights("2025-07-10", "2025-07-13")).toBe(3);
  });

  it("counts 1 night for consecutive dates", () => {
    expect(countNights("2025-07-10", "2025-07-11")).toBe(1);
  });

  it("counts 7 nights for a week", () => {
    expect(countNights("2025-07-07", "2025-07-14")).toBe(7);
  });
});

describe("getNightDates", () => {
  it("returns dates for each night (check-in to day before check-out)", () => {
    const dates = getNightDates("2025-07-10", "2025-07-13");
    expect(dates).toEqual(["2025-07-10", "2025-07-11", "2025-07-12"]);
  });

  it("returns single date for 1-night stay", () => {
    const dates = getNightDates("2025-07-10", "2025-07-11");
    expect(dates).toEqual(["2025-07-10"]);
  });
});

describe("calculateGuestPrice", () => {
  it("calculates weekday-only stay", () => {
    // Mon Jul 7 to Thu Jul 10 = 3 weekday nights
    const result = calculateGuestPrice({
      checkInDate: "2025-07-07", // Monday
      checkOutDate: "2025-07-10", // Thursday
      pricePerNightWeekdayCents: 5000,
      pricePerNightWeekendCents: 7000,
      discountFiveNightsBps: 500,
      discountSevenNightsBps: 1000,
    });
    expect(result.subtotalCents).toBe(15000); // 3 * 5000
    expect(result.discountAmountCents).toBe(0); // < 5 nights
    expect(result.totalCents).toBe(15000);
  });

  it("calculates weekend-only stay", () => {
    // Fri Jul 11 to Sun Jul 13 = Fri night + Sat night (both weekend)
    const result = calculateGuestPrice({
      checkInDate: "2025-07-11", // Friday
      checkOutDate: "2025-07-13", // Sunday
      pricePerNightWeekdayCents: 5000,
      pricePerNightWeekendCents: 7000,
      discountFiveNightsBps: 0,
      discountSevenNightsBps: 0,
    });
    // Friday and Saturday are both weekend nights
    expect(result.subtotalCents).toBe(14000); // 2 * 7000
    expect(result.totalCents).toBe(14000);
  });

  it("calculates mixed weekday/weekend stay", () => {
    // Thu Jul 10 to Mon Jul 14 = Thu(wd), Fri(we), Sat(we), Sun(we) = 4 nights
    const result = calculateGuestPrice({
      checkInDate: "2025-07-08", // Tuesday
      checkOutDate: "2025-07-13", // Sunday
      pricePerNightWeekdayCents: 5000,
      pricePerNightWeekendCents: 7000,
      discountFiveNightsBps: 500,
      discountSevenNightsBps: 1000,
    });
    // Tue(wd) Wed(wd) Thu(wd) Fri(we) Sat(we) = 3*5000 + 2*7000 = 29000
    expect(result.subtotalCents).toBe(29000);
    expect(result.discountAmountCents).toBe(1450); // 5% of 29000 = 1450
    expect(result.totalCents).toBe(27550); // 29000 - 1450
  });

  it("applies 5-night discount for exactly 5 nights", () => {
    const result = calculateGuestPrice({
      checkInDate: "2025-07-07", // Monday
      checkOutDate: "2025-07-12", // Saturday
      pricePerNightWeekdayCents: 5000,
      pricePerNightWeekendCents: 7000,
      discountFiveNightsBps: 500,
      discountSevenNightsBps: 1000,
    });
    // Mon-Fri = 4 weekdays + Fri(weekend) = 4*5000 + 1*7000 = 27000
    expect(result.subtotalCents).toBe(27000);
    // 5% of 27000 = 1350
    expect(result.discountAmountCents).toBe(1350);
    expect(result.totalCents).toBe(25650);
  });

  it("applies 5-night discount for 6 nights", () => {
    const result = calculateGuestPrice({
      checkInDate: "2025-07-07", // Monday
      checkOutDate: "2025-07-13", // Sunday
      pricePerNightWeekdayCents: 5000,
      pricePerNightWeekendCents: 7000,
      discountFiveNightsBps: 500,
      discountSevenNightsBps: 1000,
    });
    // Mon-Fri(4wd) + Fri(we) + Sat(we) = 4*5000 + 2*7000 = 34000
    expect(result.subtotalCents).toBe(34000);
    // 5-night discount (6 nights still uses 5-night tier): 5% of 34000 = 1700
    expect(result.discountAmountCents).toBe(1700);
    expect(result.totalCents).toBe(32300);
  });

  it("applies 7-night discount for exactly 7 nights (overrides 5-night)", () => {
    const result = calculateGuestPrice({
      checkInDate: "2025-07-07", // Monday
      checkOutDate: "2025-07-14", // Monday
      pricePerNightWeekdayCents: 5000,
      pricePerNightWeekendCents: 7000,
      discountFiveNightsBps: 500,
      discountSevenNightsBps: 1000,
    });
    // Mon-Thu(4wd) + Fri(we) + Sat(we) + Sun(wd) = 5*5000 + 2*7000 = 39000
    expect(result.subtotalCents).toBe(39000);
    // 10% of 39000 = 3900 (7-night discount takes priority)
    expect(result.discountAmountCents).toBe(3900);
    expect(result.totalCents).toBe(35100);
  });

  it("applies 7-night discount for 10 nights", () => {
    const result = calculateGuestPrice({
      checkInDate: "2025-07-07", // Monday
      checkOutDate: "2025-07-17", // Thursday
      pricePerNightWeekdayCents: 5000,
      pricePerNightWeekendCents: 7000,
      discountFiveNightsBps: 500,
      discountSevenNightsBps: 1000,
    });
    // Mon-Thu(4wd) + Fri(we) + Sat(we) + Sun-Wed(4wd) = 8*5000 + 2*7000 = 54000
    expect(result.subtotalCents).toBe(54000);
    // 10% of 54000 = 5400
    expect(result.discountAmountCents).toBe(5400);
    expect(result.totalCents).toBe(48600);
  });

  it("returns zero discount when both discount rates are zero", () => {
    const result = calculateGuestPrice({
      checkInDate: "2025-07-07",
      checkOutDate: "2025-07-14",
      pricePerNightWeekdayCents: 5000,
      pricePerNightWeekendCents: 7000,
      discountFiveNightsBps: 0,
      discountSevenNightsBps: 0,
    });
    expect(result.discountAmountCents).toBe(0);
    expect(result.totalCents).toBe(result.subtotalCents);
  });

  it("returns per-night breakdown", () => {
    const result = calculateGuestPrice({
      checkInDate: "2025-07-10", // Thursday
      checkOutDate: "2025-07-13", // Sunday
      pricePerNightWeekdayCents: 5000,
      pricePerNightWeekendCents: 7000,
      discountFiveNightsBps: 0,
      discountSevenNightsBps: 0,
    });
    expect(result.nightBreakdown).toEqual([
      { date: "2025-07-10", isWeekend: false, priceCents: 5000 },
      { date: "2025-07-11", isWeekend: true, priceCents: 7000 },
      { date: "2025-07-12", isWeekend: true, priceCents: 7000 },
    ]);
  });

  it("calculates blended per-night average", () => {
    const result = calculateGuestPrice({
      checkInDate: "2025-07-10", // Thursday
      checkOutDate: "2025-07-13", // Sunday
      pricePerNightWeekdayCents: 5000,
      pricePerNightWeekendCents: 7000,
      discountFiveNightsBps: 0,
      discountSevenNightsBps: 0,
    });
    // (5000 + 7000 + 7000) / 3 = 6333.33 -> 6333
    expect(result.blendedPerNightCents).toBe(6333);
  });
});

describe("calculateBookingPrice", () => {
  it("sums multiple guest totals", () => {
    const guests = [
      {
        subtotalCents: 15000,
        discountAmountCents: 0,
        totalCents: 15000,
        blendedPerNightCents: 5000,
        nightBreakdown: [],
      },
      {
        subtotalCents: 21000,
        discountAmountCents: 1050,
        totalCents: 19950,
        blendedPerNightCents: 7000,
        nightBreakdown: [],
      },
    ];

    const result = calculateBookingPrice(guests);
    expect(result.subtotalCents).toBe(36000);
    expect(result.discountAmountCents).toBe(1050);
    expect(result.totalAmountCents).toBe(34950);
  });

  it("handles single guest", () => {
    const guests = [
      {
        subtotalCents: 10000,
        discountAmountCents: 500,
        totalCents: 9500,
        blendedPerNightCents: 5000,
        nightBreakdown: [],
      },
    ];

    const result = calculateBookingPrice(guests);
    expect(result.subtotalCents).toBe(10000);
    expect(result.discountAmountCents).toBe(500);
    expect(result.totalAmountCents).toBe(9500);
  });
});

describe("calculatePortaCotPrice", () => {
  it("calculates 3 nights at 2500 cents per night", () => {
    const result = calculatePortaCotPrice({
      checkInDate: "2025-07-07",
      checkOutDate: "2025-07-10",
      portaCotPricePerNightCents: 2500,
    });
    expect(result.nightCount).toBe(3);
    expect(result.pricePerNightCents).toBe(2500);
    expect(result.totalCents).toBe(7500);
  });

  it("calculates 1 night at 3000 cents per night", () => {
    const result = calculatePortaCotPrice({
      checkInDate: "2025-07-07",
      checkOutDate: "2025-07-08",
      portaCotPricePerNightCents: 3000,
    });
    expect(result.nightCount).toBe(1);
    expect(result.pricePerNightCents).toBe(3000);
    expect(result.totalCents).toBe(3000);
  });

  it("calculates 7 nights at 2000 cents per night", () => {
    const result = calculatePortaCotPrice({
      checkInDate: "2025-07-07",
      checkOutDate: "2025-07-14",
      portaCotPricePerNightCents: 2000,
    });
    expect(result.nightCount).toBe(7);
    expect(result.pricePerNightCents).toBe(2000);
    expect(result.totalCents).toBe(14000);
  });
});
