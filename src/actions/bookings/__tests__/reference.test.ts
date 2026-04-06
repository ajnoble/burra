import { describe, it, expect } from "vitest";
import { generateBookingReference, getOrgPrefix } from "../reference";

describe("getOrgPrefix", () => {
  it("returns uppercase first 4 chars of slug", () => {
    expect(getOrgPrefix("polski-ski-club")).toBe("POLS");
  });

  it("handles short slugs", () => {
    expect(getOrgPrefix("abc")).toBe("ABC");
  });

  it("strips hyphens and takes first 4 chars", () => {
    expect(getOrgPrefix("mt-buller-lodge")).toBe("MTBU");
  });

  it("returns uppercase", () => {
    expect(getOrgPrefix("falls-creek")).toBe("FALL");
  });
});

describe("generateBookingReference", () => {
  it("matches format ORG-YEAR-XXXX", () => {
    const ref = generateBookingReference("polski-ski-club");
    expect(ref).toMatch(/^POLS-\d{4}-[A-HJ-NP-Z2-9]{4}$/);
  });

  it("uses current year", () => {
    const ref = generateBookingReference("test-club");
    const year = new Date().getFullYear().toString();
    expect(ref).toContain(`-${year}-`);
  });

  it("does not include ambiguous characters (O, 0, I, 1, L)", () => {
    for (let i = 0; i < 100; i++) {
      const ref = generateBookingReference("test");
      const random = ref.split("-")[2];
      expect(random).not.toMatch(/[O01IL]/);
    }
  });

  it("generates different references each call", () => {
    const refs = new Set<string>();
    for (let i = 0; i < 20; i++) {
      refs.add(generateBookingReference("test"));
    }
    expect(refs.size).toBeGreaterThan(15);
  });

  it("reference has exactly 3 parts separated by hyphens", () => {
    const ref = generateBookingReference("my-lodge");
    const parts = ref.split("-");
    expect(parts).toHaveLength(3);
  });
});
