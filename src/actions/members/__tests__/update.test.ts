import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockReturning = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => [{ firstName: "Old", lastName: "Name", email: "old@test.com", phone: null, dateOfBirth: null, memberNumber: null, membershipClassId: null, notes: null }],
      }),
    }),
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
                  return [{ id: "member-id" }];
                },
              };
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

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn().mockResolvedValue({ memberId: "actor-1", role: "ADMIN" }),
}));

vi.mock("@/lib/audit-log", () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  diffChanges: vi.fn().mockReturnValue({ previousValue: {}, newValue: {} }),
}));

import { updateMember } from "../update";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateMember", () => {
  const baseInput = {
    memberId: "660e8400-e29b-41d4-a716-446655440000",
    organisationId: "550e8400-e29b-41d4-a716-446655440000",
    slug: "demo",
  };

  it("updates member with valid partial data", async () => {
    const result = await updateMember({
      ...baseInput,
      firstName: "Updated",
    });
    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalled();
  });

  it("rejects invalid email", async () => {
    const result = await updateMember({
      ...baseInput,
      email: "bad-email",
    });
    expect(result.success).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects empty firstName", async () => {
    const result = await updateMember({
      ...baseInput,
      firstName: "",
    });
    expect(result.success).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
