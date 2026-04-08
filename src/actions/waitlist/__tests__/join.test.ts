// src/actions/waitlist/__tests__/join.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockSendEmail = vi.fn();

let selectCallCount = 0;

vi.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
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
            where: (...wArgs: unknown[]) => {
              const override = mockWhere(...wArgs);
              // If mockWhere returned an array, use that (allows mockReturnValueOnce overrides)
              if (Array.isArray(override)) return override;
              // Default responses based on call index
              if (callIndex === 0)
                return [
                  {
                    isFinancial: true,
                    email: "member@test.com",
                    firstName: "Jane",
                    lastName: "Smith",
                    membershipClassId: "class-1",
                  },
                ];
              if (callIndex === 1) return [{ id: "season-1" }];
              if (callIndex === 2)
                return [{ id: "lodge-1", name: "Main Lodge" }];
              if (callIndex === 3)
                return [
                  { date: "2027-07-10", totalBeds: 20, bookedBeds: 20 },
                  { date: "2027-07-11", totalBeds: 20, bookedBeds: 20 },
                  { date: "2027-07-12", totalBeds: 20, bookedBeds: 20 },
                ];
              if (callIndex === 4) return [];
              if (callIndex === 5)
                return [
                  {
                    name: "Demo Club",
                    contactEmail: "admin@demo.com",
                    logoUrl: null,
                  },
                ];
              return [];
            },
          };
        },
      };
    },
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockValues(...vArgs);
          return {
            returning: () => [{ id: "waitlist-entry-1" }],
          };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  waitlistEntries: {
    id: "waitlistEntries.id",
    memberId: "waitlistEntries.memberId",
    lodgeId: "waitlistEntries.lodgeId",
    bookingRoundId: "waitlistEntries.bookingRoundId",
    checkInDate: "waitlistEntries.checkInDate",
    checkOutDate: "waitlistEntries.checkOutDate",
    numberOfGuests: "waitlistEntries.numberOfGuests",
    status: "waitlistEntries.status",
  },
  members: {
    id: "members.id",
    organisationId: "members.organisationId",
    isFinancial: "members.isFinancial",
    email: "members.email",
    firstName: "members.firstName",
    lastName: "members.lastName",
    membershipClassId: "members.membershipClassId",
  },
  seasons: {
    id: "seasons.id",
    organisationId: "seasons.organisationId",
    startDate: "seasons.startDate",
    endDate: "seasons.endDate",
    isActive: "seasons.isActive",
  },
  lodges: {
    id: "lodges.id",
    organisationId: "lodges.organisationId",
    name: "lodges.name",
  },
  availabilityCache: {
    lodgeId: "availabilityCache.lodgeId",
    date: "availabilityCache.date",
    totalBeds: "availabilityCache.totalBeds",
    bookedBeds: "availabilityCache.bookedBeds",
  },
  organisations: {
    id: "organisations.id",
    name: "organisations.name",
    contactEmail: "organisations.contactEmail",
    logoUrl: "organisations.logoUrl",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn().mockResolvedValue({
    memberId: "member-1",
    organisationId: "org-1",
    role: "MEMBER",
    firstName: "Jane",
    lastName: "Smith",
    email: "member@test.com",
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("react", () => ({
  default: { createElement: vi.fn().mockReturnValue(null) },
  createElement: vi.fn().mockReturnValue(null),
}));

import { joinWaitlist } from "../join";
import { getSessionMember } from "@/lib/auth";

const baseInput = {
  organisationId: "org-1",
  lodgeId: "lodge-1",
  bookingRoundId: "round-1",
  checkInDate: "2027-07-10",
  checkOutDate: "2027-07-13",
  numberOfGuests: 2,
  slug: "demo",
};

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
});

describe("joinWaitlist", () => {
  it("creates a waitlist entry for fully booked dates and sends confirmation email", async () => {
    const result = await joinWaitlist(baseInput);

    expect(result.success).toBe(true);
    expect(result.waitlistEntryId).toBeDefined();
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalled();
  });

  it("rejects unauthenticated users", async () => {
    vi.mocked(getSessionMember).mockResolvedValueOnce(null);

    const result = await joinWaitlist(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not authenticated/i);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects non-financial members", async () => {
    // Override call 0: member is not financial
    mockWhere.mockReturnValueOnce([
      {
        isFinancial: false,
        email: "member@test.com",
        firstName: "Jane",
        lastName: "Smith",
        membershipClassId: "class-1",
      },
    ]);

    const result = await joinWaitlist(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/financial/i);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects when dates are not fully booked", async () => {
    // calls 0,1,2 return defaults (success paths); call 3 returns partial availability
    mockWhere
      .mockReturnValueOnce([
        {
          isFinancial: true,
          email: "member@test.com",
          firstName: "Jane",
          lastName: "Smith",
          membershipClassId: "class-1",
        },
      ])
      .mockReturnValueOnce([{ id: "season-1" }])
      .mockReturnValueOnce([{ id: "lodge-1", name: "Main Lodge" }])
      .mockReturnValueOnce([
        // Not fully booked — one day has available beds
        { date: "2027-07-10", totalBeds: 20, bookedBeds: 15 },
        { date: "2027-07-11", totalBeds: 20, bookedBeds: 20 },
        { date: "2027-07-12", totalBeds: 20, bookedBeds: 20 },
      ]);

    const result = await joinWaitlist(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not fully booked/i);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects duplicate waitlist entries", async () => {
    // All checks pass but duplicate check returns existing entry
    mockWhere
      .mockReturnValueOnce([
        {
          isFinancial: true,
          email: "member@test.com",
          firstName: "Jane",
          lastName: "Smith",
          membershipClassId: "class-1",
        },
      ])
      .mockReturnValueOnce([{ id: "season-1" }])
      .mockReturnValueOnce([{ id: "lodge-1", name: "Main Lodge" }])
      .mockReturnValueOnce([
        { date: "2027-07-10", totalBeds: 20, bookedBeds: 20 },
        { date: "2027-07-11", totalBeds: 20, bookedBeds: 20 },
        { date: "2027-07-12", totalBeds: 20, bookedBeds: 20 },
      ])
      .mockReturnValueOnce([{ id: "existing-entry-1" }]);

    const result = await joinWaitlist(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already on the waitlist/i);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
