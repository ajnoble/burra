import { describe, it, expect } from "vitest";
import {
  createCustomFieldSchema,
  updateCustomFieldSchema,
  validateCustomFieldValue,
} from "../validation-custom-fields";

describe("createCustomFieldSchema", () => {
  it("accepts valid text field", () => {
    const result = createCustomFieldSchema.parse({
      name: "Emergency Contact",
      key: "emergency_contact",
      type: "text",
    });
    expect(result.name).toBe("Emergency Contact");
    expect(result.key).toBe("emergency_contact");
    expect(result.type).toBe("text");
    expect(result.isRequired).toBe(false);
  });

  it("accepts valid dropdown with options", () => {
    const result = createCustomFieldSchema.parse({
      name: "Dietary Requirements",
      key: "dietary_requirements",
      type: "dropdown",
      options: "Vegetarian, Vegan, Gluten-free",
    });
    expect(result.options).toBe("Vegetarian, Vegan, Gluten-free");
  });

  it("rejects dropdown without options", () => {
    expect(() =>
      createCustomFieldSchema.parse({
        name: "Diet",
        key: "diet",
        type: "dropdown",
      })
    ).toThrow();
  });

  it("rejects empty name", () => {
    expect(() =>
      createCustomFieldSchema.parse({
        name: "",
        key: "test",
        type: "text",
      })
    ).toThrow();
  });

  it("rejects invalid key format", () => {
    expect(() =>
      createCustomFieldSchema.parse({
        name: "Test",
        key: "Invalid Key!",
        type: "text",
      })
    ).toThrow();
  });

  it("rejects invalid type", () => {
    expect(() =>
      createCustomFieldSchema.parse({
        name: "Test",
        key: "test",
        type: "invalid",
      })
    ).toThrow();
  });
});

describe("updateCustomFieldSchema", () => {
  it("accepts partial update with just name", () => {
    const result = updateCustomFieldSchema.parse({ name: "Updated" });
    expect(result.name).toBe("Updated");
  });

  it("accepts empty object", () => {
    const result = updateCustomFieldSchema.parse({});
    expect(result).toEqual({});
  });
});

describe("validateCustomFieldValue", () => {
  it("accepts any string for text type", () => {
    expect(validateCustomFieldValue("text", "hello", null)).toEqual({
      valid: true,
    });
  });

  it("accepts valid number", () => {
    expect(validateCustomFieldValue("number", "42", null)).toEqual({
      valid: true,
    });
  });

  it("accepts decimal number", () => {
    expect(validateCustomFieldValue("number", "3.14", null)).toEqual({
      valid: true,
    });
  });

  it("rejects non-numeric for number type", () => {
    expect(validateCustomFieldValue("number", "abc", null)).toEqual({
      valid: false,
      error: "Must be a valid number",
    });
  });

  it("accepts valid date", () => {
    expect(validateCustomFieldValue("date", "2026-01-15", null)).toEqual({
      valid: true,
    });
  });

  it("rejects invalid date", () => {
    expect(validateCustomFieldValue("date", "not-a-date", null)).toEqual({
      valid: false,
      error: "Must be a valid date (YYYY-MM-DD)",
    });
  });

  it("accepts valid dropdown option", () => {
    expect(
      validateCustomFieldValue("dropdown", "Vegan", "Vegetarian, Vegan, Gluten-free")
    ).toEqual({ valid: true });
  });

  it("accepts dropdown option case-insensitively", () => {
    expect(
      validateCustomFieldValue("dropdown", "vegan", "Vegetarian, Vegan, Gluten-free")
    ).toEqual({ valid: true });
  });

  it("rejects invalid dropdown option", () => {
    expect(
      validateCustomFieldValue("dropdown", "Paleo", "Vegetarian, Vegan, Gluten-free")
    ).toEqual({
      valid: false,
      error: 'Must be one of: Vegetarian, Vegan, Gluten-free',
    });
  });

  it("accepts true/false for checkbox", () => {
    expect(validateCustomFieldValue("checkbox", "true", null)).toEqual({ valid: true });
    expect(validateCustomFieldValue("checkbox", "false", null)).toEqual({ valid: true });
  });

  it("accepts yes/no for checkbox", () => {
    expect(validateCustomFieldValue("checkbox", "yes", null)).toEqual({ valid: true });
    expect(validateCustomFieldValue("checkbox", "no", null)).toEqual({ valid: true });
  });

  it("accepts 1/0 for checkbox", () => {
    expect(validateCustomFieldValue("checkbox", "1", null)).toEqual({ valid: true });
    expect(validateCustomFieldValue("checkbox", "0", null)).toEqual({ valid: true });
  });

  it("rejects invalid checkbox value", () => {
    expect(validateCustomFieldValue("checkbox", "maybe", null)).toEqual({
      valid: false,
      error: "Must be true/false, yes/no, or 1/0",
    });
  });

  it("accepts empty string for any type", () => {
    expect(validateCustomFieldValue("text", "", null)).toEqual({ valid: true });
    expect(validateCustomFieldValue("number", "", null)).toEqual({ valid: true });
    expect(validateCustomFieldValue("date", "", null)).toEqual({ valid: true });
  });
});
