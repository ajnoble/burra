import { describe, it, expect } from "vitest";
import {
  isWithinEditWindow,
  buildChangesDescription,
} from "../member-edit-helpers";

describe("isWithinEditWindow", () => {
  it("returns true when days until check-in >= window", () => {
    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 10);
    const checkInDate = future.toISOString().split("T")[0];
    expect(isWithinEditWindow(checkInDate, 7)).toBe(true);
  });

  it("returns false when days until check-in < window", () => {
    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 3);
    const checkInDate = future.toISOString().split("T")[0];
    expect(isWithinEditWindow(checkInDate, 7)).toBe(false);
  });

  it("returns false when check-in is today", () => {
    const today = new Date().toISOString().split("T")[0];
    expect(isWithinEditWindow(today, 1)).toBe(false);
  });

  it("returns false when check-in is in the past", () => {
    const past = new Date();
    past.setUTCDate(past.getUTCDate() - 2);
    const checkInDate = past.toISOString().split("T")[0];
    expect(isWithinEditWindow(checkInDate, 0)).toBe(false);
  });

  it("returns true when window is 0 and check-in is tomorrow", () => {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const checkInDate = tomorrow.toISOString().split("T")[0];
    expect(isWithinEditWindow(checkInDate, 0)).toBe(true);
  });
});

describe("buildChangesDescription", () => {
  it("describes date changes", () => {
    const result = buildChangesDescription({
      oldCheckIn: "2027-07-10",
      oldCheckOut: "2027-07-15",
      newCheckIn: "2027-07-12",
      newCheckOut: "2027-07-17",
    });
    expect(result).toContain("2027-07-10");
    expect(result).toContain("2027-07-12");
  });

  it("describes guest additions", () => {
    const result = buildChangesDescription({
      addedGuestNames: ["Jane Smith"],
    });
    expect(result).toContain("Added: Jane Smith");
  });

  it("describes guest removals", () => {
    const result = buildChangesDescription({
      removedGuestNames: ["Bob Jones"],
    });
    expect(result).toContain("Removed: Bob Jones");
  });

  it("describes price change", () => {
    const result = buildChangesDescription({
      oldTotalCents: 85000,
      newTotalCents: 102000,
    });
    expect(result).toContain("$850.00");
    expect(result).toContain("$1,020.00");
  });

  it("combines multiple changes", () => {
    const result = buildChangesDescription({
      oldCheckIn: "2027-07-10",
      oldCheckOut: "2027-07-15",
      newCheckIn: "2027-07-12",
      newCheckOut: "2027-07-17",
      addedGuestNames: ["Jane Smith"],
      oldTotalCents: 85000,
      newTotalCents: 102000,
    });
    expect(result).toContain("Dates");
    expect(result).toContain("Added");
    expect(result).toContain("Price");
  });

  it("returns empty string when nothing changed", () => {
    const result = buildChangesDescription({});
    expect(result).toBe("");
  });
});
