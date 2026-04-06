import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
  },
}));

vi.mock("@/db/schema", () => ({
  subscriptions: {
    id: "id",
    organisationId: "organisation_id",
    memberId: "member_id",
    seasonId: "season_id",
    amountCents: "amount_cents",
    dueDate: "due_date",
    status: "status",
    reminderSentAt: "reminder_sent_at",
    updatedAt: "updated_at",
  },
  members: { id: "id", email: "email", firstName: "first_name", lastName: "last_name" },
  seasons: { id: "id", name: "name" },
  organisations: {
    id: "id",
    name: "name",
    slug: "slug",
    contactEmail: "contact_email",
    logoUrl: "logo_url",
  },
}));

const mockSendEmail = vi.fn();
vi.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock("@/lib/email/templates/membership-renewal-due", () => ({
  MembershipRenewalDueEmail: () => null,
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn().mockResolvedValue({ memberId: "admin-1", role: "ADMIN" }),
  canAccessAdmin: vi.fn().mockReturnValue(true),
}));

import {
  sendSubscriptionReminder,
  sendBulkReminders,
} from "../send-reminder";

describe("sendSubscriptionReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends email and updates reminderSentAt", async () => {
    // First select: 4-table join to fetch subscription data
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            innerJoin: () => ({
              where: () => [
                {
                  subscriptionId: "sub-1",
                  email: "member@example.com",
                  amountCents: 15000,
                  dueDate: "2026-06-30",
                  orgName: "Polski Ski Club",
                  orgSlug: "polski",
                  contactEmail: "admin@polski.com",
                  logoUrl: null,
                  seasonName: "Winter 2026",
                },
              ],
            }),
          }),
        }),
      }),
    });

    // Update call
    mockDbUpdate.mockReturnValue({
      set: () => ({
        where: () => ({}),
      }),
    });

    const result = await sendSubscriptionReminder({
      subscriptionId: "sub-1",
      organisationId: "org-1",
    });

    expect(result).toEqual({ success: true });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "member@example.com",
        subject: expect.stringContaining("Winter 2026"),
      })
    );
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it("returns error for unknown subscription", async () => {
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            innerJoin: () => ({
              where: () => [],
            }),
          }),
        }),
      }),
    });

    const result = await sendSubscriptionReminder({
      subscriptionId: "sub-unknown",
      organisationId: "org-1",
    });

    expect(result).toEqual({ success: false, error: expect.any(String) });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });
});

describe("sendBulkReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends reminders for all UNPAID subscriptions and returns count", async () => {
    // First select: fetch all UNPAID subscription IDs
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => [{ id: "sub-1" }, { id: "sub-2" }],
      }),
    });

    // For each sendSubscriptionReminder call: 4-table join select + update
    const makeJoinChain = (subscriptionId: string) => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            innerJoin: () => ({
              where: () => [
                {
                  subscriptionId,
                  email: "member@example.com",
                  amountCents: 15000,
                  dueDate: "2026-06-30",
                  orgName: "Polski Ski Club",
                  orgSlug: "polski",
                  contactEmail: "admin@polski.com",
                  logoUrl: null,
                  seasonName: "Winter 2026",
                },
              ],
            }),
          }),
        }),
      }),
    });

    mockDbSelect.mockReturnValueOnce(makeJoinChain("sub-1"));
    mockDbSelect.mockReturnValueOnce(makeJoinChain("sub-2"));

    mockDbUpdate.mockReturnValue({
      set: () => ({
        where: () => ({}),
      }),
    });

    const result = await sendBulkReminders({
      organisationId: "org-1",
      seasonId: "season-1",
    });

    expect(result).toEqual({ success: true, sent: 2 });
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });
});
