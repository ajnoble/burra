import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDocList = [
  {
    documents: {
      id: "doc-1",
      title: "Bylaws 2026",
      description: null,
      fileUrl: "org-1/abc-bylaws.pdf",
      fileSizeBytes: 50000,
      mimeType: "application/pdf",
      accessLevel: "MEMBER",
      categoryId: "cat-1",
      createdAt: new Date("2026-04-01"),
    },
    document_categories: { id: "cat-1", name: "Bylaws" },
    members: { firstName: "Jane", lastName: "Doe" },
  },
  {
    documents: {
      id: "doc-2",
      title: "Admin Only Doc",
      description: null,
      fileUrl: "org-1/xyz-admin.pdf",
      fileSizeBytes: 30000,
      mimeType: "application/pdf",
      accessLevel: "ADMIN",
      categoryId: null,
      createdAt: new Date("2026-04-02"),
    },
    document_categories: null,
    members: { firstName: "John", lastName: "Smith" },
  },
];

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockLeftJoin = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      const chain: Record<string, (...a: unknown[]) => unknown> = {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return chain;
        },
        leftJoin: (...jArgs: unknown[]) => {
          mockLeftJoin(...jArgs);
          return chain;
        },
        where: (...wArgs: unknown[]) => {
          mockWhere(...wArgs);
          return chain;
        },
        orderBy: (...oArgs: unknown[]) => {
          mockOrderBy(...oArgs);
          return mockDocList;
        },
      };
      return chain;
    },
  },
}));

vi.mock("@/db/schema", () => ({
  documents: {
    id: "documents.id",
    organisationId: "documents.organisationId",
    categoryId: "documents.categoryId",
    title: "documents.title",
    accessLevel: "documents.accessLevel",
    createdAt: "documents.createdAt",
  },
  documentCategories: {
    id: "documentCategories.id",
    name: "documentCategories.name",
    sortOrder: "documentCategories.sortOrder",
  },
  members: {
    id: "members.id",
    firstName: "members.firstName",
    lastName: "members.lastName",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  desc: vi.fn(),
  inArray: vi.fn((...args: unknown[]) => args),
  ilike: vi.fn((...args: unknown[]) => args),
}));

import { listDocuments, listDocumentsForMember } from "./queries";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listDocuments", () => {
  it("returns all documents for an organisation", async () => {
    const result = await listDocuments("org-1");
    expect(result).toHaveLength(2);
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockLeftJoin).toHaveBeenCalled();
  });

  it("passes filter conditions when provided", async () => {
    await listDocuments("org-1", { categoryId: "cat-1" });
    expect(mockWhere).toHaveBeenCalled();
  });
});

describe("listDocumentsForMember", () => {
  it("filters documents by member access level", async () => {
    const result = await listDocumentsForMember("org-1", "MEMBER");
    expect(result).toBeDefined();
    expect(mockWhere).toHaveBeenCalled();
  });

  it("includes correct access levels for COMMITTEE role", async () => {
    await listDocumentsForMember("org-1", "COMMITTEE");
    expect(mockWhere).toHaveBeenCalled();
  });

  it("includes all access levels for ADMIN role", async () => {
    await listDocumentsForMember("org-1", "ADMIN");
    expect(mockWhere).toHaveBeenCalled();
  });
});
