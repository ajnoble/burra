import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSeason = vi.fn();
const mockGetRound = vi.fn();
const mockGetAvailability = vi.fn();
const mockGetMemberNights = vi.fn();
const mockGetTariff = vi.fn();

vi.mock("../validation-helpers", () => ({
  getSeasonForDates: (...args: unknown[]) => mockGetSeason(...args),
  getBookingRound: (...args: unknown[]) => mockGetRound(...args),
  getDateRangeAvailabilityForValidation: (...args: unknown[]) => mockGetAvailability(...args),
  getMemberBookedNightsInRound: (...args: unknown[]) => mockGetMemberNights(...args),
  getTariffForValidation: (...args: unknown[]) => mockGetTariff(...args),
}));

import { validateBookingDates } from "../validation";

beforeEach(() => {
  vi.clearAllMocks();

  // Default: everything valid
  mockGetSeason.mockResolvedValue({
    id: "season-id",
    startDate: "2027-06-01",
    endDate: "2027-09-30",
    isActive: true,
  });
  mockGetRound.mockResolvedValue({
    id: "round-id",
    seasonId: "season-id",
    opensAt: new Date("2027-01-01T00:00:00Z"),
    closesAt: new Date("2027-12-31T23:59:59Z"),
    maxNightsPerBooking: 14,
    maxNightsPerMember: 28,
  });
  mockGetAvailability.mockResolvedValue([
    { date: "2027-07-10", totalBeds: 20, bookedBeds: 5 },
    { date: "2027-07-11", totalBeds: 20, bookedBeds: 5 },
    { date: "2027-07-12", totalBeds: 20, bookedBeds: 5 },
  ]);
  mockGetMemberNights.mockResolvedValue(0);
  mockGetTariff.mockResolvedValue({ minimumNights: 1 });
});

describe("validateBookingDates", () => {
  const validInput = {
    lodgeId: "550e8400-e29b-41d4-a716-446655440000",
    checkIn: "2027-07-10",
    checkOut: "2027-07-13",
    bookingRoundId: "660e8400-e29b-41d4-a716-446655440000",
    memberId: "770e8400-e29b-41d4-a716-446655440000",
  };

  it("returns valid for a good booking", async () => {
    const result = await validateBookingDates(validInput);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects dates outside season", async () => {
    mockGetSeason.mockResolvedValue(null);

    const result = await validateBookingDates(validInput);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Dates are not within an active season");
  });

  it("rejects when booking round is closed", async () => {
    mockGetRound.mockResolvedValue({
      id: "round-id",
      seasonId: "season-id",
      opensAt: new Date("2028-01-01T00:00:00Z"),
      closesAt: new Date("2028-12-31T23:59:59Z"),
      maxNightsPerBooking: 14,
      maxNightsPerMember: 28,
    });

    const result = await validateBookingDates(validInput);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Booking round is not currently open");
  });

  it("rejects past check-in dates", async () => {
    const result = await validateBookingDates({
      ...validInput,
      checkIn: "2020-01-01",
      checkOut: "2020-01-03",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Check-in date cannot be in the past");
  });

  it("rejects when below minimum nights", async () => {
    mockGetTariff.mockResolvedValue({ minimumNights: 5 });

    const result = await validateBookingDates(validInput); // 3 nights
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes("minimum"))).toBe(true);
  });

  it("rejects when exceeding max nights per booking", async () => {
    mockGetRound.mockResolvedValue({
      id: "round-id",
      seasonId: "season-id",
      opensAt: new Date("2027-01-01T00:00:00Z"),
      closesAt: new Date("2027-12-31T23:59:59Z"),
      maxNightsPerBooking: 2,
      maxNightsPerMember: 28,
    });

    const result = await validateBookingDates(validInput); // 3 nights
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes("Maximum"))).toBe(true);
  });

  it("rejects when exceeding max nights per member in round", async () => {
    mockGetRound.mockResolvedValue({
      id: "round-id",
      seasonId: "season-id",
      opensAt: new Date("2027-01-01T00:00:00Z"),
      closesAt: new Date("2027-12-31T23:59:59Z"),
      maxNightsPerBooking: 14,
      maxNightsPerMember: 5,
    });
    mockGetMemberNights.mockResolvedValue(4); // 4 existing + 3 new = 7 > 5

    const result = await validateBookingDates(validInput);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes("exceed"))).toBe(true);
  });

  it("rejects when no availability on a night", async () => {
    mockGetAvailability.mockResolvedValue([
      { date: "2027-07-10", totalBeds: 20, bookedBeds: 20 }, // full
      { date: "2027-07-11", totalBeds: 20, bookedBeds: 5 },
      { date: "2027-07-12", totalBeds: 20, bookedBeds: 5 },
    ]);

    const result = await validateBookingDates(validInput);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes("availability"))).toBe(true);
  });

  it("rejects when availability cache is missing for some dates", async () => {
    mockGetAvailability.mockResolvedValue([
      { date: "2027-07-10", totalBeds: 20, bookedBeds: 5 },
    ]);

    const result = await validateBookingDates(validInput);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes("availability"))).toBe(true);
  });

  it("collects multiple errors at once", async () => {
    mockGetSeason.mockResolvedValue(null);
    mockGetRound.mockResolvedValue(null);

    const result = await validateBookingDates({
      ...validInput,
      checkIn: "2020-01-01",
      checkOut: "2020-01-03",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});
