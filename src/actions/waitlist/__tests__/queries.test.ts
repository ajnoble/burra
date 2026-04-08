import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLeftJoin = vi.fn();
const mockLimit = vi.fn();
const mockOffset = vi.fn();

const mockEntry = {
  id: "entry-1",
  lodgeId: "lodge-1",
  memberId: "member-1",
  bookingRoundId: "round-1",
  checkInDate: "2026-07-01",
  checkOutDate: "2026-07-05",
  numberOfGuests: 2,
  status: "WAITING",
  notifiedAt: null,
  expiresAt: null,
  createdAt: new Date(),
};

const mockEntriesList = [
  { ...mockEntry },
  { ...mockEntry, id: "entry-2", memberId: "member-2" },
];

vi.mock("@/db/index", () => ({
  db: {
    select: (...args: unknown[]) => {
      mockSelect(...args);
      const chain: Record<string, (...a: unknown[]) => unknown> = {
        from: (...fArgs: unknown[]) => {
          mockFrom(...fArgs);
          return chain;
        },
        leftJoin: (...jArgs: unknown[]) => {
          mockLeftJoin(...jArgs);
          return chain;
        },
        where: (...wArgs: unknown[]) => {
          const override = mockWhere(...wArgs);
          if (Array.isArray(override)) return override;
          return chain;
        },
        orderBy: (...oArgs: unknown[]) => {
          mockOrderBy(...oArgs);
          return chain;
        },
        limit: (...lArgs: unknown[]) => {
          mockLimit(...lArgs);
          return chain;
        },
        offset: (...oArgs: unknown[]) => {
          mockOffset(...oArgs);
          return mockEntriesList;
        },
      };
      return chain;
    },
  },
}));

vi.mock("@/db/schema", () => ({
  waitlistEntries: {
    id: "waitlistEntries.id",
    lodgeId: "waitlistEntries.lodgeId",
    memberId: "waitlistEntries.memberId",
    status: "waitlistEntries.status",
    createdAt: "waitlistEntries.createdAt",
  },
  members: {
    id: "members.id",
    firstName: "members.firstName",
    lastName: "members.lastName",
    email: "members.email",
  },
  lodges: {
    id: "lodges.id",
    organisationId: "lodges.organisationId",
    name: "lodges.name",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  asc: vi.fn(),
}));

import { listWaitlistEntries, getWaitlistEntry } from "../queries";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listWaitlistEntries", () => {
  it("returns paginated entries list", async () => {
    const result = await listWaitlistEntries("org-1");

    expect(result.success).toBe(true);
    expect(result.entries).toHaveLength(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledWith(25);
    expect(mockOffset).toHaveBeenCalledWith(0);
  });

  it("supports page parameter", async () => {
    await listWaitlistEntries("org-1", { page: 2 });

    expect(mockOffset).toHaveBeenCalledWith(25);
  });

  it("applies status filter when provided", async () => {
    const { eq, and } = await import("drizzle-orm");
    (eq as ReturnType<typeof vi.fn>).mockClear();
    (and as ReturnType<typeof vi.fn>).mockClear();

    await listWaitlistEntries("org-1", { status: "WAITING" });

    expect(mockOrderBy).toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledWith(25);
  });

  it("applies lodgeId filter when provided", async () => {
    await listWaitlistEntries("org-1", { lodgeId: "lodge-1" });

    expect(mockWhere).toHaveBeenCalled();
    expect(mockLimit).toHaveBeenCalledWith(25);
  });
});

describe("getWaitlistEntry", () => {
  it("returns a single entry", async () => {
    mockWhere.mockReturnValueOnce([mockEntry]);

    const result = await getWaitlistEntry("entry-1", "org-1");

    expect(result).toEqual(mockEntry);
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalled();
  });

  it("returns null when not found", async () => {
    mockWhere.mockReturnValueOnce([]);

    const result = await getWaitlistEntry("not-found", "org-1");

    expect(result).toBeNull();
  });
});
