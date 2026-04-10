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

describe("bookingGuestSchema (via createBookingSchema)", () => {
  const base = {
    organisationId: "550e8400-e29b-41d4-a716-446655440000",
    lodgeId: "660e8400-e29b-41d4-a716-446655440000",
    bookingRoundId: "770e8400-e29b-41d4-a716-446655440000",
    checkInDate: "2027-07-10",
    checkOutDate: "2027-07-13",
  };

  const memberId = "880e8400-e29b-41d4-a716-446655440000";
  const associateId = "aa0e8400-e29b-41d4-a716-446655440000";
  const bedId = "990e8400-e29b-41d4-a716-446655440000";

  it("accepts guest with memberId + bedId", () => {
    const result = createBookingSchema.safeParse({
      ...base,
      guests: [{ memberId, bedId }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts guest with associateId + bedId", () => {
    const result = createBookingSchema.safeParse({
      ...base,
      guests: [{ associateId, bedId }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts cot guest with associateId + portaCotRequested + no bedId", () => {
    const result = createBookingSchema.safeParse({
      ...base,
      guests: [{ associateId, portaCotRequested: true }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects guest with neither memberId nor associateId", () => {
    const result = createBookingSchema.safeParse({
      ...base,
      guests: [{ bedId }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects guest with both memberId and associateId", () => {
    const result = createBookingSchema.safeParse({
      ...base,
      guests: [{ memberId, associateId, bedId }],
    });
    expect(result.success).toBe(false);
  });

  it("requires bedId when portaCotRequested is false", () => {
    const result = createBookingSchema.safeParse({
      ...base,
      guests: [{ memberId, portaCotRequested: false }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const bedIssue = result.error.issues.find((i) => i.path.includes("bedId"));
      expect(bedIssue).toBeDefined();
    }
  });

  it("requires bedId when portaCotRequested is absent", () => {
    const result = createBookingSchema.safeParse({
      ...base,
      guests: [{ memberId }],
    });
    expect(result.success).toBe(false);
  });
});
