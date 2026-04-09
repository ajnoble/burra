import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockExecute = vi.fn();
const mockTransaction = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockSendEmail = vi.fn();
const mockGetSessionMember = vi.fn();
const mockCreateAuditLog = vi.fn();
const mockValidateBookingDates = vi.fn();
const mockProcessStripeRefund = vi.fn();

let selectCallCount = 0;

// Default booking data
const defaultBooking = {
  id: "booking-1",
  status: "CONFIRMED",
  bookingReference: "BSKI-2027-0042",
  checkInDate: "2027-07-12",
  checkOutDate: "2027-07-16",
  lodgeId: "lodge-1",
  primaryMemberId: "member-1",
  organisationId: "org-1",
  bookingRoundId: "round-1",
  totalAmountCents: 28000,
  subtotalCents: 28000,
  discountAmountCents: 0,
  gstAmountCents: 0,
  balancePaidAt: null,
  requiresApproval: false,
};

const defaultGuests = [
  {
    id: "bg-1",
    memberId: "member-1",
    snapshotTariffId: "tariff-1",
    snapshotMembershipClassId: "class-1",
    bedId: "bed-1",
    roomId: "room-1",
    pricePerNightCents: 7000,
    totalAmountCents: 28000,
  },
];

const defaultTariff = {
  id: "tariff-1",
  pricePerNightWeekdayCents: 7000,
  pricePerNightWeekendCents: 9000,
  discountFiveNightsBps: 500,
  discountSevenNightsBps: 1000,
};

const defaultOrg = {
  id: "org-1",
  name: "Demo Club",
  slug: "demo",
  contactEmail: "admin@demo.com",
  logoUrl: null,
  memberBookingEditWindowDays: 7,
  memberEditRequiresApproval: false,
  gstEnabled: false,
  gstRateBps: 1000,
};

const defaultMember = {
  email: "sarah@test.com",
  firstName: "Sarah",
  lastName: "Mitchell",
  isFinancial: true,
  membershipClassId: "class-1",
};

const defaultLodge = { name: "Main Lodge" };

const defaultRound = { requiresApproval: false };

vi.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: (...args: unknown[]) => mockGetSessionMember(...args),
}));

vi.mock("@/lib/audit-log", () => ({
  createAuditLog: (...args: unknown[]) => {
    mockCreateAuditLog(...args);
    return Promise.resolve();
  },
  diffChanges: (prev: Record<string, unknown>, curr: Record<string, unknown>) => {
    const previousValue: Record<string, unknown> = {};
    const newValue: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(prev), ...Object.keys(curr)])) {
      if (prev[key] !== curr[key]) { previousValue[key] = prev[key]; newValue[key] = curr[key]; }
    }
    return { previousValue, newValue };
  },
}));

vi.mock("@/actions/availability/validation", () => ({
  validateBookingDates: (...args: unknown[]) => mockValidateBookingDates(...args),
}));

vi.mock("@/actions/stripe/refund", () => ({
  processStripeRefund: (...args: unknown[]) => mockProcessStripeRefund(...args),
}));

vi.mock("@/db/schema", () => ({
  bookings: "bookings",
  bookingGuests: "bookingGuests",
  transactions: "transactions",
  members: "members",
  organisations: "organisations",
  lodges: "lodges",
  tariffs: "tariffs",
  seasons: "seasons",
  bookingRounds: "bookingRounds",
  availabilityCache: "availabilityCache",
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
              if (callIndex === 0) return [defaultBooking]; // booking
              if (callIndex === 1) return defaultGuests; // guests
              if (callIndex === 2) return [defaultOrg]; // org
              if (callIndex === 3) return [defaultTariff]; // tariff
              if (callIndex === 4) return [defaultOrg]; // org for email
              if (callIndex === 5) return [defaultLodge]; // lodge for email
              if (callIndex === 6) return [defaultMember]; // member for email
              return [];
            },
            innerJoin: () => ({
              leftJoin: () => ({
                leftJoin: () => ({
                  leftJoin: () => ({
                    where: () => defaultGuests,
                  }),
                }),
              }),
              where: () => {
                if (callIndex === 0) return [defaultBooking];
                return [];
              },
            }),
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
        insert: (...args: unknown[]) => {
          mockInsert(...args);
          return { values: () => ({ returning: () => [{ id: "txn-new" }] }) };
        },
        delete: (...args: unknown[]) => {
          mockDelete(...args);
          return { where: () => ({}) };
        },
        execute: (...args: unknown[]) => {
          mockExecute(...args);
          return [];
        },
      };
      return fn(tx);
    },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
  mockGetSessionMember.mockResolvedValue({
    memberId: "member-1",
    organisationId: "org-1",
    role: "MEMBER",
    firstName: "Sarah",
    lastName: "Mitchell",
    email: "sarah@test.com",
  });
  mockValidateBookingDates.mockResolvedValue({ valid: true, errors: [] });
  mockProcessStripeRefund.mockResolvedValue({ success: true });
});

import { memberEditBooking } from "../member-edit";

