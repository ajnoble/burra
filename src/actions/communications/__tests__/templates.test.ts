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

const mockTemplate = {
  id: "tpl-1",
  organisationId: "org-1",
  name: "Welcome",
  subject: "Welcome!",
  bodyMarkdown: "Hello **world**",
  smsBody: null,
  channel: "EMAIL",
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
              return [mockTemplate];
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
          return chain;
        },
        orderBy: (...oArgs: unknown[]) => {
          mockOrderBy(...oArgs);
          return [mockTemplate];
        },
      };
      return chain;
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
                  return [mockTemplate];
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
          return { rowCount: 1 };
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  communicationTemplates: { id: "communicationTemplates.id", organisationId: "communicationTemplates.organisationId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
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

import {
  createTemplate,
  listTemplates,
  updateTemplate,
  deleteTemplate,
} from "../templates";
import { revalidatePath } from "next/cache";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createTemplate", () => {
  const baseInput = {
    organisationId: "org-1",
    name: "Welcome",
    subject: "Welcome!",
    bodyMarkdown: "Hello **world**",
    channel: "EMAIL" as const,
    createdByMemberId: "admin-1",
    slug: "test-org",
  };

  it("creates a template and returns success", async () => {
    const result = await createTemplate(baseInput);

    expect(result.success).toBe(true);
    expect(result.template).toEqual(mockTemplate);
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("rejects empty name", async () => {
    const result = await createTemplate({ ...baseInput, name: "" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Name is required");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects empty body", async () => {
    const result = await createTemplate({ ...baseInput, bodyMarkdown: "" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Body is required");
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("listTemplates", () => {
  it("returns templates for org", async () => {
    const result = await listTemplates({ organisationId: "org-1" });

    expect(result.success).toBe(true);
    expect(result.templates).toHaveLength(1);
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
  });
});

describe("updateTemplate", () => {
  it("updates and returns template", async () => {
    const result = await updateTemplate({
      id: "tpl-1",
      organisationId: "org-1",
      name: "Updated",
      slug: "test-org",
    });

    expect(result.success).toBe(true);
    expect(result.template).toEqual(mockTemplate);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalled();
  });
});

describe("deleteTemplate", () => {
  it("deletes template and returns success", async () => {
    const result = await deleteTemplate({
      id: "tpl-1",
      organisationId: "org-1",
      slug: "test-org",
    });

    expect(result.success).toBe(true);
    expect(mockDelete).toHaveBeenCalled();
  });
});
