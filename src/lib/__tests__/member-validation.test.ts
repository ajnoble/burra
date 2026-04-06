import { describe, it, expect } from "vitest";
import {
  createMemberSchema,
  updateMemberSchema,
  financialStatusChangeSchema,
} from "../validation";

describe("createMemberSchema", () => {
  const validInput = {
    firstName: "James",
    lastName: "Mitchell",
    email: "james@example.com",
    membershipClassId: "550e8400-e29b-41d4-a716-446655440000",
  };

  it("accepts valid input with required fields only", () => {
    const result = createMemberSchema.parse(validInput);
    expect(result.firstName).toBe("James");
    expect(result.lastName).toBe("Mitchell");
    expect(result.email).toBe("james@example.com");
    expect(result.membershipClassId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(result.isFinancial).toBe(true); // default
    expect(result.role).toBe("MEMBER"); // default
  });

  it("accepts all optional fields", () => {
    const result = createMemberSchema.parse({
      ...validInput,
      phone: "0412 345 678",
      dateOfBirth: "1990-01-15",
      memberNumber: "M001",
      notes: "Committee nominee",
      role: "COMMITTEE",
      isFinancial: false,
    });
    expect(result.phone).toBe("0412 345 678");
    expect(result.dateOfBirth).toBe("1990-01-15");
    expect(result.memberNumber).toBe("M001");
    expect(result.notes).toBe("Committee nominee");
    expect(result.role).toBe("COMMITTEE");
    expect(result.isFinancial).toBe(false);
  });

  it("trims and lowercases email", () => {
    const result = createMemberSchema.parse({
      ...validInput,
      email: "  James@Example.COM  ",
    });
    expect(result.email).toBe("james@example.com");
  });

  it("trims name whitespace", () => {
    const result = createMemberSchema.parse({
      ...validInput,
      firstName: "  James  ",
      lastName: "  Mitchell  ",
    });
    expect(result.firstName).toBe("James");
    expect(result.lastName).toBe("Mitchell");
  });

  it("rejects missing firstName", () => {
    expect(() =>
      createMemberSchema.parse({ ...validInput, firstName: "" })
    ).toThrow();
  });

  it("rejects missing lastName", () => {
    expect(() =>
      createMemberSchema.parse({ ...validInput, lastName: "" })
    ).toThrow();
  });

  it("rejects invalid email", () => {
    expect(() =>
      createMemberSchema.parse({ ...validInput, email: "not-an-email" })
    ).toThrow();
  });

  it("rejects invalid membershipClassId", () => {
    expect(() =>
      createMemberSchema.parse({ ...validInput, membershipClassId: "not-a-uuid" })
    ).toThrow();
  });

  it("rejects invalid role", () => {
    expect(() =>
      createMemberSchema.parse({ ...validInput, role: "SUPERADMIN" })
    ).toThrow();
  });

  it("accepts empty optional strings", () => {
    const result = createMemberSchema.parse({
      ...validInput,
      phone: "",
      dateOfBirth: "",
      memberNumber: "",
      notes: "",
    });
    expect(result.phone).toBe("");
    expect(result.dateOfBirth).toBe("");
    expect(result.memberNumber).toBe("");
    expect(result.notes).toBe("");
  });
});

describe("updateMemberSchema", () => {
  it("accepts partial update with just firstName", () => {
    const result = updateMemberSchema.parse({ firstName: "Updated" });
    expect(result.firstName).toBe("Updated");
  });

  it("accepts partial update with just email", () => {
    const result = updateMemberSchema.parse({ email: "new@example.com" });
    expect(result.email).toBe("new@example.com");
  });

  it("rejects empty firstName when provided", () => {
    expect(() => updateMemberSchema.parse({ firstName: "" })).toThrow();
  });

  it("rejects empty lastName when provided", () => {
    expect(() => updateMemberSchema.parse({ lastName: "" })).toThrow();
  });

  it("rejects invalid email when provided", () => {
    expect(() => updateMemberSchema.parse({ email: "bad" })).toThrow();
  });

  it("accepts empty object (no updates)", () => {
    const result = updateMemberSchema.parse({});
    expect(result).toEqual({});
  });
});

describe("financialStatusChangeSchema", () => {
  it("accepts valid input", () => {
    const result = financialStatusChangeSchema.parse({
      isFinancial: false,
      reason: "Annual dues unpaid",
    });
    expect(result.isFinancial).toBe(false);
    expect(result.reason).toBe("Annual dues unpaid");
  });

  it("rejects missing reason", () => {
    expect(() =>
      financialStatusChangeSchema.parse({ isFinancial: true })
    ).toThrow();
  });

  it("rejects empty reason", () => {
    expect(() =>
      financialStatusChangeSchema.parse({ isFinancial: true, reason: "" })
    ).toThrow();
  });

  it("trims reason whitespace", () => {
    const result = financialStatusChangeSchema.parse({
      isFinancial: true,
      reason: "  Paid annual dues  ",
    });
    expect(result.reason).toBe("Paid annual dues");
  });
});
