import { describe, it, expect } from "vitest";
import {
  generateDateRange,
  dateToColumnIndex,
  bookingToGridColumns,
  datesOverlap,
  getResponsiveDayCount,
  type Breakpoint,
} from "./matrix-utils";

// ---------------------------------------------------------------------------
// generateDateRange
// ---------------------------------------------------------------------------
describe("generateDateRange", () => {
  it("returns a single date when days=1", () => {
    expect(generateDateRange("2024-03-01", 1)).toEqual(["2024-03-01"]);
  });

  it("returns correct range for 7 days", () => {
    const result = generateDateRange("2024-03-01", 7);
    expect(result).toHaveLength(7);
    expect(result[0]).toBe("2024-03-01");
    expect(result[6]).toBe("2024-03-07");
  });

  it("crosses month boundaries", () => {
    const result = generateDateRange("2024-01-30", 4);
    expect(result).toEqual([
      "2024-01-30",
      "2024-01-31",
      "2024-02-01",
      "2024-02-02",
    ]);
  });

  it("crosses year boundaries", () => {
    const result = generateDateRange("2023-12-30", 4);
    expect(result).toEqual([
      "2023-12-30",
      "2023-12-31",
      "2024-01-01",
      "2024-01-02",
    ]);
  });

  it("handles leap year Feb 28", () => {
    const result = generateDateRange("2024-02-28", 3);
    expect(result).toEqual(["2024-02-28", "2024-02-29", "2024-03-01"]);
  });

  it("returns empty array when days=0", () => {
    expect(generateDateRange("2024-03-01", 0)).toEqual([]);
  });

  it("returns 30 days correctly for desktop", () => {
    const result = generateDateRange("2024-01-01", 30);
    expect(result).toHaveLength(30);
    expect(result[29]).toBe("2024-01-30");
  });
});

// ---------------------------------------------------------------------------
// dateToColumnIndex
// ---------------------------------------------------------------------------
describe("dateToColumnIndex", () => {
  it("returns 0 for a date equal to grid start", () => {
    expect(dateToColumnIndex("2024-03-01", "2024-03-01")).toBe(0);
  });

  it("returns correct positive index", () => {
    expect(dateToColumnIndex("2024-03-05", "2024-03-01")).toBe(4);
  });

  it("returns negative for dates before grid start", () => {
    // Feb 28 → Feb 29 → Mar 1: 2 days before in a leap year
    expect(dateToColumnIndex("2024-02-28", "2024-03-01")).toBe(-2);
  });

  it("handles large offsets", () => {
    expect(dateToColumnIndex("2024-03-31", "2024-03-01")).toBe(30);
  });

  it("returns negative for dates far before grid start", () => {
    // Jan (31 days) + Feb 2024 (29 days, leap year) = 60 days before Mar 1
    expect(dateToColumnIndex("2024-01-01", "2024-03-01")).toBe(-60);
  });
});

