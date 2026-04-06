// src/actions/bookings/__tests__/cancel.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockExecute = vi.fn();
const mockSendEmail = vi.fn();
const mockProcessStripeRefund = vi.fn();
const mockTransaction = vi.fn();

let selectCallCount = 0;

vi.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock("@/actions/stripe/refund", () => ({
  processStripeRefund: (...args: unknown[]) => {
    mockProcessStripeRefund(...args);
    return { success: true, stripeRefundId: "re_123" };
  },
}));

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      const callIndex = selectCallCount++;
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            where: () => {
              // call 0: booking lookup
              if (callIndex === 0) return [{
                id: "booking-1",
                status: "CONFIRMED",
                bookingReference: "BSKI-2027-0042",
                checkInDate: "2027-07-12",
                checkOutDate: "2027-07-16",
                lodgeId: "lodge-1",
                primaryMemberId: "member-1",
                totalAmountCents: 84000,
                balancePaidAt: new Date(),
                cancellationPolicyId: "policy-1",
              }];
              // call 1: cancellation policy
              if (callIndex === 1) return [{
                rules: [
                  { daysBeforeCheckin: 14, forfeitPercentage: 0 },
                  { daysBeforeCheckin: 7, forfeitPercentage: 25 },
                ],
              }];
              // call 2: org details
              if (callIndex === 2) return [{ name: "Demo Club", contactEmail: "admin@demo.com", logoUrl: null, slug: "demo" }];
              // call 3: lodge details
              if (callIndex === 3) return [{ name: "Main Lodge" }];
              // call 4: member email
              if (callIndex === 4) return [{ email: "sarah@test.com", firstName: "Sarah", lastName: "Mitchell" }];
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
              return { where: () => {} };
            },
          };
        },
        insert: (...args: unknown[]) => {
          mockInsert(...args);
          return { values: (...vArgs: unknown[]) => { mockValues(...vArgs); } };
        },
        execute: (...args: unknown[]) => { mockExecute(...args); },
      };
      return fn(tx);
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
});

import { cancelBooking } from "../cancel";

describe("cancelBooking", () => {
  it("cancels a confirmed booking and processes refund", async () => {
    const result = await cancelBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      cancelledByMemberId: "admin-1",
      reason: "Member requested cancellation",
      slug: "demo",
    });
    expect(result.success).toBe(true);
    expect(mockTransaction).toHaveBeenCalled();
    expect(mockProcessStripeRefund).toHaveBeenCalled();
  });

  it("uses admin override refund amount when provided", async () => {
    const result = await cancelBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      cancelledByMemberId: "admin-1",
      reason: "Compassionate grounds",
      refundOverrideCents: 84000,
      slug: "demo",
    });
    expect(result.success).toBe(true);
    expect(mockProcessStripeRefund).toHaveBeenCalledWith("booking-1", 84000);
  });

  it("sends cancellation email to member", async () => {
    await cancelBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      cancelledByMemberId: "admin-1",
      reason: "Cancelling",
      slug: "demo",
    });
    expect(mockSendEmail).toHaveBeenCalled();
  });
});
