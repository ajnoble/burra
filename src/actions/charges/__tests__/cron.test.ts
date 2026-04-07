import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockInnerJoin = vi.fn();
const mockWhere = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockUpdateWhere = vi.fn();
const mockSendEmail = vi.fn();

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
  },
}));

vi.mock("@/db/schema", () => ({
  oneOffCharges: {
    id: "id",
    memberId: "memberId",
    categoryId: "categoryId",
    organisationId: "organisationId",
    status: "status",
    dueDate: "dueDate",
    reminderSentAt: "reminderSentAt",
    description: "description",
    amountCents: "amountCents",
  },
  members: {
    id: "id",
    email: "email",
    firstName: "firstName",
  },
  chargeCategories: {
    id: "id",
    name: "name",
  },
  organisations: {
    id: "id",
    name: "name",
    slug: "slug",
    contactEmail: "contactEmail",
    logoUrl: "logoUrl",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args) => ({ type: "and", args })),
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
  lte: vi.fn((col, val) => ({ type: "lte", col, val })),
  gte: vi.fn((col, val) => ({ type: "gte", col, val })),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock("@/lib/email/templates/charge-due-reminder", () => ({
  ChargeDueReminderEmail: vi.fn(),
}));

import { processChargeDueReminders } from "../cron";

describe("processChargeDueReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://snowgum.site";
  });

  it("returns zero when no charges are due", async () => {
    // where() returns empty array
    mockWhere.mockReturnValue([]);

    const result = await processChargeDueReminders();

    expect(result).toEqual({ remindersSent: 0 });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("sends reminders for charges due within 7 days", async () => {
    const dueCharges = [
      {
        chargeId: "charge-1",
        email: "member@example.com",
        firstName: "Alice",
        categoryName: "Training Fee",
        description: "Spring training",
        amountCents: 5000,
        dueDate: "2026-04-10",
        orgName: "Snow Gum FC",
        orgSlug: "snow-gum-fc",
        contactEmail: "admin@snowgum.site",
        logoUrl: "https://snowgum.site/logo.png",
      },
      {
        chargeId: "charge-2",
        email: "member2@example.com",
        firstName: "Bob",
        categoryName: "Equipment Fee",
        description: null,
        amountCents: 2500,
        dueDate: "2026-04-12",
        orgName: "Snow Gum FC",
        orgSlug: "snow-gum-fc",
        contactEmail: null,
        logoUrl: null,
      },
    ];

    mockWhere.mockReturnValue(dueCharges);

    const result = await processChargeDueReminders();

    expect(result).toEqual({ remindersSent: 2 });

    // sendEmail called once per charge
    expect(mockSendEmail).toHaveBeenCalledTimes(2);

    // First call
    expect(mockSendEmail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        to: "member@example.com",
        subject: "Payment reminder — Training Fee",
        replyTo: "admin@snowgum.site",
        orgName: "Snow Gum FC",
      })
    );

    // Second call — no replyTo (null contactEmail)
    expect(mockSendEmail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        to: "member2@example.com",
        subject: "Payment reminder — Equipment Fee",
        replyTo: undefined,
        orgName: "Snow Gum FC",
      })
    );

    // db.update called once per charge
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockSet).toHaveBeenCalledTimes(2);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        reminderSentAt: expect.any(Date),
        updatedAt: expect.any(Date),
      })
    );
    expect(mockUpdateWhere).toHaveBeenCalledTimes(2);
  });

  it("uses correct date range in query", async () => {
    mockWhere.mockReturnValue([]);

    const before = new Date();
    await processChargeDueReminders();
    const after = new Date();

    // Verify where() was called (query was built and executed)
    expect(mockWhere).toHaveBeenCalledTimes(1);

    // Verify the date helpers (lte, gte) were called with string dates
    const { lte, gte } = await import("drizzle-orm");
    expect(lte).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
    );
    expect(gte).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
    );

    // The future date passed to lte should be 7 days from now
    const lteCalls = (lte as ReturnType<typeof vi.fn>).mock.calls;
    const futureStr = lteCalls[0][1] as string;
    const futureDate = new Date(futureStr + "T00:00:00.000Z");
    const diffMs = futureDate.getTime() - before.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    // Should be approximately 7 days (allow some buffer for test timing)
    expect(diffDays).toBeGreaterThanOrEqual(6);
    expect(diffDays).toBeLessThanOrEqual(8);
  });
});
