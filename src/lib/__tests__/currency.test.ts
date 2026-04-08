import { describe, it, expect } from "vitest";
import { formatCurrency, applyBasisPoints, calculateGst } from "../currency";

describe("formatCurrency", () => {
  it("formats zero cents", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("formats whole dollar amounts", () => {
    expect(formatCurrency(10000)).toBe("$100.00");
  });

  it("formats cents correctly", () => {
    expect(formatCurrency(12345)).toBe("$123.45");
  });

  it("formats large amounts with comma separators", () => {
    expect(formatCurrency(1234567)).toBe("$12,345.67");
  });

  it("formats single cent", () => {
    expect(formatCurrency(1)).toBe("$0.01");
  });

  it("formats negative amounts", () => {
    expect(formatCurrency(-5000)).toBe("-$50.00");
  });
});

describe("applyBasisPoints", () => {
  it("applies 5% (500 basis points)", () => {
    expect(applyBasisPoints(10000, 500)).toBe(500);
  });

  it("applies 10% (1000 basis points)", () => {
    expect(applyBasisPoints(10000, 1000)).toBe(1000);
  });

  it("applies 1% (100 basis points) — platform fee", () => {
    expect(applyBasisPoints(20000, 100)).toBe(200);
  });

  it("rounds correctly for odd amounts", () => {
    // 333 cents * 500 bps = 16.65, rounds to 17
    expect(applyBasisPoints(333, 500)).toBe(17);
  });

  it("returns 0 for zero basis points", () => {
    expect(applyBasisPoints(10000, 0)).toBe(0);
  });

  it("returns 0 for zero cents", () => {
    expect(applyBasisPoints(0, 500)).toBe(0);
  });
});

describe("calculateGst", () => {
  it("calculates GST for a standard 10% inclusive amount", () => {
    // $110 inclusive → $10 GST
    expect(calculateGst(11000, 1000)).toBe(1000);
  });

  it("calculates GST for $0", () => {
    expect(calculateGst(0, 1000)).toBe(0);
  });

  it("calculates GST for 1 cent", () => {
    // 1 cent * 1000 / 11000 = 0.0909 → rounds to 0
    expect(calculateGst(1, 1000)).toBe(0);
  });

  it("calculates GST for 11 cents", () => {
    // 11 * 1000 / 11000 = 1
    expect(calculateGst(11, 1000)).toBe(1);
  });

  it("rounds correctly for odd amounts", () => {
    // $84.00 → 8400 * 1000 / 11000 = 763.636... → 764
    expect(calculateGst(8400, 1000)).toBe(764);
  });

  it("handles large amounts", () => {
    // $1,000,000 → 100000000 * 1000 / 11000 = 9090909.09... → 9090909
    expect(calculateGst(100000000, 1000)).toBe(9090909);
  });

  it("returns 0 for 0 basis points rate", () => {
    expect(calculateGst(11000, 0)).toBe(0);
  });

  it("works with non-standard rate (5% = 500bps)", () => {
    // 10500 * 500 / 10500 = 500
    expect(calculateGst(10500, 500)).toBe(500);
  });
});
