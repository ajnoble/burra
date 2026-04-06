import { describe, it, expect } from "vitest";
import {
  createBookingSchema,
  pricingInputSchema,
  bedHoldInputSchema,
} from "../schemas";

describe("createBookingSchema", () => {
  const validInput = {
    organisationId: "550e8400-e29b-41d4-a716-446655440000",
    lodgeId: "660e8400-e29b-41d4-a716-446655440000",
    bookingRoundId: "770e8400-e29b-41d4-a716-446655440000",
    checkInDate: "2027-07-10",
    checkOutDate: "2027-07-13",
    guests: [
      {
        memberId: "880e8400-e29b-41d4-a716-446655440000",
        bedId: "990e8400-e29b-41d4-a716-446655440000",
        roomId: "aa0e8400-e29b-41d4-a716-446655440000",
      },
    ],
  };

  it("accepts valid input", () => {
    const result = createBookingSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects empty guests array", () => {
    const result = createBookingSchema.safeParse({ ...validInput, guests: [] });
    expect(result.success).toBe(false);
  });

  it("rejects checkOut on or before checkIn", () => {
    const result = createBookingSchema.safeParse({
      ...validInput,
      checkInDate: "2027-07-13",
      checkOutDate: "2027-07-10",
    });
    expect(result.success).toBe(false);
  });

  it("rejects same-day checkIn and checkOut", () => {
    const result = createBookingSchema.safeParse({
      ...validInput,
      checkInDate: "2027-07-10",
      checkOutDate: "2027-07-10",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = createBookingSchema.safeParse({ ...validInput, checkInDate: "07/10/2027" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUID for lodgeId", () => {
    const result = createBookingSchema.safeParse({ ...validInput, lodgeId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("accepts guests without optional roomId", () => {
    const result = createBookingSchema.safeParse({
      ...validInput,
      guests: [{ memberId: "880e8400-e29b-41d4-a716-446655440000", bedId: "990e8400-e29b-41d4-a716-446655440000" }],
    });
    expect(result.success).toBe(true);
  });
});

describe("pricingInputSchema", () => {
  const validInput = {
    lodgeId: "550e8400-e29b-41d4-a716-446655440000",
    checkInDate: "2027-07-10",
    checkOutDate: "2027-07-13",
    guestMemberIds: ["880e8400-e29b-41d4-a716-446655440000"],
  };

  it("accepts valid input", () => {
    const result = pricingInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects empty guestMemberIds", () => {
    const result = pricingInputSchema.safeParse({ ...validInput, guestMemberIds: [] });
    expect(result.success).toBe(false);
  });

  it("accepts multiple guests", () => {
    const result = pricingInputSchema.safeParse({
      ...validInput,
      guestMemberIds: ["880e8400-e29b-41d4-a716-446655440000", "990e8400-e29b-41d4-a716-446655440000"],
    });
    expect(result.success).toBe(true);
  });
});

describe("bedHoldInputSchema", () => {
  const validInput = {
    lodgeId: "550e8400-e29b-41d4-a716-446655440000",
    bedId: "660e8400-e29b-41d4-a716-446655440000",
    bookingRoundId: "770e8400-e29b-41d4-a716-446655440000",
    checkInDate: "2027-07-10",
    checkOutDate: "2027-07-13",
  };

  it("accepts valid input", () => {
    const result = bedHoldInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects missing bedId", () => {
    const { bedId, ...rest } = validInput;
    const result = bedHoldInputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects checkOut before checkIn", () => {
    const result = bedHoldInputSchema.safeParse({
      ...validInput,
      checkInDate: "2027-07-13",
      checkOutDate: "2027-07-10",
    });
    expect(result.success).toBe(false);
  });
});
