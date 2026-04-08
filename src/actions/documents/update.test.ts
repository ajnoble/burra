import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockReturning = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
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
                  return [{ id: "doc-1", title: "Updated Title" }];
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
              return [{ id: "doc-1", organisationId: "org-1", fileUrl: "org-1/old-file.pdf" }];
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
  validateFile: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("crypto", () => ({
  randomUUID: () => "uuid-5678",
}));

import { updateDocument, replaceFile } from "./update";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { validateFile, uploadFile, deleteFile } from "@/lib/supabase/storage";

const mockGetSession = getSessionMember as ReturnType<typeof vi.fn>;
const mockIsCommittee = isCommitteeOrAbove as ReturnType<typeof vi.fn>;
const mockValidateFile = validateFile as ReturnType<typeof vi.fn>;
const mockUploadFile = uploadFile as ReturnType<typeof vi.fn>;

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
  mockValidateFile.mockReturnValue({ valid: true });
  mockUploadFile.mockResolvedValue({ path: "org-1/uuid-5678-new.pdf" });
});

describe("updateDocument", () => {
  it("updates document metadata", async () => {
    const result = await updateDocument({
      documentId: "doc-1",
      organisationId: "org-1",
      title: "Updated Title",
      accessLevel: "COMMITTEE",
      slug: "test-club",
    });
    expect(result.success).toBe(true);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Updated Title", accessLevel: "COMMITTEE" })
    );
  });

  it("rejects unauthenticated users", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const result = await updateDocument({
      documentId: "doc-1",
      organisationId: "org-1",
      title: "Test",
      slug: "test-club",
    });
    expect(result.success).toBe(false);
  });
});

describe("replaceFile", () => {
  it("replaces file in storage and updates record", async () => {
    const file = new File(["new"], "new.pdf", { type: "application/pdf" });
    const fd = new FormData();
    fd.set("file", file);
    fd.set("documentId", "doc-1");
    fd.set("organisationId", "org-1");
    fd.set("slug", "test-club");

    const result = await replaceFile(fd);
    expect(result.success).toBe(true);
    expect(deleteFile).toHaveBeenCalledWith("org-1/old-file.pdf");
    expect(mockUploadFile).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("rejects invalid file types", async () => {
    mockValidateFile.mockReturnValueOnce({ valid: false, error: "Bad type" });
    const fd = new FormData();
    fd.set("file", new File(["x"], "bad.exe", { type: "application/x-msdownload" }));
    fd.set("documentId", "doc-1");
    fd.set("organisationId", "org-1");
    fd.set("slug", "test-club");

    const result = await replaceFile(fd);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Bad type");
  });
});
