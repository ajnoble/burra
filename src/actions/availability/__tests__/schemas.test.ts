import { describe, it, expect } from "vitest";
import {
  createOverrideSchema,
  updateOverrideSchema,
  validateBookingDatesSchema,
} from "../schemas";

describe("createOverrideSchema", () => {
  const validClosure = {
    lodgeId: "550e8400-e29b-41d4-a716-446655440000",
    startDate: "2027-07-01",
    endDate: "2027-07-03",
    type: "CLOSURE" as const,
    reason: "Maintenance weekend",
  };

  const validReduction = {
    lodgeId: "550e8400-e29b-41d4-a716-446655440000",
    startDate: "2027-07-01",
    endDate: "2027-07-05",
    type: "REDUCTION" as const,
    bedReduction: 4,
    reason: "Plumbing repair",
  };

  it("accepts a valid closure", () => {
    const result = createOverrideSchema.safeParse(validClosure);
    expect(result.success).toBe(true);
  });

  it("accepts a valid reduction", () => {
    const result = createOverrideSchema.safeParse(validReduction);
    expect(result.success).toBe(true);
  });

  it("rejects endDate before startDate", () => {
    const result = createOverrideSchema.safeParse({
      ...validClosure,
      startDate: "2027-07-05",
      endDate: "2027-07-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects reduction without bedReduction", () => {
    const result = createOverrideSchema.safeParse({
      ...validReduction,
      bedReduction: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects reduction with bedReduction of 0", () => {
    const result = createOverrideSchema.safeParse({
      ...validReduction,
      bedReduction: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects closure with bedReduction set", () => {
    const result = createOverrideSchema.safeParse({
      ...validClosure,
      bedReduction: 4,
    });
    expect(result.success).toBe(false);
  });

  it("accepts closure without reason", () => {
    const { reason, ...noReason } = validClosure;
    const result = createOverrideSchema.safeParse(noReason);
    expect(result.success).toBe(true);
  });

  it("rejects invalid lodgeId", () => {
    const result = createOverrideSchema.safeParse({
      ...validClosure,
      lodgeId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts same-day start and end", () => {
    const result = createOverrideSchema.safeParse({
      ...validClosure,
      startDate: "2027-07-01",
      endDate: "2027-07-01",
    });
    expect(result.success).toBe(true);
  });
});

describe("updateOverrideSchema", () => {
  it("accepts partial update with only reason", () => {
    const result = updateOverrideSchema.safeParse({
      reason: "Updated reason",
    });
    expect(result.success).toBe(true);
  });

  it("accepts changing dates", () => {
    const result = updateOverrideSchema.safeParse({
      startDate: "2027-07-02",
      endDate: "2027-07-04",
    });
    expect(result.success).toBe(true);
  });

  it("rejects endDate before startDate when both provided", () => {
    const result = updateOverrideSchema.safeParse({
      startDate: "2027-07-05",
      endDate: "2027-07-01",
    });
    expect(result.success).toBe(false);
  });
});

describe("validateBookingDatesSchema", () => {
  const validInput = {
    lodgeId: "550e8400-e29b-41d4-a716-446655440000",
    checkIn: "2027-07-10",
    checkOut: "2027-07-13",
    bookingRoundId: "660e8400-e29b-41d4-a716-446655440000",
    memberId: "770e8400-e29b-41d4-a716-446655440000",
  };

  it("accepts valid input", () => {
    const result = validateBookingDatesSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects checkOut before checkIn", () => {
    const result = validateBookingDatesSchema.safeParse({
      ...validInput,
      checkIn: "2027-07-13",
      checkOut: "2027-07-10",
    });
    expect(result.success).toBe(false);
  });

  it("rejects same-day checkIn and checkOut", () => {
    const result = validateBookingDatesSchema.safeParse({
      ...validInput,
      checkIn: "2027-07-10",
      checkOut: "2027-07-10",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    const result = validateBookingDatesSchema.safeParse({
      lodgeId: validInput.lodgeId,
    });
    expect(result.success).toBe(false);
  });
});
