import { describe, it, expect } from "vitest";
import { deriveAccentPalette } from "./derive-accent";

const OKLCH_STRING = /^oklch\(([0-9.]+) ([0-9.]+) ([0-9.]+)(?: \/ ([0-9.]+))?\)$/;

function parseL(s: string): number {
  const m = s.match(OKLCH_STRING);
  if (!m) throw new Error(`Bad OKLCH string: ${s}`);
  return parseFloat(m[1]);
}

function parseC(s: string): number {
  const m = s.match(OKLCH_STRING);
  if (!m) throw new Error(`Bad OKLCH string: ${s}`);
  return parseFloat(m[2]);
}

describe("deriveAccentPalette", () => {
  it("returns all 6 expected keys", () => {
    const p = deriveAccentPalette("#38694a");
    expect(Object.keys(p).sort()).toEqual(
      [
        "primary",
        "primaryForeground",
        "ring",
        "primaryDark",
        "primaryForegroundDark",
        "ringDark",
      ].sort()
    );
  });

  it("clamps light-mode primary lightness to [0.32, 0.48]", () => {
    expect(parseL(deriveAccentPalette("#ffffff").primary)).toBeGreaterThanOrEqual(0.32);
    expect(parseL(deriveAccentPalette("#ffffff").primary)).toBeLessThanOrEqual(0.48);
    expect(parseL(deriveAccentPalette("#000000").primary)).toBeGreaterThanOrEqual(0.32);
    expect(parseL(deriveAccentPalette("#000000").primary)).toBeLessThanOrEqual(0.48);
  });

  it("clamps light-mode primary chroma to [0.05, 0.12]", () => {
    expect(parseC(deriveAccentPalette("#ff00ff").primary)).toBeGreaterThanOrEqual(0.05);
    expect(parseC(deriveAccentPalette("#ff00ff").primary)).toBeLessThanOrEqual(0.12);
    expect(parseC(deriveAccentPalette("#808080").primary)).toBeGreaterThanOrEqual(0.05);
  });

  it("clamps dark-mode primary lightness to [0.58, 0.74]", () => {
    expect(parseL(deriveAccentPalette("#ffffff").primaryDark)).toBeGreaterThanOrEqual(0.58);
    expect(parseL(deriveAccentPalette("#ffffff").primaryDark)).toBeLessThanOrEqual(0.74);
    expect(parseL(deriveAccentPalette("#000000").primaryDark)).toBeGreaterThanOrEqual(0.58);
  });

  it("ring uses alpha 0.5 in light and 0.6 in dark", () => {
    const p = deriveAccentPalette("#38694a");
    expect(p.ring).toMatch(/\/ 0\.500\)$/);
    expect(p.ringDark).toMatch(/\/ 0\.600\)$/);
  });

  it("picks cream primary-foreground for dark primaries (L < 0.6)", () => {
    const p = deriveAccentPalette("#38694a");
    expect(parseL(p.primaryForeground)).toBeGreaterThan(0.95);
  });

  it("picks warm dark primary-foreground for light dark-mode primaries (L > 0.5)", () => {
    const p = deriveAccentPalette("#38694a");
    expect(parseL(p.primaryForegroundDark)).toBeLessThan(0.2);
  });

  it("handles ugly inputs without throwing", () => {
    expect(() => deriveAccentPalette("#ff00ff")).not.toThrow();
    expect(() => deriveAccentPalette("#00ff00")).not.toThrow();
    expect(() => deriveAccentPalette("#000000")).not.toThrow();
    expect(() => deriveAccentPalette("#ffffff")).not.toThrow();
  });

  it("throws on invalid hex", () => {
    expect(() => deriveAccentPalette("#zzz")).toThrow();
    expect(() => deriveAccentPalette("red")).toThrow();
  });

  it("all output strings are xss-safe (digits, spaces, dots, slash only inside oklch())", () => {
    const p = deriveAccentPalette("#38694a");
    const safe = /^oklch\([0-9. ]+(?: \/ [0-9.]+)?\)$/;
    expect(p.primary).toMatch(safe);
    expect(p.primaryForeground).toMatch(safe);
    expect(p.ring).toMatch(safe);
    expect(p.primaryDark).toMatch(safe);
    expect(p.primaryForegroundDark).toMatch(safe);
    expect(p.ringDark).toMatch(safe);
  });
});
