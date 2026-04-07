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
              return [
                { id: "charge-1", memberId: "member-1" },
                { id: "charge-2", memberId: "member-2" },
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
        where: (...wArgs: unknown[]) => {
          mockWhere(...wArgs);
          // Return different data based on call order
          const callCount = mockWhere.mock.calls.length;
          if (callCount === 1) {
            // members query
            return [
              { id: "member-1", email: "member1@example.com" },
              { id: "member-2", email: "member2@example.com" },
            ];
          } else if (callCount === 2) {
            // chargeCategories query
            return [{ name: "Membership Fee" }];
          } else {
            // organisations query
            return [
              {
                name: "Test Org",
                slug: "test-org",
                contactEmail: "contact@test.com",
                logoUrl: null,
              },
            ];
          }
        },
      };
      return chain;
    },
  },
}));

vi.mock("@/db/schema", () => ({
  oneOffCharges: { id: "oneOffCharges" },
  members: { id: "members", email: "email", organisationId: "organisationId" },
  chargeCategories: { id: "chargeCategories", name: "name" },
  organisations: {
    id: "organisations",
    name: "name",
    slug: "slug",
    contactEmail: "contactEmail",
    logoUrl: "logoUrl",
  },
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

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn().mockResolvedValue({ memberId: "admin-1", role: "ADMIN" }),
  canAccessAdmin: vi.fn().mockReturnValue(true),
}));

import { bulkCreateCharges } from "../bulk-create";
import { revalidatePath } from "next/cache";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("bulkCreateCharges", () => {
  const baseInput = {
    organisationId: "org-1",
    memberIds: ["member-1", "member-2"],
    categoryId: "cat-1",
    amountCents: 5000,
    createdByMemberId: "admin-1",
    slug: "test-org",
  };

  it("creates charges for multiple members and returns success with count", async () => {
    const result = await bulkCreateCharges(baseInput);

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ memberId: "member-1", amountCents: 5000 }),
        expect.objectContaining({ memberId: "member-2", amountCents: 5000 }),
      ])
    );
    expect(revalidatePath).toHaveBeenCalledWith("/test-org/admin/charges");
  });

  it("rejects empty member list", async () => {
    const result = await bulkCreateCharges({ ...baseInput, memberIds: [] });

    expect(result.success).toBe(false);
    expect(result.error).toBe("No members selected");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects zero amount", async () => {
    const result = await bulkCreateCharges({ ...baseInput, amountCents: 0 });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Amount must be greater than zero");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects negative amount", async () => {
    const result = await bulkCreateCharges({ ...baseInput, amountCents: -100 });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Amount must be greater than zero");
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
