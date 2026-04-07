import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
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
              return [{ id: "cat-1", name: "Locker Fee", organisationId: "org-1", description: null, sortOrder: 0, isActive: true, createdAt: new Date(), updatedAt: new Date() }];
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
                  return [{ id: "cat-1", name: "Updated Fee", organisationId: "org-1", description: "desc", sortOrder: 1, isActive: true, createdAt: new Date(), updatedAt: new Date() }];
                },
              };
            },
          };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  chargeCategories: { id: "id", organisationId: "organisation_id", name: "name" },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn().mockResolvedValue({ memberId: "admin-1", role: "ADMIN" }),
  canAccessAdmin: vi.fn().mockReturnValue(true),
}));

import { createChargeCategory, updateChargeCategory, toggleChargeCategory } from "../index";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createChargeCategory", () => {
  it("creates a category and returns it", async () => {
    const result = await createChargeCategory({
      organisationId: "11111111-1111-1111-8111-111111111111",
      name: "Locker Fee",
      description: "",
      sortOrder: 0,
      slug: "demo",
    });

    expect(result.id).toBe("cat-1");
    expect(result.name).toBe("Locker Fee");
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Locker Fee" })
    );
  });

  it("rejects empty name", async () => {
    await expect(
      createChargeCategory({
        organisationId: "11111111-1111-1111-8111-111111111111",
        name: "",
        description: "",
        sortOrder: 0,
        slug: "demo",
      })
    ).rejects.toThrow();
  });
});

describe("updateChargeCategory", () => {
  it("updates category fields", async () => {
    const result = await updateChargeCategory({
      id: "cat-1",
      organisationId: "11111111-1111-1111-8111-111111111111",
      name: "Updated Fee",
      description: "desc",
      sortOrder: 1,
      slug: "demo",
    });

    expect(result.name).toBe("Updated Fee");
    expect(mockUpdate).toHaveBeenCalled();
  });
});

describe("toggleChargeCategory", () => {
  it("toggles isActive", async () => {
    await toggleChargeCategory("cat-1", false, "demo", "11111111-1111-1111-8111-111111111111");
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false })
    );
  });
});
