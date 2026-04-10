import { describe, it, expect } from "vitest";
import { hexToOklch, formatOklch } from "./oklch";

describe("hexToOklch", () => {
  it("converts pure white to lightness ~1, chroma ~0", () => {
    const { l, c } = hexToOklch("#ffffff");
    expect(l).toBeGreaterThan(0.99);
    expect(c).toBeLessThan(0.005);
  });

  it("converts pure black to lightness ~0", () => {
    const { l } = hexToOklch("#000000");
    expect(l).toBeLessThan(0.01);
  });

  it("converts mid-gray to lightness ~0.6", () => {
    const { l, c } = hexToOklch("#808080");
    expect(l).toBeGreaterThan(0.55);
    expect(l).toBeLessThan(0.65);
    expect(c).toBeLessThan(0.005);
  });

  it("converts pure red to chromatic red", () => {
    const { l, c, h } = hexToOklch("#ff0000");
    expect(l).toBeGreaterThan(0.6);
    expect(c).toBeGreaterThan(0.2);
    expect(h).toBeGreaterThan(25);
    expect(h).toBeLessThan(35);
  });

  it("handles uppercase hex", () => {
    const { l } = hexToOklch("#FFFFFF");
    expect(l).toBeGreaterThan(0.99);
  });

  it("handles hex without hash", () => {
    const { l } = hexToOklch("808080");
    expect(l).toBeGreaterThan(0.55);
  });
});

describe("formatOklch", () => {
  it("formats components to 3 decimal places", () => {
    expect(formatOklch({ l: 0.38, c: 0.08, h: 155 })).toBe(
      "oklch(0.380 0.080 155.000)"
    );
  });

  it("formats with alpha when provided", () => {
    expect(formatOklch({ l: 0.38, c: 0.08, h: 155 }, 0.5)).toBe(
      "oklch(0.380 0.080 155.000 / 0.500)"
    );
  });

  it("only emits digits, spaces, dots, slashes, and the oklch wrapper (xss regression)", () => {
    const out = formatOklch({ l: 0.38, c: 0.08, h: 155 }, 0.5);
    expect(out).toMatch(/^oklch\([0-9. ]+(?: \/ [0-9.]+)?\)$/);
  });
});
