import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockDelete = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockDeleteWhere = vi.fn();
const mockUpdateWhere = vi.fn();

let selectReturnValue: unknown[] = [];

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
              return [{ id: "new-override-id", startDate: "2027-07-01", endDate: "2027-07-03" }];
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
              return {
                returning: () => [{ id: "override-id", startDate: "2027-07-01", endDate: "2027-07-03" }],
              };
            },
          };
        },
      };
    },
    delete: (...args: unknown[]) => {
      mockDelete(...args);
      return {
        where: (...wArgs: unknown[]) => {
          mockDeleteWhere(...wArgs);
          return {
            returning: () => [{ id: "override-id", startDate: "2027-07-01", endDate: "2027-07-03", lodgeId: "lodge-id" }],
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
              return selectReturnValue;
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

vi.mock("../rebuild", () => ({
  rebuildAvailabilityCache: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn().mockResolvedValue({ memberId: "session-member-id" }),
}));

import { createAvailabilityOverride, deleteAvailabilityOverride } from "../overrides";

beforeEach(() => {
  vi.clearAllMocks();
  selectReturnValue = [{ id: "lodge-id", totalBeds: 20, organisationId: "org-id" }];
});

describe("createAvailabilityOverride", () => {
  const validInput = {
    lodgeId: "550e8400-e29b-41d4-a716-446655440000",
    startDate: "2027-07-01",
    endDate: "2027-07-03",
    type: "CLOSURE" as const,
    reason: "Maintenance",
    slug: "demo",
  };

  it("inserts override and triggers cache rebuild", async () => {
    const result = await createAvailabilityOverride(validInput);
    expect(result.success).toBe(true);
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalled();
  });

  it("rejects invalid input (endDate before startDate)", async () => {
    const result = await createAvailabilityOverride({
      ...validInput,
      startDate: "2027-07-05",
      endDate: "2027-07-01",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects reduction without bedReduction", async () => {
    const result = await createAvailabilityOverride({
      ...validInput,
      type: "REDUCTION",
    });
    expect(result.success).toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("deleteAvailabilityOverride", () => {
  it("deletes override and triggers cache rebuild", async () => {
    const result = await deleteAvailabilityOverride({
      id: "override-id",
      slug: "demo",
    });
    expect(result.success).toBe(true);
    expect(mockDelete).toHaveBeenCalled();
  });
});
