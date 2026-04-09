import { describe, it, expect } from "vitest";
import { parseCsv } from "../parse-csv";

describe("parseCsv with custom fields", () => {
  const customFieldKeys = ["emergency_contact", "dietary_requirements", "locker_number"];

  it("does not warn about columns matching custom field keys", () => {
    const csv = "first_name,last_name,email,membership_class,emergency_contact\nJohn,Doe,john@test.com,Full Member,Jane Doe";
    const result = parseCsv(csv, customFieldKeys);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]).toHaveProperty("emergency_contact", "Jane Doe");
  });

  it("still warns about truly unknown columns", () => {
    const csv = "first_name,last_name,email,membership_class,favourite_colour\nJohn,Doe,john@test.com,Full Member,Blue";
    const result = parseCsv(csv, customFieldKeys);
    expect(result.errors).toContain('Unknown column "favourite_colour" will be ignored');
  });

  it("preserves custom field values in row data", () => {
    const csv = "first_name,last_name,email,membership_class,locker_number,dietary_requirements\nJohn,Doe,john@test.com,Full Member,42,Vegan";
    const result = parseCsv(csv, customFieldKeys);
    expect(result.rows[0]).toHaveProperty("locker_number", "42");
    expect(result.rows[0]).toHaveProperty("dietary_requirements", "Vegan");
  });

  it("works without custom field keys (backwards compatible)", () => {
    const csv = "first_name,last_name,email,membership_class,emergency_contact\nJohn,Doe,john@test.com,Full Member,Jane Doe";
    const result = parseCsv(csv);
    expect(result.errors).toContain('Unknown column "emergency_contact" will be ignored');
  });
});
