import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockReturning = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockSelectWhere = vi.fn();
const mockLimit = vi.fn();

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
                  return [{ id: "member-id" }];
                },
              };
            },
          };
        },
      };
    },
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            where: (...wArgs: unknown[]) => {
              mockSelectWhere(...wArgs);
              return {
                limit: (...lArgs: unknown[]) => {
                  mockLimit(...lArgs);
                  return [{ id: "some-id", primaryMemberId: null }];
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

import { linkFamilyMember, unlinkFamilyMember } from "../family";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("linkFamilyMember", () => {
  const baseInput = {
    organisationId: "550e8400-e29b-41d4-a716-446655440000",
    slug: "demo",
    primaryMemberId: "660e8400-e29b-41d4-a716-446655440000",
    dependentMemberId: "770e8400-e29b-41d4-a716-446655440000",
  };

  it("sets primaryMemberId on dependent", async () => {
    const result = await linkFamilyMember(baseInput);
    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("rejects self-linking", async () => {
    const result = await linkFamilyMember({
      ...baseInput,
      dependentMemberId: baseInput.primaryMemberId,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("cannot link a member to themselves");
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("unlinkFamilyMember", () => {
  it("clears primaryMemberId", async () => {
    const result = await unlinkFamilyMember({
      organisationId: "550e8400-e29b-41d4-a716-446655440000",
      slug: "demo",
      memberId: "770e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ primaryMemberId: null })
    );
  });
});
