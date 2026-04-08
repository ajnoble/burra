import { describe, it, expect } from "vitest";
import { validateAbn, formatAbn } from "../abn";

describe("validateAbn", () => {
  it("accepts a valid 11-digit ABN without spaces", () => {
    expect(validateAbn("51824753556")).toBe(true);
  });

  it("accepts a valid ABN with standard spacing", () => {
    expect(validateAbn("51 824 753 556")).toBe(true);
  });

  it("rejects ABN with wrong number of digits", () => {
    expect(validateAbn("1234567890")).toBe(false);
  });

  it("rejects ABN with letters", () => {
    expect(validateAbn("51824753abc")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validateAbn("")).toBe(false);
  });

  it("accepts ABN with varied spacing", () => {
    expect(validateAbn("51  824  753  556")).toBe(true);
  });
});

describe("formatAbn", () => {
  it("formats 11 digits into XX XXX XXX XXX", () => {
    expect(formatAbn("51824753556")).toBe("51 824 753 556");
  });

  it("reformats already-spaced ABN", () => {
    expect(formatAbn("51 824 753 556")).toBe("51 824 753 556");
  });
});
