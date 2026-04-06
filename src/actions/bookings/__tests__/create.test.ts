import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTransaction = vi.fn();
const mockGetSessionMember = vi.fn();
const mockGetMember = vi.fn();
const mockValidateBookingDates = vi.fn();
const mockGenerateBookingReference = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    transaction: (fn: Function) => mockTransaction(fn),
  },
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: (...args: unknown[]) => mockGetSessionMember(...args),
}));

vi.mock("../reference", () => ({
  generateBookingReference: (...args: unknown[]) =>
    mockGenerateBookingReference(...args),
}));

vi.mock("@/actions/availability/validation", () => ({
  validateBookingDates: (...args: unknown[]) =>
    mockValidateBookingDates(...args),
}));

vi.mock("@/db/schema", () => ({
  bookings: { id: "id", lodgeId: "lodge_id", status: "status" },
  bookingGuests: { id: "id" },
  transactions: { id: "id" },
  bedHolds: { memberId: "member_id", bookingRoundId: "booking_round_id" },
  availabilityCache: {
    lodgeId: "lodge_id",
    date: "date",
    bookedBeds: "booked_beds",
    version: "version",
  },
  members: { id: "id", membershipClassId: "membership_class_id", isFinancial: "is_financial" },
  tariffs: { id: "id", lodgeId: "lodge_id", seasonId: "season_id", membershipClassId: "membership_class_id" },
  seasons: { id: "id" },
  bookingRounds: { id: "id", requiresApproval: "requires_approval" },
}));

import { validateCreateBookingInput } from "../create";

describe("validateCreateBookingInput", () => {
  it("rejects invalid schema input", () => {
    const result = validateCreateBookingInput({
      organisationId: "bad",
      lodgeId: "bad",
      bookingRoundId: "bad",
      checkInDate: "bad",
      checkOutDate: "bad",
      guests: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("accepts valid input", () => {
    const result = validateCreateBookingInput({
      organisationId: "550e8400-e29b-41d4-a716-446655440000",
      lodgeId: "660e8400-e29b-41d4-a716-446655440000",
      bookingRoundId: "770e8400-e29b-41d4-a716-446655440000",
      checkInDate: "2027-07-10",
      checkOutDate: "2027-07-13",
      guests: [
        {
          memberId: "880e8400-e29b-41d4-a716-446655440000",
          bedId: "990e8400-e29b-41d4-a716-446655440000",
        },
      ],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects when checkOut is before checkIn", () => {
    const result = validateCreateBookingInput({
      organisationId: "550e8400-e29b-41d4-a716-446655440000",
      lodgeId: "660e8400-e29b-41d4-a716-446655440000",
      bookingRoundId: "770e8400-e29b-41d4-a716-446655440000",
      checkInDate: "2027-07-13",
      checkOutDate: "2027-07-10",
      guests: [
        {
          memberId: "880e8400-e29b-41d4-a716-446655440000",
          bedId: "990e8400-e29b-41d4-a716-446655440000",
        },
      ],
    });
    expect(result.valid).toBe(false);
  });
});