describe("memberEditBooking", () => {
  it("rejects when not authenticated", async () => {
    mockGetSessionMember.mockResolvedValue(null);
    const result = await memberEditBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      slug: "demo",
      newCheckInDate: "2027-07-14",
      newCheckOutDate: "2027-07-18",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("authenticated");
  });

  it("rejects when member does not own the booking", async () => {
    mockGetSessionMember.mockResolvedValue({
      memberId: "member-999",
      organisationId: "org-1",
      role: "MEMBER",
      firstName: "Other",
      lastName: "User",
      email: "other@test.com",
    });
    const result = await memberEditBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      slug: "demo",
      newCheckInDate: "2027-07-14",
      newCheckOutDate: "2027-07-18",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("own");
  });

  it("rejects when edit window is disabled (0)", async () => {
    selectCallCount = 0;
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => [defaultBooking] }),
    }));
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => defaultGuests }),
    }));
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => [{ ...defaultOrg, memberBookingEditWindowDays: 0 }] }),
    }));

    const result = await memberEditBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      slug: "demo",
      newCheckInDate: "2027-07-14",
      newCheckOutDate: "2027-07-18",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not enabled");
  });

  it("rejects cancelled booking", async () => {
    selectCallCount = 0;
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => [{ ...defaultBooking, status: "CANCELLED" }] }),
    }));

    const result = await memberEditBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      slug: "demo",
      newCheckInDate: "2027-07-14",
      newCheckOutDate: "2027-07-18",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("CANCELLED");
  });

  it("updates booking dates and recalculates pricing", async () => {
    const result = await memberEditBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      slug: "demo",
      newCheckInDate: "2027-07-14",
      newCheckOutDate: "2027-07-18",
    });
    expect(result.success).toBe(true);
    expect(mockTransaction).toHaveBeenCalled();
    expect(mockValidateBookingDates).toHaveBeenCalledWith(
      expect.objectContaining({ excludeBookingId: "booking-1" })
    );
  });

  it("calls processStripeRefund when paid booking price decreases", async () => {
    selectCallCount = 0;
    const paidBooking = {
      ...defaultBooking,
      balancePaidAt: new Date("2027-06-01"),
      totalAmountCents: 50000,
    };
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => [paidBooking] }),
    }));
    // guests
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => defaultGuests }),
    }));
    // org
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => [defaultOrg] }),
    }));
    // tariff for existing guest
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => [defaultTariff] }),
    }));
    // org for email
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => [defaultOrg] }),
    }));
    // lodge for email
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => [defaultLodge] }),
    }));
    // member for email
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => [defaultMember] }),
    }));

    const result = await memberEditBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      slug: "demo",
      newCheckInDate: "2027-07-14",
      newCheckOutDate: "2027-07-16",
    });

    expect(result.success).toBe(true);
    expect(mockProcessStripeRefund).toHaveBeenCalled();
  });

  it("returns topUpTransactionId when paid booking price increases", async () => {
    selectCallCount = 0;
    const paidBooking = {
      ...defaultBooking,
      balancePaidAt: new Date("2027-06-01"),
      totalAmountCents: 10000,
    };
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => [paidBooking] }),
    }));
    // guests
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => defaultGuests }),
    }));
    // org
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => [defaultOrg] }),
    }));
    // tariff for existing guest
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => [defaultTariff] }),
    }));
    // org for email
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => [defaultOrg] }),
    }));
    // lodge for email
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => [defaultLodge] }),
    }));
    // member for email
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => [defaultMember] }),
    }));

    const result = await memberEditBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      slug: "demo",
      newCheckInDate: "2027-07-10",
      newCheckOutDate: "2027-07-18",
    });

    expect(result.success).toBe(true);
    expect(result.topUpTransactionId).toBeDefined();
    expect(mockProcessStripeRefund).not.toHaveBeenCalled();
  });

  it("writes audit log", async () => {
    await memberEditBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      slug: "demo",
      newCheckInDate: "2027-07-14",
      newCheckOutDate: "2027-07-18",
    });
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "BOOKING_MEMBER_EDITED" })
    );
  });

  it("sends emails to member and admin", async () => {
    await memberEditBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      slug: "demo",
      newCheckInDate: "2027-07-14",
      newCheckOutDate: "2027-07-18",
    });
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });

  it("rejects when validateBookingDates fails", async () => {
    mockValidateBookingDates.mockResolvedValue({
      valid: false,
      errors: ["No availability on 2027-07-14"],
    });
    const result = await memberEditBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      slug: "demo",
      newCheckInDate: "2027-07-14",
      newCheckOutDate: "2027-07-18",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("availability");
  });

  it("sets status to PENDING when re-approval is required", async () => {
    selectCallCount = 0;
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({
        where: () => [{ ...defaultBooking, requiresApproval: true }],
      }),
    }));
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({ where: () => defaultGuests }),
    }));
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({
        where: () => [{ ...defaultOrg, memberEditRequiresApproval: true }],
      }),
    }));

    const result = await memberEditBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      slug: "demo",
      newCheckInDate: "2027-07-14",
      newCheckOutDate: "2027-07-18",
    });
    expect(result.success).toBe(true);
    expect(result.requiresApproval).toBe(true);
  });
});
