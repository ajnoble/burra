import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDelete = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    delete: vi.fn(() => ({ where: mockDelete })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: mockSelect,
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: mockInsert,
      })),
    })),
  },
}));

vi.mock("@/db/schema", () => ({
  bedHolds: {
    expiresAt: "expires_at",
    lodgeId: "lodge_id",
    bedId: "bed_id",
    memberId: "member_id",
    checkInDate: "check_in_date",
    checkOutDate: "check_out_date",
    id: "id",
  },
  bookingRounds: {
    id: "id",
    holdDurationMinutes: "hold_duration_minutes",
  },
}));

import { isHoldExpired, calculateExpiresAt } from "../holds";

describe("isHoldExpired", () => {
  it("returns true when expiresAt is in the past", () => {
    const past = new Date(Date.now() - 60000); // 1 minute ago
    expect(isHoldExpired(past)).toBe(true);
  });

  it("returns false when expiresAt is in the future", () => {
    const future = new Date(Date.now() + 60000); // 1 minute from now
    expect(isHoldExpired(future)).toBe(false);
  });

  it("returns true when expiresAt is exactly now", () => {
    const now = new Date();
    expect(isHoldExpired(now)).toBe(true);
  });
});

describe("calculateExpiresAt", () => {
  it("adds the specified minutes to now", () => {
    const before = Date.now();
    const result = calculateExpiresAt(10);
    const after = Date.now();

    const expectedMin = before + 10 * 60 * 1000;
    const expectedMax = after + 10 * 60 * 1000;

    expect(result.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(result.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  it("handles 5 minute holds", () => {
    const before = Date.now();
    const result = calculateExpiresAt(5);
    const expected = before + 5 * 60 * 1000;

    // Allow 100ms tolerance
    expect(Math.abs(result.getTime() - expected)).toBeLessThan(100);
  });
});