// ---------------------------------------------------------------------------
// bookingToGridColumns
// ---------------------------------------------------------------------------
describe("bookingToGridColumns", () => {
  const gridStart = "2024-03-01";
  const gridEnd = "2024-03-30"; // 30 visible days, cols 2–31

  it("returns null when booking is entirely before grid", () => {
    expect(
      bookingToGridColumns("2024-02-01", "2024-02-28", gridStart, gridEnd)
    ).toBeNull();
  });

  it("returns null when booking is entirely after grid", () => {
    expect(
      bookingToGridColumns("2024-04-01", "2024-04-10", gridStart, gridEnd)
    ).toBeNull();
  });

  it("returns null when booking ends exactly on grid start (half-open: [checkIn, checkOut))", () => {
    // checkOut == gridStart means zero overlap
    expect(
      bookingToGridColumns("2024-02-20", "2024-03-01", gridStart, gridEnd)
    ).toBeNull();
  });

  it("maps a booking fully inside the grid", () => {
    // checkIn=Mar 5 → colIndex 4 → colStart 4+2=6
    // checkOut=Mar 10 → colIndex 9 → colEnd 9+2=11
    const result = bookingToGridColumns(
      "2024-03-05",
      "2024-03-10",
      gridStart,
      gridEnd
    );
    expect(result).toEqual({ colStart: 6, colEnd: 11 });
  });

  it("maps a booking starting on grid start date", () => {
    // checkIn=Mar 1 → colIndex 0 → colStart 0+2=2
    // checkOut=Mar 3 → colIndex 2 → colEnd 2+2=4
    const result = bookingToGridColumns(
      "2024-03-01",
      "2024-03-03",
      gridStart,
      gridEnd
    );
    expect(result).toEqual({ colStart: 2, colEnd: 4 });
  });

  it("clips start when booking begins before grid", () => {
    // clipped to grid start col 2
    // checkOut=Mar 5 → colEnd 4+2=6
    const result = bookingToGridColumns(
      "2024-02-25",
      "2024-03-05",
      gridStart,
      gridEnd
    );
    expect(result).toEqual({ colStart: 2, colEnd: 6, clippedStart: true });
  });

  it("clips end when booking extends beyond grid", () => {
    // checkIn=Mar 28 → colIndex 27 → colStart 27+2=29
    // clipped to gridEnd col: dayCount=30 → col 30+2=32
    const result = bookingToGridColumns(
      "2024-03-28",
      "2024-04-05",
      gridStart,
      gridEnd
    );
    expect(result).toEqual({ colStart: 29, colEnd: 32, clippedEnd: true });
  });

  it("clips both ends when booking spans entire grid", () => {
    const result = bookingToGridColumns(
      "2024-02-01",
      "2024-04-30",
      gridStart,
      gridEnd
    );
    expect(result).toEqual({
      colStart: 2,
      colEnd: 32,
      clippedStart: true,
      clippedEnd: true,
    });
  });

  it("handles single-night booking at end of grid", () => {
    // checkIn=Mar 29 → colIndex 28 → colStart 30
    // checkOut=Mar 30 → colIndex 29 → colEnd 31
    const result = bookingToGridColumns(
      "2024-03-29",
      "2024-03-30",
      gridStart,
      gridEnd
    );
    expect(result).toEqual({ colStart: 30, colEnd: 31 });
  });
});

// ---------------------------------------------------------------------------
// datesOverlap
// ---------------------------------------------------------------------------
describe("datesOverlap", () => {
  it("returns true for overlapping ranges", () => {
    expect(datesOverlap("2024-03-01", "2024-03-10", "2024-03-05", "2024-03-15")).toBe(true);
  });

  it("returns true when one range contains the other", () => {
    expect(datesOverlap("2024-03-01", "2024-03-31", "2024-03-10", "2024-03-20")).toBe(true);
  });

  it("returns true for identical ranges", () => {
    expect(datesOverlap("2024-03-01", "2024-03-10", "2024-03-01", "2024-03-10")).toBe(true);
  });

  it("returns false when ranges are adjacent (half-open interval)", () => {
    // [Mar1, Mar10) and [Mar10, Mar20) — no overlap
    expect(datesOverlap("2024-03-01", "2024-03-10", "2024-03-10", "2024-03-20")).toBe(false);
  });

  it("returns false when first range is entirely before second", () => {
    expect(datesOverlap("2024-03-01", "2024-03-05", "2024-03-10", "2024-03-20")).toBe(false);
  });

  it("returns false when first range is entirely after second", () => {
    expect(datesOverlap("2024-03-20", "2024-03-30", "2024-03-01", "2024-03-10")).toBe(false);
  });

  it("returns true when ranges share only one day (half-open: start of range2 is inside range1)", () => {
    // [Mar1, Mar10) and [Mar9, Mar15) — Mar9 is inside first range
    expect(datesOverlap("2024-03-01", "2024-03-10", "2024-03-09", "2024-03-15")).toBe(true);
  });

  it("returns false for completely separate ranges with gap", () => {
    expect(datesOverlap("2024-01-01", "2024-01-10", "2024-02-01", "2024-02-10")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getResponsiveDayCount
// ---------------------------------------------------------------------------
describe("getResponsiveDayCount", () => {
  it("returns 7 for mobile", () => {
    expect(getResponsiveDayCount("mobile")).toBe(7);
  });

  it("returns 14 for tablet", () => {
    expect(getResponsiveDayCount("tablet")).toBe(14);
  });

  it("returns 30 for desktop", () => {
    expect(getResponsiveDayCount("desktop")).toBe(30);
  });
});
