import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockReturning = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

const mockCommunication = {
  id: "comm-1",
  organisationId: "org-1",
  subject: "Test Subject",
  bodyMarkdown: "Hello **world**",
  smsBody: null,
  channel: "EMAIL",
  status: "DRAFT",
  filters: {},
  createdByMemberId: "admin-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

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
              return [mockCommunication];
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
                  return [mockCommunication];
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
              const override = mockWhere(...wArgs);
              if (Array.isArray(override)) return override;
              return [mockCommunication];
            },
          };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  communications: {
    id: "communications.id",
    organisationId: "communications.organisationId",
    status: "communications.status",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi
    .fn()
    .mockResolvedValue({ memberId: "admin-1", role: "ADMIN" }),
  isCommitteeOrAbove: vi.fn().mockReturnValue(true),
}));

import { createDraft, updateDraft } from "../create-draft";
import { revalidatePath } from "next/cache";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createDraft", () => {
  const baseInput = {
    organisationId: "org-1",
    subject: "Test Subject",
    bodyMarkdown: "Hello **world**",
    channel: "EMAIL" as const,
    filters: {},
    createdByMemberId: "admin-1",
    slug: "test-org",
  };

  it("creates a draft communication and returns success", async () => {
    const result = await createDraft(baseInput);

    expect(result.success).toBe(true);
    expect(result.communication).toEqual(mockCommunication);
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("rejects empty body", async () => {
    const result = await createDraft({ ...baseInput, bodyMarkdown: "" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Body is required");
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("updateDraft", () => {
  const baseInput = {
    communicationId: "comm-1",
    organisationId: "org-1",
    subject: "Updated Subject",
    slug: "test-org",
  };

  it("updates a draft communication", async () => {
    const result = await updateDraft(baseInput);

    expect(result.success).toBe(true);
    expect(result.communication).toEqual(mockCommunication);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalled();
  });

  it("rejects update if communication is not DRAFT", async () => {
    // Override the select mock to return a non-draft communication
    mockWhere.mockReturnValueOnce([
      { ...mockCommunication, status: "SENT" },
    ]);

    const result = await updateDraft(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Can only update draft communications");
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
