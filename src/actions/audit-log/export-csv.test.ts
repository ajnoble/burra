import { describe, it, expect } from "vitest";
import { serialiseAuditLogCsv } from "./export-csv";
import type { AuditLogRow } from "./queries";

function makeRow(overrides: Partial<AuditLogRow> = {}): AuditLogRow {
  return {
    id: "log-1",
    action: "MEMBER_CREATED",
    entityType: "member",
    entityId: "member-1",
    previousValue: null,
    newValue: { role: "MEMBER" },
    createdAt: new Date("2025-06-15T10:30:00Z"),
    actorFirstName: "Jane",
    actorLastName: "Smith",
    actorMemberId: "actor-1",
    ...overrides,
  };
}

describe("serialiseAuditLogCsv", () => {
  it("produces header-only CSV for empty rows", () => {
    const csv = serialiseAuditLogCsv([]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("Date,Actor,Action,Entity Type,Entity ID,Changes");
  });

  it("formats dates as DD/MM/YYYY", () => {
    const csv = serialiseAuditLogCsv([makeRow()]);
    const lines = csv.split("\n");
    expect(lines[1]).toContain("15/06/2025");
  });

  it("formats actor name from firstName and lastName", () => {
    const csv = serialiseAuditLogCsv([makeRow()]);
    const lines = csv.split("\n");
    expect(lines[1]).toContain("Jane Smith");
  });

  it("shows 'Unknown' when actor names are null", () => {
    const csv = serialiseAuditLogCsv([
      makeRow({ actorFirstName: null, actorLastName: null }),
    ]);
    const lines = csv.split("\n");
    expect(lines[1]).toContain("Unknown");
  });

  it("includes action, entity type, and entity ID", () => {
    const csv = serialiseAuditLogCsv([makeRow()]);
    const lines = csv.split("\n");
    expect(lines[1]).toContain("MEMBER_CREATED");
    expect(lines[1]).toContain("member");
    expect(lines[1]).toContain("member-1");
  });

  it("shows 'Created' when previousValue is null", () => {
    const csv = serialiseAuditLogCsv([
      makeRow({ previousValue: null, newValue: { role: "MEMBER" } }),
    ]);
    const lines = csv.split("\n");
    expect(lines[1]).toContain("Created");
  });

  it("shows 'Deleted' when newValue is null", () => {
    const csv = serialiseAuditLogCsv([
      makeRow({
        action: "MEMBER_DELETED",
        previousValue: { role: "MEMBER" },
        newValue: null,
      }),
    ]);
    const lines = csv.split("\n");
    expect(lines[1]).toContain("Deleted");
  });

  it("shows changed fields as 'key: old → new'", () => {
    const csv = serialiseAuditLogCsv([
      makeRow({
        action: "MEMBER_UPDATED",
        previousValue: { role: "MEMBER" },
        newValue: { role: "ADMIN" },
      }),
    ]);
    const lines = csv.split("\n");
    expect(lines[1]).toContain("role: MEMBER → ADMIN");
  });

  it("handles multiple rows", () => {
    const csv = serialiseAuditLogCsv([
      makeRow({ id: "log-1" }),
      makeRow({ id: "log-2", action: "BOOKING_APPROVED" }),
    ]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3);
  });

  it("handles actor with only firstName", () => {
    const csv = serialiseAuditLogCsv([
      makeRow({ actorFirstName: "Jane", actorLastName: null }),
    ]);
    const lines = csv.split("\n");
    expect(lines[1]).toContain("Jane");
    expect(lines[1]).not.toContain("Unknown");
  });
});
