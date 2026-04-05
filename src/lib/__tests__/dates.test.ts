import { describe, it, expect } from "vitest";
import { toOrgTime, toUTC, formatOrgDate, formatOrgDateTime, isWeekend } from "../dates";

describe("toOrgTime", () => {
  it("converts UTC to Melbourne time (AEDT, UTC+11)", () => {
    // 2027-01-15 00:00 UTC = 2027-01-15 11:00 AEDT
    const utc = new Date("2027-01-15T00:00:00Z");
    const melb = toOrgTime(utc, "Australia/Melbourne");
    expect(melb.getHours()).toBe(11);
  });

  it("converts UTC to Melbourne time (AEST, UTC+10)", () => {
    // 2027-07-15 00:00 UTC = 2027-07-15 10:00 AEST
    const utc = new Date("2027-07-15T00:00:00Z");
    const melb = toOrgTime(utc, "Australia/Melbourne");
    expect(melb.getHours()).toBe(10);
  });

  it("accepts string dates", () => {
    const melb = toOrgTime("2027-07-15T00:00:00Z", "Australia/Melbourne");
    expect(melb.getHours()).toBe(10);
  });
});

describe("toUTC", () => {
  it("converts Melbourne time to UTC", () => {
    // 2027-07-15 10:00 AEST = 2027-07-15 00:00 UTC
    const utc = toUTC("2027-07-15T10:00:00", "Australia/Melbourne");
    expect(utc.getUTCHours()).toBe(0);
  });
});

describe("formatOrgDate", () => {
  it("formats a UTC date for Melbourne display", () => {
    const result = formatOrgDate("2027-07-15T00:00:00Z", "d MMM yyyy", "Australia/Melbourne");
    expect(result).toBe("15 Jul 2027");
  });
});

describe("formatOrgDateTime", () => {
  it("formats a UTC datetime for Melbourne display", () => {
    const result = formatOrgDateTime(
      "2027-03-01T21:00:00Z",
      "d MMM yyyy, h:mm a",
      "Australia/Melbourne"
    );
    // 21:00 UTC = 08:00 AEDT (next day)
    expect(result).toContain("2 Mar 2027");
    expect(result).toContain("8:00 AM");
  });
});

describe("isWeekend", () => {
  it("returns true for Saturday", () => {
    // 2027-07-17 is a Saturday
    expect(isWeekend("2027-07-17T02:00:00Z", "Australia/Melbourne")).toBe(true);
  });

  it("returns true for Sunday", () => {
    // 2027-07-18 is a Sunday
    expect(isWeekend("2027-07-18T02:00:00Z", "Australia/Melbourne")).toBe(true);
  });

  it("returns false for weekday", () => {
    // 2027-07-19 is a Monday
    expect(isWeekend("2027-07-19T02:00:00Z", "Australia/Melbourne")).toBe(false);
  });
});
