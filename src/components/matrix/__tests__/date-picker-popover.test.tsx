import { describe, it, expect } from "vitest";
import { getYearRange, MONTH_NAMES } from "../date-picker-popover";

describe("date-picker-popover helpers", () => {
  it("getYearRange returns 5 years centred on current year", () => {
    const range = getYearRange(2026);
    expect(range).toEqual([2024, 2025, 2026, 2027, 2028]);
  });

  it("getYearRange includes seasonEnd year when it extends beyond default range", () => {
    const range = getYearRange(2026, undefined, "2030-06-01");
    expect(range[range.length - 1]).toBe(2030);
  });

  it("MONTH_NAMES has 12 entries starting with January", () => {
    expect(MONTH_NAMES).toHaveLength(12);
    expect(MONTH_NAMES[0]).toBe("January");
    expect(MONTH_NAMES[11]).toBe("December");
  });
});
