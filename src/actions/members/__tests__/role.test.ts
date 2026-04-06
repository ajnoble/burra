import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockReturning = vi.fn();

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
                  return [{ id: "org-member-id" }];
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

import { updateMemberRole } from "../role";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateMemberRole", () => {
  const baseInput = {
    memberId: "660e8400-e29b-41d4-a716-446655440000",
    organisationId: "550e8400-e29b-41d4-a716-446655440000",
    slug: "demo",
  };

  it("updates role with valid input", async () => {
    const result = await updateMemberRole({ ...baseInput, role: "COMMITTEE" });
    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("rejects invalid role", async () => {
    const result = await updateMemberRole({ ...baseInput, role: "SUPERADMIN" as any });
    expect(result.success).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
