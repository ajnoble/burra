import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockSelect = vi.fn();

vi.mock("@/db/index", () => ({
  db: {
    insert: (...args: unknown[]) => {
      const chain = {
        values: (v: unknown) => {
          mockInsert(v);
          return { returning: () => [{ id: "cf-1", organisationId: "org-1", name: "Emergency Contact", key: "emergency_contact", type: "text", options: null, sortOrder: 0, isRequired: false, isActive: true }] };
        },
      };
      return chain;
    },
    update: () => ({
      set: (v: unknown) => {
        mockUpdate(v);
        return {
          where: () => ({
            returning: () => [{ id: "cf-1", organisationId: "org-1", name: "Updated", key: "emergency_contact", type: "text", options: null, sortOrder: 0, isRequired: false, isActive: true }],
          }),
        };
      },
    }),
    select: () => {
      const rows = mockSelect();
      return {
        from: () => ({
          where: () => ({
            orderBy: () => rows ?? [],
          }),
        }),
      };
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi.fn().mockResolvedValue({ memberId: "m-1", role: "ADMIN" }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/audit-log", () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import {
  createCustomField,
  updateCustomField,
  toggleCustomField,
  getCustomFields,
} from "../manage";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createCustomField", () => {
  it("creates a text field", async () => {
    const result = await createCustomField({
      organisationId: "org-1",
      name: "Emergency Contact",
      key: "emergency_contact",
      type: "text",
      slug: "test-club",
    });
    expect(result.id).toBe("cf-1");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organisationId: "org-1",
        name: "Emergency Contact",
        key: "emergency_contact",
        type: "text",
      })
    );
  });

  it("rejects invalid input", async () => {
    await expect(
      createCustomField({
        organisationId: "org-1",
        name: "",
        key: "test",
        type: "text",
        slug: "test-club",
      })
    ).rejects.toThrow();
  });
});

describe("updateCustomField", () => {
  it("updates field name", async () => {
    const result = await updateCustomField({
      fieldId: "cf-1",
      organisationId: "org-1",
      name: "Updated",
      slug: "test-club",
    });
    expect(result.name).toBe("Updated");
    expect(mockUpdate).toHaveBeenCalled();
  });
});

describe("toggleCustomField", () => {
  it("deactivates a field", async () => {
    await toggleCustomField("cf-1", false, "test-club");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false })
    );
  });
});

describe("getCustomFields", () => {
  it("returns fields from db", async () => {
    mockSelect.mockReturnValue([
      { id: "cf-1", name: "Emergency Contact", key: "emergency_contact", type: "text", options: null, sortOrder: 0, isRequired: false, isActive: true },
    ]);
    const result = await getCustomFields("org-1");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Emergency Contact");
  });
});
