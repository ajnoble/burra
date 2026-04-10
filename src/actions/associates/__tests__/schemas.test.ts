import { describe, it, expect } from "vitest";
import { createAssociateSchema, updateAssociateSchema } from "../schemas";

const validUuid = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

describe("createAssociateSchema", () => {
  const validInput = {
    organisationId: validUuid,
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
  };

  it("accepts valid minimal input", () => {
    const result = createAssociateSchema.parse(validInput);
    expect(result.firstName).toBe("Jane");
    expect(result.lastName).toBe("Doe");
    expect(result.email).toBe("jane@example.com");
  });

  it("accepts optional phone and dateOfBirth", () => {
    const result = createAssociateSchema.parse({
      ...validInput,
      phone: "0412345678",
      dateOfBirth: "1990-06-15",
    });
    expect(result.phone).toBe("0412345678");
    expect(result.dateOfBirth).toBe("1990-06-15");
  });

  it("rejects missing organisationId", () => {
    expect(() =>
      createAssociateSchema.parse({ ...validInput, organisationId: undefined })
    ).toThrow();
  });

  it("rejects invalid organisationId (not a uuid)", () => {
    expect(() =>
      createAssociateSchema.parse({ ...validInput, organisationId: "not-a-uuid" })
    ).toThrow();
  });

  it("rejects empty firstName", () => {
    expect(() =>
      createAssociateSchema.parse({ ...validInput, firstName: "" })
    ).toThrow();
  });

  it("rejects firstName over 100 chars", () => {
    expect(() =>
      createAssociateSchema.parse({ ...validInput, firstName: "A".repeat(101) })
    ).toThrow();
  });

  it("rejects empty lastName", () => {
    expect(() =>
      createAssociateSchema.parse({ ...validInput, lastName: "" })
    ).toThrow();
  });

  it("rejects invalid email", () => {
    expect(() =>
      createAssociateSchema.parse({ ...validInput, email: "not-an-email" })
    ).toThrow();
  });

  it("rejects phone over 30 chars", () => {
    expect(() =>
      createAssociateSchema.parse({ ...validInput, phone: "1".repeat(31) })
    ).toThrow();
  });

  it("rejects dateOfBirth in wrong format", () => {
    expect(() =>
      createAssociateSchema.parse({ ...validInput, dateOfBirth: "15/06/1990" })
    ).toThrow();
  });

  it("accepts dateOfBirth in YYYY-MM-DD format", () => {
    const result = createAssociateSchema.parse({
      ...validInput,
      dateOfBirth: "1990-06-15",
    });
    expect(result.dateOfBirth).toBe("1990-06-15");
  });
});

describe("updateAssociateSchema", () => {
  const validInput = {
    id: validUuid,
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
  };

  it("accepts valid minimal input", () => {
    const result = updateAssociateSchema.parse(validInput);
    expect(result.id).toBe(validUuid);
  });

  it("accepts empty string for phone (optional clear)", () => {
    const result = updateAssociateSchema.parse({ ...validInput, phone: "" });
    expect(result.phone).toBe("");
  });

  it("accepts empty string for dateOfBirth (optional clear)", () => {
    const result = updateAssociateSchema.parse({ ...validInput, dateOfBirth: "" });
    expect(result.dateOfBirth).toBe("");
  });

  it("rejects invalid id (not uuid)", () => {
    expect(() =>
      updateAssociateSchema.parse({ ...validInput, id: "not-a-uuid" })
    ).toThrow();
  });

  it("rejects empty firstName", () => {
    expect(() =>
      updateAssociateSchema.parse({ ...validInput, firstName: "" })
    ).toThrow();
  });

  it("rejects invalid email", () => {
    expect(() =>
      updateAssociateSchema.parse({ ...validInput, email: "bad" })
    ).toThrow();
  });

  it("rejects phone over 30 chars", () => {
    expect(() =>
      updateAssociateSchema.parse({ ...validInput, phone: "1".repeat(31) })
    ).toThrow();
  });

  it("rejects dateOfBirth in wrong format", () => {
    expect(() =>
      updateAssociateSchema.parse({ ...validInput, dateOfBirth: "06-15-1990" })
    ).toThrow();
  });

  it("accepts valid dateOfBirth in YYYY-MM-DD format", () => {
    const result = updateAssociateSchema.parse({
      ...validInput,
      dateOfBirth: "1990-06-15",
    });
    expect(result.dateOfBirth).toBe("1990-06-15");
  });
});
