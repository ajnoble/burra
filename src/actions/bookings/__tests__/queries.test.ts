import { describe, it, expect } from "vitest";
import { formatBookingStatus } from "../queries";

describe("formatBookingStatus", () => {
  it("formats PENDING", () => {
    expect(formatBookingStatus("PENDING")).toBe("Pending Approval");
  });

  it("formats CONFIRMED", () => {
    expect(formatBookingStatus("CONFIRMED")).toBe("Confirmed");
  });

  it("formats CANCELLED", () => {
    expect(formatBookingStatus("CANCELLED")).toBe("Cancelled");
  });

  it("formats COMPLETED", () => {
    expect(formatBookingStatus("COMPLETED")).toBe("Completed");
  });

  it("formats WAITLISTED", () => {
    expect(formatBookingStatus("WAITLISTED")).toBe("Waitlisted");
  });

  it("returns the raw status for unknown values", () => {
    expect(formatBookingStatus("UNKNOWN")).toBe("UNKNOWN");
  });
});
