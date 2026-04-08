import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockConsoleError = vi
  .spyOn(console, "error")
  .mockImplementation(() => {});

vi.mock("@/db/index", () => ({
  db: {
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return {
        values: (...vArgs: unknown[]) => {
          mockValues(...vArgs);
          return Promise.resolve();
        },
      };
    },
  },
}));

vi.mock("@/db/schema", () => ({
  auditLog: { id: "audit_log.id" },
}));

import {
  createAuditLog,
  diffChanges,
  formatChangeSummary,
  getEntityUrl,
} from "../audit-log";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createAuditLog", () => {
  const validInput = {
    organisationId: "org-1",
    actorMemberId: "member-1",
    action: "BOOKING_APPROVED",
    entityType: "booking",
    entityId: "booking-1",
    previousValue: { status: "PENDING" },
    newValue: { status: "APPROVED" },
  };

  it("inserts a row into the audit_log table", async () => {
    await createAuditLog(validInput);
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith({
      organisationId: "org-1",
      actorMemberId: "member-1",
      action: "BOOKING_APPROVED",
      entityType: "booking",
      entityId: "booking-1",
      previousValue: { status: "PENDING" },
      newValue: { status: "APPROVED" },
    });
  });

  it("accepts null previousValue and newValue", async () => {
    await createAuditLog({
      ...validInput,
      previousValue: null,
      newValue: null,
    });
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        previousValue: null,
        newValue: null,
      })
    );
  });

  it("never throws — catches errors and logs them", async () => {
    mockInsert.mockImplementationOnce(() => {
      throw new Error("DB connection failed");
    });
    await expect(createAuditLog(validInput)).resolves.toBeUndefined();
    expect(mockConsoleError).toHaveBeenCalledWith(
      "[audit-log] Failed to write audit log:",
      expect.any(Error)
    );
  });
});

describe("diffChanges", () => {
  it("returns only keys that differ", () => {
    const result = diffChanges(
      { name: "Alice", role: "MEMBER", age: 30 },
      { name: "Alice", role: "ADMIN", age: 30 }
    );
    expect(result).toEqual({
      previousValue: { role: "MEMBER" },
      newValue: { role: "ADMIN" },
    });
  });

  it("handles multiple changed keys", () => {
    const result = diffChanges(
      { name: "Alice", role: "MEMBER" },
      { name: "Bob", role: "ADMIN" }
    );
    expect(result).toEqual({
      previousValue: { name: "Alice", role: "MEMBER" },
      newValue: { name: "Bob", role: "ADMIN" },
    });
  });

  it("returns empty objects when nothing differs", () => {
    const result = diffChanges({ a: 1, b: 2 }, { a: 1, b: 2 });
    expect(result).toEqual({ previousValue: {}, newValue: {} });
  });

  it("handles keys present in current but not previous", () => {
    const result = diffChanges({ a: 1 }, { a: 1, b: 2 });
    expect(result).toEqual({
      previousValue: { b: undefined },
      newValue: { b: 2 },
    });
  });

  it("handles keys present in previous but not current", () => {
    const result = diffChanges({ a: 1, b: 2 }, { a: 1 });
    expect(result).toEqual({
      previousValue: { b: 2 },
      newValue: { b: undefined },
    });
  });

  it("detects null vs value differences", () => {
    const result = diffChanges({ a: null }, { a: "hello" });
    expect(result).toEqual({
      previousValue: { a: null },
      newValue: { a: "hello" },
    });
  });

  it("treats identical null values as unchanged", () => {
    const result = diffChanges({ a: null }, { a: null });
    expect(result).toEqual({ previousValue: {}, newValue: {} });
  });
});

describe("formatChangeSummary", () => {
  it("returns 'Created' when previousValue is null", () => {
    expect(
      formatChangeSummary("MEMBER_CREATED", null, { role: "MEMBER" })
    ).toBe("Created");
  });

  it("returns 'Deleted' when newValue is null", () => {
    expect(
      formatChangeSummary("MEMBER_DELETED", { role: "MEMBER" }, null)
    ).toBe("Deleted");
  });

  it("formats a single changed field", () => {
    expect(
      formatChangeSummary(
        "MEMBER_UPDATED",
        { role: "MEMBER" },
        { role: "ADMIN" }
      )
    ).toBe("role: MEMBER → ADMIN");
  });

  it("formats multiple changed fields joined with comma", () => {
    const result = formatChangeSummary(
      "MEMBER_UPDATED",
      { role: "MEMBER", name: "Alice" },
      { role: "ADMIN", name: "Bob" }
    );
    expect(result).toBe("role: MEMBER → ADMIN, name: Alice → Bob");
  });

  it("returns empty string for empty objects", () => {
    expect(formatChangeSummary("NOOP", {}, {})).toBe("");
  });

  it("returns 'Deleted' when newValue is null even with non-null previousValue", () => {
    expect(
      formatChangeSummary("BOOKING_DELETED", { status: "APPROVED" }, null)
    ).toBe("Deleted");
  });

  it("returns 'Created' when previousValue is null even with non-null newValue", () => {
    expect(
      formatChangeSummary("BOOKING_CREATED", null, { status: "PENDING" })
    ).toBe("Created");
  });
});

describe("getEntityUrl", () => {
  const slug = "my-club";

  it("returns correct URL for booking", () => {
    expect(getEntityUrl(slug, "booking", "b-1")).toBe(
      "/my-club/admin/bookings/b-1"
    );
  });

  it("returns correct URL for member", () => {
    expect(getEntityUrl(slug, "member", "m-1")).toBe(
      "/my-club/admin/members/m-1"
    );
  });

  it("returns correct URL for subscription", () => {
    expect(getEntityUrl(slug, "subscription", "s-1")).toBe(
      "/my-club/admin/subscriptions"
    );
  });

  it("returns correct URL for charge", () => {
    expect(getEntityUrl(slug, "charge", "c-1")).toBe(
      "/my-club/admin/charges"
    );
  });

  it("returns correct URL for document", () => {
    expect(getEntityUrl(slug, "document", "d-1")).toBe(
      "/my-club/admin/documents"
    );
  });

  it("returns correct URL for documentCategory", () => {
    expect(getEntityUrl(slug, "documentCategory", "dc-1")).toBe(
      "/my-club/admin/documents"
    );
  });

  it("returns correct URL for communication", () => {
    expect(getEntityUrl(slug, "communication", "comm-1")).toBe(
      "/my-club/admin/communications"
    );
  });

  it("returns correct URL for waitlistEntry", () => {
    expect(getEntityUrl(slug, "waitlistEntry", "w-1")).toBe(
      "/my-club/admin/waitlist"
    );
  });

  it("returns correct URL for organisation", () => {
    expect(getEntityUrl(slug, "organisation", "org-1")).toBe(
      "/my-club/admin/settings"
    );
  });

  it("returns null for unknown entity type", () => {
    expect(getEntityUrl(slug, "unknown", "x-1")).toBeNull();
  });
});
