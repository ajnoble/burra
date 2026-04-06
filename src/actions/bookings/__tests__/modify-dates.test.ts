// src/actions/bookings/__tests__/modify-dates.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockExecute = vi.fn();
const mockTransaction = vi.fn();
const mockSendEmail = vi.fn();

let selectCallCount = 0;

vi.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      const override = mockSelect(...args);
      if (override) return override;
      const callIndex = selectCallCount++;
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            where: () => {
              if (callIndex === 0) return [{ // booking
                id: "booking-1", status: "CONFIRMED", bookingReference: "BSKI-2027-0042",
                checkInDate: "2027-07-12", checkOutDate: "2027-07-16",
                lodgeId: "lodge-1", primaryMemberId: "member-1",
                organisationId: "org-1",
              }];
              if (callIndex === 1) return [{ // guests
                id: "bg-1", memberId: "member-1", snapshotTariffId: "tariff-1",
              }];
              if (callIndex === 2) return [{ // tariff
                pricePerNightWeekdayCents: 7000, pricePerNightWeekendCents: 9000,
                discountFiveNightsBps: 500, discountSevenNightsBps: 1000,
              }];
              if (callIndex === 3) return [{ name: "Demo Club", contactEmail: "admin@demo.com", logoUrl: null }];
              if (callIndex === 4) return [{ name: "Main Lodge" }];
              if (callIndex === 5) return [{ email: "sarah@test.com", firstName: "Sarah", lastName: "Mitchell" }];
              return [];
            },
          };
        },
      };
    },
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      mockTransaction();
      const tx = {
        update: (...args: unknown[]) => {
          mockUpdate(...args);
          return {
            set: (...sArgs: unknown[]) => {
              mockSet(...sArgs);
              return { where: () => ({}) };
            },
          };
        },
        execute: (...args: unknown[]) => { mockExecute(...args); return []; },
      };
      return fn(tx);
    },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
});

import { modifyBookingDates } from "../modify-dates";

describe("modifyBookingDates", () => {
  it("updates booking dates and recalculates pricing", async () => {
    const result = await modifyBookingDates({
      bookingId: "booking-1",
      organisationId: "org-1",
      newCheckInDate: "2027-07-14",
      newCheckOutDate: "2027-07-18",
      slug: "demo",
    });
    expect(result.success).toBe(true);
    expect(mockTransaction).toHaveBeenCalled();
  });

  it("rejects modification of cancelled booking", async () => {
    selectCallCount = 0;
    vi.mocked(mockSelect).mockImplementationOnce(() => ({
      from: () => ({
        where: () => [{ id: "booking-1", status: "CANCELLED" }],
      }),
    }));
    const result = await modifyBookingDates({
      bookingId: "booking-1",
      organisationId: "org-1",
      newCheckInDate: "2027-07-14",
      newCheckOutDate: "2027-07-18",
      slug: "demo",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("CANCELLED");
  });

  it("sends modification email", async () => {
    await modifyBookingDates({
      bookingId: "booking-1",
      organisationId: "org-1",
      newCheckInDate: "2027-07-14",
      newCheckOutDate: "2027-07-18",
      slug: "demo",
    });
    expect(mockSendEmail).toHaveBeenCalled();
  });
});
