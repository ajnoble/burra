import { describe, it, expect } from "vitest";
import { brandingSchema, MAX_LOGO_BYTES, ALLOWED_LOGO_MIME } from "./updateBranding";

// NOTE: Auth-guard behaviour tests (requireSession / requireRole call
// verification) are intentionally omitted here. docs/testing.md §Unit tests
// rule: "Do NOT mock @/db. If your test needs the database, it is an
// integration test." The action calls db.update() after auth passes, so any
// test that exercises the full action path belongs in the integration test —
// see updateBranding.integration.test.ts (Task 7).

describe("brandingSchema", () => {
  it("accepts a valid 6-char hex", () => {
    const result = brandingSchema.safeParse({ accentColor: "#38694a", removeLogo: false });
    expect(result.success).toBe(true);
  });

  it("accepts null accent color (reset to default)", () => {
    const result = brandingSchema.safeParse({ accentColor: null, removeLogo: false });
    expect(result.success).toBe(true);
  });

  it("rejects non-hex strings", () => {
    expect(brandingSchema.safeParse({ accentColor: "red", removeLogo: false }).success).toBe(false);
    expect(brandingSchema.safeParse({ accentColor: "#xyz", removeLogo: false }).success).toBe(false);
    expect(brandingSchema.safeParse({ accentColor: "#ff", removeLogo: false }).success).toBe(false);
    expect(brandingSchema.safeParse({ accentColor: "38694a", removeLogo: false }).success).toBe(false);
  });

  it("rejects hex with extra characters (XSS defence)", () => {
    expect(
      brandingSchema.safeParse({
        accentColor: "#38694a); </style><script>alert(1)</script>",
        removeLogo: false,
      }).success
    ).toBe(false);
  });
});

describe("constants", () => {
  it("MAX_LOGO_BYTES is 500KB", () => {
    expect(MAX_LOGO_BYTES).toBe(500 * 1024);
  });

  it("ALLOWED_LOGO_MIME includes png/svg/jpeg", () => {
    expect(ALLOWED_LOGO_MIME).toContain("image/png");
    expect(ALLOWED_LOGO_MIME).toContain("image/svg+xml");
    expect(ALLOWED_LOGO_MIME).toContain("image/jpeg");
  });
});
