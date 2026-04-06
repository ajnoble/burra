import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockReturning = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockSendEmail = vi.fn();

let selectCallCount = 0;

vi.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

const mockGetSessionMember = vi.fn();
const mockCanAccessAdmin = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSessionMember: (...args: unknown[]) => mockGetSessionMember(...args),
  canAccessAdmin: (...args: unknown[]) => mockCanAccessAdmin(...args),
}));

vi.mock("@/db/index", () => ({
  db: {
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        set: (...sArgs: unknown[]) => {
          mockSet(...sArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockWhere(...wArgs);
              return {
                returning: () => {
                  mockReturning();
                  return [
                    {
                      id: "booking-1",
                      bookingReference: "BSKI-2027-0042",
                      checkInDate: "2027-07-12",
                      checkOutDate: "2027-07-16",
                      lodgeId: "lodge-1",
                      primaryMemberId: "member-1",
                      organisationId: "org-1",
                    },
                  ];
                },
              };
            },
          };
        },
      };
    },
    select: (...args: unknown[]) => {
      mockSelect(...args);
      const callIndex = selectCallCount++;
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            innerJoin: () => ({
              where: () => {
                // Booking check (call 0)
                if (callIndex === 0) {
                  return [
                    {
                      id: "booking-1",
                      status: "PENDING",
                      organisationId: "org-1",
                    },
                  ];
                }
                return [];
              },
            }),
            where: () => {
              // Booking check (call 0), org details (call 1), lodge details (call 2), member email (call 3)
              if (callIndex === 0)
                return [
                  {
                    id: "booking-1",
                    status: "PENDING",
                    bookingReference: "BSKI-2027-0042",
                    checkInDate: "2027-07-12",
                    checkOutDate: "2027-07-16",
                    lodgeId: "lodge-1",
                    primaryMemberId: "member-1",
                  },
                ];
              if (callIndex === 1)
                return [
                  {
                    name: "Demo Club",
                    contactEmail: "admin@demo.com",
                    logoUrl: null,
                    slug: "demo",
                    defaultApprovalNote: "Welcome!",
                  },
                ];
              if (callIndex === 2) return [{ name: "Main Lodge" }];
              if (callIndex === 3)
                return [
                  {
                    email: "sarah@test.com",
                    firstName: "Sarah",
                    lastName: "Smith",
                  },
                ];
              return [];
            },
          };
        },
      };
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
  mockGetSessionMember.mockResolvedValue({
    memberId: "admin-1",
    organisationId: "org-1",
    role: "ADMIN",
    firstName: "Admin",
    lastName: "User",
    email: "admin@demo.com",
  });
  mockCanAccessAdmin.mockReturnValue(true);
});

import { approveBooking } from "../approve";

describe("approveBooking", () => {
  it("updates booking status to CONFIRMED and sets approval fields", async () => {
    const result = await approveBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      approverMemberId: "admin-1",
      slug: "demo",
    });
    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const setCall = mockSet.mock.calls[0][0];
    expect(setCall.status).toBe("CONFIRMED");
    expect(setCall.approvedByMemberId).toBe("admin-1");
    expect(setCall.approvedAt).toBeDefined();
  });

  it("sends approval email to member", async () => {
    await approveBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      approverMemberId: "admin-1",
      slug: "demo",
    });
    expect(mockSendEmail).toHaveBeenCalled();
    const emailCall = mockSendEmail.mock.calls[0][0];
    expect(emailCall.to).toBe("sarah@test.com");
    expect(emailCall.subject).toContain("approved");
  });

  it("passes custom note to email", async () => {
    await approveBooking({
      bookingId: "booking-1",
      organisationId: "org-1",
      approverMemberId: "admin-1",
      note: "See you on the mountain!",
      slug: "demo",
    });
    expect(mockSendEmail).toHaveBeenCalled();
  });
});
