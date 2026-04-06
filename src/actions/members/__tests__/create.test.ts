import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockValues(...vArgs);
          return {
            returning: () => {
              mockReturning();
              return [{ id: "new-member-id", email: "james@example.com" }];
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
              mockWhere(...wArgs);
              return []; // no existing member with this email
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

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import { createMember } from "../create";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createMember", () => {
  const validInput = {
    organisationId: "550e8400-e29b-41d4-a716-446655440000",
    slug: "demo",
    firstName: "James",
    lastName: "Mitchell",
    email: "james@example.com",
    membershipClassId: "660e8400-e29b-41d4-a716-446655440000",
  };

  it("inserts member and org member records", async () => {
    await createMember(validInput);
    // Two inserts: members + organisationMembers
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockValues).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid email", async () => {
    const result = await createMember({
      ...validInput,
      email: "not-valid",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects missing firstName", async () => {
    const result = await createMember({
      ...validInput,
      firstName: "",
    });
    expect(result.success).toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
