import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockInnerJoin = vi.fn();
const mockLeftJoin = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();

const testMembers = [
  {
    members: {
      id: "m1",
      firstName: "Alice",
      lastName: "Adams",
      email: "alice@example.com",
      phone: "0400000001",
      membershipClassId: "mc-1",
      isFinancial: true,
    },
    organisation_members: { role: "MEMBER", isActive: true },
    membership_classes: { name: "Full" },
  },
  {
    members: {
      id: "m2",
      firstName: "Bob",
      lastName: "Brown",
      email: "bob@example.com",
      phone: "0400000002",
      membershipClassId: "mc-1",
      isFinancial: true,
    },
    organisation_members: { role: "ADMIN", isActive: true },
    membership_classes: { name: "Full" },
  },
  {
    members: {
      id: "m3",
      firstName: "Carol",
      lastName: "Clark",
      email: "carol@example.com",
      phone: null,
      membershipClassId: "mc-2",
      isFinancial: false,
    },
    organisation_members: { role: "MEMBER", isActive: true },
    membership_classes: { name: "Associate" },
  },
];

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      const chain = {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return chain;
        },
        innerJoin: (...jArgs: unknown[]) => {
          mockInnerJoin(...jArgs);
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
          return testMembers;
        },
      };
      return chain;
    },
  },
}));

vi.mock("@/db/schema", () => ({
  members: {
    id: "members.id",
    organisationId: "members.organisationId",
    firstName: "members.firstName",
    lastName: "members.lastName",
    email: "members.email",
    phone: "members.phone",
    membershipClassId: "members.membershipClassId",
    isFinancial: "members.isFinancial",
  },
  organisationMembers: {
    id: "organisationMembers.id",
    memberId: "organisationMembers.memberId",
    organisationId: "organisationMembers.organisationId",
    role: "organisationMembers.role",
    isActive: "organisationMembers.isActive",
  },
  membershipClasses: {
    id: "membershipClasses.id",
    name: "membershipClasses.name",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
  asc: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionMember: vi
    .fn()
    .mockResolvedValue({ memberId: "admin-1", role: "ADMIN" }),
  isCommitteeOrAbove: vi.fn().mockReturnValue(true),
}));

import { resolveRecipients } from "../recipients";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveRecipients", () => {
  const baseInput = {
    organisationId: "org-1",
    filters: {} as import("@/db/schema/communications").CommunicationFilters,
    channel: "EMAIL" as const,
  };

  it("returns all members with contact flags and correct counts", async () => {
    const result = await resolveRecipients(baseInput);

    expect(result.success).toBe(true);
    expect(result.recipients).toHaveLength(3);
    expect(result.recipients![0].hasEmail).toBe(true);
    expect(result.recipients![0].hasPhone).toBe(true);
    expect(result.recipients![2].hasEmail).toBe(true);
    expect(result.recipients![2].hasPhone).toBe(false);
    expect(result.emailCount).toBe(3);
    expect(result.smsCount).toBe(2);
  });

  it("applies manualExclude filter", async () => {
    const result = await resolveRecipients({
      ...baseInput,
      filters: { manualExclude: ["m2"] },
    });

    expect(result.success).toBe(true);
    expect(result.recipients).toHaveLength(2);
    expect(result.recipients!.find((r) => r.id === "m2")).toBeUndefined();
  });

  it("queries with innerJoin on organisationMembers", async () => {
    await resolveRecipients(baseInput);

    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockInnerJoin).toHaveBeenCalled();
    expect(mockLeftJoin).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
    expect(mockOrderBy).toHaveBeenCalled();
  });
});
