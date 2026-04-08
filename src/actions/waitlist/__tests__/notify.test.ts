// src/actions/waitlist/__tests__/notify.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLeftJoin = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockUpdateWhere = vi.fn();
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
            leftJoin: (...ljArgs: unknown[]) => {
              mockLeftJoin(...ljArgs);
              return {
                where: (...wArgs: unknown[]) => {
                  const override = mockWhere(...wArgs);
                  if (Array.isArray(override)) return override;
                  // callIndex 0: entry+lodge join
                  return [
                    {
                      id: "entry-1",
                      status: "WAITING",
                      memberId: "member-1",
                      lodgeId: "lodge-1",
                      checkInDate: "2027-07-10",
                      checkOutDate: "2027-07-13",
                      numberOfGuests: 2,
                      lodgeOrganisationId: "org-1",
                      lodgeName: "Main Lodge",
                    },
                  ];
                },
              };
            },
            where: (...wArgs: unknown[]) => {
              const override = mockWhere(...wArgs);
              if (Array.isArray(override)) return override;
              // callIndex 1: member details
              if (callIndex === 1)
                return [
                  {
                    email: "member@test.com",
                    firstName: "Jane",
                    lastName: "Smith",
                  },
                ];
              // callIndex 2: org details
              if (callIndex === 2)
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
  waitlistEntries: {
    id: "waitlistEntries.id",
    memberId: "waitlistEntries.memberId",
    lodgeId: "waitlistEntries.lodgeId",
    checkInDate: "waitlistEntries.checkInDate",
    checkOutDate: "waitlistEntries.checkOutDate",
    numberOfGuests: "waitlistEntries.numberOfGuests",
    status: "waitlistEntries.status",
    notifiedAt: "waitlistEntries.notifiedAt",
    expiresAt: "waitlistEntries.expiresAt",
  },
  lodges: {
    id: "lodges.id",
    organisationId: "lodges.organisationId",
    name: "lodges.name",
  },
  members: {
    id: "members.id",
    email: "members.email",
    firstName: "members.firstName",
    lastName: "members.lastName",
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
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn().mockResolvedValue({
    memberId: "member-1",
    organisationId: "org-1",
    role: "COMMITTEE",
    firstName: "Admin",
    lastName: "User",
    email: "admin@test.com",
  }),
  isCommitteeOrAbove: vi.fn().mockReturnValue(true),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("react", () => ({
  default: { createElement: vi.fn().mockReturnValue(null) },
  createElement: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/email/templates/waitlist-spot-available", () => ({
  WaitlistSpotAvailableEmail: vi.fn(),
}));

import { notifyWaitlistEntry } from "../notify";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";

const baseInput = {
  waitlistEntryId: "entry-1",
  organisationId: "org-1",
  slug: "demo",
};

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
  // Reset default mocks
  vi.mocked(getSessionMember).mockResolvedValue({
    memberId: "member-1",
    organisationId: "org-1",
    role: "COMMITTEE",
    firstName: "Admin",
    lastName: "User",
    email: "admin@test.com",
  });
  vi.mocked(isCommitteeOrAbove).mockReturnValue(true);
});

describe("notifyWaitlistEntry", () => {
  it("notifies a WAITING entry: status updated to NOTIFIED, email sent", async () => {
    const result = await notifyWaitlistEntry(baseInput);

    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "NOTIFIED",
      })
    );
    expect(mockSendEmail).toHaveBeenCalled();
  });

  it("rejects unauthenticated users", async () => {
    vi.mocked(getSessionMember).mockResolvedValueOnce(null);

    const result = await notifyWaitlistEntry(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unauthorized/i);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("rejects non-committee users", async () => {
    vi.mocked(getSessionMember).mockResolvedValueOnce({
      memberId: "member-1",
      organisationId: "org-1",
      role: "MEMBER",
      firstName: "Regular",
      lastName: "User",
      email: "regular@test.com",
    });
    vi.mocked(isCommitteeOrAbove).mockReturnValueOnce(false);

    const result = await notifyWaitlistEntry(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unauthorized/i);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("rejects entry not in WAITING status", async () => {
    // Override the first leftJoin select to return a NOTIFIED entry
    mockWhere.mockReturnValueOnce([
      {
        id: "entry-1",
        status: "NOTIFIED",
        memberId: "member-1",
        lodgeId: "lodge-1",
        checkInDate: "2027-07-10",
        checkOutDate: "2027-07-13",
        numberOfGuests: 2,
        lodgeOrganisationId: "org-1",
        lodgeName: "Main Lodge",
      },
    ]);

    const result = await notifyWaitlistEntry(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not in WAITING status/i);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
