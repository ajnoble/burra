// src/actions/waitlist/__tests__/remove.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockLeftJoin = vi.fn();
const mockWhere = vi.fn();
const mockDelete = vi.fn();
const mockDeleteWhere = vi.fn();

const mockGetSessionMember = vi.fn();
const mockIsCommitteeOrAbove = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSessionMember: (...args: unknown[]) => mockGetSessionMember(...args),
  isCommitteeOrAbove: (...args: unknown[]) => mockIsCommitteeOrAbove(...args),
}));

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return {
            leftJoin: (...jArgs: unknown[]) => {
              mockLeftJoin(...jArgs);
              return {
                where: (...wArgs: unknown[]) => {
                  const override = mockWhere(...wArgs);
                  if (Array.isArray(override)) return override;
                  // Default: return entry with matching org
                  return [
                    {
                      waitlistEntries: { id: "entry-1", lodgeId: "lodge-1" },
                      lodges: { id: "lodge-1", organisationId: "org-1" },
                    },
                  ];
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
          mockDeleteWhere(...wArgs);
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  waitlistEntries: {
    id: "waitlistEntries.id",
    lodgeId: "waitlistEntries.lodgeId",
  },
  lodges: {
    id: "lodges.id",
    organisationId: "lodges.organisationId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { removeWaitlistEntry } from "../remove";

const baseInput = {
  waitlistEntryId: "entry-1",
  organisationId: "org-1",
  slug: "demo",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSessionMember.mockResolvedValue({
    memberId: "admin-1",
    organisationId: "org-1",
    role: "COMMITTEE",
    firstName: "Admin",
    lastName: "User",
    email: "admin@demo.com",
  });
  mockIsCommitteeOrAbove.mockReturnValue(true);
});

describe("removeWaitlistEntry", () => {
  it("removes a waitlist entry successfully", async () => {
    const result = await removeWaitlistEntry(baseInput);

    expect(result.success).toBe(true);
    expect(mockDelete).toHaveBeenCalled();
    expect(mockDeleteWhere).toHaveBeenCalled();
  });

  it("rejects unauthorized users (null session)", async () => {
    mockGetSessionMember.mockResolvedValueOnce(null);

    const result = await removeWaitlistEntry(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not authenticated/i);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("returns error when entry not found (empty select result)", async () => {
    mockWhere.mockReturnValueOnce([]);

    const result = await removeWaitlistEntry(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
