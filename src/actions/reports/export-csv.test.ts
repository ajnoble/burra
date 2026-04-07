import { describe, it, expect } from "vitest";
import { serialiseCsv, XERO_COLUMN_MAP } from "./export-csv";

describe("serialiseCsv", () => {
  it("generates CSV with headers and rows", () => {
    const columns = [
      { key: "name", header: "Name" },
      { key: "amount", header: "Amount" },
    ];
    const data = [
      { name: "Alice", amount: "100.00" },
      { name: "Bob", amount: "200.50" },
    ];
    const csv = serialiseCsv(columns, data);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Name,Amount");
    expect(lines[1]).toBe("Alice,100.00");
    expect(lines[2]).toBe("Bob,200.50");
  });

  it("escapes commas in values", () => {
    const columns = [{ key: "desc", header: "Description" }];
    const data = [{ desc: "Booking, 3 nights" }];
    const csv = serialiseCsv(columns, data);
    const lines = csv.split("\n");
    expect(lines[1]).toBe('"Booking, 3 nights"');
  });

  it("escapes double quotes in values", () => {
    const columns = [{ key: "desc", header: "Description" }];
    const data = [{ desc: 'He said "hello"' }];
    const csv = serialiseCsv(columns, data);
    const lines = csv.split("\n");
    expect(lines[1]).toBe('"He said ""hello"""');
  });

  it("handles empty data", () => {
    const columns = [{ key: "name", header: "Name" }];
    const data: Record<string, string>[] = [];
    const csv = serialiseCsv(columns, data);
    const lines = csv.split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("Name");
  });
});

describe("XERO_COLUMN_MAP", () => {
  it("has required Xero bank statement columns", () => {
    const keys = XERO_COLUMN_MAP.map((c) => c.header);
    expect(keys).toContain("Date");
    expect(keys).toContain("Amount");
    expect(keys).toContain("Payee");
    expect(keys).toContain("Description");
    expect(keys).toContain("Reference");
  });
});
