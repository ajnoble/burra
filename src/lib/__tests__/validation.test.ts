import { describe, it, expect } from "vitest";
import {
  emailSchema,
  phoneSchema,
  slugSchema,
  centsSchema,
  paginationSchema,
} from "../validation";

describe("emailSchema", () => {
  it("accepts valid email", () => {
    expect(emailSchema.parse("user@example.com")).toBe("user@example.com");
  });

  it("trims and lowercases", () => {
    expect(emailSchema.parse("  User@Example.COM  ")).toBe("user@example.com");
  });

  it("rejects invalid email", () => {
    expect(() => emailSchema.parse("not-an-email")).toThrow();
  });

  it("rejects empty string", () => {
    expect(() => emailSchema.parse("")).toThrow();
  });
});

describe("slugSchema", () => {
  it("accepts valid slug", () => {
    expect(slugSchema.parse("polski-ski-club")).toBe("polski-ski-club");
  });

  it("accepts numeric slug", () => {
    expect(slugSchema.parse("club-123")).toBe("club-123");
  });

  it("rejects uppercase", () => {
    expect(() => slugSchema.parse("Polski")).toThrow();
  });

  it("rejects spaces", () => {
    expect(() => slugSchema.parse("my club")).toThrow();
  });

  it("rejects single char", () => {
    expect(() => slugSchema.parse("a")).toThrow();
  });
});

describe("centsSchema", () => {
  it("accepts zero", () => {
    expect(centsSchema.parse(0)).toBe(0);
  });

  it("accepts positive integer", () => {
    expect(centsSchema.parse(12345)).toBe(12345);
  });

  it("rejects negative", () => {
    expect(() => centsSchema.parse(-1)).toThrow();
  });

  it("rejects float", () => {
    expect(() => centsSchema.parse(12.5)).toThrow();
  });
});

describe("paginationSchema", () => {
  it("provides defaults", () => {
    const result = paginationSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.perPage).toBe(20);
  });

  it("accepts valid values", () => {
    const result = paginationSchema.parse({ page: 3, perPage: 50 });
    expect(result.page).toBe(3);
    expect(result.perPage).toBe(50);
  });

  it("rejects perPage over 100", () => {
    expect(() => paginationSchema.parse({ perPage: 200 })).toThrow();
  });

  it("coerces string numbers", () => {
    const result = paginationSchema.parse({ page: "2", perPage: "10" });
    expect(result.page).toBe(2);
    expect(result.perPage).toBe(10);
  });
});
