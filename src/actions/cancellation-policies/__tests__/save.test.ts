import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

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
              return [{ id: "new-policy-id" }];
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
              mockWhere(...wArgs);
              return {
                returning: () => {
                  mockReturning();
                  return [{ id: "existing-policy-id" }];
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
              mockWhere(...wArgs);
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
});

import { saveCancellationPolicy } from "../save";

describe("saveCancellationPolicy", () => {
  const validInput = {
    organisationId: "org-1",
    name: "Standard Policy",
    rules: [
      { daysBeforeCheckin: 14, forfeitPercentage: 0 },
      { daysBeforeCheckin: 7, forfeitPercentage: 25 },
    ],
    isDefault: true,
  };

  it("creates a new policy with valid input", async () => {
    const result = await saveCancellationPolicy(validInput);
    expect(result.success).toBe(true);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("updates an existing policy when id is provided", async () => {
    const result = await saveCancellationPolicy({ ...validInput, id: "existing-policy-id" });
    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it("rejects empty policy name", async () => {
    const result = await saveCancellationPolicy({ ...validInput, name: "" });
    expect(result.success).toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects forfeitPercentage > 100", async () => {
    const result = await saveCancellationPolicy({ ...validInput, rules: [{ daysBeforeCheckin: 14, forfeitPercentage: 150 }] });
    expect(result.success).toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects forfeitPercentage < 0", async () => {
    const result = await saveCancellationPolicy({ ...validInput, rules: [{ daysBeforeCheckin: 14, forfeitPercentage: -10 }] });
    expect(result.success).toBe(false);
  });

  it("rejects daysBeforeCheckin <= 0", async () => {
    const result = await saveCancellationPolicy({ ...validInput, rules: [{ daysBeforeCheckin: 0, forfeitPercentage: 50 }] });
    expect(result.success).toBe(false);
  });

  it("sorts rules by daysBeforeCheckin descending before saving", async () => {
    await saveCancellationPolicy({
      ...validInput,
      rules: [
        { daysBeforeCheckin: 3, forfeitPercentage: 50 },
        { daysBeforeCheckin: 14, forfeitPercentage: 0 },
        { daysBeforeCheckin: 7, forfeitPercentage: 25 },
      ],
    });
    const savedValues = mockValues.mock.calls[0][0];
    expect(savedValues.rules[0].daysBeforeCheckin).toBe(14);
    expect(savedValues.rules[1].daysBeforeCheckin).toBe(7);
    expect(savedValues.rules[2].daysBeforeCheckin).toBe(3);
  });
});
