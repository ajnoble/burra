import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockSelectRows: unknown[] = [];

vi.mock("@/db/index", () => ({
  db: {
    insert: () => ({
      values: (v: unknown) => {
        mockInsert(v);
        return {
          onConflictDoUpdate: () => ({
            returning: () => [{ id: "cfv-1", customFieldId: "cf-1", memberId: "m-1", value: "John's Mum" }],
          }),
        };
      },
    }),
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => mockSelectRows,
        }),
      }),
    }),
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { saveCustomFieldValues, getCustomFieldValues } from "../values";

beforeEach(() => {
  vi.clearAllMocks();
  mockSelectRows.length = 0;
});

describe("saveCustomFieldValues", () => {
  it("upserts values for a member", async () => {
    await saveCustomFieldValues({
      memberId: "m-1",
      organisationId: "org-1",
      slug: "test-club",
      values: [{ fieldId: "cf-1", value: "John's Mum" }],
    });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        customFieldId: "cf-1",
        memberId: "m-1",
        value: "John's Mum",
      })
    );
  });

  it("skips empty values array", async () => {
    await saveCustomFieldValues({
      memberId: "m-1",
      organisationId: "org-1",
      slug: "test-club",
      values: [],
    });
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("getCustomFieldValues", () => {
  it("returns values joined with field definitions", async () => {
    mockSelectRows.push({
      value: { id: "cfv-1", value: "John's Mum" },
      field: { id: "cf-1", name: "Emergency Contact", key: "emergency_contact", type: "text", options: null, isRequired: false },
    });
    const result = await getCustomFieldValues("m-1", "org-1");
    expect(result).toHaveLength(1);
  });
});
