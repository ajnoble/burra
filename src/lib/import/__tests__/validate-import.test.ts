import { describe, it, expect } from "vitest";
import { validateImportRows, parseBoolean } from "../validate-import";
import type { CsvRow } from "../parse-csv";

const VALID_CLASSES = new Set(["Full Member", "Associate", "Junior"]);
const NO_EXISTING = new Set<string>();

function makeRow(overrides: Partial<CsvRow> = {}): CsvRow {
  return {
    first_name: "James",
    last_name: "Mitchell",
    email: "james@example.com",
    membership_class: "Full Member",
    ...overrides,
  };
}

describe("validateImportRows", () => {
  it("validates a correct row", () => {
    const result = validateImportRows([makeRow()], NO_EXISTING, VALID_CLASSES);
    expect(result.validCount).toBe(1);
    expect(result.errorCount).toBe(0);
    expect(result.rows[0].isValid).toBe(true);
  });

  it("rejects missing first_name", () => {
    const result = validateImportRows(
      [makeRow({ first_name: "" })],
      NO_EXISTING,
      VALID_CLASSES
    );
    expect(result.rows[0].isValid).toBe(false);
    expect(result.rows[0].errors).toContain("first_name is required");
  });

  it("rejects missing last_name", () => {
    const result = validateImportRows(
      [makeRow({ last_name: "" })],
      NO_EXISTING,
      VALID_CLASSES
    );
    expect(result.rows[0].isValid).toBe(false);
    expect(result.rows[0].errors).toContain("last_name is required");
  });

  it("rejects missing email", () => {
    const result = validateImportRows(
      [makeRow({ email: "" })],
      NO_EXISTING,
      VALID_CLASSES
    );
    expect(result.rows[0].isValid).toBe(false);
    expect(result.rows[0].errors).toContain("email is required");
  });

  it("rejects invalid email format", () => {
    const result = validateImportRows(
      [makeRow({ email: "not-an-email" })],
      NO_EXISTING,
      VALID_CLASSES
    );
    expect(result.rows[0].isValid).toBe(false);
    expect(result.rows[0].errors).toContain("Invalid email format");
  });

  it("rejects duplicate email already in organisation", () => {
    const existing = new Set(["james@example.com"]);
    const result = validateImportRows([makeRow()], existing, VALID_CLASSES);
    expect(result.rows[0].isValid).toBe(false);
    expect(result.rows[0].errors).toContain(
      "Email already exists in the organisation"
    );
  });

  it("rejects duplicate email within CSV", () => {
    const result = validateImportRows(
      [
        makeRow({ email: "james@example.com" }),
        makeRow({ email: "james@example.com", first_name: "Other" }),
      ],
      NO_EXISTING,
      VALID_CLASSES
    );
    expect(result.rows[0].isValid).toBe(true);
    expect(result.rows[1].isValid).toBe(false);
    expect(result.rows[1].errors).toContain("Duplicate email in CSV");
  });

  it("rejects unknown membership class", () => {
    const result = validateImportRows(
      [makeRow({ membership_class: "Unknown" })],
      NO_EXISTING,
      VALID_CLASSES
    );
    expect(result.rows[0].isValid).toBe(false);
    expect(result.rows[0].errors[0]).toContain("Unknown membership class");
  });

  it("rejects invalid date_of_birth format", () => {
    const result = validateImportRows(
      [makeRow({ date_of_birth: "15/03/1985" })],
      NO_EXISTING,
      VALID_CLASSES
    );
    expect(result.rows[0].isValid).toBe(false);
    expect(result.rows[0].errors).toContain(
      "date_of_birth must be in YYYY-MM-DD format"
    );
  });

  it("accepts valid date_of_birth", () => {
    const result = validateImportRows(
      [makeRow({ date_of_birth: "1985-03-15" })],
      NO_EXISTING,
      VALID_CLASSES
    );
    expect(result.rows[0].isValid).toBe(true);
  });

  it("rejects invalid is_financial value", () => {
    const result = validateImportRows(
      [makeRow({ is_financial: "maybe" })],
      NO_EXISTING,
      VALID_CLASSES
    );
    expect(result.rows[0].isValid).toBe(false);
  });

  it("accepts various is_financial formats", () => {
    for (const val of ["true", "false", "yes", "no", "1", "0"]) {
      const result = validateImportRows(
        [makeRow({ is_financial: val, email: `${val}@example.com` })],
        NO_EXISTING,
        VALID_CLASSES
      );
      expect(result.rows[0].isValid).toBe(true);
    }
  });

  it("reports correct counts", () => {
    const result = validateImportRows(
      [
        makeRow({ email: "a@example.com" }),
        makeRow({ email: "" }),
        makeRow({ email: "b@example.com" }),
      ],
      NO_EXISTING,
      VALID_CLASSES
    );
    expect(result.totalCount).toBe(3);
    expect(result.validCount).toBe(2);
    expect(result.errorCount).toBe(1);
  });
});

describe("parseBoolean", () => {
  it("defaults to true for undefined", () => {
    expect(parseBoolean(undefined)).toBe(true);
  });

  it("defaults to true for empty string", () => {
    expect(parseBoolean("")).toBe(true);
  });

  it("parses true values", () => {
    expect(parseBoolean("true")).toBe(true);
    expect(parseBoolean("yes")).toBe(true);
    expect(parseBoolean("1")).toBe(true);
    expect(parseBoolean("TRUE")).toBe(true);
    expect(parseBoolean("Yes")).toBe(true);
  });

  it("parses false values", () => {
    expect(parseBoolean("false")).toBe(false);
    expect(parseBoolean("no")).toBe(false);
    expect(parseBoolean("0")).toBe(false);
  });
});
