import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockDelete = vi.fn();

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
  documents: {
    id: "documents.id",
    organisationId: "documents.organisationId",
    fileUrl: "documents.fileUrl",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn(),
  isCommitteeOrAbove: vi.fn(),
}));

vi.mock("@/lib/supabase/storage", () => ({
  deleteFile: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { deleteDocument } from "./delete";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { deleteFile } from "@/lib/supabase/storage";

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
  mockWhere.mockReturnValue([{ id: "doc-1", organisationId: "org-1", fileUrl: "org-1/abc-test.pdf" }]);
});

describe("deleteDocument", () => {
  it("deletes document from DB and storage", async () => {
    const result = await deleteDocument({
      documentId: "doc-1",
      organisationId: "org-1",
      slug: "test-club",
    });
    expect(result.success).toBe(true);
    expect(deleteFile).toHaveBeenCalledWith("org-1/abc-test.pdf");
    expect(mockDelete).toHaveBeenCalled();
  });

  it("rejects unauthenticated users", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const result = await deleteDocument({
      documentId: "doc-1",
      organisationId: "org-1",
      slug: "test-club",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Not authenticated");
  });

  it("returns error when document not found", async () => {
    mockWhere.mockReturnValueOnce([]);
    const result = await deleteDocument({
      documentId: "not-found",
      organisationId: "org-1",
      slug: "test-club",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Document not found");
  });
});
