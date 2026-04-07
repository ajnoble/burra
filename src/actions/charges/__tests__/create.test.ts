import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockInnerJoin = vi.fn();
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
              return [
                {
                  id: "charge-id-1",
                  organisationId: "org-1",
                  memberId: "member-1",
                  categoryId: "cat-1",
                  description: null,
                  amountCents: 5000,
                  dueDate: null,
                  status: "UNPAID",
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              ];
            },
          };
        },
      };
    },
    select: (...args: unknown[]) => {
      mockSelect(...args);
      const chain = {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return chain;
        },
        innerJoin: (...jArgs: unknown[]) => {
          mockInnerJoin(...jArgs);
          return chain;
        },
        where: (...wArgs: unknown[]) => {
          mockWhere(...wArgs);
          return [];
        },
      };
      return chain;
    },
  },
}));

vi.mock("@/db/schema", () => ({
  oneOffCharges: { id: "oneOffCharges" },
  members: { id: "members", email: "email" },
  chargeCategories: { id: "chargeCategories", name: "name" },
  organisations: { id: "organisations", name: "name", slug: "slug", contactEmail: "contactEmail", logoUrl: "logoUrl" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/email/templates/charge-created", () => ({
  ChargeCreatedEmail: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { createCharge } from "../create";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createCharge", () => {
  const baseInput = {
    organisationId: "org-1",
    memberId: "member-1",
    categoryId: "cat-1",
    amountCents: 5000,
    createdByMemberId: "admin-1",
    slug: "test-org",
  };

  it("creates a charge with valid input and returns success", async () => {
    const result = await createCharge(baseInput);

    expect(result.success).toBe(true);
    expect(result.charge).toBeDefined();
    expect(result.charge?.id).toBe("charge-id-1");
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        organisationId: "org-1",
        memberId: "member-1",
        categoryId: "cat-1",
        amountCents: 5000,
      })
    );
  });

  it("rejects zero amount", async () => {
    const result = await createCharge({ ...baseInput, amountCents: 0 });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Amount must be greater than zero");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects negative amount", async () => {
    const result = await createCharge({ ...baseInput, amountCents: -100 });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Amount must be greater than zero");
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
