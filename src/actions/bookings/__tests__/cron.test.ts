import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockInnerJoin = vi.fn();
const mockWhere = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockUpdateWhere = vi.fn();
const mockDelete = vi.fn();
const mockDeleteWhere = vi.fn();
const mockSendEmail = vi.fn();
const mockCancelBooking = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      const chain = {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return chain;
        },
        innerJoin: (...jArgs: unknown[]) => {
          mockInnerJoin(...jArgs);
          return chain;
        },
        where: (...wArgs: unknown[]) => {
          mockWhere(...wArgs);
          return mockWhere.mock.results[mockWhere.mock.calls.length - 1]?.value ?? [];
        },
      };
      return chain;
    },
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: (...sArgs: unknown[]) => {
          mockSet(...sArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockUpdateWhere(...wArgs);
              return Promise.resolve();
            },
          };
        },
      };
    },
    delete: (...args: unknown[]) => {
      mockDelete(...args);
      return {
        where: (...wArgs: unknown[]) => {
          mockDeleteWhere(...wArgs);
          return Promise.resolve();
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  bookings: {
    id: "id",
    organisationId: "organisationId",
    bookingRoundId: "bookingRoundId",
    status: "status",
    balanceDueDate: "balanceDueDate",
    balancePaidAt: "balancePaidAt",
    paymentRemindersSentAt: "paymentRemindersSentAt",
    totalAmountCents: "totalAmountCents",
    bookingReference: "bookingReference",
    checkInDate: "checkInDate",
    checkOutDate: "checkOutDate",
    primaryMemberId: "primaryMemberId",
    lodgeId: "lodgeId",
  },
  bookingRounds: {
    id: "id",
    paymentReminderDays: "paymentReminderDays",
    paymentGraceDays: "paymentGraceDays",
    autoCancelRefundPolicy: "autoCancelRefundPolicy",
  },
  organisations: {
    id: "id",
    name: "name",
    slug: "slug",
    contactEmail: "contactEmail",
    logoUrl: "logoUrl",
    bookingPaymentGraceDays: "bookingPaymentGraceDays",
    bookingPaymentReminderDays: "bookingPaymentReminderDays",
  },
  members: {
    id: "id",
    email: "email",
    firstName: "firstName",
    lastName: "lastName",
  },
  lodges: {
    id: "id",
    name: "name",
  },
  bedHolds: {
    expiresAt: "expiresAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args) => ({ type: "and", args })),
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
  isNotNull: vi.fn((col) => ({ type: "isNotNull", col })),
  lt: vi.fn((col, val) => ({ type: "lt", col, val })),
  lte: vi.fn((col, val) => ({ type: "lte", col, val })),
  sql: vi.fn((strings, ...values) => ({ type: "sql", strings, values })),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock("@/lib/email/templates/booking-payment-reminder", () => ({
  BookingPaymentReminderEmail: vi.fn(),
}));

vi.mock("@/lib/email/templates/booking-auto-cancelled", () => ({
  BookingAutoCancelledEmail: vi.fn(),
}));

// AdminBookingNotificationEmail no longer imported by cron — cancelBooking sends admin emails

vi.mock("./cancel", () => ({
  cancelBooking: (...args: unknown[]) => mockCancelBooking(...args),
}));

// Mock the cancel module relative to cron location
vi.mock("@/actions/bookings/cancel", () => ({
  cancelBooking: (...args: unknown[]) => mockCancelBooking(...args),
}));

import { processBookingPaymentCron } from "../cron";

// Helper to build a base booking record
function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    bookingId: "booking-1",
    organisationId: "org-1",
    bookingRoundId: "round-1",
    status: "CONFIRMED",
    balanceDueDate: "2026-04-14", // 7 days from 2026-04-07
    balancePaidAt: null,
    paymentRemindersSentAt: null,
    totalAmountCents: 50000,
    bookingReference: "BSKI-2026-0001",
    checkInDate: "2026-07-01",
    checkOutDate: "2026-07-05",
    primaryMemberId: "member-1",
    lodgeId: "lodge-1",
    memberEmail: "member@example.com",
    memberFirstName: "Alice",
    memberLastName: "Smith",
    lodgeName: "Snowgum Lodge",
    orgName: "Snow Gum FC",
    orgSlug: "snow-gum-fc",
    contactEmail: "admin@snowgum.site",
    logoUrl: "https://snowgum.site/logo.png",
    // Round overrides (null = use org defaults)
    roundPaymentReminderDays: null,
    roundPaymentGraceDays: null,
    autoCancelRefundPolicy: null,
    // Org defaults
    orgPaymentGraceDays: 7,
    orgPaymentReminderDays: [7, 1],
    ...overrides,
  };
}

describe("processBookingPaymentCron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://snowgum.site";
    mockCancelBooking.mockResolvedValue({ success: true, refundAmountCents: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Test 1: Returns zeros when no bookings need attention ───────────────

  it("returns zeros when no bookings need attention", async () => {
    mockWhere.mockReturnValue([]);

    const result = await processBookingPaymentCron();

    expect(result).toEqual({
      remindersSent: 0,
      bookingsCancelled: 0,
      holdsCleared: true,
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockCancelBooking).not.toHaveBeenCalled();
  });

  // ─── Test 2: Sends reminders for bookings approaching due date ───────────

  it("sends reminders for bookings approaching due date", async () => {
    // Today = 2026-04-07, balanceDueDate = 2026-04-14 → 7 days remaining
    // org default reminder days = [7, 1], so 7-day reminder should fire
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T00:00:00.000Z"));

    const booking = makeBooking({
      balanceDueDate: "2026-04-14", // exactly 7 days away
      paymentRemindersSentAt: null,
      orgPaymentReminderDays: [7, 1],
    });

    // Pass 1 query returns the booking; Pass 2 query returns empty (no overdue)
    mockWhere
      .mockReturnValueOnce([booking]) // pass 1
      .mockReturnValueOnce([]) // pass 2
      .mockReturnValue(Promise.resolve()); // pass 3 delete

    const result = await processBookingPaymentCron();

    expect(result.remindersSent).toBe(1);
    expect(mockSendEmail).toHaveBeenCalledOnce();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "member@example.com",
        orgName: "Snow Gum FC",
      })
    );

    // Should update paymentRemindersSentAt
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentRemindersSentAt: expect.objectContaining({ "7": expect.any(String) }),
        updatedAt: expect.any(Date),
      })
    );
  });

  // ─── Test 3: Does not re-send already sent reminders ────────────────────

  it("does not re-send already sent reminders", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T00:00:00.000Z"));

    const booking = makeBooking({
      balanceDueDate: "2026-04-14", // 7 days away
      // 7-day reminder already sent
      paymentRemindersSentAt: { "7": "2026-04-06T00:00:00.000Z" },
      orgPaymentReminderDays: [7, 1],
    });

    mockWhere
      .mockReturnValueOnce([booking]) // pass 1
      .mockReturnValueOnce([]) // pass 2
      .mockReturnValue(Promise.resolve()); // pass 3

    const result = await processBookingPaymentCron();

    expect(result.remindersSent).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // ─── Test 4: Uses round override for reminder days when set ─────────────

  it("uses round override for reminder days when set", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T00:00:00.000Z"));

    const booking = makeBooking({
      balanceDueDate: "2026-04-14", // 7 days away
      paymentRemindersSentAt: null,
      // Round overrides: only send at 3 days, not 7
      roundPaymentReminderDays: [3],
      orgPaymentReminderDays: [7, 1],
    });

    mockWhere
      .mockReturnValueOnce([booking]) // pass 1
      .mockReturnValueOnce([]) // pass 2
      .mockReturnValue(Promise.resolve()); // pass 3

    const result = await processBookingPaymentCron();

    // 7 days remaining, round only has [3] threshold → no reminder yet
    expect(result.remindersSent).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // ─── Test 5: Auto-cancels bookings past grace period ────────────────────

  it("auto-cancels bookings past grace period", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T00:00:00.000Z"));

    // Due date was 2026-03-27 (11 days ago), grace period 7 days → should cancel
    const booking = makeBooking({
      balanceDueDate: "2026-03-27",
      paymentRemindersSentAt: null,
      orgPaymentGraceDays: 7,
      roundPaymentGraceDays: null,
      autoCancelRefundPolicy: null,
    });

    mockWhere
      .mockReturnValueOnce([]) // pass 1 (no reminders needed)
      .mockReturnValueOnce([booking]) // pass 2 (overdue)
      .mockReturnValue(Promise.resolve()); // pass 3

    const result = await processBookingPaymentCron();

    expect(result.bookingsCancelled).toBe(1);
    expect(mockCancelBooking).toHaveBeenCalledOnce();
    expect(mockCancelBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: "booking-1",
        organisationId: "org-1",
        reason: expect.stringContaining("auto"),
      })
    );
  });

  // ─── Test 6: Uses round grace period override when set ──────────────────

  it("uses round grace period override when set", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T00:00:00.000Z"));

    // Due date was 2026-04-03 (4 days ago)
    // Round grace period = 14 days → NOT yet overdue (4 < 14)
    const booking = makeBooking({
      balanceDueDate: "2026-04-03",
      orgPaymentGraceDays: 7,
      roundPaymentGraceDays: 14, // round override
    });

    mockWhere
      .mockReturnValueOnce([]) // pass 1
      .mockReturnValueOnce([booking]) // pass 2
      .mockReturnValue(Promise.resolve()); // pass 3

    const result = await processBookingPaymentCron();

    // Should NOT cancel because 4 < 14
    expect(result.bookingsCancelled).toBe(0);
    expect(mockCancelBooking).not.toHaveBeenCalled();
  });

  // ─── Test 7: Applies correct refund policy ──────────────────────────────

  it("applies correct refund policy — none → 0, full → totalAmount", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T00:00:00.000Z"));

    // Booking 1: "none" refund policy
    const bookingNone = makeBooking({
      bookingId: "booking-none",
      bookingReference: "BSKI-2026-0001",
      balanceDueDate: "2026-03-20", // 18 days ago
      orgPaymentGraceDays: 7,
      autoCancelRefundPolicy: "none",
      totalAmountCents: 50000,
    });

    // Booking 2: "full" refund policy
    const bookingFull = makeBooking({
      bookingId: "booking-full",
      bookingReference: "BSKI-2026-0002",
      balanceDueDate: "2026-03-20",
      orgPaymentGraceDays: 7,
      autoCancelRefundPolicy: "full",
      totalAmountCents: 80000,
    });

    // Booking 3: "cancellation_policy" (default) — refundOverrideCents undefined
    const bookingPolicy = makeBooking({
      bookingId: "booking-policy",
      bookingReference: "BSKI-2026-0003",
      balanceDueDate: "2026-03-20",
      orgPaymentGraceDays: 7,
      autoCancelRefundPolicy: null, // null falls back to "cancellation_policy"
      totalAmountCents: 60000,
    });

    mockWhere
      .mockReturnValueOnce([]) // pass 1
      .mockReturnValueOnce([bookingNone, bookingFull, bookingPolicy]) // pass 2
      .mockReturnValue(Promise.resolve()); // pass 3

    await processBookingPaymentCron();

    expect(mockCancelBooking).toHaveBeenCalledTimes(3);

    // "none" → refundOverrideCents = 0
    expect(mockCancelBooking).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        bookingId: "booking-none",
        refundOverrideCents: 0,
      })
    );

    // "full" → refundOverrideCents = totalAmountCents
    expect(mockCancelBooking).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        bookingId: "booking-full",
        refundOverrideCents: 80000,
      })
    );

    // "cancellation_policy" (null) → refundOverrideCents undefined (cancelBooking handles it)
    expect(mockCancelBooking).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        bookingId: "booking-policy",
      })
    );
    expect(mockCancelBooking.mock.calls[2][0].refundOverrideCents).toBeUndefined();
  });

  // ─── Test 8: Cleans up expired bed holds ────────────────────────────────

  it("cleans up expired bed holds", async () => {
    mockWhere.mockReturnValue([]);

    const result = await processBookingPaymentCron();

    expect(result.holdsCleared).toBe(true);
    expect(mockDelete).toHaveBeenCalledOnce();
    expect(mockDeleteWhere).toHaveBeenCalledOnce();
  });
});
