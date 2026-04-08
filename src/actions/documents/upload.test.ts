import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();

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
              return [{ id: "doc-1", title: "test.pdf", organisationId: "org-1" }];
            },
          };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  documents: { id: "documents.id" },
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn(),
  isCommitteeOrAbove: vi.fn(),
}));

vi.mock("@/lib/supabase/storage", () => ({
  validateFile: vi.fn(),
  uploadFile: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("crypto", () => ({
  randomUUID: () => "uuid-1234",
}));

import { uploadDocument } from "./upload";
import { getSessionMember, isCommitteeOrAbove } from "@/lib/auth";
import { validateFile, uploadFile } from "@/lib/supabase/storage";

const mockGetSession = getSessionMember as ReturnType<typeof vi.fn>;
const mockIsCommittee = isCommitteeOrAbove as ReturnType<typeof vi.fn>;
const mockValidateFile = validateFile as ReturnType<typeof vi.fn>;
const mockUploadFile = uploadFile as ReturnType<typeof vi.fn>;

function makeFormData(overrides?: Record<string, string | Blob>) {
  const file = new File(["content"], "test.pdf", { type: "application/pdf" });
  const fd = new FormData();
  fd.set("file", overrides?.file ?? file);
  fd.set("title", (overrides?.title as string) ?? "Test Document");
  fd.set("accessLevel", (overrides?.accessLevel as string) ?? "MEMBER");
  fd.set("organisationId", (overrides?.organisationId as string) ?? "org-1");
  fd.set("slug", (overrides?.slug as string) ?? "test-club");
  if (overrides?.categoryId) fd.set("categoryId", overrides.categoryId as string);
  if (overrides?.description) fd.set("description", overrides.description as string);
  return fd;
}

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
  mockUploadFile.mockResolvedValue({ path: "org-1/uuid-1234-test.pdf" });
});

describe("uploadDocument", () => {
  it("uploads a document with valid input", async () => {
    const result = await uploadDocument(makeFormData());
    expect(result.success).toBe(true);
    expect(result.document).toBeDefined();
    expect(mockValidateFile).toHaveBeenCalled();
    expect(mockUploadFile).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
  });

  it("rejects unauthenticated users", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const result = await uploadDocument(makeFormData());
    expect(result.success).toBe(false);
    expect(result.error).toBe("Not authenticated");
  });

  it("rejects non-committee members", async () => {
    mockIsCommittee.mockReturnValueOnce(false);
    const result = await uploadDocument(makeFormData());
    expect(result.success).toBe(false);
    expect(result.error).toBe("Not authorised");
  });

  it("rejects invalid file types", async () => {
    mockValidateFile.mockReturnValueOnce({ valid: false, error: "File type not allowed" });
    const result = await uploadDocument(makeFormData());
    expect(result.success).toBe(false);
    expect(result.error).toBe("File type not allowed");
  });

  it("handles storage upload failure", async () => {
    mockUploadFile.mockResolvedValueOnce({ path: "", error: "Storage error" });
    const result = await uploadDocument(makeFormData());
    expect(result.success).toBe(false);
    expect(result.error).toBe("Storage error");
  });

  it("sets optional categoryId and description", async () => {
    const fd = makeFormData({ categoryId: "cat-1", description: "A doc" });
    await uploadDocument(fd);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: "cat-1", description: "A doc" })
    );
  });
});
