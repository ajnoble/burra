import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbInsert = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
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
  members: {
    id: "id",
    email: "email",
    firstName: "first_name",
    isFinancial: "is_financial",
    updatedAt: "updated_at",
  },
  seasons: { id: "id", name: "name" },
  organisations: {
    id: "id",
    name: "name",
    slug: "slug",
    contactEmail: "contact_email",
    logoUrl: "logo_url",
    subscriptionGraceDays: "subscription_grace_days",
  },
  financialStatusChanges: {
    organisationId: "organisation_id",
    memberId: "member_id",
    isFinancial: "is_financial",
    reason: "reason",
    changedByMemberId: "changed_by_member_id",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
  lte: vi.fn(),
  sql: vi.fn(),
}));

const mockSendEmail = vi.fn();
vi.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock("@/lib/email/templates/membership-renewal-due", () => ({
  MembershipRenewalDueEmail: () => null,
}));

vi.mock("@/lib/email/templates/financial-status-changed", () => ({
  FinancialStatusChangedEmail: () => null,
}));

import { processSubscriptionCron } from "../cron";

// Helper to build a chained select mock that returns the given rows
function makeSelectChain(rows: unknown[]) {
  return {
    from: () => ({
      innerJoin: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => rows,
          }),
        }),
      }),
    }),
  };
}

// Helper for update mock: set -> where
function makeUpdateChain() {
  return {
    set: () => ({
      where: () => ({}),
    }),
  };
}

// Helper for insert mock: values -> {}
function makeInsertChain() {
  return {
    values: () => ({}),
  };
}

describe("processSubscriptionCron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends reminders for UNPAID subscriptions due today with no reminderSentAt", async () => {
    const dueSub = {
      subscriptionId: "sub-1",
      memberId: "member-1",
      organisationId: "org-1",
      email: "member@example.com",
      firstName: "Alice",
      amountCents: 15000,
      dueDate: "2026-04-06",
      orgName: "Polski Ski Club",
      orgSlug: "polski",
      contactEmail: "admin@polski.com",
      logoUrl: null,
      seasonName: "Winter 2026",
    };

    // Pass 1: returns one due subscription
    mockDbSelect.mockReturnValueOnce(makeSelectChain([dueSub]));
    // Pass 1: update reminderSentAt
    mockDbUpdate.mockReturnValueOnce(makeUpdateChain());

    // Pass 2: returns no expired subscriptions
    mockDbSelect.mockReturnValueOnce(makeSelectChain([]));

    const result = await processSubscriptionCron();

    expect(result.remindersSent).toBe(1);
    expect(result.financialStatusChanged).toBe(0);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "member@example.com",
        subject: expect.stringContaining("Winter 2026"),
      })
    );
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
  });

  it("flips isFinancial to false when grace period has passed", async () => {
    const expiredSub = {
      subscriptionId: "sub-2",
      memberId: "member-2",
      organisationId: "org-1",
      email: "expired@example.com",
      firstName: "Bob",
      amountCents: 10000,
      dueDate: "2026-03-01",
      orgName: "Polski Ski Club",
      orgSlug: "polski",
      contactEmail: "admin@polski.com",
      logoUrl: null,
      seasonName: "Winter 2026",
    };

    // Pass 1: no reminders needed
    mockDbSelect.mockReturnValueOnce(makeSelectChain([]));

    // Pass 2: returns one expired subscription
    mockDbSelect.mockReturnValueOnce(makeSelectChain([expiredSub]));
    // Pass 2: update member isFinancial
    mockDbUpdate.mockReturnValueOnce(makeUpdateChain());
    // Pass 2: insert financialStatusChanges
    mockDbInsert.mockReturnValueOnce(makeInsertChain());

    const result = await processSubscriptionCron();

    expect(result.remindersSent).toBe(0);
    expect(result.financialStatusChanged).toBe(1);
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "expired@example.com",
        subject: expect.stringContaining("Polski Ski Club"),
      })
    );
  });
});
