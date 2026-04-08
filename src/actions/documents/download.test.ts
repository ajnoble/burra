import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            where: (...wArgs: unknown[]) => {
              return mockWhere(...wArgs);
            },
          };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  documents: {
    id: "documents.id",
    organisationId: "documents.organisationId",
    fileUrl: "documents.fileUrl",
    accessLevel: "documents.accessLevel",
    title: "documents.title",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
}));

vi.mock("@/lib/supabase/storage", () => ({
  getSignedUrl: vi.fn(),
}));

import { getDownloadUrl } from "./download";
import { getSignedUrl } from "@/lib/supabase/storage";

const mockGetSignedUrl = getSignedUrl as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockWhere.mockReturnValue([{
    id: "doc-1",
    organisationId: "org-1",
    fileUrl: "org-1/abc-test.pdf",
    accessLevel: "MEMBER",
    title: "Test Doc",
  }]);
  mockGetSignedUrl.mockResolvedValue({ url: "https://storage.example.com/signed-url" });
});

describe("getDownloadUrl", () => {
  it("returns signed URL for document accessible to member", async () => {
    const result = await getDownloadUrl("doc-1", "org-1", "MEMBER");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.url).toBe("https://storage.example.com/signed-url");
    }
  });

  it("returns signed URL for ADMIN accessing any document", async () => {
    mockWhere.mockReturnValueOnce([{
      id: "doc-1",
      organisationId: "org-1",
      fileUrl: "org-1/abc-test.pdf",
      accessLevel: "ADMIN",
      title: "Admin Doc",
    }]);
    const result = await getDownloadUrl("doc-1", "org-1", "ADMIN");
    expect(result.success).toBe(true);
  });

  it("rejects MEMBER accessing COMMITTEE document", async () => {
    mockWhere.mockReturnValueOnce([{
      id: "doc-1",
      organisationId: "org-1",
      fileUrl: "org-1/abc-test.pdf",
      accessLevel: "COMMITTEE",
      title: "Committee Doc",
    }]);
    const result = await getDownloadUrl("doc-1", "org-1", "MEMBER");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Access denied");
    }
  });

  it("returns error when document not found", async () => {
    mockWhere.mockReturnValueOnce([]);
    const result = await getDownloadUrl("not-found", "org-1", "ADMIN");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Document not found");
    }
  });

  it("returns error when signed URL generation fails", async () => {
    mockGetSignedUrl.mockResolvedValueOnce({ url: "", error: "Storage error" });
    const result = await getDownloadUrl("doc-1", "org-1", "MEMBER");
    expect(result.success).toBe(false);
  });
});
