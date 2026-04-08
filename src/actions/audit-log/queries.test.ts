import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockLeftJoin = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockOffset = vi.fn();
const mockSelectDistinct = vi.fn();
const mockCount = vi.fn();

const mockRows: unknown[] = [];

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
          mockWhere(...wArgs);
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
          return mockRows;
        },
      };
      return chain;
    },
    selectDistinct: (...args: unknown[]) => {
      mockSelectDistinct(...args);
      const chain: Record<string, (...a: unknown[]) => unknown> = {
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
          return [
            { action: "BOOKING_APPROVED" },
            { action: "MEMBER_CREATED" },
          ];
        },
      };
      return chain;
    },
    $count: (...args: unknown[]) => {
      mockCount(...args);
      return Promise.resolve(0);
    },
  },
}));

vi.mock("@/db/schema", () => ({
  auditLog: {
    id: "audit_log.id",
    organisationId: "audit_log.organisation_id",
    actorMemberId: "audit_log.actor_member_id",
    action: "audit_log.action",
    entityType: "audit_log.entity_type",
    entityId: "audit_log.entity_id",
    previousValue: "audit_log.previous_value",
    newValue: "audit_log.new_value",
    createdAt: "audit_log.created_at",
  },
  members: {
    id: "members.id",
    firstName: "members.first_name",
    lastName: "members.last_name",
  },
}));

import { getAuditLogEntries, getDistinctActions } from "./queries";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAuditLogEntries", () => {
  it("returns { rows, total, page, pageSize } structure", async () => {
    const result = await getAuditLogEntries({ organisationId: "org-1" });
    expect(result).toEqual({
      rows: mockRows,
      total: 0,
      page: 1,
      pageSize: 25,
    });
  });

  it("defaults to page 1 and pageSize 25", async () => {
    await getAuditLogEntries({ organisationId: "org-1" });
    expect(mockLimit).toHaveBeenCalledWith(25);
    expect(mockOffset).toHaveBeenCalledWith(0);
  });

  it("calculates offset from page and pageSize", async () => {
    await getAuditLogEntries({ organisationId: "org-1", page: 3, pageSize: 10 });
    expect(mockLimit).toHaveBeenCalledWith(10);
    expect(mockOffset).toHaveBeenCalledWith(20);
  });

  it("accepts action filter without error", async () => {
    await expect(
      getAuditLogEntries({ organisationId: "org-1", action: "BOOKING_APPROVED" })
    ).resolves.toBeDefined();
  });

  it("accepts entityType filter without error", async () => {
    await expect(
      getAuditLogEntries({ organisationId: "org-1", entityType: "booking" })
    ).resolves.toBeDefined();
  });

  it("accepts actorMemberId filter without error", async () => {
    await expect(
      getAuditLogEntries({ organisationId: "org-1", actorMemberId: "member-1" })
    ).resolves.toBeDefined();
  });

  it("accepts dateFrom and dateTo filters without error", async () => {
    await expect(
      getAuditLogEntries({
        organisationId: "org-1",
        dateFrom: "2025-01-01",
        dateTo: "2025-12-31",
      })
    ).resolves.toBeDefined();
  });

  it("accepts all filters combined without error", async () => {
    await expect(
      getAuditLogEntries({
        organisationId: "org-1",
        action: "MEMBER_CREATED",
        entityType: "member",
        actorMemberId: "member-1",
        dateFrom: "2025-01-01",
        dateTo: "2025-12-31",
        page: 2,
        pageSize: 50,
      })
    ).resolves.toBeDefined();
  });

  it("calls db.$count with the where clause", async () => {
    await getAuditLogEntries({ organisationId: "org-1" });
    expect(mockCount).toHaveBeenCalled();
  });

  it("joins with members table for actor names", async () => {
    await getAuditLogEntries({ organisationId: "org-1" });
    expect(mockLeftJoin).toHaveBeenCalled();
  });

  it("orders by createdAt descending", async () => {
    await getAuditLogEntries({ organisationId: "org-1" });
    expect(mockOrderBy).toHaveBeenCalled();
  });
});

describe("getDistinctActions", () => {
  it("returns an array of action strings", async () => {
    const result = await getDistinctActions("org-1");
    expect(result).toEqual(["BOOKING_APPROVED", "MEMBER_CREATED"]);
  });

  it("calls selectDistinct", async () => {
    await getDistinctActions("org-1");
    expect(mockSelectDistinct).toHaveBeenCalled();
  });

  it("filters by organisationId", async () => {
    await getDistinctActions("org-1");
    expect(mockWhere).toHaveBeenCalled();
  });
});
