import { describe, it, expect } from "vitest";
import { parseCsv } from "../parse-csv";

describe("parseCsv", () => {
  it("parses valid CSV with all columns", () => {
    const csv = `first_name,last_name,email,membership_class,phone,date_of_birth
James,Mitchell,james@example.com,Full Member,0412345678,1985-03-15
Sarah,Thompson,sarah@example.com,Associate,,`;

    const result = parseCsv(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0].first_name).toBe("James");
    expect(result.rows[0].email).toBe("james@example.com");
    expect(result.rows[1].phone).toBe("");
  });

  it("normalises header names (trims, lowercases, underscores)", () => {
    const csv = `First Name,Last Name,Email,Membership Class
James,Mitchell,james@example.com,Full Member`;

    const result = parseCsv(csv);
    expect(result.headers).toContain("first_name");
    expect(result.headers).toContain("last_name");
    expect(result.rows[0].first_name).toBe("James");
  });

  it("reports missing required columns", () => {
    const csv = `first_name,email
James,james@example.com`;

    const result = parseCsv(csv);
    expect(result.errors).toContain("Missing required column: last_name");
    expect(result.errors).toContain("Missing required column: membership_class");
  });

  it("warns about unknown columns", () => {
    const csv = `first_name,last_name,email,membership_class,favourite_colour
James,Mitchell,james@example.com,Full Member,blue`;

    const result = parseCsv(csv);
    const unknownWarning = result.errors.find((e) =>
      e.includes("favourite_colour")
    );
    expect(unknownWarning).toBeDefined();
  });

  it("skips empty lines", () => {
    const csv = `first_name,last_name,email,membership_class
James,Mitchell,james@example.com,Full Member

Sarah,Thompson,sarah@example.com,Associate
`;

    const result = parseCsv(csv);
    expect(result.rows).toHaveLength(2);
  });

  it("handles empty CSV", () => {
    const result = parseCsv("");
    expect(result.rows).toHaveLength(0);
  });
});
