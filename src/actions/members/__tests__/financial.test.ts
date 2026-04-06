import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockSet = vi.fn();
const mockValues = vi.fn();
const mockWhere = vi.fn();
const mockReturning = vi.fn();
const mockSendEmail = vi.fn();

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
                  return [{ id: "member-id", email: "jan@example.com", firstName: "Jan" }];
                },
              };
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
          return { returning: () => [{ id: "change-id" }] };
        },
      };
    },
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: () => ({
          where: () => [{
            name: "Demo Club",
            contactEmail: "admin@demo.com",
            logoUrl: null,
          }],
        }),
      };
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock("@/lib/email/templates/financial-status-changed", () => ({
  FinancialStatusChangedEmail: () => null,
}));

import { updateFinancialStatus } from "../financial";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateFinancialStatus", () => {
  const baseInput = {
    memberId: "660e8400-e29b-41d4-a716-446655440000",
    organisationId: "550e8400-e29b-41d4-a716-446655440000",
    changedByMemberId: "770e8400-e29b-41d4-a716-446655440000",
    slug: "demo",
  };

  it("updates member and inserts history record", async () => {
    const result = await updateFinancialStatus({
      ...baseInput,
      isFinancial: false,
      reason: "Annual dues unpaid",
    });
    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "jan@example.com",
        subject: expect.stringContaining("Membership status updated"),
      })
    );
  });

  it("rejects missing reason", async () => {
    const result = await updateFinancialStatus({
      ...baseInput,
      isFinancial: false,
      reason: "",
    });
    expect(result.success).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only reason", async () => {
    const result = await updateFinancialStatus({
      ...baseInput,
      isFinancial: true,
      reason: "   ",
    });
    expect(result.success).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
