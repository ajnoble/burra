import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockDelete = vi.fn();

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
              return [{ id: "cat-1", name: "Meeting Minutes", organisationId: "org-1", sortOrder: 0 }];
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
              return {
                orderBy: (...oArgs: unknown[]) => {
                  mockOrderBy(...oArgs);
                  return [
                    { id: "cat-1", name: "Bylaws", sortOrder: 0 },
                    { id: "cat-2", name: "Minutes", sortOrder: 1 },
                  ];
                },
              };
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
                  return [{ id: "cat-1", name: "Updated", sortOrder: 0 }];
                },
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
          mockWhere(...wArgs);
          return undefined;
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  documentCategories: {
    id: "documentCategories.id",
    organisationId: "documentCategories.organisationId",
    name: "documentCategories.name",
    sortOrder: "documentCategories.sortOrder",
  },
  documents: {
    id: "documents.id",
    categoryId: "documents.categoryId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  asc: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn(),
  isCommitteeOrAbove: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  listDocumentCategories,
  createDocumentCategory,
  updateDocumentCategory,
  deleteDocumentCategory,
} from "./categories";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";

const mockGetSession = getSessionMember as ReturnType<typeof vi.fn>;
const mockIsCommittee = isCommitteeOrAbove as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({
    memberId: "member-1",
    organisationId: "org-1",
    role: "ADMIN",
    firstName: "Test",
    lastName: "User",
    email: "test@test.com",
  });
  mockIsCommittee.mockReturnValue(true);
});

describe("listDocumentCategories", () => {
  it("returns categories sorted by sortOrder", async () => {
    const result = await listDocumentCategories("org-1");
    expect(result).toHaveLength(2);
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockOrderBy).toHaveBeenCalled();
  });
});

describe("createDocumentCategory", () => {
  it("creates a category with valid input", async () => {
    const result = await createDocumentCategory({
      organisationId: "org-1",
      name: "Meeting Minutes",
      slug: "test-club",
    });
    expect(result.success).toBe(true);
    expect(result.category).toBeDefined();
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Meeting Minutes", organisationId: "org-1" })
    );
  });

  it("rejects unauthenticated users", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const result = await createDocumentCategory({
      organisationId: "org-1",
      name: "Test",
      slug: "test-club",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Not authenticated");
  });

  it("rejects non-committee members", async () => {
    mockIsCommittee.mockReturnValueOnce(false);
    const result = await createDocumentCategory({
      organisationId: "org-1",
      name: "Test",
      slug: "test-club",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Not authorised");
  });

  it("rejects empty name", async () => {
    const result = await createDocumentCategory({
      organisationId: "org-1",
      name: "",
      slug: "test-club",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Name is required");
  });
});

describe("updateDocumentCategory", () => {
  it("updates a category", async () => {
    const result = await updateDocumentCategory({
      id: "cat-1",
      organisationId: "org-1",
      name: "Updated",
      slug: "test-club",
    });
    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ name: "Updated" }));
  });
});

describe("deleteDocumentCategory", () => {
  it("nullifies document categoryIds and deletes the category", async () => {
    const result = await deleteDocumentCategory({
      id: "cat-1",
      organisationId: "org-1",
      slug: "test-club",
    });
    expect(result.success).toBe(true);
    // First update call: set documents.categoryId to null
    expect(mockUpdate).toHaveBeenCalled();
    // Then delete call
    expect(mockDelete).toHaveBeenCalled();
  });
});
